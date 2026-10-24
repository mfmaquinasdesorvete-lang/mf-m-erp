// Impostos na venda: quanto de imposto sai de cada venda do produto, por destino (no estado, Sul/Sudeste, Nordeste;
// empresa com IE ou consumidor, com DIFAL), menos o crédito estimado das compras e o IRPJ/CSLL, e quanto sobra.
// Quadro no cadastro do produto e lista de todas as máquinas (Máquinas → Impostos). A conta fica em lib/impostoMaquina.ts.
import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button, Card, chip } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { cenariosDe, ESTIMATIVA_PADRAO, previsaoImpostos, type LinhaImposto } from "@/lib/impostoMaquina";
import type { AliquotasUf, RegraTributaria, UnidadeFiscal } from "../../../supabase/functions/_shared/nfe-impostos";

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

/** Unidade escolhida, regras de tributação e alíquotas por estado (o mesmo que a emissão da NF-e usa). */
function useDadosFiscais() {
  const { unidades, padrao } = useUnidade();
  const ativas = unidades.filter((u) => u.ativo !== false && u.uf);
  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const unidade = (ativas.find((u) => u.id === unidadeId) ?? ativas.find((u) => u.matriz) ?? ativas[0]) as unknown as (UnidadeFiscal & { id: string; codigo: string }) | undefined;
  const { data: regras = [] } = useRows<RegraTributaria>("regras_tributacao", { order: "prioridade", ascending: true });
  const { data: ufsIcms = [] } = useRows<{ uf: string; aliquota_interna: number; fcp: number }>("icms_uf", { order: "uf", ascending: true });
  const ufs: AliquotasUf = useMemo(() => Object.fromEntries(ufsIcms.map((x) => [x.uf, x])), [ufsIcms]);
  const escolher = ativas.length > 1 && (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
      Vendendo pela unidade
      {ativas.map((u) => <button key={u.id} type="button" className={chip(u.id === unidade?.id)} onClick={() => setUnidadeId(u.id)}>{u.codigo}</button>)}
    </div>
  );
  return { unidade, regras, ufs, escolher };
}

const AVISO = `Previsão: impostos pela regra da NF-e da unidade; crédito das compras estimado em ${String(ESTIMATIVA_PADRAO.credito_icms).replace(".", ",")}% de ICMS + ${String(ESTIMATIVA_PADRAO.credito_pis_cofins).replace(".", ",")}% de PIS/COFINS sobre o custo (como se o custo fosse todo material comprado com nota); IRPJ + CSLL de ${ESTIMATIVA_PADRAO.ir_csll}% sobre o lucro. O IPI é cobrado à parte do cliente. A apuração oficial é do contador.`;

/** Quadro do cadastro: uma linha por destino. */
export function QuadroImpostosVenda({ produto, preco, custo }: { produto: Record<string, any>; preco: number; custo: number }) {
  const { unidade, regras, ufs, escolher } = useDadosFiscais();
  const linhas = useMemo(() => (unidade ? previsaoImpostos({ produto, preco, custo, unidade, ufs, regras }) : []),
    [produto, preco, custo, unidade, ufs, regras]);
  if (!(preco > 0)) return <span className="text-xs text-slate-500">preencha o preço de venda para calcular</span>;
  if (!String(produto.ncm ?? "").replace(/\D/g, "")) return <span className="text-xs text-amber-700">preencha o NCM para calcular os impostos</span>;
  return (
    <div className="space-y-2">
      {escolher}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="text-left text-slate-500">
            <tr><th className="py-1 pr-2">Destino</th><th className="px-2 text-right">ICMS</th><th className="px-2 text-right">DIFAL</th><th className="px-2 text-right">PIS + COFINS</th>
              <th className="px-2 text-right">Crédito</th><th className="px-2 text-right">IRPJ + CSLL</th><th className="px-2 text-right">Imposto total</th><th className="pl-2 text-right">Sobra</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.cenario.id} title={l.cenario.dica}>
                <td className="py-1.5 pr-2 font-semibold text-fg">{l.cenario.rotulo}</td>
                <td className="num px-2 text-right">{brl(l.icms)}</td>
                <td className="num px-2 text-right">{l.difal ? brl(l.difal) : "—"}</td>
                <td className="num px-2 text-right">{brl(l.pis + l.cofins)}</td>
                <td className="num px-2 text-right text-emerald-700">−{brl(l.credito)}</td>
                <td className="num px-2 text-right">{brl(l.irCsll)}</td>
                <td className="num px-2 text-right font-semibold">{brl(l.impostoLiquido + l.irCsll)} <span className="text-slate-500">({pct(l.cargaPct)})</span></td>
                <td className={`num pl-2 text-right font-bold ${l.sobra < 0 ? "text-red-700" : "text-emerald-700"}`}>{brl(l.sobra)} <span className="font-normal">({pct(l.sobraPct)})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas[0]?.ipi ? <p className="text-xs text-slate-600">IPI de {brl(linhas[0].ipi)} cobrado à parte do cliente (não sai do preço).</p> : null}
      <p className="text-2xs text-slate-500">{AVISO}</p>
    </div>
  );
}

