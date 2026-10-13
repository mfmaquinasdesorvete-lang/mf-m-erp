// Boleto na conta a pagar: campo "Código de barras / linha digitável" com "Buscar informações do boleto" (valor, vencimento,
// banco e conferência dos números), "Este boleto já foi pago?" (outra conta com o mesmo boleto ou saída no extrato) e o
// cálculo de multa e juros para pagar com atraso.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Search, ScanBarcode, Wallet } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, digitos, hoje } from "@/lib/format";
import { calcularEncargos, formatarLinha, lerBoleto, type Boleto } from "@/lib/boleto";

export type EncargosBoleto = { boleto_multa_pct?: number | null; boleto_juros_mes_pct?: number | null; boleto_juros_dia?: number | null };
export type Conferencia = {
  contas: { id: string; descricao: string; status: string; valor: number; valor_pago: number | null; data_pagamento: string | null; vencimento: string }[];
  extrato: { id: string; data: string; valor: number; descricao: string | null; banco: string | null; conta_pagar_id: string | null }[];
};

export async function conferirBoleto(linha: string | null, valor: number | null, vencimento: string | null, contaId?: string | null): Promise<Conferencia> {
  const { data, error } = await supabase.rpc("boleto_conferir", { p_linha: linha || null, p_valor: valor || null, p_vencimento: vencimento || null, p_conta: contaId || null });
  if (error) throw error;
  return { contas: data?.contas ?? [], extrato: data?.extrato ?? [] };
}

