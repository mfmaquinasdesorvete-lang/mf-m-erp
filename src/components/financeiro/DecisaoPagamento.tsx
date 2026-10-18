// Contas a pagar: botões de decisão por conta (Pagar, Agendar, Não pagar), a etiqueta da decisão, a barra de
// ações das contas marcadas e o pagamento em lote (uma conta bancária por unidade).
import { useState, type FormEvent, type ReactNode } from "react";
import { confirmar } from "@/components/Dialogos";
import { Ban, CalendarClock, Check, CheckCheck, Wallet, X } from "lucide-react";
import { BotaoAtalho, Button, COR_ATALHO, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje as hojeISO, pl } from "@/lib/format";
import { somarDias } from "@/lib/financeiro";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { aguardaAprovacao, COR_TOM, gruposPorUnidade, rotuloDecisao, TEXTO_FALTA_APROVAR, type ContaDecisao } from "@/lib/programacao";

type Conta = ContaDecisao & { descricao: string; terceiro?: string | null; fornecedor?: { nome: string } | null };
type Acao = "pagar" | "agendar" | "nao_pagar" | "limpar";
type ContaBancaria = { id: string; nome: string; unidade_id: string; ativo: boolean };

const MOTIVOS = ["Sem caixa agora", "Esperando boleto ou NF correta", "Em negociação com o fornecedor", "Cobrança indevida", "Pagar no mês que vem"];

export function useProgramar() {
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  async function programar(ids: string[], acao: Acao, data?: string | null, motivo?: string | null) {
    setOcupado(true);
    try {
      const { data: n, error } = await supabase.rpc("programar_pagamento", { p_ids: ids, p_acao: acao, p_data: data ?? null, p_motivo: motivo ?? null });
      if (error) throw error;
      const qtd = Number(n ?? 0);
      const txt = { pagar: "aprovada(s) para pagar", agendar: `agendada(s) para ${dataBR(data ?? "")}`, nao_pagar: "marcada(s) para não pagar", limpar: "de volta para a decidir" }[acao];
      notify(qtd === 1 ? `Conta ${txt.replace("(s)", "")}` : `${qtd} contas ${txt.replace(/\(s\)/g, "s")}`);
      invalidate("contas_pagar", "auditoria");
      return true;
    } catch (err) {
      notifyError(err);
      return false;
    } finally {
      setOcupado(false);
    }
  }
  return { programar, ocupado };
}

