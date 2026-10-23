// OC - Ordem de Compra com os campos do Tiny: dados do pedido (data, nº no fornecedor, categoria), totais (produtos,
// IPI, ICMS ST, frete, outras despesas e desconto), pagamento com parcelas, transporte e observações (a do fornecedor e a
// interna). As parcelas viram as contas a pagar no "Lançar no contas a pagar" (lancar_oc_contas_pagar) ou, se ainda não
// lançou, quando a mercadoria chega (receber_pedido_compra).
import { CalendarClock, Plus, Trash2, Truck, Wallet } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { rotuloCategoria } from "@/lib/dre";
import {
  FRETE_POR_CONTA, parcelasPorPrazos, prazosDaCondicao, prazosDaForma, sobraParcelas, type ParcelaOc, type TotaisOc,
} from "@/lib/ordemCompra";
import type { ItemCompra, PedidoCompra } from "@/lib/types";

export type OcEdit = Partial<PedidoCompra> & { itens: ItemCompra[] };
type Forma = { id: string; nome: string; uso: string; ativo: boolean; parcelas: number | null; intervalo_dias: number | null; primeiro_em_dias: number | null };
type Props = { p: OcEdit; set: (x: Partial<OcEdit>) => void; editavel: boolean; totais?: TotaisOc };

const numero = (v: string) => (v === "" ? 0 : Math.max(0, Number(v)));

/** Data, entrega prevista, nº do pedido no fornecedor e categoria da despesa. */
export function DadosOc({ p, set, editavel }: Props) {
  const { data: cats = [] } = useRows<{ id: string; nome: string; tipo: string; ativo: boolean }>("categorias_financeiras", { order: "ordem", ascending: true });
  const despesas = cats.filter((c) => c.tipo === "despesa" && (c.ativo || c.nome === p.categoria));
  return (
    <>
      <Field label="Data da OC"><input className="input" type="date" value={p.data ?? (p.created_at ? p.created_at.slice(0, 10) : hoje())} disabled={!editavel}
        onChange={(e) => set({ data: e.target.value || null })} /></Field>
      <Field label="Entrega prevista"><input className="input" type="date" value={p.previsao_entrega ?? ""} disabled={!editavel} onChange={(e) => set({ previsao_entrega: e.target.value || null })} /></Field>
      <Field label="Nº no fornecedor"><input className="input" value={p.numero_fornecedor ?? ""} maxLength={60} disabled={!editavel} placeholder="pedido ou orçamento dele"
        onChange={(e) => set({ numero_fornecedor: e.target.value || null })} /></Field>
      <Field label="Categoria (plano de contas)">
        <select className="input" value={p.categoria ?? ""} disabled={!editavel} onChange={(e) => set({ categoria: e.target.value || null })}>
          <option value="">Fornecedores (padrão)</option>
          {despesas.map((c) => <option key={c.id} value={c.nome}>{rotuloCategoria(c.nome)}</option>)}
        </select>
      </Field>
    </>
  );
}

/** Totais como no Tiny: produtos, IPI, ICMS ST, frete, outras despesas, desconto e o total da OC. */
export function TotaisDaOc({ p, set, editavel, totais }: Props & { totais: TotaisOc }) {
  const linha = (rotulo: string, valor: number, sinal = "") => (
    <div className="flex justify-between gap-3"><dt className="text-slate-600">{rotulo}</dt><dd className="num font-semibold text-fg">{sinal}{brl(valor)}</dd></div>
  );
  const campo = (rotulo: string, k: "frete" | "outras_despesas" | "desconto") => (
    <Field label={rotulo}><input className="input text-right" type="number" inputMode="decimal" min={0} step="0.01" value={p[k] ?? 0} disabled={!editavel}
      onChange={(e) => set({ [k]: numero(e.target.value) } as Partial<OcEdit>)} /></Field>
  );
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_16rem] sm:p-4">
      <div className="grid grid-cols-3 gap-2 self-start">
        {campo("Frete (R$)", "frete")}
        {campo("Outras despesas (R$)", "outras_despesas")}
        {campo("Desconto (R$)", "desconto")}
      </div>
      <dl className="space-y-1 text-sm">
        {linha("Produtos", totais.produtos)}
        {totais.ipi > 0 && linha("IPI", totais.ipi, "+ ")}
        {totais.st > 0 && linha("ICMS ST", totais.st, "+ ")}
        {totais.frete > 0 && linha("Frete", totais.frete, "+ ")}
        {totais.outras > 0 && linha("Outras despesas", totais.outras, "+ ")}
        {totais.desconto > 0 && linha("Desconto", totais.desconto, "− ")}
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5"><dt className="font-bold text-fg">Total da OC</dt><dd className="num text-lg font-bold text-fg">{brl(totais.total)}</dd></div>
      </dl>
    </div>
  );
}

