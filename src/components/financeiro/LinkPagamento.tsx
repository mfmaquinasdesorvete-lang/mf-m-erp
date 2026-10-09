import { useState } from "react";
import { Copy, ExternalLink, Link2, Loader2, MessageCircle, Receipt } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { brl, dataBR, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";

/** Link de pagamento da InfinitePay (Pix ou cartão) ligado a uma conta a receber. */
export type CobrancaLink = {
  id: string; conta_receber_id: string | null; status: "aberto" | "pago" | "descartado" | "erro"; url: string | null; valor: number;
  handle: string; metodo: string | null; parcelas: number | null; recibo_url: string | null; pago_em: string | null; erro: string | null; created_at: string;
};
type Conta = { id: string; descricao: string; valor: number; vencimento: string; status: string; cliente?: { nome: string; whatsapp?: string | null } | null };

export const comoPagou = (l: Pick<CobrancaLink, "metodo" | "parcelas">) =>
  (l.metodo ?? "").toLowerCase() === "pix" ? "Pix" : `cartão${(l.parcelas ?? 1) > 1 ? ` em ${l.parcelas}x` : ""}`;

/** Mensagem do WhatsApp com o link. */
export function mensagemLink(c: Conta, url: string) {
  return [
    `Olá ${c.cliente?.nome.split(" ")[0] ?? ""}! Segue o link para pagamento da *MF Máquinas*:`,
    c.descricao,
    `Valor: ${brl(c.valor)} · Vencimento: ${dataBR(c.vencimento)}`,
    `\nPague por Pix ou cartão (em até 12x):\n${url}`,
  ].join("\n");
}

/** Linha curta para a lista: pago pelo link (com recibo) ou link enviado. */
export function SituacaoLink({ links }: { links: CobrancaLink[] }) {
  const pago = links.find((l) => l.status === "pago");
  if (pago) return (
    <span className="text-xs text-emerald-700">
      · pago pelo link ({comoPagou(pago)})
      {pago.recibo_url && <> · <a href={pago.recibo_url} target="_blank" rel="noreferrer" className="underline">recibo</a></>}
      {pago.erro && <span className="text-amber-700"> · {pago.erro}</span>}
    </span>
  );
  if (links.some((l) => l.status === "aberto" && l.url)) return <span className="text-xs text-sky-700"> · link de pagamento enviado</span>;
  return null;
}

export function LinkPagamentoModal({ conta, links, onClose }: { conta: Conta; links: CobrancaLink[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [gerando, setGerando] = useState(false);
  const aberto = links.find((l) => l.status === "aberto" && l.url);
  const desatualizado = aberto && Number(aberto.valor) !== Number(conta.valor);
  const pago = links.find((l) => l.status === "pago");
  const comErro = links.find((l) => l.status === "erro");

  async function gerar() {
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("infinitepay", { body: { acao: "criar", conta_id: conta.id } });
      if (error || data?.error) throw new Error(data?.error ?? (await lerErro(error)));
      notify(data.reaproveitado ? "O link desta conta continua valendo" : "Link de pagamento criado");
      invalidar("cobrancas_link");
    } catch (e) {
      notifyError(e);
      invalidar("cobrancas_link");
    } finally {
      setGerando(false);
    }
  }
  async function descartar(id: string) {
    const { error } = await supabase.rpc("descartar_cobranca_link", { p_id: id });
    if (error) return notifyError(error);
    invalidar("cobrancas_link");
  }
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => notify("Link copiado"));

  return (
    <Modal open onClose={onClose} title="Link de pagamento (InfinitePay)">
      <div className="space-y-4 text-sm">
        <div>
          <div className="font-semibold text-fg">{conta.descricao}</div>
          <div className="text-slate-500">{conta.cliente?.nome ?? "Sem cliente"} · {brl(conta.valor)} · vence {dataBR(conta.vencimento)}</div>
        </div>

        {pago && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <b>Pago pelo link</b> em {pago.pago_em ? new Date(pago.pago_em).toLocaleString("pt-BR") : "—"} por {comoPagou(pago)}.
            {pago.recibo_url && <a href={pago.recibo_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold underline"><Receipt size={14} /> Recibo</a>}
            {pago.erro && <p className="mt-1 text-amber-800">{pago.erro}</p>}
          </div>
        )}

        {aberto && !pago && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <input className="input font-mono text-xs" readOnly value={aberto.url!} onFocus={(e) => e.target.select()} aria-label="Link de pagamento" />
              <Button type="button" variant="secondary" title="Copiar o link" onClick={() => copiar(aberto.url!)}><Copy size={15} /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {conta.cliente?.whatsapp && (
                <a href={whatsappLink(conta.cliente.whatsapp, mensagemLink(conta, aberto.url!))} target="_blank" rel="noreferrer"
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:min-h-0">
                  <MessageCircle size={15} /> Mandar no WhatsApp
                </a>
              )}
              <Button type="button" variant="secondary" onClick={() => copiar(mensagemLink(conta, aberto.url!))}><Copy size={15} /> Copiar mensagem</Button>
              <a href={aberto.url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-2 text-sm text-brand hover:underline"><ExternalLink size={14} /> Abrir</a>
            </div>
            <p className="text-xs text-slate-500">
              Criado em {new Date(aberto.created_at).toLocaleString("pt-BR")} na conta <b>${aberto.handle}</b>. Quando o cliente pagar, a conta é baixada sozinha e aparece o recibo.
            </p>
            {desatualizado && <p className="text-xs font-semibold text-amber-700">O valor da conta mudou depois do link ({brl(aberto.valor)}). Gere de novo antes de mandar.</p>}
          </div>
        )}

        {comErro && !aberto && !pago && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Última tentativa: {comErro.erro}</p>}

        {conta.status === "aberto" && !pago && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {aberto
              ? <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => descartar(aberto.id)}>Tirar este link da conta</button>
              : <span className="text-xs text-slate-500">O cliente escolhe Pix ou cartão (em até 12x) na página da InfinitePay.</span>}
            {(!aberto || desatualizado) && (
              <Button type="button" disabled={gerando} onClick={gerar}>
                {gerando ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} {aberto ? "Gerar de novo" : "Gerar link"}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

async function lerErro(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    const j = await ctx.json().catch(() => null);
    if (j?.error) return j.error;
  }
  return (error as Error)?.message ?? "não foi possível criar o link";
}