/** Resumo do boleto lido: banco, valor, vencimento e se os números conferem. */
export function ResumoBoleto({ b }: { b: Boleto }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-sm ${b.valido ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {b.valido ? <CheckCircle2 size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
        <b>{b.bancoNome ?? "Boleto"}</b>
        <span>· {b.valor != null ? brl(b.valor) : "valor em aberto"}</span>
        <span>· {b.vencimento ? `vence ${dataBR(b.vencimento)}` : "sem vencimento no código"}</span>
        <span className="text-xs opacity-80">· {b.valido ? "números conferidos" : "algum número está errado"}</span>
      </div>
      {!b.valido && <p className="mt-1 text-xs">{b.erros.join("; ")}. Confira a digitação (ou bipe/cole de novo).</p>}
    </div>
  );
}

/** Resultado de "já foi pago?". */
export function ResultadoConferencia({ r, contaId }: { r: Conferencia; contaId?: string | null }) {
  const pagas = r.contas.filter((c) => c.status === "pago");
  const abertas = r.contas.filter((c) => c.status !== "pago");
  const desta = r.extrato.filter((e) => contaId && e.conta_pagar_id === contaId);
  const outras = r.extrato.filter((e) => !contaId || e.conta_pagar_id !== contaId);
  if (!r.contas.length && !r.extrato.length) {
    return <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Nenhum pagamento deste boleto no ERP nem no extrato importado.</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {pagas.map((c) => (
        <li key={c.id} className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
          <b>Este boleto já foi pago</b> na conta “{c.descricao}”{c.data_pagamento ? ` em ${dataBR(c.data_pagamento)}` : ""}{c.valor_pago != null ? ` (${brl(c.valor_pago)})` : ""}. Não pague de novo.
        </li>
      ))}
      {abertas.map((c) => (
        <li key={c.id} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
          O mesmo boleto também está lançado em “{c.descricao}” ({c.status === "aberto" ? `em aberto, vence ${dataBR(c.vencimento)}` : c.status}): pode ser lançamento em dobro.
        </li>
      ))}
      {desta.map((e) => (
        <li key={e.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
          Pago: saída de <b>{brl(e.valor)}</b> em {dataBR(e.data)}{e.banco ? ` (${e.banco})` : ""} conciliada com esta conta.
        </li>
      ))}
      {outras.map((e) => (
        <li key={e.id} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
          Saída de <b>{brl(e.valor)}</b> em {dataBR(e.data)} no extrato{e.banco ? ` (${e.banco})` : ""}{e.descricao ? `: “${e.descricao}”` : ""}
          {e.conta_pagar_id ? " — já ligada a outra conta" : " — confira se foi este boleto"}.
        </li>
      ))}
    </ul>
  );
}

/** Campo do formulário da conta a pagar (como no Tiny): lê o boleto e preenche valor e vencimento. */
export function CampoBoleto({ linha, contaId, encargos, onLinha, onLido, onEncargos }: {
  linha: string | null | undefined; contaId?: string | null; encargos: EncargosBoleto;
  onLinha: (linha: string | null) => void; onLido: (b: Boleto) => void; onEncargos: (e: EncargosBoleto) => void;
}) {
  const [texto, setTexto] = useState(linha ? formatarLinha(linha) : "");
  const [lido, setLido] = useState<Boleto | null>(() => (linha ? lerBoleto(linha) : null));
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [verEncargos, setVerEncargos] = useState(!!(encargos.boleto_multa_pct ?? encargos.boleto_juros_mes_pct ?? encargos.boleto_juros_dia));

  async function buscar(t = texto) {
    const b = lerBoleto(t);
    if (!b) {
      if (!digitos(t)) { onLinha(null); setLido(null); setConf(null); return; }
      return notify("Digite os 47 números da linha digitável (ou os 44 do código de barras; 48 nas contas de consumo)", "erro");
    }
    setLido(b); setTexto(formatarLinha(b.linha)); onLinha(b.linha); onLido(b);
    setBuscando(true);
    try { setConf(await conferirBoleto(b.linha, b.valor, b.vencimento, contaId)); } catch (e) { notifyError(e); } finally { setBuscando(false); }
  }

  return (
    <div className="space-y-2">
      <Field label="Código de barras / linha digitável">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanBarcode size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input num pl-9" inputMode="numeric" autoComplete="off" value={texto} placeholder="Bipe, cole ou digite os números do boleto"
              onChange={(e) => {
                setTexto(e.target.value);
                const n = digitos(e.target.value).length;
                if (!n) { onLinha(null); setLido(null); setConf(null); }
              }}
              onPaste={(e) => { const t = e.clipboardData.getData("text"); if ([44, 47, 48].includes(digitos(t).length)) { e.preventDefault(); buscar(t); } }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }} />
          </div>
          <Button type="button" variant="secondary" disabled={buscando} onClick={(e) => { e.preventDefault(); buscar(); }} title="Buscar informações do boleto">
            <Search size={15} aria-hidden /><span className="hidden sm:inline">{buscando ? "Buscando…" : "Buscar informações do boleto"}</span><span className="sm:hidden">Buscar</span>
          </Button>
        </div>
      </Field>
      {lido && <ResumoBoleto b={lido} />}
      {conf && <ResultadoConferencia r={conf} contaId={contaId} />}
      {lido && (
        !verEncargos ? (
          <button type="button" onClick={(e) => { e.preventDefault(); setVerEncargos(true); }} className="text-xs font-semibold text-brand hover:underline">
            Multa e juros do boleto: padrão 2% + 1% ao mês (mudar)
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Multa (%)"><input className="input" type="number" step="0.01" min={0} max={20} placeholder="2" value={encargos.boleto_multa_pct ?? ""}
              onChange={(e) => onEncargos({ ...encargos, boleto_multa_pct: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <Field label="Juros ao mês (%)"><input className="input" type="number" step="0.01" min={0} max={20} placeholder="1" value={encargos.boleto_juros_mes_pct ?? ""}
              onChange={(e) => onEncargos({ ...encargos, boleto_juros_mes_pct: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <Field label="ou juros R$/dia"><input className="input" type="number" step="0.01" min={0} placeholder="—" value={encargos.boleto_juros_dia ?? ""}
              onChange={(e) => onEncargos({ ...encargos, boleto_juros_dia: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
          </div>
        )
      )}
    </div>
  );
}

type ContaBoleto = EncargosBoleto & {
  id: string; descricao: string; valor: number; vencimento: string; status: string; linha_digitavel?: string | null;
  data_pagamento?: string | null; valor_pago?: number | null; fornecedor?: { nome: string; bloqueado?: boolean | null } | null;
};

/**
 * "Conferir boleto" na lista de contas a pagar: já foi pago? quanto fica com multa e juros na data do pagamento?
 * Sem linha digitável, dá para colar e guardar na conta. Pagar abre a baixa já com o valor corrigido.
 */
export function ConferirBoletoModal({ conta, podeEditar, aprovada = true, onClose, onPagar }: {
  conta: ContaBoleto; podeEditar: boolean; aprovada?: boolean; onClose: () => void; onPagar: (valor: number, data: string) => void;
}) {
  const [linha, setLinha] = useState(conta.linha_digitavel ?? null);
  const b = linha ? lerBoleto(linha) : null;
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [texto, setTexto] = useState("");
  const [data, setData] = useState(hoje());
  const [multa, setMulta] = useState(String(conta.boleto_multa_pct ?? 2));
  const [juros, setJuros] = useState(String(conta.boleto_juros_mes_pct ?? 1));
  const [jurosDia, setJurosDia] = useState(conta.boleto_juros_dia != null ? String(conta.boleto_juros_dia) : "");
  const [salvando, setSalvando] = useState(false);
  const enc = calcularEncargos(Number(conta.valor), conta.vencimento, data, { multaPct: Number(multa) || 0, jurosMesPct: Number(juros) || 0, jurosDia: jurosDia ? Number(jurosDia) : null });
  const aberta = conta.status === "aberto";

  useEffect(() => {
    let vivo = true;
    conferirBoleto(linha, Number(conta.valor), conta.vencimento, conta.id).then((r) => { if (vivo) setConf(r); }).catch(notifyError);
    return () => { vivo = false; };
  }, [linha, conta.id, conta.valor, conta.vencimento]);

  async function guardarLinha() {
    const lb = lerBoleto(texto);
    if (!lb) return notify("Digite os 47 números da linha digitável (ou os 44 do código de barras)", "erro");
    if (!lb.valido) return notify(`Algum número está errado: ${lb.erros.join("; ")}`, "erro");
    if (lb.valor != null && Math.abs(lb.valor - Number(conta.valor)) > 0.005) notify(`Atenção: o boleto é de ${brl(lb.valor)} e a conta de ${brl(conta.valor)}`, "erro");
    setSalvando(true);
    const { error } = await supabase.from("contas_pagar").update({ linha_digitavel: lb.linha }).eq("id", conta.id);
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Linha digitável guardada na conta");
    setLinha(lb.linha);
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(linha ?? ""); notify("Linha digitável copiada: cole no app do banco"); } catch { notify("Não deu para copiar", "erro"); }
  }

  return (
    <Modal open onClose={onClose} title={`Boleto · ${conta.fornecedor?.nome || conta.descricao}`}>
      <div className="space-y-4">
        {conta.fornecedor?.bloqueado && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> Fornecedor marcado como golpe: não pagar.</p>
        )}
        {b ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <p className="num min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-fg">{formatarLinha(b.linha)}</p>
              <Button type="button" variant="secondary" onClick={copiar} title="Copiar a linha digitável" aria-label="Copiar a linha digitável"><Copy size={15} /></Button>
            </div>
            <ResumoBoleto b={b} />
            {b.valor != null && Math.abs(b.valor - Number(conta.valor)) > 0.005 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">O boleto é de <b>{brl(b.valor)}</b> e a conta está com <b>{brl(conta.valor)}</b>.</p>
            )}
            {b.vencimento && b.vencimento !== conta.vencimento && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">O boleto vence em <b>{dataBR(b.vencimento)}</b> e a conta em <b>{dataBR(conta.vencimento)}</b>.</p>
            )}
          </div>
        ) : podeEditar && aberta ? (
          <Field label="Linha digitável ou código de barras (fica guardado na conta)">
            <div className="flex gap-2">
              <input className="input num min-w-0 flex-1" inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Bipe, cole ou digite" autoFocus />
              <Button type="button" disabled={salvando} onClick={guardarLinha}><Search size={15} /> Ler</Button>
            </div>
          </Field>
        ) : <p className="text-sm text-slate-500">Esta conta não tem a linha digitável do boleto.</p>}

        <section>
          <h3 className="mb-1.5 text-sm font-bold text-fg">Já foi pago?</h3>
          {conta.status === "pago" ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>Esta conta já está paga</b>{conta.data_pagamento ? ` em ${dataBR(conta.data_pagamento)}` : ""}{conta.valor_pago != null ? ` (${brl(conta.valor_pago)})` : ""}.</p>
          ) : conf ? <ResultadoConferencia r={conf} contaId={conta.id} /> : <p className="text-sm text-slate-500">Conferindo…</p>}
          <p className="mt-1.5 text-xs text-slate-500">
            O ERP confere as contas lançadas e o extrato importado (Bancos e conciliação). Para ver o registro do boleto no próprio banco,
            cole a linha digitável no app do banco: ele mostra se já foi pago e o valor do dia.
          </p>
        </section>

        {aberta && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-fg">Valor para pagar</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Data do pagamento"><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
              <Field label="Multa (%)"><input className="input" type="number" step="0.01" min={0} max={20} value={multa} onChange={(e) => setMulta(e.target.value)} /></Field>
              <Field label="Juros ao mês (%)"><input className="input" type="number" step="0.01" min={0} max={20} value={juros} onChange={(e) => setJuros(e.target.value)} disabled={!!jurosDia} /></Field>
              <Field label="ou juros R$/dia"><input className="input" type="number" step="0.01" min={0} value={jurosDia} onChange={(e) => setJurosDia(e.target.value)} placeholder="—" /></Field>
            </div>
            <dl className="num space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex justify-between"><dt>Valor do boleto</dt><dd>{brl(conta.valor)}</dd></div>
              {enc.dias > 0 ? (<>
                <div className="flex justify-between text-slate-600"><dt>Multa ({Number(multa) || 0}%)</dt><dd>{brl(enc.multa)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Juros ({enc.dias} {enc.dias === 1 ? "dia" : "dias"} de atraso)</dt><dd>{brl(enc.juros)}</dd></div>
              </>) : (
                <div className="text-xs text-emerald-700">{enc.prorrogado ? "Venceu no fim de semana: pagando no 1º dia útil não tem multa nem juros." : "Em dia: sem multa nem juros."}</div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-fg"><dt>Total em {dataBR(data)}</dt><dd>{brl(enc.total)}</dd></div>
            </dl>
            <p className="text-xs text-slate-500">Confira com o valor que o app do banco mostrar: alguns bancos contam juros diferente (e feriados não entram nesta conta).</p>
          </section>
        )}

        {aberta && !aprovada && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Esta conta ainda não foi aprovada: o pagamento só pode ser registrado depois da aprovação (Financeiro → Aprovações).</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          {aberta && aprovada && podeEditar && !conta.fornecedor?.bloqueado && (
            <Button type="button" onClick={() => onPagar(enc.total, data)}><Wallet size={15} /> Registrar pagamento de {brl(enc.total)}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
