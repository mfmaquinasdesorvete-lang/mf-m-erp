// Ordem de compra → "ver últimas compras": o que já foi comprado deste fornecedor (pedidos de compra e notas de
// fornecedor, item por item, com valor unitário, quantidade e data) e a busca de outros produtos pelas primeiras
// letras em todos os fornecedores (função ultimas_compras do banco).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { useFecharComEsc } from "../ui";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";

export type CompraAnterior = {
  tipo: "pedido" | "nota"; numero: string; ref_id: string; data: string | null; descricao: string; quantidade: number | null;
  unidade: string | null; valor_unitario: number | null; fornecedor: string | null; produto_id: string | null;
};
type Coluna = "descricao" | "fornecedor" | "valor_unitario" | "quantidade" | "data" | "tipo" | "numero";

const TIPO: Record<CompraAnterior["tipo"], string> = { pedido: "Ped. de compra", nota: "Nota fiscal" };
const qtd = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

/** Ordena a lista pela coluna escolhida (texto em ordem alfabética, números e datas pelo valor). */
export function ordenarCompras(lista: CompraAnterior[], coluna: Coluna, crescente: boolean) {
  const val = (c: CompraAnterior) => (coluna === "numero" ? Number(c.numero) || 0 : coluna === "tipo" ? TIPO[c.tipo] : c[coluna] ?? "");
  return [...lista].sort((a, b) => {
    const x = val(a), y = val(b);
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    return crescente ? r : -r;
  });
}

export function UltimasCompras({ fornecedorId, fornecedorNome, onClose }: { fornecedorId: string; fornecedorNome?: string | null; onClose: () => void }) {
  useFecharComEsc(true, onClose);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ coluna: Coluna; crescente: boolean }>({ coluna: "data", crescente: false });
  // espera parar de digitar
  useEffect(() => { const t = setTimeout(() => setBusca(texto.trim()), 400); return () => clearTimeout(t); }, [texto]);
  const outros = busca.length >= 3;

  const { data = [], isFetching, error } = useQuery({
    queryKey: ["ultimas_compras", outros ? null : fornecedorId, outros ? busca : null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ultimas_compras", { p_fornecedor: outros ? null : fornecedorId, p_busca: outros ? busca : null, p_limite: 300 });
      if (error) throw error;
      return (data ?? []) as CompraAnterior[];
    },
  });
  const lista = useMemo(() => ordenarCompras(data, ordem.coluna, ordem.crescente), [data, ordem]);

  const cab = (coluna: Coluna, rotulo: string, direita = false) => {
    const ativa = ordem.coluna === coluna;
    const Icone = !ativa ? ArrowUpDown : ordem.crescente ? ArrowUp : ArrowDown;
    return (
      <th scope="col" className={`th ${direita ? "text-right" : ""}`} aria-sort={ativa ? (ordem.crescente ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setOrdem({ coluna, crescente: ativa ? !ordem.crescente : coluna === "descricao" || coluna === "fornecedor" })}
          className={`inline-flex items-center gap-1 font-semibold ${ativa ? "text-fg" : ""}`}>
          {rotulo} <Icone size={13} aria-hidden />
        </button>
      </th>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-ink/50 backdrop-blur-[2px]" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Últimas compras" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col bg-canvas shadow-pop">
        <header className="flex items-start gap-3 border-b border-slate-200 bg-surface px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-fg">Últimas compras</h2>
            <p className="truncate text-sm text-slate-500">
              {outros ? `"${busca}" em todos os fornecedores` : fornecedorNome ? `Comprado de ${fornecedorNome}` : "Comprado deste fornecedor"} · pedidos de compra e notas fiscais
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={20} /></button>
        </header>
        <div className="border-b border-slate-200 px-4 py-3 sm:px-6">
          <label htmlFor="ultimas-busca" className="mb-1.5 block text-xs font-semibold text-slate-600">Outros produtos</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="ultimas-busca" className="input pl-9" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
              placeholder="Ex.: redutor, motor, compressor" aria-describedby="ultimas-busca-ajuda" />
          </div>
          <p id="ultimas-busca-ajuda" className="mt-1 text-xs text-slate-500">
            Use as primeiras letras da descrição do produto (3 ou mais) para ver o que foi comprado de todos os fornecedores. Vazio: só deste fornecedor.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-6 sm:px-4">
          {error && <p className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar: {(error as Error).message}</p>}
          {!error && !isFetching && !lista.length && (
            <p className="p-6 text-center text-sm text-slate-500">{outros ? "Nenhuma compra com essa descrição." : "Nenhuma compra deste fornecedor ainda."}</p>
          )}
          {isFetching && !lista.length && <p className="p-6 text-center text-sm text-slate-500">Buscando…</p>}
          {!!lista.length && (
            <table className="w-full min-w-[640px] text-sm" aria-label="Compras anteriores" aria-busy={isFetching}>
              <thead className="sticky top-0 bg-canvas"><tr>
                {cab("descricao", "Descrição")}{outros && cab("fornecedor", "Fornecedor")}
                {cab("valor_unitario", "Valor un.", true)}{cab("quantidade", "Qtde.", true)}{cab("data", "Data")}{cab("tipo", "Tipo")}{cab("numero", "Número")}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((c, i) => (
                  <tr key={`${c.tipo}-${c.ref_id}-${i}`}>
                    <td className="td font-medium text-fg">{c.descricao}</td>
                    {outros && <td className="td text-slate-600">{c.fornecedor ?? "—"}</td>}
                    <td className="td num whitespace-nowrap text-right">{c.valor_unitario == null ? "—" : brl(Number(c.valor_unitario))}</td>
                    <td className="td num whitespace-nowrap text-right">{qtd(c.quantidade)} <span className="text-xs text-slate-500">{c.unidade}</span></td>
                    <td className="td num whitespace-nowrap">{dataBR(c.data)}</td>
                    <td className="td whitespace-nowrap text-slate-600">{TIPO[c.tipo]}</td>
                    <td className="td num font-semibold text-brand">{c.numero || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
