import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { buscarProdutos, notaProduto, type ProdutoBuscavel } from "@/lib/buscaProduto";

const LIMITE = 30;

/**
 * Campo de adicionar produto digitando: descrição, SKU, código de barras (serve o leitor), modelo, marca ou
 * código do fabricante. Escolheu, adiciona e o campo fica pronto para o próximo. Substitui a lista corrida.
 */
export function ProdutoBusca<T extends ProdutoBuscavel & { kit?: boolean | null }>({ produtos, onEscolher, placeholder, detalhe, className }: {
  produtos: T[];
  onEscolher: (p: T) => void;
  placeholder?: string;
  /** Segunda linha de cada produto (ex.: preço e estoque). Padrão: SKU · modelo · marca. */
  detalhe?: (p: T) => ReactNode;
  className?: string;
}) {
  const [consulta, setConsulta] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const achados = useMemo(() => (aberto ? buscarProdutos(produtos, consulta, LIMITE) : []), [aberto, produtos, consulta]);
  const total = useMemo(() => (aberto && consulta.trim() ? produtos.filter((p) => notaProduto(p, consulta) > 0).length : produtos.length),
    [aberto, produtos, consulta]);

  useEffect(() => { setAtivo(0); }, [consulta]);
  useEffect(() => { lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" }); }, [ativo]);
  // no fim de um formulário comprido a lista abriria fora da tela
  useEffect(() => { if (aberto) painel.current?.scrollIntoView({ block: "nearest" }); }, [aberto]);

  function escolher(p: T) {
    onEscolher(p);
    setConsulta("");
    setAberto(false); // fica com o cursor no campo para o próximo item
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Plus size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9"
        role="combobox" aria-expanded={aberto} aria-autocomplete="list" autoComplete="off"
        placeholder={placeholder ?? "Adicionar item: nome, SKU ou código"}
        value={consulta}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        onChange={(e) => { setConsulta(e.target.value); setAberto(true); }}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); // nunca salva o formulário daqui (o leitor de código de barras manda Enter)
            if (aberto && achados[ativo]) escolher(achados[ativo]);
          } else if (e.key === "ArrowDown") { e.preventDefault(); if (!aberto) setAberto(true); else setAtivo((i) => Math.min(i + 1, achados.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Escape" && aberto) { e.preventDefault(); e.stopPropagation(); setAberto(false); setConsulta(""); }
        }}
      />
      {aberto && (
        <div ref={painel} className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-pop">
          {achados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              {produtos.length === 0 ? "Nenhum produto cadastrado para escolher aqui." : <>Nenhum produto com “{consulta}”. Busque por parte do nome, pelo SKU ou pelo código de barras.</>}
            </p>
          ) : (
            <ul ref={lista} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {achados.map((p, i) => {
                const extra = detalhe ? detalhe(p) : [p.sku, p.modelo, p.marca].filter(Boolean).join(" · ");
                return (
                  <li key={p.id} data-i={i} role="option" aria-selected={i === ativo}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(p)}
                    className={`cursor-pointer px-3 py-2 ${i === ativo ? "bg-brand-light" : ""}`}>
                    <div className="text-sm text-fg">
                      {p.kit && <span className="mr-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700">KIT</span>}
                      {p.descricao}
                    </div>
                    {extra && <div className="text-xs text-slate-500">{extra}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          {total > achados.length && (
            <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
              {consulta.trim() ? `Mostrando ${achados.length} de ${total}. Digite mais para achar mais rápido.` : `${total} produtos: digite para achar.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
