// Compras (OC) e Produção (OP) no quadro por etapas, no jeito do Fluxo de pedidos: etapa, há quanto tempo,
// se precisa de ação (e por quê) e o próximo passo.
import type { Nivel } from "@/components/quadro/QuadroEtapas";

const dias = (de: string, hoje: string) => Math.floor((new Date(`${hoje}T12:00:00`).getTime() - new Date(`${de.slice(0, 10)}T12:00:00`).getTime()) / 86400000);
type Sit<E extends string, A extends string> = { etapa: E; nivel: Nivel; alerta: string | null; desde: string; acao: A; proximo: string };

// ---------- Compras ----------
export type EtapaOC = "cotacao" | "enviado" | "parcial" | "recebido";
export const ETAPAS_OC: { id: EtapaOC; titulo: string; curto: string; frase: string; cor: string }[] = [
  { id: "cotacao", titulo: "Em cotação", curto: "Cotação", frase: "Pedimos o preço; falta confirmar com o fornecedor.", cor: "#0ea5e9" },
  { id: "enviado", titulo: "A caminho", curto: "A caminho", frase: "Pedido feito; falta a mercadoria chegar.", cor: "#f59e0b" },
  { id: "parcial", titulo: "Chegou parte", curto: "Parcial", frase: "Recebemos uma parte; falta o resto.", cor: "#f97316" },
  { id: "recebido", titulo: "Recebidas (15 dias)", curto: "Recebidas", frase: "Tudo entrou no estoque.", cor: "#10b981" },
];
export type OCQuadro = { status: string; created_at?: string | null; data?: string | null; enviado_em?: string | null; recebido_em?: string | null; previsao_entrega?: string | null; fornecedor_id?: string | null };
export function situacaoOC(p: OCQuadro, hoje: string): Sit<EtapaOC, "abrir" | "receber"> | null {
  if (!["cotacao", "enviado", "parcial", "recebido"].includes(p.status)) return null;
  const etapa = p.status as EtapaOC;
  const desde = (etapa === "recebido" ? p.recebido_em : etapa === "cotacao" ? p.data ?? p.created_at : p.enviado_em ?? p.created_at) ?? hoje;
  if (etapa === "recebido") return dias(desde, hoje) > 15 ? null : { etapa, nivel: 0, alerta: null, desde, acao: "abrir", proximo: "Nada; fica no histórico" };
  if (etapa === "cotacao") {
    if (!p.fornecedor_id) return { etapa, nivel: 1, alerta: "sem fornecedor", desde, acao: "abrir", proximo: "Escolher o fornecedor e pedir o preço" };
    return dias(desde, hoje) > 3
      ? { etapa, nivel: 1, alerta: "cotação parada", desde, acao: "abrir", proximo: "Cobrar o preço e confirmar o pedido" }
      : { etapa, nivel: 0, alerta: null, desde, acao: "abrir", proximo: "Preencher os preços e confirmar o pedido" };
  }
  if (p.previsao_entrega && p.previsao_entrega < hoje) return { etapa, nivel: 2, alerta: "entrega atrasada", desde, acao: "receber", proximo: "Cobrar o fornecedor ou dar entrada" };
  if (etapa === "parcial" && dias(desde, hoje) > 7) return { etapa, nivel: 1, alerta: "falta o resto há dias", desde, acao: "receber", proximo: "Cobrar o que falta" };
  return { etapa, nivel: 0, alerta: null, desde, acao: "receber", proximo: etapa === "parcial" ? "Dar entrada no que falta" : "Dar entrada quando chegar" };
}

// ---------- Produção ----------
export type EtapaOP = "planejada" | "em_producao" | "concluida";
export const ETAPAS_OP: { id: EtapaOP; titulo: string; curto: string; frase: string; cor: string }[] = [
  { id: "planejada", titulo: "Planejadas", curto: "Planejadas", frase: "Programada; falta ter as peças e começar.", cor: "#0ea5e9" },
  { id: "em_producao", titulo: "Em produção", curto: "Produzindo", frase: "Na bancada; falta concluir e dar entrada.", cor: "#f59e0b" },
  { id: "concluida", titulo: "Prontas no mês", curto: "Prontas", frase: "Concluídas e no estoque.", cor: "#10b981" },
];
export type OPQuadro = { status: string; created_at?: string | null; previsao?: string | null; concluida_em?: string | null; iniciada_em?: string | null };
export function situacaoOP(o: OPQuadro, faltam: number, hoje: string): Sit<EtapaOP, "iniciar" | "comprar" | "abrir"> | null {
  if (!["planejada", "em_producao", "concluida"].includes(o.status)) return null;
  const etapa = o.status as EtapaOP;
  if (etapa === "concluida") {
    const desde = o.concluida_em ?? o.created_at ?? hoje;
    return desde.slice(0, 7) !== hoje.slice(0, 7) ? null : { etapa, nivel: 0, alerta: null, desde, acao: "abrir", proximo: "Nada; já está no estoque" };
  }
  const desde = (etapa === "em_producao" ? o.iniciada_em : null) ?? o.created_at ?? hoje;
  const atrasada = !!o.previsao && o.previsao < hoje;
  if (etapa === "planejada") {
    if (faltam > 0) return { etapa, nivel: atrasada ? 2 : 1, alerta: atrasada ? "atrasada" : "faltam peças", desde, acao: "comprar", proximo: `Comprar ${faltam} ${faltam === 1 ? "peça que falta" : "peças que faltam"}` };
    return { etapa, nivel: atrasada ? 2 : 0, alerta: atrasada ? "atrasada" : null, desde, acao: "iniciar", proximo: "Peças ok: começar a produzir" };
  }
  return { etapa, nivel: atrasada ? 2 : 0, alerta: atrasada ? "atrasada" : null, desde, acao: "abrir", proximo: "Concluir e dar entrada no estoque" };
}