/** Etiqueta da decisão ("A decidir", "Pagar hoje", "Agendada 15/10", "Não pagar"). */
export function ChipDecisao({ conta, hoje = hojeISO() }: { conta: ContaDecisao; hoje?: string }) {
  const r = rotuloDecisao(conta, hoje);
  if (!r) return null;
  return <span title={r.dica} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_TOM[r.tom]}`}>{r.texto}</span>;
}

/**
 * Três botões por conta: Pagar · Agendar · Não pagar. Tocar no que já está escolhido desfaz.
 * `atalho`: ícones coloridos com o nome embaixo (cartão do celular), soltos na grade de ações de quem chama.
 */
export function BotoesDecisao({ conta, compacto = false, atalho = false }: { conta: Conta; compacto?: boolean; atalho?: boolean }) {
  const { programar, ocupado } = useProgramar();
  const [janela, setJanela] = useState<"agendar" | "nao_pagar" | null>(null);
  // fornecedor marcado como golpe: o banco segura como "não pagar"; a etiqueta vermelha já diz isso
  if (conta.status !== "aberto" || conta.fornecedor?.bloqueado) return null;
  const d = conta.decisao;
  // sem a aprovação (fluxo de aprovação) o banco não deixa pagar nem agendar; "não pagar" e desfazer continuam
  const falta = aguardaAprovacao(conta);
  const janelas = (<>
    {janela === "agendar" && <ModalAgendar contas={[conta]} onClose={() => setJanela(null)} />}
    {janela === "nao_pagar" && <ModalNaoPagar contas={[conta]} onClose={() => setJanela(null)} />}
  </>);
  if (atalho) return (<>
    <BotaoAtalho icon={Check} label={d === "pagar" ? "Aprovada" : "Pagar"} cor={COR_ATALHO.verde} corAtiva="#047857" ativo={d === "pagar"} disabled={ocupado || (falta && d !== "pagar")}
      title={falta && d !== "pagar" ? TEXTO_FALTA_APROVAR : d === "pagar" ? "Aprovada. Toque de novo para desfazer" : "Quero pagar esta (no vencimento, ou hoje se já venceu)"}
      onClick={() => programar([conta.id], d === "pagar" ? "limpar" : "pagar")} />
    <BotaoAtalho icon={CalendarClock} label={d === "agendado" && conta.pagar_em ? `Dia ${dataBR(conta.pagar_em).slice(0, 5)}` : "Agendar"}
      cor={COR_ATALHO.azul} corAtiva="#1d4ed8" ativo={d === "agendado"} disabled={ocupado || falta}
      title={falta ? TEXTO_FALTA_APROVAR : d === "agendado" ? `Agendada para ${dataBR(conta.pagar_em ?? "")}. Toque para mudar o dia` : "Pagar em tal dia"} onClick={() => setJanela("agendar")} />
    <BotaoAtalho icon={Ban} label="Não pagar" cor={COR_ATALHO.cinza} corAtiva="#475569" ativo={d === "nao_pagar"} disabled={ocupado}
      title={d === "nao_pagar" ? `Não pagar: ${conta.decisao_motivo ?? ""}. Toque de novo para desfazer` : "Não quero pagar esta agora"}
      onClick={() => (d === "nao_pagar" ? programar([conta.id], "limpar") : setJanela("nao_pagar"))} />
    {janelas}
  </>);
  const base = `inline-flex items-center gap-1 rounded-lg border font-semibold transition disabled:opacity-50 ${compacto ? "gap-0.5 px-1.5 py-1 text-xs" : "px-2.5 py-1.5 text-xs"}`;
  const estilo = (ativo: boolean, cor: string) => ativo ? `${base} ${cor}` : `${base} border-slate-200 bg-surface text-slate-600 hover:border-slate-400`;
  return (
    <span className="inline-flex flex-nowrap gap-1 whitespace-nowrap" role="group" aria-label="Decisão de pagamento">
      <button type="button" disabled={ocupado || (falta && d !== "pagar")} aria-pressed={d === "pagar"}
        title={falta && d !== "pagar" ? TEXTO_FALTA_APROVAR : d === "pagar" ? "Aprovada. Toque de novo para desfazer" : "Quero pagar esta (no vencimento, ou hoje se já venceu)"}
        className={estilo(d === "pagar", "border-solido-verde bg-solido-verde text-white")}
        onClick={() => programar([conta.id], d === "pagar" ? "limpar" : "pagar")}>
        <Check size={14} aria-hidden /> Pagar
      </button>
      <button type="button" disabled={ocupado || falta} aria-pressed={d === "agendado"}
        title={falta ? TEXTO_FALTA_APROVAR : d === "agendado" ? `Agendada para ${dataBR(conta.pagar_em ?? "")}. Toque para mudar o dia` : "Pagar em tal dia"}
        className={estilo(d === "agendado", "border-solido-azul bg-solido-azul text-white")}
        onClick={() => setJanela("agendar")}>
        <CalendarClock size={14} aria-hidden /> {d === "agendado" && conta.pagar_em ? dataBR(conta.pagar_em).slice(0, 5) : "Agendar"}
      </button>
      <button type="button" disabled={ocupado} aria-pressed={d === "nao_pagar"}
        title={d === "nao_pagar" ? `Não pagar: ${conta.decisao_motivo ?? ""}. Toque de novo para desfazer` : "Não quero pagar esta agora"}
        className={estilo(d === "nao_pagar", "border-solido-cinza bg-solido-cinza text-white")}
        onClick={() => (d === "nao_pagar" ? programar([conta.id], "limpar") : setJanela("nao_pagar"))}>
        <Ban size={14} aria-hidden /> Não pagar
      </button>
      {janelas}
    </span>
  );
}

const nomeDe = (c: Conta) => c.terceiro || c.fornecedor?.nome || c.descricao;

/** Escolher o dia do pagamento (atalhos: amanhã, sexta, dia 10/15/20/25, no vencimento). */
export function ModalAgendar({ contas, onClose }: { contas: Conta[]; onClose: () => void }) {
  const hoje = hojeISO();
  const um = contas.length === 1 ? contas[0] : null;
  const [dia, setDia] = useState(um?.pagar_em && um.pagar_em >= hoje ? um.pagar_em : um && um.vencimento > hoje ? um.vencimento : somarDias(hoje, 1));
  const { programar, ocupado } = useProgramar();
  const sexta = (() => { const d = new Date(hoje + "T12:00:00Z"); const falta = (5 - d.getUTCDay() + 7) % 7 || 7; return somarDias(hoje, falta); })();
  const doMes = (n: number) => { const m = `${hoje.slice(0, 7)}-${String(n).padStart(2, "0")}`; return m > hoje ? m : proximoMes(hoje, n); };
  const atalhos: [string, string][] = [["Amanhã", somarDias(hoje, 1)], ["Sexta", sexta], ...[10, 15, 20, 25].map((n): [string, string] => [`Dia ${n}`, doMes(n)])];
  if (um && um.vencimento > hoje) atalhos.unshift(["No vencimento", um.vencimento]);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (await programar(contas.map((c) => c.id), "agendar", dia)) onClose();
  }
  return (
    <Modal open onClose={onClose} title={um ? `Pagar em tal dia — ${nomeDe(um)}` : `Agendar ${contas.length} contas`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">{um ? <>Conta de <b>{brl(um.valor)}</b>, vence em {dataBR(um.vencimento)}.</> : <>Total de <b>{brl(contas.reduce((s, c) => s + Number(c.valor), 0))}</b>.</>} No dia escolhido ela aparece em <b>Pagar hoje</b>.</p>
        <div className="flex flex-wrap gap-1.5">
          {atalhos.map(([r, d]) => (
            <button key={r} type="button" onClick={() => setDia(d)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${dia === d ? "border-solido-azul bg-solido-azul text-white" : "border-slate-300 text-slate-700 hover:border-sky-500"}`}>
              {r} <span className="font-normal opacity-90">{dataBR(d).slice(0, 5)}</span>
            </button>
          ))}
        </div>
        <Field label="Dia do pagamento"><input className="input" type="date" min={hoje} value={dia} onChange={(e) => setDia(e.target.value)} required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={ocupado}><CalendarClock size={15} /> Agendar para {dataBR(dia).slice(0, 5)}</Button>
        </div>
      </form>
    </Modal>
  );
}

