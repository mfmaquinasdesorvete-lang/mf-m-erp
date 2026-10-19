// Financeiro → Cobrança: a fila do dia para mandar pelo WhatsApp (um toque abre a conversa com a mensagem pronta, com
// Pix), a situação dos clientes (em dia, a vencer, atrasados) e as respostas do WhatsApp oficial. A régua (o que sai e
// quando) e o WhatsApp oficial se configuram em Configurações → Cobrança automática. Os e-mails saem sozinhos às 8h.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Copy, MessageCircle, Settings2, SkipForward } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, whatsappLink, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { filaCobranca, pixDaConta, preencherMensagem, situacaoClientes, type ContaCobranca, type Envio, type Etapa } from "@/lib/cobranca";
import type { Cliente } from "@/lib/types";
import { PainelCobranca } from "@/components/financeiro/PainelCobranca";
import { MensagensWhatsapp, useStatusWhatsapp, type EtapaWa } from "@/components/financeiro/WhatsappOficial";

type ContaR = ContaCobranca & { cliente?: Cliente | null; forma_pagamento?: string };

export function Cobranca({ contas }: { contas: ContaR[] }) {
  const { unidades } = useUnidade();
  const invalidate = useInvalidate();
  const dia = hoje();
  const { data: etapas = [] } = useRows<EtapaWa>("regua_cobranca", { order: "ordem", ascending: true });
  const { data: wa } = useStatusWhatsapp();
  // com o WhatsApp oficial ligado, a etapa com modelo aprovado sai sozinha (não entra na lista manual)
  const automatica = (e: EtapaWa) => !!wa?.ativo && e.wa_status === "APPROVED" && e.wa_mensagem_base === e.mensagem;
  const { data: envios = [] } = useQuery({
    queryKey: ["cobranca_envios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cobranca_envios").select("conta_receber_id, etapa_id, canal").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });
  const { data: cfg } = useQuery({ queryKey: ["configuracoes", "site_url"], queryFn: async () => (await supabase.from("configuracoes").select("site_url, nome_fantasia, razao_social").eq("id", 1).maybeSingle()).data });
  const fila = useMemo(() => filaCobranca(contas, etapas, envios, dia)
    .filter(({ conta: c, etapa: e }) => !(automatica(e as EtapaWa) && (c.cliente?.whatsapp || c.cliente?.telefone))),
  [contas, etapas, envios, dia, wa]); // eslint-disable-line react-hooks/exhaustive-deps
  const sit = useMemo(() => situacaoClientes(contas, dia), [contas, dia]);
  const base = (cfg?.site_url || window.location.origin).replace(/\/$/, "");
  const semPix = unidades.filter((u) => u.ativo && !u.pix_chave?.trim());
  const ligadas = etapas.filter((e) => e.ativo);

  const mensagem = (c: ContaR, e: Etapa) => {
    const u = unidades.find((x) => x.id === c.unidade_id);
    const valor = c.status === "pago" ? Number(c.valor_pago ?? c.valor) : Number(c.valor);
    return preencherMensagem(e.mensagem, {
      cliente: c.cliente?.nome_fantasia?.trim() || c.cliente?.nome, descricao: c.descricao, valor, vencimento: c.vencimento,
      dias_atraso: Math.max(0, Math.round((Date.parse(dia) - Date.parse(c.vencimento)) / 864e5)), empresa: cfg?.nome_fantasia || cfg?.razao_social,
      link: c.cliente?.portal_token ? `${base}/cliente/${c.cliente.portal_link || c.cliente.portal_token}` : null,
      pix: c.status === "aberto" ? pixDaConta(u, valor, c.id) : null, pagamento: c.status === "aberto" ? u?.instrucoes_pagamento : null,
    });
  };

  async function registrar(c: ContaR, e: Etapa, situacao: "enviado" | "pulado") {
    const { error } = await supabase.rpc("registrar_cobranca", { p_conta: c.id, p_etapa: e.id, p_canal: "whatsapp", p_situacao: situacao });
    if (error) return notifyError(error);
    invalidate("cobranca_envios", "contatos_cliente", "ficha_cliente");
  }

  return (
    <div className="space-y-5">
      <PainelCobranca contas={contas} sit={sit} />

      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 font-bold"><MessageCircle size={18} className="text-emerald-600" /> Mandar hoje pelo WhatsApp ({fila.length})</h2>
        <p className="mb-3 text-sm text-slate-600">{wa?.ativo
          ? <>As etapas com modelo aprovado saem sozinhas pelo WhatsApp oficial. Aqui ficam só as que precisam de você (modelo ainda não aprovado). Toque em <b>Enviar</b>: abre a conversa com a mensagem pronta.</>
          : <>Etapas da régua com WhatsApp ligado. Toque em <b>Enviar</b>: abre a conversa com a mensagem pronta (com Pix) e a cobrança fica registrada na ficha do cliente.</>}</p>
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
                        className="inline-flex items-center gap-1.5 rounded-lg bg-solido-verde px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
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

      <MensagensWhatsapp />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-bold">Régua de cobrança</h2>
          <p className="text-sm text-slate-600">{ligadas.length} {pl(ligadas.length, "etapa ligada", "etapas ligadas")}: {ligadas.map((e) => e.nome).join(", ") || "nenhuma"}. O que sai por e-mail e WhatsApp, e quando, se muda em Configurações (junto com o WhatsApp oficial).</p>
        </div>
        <Link to="/configuracoes/cobranca" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:border-brand">
          <Settings2 size={16} aria-hidden /> Configurar a régua <ChevronRight size={15} aria-hidden />
        </Link>
      </Card>
    </div>
  );
}
