// Aba "Itens e custos" da nota de fornecedor: cada item ligado ao produto do ERP (código do fornecedor, EAN, SKU
// ou à mão), a conversão de unidade, o custo de entrada com a conta aberta e a confirmação da entrada
// (estoque + custo + preço + baixa na ordem de compra, tudo de uma vez).
import { useState } from "react";
import { ArrowDown, ArrowUp, Calculator, Link2, PackagePlus, Plus, RefreshCw, Save, X } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { unidadeDeEmbalagem, unidadeDoErp } from "@/lib/itensNotas";
import { brl, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import {
  ALIQUOTA_COFINS, ALIQUOTA_PIS, FINALIDADES, ROTULO_ORIGEM, conferirTotal, numeroBR, variacaoPct, type ContaCusto, type Finalidade,
} from "@/lib/notaFornecedor";
import { itensParaCusto, itensParaEstoque, opcoesParaBanco, type DadosNota, type LinhaItem, type NotaBase } from "./useNotaFornecedor";

const qtd = (v: number) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const r4 = (v: number) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function ItensCustos({ d, nota, podeEditar }: { d: DadosNota; nota: NotaBase; podeEditar: boolean }) {
  const [ocupado, setOcupado] = useState(false);
  const [trocando, setTrocando] = useState<number | null>(null);
  const o = d.opcoes;
  if (!o) return null;
  const ligados = d.linhas.filter((l) => l.produto_id);
  const mudados = d.linhas.filter((l) => l.mudou && l.produto_id && l.item.codigo);
  const diferenca = conferirTotal(d.contas, d.totais, numeroBR(o.despesaExtra) ?? 0);

  async function salvarVinculos() {
    if (!nota.fornecedor_id) return notifyError(new Error("A nota não tem fornecedor cadastrado: o vínculo não fica guardado."));
    if (!(await confirmar(`Guardar ${mudados.length} ${pl(mudados.length, "vínculo", "vínculos")} (código do fornecedor → produto e fator)? Nas próximas notas deste fornecedor o item já vem ligado.`, { ok: "Guardar" }))) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("ligar_itens_fornecedor", {
        p_itens: mudados.map((l) => ({ fornecedor_id: nota.fornecedor_id, codigo: l.item.codigo, descricao: l.item.descricao, acao: "produto", produto_id: l.produto_id, fator: l.fator })),
      });
      if (error) throw error;
      notify(`${Number(data ?? 0)} ${pl(data, "vínculo guardado", "vínculos guardados")}: na próxima nota deste fornecedor o item já vem ligado`);
      d.marcarGravado();
      d.recarregar();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function confirmarEntrada() {
    const itens = itensParaEstoque(d);
    const custos = itensParaCusto(d);
    const baixas = d.comparacao.baixas;
    const semProduto = d.linhas.length - itens.length;
    const comPreco = d.modo === "nenhum" ? 0 : custos.filter((c) => c.preco_novo != null).length;
    const nCustos = custos.filter((c) => c.atualizar_custo).length;
    const ocs = [...new Set(baixas.map((b) => `#${b.numero}`))];
    const texto = [
      `Dar entrada no estoque de ${itens.length} ${pl(itens.length, "item", "itens")}${semProduto ? ` (${semProduto} sem produto ${pl(semProduto, "fica", "ficam")} de fora)` : ""}.`,
      `Atualizar o custo de ${nCustos} ${pl(nCustos, "produto", "produtos")} (${o!.descontarCreditos ? "custo líquido, sem os créditos" : "custo cheio"}).`,
      comPreco ? `${comPreco} ${pl(comPreco, "preço novo", "preços novos")} ${d.modo === "direto" ? "aplicados já" : "para aprovação"}.` : "",
      ocs.length ? `Baixa na ordem de compra ${ocs.join(", ")} (${baixas.length} ${pl(baixas.length, "item", "itens")}).` : "Sem ordem de compra ligada.",
    ].filter(Boolean).join(" ");
    if (!(await confirmar(texto, { titulo: "Confirmar entrada da nota", ok: "Confirmar entrada" }))) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("confirmar_entrada_nota", {
        p_nfe: nota.id, p_itens: itens, p_custos: custos, p_opcoes: opcoesParaBanco(d),
        p_baixas: baixas.map((b) => ({ item_id: b.item_id, quantidade: b.quantidade })),
      });
      if (error) throw error;
      const r = { itens: 0, custos: 0, baixas: 0, para_aprovar: 0, aprovados: 0, ja_recebidos: 0, ...(data ?? {}) } as { itens: number; custos: number; baixas: number; para_aprovar: number; aprovados: number; ja_recebidos: number };
      notify([`${r.itens} ${pl(r.itens, "item lançado", "itens lançados")} no estoque`, r.custos ? `${r.custos} ${pl(r.custos, "custo", "custos")}` : "",
        r.para_aprovar ? `${r.para_aprovar} para aprovar` : "", r.aprovados ? `${r.aprovados} ${pl(r.aprovados, "preço aplicado", "preços aplicados")}` : "",
        r.baixas ? `${r.baixas} ${pl(r.baixas, "baixa", "baixas")} na OC` : "",
        r.ja_recebidos ? `${r.ja_recebidos} ${pl(r.ja_recebidos, "item já tinha entrado", "itens já tinham entrado")} pela OC recebida sem nota` : ""].filter(Boolean).join(" · "));
      d.marcarGravado();
      d.recarregar();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4">
      {!d.completo && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Sem o XML completo: o custo sai só pelo valor dos produtos (sem frete, IPI, ICMS-ST e créditos). Dê a ciência da operação ou importe o XML.
        </p>
      )}

      {/* Opções do custo */}
      <section className="rounded-xl border border-slate-200 p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><Calculator size={16} className="text-modulo-texto" aria-hidden /> Como calcular o custo</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Para que é a compra">
            <select className="input" value={o.finalidade} disabled={!podeEditar} onChange={(e) => d.setOpcoes({ ...o, finalidade: e.target.value as Finalidade })}>
              {FINALIDADES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">{FINALIDADES.find((f) => f.value === o.finalidade)?.detalhe}</span>
          </Field>
          <Field label="Custo">
            <select className="input" value={o.descontarCreditos ? "liquido" : "cheio"} disabled={!podeEditar}
              onChange={(e) => d.setOpcoes({ ...o, descontarCreditos: e.target.value === "liquido" })}>
              <option value="liquido">Líquido: desconta os créditos</option>
              <option value="cheio">Cheio: sem descontar os créditos</option>
            </select>
          </Field>
          <Field label="Despesa extra (R$)">
            <input className="input" inputMode="decimal" placeholder="Ex.: frete pago à transportadora" value={o.despesaExtra} disabled={!podeEditar}
              onChange={(e) => d.setOpcoes({ ...o, despesaExtra: e.target.value })} />
            <span className="mt-1 block text-xs text-slate-500">Rateada pelo valor dos itens, sem crédito.</span>
          </Field>
        </div>
        <p className="mt-2 text-xs text-amber-800">
          Créditos do Lucro Real (ICMS, IPI, PIS {ALIQUOTA_PIS.toLocaleString("pt-BR")}% e COFINS {ALIQUOTA_COFINS.toLocaleString("pt-BR")}%): estimativa. Confirme a regra com o contador.
        </p>
        {diferenca != null && (
          <p className={`mt-1 text-xs ${Math.abs(diferenca) < 0.05 ? "text-emerald-700" : "text-amber-800"}`}>
            {Math.abs(diferenca) < 0.05 ? "A soma dos custos cheios fecha com o total da nota." : `A soma dos custos cheios difere ${brl(diferenca)} do total da nota (ex.: ICMS desonerado ou IPI devolvido).`}
          </p>
        )}
      </section>

      {/* Itens */}
      <ul className="space-y-2">
        {d.linhas.map((l, k) => (
          <ItemNota key={l.item.numero} l={l} conta={d.contas[k]} d={d} podeEditar={podeEditar}
            trocando={trocando === l.item.numero} onTrocar={(v) => setTrocando(v ? l.item.numero : null)} />
        ))}
      </ul>
      {!d.linhas.length && <p className="text-sm text-slate-500">A nota ainda não tem itens lidos (falta o XML).</p>}

      {podeEditar && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <span className="mr-auto text-sm text-slate-600">{ligados.length} de {d.linhas.length} {pl(d.linhas.length, "item ligado", "itens ligados")}</span>
          {mudados.length > 0 && (
            <Button type="button" variant="secondary" disabled={ocupado} onClick={salvarVinculos}><Save size={15} /> Guardar {mudados.length} {pl(mudados.length, "vínculo", "vínculos")}</Button>
          )}
          {!nota.estoque_lancado && nota.situacao !== "cancelada" && (
            <Button type="button" disabled={ocupado || !ligados.length} onClick={confirmarEntrada}><PackagePlus size={15} /> Confirmar entrada</Button>
          )}
        </div>
      )}
      {nota.estoque_lancado && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          O estoque desta nota já entrou. Para atualizar o custo e o preço pela conta completa, use a aba Preços. Para a ordem de compra, a aba Ordem de compra.
        </p>
      )}
    </div>
  );
}