/** Forma de pagamento, condição e parcelas (vencimento, valor e observação), como no Tiny. */
export function PagamentoOc({ p, set, editavel, totais }: Props & { totais: TotaisOc }) {
  const { data: formasTodas = [] } = useRows<Forma>("formas_pagamento", { order: "ordem", ascending: true });
  const formas = formasTodas.filter((f) => (f.ativo && f.uso !== "receber") || f.id === p.forma_pagamento_id);
  const forma = formas.find((f) => f.id === p.forma_pagamento_id);
  const parcelas = p.parcelas ?? [];
  const sobra = sobraParcelas(parcelas, totais.total);
  const base = p.data ?? hoje();
  const prazos = prazosDaCondicao(p.condicao_pagamento).length ? prazosDaCondicao(p.condicao_pagamento) : prazosDaForma(forma);
  const mudar = (lista: ParcelaOc[]) => set({ parcelas: lista.length ? lista : null });
  const muda = (k: number, patch: Partial<ParcelaOc>) => mudar(parcelas.map((x, j) => (j === k ? { ...x, ...patch } : x)));

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4" aria-labelledby="oc-pagamento">
      <h3 id="oc-pagamento" className="flex items-center gap-1.5 font-bold text-fg"><Wallet size={16} aria-hidden /> Pagamento</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Forma de pagamento">
          <select className="input" value={p.forma_pagamento_id ?? ""} disabled={!editavel} onChange={(e) => set({ forma_pagamento_id: e.target.value || null })}>
            <option value="">Não informada</option>
            {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Field>
        <Field label="Condição de pagamento"><input className="input" placeholder="ex.: 30/60/90 ou 28 dias boleto" value={p.condicao_pagamento ?? ""} disabled={!editavel}
          onChange={(e) => set({ condicao_pagamento: e.target.value || null })} /></Field>
      </div>
      {parcelas.length > 0 && (
        <div className="min-w-0">
          {/* no celular cada parcela ocupa duas linhas: vencimento em cima; valor e observação embaixo */}
          <div role="list" aria-label="Parcelas da OC" className="grid gap-2 text-sm">
            <div aria-hidden className="hidden gap-2 text-xs font-semibold text-slate-500 sm:grid sm:grid-cols-[1.5rem_10rem_8rem_minmax(0,1fr)_2rem]">
              <span>#</span><span>Vencimento</span><span className="text-right">Valor</span><span>Observação</span><span />
            </div>
            {parcelas.map((x, k) => (
              <div role="listitem" key={k} className="grid grid-cols-[1.25rem_7rem_minmax(0,1fr)_2rem] items-center gap-2 border-b border-slate-100 pb-2 last:border-0 sm:grid-cols-[1.5rem_10rem_8rem_minmax(0,1fr)_2rem] sm:border-0 sm:pb-0">
                <span className="text-slate-500">{k + 1}</span>
                <input className="input col-span-2 col-start-2 row-start-1 min-w-0 py-1.5 sm:col-span-1 sm:col-start-auto sm:row-start-auto" type="date" value={x.vencimento} disabled={!editavel}
                  aria-label={`Vencimento da parcela ${k + 1}`} onChange={(e) => muda(k, { vencimento: e.target.value })} />
                <input className="input col-start-2 row-start-2 min-w-0 py-1.5 text-right sm:col-start-auto sm:row-start-auto" type="number" inputMode="decimal" min={0} step="0.01" value={x.valor}
                  disabled={!editavel} aria-label={`Valor da parcela ${k + 1}`} onChange={(e) => muda(k, { valor: numero(e.target.value) })} />
                <input className="input col-span-2 col-start-3 row-start-2 min-w-0 py-1.5 sm:col-span-1 sm:col-start-auto sm:row-start-auto" placeholder="Observação" value={x.observacao ?? ""}
                  maxLength={120} disabled={!editavel} aria-label={`Observação da parcela ${k + 1}`} onChange={(e) => muda(k, { observacao: e.target.value || null })} />
                <span className="col-start-4 row-start-1 sm:col-start-auto sm:row-start-auto">
                  {editavel && <button type="button" className="botao-icone-perigo p-1" aria-label={`Tirar a parcela ${k + 1}`}
                    onClick={() => mudar(parcelas.filter((_, j) => j !== k))}><Trash2 size={15} /></button>}
                </span>
              </div>
            ))}
          </div>
          <p className={`mt-1 text-xs font-semibold ${sobra === 0 ? "text-emerald-700" : "text-amber-700"}`}>
            {sobra === 0 ? "As parcelas fecham com o total da OC." : `As parcelas somam ${brl(totais.total - sobra)}: ${sobra > 0 ? "faltam" : "sobram"} ${brl(Math.abs(sobra))} para o total (${brl(totais.total)}). No recebimento a última parcela acerta a diferença.`}
          </p>
        </div>
      )}
      {editavel && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!prazos.length || !(totais.total > 0)} onClick={() => mudar(parcelasPorPrazos(totais.total, prazos, base))}
            title={prazos.length ? `Prazos: ${prazos.join(", ")} dias a partir de ${dataBR(base)}` : "Escreva a condição (ex.: 30/60/90) ou escolha uma forma de pagamento com parcelas"}>
            <CalendarClock size={15} /> {parcelas.length ? "Gerar de novo" : "Gerar parcelas"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => mudar([...parcelas, { vencimento: parcelas[parcelas.length - 1]?.vencimento ?? base, valor: Math.max(0, sobra) }])}>
            <Plus size={15} /> Parcela
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">Depois de mandar a OC, toque em <b>Lançar no contas a pagar</b> (embaixo): cada parcela vira uma conta, ligada a esta OC. Se não lançar antes, as contas saem quando a mercadoria chegar.</p>
    </section>
  );
}

