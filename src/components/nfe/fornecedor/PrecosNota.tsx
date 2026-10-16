// Aba "Preços" da nota de fornecedor: o preço de venda sugerido pela regra de margem que já existe (produto >
// categoria > tipo), margem ou preço editável na hora, o preço nas tabelas (Marketplace, Revenda…) e o botão que
// atualiza o custo e manda o preço para a aprovação (ou aplica já, para quem aprova preços). Vale para um item ou
// para os marcados.
import { useState } from "react";
import { Check, CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { brl, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { precoNaTabela } from "@/lib/tabelasPreco";
import { abaixoDoCusto, margemPeloPreco, variacaoPct } from "@/lib/notaFornecedor";
import { itensParaCusto, opcoesParaBanco, precoMarcado, type DadosNota, type ModoPreco, type NotaBase } from "./useNotaFornecedor";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const r4 = (v: number) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const decimal = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export function PrecosNota({ d, nota, podeEditar, podeAprovar }: { d: DadosNota; nota: NotaBase; podeEditar: boolean; podeAprovar: boolean }) {
  const ligados = d.linhas.map((l, k) => ({ l, k })).filter(({ l, k }) => l.produto_id && d.contas[k]?.custo_unitario > 0);
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(ligados.map(({ l }) => l.item.numero)));
  const [ocupado, setOcupado] = useState(false);
  const todos = ligados.length > 0 && ligados.every(({ l }) => marcados.has(l.item.numero));
  const enviar = itensParaCusto(d, [...marcados]);

  async function aplicar(numeros: number[]) {
    const itens = itensParaCusto(d, numeros);
    if (!itens.length) return notifyError(new Error("Marque o custo ou o preço de algum item."));
    const custos = itens.filter((i) => i.atualizar_custo).length;
    const precos = d.modo === "nenhum" ? 0 : itens.filter((i) => i.preco_novo != null).length;
    const texto = [
      custos ? `Atualizar o custo de ${custos} ${pl(custos, "produto", "produtos")} pela nota (fica no histórico de custos).` : "",
      precos ? (d.modo === "direto" ? `Aplicar já ${precos} ${pl(precos, "preço novo", "preços novos")}.` : `Mandar ${precos} ${pl(precos, "preço novo", "preços novos")} para aprovação (Produtos → Preços).`) : "",
      !precos && d.modo !== "nenhum" ? "Sem preço marcado: a formação de preço confere a margem sozinha." : "",
    ].filter(Boolean).join(" ");
    if (!(await confirmar(texto, { titulo: "Atualizar custo e preço", ok: "Confirmar" }))) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("aplicar_custos_nota", { p_nfe: nota.id, p_itens: itens, p_opcoes: opcoesParaBanco(d) });
      if (error) throw error;
      const r = { custos: 0, para_aprovar: 0, aprovados: 0, ...(data ?? {}) } as { custos: number; para_aprovar: number; aprovados: number };
      notify([r.custos ? `${r.custos} ${pl(r.custos, "custo atualizado", "custos atualizados")}` : "",
        r.para_aprovar ? `${r.para_aprovar} ${pl(r.para_aprovar, "preço", "preços")} para aprovar` : "",
        r.aprovados ? `${r.aprovados} ${pl(r.aprovados, "preço aplicado", "preços aplicados")}` : ""].filter(Boolean).join(" · ") || "Nada mudou");
      d.recarregar();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  if (!ligados.length) return <p className="text-sm text-slate-500">Ligue os itens aos produtos (aba Itens e custos) para ver os preços.</p>;

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3">
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold text-slate-600">O que fazer com o preço novo</span>
          <select className="input" value={d.modo} disabled={!podeEditar} onChange={(e) => d.setModo(e.target.value as ModoPreco)}>
            <option value="aprovacao">Mandar para aprovação</option>
            {podeAprovar && <option value="direto">Aplicar já (você aprova preços)</option>}
            <option value="nenhum">Só atualizar o custo</option>
          </select>
        </label>
        <p className="w-full text-xs text-slate-500 sm:w-auto sm:flex-1">
          Preço = custo ÷ (1 − (margem + despesas da venda) ÷ 100), a mesma regra de Produtos → Preços. Digite a margem ou o preço para mudar.
        </p>
      </section>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={todos} onChange={() => setMarcados(todos ? new Set() : new Set(ligados.map(({ l }) => l.item.numero)))} /> Marcar todos
          </label>
          <span className="flex-1" />
          <Button type="button" disabled={ocupado || !enviar.length} onClick={() => aplicar([...marcados])}>
            <Check size={15} /> Atualizar {enviar.length} {pl(enviar.length, "item marcado", "itens marcados")}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {ligados.map(({ l, k }) => {
          const p = d.porId.get(l.produto_id!)!;
          const c = d.contas[k];
          const pr = d.precos[l.item.numero];
          const e = d.escolhas[l.item.numero] ?? { custo: true };
          const comPreco = precoMarcado(e, pr);
          const margemHoje = margemPeloPreco(Number(p.preco_venda), c.custo_unitario, d.cfg);
          const salvo = d.custosSalvos.get(l.item.numero);
          return (
            <li key={l.item.numero} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                {podeEditar && <input type="checkbox" className="mt-1" aria-label={`Marcar ${p.descricao}`} checked={marcados.has(l.item.numero)}
                  onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(l.item.numero)) n.delete(l.item.numero); else n.add(l.item.numero); return n; })} />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{p.descricao}</p>
                  <p className="text-xs text-slate-500">{[p.sku, `item ${l.item.numero} da nota`, `margem desejada ${pct(pr?.margemAlvo)} (${pr?.origemMargem ?? "—"})`].filter(Boolean).join(" · ")}</p>
                </div>
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 [overflow-wrap:anywhere]">
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">Custo</dt>
                  <dd className="tabular-nums"><span className="mr-1 text-xs text-slate-400 line-through">{Number(p.preco_custo) > 0 ? brl(p.preco_custo) : ""}</span>
                    <b>{r4(c.custo_unitario)}</b> <span className="text-xs text-slate-500">{pct(variacaoPct(Number(p.preco_custo), c.custo_unitario))}</span></dd>
                </div>
                <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 [overflow-wrap:anywhere]">
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">Preço hoje</dt>
                  <dd className="font-bold tabular-nums">{Number(p.preco_venda) > 0 ? brl(p.preco_venda) : "sem preço"}</dd>
                  <dd className={`text-[11px] ${margemHoje != null && margemHoje < 0 ? "font-semibold text-red-600" : "text-slate-500"}`}>margem com o custo novo {pct(margemHoje)}</dd>
                </div>
                <div className="col-span-2 rounded-lg bg-amber-50 px-2 py-1.5">
                  <dt className="text-[11px] font-semibold uppercase text-amber-800">Preço novo {pr?.fora_da_faixa && "· o de hoje está fora da faixa"}</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-slate-600">margem
                      <input className="input h-9 w-20 py-1 text-right tabular-nums" inputMode="decimal" disabled={!podeEditar} aria-label="Margem (%)"
                        value={e.margem ?? decimal(pr?.margem)}
                        onChange={(ev) => d.mudarEscolha(l.item.numero, { margem: ev.target.value, preco: undefined })} />%
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-600">R$
                      <input className="input h-9 w-28 py-1 text-right font-bold tabular-nums" inputMode="decimal" disabled={!podeEditar} aria-label="Preço novo"
                        value={e.preco ?? (pr?.preco != null ? pr.preco.toFixed(2).replace(".", ",") : "")}
                        onChange={(ev) => d.mudarEscolha(l.item.numero, { preco: ev.target.value, margem: undefined })} />
                    </label>
                    <span className="text-[11px] text-slate-600">markup {pr?.markup != null ? `${pr.markup.toLocaleString("pt-BR")}×` : "—"}</span>
                  </dd>
                </div>
              </dl>

              {d.tabelas.length > 0 && pr?.preco != null && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {d.tabelas.map((t) => {
                    const v = precoNaTabela(t, { id: p.id, preco_venda: pr.preco! }, d.fixos);
                    const ruim = abaixoDoCusto(v.preco, c.custo_unitario);
                    return (
                      <span key={t.id} className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${ruim ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-700 ring-slate-200"}`}
                        title={v.fixo ? "Preço fixo da tabela (não muda com o preço de venda)" : "Calculado sobre o preço novo"}>
                        <CircleDollarSign size={11} className="mr-0.5 inline" aria-hidden />{t.nome}: <b>{brl(v.preco)}</b>{v.fixo && " (fixo)"}{ruim && " · abaixo do custo"}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={e.custo} disabled={!podeEditar}
                  onChange={(ev) => d.mudarEscolha(l.item.numero, { custo: ev.target.checked })} /> Atualizar o custo</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={comPreco} disabled={!podeEditar || d.modo === "nenhum" || !pr?.preco}
                  onChange={(ev) => d.mudarEscolha(l.item.numero, { precoMarcado: ev.target.checked })} /> Preço novo</label>
                {salvo && (
                  <span className="text-xs text-slate-500">
                    Já gravado: custo {r4(salvo.custo_unitario)}{salvo.preco_novo != null ? `, preço ${brl(salvo.preco_novo)} (${salvo.preco_modo === "direto" ? "aplicado" : "para aprovação"})` : ""}
                  </span>
                )}
                {podeEditar && (
                  <Button type="button" variant="secondary" className="ml-auto" disabled={ocupado} onClick={() => aplicar([l.item.numero])}>Atualizar este</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
