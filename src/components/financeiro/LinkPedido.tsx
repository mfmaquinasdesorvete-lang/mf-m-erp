// Pagamento do pedido aprovado: um link para tudo o que falta pagar, da InfinitePay (Pix ou cartão em até 12x) ou,
// na venda no cartão com Configurações → Recebimentos apontando para ele, do Checkout do Mercado Pago (cartão).
// Quando o cliente paga, as parcelas em aberto do pedido são baixadas sozinhas (função infinitepay).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, CreditCard, ExternalLink, Link2, Loader2, MessageCircle, Receipt } from "lucide-react";
import { Button } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { brl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { comoPagou, meiosDoLink, nomeProvedor, useCartaoNoMP, type CobrancaLink, type ProvedorLink } from "./LinkPagamento";

/** Meios em que a venda é paga pelo link (nos outros, o link só sai se o vendedor pedir). */
export const MEIOS_LINK = ["pix", "cartao"];

type Parcela = { id: string; valor: number; status: string };
type Pedido = { id: string; numero?: number | null; unidade_id?: string | null; valor_total?: number | null; forma_pagamento?: string | null };

export function mensagemLinkPedido(nome: string | undefined, numero: number | null | undefined, emAberto: number, total: number, url: string, provedor?: string | null) {
  return [
    `Olá ${nome?.split(" ")[0] ?? ""}! Sua compra na *MF Máquinas* foi confirmada${numero ? ` (pedido #${numero})` : ""}.`,
    emAberto < total ? `Valor em aberto: ${brl(emAberto)}` : `Total: ${brl(emAberto)}`,
    `\nPague ${meiosDoLink(provedor)} neste link:\n${url}`,
    "\nAssim que o pagamento cair, a gente já segue com o seu pedido.",
  ].join("\n");
}

/** A unidade tem conta na InfinitePay (sem unidade: a matriz). */
export function useTemInfinitePay(unidadeId: string | null | undefined) {
  const { unidades } = useUnidade();
  const u = unidades.find((x) => x.id === unidadeId) ?? (unidadeId ? null : unidades.find((x) => x.matriz));
  return !!u?.infinitepay_tag;
}

export function PagamentoPedido({ pedido, cliente, gerarAgora }: {
  pedido: Pedido; cliente?: { nome: string; whatsapp?: string | null } | null; gerarAgora?: boolean;
}) {
  const invalidar = useInvalidate();
  const temTag = useTemInfinitePay(pedido.unidade_id);
  // cartão pelo Checkout do Mercado Pago (Configurações → Recebimentos); o Pix continua pela InfinitePay
  const cartaoNoMP = useCartaoNoMP();
  const pode = temTag || cartaoNoMP;
  const [gerando, setGerando] = useState(false);
  const caixa = useRef<HTMLElement>(null);
  const gerou = useRef(false);
  const { data, isLoading } = useQuery({
    queryKey: ["cobrancas_link", "pedido", pedido.id],
    queryFn: async () => {
      const [c, l] = await Promise.all([
        supabase.from("contas_receber").select("id, valor, status").eq("pedido_id", pedido.id),
        supabase.from("cobrancas_link").select("*").eq("pedido_id", pedido.id).order("created_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      return { parcelas: (c.data ?? []) as Parcela[], links: (l.data ?? []) as CobrancaLink[] };
    },
  });
  const parcelas = data?.parcelas ?? [];
  const links = data?.links ?? [];
  const abertas = parcelas.filter((x) => x.status === "aberto");
  const emAberto = Math.round(abertas.reduce((s, x) => s + Number(x.valor), 0) * 100) / 100;
  const pago = links.find((l) => l.status === "pago");
  const aberto = links.find((l) => l.status === "aberto" && l.url);
  const desatualizado = !!aberto && Number(aberto.valor) !== emAberto;
  const comErro = links.find((l) => l.status === "erro");

  async function gerar(provedor?: ProvedorLink) {
    setGerando(true);
    try {
      const r = await callFunction<{ reaproveitado: boolean }>("infinitepay", { acao: "criar_pedido", pedido_id: pedido.id, provedor });
      notify(r.reaproveitado ? "O link deste pedido continua valendo" : "Link de pagamento criado: mande ao cliente");
    } catch (e) {
      notifyError(e);
    } finally {
      invalidar("cobrancas_link");
      setGerando(false);
    }
  }

  // venda acabou de ser aprovada por Pix ou cartão: o link já sai pronto para mandar
  useEffect(() => {
    if (!gerarAgora || isLoading || gerou.current) return;
    gerou.current = true;
    caixa.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (pode && abertas.length && (!aberto || desatualizado)) gerar();
  }, [gerarAgora, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !parcelas.length) return null;
  const copiar = (t: string, msg: string) => navigator.clipboard.writeText(t).then(() => notify(msg));
  const msg = aberto ? mensagemLinkPedido(cliente?.nome, pedido.numero, emAberto, Number(pedido.valor_total ?? emAberto), aberto.url!, aberto.provedor) : "";

  return (
    <section ref={caixa} className="space-y-3 rounded-xl border border-l-4 border-slate-200 border-l-modulo bg-slate-50 p-3 text-sm sm:p-4" aria-label="Pagamento do pedido">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-modulo-texto"><CreditCard size={16} /> Pagamento do cliente</h3>
        {abertas.length
          ? <span>Em aberto <b className="num">{brl(emAberto)}</b>{abertas.length > 1 && ` em ${abertas.length} parcelas`}</span>
          : <span className="font-semibold text-emerald-700">Pago</span>}
      </div>

      {pago && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-900">
          <b>Pago pelo link {nomeProvedor(pago.provedor)}</b> em {pago.pago_em ? new Date(pago.pago_em).toLocaleString("pt-BR") : "—"} por {comoPagou(pago)}
          {pago.taxa_valor ? ` (taxa ${brl(pago.taxa_valor)})` : ""}.
          {pago.recibo_url && <a href={pago.recibo_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold underline"><Receipt size={14} /> Recibo</a>}
          {pago.erro && <p className="mt-1 text-amber-800">{pago.erro}</p>}
        </div>
      )}

      {aberto && abertas.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input className="input font-mono text-xs" readOnly value={aberto.url!} onFocus={(e) => e.target.select()} aria-label="Link de pagamento do pedido" />
            <Button type="button" variant="secondary" title="Copiar o link" aria-label="Copiar o link" onClick={() => copiar(aberto.url!, "Link copiado")}><Copy size={15} /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cliente?.whatsapp && (
              <a href={whatsappLink(cliente.whatsapp, msg)} target="_blank" rel="noreferrer"
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-solido-verde px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 sm:min-h-0">
                <MessageCircle size={15} /> Mandar no WhatsApp
              </a>
            )}
            <Button type="button" variant="secondary" onClick={() => copiar(msg, "Mensagem copiada")}><Copy size={15} /> Copiar mensagem</Button>
            <a href={aberto.url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-2 text-sm text-brand hover:underline"><ExternalLink size={14} /> Abrir</a>
          </div>
          {desatualizado
            ? <p className="text-xs font-semibold text-amber-700">O saldo do pedido mudou depois do link ({brl(aberto.valor)}). Gere de novo antes de mandar.</p>
            : <p className="text-xs text-slate-500">Link {aberto.provedor === "mercadopago" ? "do Mercado Pago (cartão)" : "da InfinitePay (Pix ou cartão)"}. Quando o cliente pagar, {abertas.length > 1 ? "as parcelas são baixadas" : "a conta é baixada"} sozinha{abertas.length > 1 ? "s" : ""} e a taxa entra em contas a pagar.</p>}
        </div>
      )}

      {comErro && !aberto && abertas.length > 0 && <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">Última tentativa: {comErro.erro}</p>}

      {abertas.length > 0 && !pode && (
        <p className="text-xs text-slate-500">Para mandar link de pagamento (Pix ou cartão em até 12x), cadastre a InfiniteTag da unidade em Configurações → Unidades.</p>
      )}
      {abertas.length > 0 && pode && (!aberto || desatualizado) && (cartaoNoMP ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Um link só para {abertas.length > 1 ? "todas as parcelas" : "o pedido"}: cartão em até 12x pelo Mercado Pago{temTag ? " ou Pix pela InfinitePay" : ""}.</span>
          <span className="flex flex-wrap gap-2">
            <Button type="button" variant={pedido.forma_pagamento === "pix" ? "secondary" : "primary"} disabled={gerando} onClick={() => gerar("mercadopago")}>
              {gerando ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Link do cartão (Mercado Pago)
            </Button>
            {temTag && <Button type="button" variant={pedido.forma_pagamento === "pix" ? "primary" : "secondary"} disabled={gerando} onClick={() => gerar("infinitepay")}>Link Pix (InfinitePay)</Button>}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Um link só para {abertas.length > 1 ? "todas as parcelas" : "o pedido"}: o cliente escolhe Pix ou cartão em até 12x.</span>
          <Button type="button" disabled={gerando} onClick={() => gerar()}>
            {gerando ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} {aberto ? "Gerar de novo" : "Gerar link de pagamento"}
          </Button>
        </div>
      ))}
    </section>
  );
}
