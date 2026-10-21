// Rastreio das entregas (Fretes → Rastreio): quais envios estão na estrada, a mensagem pronta para o cliente e o
// link de acompanhar da transportadora. O e-mail automático sai pelo banco quando o código é preenchido.
import type { Envio } from "./fretes";

export type GrupoRastreio = "sem_codigo" | "a_caminho" | "atrasado" | "entregue";

/** Em que ponto do rastreio está o envio (null = fora da tela: em cotação, aprovação ou cancelado). */
export function grupoRastreio(e: Pick<Envio, "status" | "codigo_rastreio" | "entrega_prevista" | "entregue_em">, hoje: string): GrupoRastreio | null {
  if (e.status === "entregue") return e.entregue_em && dias(e.entregue_em, hoje) <= 15 ? "entregue" : null;
  if (e.status !== "transito" && e.status !== "coleta") return null;
  if (!e.codigo_rastreio?.trim()) return e.status === "transito" ? "sem_codigo" : null;
  return e.entrega_prevista && e.entrega_prevista < hoje ? "atrasado" : "a_caminho";
}
const dias = (de: string, ate: string) => Math.round((Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))) / 86_400_000);

/** Texto do WhatsApp para o cliente acompanhar a entrega. */
export function mensagemRastreio(d: { cliente?: string | null; pedido?: number | null; transportadora?: string | null; codigo: string; link?: string | null; previsao?: string | null }) {
  const nome = d.cliente?.trim().split(/\s+/)[0];
  const prev = d.previsao ? new Date(`${d.previsao.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : null;
  return [
    `Olá${nome ? `, ${nome}` : ""}! Seu pedido${d.pedido ? ` #${d.pedido}` : ""} já está a caminho 🚚`,
    d.transportadora ? `Transportadora: ${d.transportadora}` : null,
    `Código de rastreio: ${d.codigo}`,
    prev ? `Previsão de entrega: ${prev}` : null,
    d.link ? `Acompanhe aqui: ${d.link}` : null,
  ].filter(Boolean).join("\n");
}
