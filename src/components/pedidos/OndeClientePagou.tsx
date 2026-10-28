// "Onde o cliente pagou" no pedido (28/10, pedido da usuária): quanto o cliente pagou e onde — na conta da MF, direto a
// um fornecedor da MF (ex.: peças da Frigelar faturadas para a MF e pagas no cartão do cliente), na conta pessoal da
// sócia ou outro. Cada registro baixa a parte paga no pedido sem cobrança ao cliente e, quando foi ao fornecedor, dá a
// baixa da conta a pagar daquela nota (função registrar_pagamento_cliente). Só o financeiro. Regras em lib/pagamentosCliente.ts.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Undo2, Wallet } from "lucide-react";
import { Button, Carregando, chip, ErroLista, Field, Modal } from "@/components/ui";
import { pedirTexto } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { lerValor } from "@/lib/auditoriaBusca";
import { MEIOS } from "@/lib/formasPagamento";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { numeroDaChave, problemaPagamento, resumoPagamentos, TIPOS_PAGAMENTO, type TipoPagamento } from "@/lib/pagamentosCliente";

type PedidoBase = { id: string; numero: number; valor_total: number | string; notas?: { status: string; ambiente?: string | null; valor_total?: number | string | null }[] | null };
type Registro = {
  id: string; tipo: TipoPagamento; valor: number; data: string; forma: string | null; parcelas: number; observacao: string | null; excluido_em: string | null;
  nfe: { chave: string | null; emitente_nome: string | null } | null; fornecedor: { nome: string; nome_fantasia: string | null } | null; conta: { nome: string } | null;
};
type Parcela = { id: string; status: string; valor: number; valor_pago: number | null };

const KEY = "pedido_pagamentos";
/** o que muda quando um pagamento é registrado ou desfeito */
const CHAVES = [KEY, "contas_receber", "contas_pagar", "nfe_recebidas", "comissoes", "cobrancas_link", "auditoria", "pedidos", "pedido_ocorrencias", "extrato_lancamentos", "onde_pagou_notas"];
const nomeMeio = (m: string | null) => MEIOS.find(([v]) => v === m)?.[1] ?? m ?? "";

