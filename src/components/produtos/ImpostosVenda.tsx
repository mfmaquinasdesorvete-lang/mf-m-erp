// Impostos na venda: quanto de imposto sai de cada venda do produto, por destino (no estado, Sul/Sudeste, Nordeste;
// empresa com IE ou consumidor, com DIFAL), menos o crédito estimado das compras e o IRPJ/CSLL, e quanto sobra.
// Lista dos impostos na venda por destino: das máquinas (Máquinas → Impostos) e de todos os produtos que vendem
// (Gestão de preços → Impostos na venda; saiu do cadastro do produto em 28/10). A conta fica em lib/impostoMaquina.ts.
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

/** `item`: "máquina" (Máquinas → Impostos) ou "produto" (Gestão de preços → Impostos na venda, todos os que vendem). */
export function ListaImpostosMaquinas({ produtos, custo, item = "máquina" }: { produtos: Record<string, any>[]; custo: (p: any) => number; item?: "máquina" | "produto" }) {
  const Item = item === "máquina" ? "Máquina" : "Produto";
  const { unidade, regras, ufs, escolher } = useDadosFiscais();
  const cenarios = unidade?.uf ? cenariosDe(unidade.uf) : [];
  const linhas = useMemo(() => produtos.filter((p) => p.ativo !== false && Number(p.preco_venda) > 0).map((p) => ({
    p, custo: custo(p),
    previsao: unidade ? previsaoImpostos({ produto: p, preco: Number(p.preco_venda), custo: custo(p), unidade, ufs, regras }) : [] as LinhaImposto[],
  })).sort((a, b) => String(a.p.descricao).localeCompare(String(b.p.descricao))), [produtos, custo, unidade, ufs, regras]);

  function baixar() {
    baixarPlanilha(item === "máquina" ? "impostos-por-maquina" : "impostos-por-produto", [{
      nome: `Impostos por ${item}`,
      linhas: linhas.flatMap(({ p, custo: c, previsao }) => previsao.map((l) => ({
        [Item]: p.descricao, SKU: p.sku ?? "", NCM: p.ncm ?? "", Destino: l.cenario.rotulo, Preço: l.preco, Custo: c,
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
          <p className="font-bold text-fg">Impostos na venda de cada {item}</p>
          <p className="text-xs text-slate-500">Quanto sobra de cada venda depois dos impostos e do custo, por destino.</p>
        </div>
        <Button variant="ghost" onClick={baixar} disabled={!linhas.length}><FileDown size={16} aria-hidden /> Baixar planilha</Button>
      </div>
      {escolher}
      {!linhas.length ? <p className="mt-2 text-sm text-slate-500">{item === "máquina" ? "Nenhuma máquina ativa" : "Nenhum produto ativo"} com preço de venda.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-2">{Item}</th><th className="px-2 text-right">Preço</th><th className="px-2 text-right">Custo</th>
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
