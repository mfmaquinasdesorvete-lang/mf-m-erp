// Pagar uma conta a pagar com Pix pelo Banco Inter: confere a chave e o valor, pede a confirmação e manda o Pix pela
// API do Inter. Se o Inter pagar na hora, a conta já fica paga; se pedir aprovação no app do Inter, o botão
// "Conferir no Inter" atualiza depois. Só para conta aprovada; o valor é o da conta (não se digita).
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Send } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataHoraBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { chaveNoTexto, lerChavePix, NOME_TIPO_CHAVE } from "../../../supabase/functions/_shared/pix-saida";
import type { ConexaoInter } from "./Inter";

type PixPedido = { id: string; conta_pagar_id: string; chave: string; tipo_chave: string; valor: number; status: string; erro: string | null; criado_em: string; criado_por_nome: string | null };
const SITUACAO: Record<string, [string, string]> = {
  enviando: ["Enviando / conferir no Inter", "bg-amber-100 text-amber-800"], aguardando_aprovacao: ["Esperando aprovação no app do Inter", "bg-amber-100 text-amber-800"],
  agendado: ["Agendado no Inter", "bg-sky-100 text-sky-800"], pago: ["Pix pago", "bg-emerald-100 text-emerald-800"], falhou: ["Não foi", "bg-red-100 text-red-800"],
};

export const usePixPedidos = () => useRows<PixPedido>("pix_pagamentos", { order: "criado_em", ascending: false });

export function PagarPixInter({ conta, onClose }: {
  conta: { id: string; descricao: string; valor: number; chave_pix?: string | null; observacoes?: string | null; fornecedor?: { nome?: string | null; chave_pix?: string | null } | null };
  onClose: () => void;
}) {
  const invalidar = useInvalidate();
  const { data: conexoes = [] } = useRows<ConexaoInter & { conta_bancaria?: { nome: string } | null }>("inter_conexoes", { select: "*, conta_bancaria:contas_bancarias(nome)", key: ["pix"] });
  const { data: pedidos = [] } = usePixPedidos();
  const ativas = conexoes.filter((c) => c.status !== "desligada");
  const sugestao = conta.chave_pix || conta.fornecedor?.chave_pix || chaveNoTexto(`${conta.descricao} ${conta.observacoes ?? ""}`)?.chave || "";
  const [chaveTxt, setChaveTxt] = useState(sugestao);
  const [conexaoId, setConexaoId] = useState("");
  const [conferido, setConferido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const conexao = conexaoId || ativas[0]?.id || "";
  const chave = useMemo(() => lerChavePix(chaveTxt), [chaveTxt]);
  const meus = pedidos.filter((p) => p.conta_pagar_id === conta.id);
  const andamento = meus.find((p) => ["enviando", "aguardando_aprovacao", "agendado"].includes(p.status));

  async function enviar() {
    if (!chave || !conexao || !conferido) return;
    setEnviando(true);
    try {
      const r = await callFunction<{ status: string; aviso?: string | null }>("inter", { acao: "pix_pagar", conta_id: conta.id, conexao_id: conexao, chave: chave.chave });
      invalidar("pix_pagamentos", "contas_pagar", "saldos_bancarios", "movimentos_realizados");
      if (r.aviso) notify(r.aviso, "erro");
      else notify(r.status === "pago" ? `Pix de ${brl(conta.valor)} pago e conta baixada` : r.status === "aguardando_aprovacao" ? "Pix enviado: aprove no app do Inter" : `Pix enviado (${SITUACAO[r.status]?.[0] ?? r.status})`);
      if (r.status === "pago") onClose();
    } catch (e) { notifyError(e); invalidar("pix_pagamentos"); } finally { setEnviando(false); }
  }
  async function conferir(id: string) {
    try {
      const r = await callFunction<{ status: string; aviso?: string | null }>("inter", { acao: "pix_consultar", id });
      invalidar("pix_pagamentos", "contas_pagar", "saldos_bancarios", "movimentos_realizados");
      notify(r.aviso ?? `Situação no Inter: ${SITUACAO[r.status]?.[0] ?? r.status}`, r.aviso ? "erro" : "ok");
    } catch (e) { notifyError(e); }
  }

  return (
    <Modal open onClose={onClose} title="Pagar com Pix pelo Inter">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">{conta.fornecedor?.nome ?? conta.descricao}</p>
          <p className="num text-2xl font-bold">{brl(conta.valor)}</p>
          <p className="text-xs text-slate-500">{conta.descricao}</p>
        </div>

        {!ativas.length ? (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> Nenhuma conta do Inter ligada. Ligue em Financeiro → Bancos e conciliação.</p>
        ) : andamento ? (
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>Já existe um Pix desta conta: <b>{SITUACAO[andamento.status]?.[0]}</b> ({dataHoraBR(andamento.criado_em)}).</p>
            <Button type="button" variant="secondary" onClick={() => conferir(andamento.id)}><RefreshCw size={15} /> Conferir no Inter</Button>
          </div>
        ) : (
          <>
            <Field label="Chave Pix de quem recebe">
              <input className="input" value={chaveTxt} onChange={(e) => { setChaveTxt(e.target.value); setConferido(false); }} placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória" autoFocus={!sugestao} />
              <span className={`mt-1 block text-xs ${chave ? "text-emerald-700" : "text-red-700"}`}>{chaveTxt.trim() ? (chave ? `${NOME_TIPO_CHAVE[chave.tipo]}: ${chave.chave}` : "Chave inválida") : "Digite a chave"}</span>
            </Field>
            {ativas.length > 1 && (
              <Field label="Sai da conta"><select className="input" value={conexao} onChange={(e) => setConexaoId(e.target.value)}>{ativas.map((c) => <option key={c.id} value={c.id}>{c.conta_bancaria?.nome ?? "Inter"}</option>)}</select></Field>
            )}
            {ativas.length === 1 && <p className="text-sm text-slate-600">Sai da conta <b>{ativas[0].conta_bancaria?.nome ?? "Inter"}</b>{ativas[0].saldo != null ? <> · saldo lido {brl(ativas[0].saldo)}</> : null}.</p>}
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <input type="checkbox" className="mt-0.5" checked={conferido} disabled={!chave} onChange={(e) => setConferido(e.target.checked)} />
              <span>Conferi a chave e o valor. Pix não tem como desfazer pelo ERP: se a chave estiver errada, o dinheiro vai para outra pessoa.</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="button" disabled={!chave || !conferido || enviando} onClick={enviar}><Send size={15} /> {enviando ? "Enviando…" : `Enviar Pix de ${brl(conta.valor)}`}</Button>
            </div>
          </>
        )}

        {meus.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200">
            {meus.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">{dataHoraBR(p.criado_em)} · {NOME_TIPO_CHAVE[p.tipo_chave as keyof typeof NOME_TIPO_CHAVE] ?? p.tipo_chave} {p.chave}{p.criado_por_nome ? ` · ${p.criado_por_nome}` : ""}
                  {p.erro && <span className="block text-xs text-red-700">{p.erro}</span>}</span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-bold ${SITUACAO[p.status]?.[1] ?? ""}`}>{p.status === "pago" && <CheckCircle2 size={11} className="mr-0.5 inline" />}{SITUACAO[p.status]?.[0] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
