// Partes da aba CT-e de Fretes e envios: a barra do frete pago pela MF (compras, vendas, transferências), as faturas
// para montar agrupadas pela transportadora (com as filiais dentro) e o menu Importar (planilha ou XML).
import { useMemo, useState } from "react";
import { FileSpreadsheet, Receipt, Upload } from "lucide-react";
import { Button, Section } from "@/components/ui";
import { ImportarCteXml } from "@/components/fretes/ImportarCteXml";
import { brl, dataBR } from "@/lib/format";
import type { FaturaSugerida, ResumoCtes, Sentido } from "@/lib/cte";
import type { Transportadora } from "@/lib/types";

export const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
export const div = (a: number, b: number) => (b > 0 ? a / b : null);
export const nomeTransportadora = (t?: Transportadora | null) => (t ? t.nome_fantasia || t.nome : "—");

/** Faturas para montar: os CT-e sem fatura juntos por transportadora (a matriz, com as filiais dentro) e pelo nº da
 * fatura quando vem no CT-e. */
export function FaturasParaMontar({ grupos, porId, onMontar }: {
  grupos: FaturaSugerida[]; porId: Map<string, Transportadora>; onMontar: (g: FaturaSugerida) => void;
}) {
  const porMatriz = useMemo(() => {
    const m = new Map<string, { nome: string; total: number; qtd: number; grupos: FaturaSugerida[] }>();
    for (const g of grupos) {
      const t = g.transportadora_id ? porId.get(g.transportadora_id) : null;
      const matriz = t?.matriz_id ? porId.get(t.matriz_id) ?? t : t;
      const k = matriz?.id ?? "sem";
      const x = m.get(k) ?? { nome: nomeTransportadora(matriz), total: 0, qtd: 0, grupos: [] };
      x.total = Math.round((x.total + g.total) * 100) / 100; x.qtd += g.qtd; x.grupos.push(g);
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [grupos, porId]);
  if (!grupos.length) return null;
  const filial = (g: FaturaSugerida) => {
    const t = g.transportadora_id ? porId.get(g.transportadora_id) : null;
    return t?.matriz_id ? (t.municipio ? `${t.municipio}${t.uf ? `/${t.uf}` : ""}` : nomeTransportadora(t)) : "Matriz";
  };
  return (
    <Section title="Faturas para montar">
      <p className="mb-2 text-xs text-slate-600">CT-e que a MF paga e ainda não estão em fatura. Quando a fatura da transportadora chegar, confira e toque em
        Montar: ela vai para Contas a pagar e passa pela aprovação.</p>
      <ul className="grid gap-2 lg:grid-cols-2">
        {porMatriz.map((m) => (
          <li key={m.nome} className="cartao p-3">
            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
              <b className="min-w-0 flex-1 truncate">{m.nome}</b>
              <span className="num whitespace-nowrap font-bold">{brl(m.total)}</span>
            </span>
            <span className="text-xs text-slate-500">{m.qtd} CT-e</span>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {m.grupos.map((g) => (
                <li key={g.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{filial(g)}</span>
                    <span className="block text-xs text-slate-500">{g.qtd} CT-e · {dataBR(g.desde)}{g.ate !== g.desde ? ` a ${dataBR(g.ate)}` : ""}
                      {g.fatura && <> · fatura nº {g.fatura}</>}{g.vencimento && <> · vence {dataBR(g.vencimento)}</>}</span>
                  </span>
                  <span className="num font-semibold">{brl(g.total)}</span>
                  <Button variant="secondary" tamanho="mini" onClick={() => onMontar(g)}><Receipt size={13} /> Montar</Button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Compras, vendas e transferências numa barra (cada parte filtra a lista), com o % do frete sobre a nota. */
export function BarraSentidos({ resumo, sentido, onSentido }: { resumo: ResumoCtes; sentido: Sentido | ""; onSentido: (s: Sentido | "") => void }) {
  const partes: { s: Sentido; rotulo: string; valor: number; cor: string; peso?: ResumoCtes["pesoCompras"] }[] = [
    { s: "entrada", rotulo: "Compras chegando", valor: resumo.compras, cor: "bg-sky-500", peso: resumo.pesoCompras },
    { s: "saida", rotulo: "Vendas saindo", valor: resumo.vendas, cor: "bg-emerald-500", peso: resumo.pesoVendas },
    { s: "transferencia", rotulo: "Transferências SC↔SP", valor: resumo.transferencias, cor: "bg-purple-500" },
  ];
  const total = partes.reduce((t, p) => t + p.valor, 0);
  return (
    <div className="mt-3">
      {total > 0 && (
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {partes.filter((p) => p.valor > 0).map((p) => <span key={p.s} className={p.cor} style={{ width: `${(p.valor / total) * 100}%` }} />)}
        </div>
      )}
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-3">
        {partes.map((p) => (
          <li key={p.s}>
            <button type="button" aria-pressed={sentido === p.s} onClick={() => onSentido(sentido === p.s ? "" : p.s)}
              className={`linha-clicavel w-full rounded-lg px-2 py-1 text-left ${sentido === p.s ? "bg-slate-100" : ""}`}>
              <span className="flex items-center gap-1.5 text-xs text-slate-600"><span className={`h-2 w-2 rounded-full ${p.cor}`} aria-hidden />{p.rotulo}</span>
              <span className="num block font-semibold">{brl(p.valor)}</span>
              {p.peso && p.peso.ligados > 0 && (
                <span className="block text-2xs text-slate-500" title="frete sobre o valor da nota, só nos CT-e com a nota ligada">
                  {pct(div(p.peso.frete, p.peso.nf))} da nota{p.peso.ligados < p.peso.total ? ` (${p.peso.ligados} de ${p.peso.total} com a nota)` : ""}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Importar: planilha CSV do site da transportadora ou os XML (ou ZIP) dos CT-e, num menu só. */
export function MenuImportar({ onPlanilha }: { onPlanilha: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setAberto(!aberto)} aria-expanded={aberto}><Upload size={16} /> Importar</Button>
      {aberto && (
        <div className="cartao absolute right-0 z-20 mt-1 w-72 space-y-2 p-3 text-sm">
          <button type="button" className="link-acao flex items-center gap-1.5" onClick={() => { setAberto(false); onPlanilha(); }}><FileSpreadsheet size={15} /> Planilha de CT-e (CSV do site da transportadora)</button>
          <div className="border-t border-slate-100 pt-2"><ImportarCteXml /></div>
        </div>
      )}
    </div>
  );
}