export function OndeClientePagou({ pedido }: { pedido: PedidoBase }) {
  const [novo, setNovo] = useState(false);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const invalidar = useInvalidate();
  const regs = useRows<Registro>(KEY, {
    select: "id, tipo, valor, data, forma, parcelas, observacao, excluido_em, nfe:nfe_recebidas(chave, emitente_nome), fornecedor:fornecedores(nome, nome_fantasia), conta:contas_bancarias(nome)",
    order: "data", ascending: true, key: [pedido.id], filtro: (q) => q.eq("pedido_id", pedido.id),
  });
  const parc = useRows<Parcela>("contas_receber", {
    select: "id, status, valor, valor_pago", key: ["onde_pagou", pedido.id], filtro: (q) => q.eq("pedido_id", pedido.id),
  });
  const registros = regs.data ?? [], parcelas = parc.data ?? [];
  const carregando = regs.isLoading || parc.isLoading;
  const erro = regs.error ?? parc.error;
  const r = resumoPagamentos({ totalPedido: Number(pedido.valor_total ?? 0), parcelas, registros, notas: pedido.notas ?? [] });
  const ativos = registros.filter((x) => !x.excluido_em);

  async function desfazer(x: Registro) {
    const motivo = await pedirTexto(`Desfazer o registro de ${brl(x.valor)} de ${dataBR(x.data)}? O valor volta a ficar em aberto no pedido e a conta do fornecedor volta como estava. Escreva o motivo:`, "", { titulo: "Desfazer", ok: "Desfazer", minimo: 3 });
    if (!motivo) return;
    setDesfazendo(x.id);
    try {
      const { error } = await supabase.rpc("desfazer_pagamento_cliente", { p_id: x.id, p_motivo: motivo });
      if (error) throw error;
      notify("Registro desfeito");
      invalidar(...CHAVES);
    } catch (e) { notifyError(e); } finally { setDesfazendo(null); }
  }

  const linha = (rotulo: string, v: number, cor = "text-fg") => v > 0 && (
    <div className="flex justify-between gap-2"><span className="text-slate-600">{rotulo}</span><b className={`num ${cor}`}>{brl(v)}</b></div>
  );

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-3 text-sm sm:p-4" aria-label="Onde o cliente pagou">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-bold text-fg"><Wallet size={16} className="text-modulo" aria-hidden /> Onde o cliente pagou</h3>
        <Button type="button" variant="secondary" onClick={() => setNovo(true)} disabled={carregando || r.emAberto <= 0}
          title={r.emAberto <= 0 ? "Nada em aberto neste pedido" : undefined}><Plus size={15} aria-hidden /> Registrar pagamento</Button>
      </div>

      {carregando ? <Carregando linhas={2} /> : erro ? <ErroLista erro={erro} onTentar={() => { regs.refetch(); parc.refetch(); }} /> : <>
      {r.semParcelas && <p className="text-amber-800">Este pedido ainda não tem contas a receber: lance as parcelas no financeiro para registrar onde o cliente pagou.</p>}
      <div className="grid gap-1 rounded-lg bg-slate-50 p-2.5 sm:grid-cols-2 sm:gap-x-6">
        {linha("Pedido", r.total)}
        {linha("Recebido (sem dizer onde)", r.recebidoSemLugar)}
        {linha("Na conta da MF", r.contaMf)}
        {linha("Direto a fornecedores", r.fornecedor)}
        {linha("Na conta da sócia", r.contaSocia)}
        {linha("Outro", r.outro)}
        {r.emAberto > 0 && linha("Falta identificar ou receber", r.emAberto, "text-amber-800")}
        {r.quitado && <p className="font-semibold text-emerald-700">Pedido todo pago</p>}
      </div>

      {r.nfMenor && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>As NF-e deste pedido somam <b className="num">{brl(r.nf)}</b> e o pedido é de <b className="num">{brl(r.total)}</b>. Se não for entrega parcial (o restante sai em outra NF-e), a nota precisa mostrar o valor real da venda: confira com o contador.</span>
        </p>
      )}

      {ativos.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {ativos.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="num w-20 shrink-0 text-slate-500">{dataBR(x.data)}</span>
              <span className="min-w-0 flex-1">
                <b className="text-fg">{TIPOS_PAGAMENTO[x.tipo].rotulo}</b>
                {x.tipo === "fornecedor" && <> · {x.nfe?.emitente_nome ?? x.fornecedor?.nome_fantasia ?? x.fornecedor?.nome}{x.nfe?.chave ? `, NF ${numeroDaChave(x.nfe.chave)}` : ""}</>}
                {x.conta?.nome && <> · {x.conta.nome}</>}
                {x.forma && <span className="text-slate-500"> · {nomeMeio(x.forma)}{x.parcelas > 1 ? ` em ${x.parcelas}x` : ""}</span>}
                {x.observacao && <span className="block text-xs text-slate-500">{x.observacao}</span>}
              </span>
              <b className="num">{brl(x.valor)}</b>
              <Button type="button" variant="ghost" tamanho="mini" carregando={desfazendo === x.id} onClick={() => desfazer(x)} aria-label={`Desfazer o registro de ${brl(x.valor)}`}><Undo2 size={13} aria-hidden /> Desfazer</Button>
            </li>
          ))}
        </ul>
      )}

      </>}
      {novo && <NovoPagamento pedido={pedido} emAberto={r.emAberto} onClose={() => setNovo(false)} />}
    </section>
  );
}

type NotaForn = { id: string; chave: string | null; emitente_nome: string | null; data_emissao: string; valor_total: number | null };
type Lanc = { id: string; data: string; descricao: string | null; valor: number; conta_bancaria_id: string };