/** Lista de todas as máquinas: o que sobra de cada venda em cada destino, para comparar e baixar. */
export function ListaImpostosMaquinas({ produtos, custo }: { produtos: Record<string, any>[]; custo: (p: any) => number }) {
  const { unidade, regras, ufs, escolher } = useDadosFiscais();
  const cenarios = unidade?.uf ? cenariosDe(unidade.uf) : [];
  const linhas = useMemo(() => produtos.filter((p) => p.ativo !== false && Number(p.preco_venda) > 0).map((p) => ({
    p, custo: custo(p),
    previsao: unidade ? previsaoImpostos({ produto: p, preco: Number(p.preco_venda), custo: custo(p), unidade, ufs, regras }) : [] as LinhaImposto[],
  })).sort((a, b) => String(a.p.descricao).localeCompare(String(b.p.descricao))), [produtos, custo, unidade, ufs, regras]);

  function baixar() {
    baixarPlanilha("impostos-por-maquina", [{
      nome: "Impostos por máquina",
      linhas: linhas.flatMap(({ p, custo: c, previsao }) => previsao.map((l) => ({
        Máquina: p.descricao, SKU: p.sku ?? "", NCM: p.ncm ?? "", Destino: l.cenario.rotulo, Preço: l.preco, Custo: c,
        ICMS: l.icms, DIFAL: l.difal, PIS: l.pis, COFINS: l.cofins, "IPI (à parte)": l.ipi, "Crédito estimado": l.credito,
        "IRPJ + CSLL": l.irCsll, "Imposto total": Math.round((l.impostoLiquido + l.irCsll) * 100) / 100, "Carga (%)": l.cargaPct,
        Sobra: l.sobra, "Sobra (%)": l.sobraPct,
      }))),
    }]);
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-fg">Impostos na venda de cada máquina</p>
          <p className="text-xs text-slate-500">Quanto sobra de cada venda depois dos impostos e do custo, por destino.</p>
        </div>
        <Button variant="ghost" onClick={baixar} disabled={!linhas.length}><FileDown size={16} aria-hidden /> Baixar planilha</Button>
      </div>
      {escolher}
      {!linhas.length ? <p className="mt-2 text-sm text-slate-500">Nenhuma máquina ativa com preço de venda.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-2">Máquina</th><th className="px-2 text-right">Preço</th><th className="px-2 text-right">Custo</th>
                {cenarios.map((c) => <th key={c.id} className="px-2 text-right" title={c.dica}>{c.rotulo}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map(({ p, custo: c, previsao }) => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-2 font-semibold text-fg">{p.descricao}{!String(p.ncm ?? "").replace(/\D/g, "") && <span className="ml-1 text-amber-700">(sem NCM)</span>}</td>
                  <td className="num px-2 text-right">{brl(Number(p.preco_venda))}</td>
                  <td className="num px-2 text-right">{brl(c)}</td>
                  {previsao.map((l) => (
                    <td key={l.cenario.id} className={`num px-2 text-right ${l.sobra < 0 ? "text-red-700" : ""}`} title={`Imposto ${brl(l.impostoLiquido + l.irCsll)} (${pct(l.cargaPct)})`}>
                      {brl(l.sobra)}<br /><span className="text-slate-500">{pct(l.sobraPct)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-2xs text-slate-500">Cada coluna mostra quanto sobra da venda (preço − custo − impostos − IRPJ/CSLL). {AVISO}</p>
    </Card>
  );
}
