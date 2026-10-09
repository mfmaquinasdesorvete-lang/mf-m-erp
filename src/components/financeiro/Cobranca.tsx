// Financeiro → Cobrança: a régua (o que sai e quando: na criação, antes/no/depois do vencimento, no pagamento),
// a fila do dia para mandar pelo WhatsApp (um toque abre a conversa com a mensagem pronta, com Pix) e a situação
// dos clientes (em dia, a vencer, atrasados). Os e-mails da régua saem sozinhos todo dia às 8h.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Mail, MessageCircle, Pencil, Plus, SkipForward } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { filaCobranca, pixDaConta, preencherMensagem, situacaoClientes, VARIAVEIS_COBRANCA, type ContaCobranca, type Envio, type Etapa } from "@/lib/cobranca";
import type { Cliente } from "@/lib/types";

type ContaR = ContaCobranca & { cliente?: Cliente | null; forma_pagamento?: string };
const EVENTO: Record<Etapa["evento"], string> = { criacao: "Na criação", vencimento: "Vencimento", pagamento: "No pagamento" };
const quando = (e: Pick<Etapa, "evento" | "dias">) =>
  e.evento !== "vencimento" ? EVENTO[e.evento] : e.dias === 0 ? "No dia do vencimento" : e.dias < 0 ? `${-e.dias} dia(s) antes do vencimento` : `${e.dias} dia(s) depois do vencimento`;

