// Configurações → Cobrança automática: a régua (o que sai e quando: na criação, antes/no/depois do vencimento, no
// pagamento) e o WhatsApp oficial. Saiu de Financeiro → Cobrança, que fica com a situação dos clientes e a fila do dia.
// Quem cuida da cobrança (financeiro e vendas) também abre, sem ver as outras configurações.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Mail, MessageCircle, Pencil, Plus } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { preencherMensagem, VARIAVEIS_COBRANCA, type Etapa } from "@/lib/cobranca";
import { situacaoModelo, useStatusWhatsapp, WhatsappOficial, type EtapaWa } from "@/components/financeiro/WhatsappOficial";
import { CabecalhoSecao, secaoPorId } from "./comum";

const EVENTO: Record<Etapa["evento"], string> = { criacao: "Na criação", vencimento: "Vencimento", pagamento: "No pagamento" };
const quando = (e: Pick<Etapa, "evento" | "dias">) =>
  e.evento !== "vencimento" ? EVENTO[e.evento] : e.dias === 0 ? "No dia do vencimento" : e.dias < 0 ? `${-e.dias} ${pl(-e.dias, "dia", "dias")} antes do vencimento` : `${e.dias} ${pl(e.dias, "dia", "dias")} depois do vencimento`;

export function ConfigCobranca() {
  const { tem, podeVer } = usePerfil();
  const { data: etapas = [] } = useRows<EtapaWa>("regua_cobranca", { order: "ordem", ascending: true });
  const voltar = podeVer("configuracoes") ? undefined : { to: "/financeiro?aba=cobranca", rotulo: "Cobrança" };
  return (
    <div className="max-w-5xl space-y-5">
      <CabecalhoSecao s={secaoPorId("cobranca")!} voltar={voltar} />
      {!tem("financeiro", "vendas") ? (
        <Card className="p-4 text-sm text-slate-600">Só o financeiro e as vendas cuidam da cobrança.</Card>
      ) : (
        <>
          <ReguaCobranca etapas={etapas} />
          <WhatsappOficial etapas={etapas} />
        </>
      )}
    </div>
  );
}

function ReguaCobranca({ etapas }: { etapas: EtapaWa[] }) {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const invalidate = useInvalidate();
  const dia = hoje();
  const { data: wa } = useStatusWhatsapp();
  const { data: cfg } = useQuery({ queryKey: ["configuracoes", "site_url"], queryFn: async () => (await supabase.from("configuracoes").select("site_url, nome_fantasia, razao_social").eq("id", 1).maybeSingle()).data });
  const [editando, setEditando] = useState<Partial<Etapa> | null>(null);
  const base = (cfg?.site_url || window.location.origin).replace(/\/$/, "");

  async function salvarEtapa() {
    if (!editando) return;
    const { id, ...row } = editando;
    const dados = { ...row, dias: row.evento === "vencimento" ? Number(row.dias ?? 0) : 0 };
    const { error } = id ? await supabase.from("regua_cobranca").update(dados).eq("id", id) : await supabase.from("regua_cobranca").insert({ ordem: 50, ...dados });
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("já existe uma etapa para esse dia") : error);
    notify("Régua salva"); setEditando(null); invalidate("regua_cobranca");
  }

  return (
    <>
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Régua de cobrança</h2>
          {podeEditar && <Button variant="secondary" onClick={() => setEditando({ evento: "vencimento", dias: 10, nome: "10 dias depois", canal_email: true, canal_whatsapp: true, ativo: true, assunto: "Pagamento em aberto desde {vencimento}", mensagem: "Olá, {cliente}! O pagamento de *{descricao}* ({valor}) venceu em {vencimento}.\n\n{pagamento}\n\n{link}" })}><Plus size={16} /> Nova etapa</Button>}
        </div>
        <p className="mb-3 text-sm text-slate-600">Os e-mails saem sozinhos às 8h (com Pix copia e cola e o link da página do cliente). {wa?.ativo
          ? "O WhatsApp sai sozinho pelo número oficial nas etapas com modelo aprovado."
          : "O WhatsApp entra na lista do dia em Financeiro → Cobrança, para você enviar com um toque."}</p>
        <ol className="relative space-y-2 border-l-2 border-slate-200 pl-5">
          {etapas.map((e) => (
            <li key={e.id} className={`relative ${e.ativo ? "" : "opacity-90"}`}>
              <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 ${e.ativo ? "border-emerald-600 bg-emerald-500" : "border-slate-400 bg-surface"}`} aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-500">{quando(e)}</span>
                <b className="text-sm">{e.nome}</b>
                {e.canal_email && <span className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 text-xs"><Mail size={12} /> E-mail</span>}
                {e.canal_whatsapp && <span className="inline-flex items-center gap-1 rounded border border-emerald-300 px-1.5 text-xs text-emerald-800"><MessageCircle size={12} /> WhatsApp</span>}
                {e.canal_whatsapp && wa?.configurado && <span className={`rounded border px-1.5 text-xs ${situacaoModelo(e).cor}`}>{situacaoModelo(e).texto}</span>}
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
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!editando.canal_whatsapp} onChange={(ev) => setEditando({ ...editando, canal_whatsapp: ev.target.checked })} /> WhatsApp {wa?.ativo ? "(automático, com modelo aprovado)" : "(lista do dia)"}</label>
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
    </>
  );
}