function ItemNota({ l, conta, d, podeEditar, trocando, onTrocar }: {
  l: LinhaItem; conta: ContaCusto | undefined; d: DadosNota; podeEditar: boolean; trocando: boolean; onTrocar: (v: boolean) => void;
}) {
  const i = l.item;
  const p = l.produto_id ? d.porId.get(l.produto_id) : undefined;
  const invalidate = useInvalidate();
  const [criando, setCriando] = useState(false);

  // cadastra o produto com os dados da nota (o preço de venda sai pela aba Preços)
  async function cadastrarNovo() {
    const embalagem = unidadeDeEmbalagem(i.unidade);
    const fator = embalagem ? (l.fatorSugerido ?? 1) : 1;
    const custo = conta && conta.quantidade_erp > 0 ? Math.round((conta.custo_total / (i.quantidade * fator)) * 100) / 100 : 0;
    if (!(await confirmar(`Cadastrar "${i.descricao}" como produto novo (peça, ${embalagem ? "UN" : unidadeDoErp(i.unidade)}, custo ${brl(custo)})?`, { ok: "Cadastrar" }))) return;
    setCriando(true);
    try {
      const { data, error } = await supabase.from("produtos").insert({
        descricao: i.descricao, tipo: "peca", unidade: embalagem ? "UN" : unidadeDoErp(i.unidade), ncm: i.ncm, codigo_barras: i.ean,
        preco_custo: custo > 0 ? custo : 0,
      }).select("id").single();
      if (error) throw error;
      invalidate("produtos");
      d.mudarLinha(i.numero, { produto_id: data.id, origem: "manual", fator });
      onTrocar(false);
      notify("Produto cadastrado. Confira o preço de venda na aba Preços.");
    } catch (e) { notifyError(e); } finally { setCriando(false); }
  }
  const salvo = d.custosSalvos.get(i.numero);
  const variacao = conta && p ? variacaoPct(Number(p.preco_custo), conta.custo_unitario) : null;
  const unidadeErp = p?.unidade ?? "UN";
  return (
    <li className={`rounded-xl border p-3 ${l.produto_id ? "border-slate-200" : "border-dashed border-amber-300 bg-amber-50/40"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{i.descricao}</p>
          <p className="text-xs text-slate-500 [overflow-wrap:anywhere]">
            {[i.codigo && `Cód. ${i.codigo}`, i.ean && `EAN ${i.ean}`, i.ncm && `NCM ${i.ncm}`, i.cfop && `CFOP ${i.cfop}`].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-slate-600">{qtd(i.quantidade)} {i.unidade} × {r4(i.valor_unitario)} = <b>{brl(i.valor_produto)}</b></p>
        </div>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-600">item {i.numero}</span>
      </div>

      {/* Produto do ERP */}
      <div className="mt-2">
        {p && !trocando ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
            <Link2 size={15} className="shrink-0 text-modulo-texto" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <b className="text-fg [overflow-wrap:anywhere]">{p.descricao}</b>
              <span className="block text-xs text-slate-500">{[p.sku && `SKU ${p.sku}`, l.origem && ROTULO_ORIGEM[l.origem], l.mudou && "falta guardar"].filter(Boolean).join(" · ")}</span>
            </span>
            {podeEditar && <Button type="button" variant="ghost" className="!px-2" onClick={() => onTrocar(true)}><RefreshCw size={14} /> Trocar</Button>}
            {podeEditar && <Button type="button" variant="ghost" className="!px-2" aria-label="Tirar o produto (o item fica de fora da entrada)" title="Tirar o produto (o item fica de fora da entrada)"
              onClick={() => d.mudarLinha(i.numero, { produto_id: null, origem: null })}><X size={14} /></Button>}
          </div>
        ) : podeEditar ? (
          <div className="flex items-start gap-2">
            <ProdutoBusca className="min-w-0 flex-1" produtos={d.produtos.filter((x) => x.ativo && !x.unificado_em)} placeholder="Ligar a um produto: nome, SKU ou código de barras"
              detalhe={(x) => [x.sku, `custo ${brl(x.preco_custo)}`, x.unidade].filter(Boolean).join(" · ")}
              onEscolher={(x) => { d.mudarLinha(i.numero, { produto_id: x.id, origem: "manual" }); onTrocar(false); }} />
            {!trocando && <Button type="button" variant="ghost" className="shrink-0" disabled={criando} onClick={cadastrarNovo} title="Cadastrar como produto novo"><Plus size={15} /> Novo</Button>}
            {trocando && <Button type="button" variant="ghost" onClick={() => onTrocar(false)}>Voltar</Button>}
          </div>
        ) : <p className="text-sm text-slate-500">Sem produto ligado.</p>}
        {!p && !trocando && <p className="mt-1 text-xs text-amber-800">Sem produto: o item fica de fora da entrada (ex.: material de consumo).</p>}
      </div>

      {p && conta && (
        <>
          {/* Conversão de unidade */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">1 {i.unidade} =</span>
            <input className="input h-9 w-24 py-1 text-right" type="number" inputMode="decimal" min={0.0001} step="any" value={l.fator} disabled={!podeEditar}
              aria-label={`Quantas ${unidadeErp} vêm em 1 ${i.unidade}`} onChange={(e) => d.mudarLinha(i.numero, { fator: Number(e.target.value) > 0 ? Number(e.target.value) : 1 })} />
            <span className="text-slate-600">{unidadeErp}</span>
            {l.fatorSugerido && l.fatorSugerido !== l.fator && podeEditar && (
              <Button type="button" tamanho="mini" tom="fiscal"
                onClick={() => d.mudarLinha(i.numero, { fator: l.fatorSugerido! })}>usar {l.fatorSugerido} (pela descrição)</Button>
            )}
            <span className="ml-auto text-xs text-slate-600">entra <b className="text-fg">{qtd(conta.quantidade_erp)} {unidadeErp}</b></span>
          </div>

          {/* Custo atual × nota */}
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs sm:text-sm">
            <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 [overflow-wrap:anywhere]">
              <dt className="text-2xs font-semibold uppercase text-slate-500">Custo atual</dt>
              <dd className="font-bold tabular-nums">{Number(p.preco_custo) > 0 ? brl(p.preco_custo) : "sem custo"}</dd>
            </div>
            <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 [overflow-wrap:anywhere]">
              <dt className="text-2xs font-semibold uppercase text-slate-500">Pela nota</dt>
              <dd className="font-bold tabular-nums">{r4(conta.custo_unitario)}</dd>
            </div>
            <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 [overflow-wrap:anywhere]">
              <dt className="text-2xs font-semibold uppercase text-slate-500">Variação</dt>
              <dd className={`flex items-center gap-0.5 font-bold tabular-nums ${variacao == null ? "" : variacao > 0 ? "text-red-600" : variacao < 0 ? "text-emerald-700" : ""}`}>
                {variacao != null && variacao > 0 && <ArrowUp size={13} aria-hidden />}{variacao != null && variacao < 0 && <ArrowDown size={13} aria-hidden />}{pct(variacao)}
              </dd>
            </div>
          </dl>
          {salvo?.custo_aplicado && (
            <p className="mt-1 text-xs text-emerald-700">
              Custo {r4(salvo.custo_unitario)} aplicado por esta nota ({[salvo.aplicado_nome, new Date(salvo.aplicado_em).toLocaleDateString("pt-BR")].filter(Boolean).join(", ")}).
            </p>
          )}
          <ContaAberta c={conta} unidade={unidadeErp} descontar={!!d.opcoes?.descontarCreditos} />
        </>
      )}
    </li>
  );
}

/** A conta do custo, linha a linha. */
function ContaAberta({ c, unidade, descontar }: { c: ContaCusto; unidade: string; descontar: boolean }) {
  const linha = (rotulo: string, v: number, sinal: "+" | "−" | "=" = "+", forte = false) => (v === 0 && sinal !== "=" ? null : (
    <div className={`flex justify-between gap-3 ${forte ? "border-t border-slate-200 pt-1 font-semibold text-fg" : ""}`}>
      <dt>{sinal !== "=" && <span className="mr-1 inline-block w-3 text-slate-400">{sinal}</span>}{rotulo}</dt>
      <dd className="tabular-nums">{brl(v)}</dd>
    </div>
  ));
  return (
    <details className="mt-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-modulo-texto">Ver a conta</summary>
      <dl className="mt-1.5 space-y-0.5 text-slate-600">
        {linha("Valor dos produtos", c.valor_produto)}
        {linha("Frete", c.frete)}
        {linha("Seguro", c.seguro)}
        {linha("Outras despesas", c.outras)}
        {linha("Desconto", c.desconto, "−")}
        {linha("IPI", c.ipi)}
        {linha("ICMS-ST", c.icms_st)}
        {linha("Despesa extra", c.extra)}
        {linha("Custo cheio", c.custo_cheio, "=", true)}
        {descontar ? (
          <>
            {linha("Crédito de ICMS", c.creditos.icms, "−")}
            {linha("Crédito de IPI", c.creditos.ipi, "−")}
            {linha(`Crédito de PIS (${ALIQUOTA_PIS.toLocaleString("pt-BR")}% de ${brl(c.creditos.base_pis_cofins)})`, c.creditos.pis, "−")}
            {linha(`Crédito de COFINS (${ALIQUOTA_COFINS.toLocaleString("pt-BR")}%)`, c.creditos.cofins, "−")}
            {linha("Custo líquido", c.custo_total, "=", true)}
          </>
        ) : c.creditos.total > 0 && (
          <div className="flex justify-between gap-3 text-xs"><dt>Créditos estimados (não descontados)</dt><dd className="tabular-nums">{brl(c.creditos.total)}</dd></div>
        )}
        <div className="flex justify-between gap-3 text-xs">
          <dt>÷ {qtd(c.quantidade_erp)} {unidade}</dt>
          <dd className="font-semibold tabular-nums text-fg">{r4(c.custo_unitario)} por {unidade}</dd>
        </div>
      </dl>
    </details>
  );
}
