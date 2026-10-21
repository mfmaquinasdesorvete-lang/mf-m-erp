// "Quanto custou montar cada unidade" na OP: concluída, o custo guardado na conclusão (peças com o custo do dia);
// aberta, a previsão pela ficha técnica com o custo de hoje. Mostra o custo de cada unidade (e de cada nº de série),
// o da OP inteira e as peças que mais pesam.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, pl } from "@/lib/format";
import { seriesDaOp } from "@/lib/fichaMontagem";
import { previsaoCustoOp, resumoCustoOp, type LinhaCustoOp } from "@/lib/custoOp";
import type { LinhaFicha } from "@/lib/estrutura";
import type { KitComponente, OrdemProducao, Produto } from "@/lib/types";

const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`;
const PRIMEIRAS = 8;

export function CustoDaOp({ op, fichas, produtos }: { op: Partial<OrdemProducao>; fichas: LinhaFicha[]; produtos: Produto[] }) {
  const guardado = op.status === "concluida" && op.custo_total != null;
  const { data: kits = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: linhasGuardadas, isLoading } = useQuery({
    queryKey: ["op_custos", op.id],
    enabled: guardado && !!op.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("op_custos").select("componente_id, descricao, quantidade, custo_unitario").eq("ordem_id", op.id!);
      if (error) throw error;
      return data as LinhaCustoOp[];
    },
  });
  const [todas, setTodas] = useState(false);
  if (!op.produto_id) return null;

  const n = Number(op.quantidade) > 0 ? Number(op.quantidade) : 1;
  const linhas = guardado ? linhasGuardadas ?? [] : previsaoCustoOp(fichas, produtos, op.produto_id, n, kits);
  const r = resumoCustoOp(linhas, n);
  // a OP guarda o total arredondado; vale ele quando as linhas ainda não chegaram
  const porUnidade = guardado ? Number(op.custo_unitario ?? r.porUnidade) : r.porUnidade;
  const total = guardado ? Number(op.custo_total ?? r.total) : r.total;
  const series = seriesDaOp(op.numeros_serie);
  const vis = todas ? r.pecas : r.pecas.slice(0, PRIMEIRAS);

  const explica = guardado
    ? "Custo guardado na conclusão, com o custo de cada peça naquele dia. Não muda se o preço das peças mudar depois."
    : op.status === "concluida"
      ? "Esta OP foi concluída antes de o ERP guardar o custo: valor estimado pela ficha técnica com o custo de hoje."
      : "Previsão pela ficha técnica com o custo de hoje. Na conclusão o ERP guarda o custo do dia.";

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3" aria-labelledby="op-custo">
      <h3 id="op-custo" className="mb-1 flex items-center gap-2 text-sm font-bold text-fg">
        <Coins size={16} aria-hidden /> {guardado ? "Quanto custou montar cada unidade" : "Quanto vai custar montar cada unidade"}
      </h3>
      <p className="mb-3 text-xs text-slate-600">{explica}</p>

      {guardado && isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : !r.pecas.length && !guardado ? (
        <p className="text-sm text-slate-600">Sem ficha técnica: cadastre as peças na aba <b>Ficha técnica</b> para ver o custo.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-surface p-3 ring-1 ring-emerald-200">
              <span className="block text-xs text-slate-600">Cada unidade</span>
              <span className="num text-xl font-bold text-emerald-800">{brl(porUnidade)}</span>
            </div>
            <div className="rounded-lg bg-surface p-3 ring-1 ring-slate-200">
              <span className="block text-xs text-slate-600">OP inteira ({qtd(n)} {pl(n, "unidade", "unidades")})</span>
              <span className="num text-xl font-bold text-fg">{brl(total)}</span>
            </div>
            <div className="rounded-lg bg-surface p-3 ring-1 ring-slate-200">
              <span className="block text-xs text-slate-600">Peças</span>
              <span className="num text-xl font-bold text-fg">{r.pecas.length}</span>
              {r.semCusto > 0 && <span className="block text-xs font-semibold text-amber-700">{r.semCusto} sem custo no cadastro</span>}
            </div>
          </div>

          {series.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Custo de cada nº de série">
              {series.map((s) => (
                <li key={s} className="rounded-md bg-surface px-2 py-1 text-xs ring-1 ring-slate-200">
                  Série <b className="num">{s}</b> · <span className="num font-semibold text-emerald-800">{brl(porUnidade)}</span>
                </li>
              ))}
            </ul>
          )}

          {r.pecas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-surface">
              <table className="tabela w-full text-sm" aria-labelledby="op-custo">
                <thead className="bg-slate-50"><tr>
                  <th scope="col" className="th">Peça</th><th scope="col" className="th text-right">Por unidade</th>
                  <th scope="col" className="th text-right">Custo un.</th><th scope="col" className="th text-right">Em cada unidade</th>
                  <th scope="col" className="th text-right">Parte</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {vis.map((p, i) => (
                    <tr key={(p.componente_id ?? p.descricao) + i}>
                      <td className="td" data-label="Peça">{p.descricao}</td>
                      <td className="td num text-right" data-label="Por unidade">{qtd(p.porUnidade)}</td>
                      <td className={`td num text-right ${p.custo_unitario ? "" : "font-semibold text-amber-700"}`} data-label="Custo un.">{p.custo_unitario ? brl(p.custo_unitario) : "sem custo"}</td>
                      <td className="td num text-right font-semibold" data-label="Em cada unidade">{brl(p.custoPorUnidade)}</td>
                      <td className="td num text-right text-slate-500" data-label="Parte">{pct(p.parte)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.pecas.length > PRIMEIRAS && (
                <button type="button" className="w-full border-t border-slate-100 px-3 py-2 text-sm font-semibold text-brand hover:bg-slate-50" onClick={() => setTodas((v) => !v)}>
                  {todas ? "Mostrar só as que mais pesam" : `Ver as ${r.pecas.length} peças`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