export function Cobranca({ contas }: { contas: ContaR[] }) {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { unidades } = useUnidade();
  const invalidate = useInvalidate();
  const dia = hoje();
  const { data: etapas = [] } = useRows<Etapa>("regua_cobranca", { order: "ordem", ascending: true });
  const { data: envios = [] } = useQuery({
    queryKey: ["cobranca_envios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cobranca_envios").select("conta_receber_id, etapa_id, canal").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });
  const { data: cfg } = useQuery({ queryKey: ["configuracoes", "site_url"], queryFn: async () => (await supabase.from("configuracoes").select("site_url, nome_fantasia, razao_social").eq("id", 1).maybeSingle()).data });
  const [editando, setEditando] = useState<Partial<Etapa> | null>(null);
  const fila = useMemo(() => filaCobranca(contas, etapas, envios, dia), [contas, etapas, envios, dia]);
  const sit = useMemo(() => situacaoClientes(contas, dia), [contas, dia]);
  const base = (cfg?.site_url || window.location.origin).replace(/\/$/, "");
  const semPix = unidades.filter((u) => u.ativo && !u.pix_chave?.trim());

  const mensagem = (c: ContaR, e: Etapa) => {
    const u = unidades.find((x) => x.id === c.unidade_id);
    const valor = c.status === "pago" ? Number(c.valor_pago ?? c.valor) : Number(c.valor);
    return preencherMensagem(e.mensagem, {
      cliente: c.cliente?.nome_fantasia?.trim() || c.cliente?.nome, descricao: c.descricao, valor, vencimento: c.vencimento,
      dias_atraso: Math.max(0, Math.round((Date.parse(dia) - Date.parse(c.vencimento)) / 864e5)), empresa: cfg?.nome_fantasia || cfg?.razao_social,
      link: c.cliente?.portal_token ? `${base}/cliente/${c.cliente.portal_token}` : null,
      pix: c.status === "aberto" ? pixDaConta(u, valor, c.id) : null, pagamento: c.status === "aberto" ? u?.instrucoes_pagamento : null,
    });
  };

  async function registrar(c: ContaR, e: Etapa, situacao: "enviado" | "pulado") {
    const { error } = await supabase.rpc("registrar_cobranca", { p_conta: c.id, p_etapa: e.id, p_canal: "whatsapp", p_situacao: situacao });
    if (error) return notifyError(error);
    invalidate("cobranca_envios", "contatos_cliente", "ficha_cliente");
  }

  async function salvarEtapa() {
    if (!editando) return;
    const { id, ...row } = editando;
    const dados = { ...row, dias: row.evento === "vencimento" ? Number(row.dias ?? 0) : 0 };
    const { error } = id ? await supabase.from("regua_cobranca").update(dados).eq("id", id) : await supabase.from("regua_cobranca").insert({ ordem: 50, ...dados });
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("já existe uma etapa para esse dia") : error);
    notify("Régua salva"); setEditando(null); invalidate("regua_cobranca");
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
        {([["Em dia", sit.em_dia, "border-emerald-300 bg-emerald-50 text-emerald-800"], ["A vencer (7 dias)", sit.a_vencer, "border-amber-300 bg-amber-50 text-amber-900"],
          ["Atrasados", sit.atrasado, "border-red-300 bg-red-50 text-red-800"]] as const).map(([r, n, cor]) => (
          <div key={r} className={`rounded-lg border px-3 py-2 ${cor}`}><div className="text-xs font-semibold">{r}</div><div className="text-xl font-bold">{n}</div><div className="text-[11px] opacity-80">cliente(s)</div></div>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><MessageCircle size={18} className="text-emerald-600" /> Mandar hoje pelo WhatsApp ({fila.length})</h2>
        <p className="mb-3 text-sm text-slate-600">Etapas da régua com WhatsApp ligado. Toque em <b>Enviar</b>: abre a conversa com a mensagem pronta (com Pix) e a cobrança fica registrada na ficha do cliente.</p>
        {semPix.length > 0 && <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Sem chave Pix em {semPix.map((u) => u.nome).join(", ")}: cadastre em Configurações → Unidades para a mensagem levar o Pix copia e cola.</p>}
        {!fila.length ? <p className="text-sm text-slate-500">Nada para mandar hoje. 🎉</p> : (
          <ul className="divide-y divide-slate-100">
            {fila.map(({ conta: c, etapa: e, data }) => {
              const texto = mensagem(c, e);
              const zap = c.cliente?.whatsapp || c.cliente?.telefone;
              return (
                <li key={c.id + e.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-[12rem] flex-1">
                    <div className="font-medium">{c.cliente?.nome_fantasia?.trim() || c.cliente?.nome || "—"}</div>
                    <div className="text-xs text-slate-500">{c.descricao} · {brl(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor)} · vence {dataBR(c.vencimento)}</div>
                    <div className="text-xs font-semibold text-slate-600">{e.nome}{data < dia && <span className="text-amber-700"> · era para {dataBR(data)}</span>}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" title="Copiar a mensagem" onClick={() => navigator.clipboard.writeText(texto).then(() => notify("Mensagem copiada"))}><Copy size={15} /></Button>
                    <Button variant="ghost" title="Pular esta etapa para esta conta" onClick={() => registrar(c, e, "pulado")}><SkipForward size={15} /></Button>
                    {zap ? (
                      <a href={whatsappLink(zap, texto)} target="_blank" rel="noreferrer" onClick={() => registrar(c, e, "enviado")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                        <MessageCircle size={15} /> Enviar
                      </a>
                    ) : <span className="text-xs text-red-700">cliente sem WhatsApp</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Régua de cobrança</h2>
          {podeEditar && <Button variant="secondary" onClick={() => setEditando({ evento: "vencimento", dias: 10, nome: "10 dias depois", canal_email: true, canal_whatsapp: true, ativo: true, assunto: "Pagamento em aberto desde {vencimento}", mensagem: "Olá, {cliente}! O pagamento de *{descricao}* ({valor}) venceu em {vencimento}.\n\n{pagamento}\n\n{link}" })}><Plus size={16} /> Nova etapa</Button>}
        </div>
        <p className="mb-3 text-sm text-slate-600">Os e-mails saem sozinhos às 8h (com Pix copia e cola e o link da página do cliente). O WhatsApp entra na lista acima para você enviar com um toque.</p>
        <ol className="relative space-y-2 border-l-2 border-slate-200 pl-5">
          {etapas.map((e) => (
            <li key={e.id} className={`relative ${e.ativo ? "" : "opacity-55"}`}>
              <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 ${e.ativo ? "border-emerald-600 bg-emerald-500" : "border-slate-400 bg-surface"}`} aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-500">{quando(e)}</span>
                <b className="text-sm">{e.nome}</b>
                {e.canal_email && <span className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 text-xs"><Mail size={12} /> E-mail</span>}
                {e.canal_whatsapp && <span className="inline-flex items-center gap-1 rounded border border-emerald-300 px-1.5 text-xs text-emerald-800"><MessageCircle size={12} /> WhatsApp</span>}
                {!e.ativo && <span className="text-xs text-slate-500">(desligada)</span>}
                {podeEditar && <Button variant="ghost" className="ml-auto" onClick={() => setEditando({ ...e })}><Pencil size={14} /> Editar</Button>}
              </div>
              <p className="line-clamp-2 whitespace-pre-line text-xs text-slate-500">{e.mensagem}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.id ? "Etapa da régua" : "Nova etapa da régua"}>
        {editando && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); salvarEtapa(); }}>
            <Field label="Quando">
              <select className="input" value={editando.evento} onChange={(ev) => setEditando({ ...editando, evento: ev.target.value as Etapa["evento"] })}>
                <option value="criacao">Na criação da cobrança</option><option value="vencimento">Antes / no / depois do vencimento</option><option value="pagamento">No pagamento</option>
              </select>
            </Field>
            {editando.evento === "vencimento" ? (
              <Field label="Dias em relação ao vencimento (−3 = 3 antes, 0 = no dia, 5 = 5 depois)">
                <input className="input" type="number" min={-30} max={90} value={editando.dias ?? 0} onChange={(ev) => setEditando({ ...editando, dias: Number(ev.target.value) })} required />
              </Field>
            ) : <div />}
            <Field label="Nome da etapa" className="sm:col-span-2"><input className="input" value={editando.nome ?? ""} onChange={(ev) => setEditando({ ...editando, nome: ev.target.value })} required /></Field>
            <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!editando.canal_email} onChange={(ev) => setEditando({ ...editando, canal_email: ev.target.checked })} /> E-mail (automático)</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!editando.canal_whatsapp} onChange={(ev) => setEditando({ ...editando, canal_whatsapp: ev.target.checked })} /> WhatsApp (lista do dia)</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={editando.ativo ?? true} onChange={(ev) => setEditando({ ...editando, ativo: ev.target.checked })} /> Ligada</label>
            </div>
            <Field label="Assunto do e-mail" className="sm:col-span-2"><input className="input" value={editando.assunto ?? ""} onChange={(ev) => setEditando({ ...editando, assunto: ev.target.value })} required /></Field>
            <Field label="Mensagem (*negrito* no WhatsApp)" className="sm:col-span-2">
              <textarea className="input min-h-[140px]" value={editando.mensagem ?? ""} onChange={(ev) => setEditando({ ...editando, mensagem: ev.target.value })} required minLength={10} maxLength={2000} />
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-2">Variáveis: {VARIAVEIS_COBRANCA.map((v) => `{${v}}`).join(" ")}. <b>{"{pagamento}"}</b> vira o Pix copia e cola e os dados de pagamento da unidade; <b>{"{link}"}</b> é a página do cliente com as contas e a segunda via.</p>
            <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2">
              <div className="mb-1 text-xs font-semibold text-slate-500">Prévia</div>
              <p className="whitespace-pre-line">{preencherMensagem(editando.mensagem ?? "", { cliente: "Andressa Rossana", descricao: "Pedido #2 - parcela 1/2", valor: 2740, vencimento: dia, dias_atraso: 5, pix: "00020126…6304ABCD", pagamento: "Banco do Brasil · Ag. 1234-5", link: `${base}/cliente/…`, empresa: cfg?.nome_fantasia })}</p>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button><Check size={16} /> Salvar</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
