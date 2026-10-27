// Filtros das listas de notas: período (atalhos ou de/até), número de/até, valor e UF. Mostra quantas notas
// e o total do que ficou na lista.
import { useState } from "react";
import { brl, hoje, pl } from "@/lib/format";
import { FILTRO_VAZIO, periodoDoAtalho, type FiltroNota } from "@/lib/filtroNotas";

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export function useFiltrosNotas() {
  // a lista abre na semana atual (pedido da usuária); "Limpar" volta para qualquer data
  const [f, setF] = useState<FiltroNota>(() => ({ ...FILTRO_VAZIO, ...periodoDoAtalho("semana", hoje()) }));
  const [aberto, setAberto] = useState(false);
  return { f, setF, aberto, setAberto };
}

/** Número, valor e UF (a data fica no botão de período da barra de filtros). */
export function CamposNota({ f, onChange, comUf = false }: { f: FiltroNota; onChange: (f: FiltroNota) => void; comUf?: boolean }) {
  const set = (k: keyof FiltroNota) => (e: { target: { value: string } }) => onChange({ ...f, [k]: e.target.value });
  const r = "text-xs font-semibold text-slate-600";
  const c = "input mt-0.5 h-9 w-[7.5rem]";
  return (
    <>
      <label className={r}>Nº de<input className={c} inputMode="numeric" value={f.numDe} onChange={set("numDe")} placeholder="Ex.: 431" /></label>
      <label className={r}>Nº até<input className={c} inputMode="numeric" value={f.numAte} onChange={set("numAte")} /></label>
      <label className={r}>Valor mín.<input className={c} inputMode="decimal" value={f.valorMin} onChange={set("valorMin")} placeholder="R$" /></label>
      <label className={r}>Valor máx.<input className={c} inputMode="decimal" value={f.valorMax} onChange={set("valorMax")} placeholder="R$" /></label>
      {comUf && (
        <label className={r}>UF
          <select className="input mt-0.5 h-9 w-[5.5rem]" value={f.uf} onChange={set("uf")}><option value="">Todas</option>{UFS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </label>
      )}
    </>
  );
}

/** Quantos dos campos de número, valor e UF estão em uso (a data conta à parte). */
export const camposEmUso = (f: FiltroNota) => [f.numDe || f.numAte, f.valorMin || f.valorMax, f.uf].filter(Boolean).length;

/** "12 notas · R$ 45.000,00" do que ficou na lista. */
/** Cartões coloridos do que está na lista (o mês, ao abrir): quantas notas, o valor sem as canceladas, o ticket médio
 *  e o que pede atenção (rejeitadas, na fila, processando). `situacao`: chave de situacaoEmitida/situacaoRecebida.
 *  Nas emitidas, `venda` é a parte que é venda: o cartão soma só as vendas e mostra à parte as transferências entre as
 *  unidades e o resto (remessas, comodato, demonstração, conserto, garantia e devoluções a fornecedor não são faturamento). */
export function CartoesNotas({ notas, ativo, periodo, tipo }: {
  notas: { valor: number; situacao: string; venda?: number; transferencia?: number }[]; ativo: boolean; periodo: { de?: string; ate?: string }; tipo: "emitidas" | "recebidas";
}) {
  if (!ativo) return null;
  const validas = notas.filter((x) => x.situacao !== "cancelada");
  const soVendas = tipo === "emitidas" && validas.some((x) => x.venda !== undefined);
  const deVenda = soVendas ? validas.filter((x) => (x.venda ?? 0) > 0) : validas;
  const total = deVenda.reduce((t, x) => t + (soVendas ? x.venda ?? 0 : x.valor), 0);
  const transf = soVendas ? validas.reduce((t, x) => t + (x.transferencia ?? 0), 0) : 0;
  const outras = soVendas ? validas.reduce((t, x) => t + x.valor, 0) - total - transf : 0;
  const foraVendas = [transf > 0.005 && `${brl(transf)} em transferências SC↔SP`, outras > 0.005 && `${brl(outras)} em remessas e devoluções a fornecedor`].filter(Boolean).join(" · ");
  const canceladas = notas.length - validas.length;
  const semCanceladas = canceladas ? `sem ${canceladas} ${pl(canceladas, "cancelada", "canceladas")}` : "sem canceladas";
  const atencao = notas.filter((x) => ["erro", "denegada", "processando", "contingencia", "pendente", "aguardando_vinculo", "revisao"].includes(x.situacao)).length;
  const quando = periodo.de && periodo.ate ? (periodo.de.slice(0, 7) === periodo.ate.slice(0, 7) && periodo.de.endsWith("-01") ? nomeDoMes(periodo.de) : `${dataCurta(periodo.de)} a ${dataCurta(periodo.ate)}`) : "todas as datas";
  const cards: [string, string, string, string][] = [
    [tipo === "emitidas" ? "Notas emitidas" : "Notas recebidas", String(notas.length), quando, "bg-sky-500/10 text-sky-700"],
    [soVendas ? "Vendas" : "Valor", brl(total), soVendas && foraVendas ? `fora: ${foraVendas}` : semCanceladas, "bg-emerald-500/10 text-emerald-700"],
    ["Ticket médio", deVenda.length ? brl(total / deVenda.length) : "—", `${deVenda.length} ${soVendas ? pl(deVenda.length, "nota de venda", "notas de venda") : pl(deVenda.length, "nota válida", "notas válidas")}`, "bg-violet-500/10 text-violet-700"],
    ["Pedem atenção", String(atencao), atencao ? (tipo === "emitidas" ? "rejeitadas, na fila ou processando" : "conferir ou vincular produto") : "tudo certo", atencao ? "bg-red-500/10 text-red-700" : "bg-slate-500/10 text-slate-500"],
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map(([rot, valor, sub, cor]) => (
        <div key={rot} className={`rounded-2xl border border-slate-200 p-3 ${cor}`}>
          <p className="text-2xs font-semibold uppercase opacity-80">{rot}</p>
          <p className="num text-xl font-bold text-fg">{valor}</p>
          <p className="line-clamp-2 text-2xs opacity-80" title={sub}>{sub}</p>
        </div>
      ))}
    </div>
  );
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
