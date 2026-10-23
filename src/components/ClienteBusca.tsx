import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { useIsFetching } from "@tanstack/react-query";
import { docFormat, rotuloCliente } from "@/lib/format";
import { buscarClientes, notaCliente, type ClienteBuscavel } from "@/lib/buscaCliente";

const LIMITE = 30;

/**
 * Campo de escolher cliente digitando: nome, nome fantasia, CPF/CNPJ (com ou sem pontos), código, cidade ou
 * telefone. Substitui a lista corrida com todos os clientes.
 */
export function ClienteBusca<T extends ClienteBuscavel>({ clientes, carregando: carregandoProp, value, onChange, disabled, required, placeholder, autoFocus, onNovo }: {
  clientes: T[];
  /** a lista ainda está chegando do banco: avisa em vez de dizer "nenhum cliente" (e não abre o cadastro rápido) */
  carregando?: boolean;
  value: string | null | undefined;
  onChange: (id: string, cliente: T | null) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** "Cadastrar cliente" no fim da lista (com o que foi digitado), para o cadastro rápido de quem chama */
  onNovo?: (texto: string) => void;
}) {
  // lista vazia enquanto o ERP ainda busca dados: é carregamento, não "nenhum cliente"
  const buscandoDados = useIsFetching() > 0;
  const carregando = carregandoProp ?? (clientes.length === 0 && buscandoDados);
  const escolhido = useMemo(() => clientes.find((c) => c.id === value) ?? null, [clientes, value]);
  const [consulta, setConsulta] = useState<string | null>(null); // null = mostrando o escolhido
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const aberto = consulta !== null && !disabled;
  const achados = useMemo(() => (aberto ? buscarClientes(clientes, consulta ?? "", LIMITE) : []), [aberto, clientes, consulta]);
  const total = useMemo(() => (aberto && consulta ? clientes.filter((c) => notaCliente(c, consulta) > 0).length : clientes.length),
    [aberto, clientes, consulta]);

  useEffect(() => { setAtivo(0); }, [consulta]);
  // CPF (11) ou CNPJ (14) completo e nenhum cliente com ele: vai direto para o cadastro rápido, já com o número
  const docCompleto = !!consulta && /^[\d.\-/\s]+$/.test(consulta) && [11, 14].includes(consulta.replace(/\D/g, "").length);
  useEffect(() => {
    if (!onNovo || carregando || !aberto || !docCompleto || achados.length) return;
    const t = setTimeout(() => { const v = (consulta ?? "").trim(); setConsulta(null); campo.current?.blur(); onNovo(v); }, 600);
    return () => clearTimeout(t);
  }, [onNovo, carregando, aberto, docCompleto, achados.length, consulta]);
  useEffect(() => { lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" }); }, [ativo]);

  const rotulo = escolhido ? `${rotuloCliente(escolhido)}${escolhido.cpf_cnpj ? ` · ${docFormat(escolhido.cpf_cnpj)}` : ""}` : "";
  const escolher = (c: T | null) => { onChange(c?.id ?? "", c); setConsulta(null); campo.current?.blur(); };

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={campo}
        className="input pl-9 pr-9"
        role="combobox" aria-expanded={aberto} aria-autocomplete="list" autoComplete="off" autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder ?? "Digite nome, CPF, CNPJ, código ou cidade"}
        value={consulta ?? rotulo}
        onFocus={(e) => { if (!disabled) { setConsulta(""); requestAnimationFrame(() => e.target.select()); } }}
        onChange={(e) => setConsulta(e.target.value)}
        onBlur={() => setConsulta(null)}
        onKeyDown={(e) => {
          if (!aberto) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((i) => Math.min(i + 1, achados.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (achados[ativo]) escolher(achados[ativo]);
            else if (onNovo && consulta?.trim()) { const v = consulta.trim(); setConsulta(null); campo.current?.blur(); onNovo(v); }
          }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setConsulta(null); (e.target as HTMLInputElement).blur(); } // fecha só a lista, não a janela
        }}
      />
      {/* mantém o "obrigatório" do formulário */}
      {required && <input tabIndex={-1} aria-hidden className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0" required value={value ?? ""} onChange={() => {}} />}
      {escolhido && !disabled && !aberto && (
        <button type="button" title="Tirar o cliente" aria-label="Tirar o cliente" onClick={() => escolher(null)}
          className="botao-icone absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
          <X size={16} />
        </button>
      )}
      {aberto && (
        // o campo costuma estar dentro de um <label> (Field): sem o preventDefault, o clique na lista volta o foco
        // para o campo, que reabre a busca vazia e parece que o cliente não foi escolhido
        <div className="cartao absolute left-0 right-0 z-gaveta mt-1 overflow-hidden shadow-pop"
          onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
          {achados.length === 0 && carregando ? (
            <p className="px-3 py-3 text-sm text-slate-500">Carregando os clientes… a busca aparece em instantes.</p>
          ) : achados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              Nenhum cliente com “{consulta}”.{" "}
              {onNovo
                ? (docCompleto ? "Abrindo o cadastro com esse número…" : "Aperte Enter ou toque em Cadastrar cliente, logo abaixo.")
                : "Confira o número ou busque por parte do nome, da cidade ou do nome fantasia."}
            </p>
          ) : (
            <ul ref={lista} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {achados.map((c, i) => {
                const f = c.nome_fantasia?.trim();
                const comFantasia = f && f.toLowerCase() !== c.nome.toLowerCase();
                return (
                  <li key={c.id} data-i={i} role="option" aria-selected={i === ativo}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={(e) => { e.preventDefault(); escolher(c); }}
                    className={`cursor-pointer px-3 py-2 ${i === ativo ? "bg-brand-light" : ""} ${c.id === value ? "font-semibold" : ""}`}>
                    <div className="text-sm text-fg">{comFantasia ? f : c.nome}</div>
                    <div className="text-xs text-slate-500">
                      {[comFantasia ? c.nome : null, c.cpf_cnpj ? docFormat(c.cpf_cnpj) : "sem CPF/CNPJ",
                        c.municipio ? `${c.municipio}${c.uf ? `/${c.uf}` : ""}` : null, c.codigo ? `cód. ${c.codigo}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {total > achados.length && (
            <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">Mostrando {achados.length} de {total}. Digite mais para achar mais rápido.</p>
          )}
          {onNovo && (
            <button type="button" onClick={(e) => { e.preventDefault(); const t = consulta ?? ""; setConsulta(null); campo.current?.blur(); onNovo(t.trim()); }}
              className={`flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-semibold ${achados.length ? "text-brand hover:bg-brand-light" : "bg-brand text-brand-fg hover:opacity-90"}`}>
              <UserPlus size={16} aria-hidden /> Cadastrar cliente{consulta?.trim() ? ` “${consulta.trim()}”` : " novo"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
