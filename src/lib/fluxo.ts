// Fluxo de pedidos: em que etapa cada pedido está, há quanto tempo, qual é o próximo passo
// e o que precisa de ação agora. São regras só de tela: as de negócio ficam no banco (avancar_expedicao, nfe-emitir).
import { dataBR, hoje } from "./format";
import { MOTIVOS } from "./propostas";
import type { Cliente, Item, Pedido } from "./types";

export type Exp = {
  id: string; pedido_id: string; status: string; itens_conferidos: string[]; volumes: number | null; peso_kg: number | null;
  transportadora_id: string | null; codigo_rastreio: string | null; responsavel: string | null; observacoes: string | null;
  separando_em: string | null; conferido_em: string | null; embalado_em: string | null; despachado_em: string | null; entregue_em: string | null; created_at: string;
};
export type NotaFluxo = { id: string; status: string; numero: string | null; serie?: string | null; chave?: string | null; mensagem: string | null; ambiente?: string; created_at?: string };
export type PedidoFluxo = Omit<Pedido, "itens" | "notas" | "cliente"> & { itens: (Item & { id: string })[]; cliente: Cliente; notas: NotaFluxo[] };
/** Envio do painel de fretes ligado ao pedido (só o que o fluxo usa). */
export type EnvioFluxo = { id: string; pedido_id: string | null; status: string; entrega_prevista: string | null; codigo_rastreio: string | null };

export type ColunaId = "orcamento" | "nfe" | "separar" | "embalar" | "transito" | "entregue";
export const COLUNAS: { id: ColunaId; titulo: string; curto: string; frase: string; cor: string }[] = [
  { id: "orcamento", titulo: "Orçamentos e propostas", curto: "Orçamentos", frase: "Proposta com o cliente, esperando a resposta.", cor: "var(--kpi-roxo)" },
  { id: "nfe", titulo: "Aprovados · nota fiscal", curto: "Nota fiscal", frase: "Venda fechada: emitir a NF-e para liberar a mercadoria.", cor: "var(--kpi-laranja)" },
  { id: "separar", titulo: "Separar e conferir", curto: "Separar", frase: "Pegar os itens no estoque e conferir um a um.", cor: "var(--kpi-ciano)" },
  { id: "embalar", titulo: "Embalar e despachar", curto: "Embalar", frase: "Embalar, imprimir as etiquetas e entregar à transportadora.", cor: "var(--kpi-azul, #3b82f6)" },
  { id: "transito", titulo: "Em trânsito", curto: "Em trânsito", frase: "A caminho do cliente: marcar quando chegar.", cor: "var(--kpi-verde)" },
  { id: "entregue", titulo: "Entregues (15 dias)", curto: "Entregues", frase: "Entregues nos últimos 15 dias.", cor: "#64748b" },
];

/** 0 em dia · 1 atenção (âmbar) · 2 atrasado (vermelho) */
export type Nivel = 0 | 1 | 2;
export type TipoAlerta =
  | "proposta_sem_resposta" | "proposta_vencida" | "sem_nfe" | "nfe_rejeitada" | "separacao_parada"
  | "embalagem_parada" | "sem_despachar" | "sem_rastreio" | "entrega_atrasada";
/** Como cada alerta aparece no resumo (singular / plural). */
export const ALERTAS: Record<TipoAlerta, [string, string]> = {
  proposta_sem_resposta: ["proposta sem resposta", "propostas sem resposta"],
  proposta_vencida: ["proposta vencida", "propostas vencidas"],
  sem_nfe: ["aprovado sem NF-e", "aprovados sem NF-e"],
  nfe_rejeitada: ["NF-e rejeitada", "NF-e rejeitadas"],
  separacao_parada: ["separação parada", "separações paradas"],
  embalagem_parada: ["conferido sem embalar", "conferidos sem embalar"],
  sem_despachar: ["embalado sem despachar", "embalados sem despachar"],
  sem_rastreio: ["despachado sem rastreio", "despachados sem rastreio"],
  entrega_atrasada: ["entrega atrasada", "entregas atrasadas"],
};

export type Acao =
  | "enviar_proposta" | "cobrar_whatsapp" | "abrir_pedido" | "corrigir_nfe" | "emitir_nfe"
  | "comecar_separar" | "conferir" | "embalar" | "despachar" | "informar_rastreio" | "marcar_entregue";

export type TomNota = "ok" | "info" | "atencao" | "erro";
export type Situacao = {
  coluna: ColunaId;
  /** quando o pedido entrou na etapa atual */
  desde: string;
  /** ex.: "aprovado há 2 dias" */
  tempo: string;
  /** próximo passo, em palavras simples */
  passo: string;
  /** linha extra (rastreio, mensagem da SEFAZ...) */
  detalhe?: string;
  acao?: Acao;
  nivel: Nivel;
  alerta?: TipoAlerta;
  /** frase curta do alerta, ex.: "Sem resposta do cliente" */
  motivo?: string;
  nota: { rotulo: string; tom: TomNota } | null;
};

