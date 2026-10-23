// Contas do mês (aba Dinheiro do painel pessoal): as contas que voltam todo mês, como o DAS de um MEI. Cada mês
// aparece com o prazo; "Marcar pago" guarda a data, o valor, o comprovante e, se saiu de uma conta do painel, o
// lançamento nela. AlertaContasDoMes avisa no meio da tela (uma vez por dia) quando alguma está atrasada ou vencendo.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, Paperclip, Pencil, Plus, Repeat, Undo2 } from "lucide-react";
import { Button, Card, Field, Modal, nomeMes } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { lerValor } from "@/lib/auditoriaBusca";
import type { ContaPessoal } from "@/lib/pessoal";
import { contasDoMes, paraAvisar, somarMes, textoPrazo, vencimentoDe, type ContaMensal, type ItemDoMes, type PagoMensal, type Situacao } from "@/lib/contasDoMes";

const COR: Record<Situacao, string> = {
  atrasado: "bg-red-100 text-red-800", vencendo: "bg-amber-100 text-amber-800", em_dia: "bg-slate-100 text-slate-600", pago: "bg-emerald-100 text-emerald-800",
};
const rotuloMes = (c: ContaMensal, mes: string) => (c.mes_anterior ? `de ${nomeMes(mes)}` : nomeMes(mes));

function usarContasDoMes() {
  const { data: contas = [] } = useRows<ContaMensal>("pessoal_mensais", { order: "ordem", ascending: true });
  const { data: pagos = [] } = useRows<PagoMensal>("pessoal_mensais_pagos", { order: "mes", ascending: false });
  return { contas, pagos, itens: contasDoMes(contas, pagos, hoje()) };
}