function proximoMes(hoje: string, dia: number) {
  const [a, m] = hoje.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1, na = m === 12 ? a + 1 : a;
  return `${na}-${String(nm).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** "Não pagar": pede o motivo (fica no histórico). A conta continua em aberto, só sai da lista de pagamento. */
export function ModalNaoPagar({ contas, onClose }: { contas: Conta[]; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { programar, ocupado } = useProgramar();
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (await programar(contas.map((c) => c.id), "nao_pagar", null, motivo)) onClose();
  }
  return (
    <Modal open onClose={onClose} title={contas.length === 1 ? `Não pagar — ${nomeDe(contas[0])}` : `Não pagar ${contas.length} contas`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">A conta continua em aberto (não é cancelada) e sai da lista de pagamento até alguém mudar a decisão.</p>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" onClick={() => setMotivo(m)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${motivo === m ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 text-slate-700 hover:border-slate-500"}`}>{m}</button>
          ))}
        </div>
        <Field label="Por quê? (fica no histórico)"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={ocupado}><Ban size={15} /> Não pagar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Pagamento em lote: mesma data; uma conta bancária por unidade; valor cheio de cada conta. */
export function PagarLoteModal({ contas, onClose, onPago }: { contas: Conta[]; onClose: () => void; onPago?: () => void }) {
  const { unidades } = useUnidade();
  const invalidate = useInvalidate();
  const { data: bancos = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  const [data, setData] = useState(hojeISO());
  const naoPagar = contas.filter((c) => c.decisao === "nao_pagar");
  const [incluirNaoPagar, setIncluirNaoPagar] = useState(false);
  const validas = contas.filter((c) => c.status === "aberto" && !aguardaAprovacao(c) && (incluirNaoPagar || c.decisao !== "nao_pagar"));
  const grupos = gruposPorUnidade(validas);
  const [banco, setBanco] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const total = grupos.reduce((s, g) => s + g.total, 0);
  const nomeUnidade = (id: string | null) => unidades.find((u) => u.id === id)?.nome ?? "Sem unidade";
  const bancosDe = (id: string | null) => bancos.filter((b) => b.ativo && (!id || b.unidade_id === id));

  async function pagar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    let pagas = 0, soma = 0;
    try {
      for (const g of grupos) {
        const { data: r, error } = await supabase.rpc("pagar_em_lote", {
          p_ids: g.contas.map((c) => c.id), p_data: data, p_conta_bancaria: banco[g.unidade_id ?? ""] || null, p_incluir_nao_pagar: incluirNaoPagar,
        });
        if (error) throw error;
        pagas += Number((r as { pagas: number }).pagas ?? 0);
        soma += Number((r as { total: number }).total ?? 0);
      }
      notify(`${pagas} ${pl(pagas, "conta", "contas")} ${pl(pagas, "paga", "pagas")} · ${brl(soma)}`);
      onPago?.();
      onClose();
    } catch (err) {
      if (pagas) notify(`${pagas} ${pl(pagas, "conta", "contas")} já foram pagas (${brl(soma)}); o resto parou no erro abaixo`, "erro");
      notifyError(err);
    } finally {
      invalidate("contas_pagar", "saldos_bancarios", "movimentos_realizados", "auditoria");
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Pagar em lote — ${validas.length} ${pl(validas.length, "conta", "contas")} · ${brl(total)}`}>
      <form onSubmit={pagar} className="space-y-3">
        <Field label="Data do pagamento"><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Field>
        {grupos.map((g) => {
          const opcoes = bancosDe(g.unidade_id);
          return (
            <fieldset key={g.unidade_id ?? "-"} className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-600">{nomeUnidade(g.unidade_id)} · {g.contas.length} {pl(g.contas.length, "conta", "contas")} · {brl(g.total)}</legend>
              <Field label="Sai de qual conta bancária?">
                <select className="input" value={banco[g.unidade_id ?? ""] ?? ""} required={opcoes.length > 0}
                  onChange={(e) => setBanco({ ...banco, [g.unidade_id ?? ""]: e.target.value })}>
                  <option value="">{opcoes.length ? "Escolha a conta…" : "— (cadastre as contas em Bancos e conciliação)"}</option>
                  {opcoes.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </Field>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {g.contas.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{nomeDe(c)} <span className="text-xs text-slate-500">· vence {dataBR(c.vencimento).slice(0, 5)}</span></span><span className="num shrink-0">{brl(c.valor)}</span></li>
                ))}
              </ul>
            </fieldset>
          );
        })}
        {naoPagar.length > 0 && (
          <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm">
            <input type="checkbox" className="mt-1" checked={incluirNaoPagar} onChange={(e) => setIncluirNaoPagar(e.target.checked)} />
            <span>{naoPagar.length} {pl(naoPagar.length, "marcada", "marcadas")} como <b>não pagar</b> ({brl(naoPagar.reduce((s, c) => s + Number(c.valor), 0))}) ficam fora. Marque para pagar também.</span>
          </label>
        )}
        <p className="text-xs text-slate-500">Cada conta é paga pelo valor cheio. Para pagar com desconto, juros ou só uma parte, use o botão <b>Baixa</b> da própria conta.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={ocupado || !validas.length}><Wallet size={15} /> {ocupado ? "Pagando…" : `Pagar ${brl(total)}`}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Barra das contas marcadas: aprovar, agendar, não pagar, voltar a decidir, pagar em lote. */
export function BarraLote({ contas, onLimpar, extra }: { contas: Conta[]; onLimpar: () => void; extra?: ReactNode }) {
  const { programar, ocupado } = useProgramar();
  const [janela, setJanela] = useState<"agendar" | "nao_pagar" | "lote" | null>(null);
  if (!contas.length) return null;
  // conta de fornecedor marcado como golpe fica de fora (o banco não deixa aprovar nem pagar)
  const golpe = contas.filter((c) => c.status === "aberto" && c.fornecedor?.bloqueado).length;
  const abertas = contas.filter((c) => c.status === "aberto" && !c.fornecedor?.bloqueado);
  const total = abertas.reduce((s, c) => s + Number(c.valor), 0);
  const ids = abertas.map((c) => c.id);
  // pagar, agendar e pagar em lote: só as já aprovadas no fluxo de aprovação
  const aprovadas = abertas.filter((c) => !aguardaAprovacao(c));
  const idsPagar = aprovadas.map((c) => c.id);
  const semAprovacao = abertas.length - aprovadas.length;
  return (
    <div className="sticky bottom-2 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface p-2.5 shadow-pop">
      <span className="mr-auto text-sm"><b>{contas.length}</b> {pl(contas.length, "marcada", "marcadas")}{abertas.length !== contas.length && ` (${abertas.length} em aberto)`} · <b className="num">{brl(total)}</b>{golpe > 0 && <span className="text-red-700"> · {golpe} de golpe fica(m) de fora</span>}
        {semAprovacao > 0 && <span className="text-amber-800" title={TEXTO_FALTA_APROVAR}> · {semAprovacao} sem aprovação: só “Não pagar”</span>}</span>
      <Button type="button" variant="secondary" disabled={ocupado || !idsPagar.length} onClick={async () => { if (await programar(idsPagar, "pagar")) onLimpar(); }}><Check size={15} /> Pagar</Button>
      <Button type="button" variant="secondary" disabled={!idsPagar.length} onClick={() => setJanela("agendar")}><CalendarClock size={15} /> Agendar</Button>
      <Button type="button" variant="secondary" disabled={!ids.length} onClick={() => setJanela("nao_pagar")}><Ban size={15} /> Não pagar</Button>
      <Button type="button" variant="ghost" disabled={ocupado || !ids.length} onClick={async () => { if (await confirmar(`Desfazer a decisão de ${ids.length} ${pl(ids.length, "conta", "contas")}? Agendamentos e motivos de "não pagar" se perdem.`) && await programar(ids, "limpar")) onLimpar(); }} title="Tirar a decisão (volta para a decidir)"><X size={15} /> Desfazer</Button>
      {extra}
      <Button type="button" disabled={!idsPagar.length} onClick={() => setJanela("lote")}><CheckCheck size={15} /> Pagamento em lote</Button>
      {janela === "agendar" && <ModalAgendar contas={aprovadas} onClose={() => { setJanela(null); onLimpar(); }} />}
      {janela === "nao_pagar" && <ModalNaoPagar contas={abertas} onClose={() => { setJanela(null); onLimpar(); }} />}
      {janela === "lote" && <PagarLoteModal contas={aprovadas} onClose={() => setJanela(null)} onPago={onLimpar} />}
    </div>
  );
}
