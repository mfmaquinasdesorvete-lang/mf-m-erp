// Situação das notas fiscais com ícone, cor e texto (a cor nunca vem sozinha), e as abas das listas.
import { Ban, CircleCheck, CircleX, Clock, FlaskConical, Hourglass, LoaderCircle, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";

export type Situacao = { chave: string; rotulo: string; Icone: LucideIcon; cor: string };

const S = (chave: string, rotulo: string, Icone: LucideIcon, cor: string): Situacao => ({ chave, rotulo, Icone, cor });

export type NotaEmitidaBase = {
  status: string; ambiente?: string | null; finalidade?: string | null; tipo_operacao?: string | null; origem?: string | null;
};

export function situacaoEmitida(n: NotaEmitidaBase): Situacao {
  switch (n.status) {
    case "autorizada": return S("autorizada", "Autorizada", CircleCheck, "text-emerald-600");
    case "cancelada": return S("cancelada", "Cancelada", CircleX, "text-slate-500");
    case "erro": return S("erro", "Rejeitada", TriangleAlert, "text-red-600");
    case "processando": return S("processando", "Processando", LoaderCircle, "text-sky-600");
    case "contingencia": return S("contingencia", "Na fila (contingência)", Hourglass, "text-amber-600");
    case "denegada": return S("denegada", "Denegada", Ban, "text-red-700");
    default: return S(n.status, n.status, Clock, "text-slate-500");
  }
}

export function situacaoRecebida(n: { situacao: string; processamento: string }): Situacao {
  if (n.situacao === "cancelada") return S("cancelada", "Cancelada pelo fornecedor", CircleX, "text-slate-500");
  switch (n.processamento) {
    case "concluido": return S("concluido", "Lançada", CircleCheck, "text-emerald-600");
    case "ignorada": return S("ignorada", "Histórico / ignorada", Clock, "text-slate-500");
    case "aguardando_vinculo": return S("aguardando_vinculo", "Falta vincular produto", TriangleAlert, "text-amber-600");
    case "revisao": return S("revisao", "Conferir", TriangleAlert, "text-orange-600");
    case "aguardando_xml": return S("aguardando_xml", "Aguardando XML", Hourglass, "text-sky-600");
    default: return S("pendente", "A processar", LoaderCircle, "text-sky-600");
  }
}

export const IconeTeste = FlaskConical;
export const IconeDevolucao = Undo2;

/** Abas da lista de emitidas (como no Tiny), com o filtro de cada uma. */
export const ABAS_EMITIDAS: { valor: string; rotulo: string; filtro: (n: NotaEmitidaBase) => boolean }[] = [
  { valor: "todas", rotulo: "Todas", filtro: () => true },
  { valor: "pendentes", rotulo: "Pendentes", filtro: (n) => ["erro", "processando", "contingencia"].includes(n.status) && n.ambiente !== "homologacao" },
  { valor: "autorizadas", rotulo: "Autorizadas", filtro: (n) => n.status === "autorizada" && n.ambiente !== "homologacao" },
  { valor: "canceladas", rotulo: "Canceladas", filtro: (n) => ["cancelada", "denegada"].includes(n.status) && n.ambiente !== "homologacao" },
  { valor: "devolucoes", rotulo: "Devoluções", filtro: (n) => n.finalidade === "devolucao" },
  { valor: "teste", rotulo: "Teste", filtro: (n) => n.ambiente === "homologacao" },
];

export const ABAS_RECEBIDAS: { valor: string; rotulo: string; filtro: (n: { situacao: string; processamento: string; finalidade?: string | null }) => boolean }[] = [
  { valor: "todas", rotulo: "Todas", filtro: () => true },
  { valor: "pendentes", rotulo: "A resolver", filtro: (n) => n.situacao !== "cancelada" && ["pendente", "aguardando_xml", "aguardando_vinculo", "revisao"].includes(n.processamento) },
  { valor: "lancadas", rotulo: "Lançadas", filtro: (n) => n.processamento === "concluido" },
  { valor: "historico", rotulo: "Histórico", filtro: (n) => n.processamento === "ignorada" && n.situacao !== "cancelada" },
  { valor: "devolucoes", rotulo: "Devoluções", filtro: (n) => n.finalidade === "devolucao" },
  { valor: "canceladas", rotulo: "Canceladas", filtro: (n) => n.situacao === "cancelada" },
];

/** Pode excluir: rejeitada, de teste ou importada (o banco confere de novo). */
export const podeExcluirEmitida = (n: NotaEmitidaBase & { estoque_lancado?: boolean }) =>
  !["processando", "contingencia"].includes(n.status) && !n.estoque_lancado && (n.status === "erro" || n.ambiente === "homologacao" || n.origem === "importada");

/** Pode fazer devolução: venda autorizada (o mesmo ambiente de quando foi emitida). */
export const podeDevolverEmitida = (n: NotaEmitidaBase) =>
  n.status === "autorizada" && (n.finalidade ?? "normal") === "normal" && (n.tipo_operacao ?? "saida") === "saida";

export const numeroDaChave = (chave?: string | null) => (chave && chave.length === 44 ? chave.slice(25, 34).replace(/^0+/, "") : "");