export function ContasDoMes({ contasBanco, onVerComprovante }: { contasBanco: ContaPessoal[]; onVerComprovante: (c: string) => void }) {
  const invalidar = useInvalidate();
  const { contas, itens } = usarContasDoMes();
  const [pagar, setPagar] = useState<ItemDoMes | null>(null);
  const [editar, setEditar] = useState<Partial<ContaMensal> | null>(null);
  const [verPagos, setVerPagos] = useState(false);
  const abertos = itens.filter((i) => i.situacao !== "pago");
  const pagos = itens.filter((i) => i.situacao === "pago");
  // conta com tudo pago: mostra o próximo mês
  const proximas = contas.filter((c) => c.ativa && !abertos.some((i) => i.conta.id === c.id)).map((c) => {
    const ultimoPago = itens.filter((i) => i.conta.id === c.id).reduce((m, i) => (i.mes > m ? i.mes : m), "");
    const mes = ultimoPago ? somarMes(ultimoPago, 1) : (c.mes_anterior ? somarMes(hoje().slice(0, 7), -1) : hoje().slice(0, 7));
    return { conta: c, mes, vencimento: vencimentoDe(c, mes) };
  });

  async function desfazer(p: PagoMensal) {
    if (!(await confirmar("Desfazer este pagamento? O lançamento na conta (se houver) fica anulado.", { ok: "Desfazer" }))) return;
    const { error } = await supabase.from("pessoal_mensais_pagos").update({ anulado: true }).eq("id", p.id);
    if (error) return notifyError(error);
    if (p.lancamento_id) {
      const { error: e2 } = await supabase.from("pessoal_lancamentos").update({ anulado: true }).eq("id", p.lancamento_id);
      if (e2) notifyError(new Error("O pagamento foi desfeito, mas o lançamento na conta não foi anulado: anule-o na lista de lançamentos."));
    }
    notify("Pagamento desfeito");
    invalidar("pessoal_mensais_pagos", "pessoal_lancamentos");
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="mr-auto min-w-0 flex-1 basis-60">
          <h2 className="flex items-center gap-2 font-bold text-fg"><Repeat size={18} className="text-violet-700" aria-hidden /> Contas do mês</h2>
          <p className="text-xs text-slate-500">As que voltam todo mês (ex.: o DAS do MEI). Marque como pago e guarde o comprovante; o ERP avisa antes de vencer.</p>
        </div>
        <Button variant="secondary" onClick={() => setEditar({ dia_vencimento: 20, mes_anterior: true, avisar_dias: 5, ativa: true, ordem: contas.length })}><Plus size={15} /> Nova conta do mês</Button>
      </div>
      {!contas.length ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Nenhuma ainda. Toque em "Nova conta do mês" e cadastre o DAS (vence no dia 20, se refere ao mês anterior).</p> : (
        <ul className="divide-y divide-slate-100">
          {abertos.map((i) => (
            <li key={`${i.conta.id}-${i.mes}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block font-semibold text-fg">{i.conta.nome} <span className="font-normal text-slate-500">{rotuloMes(i.conta, i.mes)}</span></span>
                <span className="text-xs text-slate-500">vence {dataBR(i.vencimento)}{i.conta.valor ? ` · ${brl(i.conta.valor)}` : ""}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${COR[i.situacao]}`}>{textoPrazo(i)}</span>
              <Button onClick={() => setPagar(i)}><Check size={15} /> Marcar pago</Button>
            </li>
          ))}
          {proximas.map((p) => (
            <li key={`prox-${p.conta.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block font-semibold text-fg">{p.conta.nome} <span className="font-normal text-slate-500">{rotuloMes(p.conta, p.mes)}</span></span>
                <span className="text-xs text-slate-500">próximo · vence {dataBR(p.vencimento)}</span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">em dia</span>
            </li>
          ))}
        </ul>
      )}
      {contas.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {pagos.length > 0 && <button type="button" className="link-discreto" aria-expanded={verPagos} onClick={() => setVerPagos(!verPagos)}>{verPagos ? "Esconder os pagos" : `Ver os pagos (${pagos.length})`}</button>}
          {contas.map((c) => (
            <button key={c.id} type="button" className={`link-discreto inline-flex items-center gap-1 ${c.ativa ? "" : "line-through"}`} onClick={() => setEditar(c)}><Pencil size={12} aria-hidden /> {c.nome}</button>
          ))}
        </div>
      )}
      {verPagos && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {pagos.map((i) => (
            <li key={i.pago!.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 basis-40"><b className="text-fg">{i.conta.nome}</b> {rotuloMes(i.conta, i.mes)} · pago em {dataBR(i.pago!.pago_em)}</span>
              {i.pago!.valor != null && <span className="num font-semibold text-fg">{brl(i.pago!.valor)}</span>}
              {i.pago!.comprovante
                ? <button type="button" className="botao-mini botao-mini-neutro" onClick={() => onVerComprovante(i.pago!.comprovante!)}><Paperclip size={11} aria-hidden /> comprovante</button>
                : <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">sem comprovante</span>}
              <button type="button" className="botao-icone h-7 w-7" onClick={() => desfazer(i.pago!)} aria-label={`Desfazer o pagamento de ${i.conta.nome}`}><Undo2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      {pagar && <PagarModal item={pagar} contasBanco={contasBanco} onClose={() => setPagar(null)} onFeito={() => { setPagar(null); invalidar("pessoal_mensais_pagos", "pessoal_lancamentos"); }} />}
      {editar && <ContaMensalModal conta={editar} contasBanco={contasBanco} onClose={() => setEditar(null)} onFeito={() => { setEditar(null); invalidar("pessoal_mensais"); }} />}
    </Card>
  );
}

function PagarModal({ item, contasBanco, onClose, onFeito }: { item: ItemDoMes; contasBanco: ContaPessoal[]; onClose: () => void; onFeito: () => void }) {
  const { user_id } = usePerfil();
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState(item.conta.valor ? Number(item.conta.valor).toFixed(2).replace(".", ",") : "");
  const [conta, setConta] = useState(item.conta.conta_id ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = lerValor(valor) || null;
    if (conta && !v) return notify("Informe o valor para lançar na conta", "erro");
    setGravando(true);
    let caminho: string | null = null;
    let lancamento: string | null = null;
    try {
      if (arquivo) {
        if (arquivo.size > 10 * 1024 * 1024) throw new Error("O comprovante passa de 10 MB");
        const limpo = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-60);
        caminho = `${user_id}/${crypto.randomUUID()}-${limpo}`;
        const { error } = await supabase.storage.from("pessoal").upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream" });
        if (error) throw error;
      }
      if (conta && v) {
        const { data: l, error } = await supabase.from("pessoal_lancamentos").insert({
          conta_id: conta, data, descricao: `${item.conta.nome} ${rotuloMes(item.conta, item.mes)}`.slice(0, 200), valor: -Math.abs(v),
          categoria: "Impostos e taxas", situacao: "realizado", comprovante: caminho,
        }).select("id").single();
        if (error) throw error;
        lancamento = l.id;
      }
      const { error } = await supabase.from("pessoal_mensais_pagos").insert({ mensal_id: item.conta.id, mes: item.mes, pago_em: data, valor: v, comprovante: caminho, lancamento_id: lancamento });
      if (error) throw error;
      notify(`${item.conta.nome} ${rotuloMes(item.conta, item.mes)}: pago`);
      onFeito();
    } catch (err) {
      if (lancamento) await supabase.from("pessoal_lancamentos").update({ anulado: true }).eq("id", lancamento);
      if (caminho && !lancamento) await supabase.storage.from("pessoal").remove([caminho]);
      notifyError(/duplicate|unique/i.test(String((err as Error)?.message)) ? new Error("Esse mês já está como pago.") : err);
    } finally { setGravando(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Pagar ${item.conta.nome} ${rotuloMes(item.conta, item.mes)}`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">Vence {dataBR(item.vencimento)} · {textoPrazo(item)}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pago em"><input className="input" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} required /></Field>
          <Field label="Valor pago"><input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></Field>
        </div>
        <Field label="Saiu de qual conta?" dica="Escolhendo uma conta, o pagamento entra nos lançamentos dela.">
          <select className="input" value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Não saiu das minhas contas do painel</option>
            {contasBanco.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Comprovante (foto ou PDF)"><input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={gravando}><Check size={15} /> Marcar pago</Button></div>
      </form>
    </Modal>
  );
}

function ContaMensalModal({ conta, contasBanco, onClose, onFeito }: { conta: Partial<ContaMensal>; contasBanco: ContaPessoal[]; onClose: () => void; onFeito: () => void }) {
  const [f, setF] = useState({
    nome: conta.nome ?? "", dia: String(conta.dia_vencimento ?? 20), mes_anterior: conta.mes_anterior ?? true, valor: conta.valor ? Number(conta.valor).toFixed(2).replace(".", ",") : "",
    conta_id: conta.conta_id ?? "", avisar: String(conta.avisar_dias ?? 5), desde: conta.desde ?? "", observacao: conta.observacao ?? "", ativa: conta.ativa ?? true,
  });
  const [gravando, setGravando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const linha = {
      nome: f.nome.trim(), dia_vencimento: Math.min(31, Math.max(1, Number(f.dia) || 20)), mes_anterior: f.mes_anterior, valor: lerValor(f.valor) || null,
      conta_id: f.conta_id || null, avisar_dias: Math.min(30, Math.max(0, Number(f.avisar) || 0)), desde: f.desde || null, observacao: f.observacao.trim() || null, ativa: f.ativa,
    };
    if (linha.nome.length < 2) return notify("Dê um nome para a conta", "erro");
    setGravando(true);
    const { error } = conta.id ? await supabase.from("pessoal_mensais").update(linha).eq("id", conta.id) : await supabase.from("pessoal_mensais").insert({ ...linha, ordem: conta.ordem ?? 0 });
    setGravando(false);
    if (error) return notifyError(error);
    notify(conta.id ? "Conta alterada" : "Conta do mês criada");
    onFeito();
  }
  return (
    <Modal open onClose={onClose} title={conta.id ? `Editar ${conta.nome}` : "Nova conta do mês"}>
      <form onSubmit={salvar} className="space-y-3">
        <Field label="Nome"><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={120} placeholder="DAS do MEI" required autoFocus /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Vence no dia"><input className="input" type="number" min={1} max={31} value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} /></Field>
          <Field label="Valor de sempre"><input className="input" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="opcional" /></Field>
          <Field label="Avisar quantos dias antes"><input className="input" type="number" min={0} max={30} value={f.avisar} onChange={(e) => setF({ ...f, avisar: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mes_anterior} onChange={(e) => setF({ ...f, mes_anterior: e.target.checked })} /> Se refere ao mês anterior (como o DAS: o de setembro vence em outubro)</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Sai de qual conta (sugestão)">
            <select className="input" value={f.conta_id} onChange={(e) => setF({ ...f, conta_id: e.target.value })}>
              <option value="">Nenhuma</option>
              {contasBanco.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Acompanhar desde (mês)" dica="O primeiro mês que ainda precisa conferir."><input className="input" type="month" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Field>
        </div>
        <Field label="Observação"><input className="input" value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} maxLength={300} /></Field>
        {conta.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} /> Ativa (desligue quando a conta acabar)</label>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={gravando}>Salvar</Button></div>
      </form>
    </Modal>
  );
}

/** Aviso no meio da tela, uma vez por dia, quando uma conta do mês está atrasada ou vencendo (só a conta master). */
export function AlertaContasDoMes() {
  const { itens } = usarContasDoMes();
  const navigate = useNavigate();
  const chave = `mf-erp-alerta-contas-do-mes-${hoje()}`;
  const [fechado, setFechado] = useState(() => { try { return localStorage.getItem(chave) === "1"; } catch { return false; } });
  const avisar = paraAvisar(itens);
  if (fechado || !avisar.length) return null;
  const fechar = () => { try { localStorage.setItem(chave, "1"); } catch { /* sem armazenamento: volta a avisar */ } setFechado(true); };
  const atrasadas = avisar.filter((i) => i.situacao === "atrasado").length;
  return (
    <Modal open onClose={fechar} title={atrasadas ? "Conta do mês atrasada" : "Conta do mês vencendo"}>
      <p className="mb-3 text-sm text-slate-600">{atrasadas ? `${atrasadas} ${pl(atrasadas, "conta atrasada", "contas atrasadas")}. ` : ""}Pague e marque como pago no painel pessoal, com o comprovante.</p>
      <ul className="mb-4 space-y-1.5">
        {avisar.slice(0, 6).map((i) => (
          <li key={`${i.conta.id}-${i.mes}`} className={`flex flex-wrap items-center gap-x-2 rounded-lg px-2 py-1.5 text-sm ${COR[i.situacao]}`}>
            <b className="min-w-0 flex-1">{i.conta.nome} {rotuloMes(i.conta, i.mes)}</b>
            <span className="text-xs font-semibold">{textoPrazo(i)} ({dataBR(i.vencimento).slice(0, 5)})</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={fechar}>Lembrar amanhã</Button>
        <Button onClick={() => { fechar(); navigate("/pessoal"); }}><CalendarClock size={16} /> Abrir o painel pessoal</Button>
      </div>
    </Modal>
  );
}