const DIA = 864e5;
const ms = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).getTime() : NaN);

/** "agora há pouco", "há 5 h", "há 1 dia", "há 3 dias" */
export function haQuanto(iso: string, agora = Date.now()) {
  const h = (agora - ms(iso)) / 36e5;
  if (!Number.isFinite(h) || h < 1) return "agora há pouco";
  if (h < 24) return `há ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

/** NF-e que vale para a mercadoria sair (autorizada e não de teste). */
export const notaValida = (p: PedidoFluxo) => p.notas?.find((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
export const notaNaSefaz = (p: PedidoFluxo) => p.notas?.find((n) => ["processando", "contingencia"].includes(n.status));
/** Última tentativa recusada pela SEFAZ (só conta se não há outra válida ou em andamento). */
function notaRecusada(p: PedidoFluxo) {
  return (p.notas ?? []).filter((n) => ["erro", "denegada"].includes(n.status))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
}

function chipNota(p: PedidoFluxo): Situacao["nota"] {
  if (p.status === "orcamento") return null;
  const v = notaValida(p);
  if (v) return { rotulo: v.numero ? `NF-e ${v.numero}` : "NF-e autorizada", tom: "ok" };
  if (notaNaSefaz(p)) return { rotulo: "NF-e na SEFAZ", tom: "info" };
  if (notaRecusada(p)) return { rotulo: "NF-e rejeitada", tom: "erro" };
  if (p.notas?.some((n) => n.status === "autorizada")) return { rotulo: "só NF-e de teste", tom: "atencao" };
  return { rotulo: "sem NF-e", tom: "atencao" };
}

/** Coluna do quadro (null = fora do fluxo: cancelado, entregue há mais de 15 dias, proposta perdida há mais de 15 dias). */
export function coluna(p: PedidoFluxo, e?: Exp, agora = Date.now()): ColunaId | null {
  if (p.status === "orcamento") {
    if (p.proposta_status === "rejeitada" || p.proposta_status === "expirada") {
      const fim = p.proposta_respondida_em ?? p.proposta_validade ?? p.created_at;
      return agora - ms(fim) < 15 * DIA ? "orcamento" : null;
    }
    return "orcamento";
  }
  if (p.status === "cancelado" || e?.status === "cancelada") return null;
  if (p.status === "entregue" || e?.status === "entregue") {
    const d = e?.entregue_em ?? p.created_at;
    return agora - ms(d) < 15 * DIA ? "entregue" : null;
  }
  if (e) return e.status === "despachado" ? "transito" : ["conferido", "embalado"].includes(e.status) ? "embalar" : "separar";
  return "nfe";
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Etapa, tempo na etapa, próximo passo e alerta de um pedido. */
export function situacao(p: PedidoFluxo, e: Exp | undefined, envio: EnvioFluxo | undefined, agora = Date.now()): Situacao | null {
  const col = coluna(p, e, agora);
  if (!col) return null;
  const nota = chipNota(p);
  const dias = (iso: string) => (agora - ms(iso)) / DIA;
  const n = (iso: string) => Math.floor(dias(iso));
  const s = (desde: string, rotulo: string, resto: Omit<Situacao, "coluna" | "desde" | "tempo" | "nota" | "nivel"> & { nivel?: Nivel }): Situacao =>
    ({ coluna: col, desde, tempo: `${rotulo} ${haQuanto(desde, agora)}`, nota, nivel: 0, ...resto });

  switch (col) {
    case "orcamento": {
      const st = p.proposta_status;
      const zap = p.cliente?.whatsapp ? "cobrar_whatsapp" as const : undefined;
      if (st === "rejeitada") {
        const motivo = MOTIVOS[p.motivo_rejeicao ?? ""];
        return s(p.proposta_respondida_em ?? p.created_at, "recusada", { passo: `Cliente recusou${motivo ? `: ${motivo.toLowerCase()}` : ""}.`, detalhe: p.motivo_rejeicao_texto ?? undefined });
      }
      const enviada = p.proposta_enviada_em ?? p.created_at;
      if (st === "expirada" || ((st === "enviada" || st === "visualizada") && p.proposta_validade && p.proposta_validade < hoje())) {
        return s(enviada, "enviada", { passo: "Renovar a validade ou falar com o cliente.", acao: "abrir_pedido", nivel: 1, alerta: "proposta_vencida",
          motivo: p.proposta_validade ? `Venceu em ${dataBR(p.proposta_validade)}` : "Proposta vencida" });
      }
      if (st === "enviada" || st === "visualizada") {
        const d = dias(enviada);
        if (d > 3) {
          return s(enviada, "enviada", { passo: "Cobrar a resposta do cliente.", acao: zap ?? "abrir_pedido", nivel: d > 7 ? 2 : 1, alerta: "proposta_sem_resposta",
            motivo: st === "visualizada" ? "Abriu e não respondeu" : "Sem resposta do cliente" });
        }
        return s(enviada, "enviada", { passo: st === "visualizada" ? "O cliente já abriu a proposta: bom momento para falar com ele." : "Esperando o cliente abrir a proposta.", acao: zap });
      }
      return s(p.created_at, "criado", { passo: "Enviar a proposta ao cliente.", acao: "enviar_proposta" });
    }

    case "nfe": {
      const desde = p.aprovado_em ?? p.created_at;
      if (notaNaSefaz(p)) return s(desde, "aprovado", { passo: "NF-e na SEFAZ: aguarde a autorização." });
      if (notaValida(p)) return s(desde, "aprovado", { passo: "NF-e autorizada: o pedido entra na expedição em seguida.", acao: "abrir_pedido" });
      const recusada = notaRecusada(p);
      if (recusada) {
        return s(desde, "aprovado", { passo: "Corrigir o cadastro e emitir a nota de novo.", detalhe: recusada.mensagem ?? undefined, acao: "corrigir_nfe",
          nivel: 2, alerta: "nfe_rejeitada", motivo: "NF-e rejeitada pela SEFAZ" });
      }
      return s(desde, "aprovado", { passo: "Emitir a nota fiscal.", acao: "emitir_nfe", nivel: dias(desde) > 2 ? 2 : 1, alerta: "sem_nfe", motivo: "Sem NF-e" });
    }

    case "separar": {
      if (!e) break;
      const desde = e.status === "separando" ? e.separando_em ?? e.created_at : e.created_at;
      const parada = dias(desde) > 1;
      const alerta = parada ? { nivel: (dias(desde) > 3 ? 2 : 1) as Nivel, alerta: "separacao_parada" as const, motivo: e.status === "separando" ? "Separação parada" : "Esperando separação" } : {};
      return e.status === "separando"
        ? s(desde, "separando", { passo: "Conferir item a item (leitor ou lista).", acao: "conferir", detalhe: e.responsavel ? `Separando: ${e.responsavel}` : undefined, ...alerta })
        : s(desde, "na fila", { passo: "Pegar os itens no estoque.", acao: "comecar_separar", ...alerta });
    }

    case "embalar": {
      if (!e) break;
      if (e.status === "conferido") {
        const desde = e.conferido_em ?? e.created_at;
        return s(desde, "conferido", { passo: "Embalar: informar volumes e peso.", acao: "embalar",
          ...(dias(desde) > 1 ? { nivel: (dias(desde) > 3 ? 2 : 1) as Nivel, alerta: "embalagem_parada" as const, motivo: "Esperando embalagem" } : {}) });
      }
      const desde = e.embalado_em ?? e.created_at;
      const volumes = e.volumes ? `${e.volumes} ${plural(e.volumes, "volume", "volumes")}${e.peso_kg ? ` · ${Number(e.peso_kg).toLocaleString("pt-BR")} kg` : ""}` : undefined;
      if (!notaValida(p) && notaNaSefaz(p)) return s(desde, "embalado", { passo: "NF-e na SEFAZ: despache assim que autorizar.", detalhe: volumes });
      if (!notaValida(p)) {
        return s(desde, "embalado", { passo: "Emitir a NF-e: sem ela a mercadoria não sai.", acao: "emitir_nfe", detalhe: volumes, nivel: dias(desde) > 1 ? 2 : 1, alerta: "sem_nfe", motivo: "Embalado sem NF-e" });
      }
      return s(desde, "embalado", { passo: "Despachar: transportadora e rastreio.", acao: "despachar", detalhe: volumes,
        nivel: dias(desde) > 2 ? 2 : 1, alerta: "sem_despachar", motivo: "Falta despachar" });
    }

    case "transito": {
      if (!e) break;
      const desde = e.despachado_em ?? e.created_at;
      const rastreio = e.codigo_rastreio || p.codigo_rastreio || envio?.codigo_rastreio;
      const prevista = envio?.entrega_prevista;
      const detalhe = rastreio ? `Rastreio ${rastreio}` : undefined;
      const atrasada = prevista ? prevista < hoje() : dias(desde) > 7;
      if (atrasada) {
        return s(desde, "despachado", { passo: "Confirmar a entrega com o cliente ou a transportadora.", acao: "marcar_entregue", detalhe,
          nivel: (prevista ? dias(prevista) > 3 : dias(desde) > 15) ? 2 : 1, alerta: "entrega_atrasada",
          motivo: prevista ? `Entrega prevista para ${dataBR(prevista)}` : `Em trânsito há ${n(desde)} dias` });
      }
      if (!rastreio && e.transportadora_id) {
        return s(desde, "despachado", { passo: "Informar o código de rastreio para o cliente acompanhar.", acao: "informar_rastreio", nivel: 1, alerta: "sem_rastreio", motivo: "Sem código de rastreio" });
      }
      return s(desde, "despachado", { passo: "A caminho: marque quando o cliente receber.", acao: "marcar_entregue", detalhe });
    }

    case "entregue":
      return s(e?.entregue_em ?? p.created_at, "entregue", { passo: "Entregue ao cliente." });
  }
  return null;
}
