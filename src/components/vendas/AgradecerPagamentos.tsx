// Vendas → "Agradecer pagamento" (pedido de 24/10): os clientes que acabaram de pagar, na etapa da régua "no pagamento"
// com WhatsApp. Não é cobrança: fica na página de Vendas, discreto (só aparece quando há alguém para agradecer).
// Toque em Enviar abre a conversa com a mensagem pronta e registra o envio na ficha do cliente. Com o WhatsApp oficial
// ligado e o modelo aprovado, a mensagem sai sozinha e a linha não aparece aqui.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake, MessageCircle, SkipForward } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, somarDias, whatsappLink } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { filaCobranca, preencherMensagem, type ContaCobranca, type Envio } from "@/lib/cobranca";
import { useStatusWhatsapp, type EtapaWa } from "@/components/financeiro/WhatsappOficial";

type Conta = ContaCobranca & {
  cliente?: { nome: string; nome_fantasia?: string | null; whatsapp?: string | null; telefone?: string | null; portal_token?: string | null; portal_link?: string | null } | null;
};

export function AgradecerPagamentos() {
  const invalidate = useInvalidate();
  const dia = hoje();
  const desde = somarDias(-7);
  const { data: etapas = [] } = useRows<EtapaWa>("regua_cobranca", { order: "ordem", ascending: true });
  const { data: wa } = useStatusWhatsapp();
  const { data: contas = [] } = useQuery({
    queryKey: ["contas_receber", "agradecer", desde],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_receber")
        .select("id, cliente_id, descricao, valor, valor_pago, vencimento, status, data_pagamento, unidade_id, forma_pagamento, cliente:clientes(nome, nome_fantasia, whatsapp, telefone, portal_token, portal_link)")
        .eq("status", "pago").gte("data_pagamento", desde).not("cliente_id", "is", null);
      if (error) throw error;
      return (data ?? []) as unknown as Conta[];
    },
  });
  const { data: envios = [] } = useQuery({
    queryKey: ["cobranca_envios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cobranca_envios").select("conta_receber_id, etapa_id, canal").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });
  const { data: cfg } = useQuery({ queryKey: ["configuracoes", "site_url"], queryFn: async () => (await supabase.from("configuracoes").select("site_url, nome_fantasia, razao_social").eq("id", 1).maybeSingle()).data });
  const automatica = (e: EtapaWa) => !!wa?.ativo && e.wa_status === "APPROVED" && e.wa_mensagem_base === e.mensagem;
  const fila = useMemo(() => filaCobranca(contas, etapas, envios, dia)
    .filter(({ conta: c, etapa: e }) => c.status === "pago" && !(automatica(e as EtapaWa) && (c.cliente?.whatsapp || c.cliente?.telefone))),
  [contas, etapas, envios, dia, wa]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fila.length) return null;

  const base = (cfg?.site_url || window.location.origin).replace(/\/$/, "");
  async function registrar(c: Conta, etapaId: string, situacao: "enviado" | "pulado") {
    const { error } = await supabase.rpc("registrar_cobranca", { p_conta: c.id, p_etapa: etapaId, p_canal: "whatsapp", p_situacao: situacao });
    if (error) return notifyError(error);
    invalidate("cobranca_envios", "contatos_cliente", "ficha_cliente");
  }

  return (
    <details className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-emerald-800">
        <HeartHandshake size={15} aria-hidden /> Agradecer pagamento ({fila.length})
        <span className="font-normal text-emerald-700">· clientes que acabaram de pagar</span>
      </summary>
      <ul className="mt-2 divide-y divide-emerald-100">
        {fila.map(({ conta: c, etapa: e }) => {
          const nome = c.cliente?.nome_fantasia?.trim() || c.cliente?.nome || "—";
          const texto = preencherMensagem(e.mensagem, {
            cliente: nome, descricao: c.descricao, valor: Number(c.valor_pago ?? c.valor), vencimento: c.vencimento, dias_atraso: 0,
            empresa: cfg?.nome_fantasia || cfg?.razao_social,
            link: c.cliente?.portal_token ? `${base}/cliente/${c.cliente.portal_link || c.cliente.portal_token}` : null, pix: null, pagamento: null,
          });
          const zap = c.cliente?.whatsapp || c.cliente?.telefone;
          return (
            <li key={c.id + e.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="min-w-40 flex-1">
                <b className="text-fg">{nome}</b>
                <span className="block text-xs text-slate-500">{c.descricao} · {brl(c.valor_pago ?? c.valor)} · pago em {dataBR(c.data_pagamento ?? "")}</span>
              </span>
              <Button variant="ghost" className="!px-2" title="Não mandar" onClick={() => registrar(c, e.id, "pulado")}><SkipForward size={14} /></Button>
              {zap ? (
                <a href={whatsappLink(zap, texto)} target="_blank" rel="noreferrer" onClick={() => registrar(c, e.id, "enviado")}
                  className="inline-flex items-center gap-1 rounded-lg bg-solido-verde px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  <MessageCircle size={14} /> Agradecer
                </a>
              ) : <span className="text-xs text-red-700">sem WhatsApp</span>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
