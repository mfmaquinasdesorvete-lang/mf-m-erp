import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { docFormat, rotuloCliente } from "@/lib/format";
import { buscarClientes, notaCliente, type ClienteBuscavel } from "@/lib/buscaCliente";

const LIMITE = 30;

/**
 * Campo de escolher cliente digitando: nome, nome fantasia, CPF/CNPJ (com ou sem pontos), código, cidade ou
 * telefone. Substitui a lista corrida com todos os clientes.
 */
export function ClienteBusca<T extends ClienteBuscavel>({ clientes, value, onChange, disabled, required, placeholder, autoFocus }: {
  clientes: T[];
  value: string | null | undefined;
  onChange: (id: string, cliente: T | null) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
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
          else if (e.key === "Enter") { e.preventDefault(); if (achados[ativo]) escolher(achados[ativo]); }
          else if (e.key === "Escape") { e.preventDefault(); setConsulta(null); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {/* mantém o "obrigatório" do formulário */}
      {required && <input tabIndex={-1} aria-hidden className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0" required value={value ?? ""} onChange={() => {}} />}
      {escolhido && !disabled && !aberto && (
        <button type="button" title="Tirar o cliente" aria-label="Tirar o cliente" onClick={() => escolher(null)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X size={16} />
        </button>
      )}
      {aberto && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-pop">
          {achados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              Nenhum cliente com “{consulta}”. Confira o número ou busque por parte do nome, da cidade ou do nome fantasia.
            </p>
          ) : (
            <ul ref={lista} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {achados.map((c, i) => {
                const f = c.nome_fantasia?.trim();
                const comFantasia = f && f.toLowerCase() !== c.nome.toLowerCase();
                return (
                  <li key={c.id} data-i={i} role="option" aria-selected={i === ativo}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(c)}
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
        </div>
      )}
    </div>
  );
}