/** Transportadora e frete por conta de quem (modalidade da NF-e). */
export function TransporteOc({ p, set, editavel }: Props) {
  const { data: transportadoras = [] } = useRows<{ id: string; nome: string; ativo: boolean }>("transportadoras", { order: "nome", ascending: true });
  const lista = transportadoras.filter((t) => t.ativo !== false || t.id === p.transportadora_id);
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4" aria-labelledby="oc-transporte">
      <h3 id="oc-transporte" className="flex items-center gap-1.5 font-bold text-fg"><Truck size={16} aria-hidden /> Transporte</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Transportadora">
          <select className="input" value={p.transportadora_id ?? ""} disabled={!editavel} onChange={(e) => set({ transportadora_id: e.target.value || null })}>
            <option value="">Não informada</option>
            {lista.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Field>
        <Field label="Frete por conta de">
          <select className="input" value={p.frete_por_conta ?? ""} disabled={!editavel} onChange={(e) => set({ frete_por_conta: e.target.value || null })}>
            <option value="">Não informado</option>
            {FRETE_POR_CONTA.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
      </div>
    </section>
  );
}

/** Observações para o fornecedor (vão no PDF e no WhatsApp) e observações internas (só no ERP). */
export function ObservacoesOc({ p, set, editavel }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Observações (vão para o fornecedor)"><textarea className="input min-h-[4.5rem]" value={p.observacoes ?? ""} disabled={!editavel} maxLength={2000}
        onChange={(e) => set({ observacoes: e.target.value || null })} /></Field>
      <Field label="Observações internas (só no ERP)"><textarea className="input min-h-[4.5rem]" value={p.observacoes_internas ?? ""} maxLength={2000}
        onChange={(e) => set({ observacoes_internas: e.target.value || null })} /></Field>
    </div>
  );
}