function NovoPagamento({ pedido, emAberto, onClose }: { pedido: PedidoBase; emAberto: number; onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoPagamento>("fornecedor");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [forma, setForma] = useState("cartao");
  const [parcelas, setParcelas] = useState("1");
  const [busca, setBusca] = useState("");
  const [notaId, setNotaId] = useState("");
  const [contaId, setContaId] = useState("");
  const [lancId, setLancId] = useState("");
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();

  // notas de fornecedor dos últimos 18 meses e o saldo sem pagamento (pago pela MF ou por clientes)
  const notasQ = useQuery({
    queryKey: ["onde_pagou_notas"], enabled: tipo === "fornecedor",
    queryFn: async () => {
      const desde = new Date(Date.now() - 540 * 864e5).toISOString().slice(0, 10);
      const [{ data: n, error }, { data: pagos, error: e2 }] = await Promise.all([
        supabase.from("nfe_recebidas").select("id, chave, emitente_nome, data_emissao, valor_total").is("excluida_em", null)
          .neq("finalidade", "devolucao").gte("data_emissao", desde).order("data_emissao", { ascending: false }).limit(1000),
        supabase.from("contas_pagar").select("nfe_recebida_id, valor, nfe:nfe_recebidas!contas_pagar_nfe_fk!inner(data_emissao)").eq("status", "pago")
          .gte("nfe.data_emissao", desde),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const ja = new Map<string, number>();
      for (const p of pagos ?? []) ja.set(p.nfe_recebida_id as string, (ja.get(p.nfe_recebida_id as string) ?? 0) + Number(p.valor));
      return ((n ?? []) as NotaForn[]).map((x) => ({ ...x, saldo: Math.round((Number(x.valor_total ?? 0) - (ja.get(x.id) ?? 0)) * 100) / 100 }));
    },
  });
  const notas = notasQ.data ?? [];
  const { data: contas = [] } = useRows<{ id: string; nome: string; ativo: boolean }>("contas_bancarias", { select: "id, nome, ativo", order: "nome", ascending: true, enabled: tipo === "conta_mf" });
  const { data: lancs = [] } = useRows<Lanc>("extrato_lancamentos", {
    select: "id, data, descricao, valor, conta_bancaria_id", order: "data", ascending: false, key: ["onde_pagou", contaId],
    enabled: tipo === "conta_mf" && !!contaId, filtro: (q) => q.eq("conta_bancaria_id", contaId).eq("status", "pendente").gt("valor", 0),
  });

  const t = busca.trim().toLowerCase();
  const notasVis = useMemo(() => notas.filter((x) => x.saldo > 0.004 && (!t || `${x.emitente_nome} ${numeroDaChave(x.chave)}`.toLowerCase().includes(t))).slice(0, 30), [notas, t]);
  const nota = notas.find((x) => x.id === notaId);
  const v = lerValor(valor);
  const nParcelas = forma === "cartao" ? Number(parcelas) : 1;
  const problema = problemaPagamento(v, emAberto, { tipo, temFornecedor: !!notaId, saldoNota: nota ? nota.saldo : null, data, hoje: hoje(), parcelas: nParcelas });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (problema) return notify(problema, "erro");
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("registrar_pagamento_cliente", {
        p_pedido: pedido.id, p_tipo: tipo, p_valor: v, p_data: data, p_forma: forma || null, p_parcelas: Math.trunc(nParcelas),
        p_nfe_recebida: tipo === "fornecedor" ? notaId || null : null,
        p_conta_bancaria: tipo === "conta_mf" ? contaId || null : null, p_extrato: tipo === "conta_mf" ? lancId || null : null,
        p_observacao: obs.trim() || null,
      });
      if (error) throw error;
      notify(`${brl(v)} registrado: ${TIPOS_PAGAMENTO[tipo].rotulo.toLowerCase()}`);
      invalidar(...CHAVES);
      onClose();
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Onde o cliente pagou · pedido #${pedido.numero}`} wide sujo={!!valor || !!obs}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Onde foi pago">
          {(Object.keys(TIPOS_PAGAMENTO) as TipoPagamento[]).map((k) => (
            <button key={k} type="button" className={chip(tipo === k)} onClick={() => setTipo(k)} aria-pressed={tipo === k}>{TIPOS_PAGAMENTO[k].rotulo}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{TIPOS_PAGAMENTO[tipo].dica}. Em aberto no pedido: <b className="num">{brl(emAberto)}</b>.</p>

        {tipo === "fornecedor" && (
          <div className="space-y-1.5">
            <Field label="Nota do fornecedor (em nome da MF)" obrigatorio dica='A nota ainda não está no ERP? Registre como "Outro" e explique na observação.'>
              <input className="input" placeholder="Busque pelo fornecedor ou pelo número da nota" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </Field>
            {notasQ.isLoading ? <Carregando linhas={3} /> : notasQ.error ? <ErroLista erro={notasQ.error} onTentar={() => notasQ.refetch()} /> : (
              <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200" aria-label="Notas do fornecedor">
                {!notasVis.length && <li className="p-3 text-slate-500">Nenhuma nota com saldo{t ? " para essa busca" : ""}. As notas já pagas pela MF não aparecem.</li>}
                {notasVis.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => { setNotaId(x.id); if (!valor) setValor(String(Math.min(x.saldo, emAberto)).replace(".", ",")); }}
                      className={`linha-clicavel flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left ${notaId === x.id ? "bg-modulo/10" : ""}`} aria-pressed={notaId === x.id}>
                      <span className="min-w-0 flex-1"><b className="text-fg">{x.emitente_nome}</b> · NF {numeroDaChave(x.chave)} · {dataBR(x.data_emissao)}</span>
                      <span className="num">{brl(x.valor_total)}{x.saldo < Number(x.valor_total ?? 0) - 0.004 && <span className="text-slate-500"> (sem pagamento {brl(x.saldo)})</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tipo === "conta_mf" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Conta da MF">
              <select className="input" value={contaId} onChange={(e) => { setContaId(e.target.value); setLancId(""); }}>
                <option value="">Escolha…</option>
                {contas.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label="Entrada no extrato (opcional)" dica="Liga o registro ao lançamento do banco.">
              <select className="input" value={lancId} disabled={!contaId} onChange={(e) => {
                setLancId(e.target.value);
                const l = lancs.find((x) => x.id === e.target.value);
                if (l) { setValor(String(l.valor).replace(".", ",")); setData(l.data); }
              }}>
                <option value="">Sem ligar ao extrato</option>
                {lancs.slice(0, 200).map((l) => <option key={l.id} value={l.id}>{dataBR(l.data)} · {brl(l.valor)} · {(l.descricao ?? "").slice(0, 50)}</option>)}
              </select>
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Valor (R$)" obrigatorio erro={valor ? problema ?? undefined : undefined}><input className="input text-right" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
          <Field label="Data"><input className="input" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} /></Field>
          <Field label="Como pagou">
            <select className="input" value={forma} onChange={(e) => setForma(e.target.value)}>
              {MEIOS.filter(([m]) => ["pix", "cartao", "boleto", "transferencia", "dinheiro", "outro"].includes(m)).map(([m, n]) => <option key={m} value={m}>{n}</option>)}
            </select>
          </Field>
          {forma === "cartao" && <Field label="Parcelas"><input className="input text-right" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></Field>}
        </div>
        <Field label="Observação"><input className="input" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: cartão do cliente na Frigelar, vendedor fulano" /></Field>
        {tipo === "conta_socia" && <p className="text-xs text-amber-800">Dinheiro da venda na conta pessoal: fica registrado aqui e precisa entrar no encontro de contas da sócia com a empresa (Retaguarda → Pessoal).</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button carregando={ocupado} disabled={!!problema}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}
