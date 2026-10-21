// Rastreio das entregas (Fretes → Rastreio): quais envios estão na estrada, a mensagem pronta para o cliente e o
// link de acompanhar da transportadora. O e-mail automático sai pelo banco quando o código é preenchido.
import type { Envio } from "./fretes";

export type GrupoRastreio = "sem_codigo" | "chegando" | "a_caminho" | "atrasado" | "entregue";

/** Em que ponto do rastreio está o envio (null = fora da tela: em cotação, aprovação ou cancelado). */
export function grupoRastreio(e: Pick<Envio, "status" | "codigo_rastreio" | "entrega_prevista" | "entregue_em">, hoje: string): GrupoRastreio | null {
  if (e.status === "entregue") return e.entregue_em && dias(e.entregue_em, hoje) <= 15 ? "entregue" : null;
  if (e.status !== "transito" && e.status !== "coleta") return null;
  if (!e.codigo_rastreio?.trim()) return e.status === "transito" ? "sem_codigo" : null;
  if (e.entrega_prevista && e.entrega_prevista < hoje) return "atrasado";
  // chega hoje ou amanhã: hora de avisar o cliente com antecedência
  if (e.entrega_prevista && e.entrega_prevista <= somarDia(hoje, 1)) return "chegando";
  return "a_caminho";
}
const somarDia = (d: string, n: number) => new Date(Date.parse(`${d.slice(0, 10)}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
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

const primeiroNome = (c?: string | null) => c?.trim().split(/\s+/)[0];
const dataCurta = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : null);

/** WhatsApp de "está chegando": avisar o cliente com antecedência (hoje ou amanhã). */
export function mensagemChegando(d: { cliente?: string | null; pedido?: number | null; transportadora?: string | null; codigo?: string | null; link?: string | null; previsao?: string | null; hoje: string }) {
  const nome = primeiroNome(d.cliente);
  const quando = d.previsao?.slice(0, 10) === d.hoje ? "hoje" : d.previsao ? `amanhã (${dataCurta(d.previsao)})` : "nos próximos dias";
  return [
    `Olá${nome ? `, ${nome}` : ""}! Boa notícia: seu pedido${d.pedido ? ` #${d.pedido}` : ""} deve chegar ${quando} 📦`,
    "Se possível, deixe alguém para receber e conferir os volumes na entrega.",
    d.transportadora ? `Transportadora: ${d.transportadora}` : null,
    d.codigo ? `Código de rastreio: ${d.codigo}` : null,
    d.link ? `Acompanhe aqui: ${d.link}` : null,
  ].filter(Boolean).join("\n");
}

/** WhatsApp de atraso: proativo, com a explicação e o que estamos fazendo. */
export function mensagemAtraso(d: { cliente?: string | null; pedido?: number | null; transportadora?: string | null; codigo?: string | null; link?: string | null; previsao?: string | null; motivo?: string | null }) {
  const nome = primeiroNome(d.cliente);
  return [
    `Olá${nome ? `, ${nome}` : ""}! Passando para avisar: a entrega do seu pedido${d.pedido ? ` #${d.pedido}` : ""} atrasou${d.previsao ? ` (a previsão era ${dataCurta(d.previsao)})` : ""}.`,
    d.motivo?.trim() ? `O que aconteceu: ${d.motivo.trim()}` : "A transportadora ainda não confirmou a entrega e já estamos cobrando uma nova data.",
    "Estamos acompanhando de perto e te aviso assim que tiver novidade. Desculpe o transtorno!",
    d.transportadora ? `Transportadora: ${d.transportadora}` : null,
    d.codigo ? `Código de rastreio: ${d.codigo}` : null,
    d.link ? `Acompanhe aqui: ${d.link}` : null,
  ].filter(Boolean).join("\n");
}
