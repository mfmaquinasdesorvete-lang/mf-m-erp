// OS no quadro (Assistência): em que etapa está, há quanto tempo, se precisa de ação e qual o próximo passo.
// As etapas seguem a situação da OS; a vídeo chamada tem os passos dela (termo aceito → Pix → agendar).
export type EtapaOS = "recebida" | "diagnostico" | "aprovacao" | "peca" | "reparo" | "pronta" | "entregue";
export type AcaoOS = "diagnosticar" | "orcamento" | "aprovado" | "peca_chegou" | "concluir" | "entregar" | "agendar" | "abrir";

export const ETAPAS_OS: { id: EtapaOS; titulo: string; curto: string; frase: string; cor: string }[] = [
  { id: "recebida", titulo: "Recebidas", curto: "Recebidas", frase: "Chegou (ou foi aberta); falta o diagnóstico.", cor: "#64748b" },
  { id: "diagnostico", titulo: "Em diagnóstico", curto: "Diagnóstico", frase: "O técnico está vendo o que tem.", cor: "#0ea5e9" },
  { id: "aprovacao", titulo: "Esperando o cliente", curto: "Cliente", frase: "Orçamento enviado; falta o cliente aprovar.", cor: "#f59e0b" },
  { id: "peca", titulo: "Esperando peça", curto: "Peça", frase: "Aprovada; falta a peça chegar.", cor: "#f97316" },
  { id: "reparo", titulo: "Em reparo", curto: "Reparo", frase: "Mão na massa; falta concluir com o laudo.", cor: "#8b5cf6" },
  { id: "pronta", titulo: "Prontas para retirar", curto: "Prontas", frase: "Concluída; falta avisar e entregar.", cor: "#10b981" },
  { id: "entregue", titulo: "Entregues (15 dias)", curto: "Entregues", frase: "Já voltaram para o cliente.", cor: "#14b8a6" },
];

const ETAPA_DO_STATUS: Record<string, EtapaOS> = {
  aberta: "recebida", em_diagnostico: "diagnostico", aguardando_aprovacao: "aprovacao", aguardando_peca: "peca",
  em_reparo: "reparo", concluida: "pronta", entregue: "entregue",
};

export type OSQuadro = {
  status: string; data_entrada: string; previsao?: string | null; concluida_em?: string | null; entregue_em?: string | null;
  em_garantia?: boolean | null; atendimento?: string | null; agendado_em?: string | null; video_pago_em?: string | null;
  orcamento_aprovado_em?: string | null;
};

export type SituacaoOS = { etapa: EtapaOS; nivel: 0 | 1 | 2; alerta: string | null; desde: string; acao: AcaoOS; proximo: string };

const dias = (de: string, hoje: string) => Math.floor((new Date(`${hoje}T12:00:00`).getTime() - new Date(`${de.slice(0, 10)}T12:00:00`).getTime()) / 86400000);

/** Situação da OS no quadro; null = fica fora (cancelada, ou entregue há mais de 15 dias) */
export function situacaoOS(o: OSQuadro, hoje: string): SituacaoOS | null {
  const etapa = ETAPA_DO_STATUS[o.status];
  if (!etapa) return null;
  const desde = (etapa === "pronta" ? o.concluida_em : etapa === "entregue" ? o.entregue_em ?? o.concluida_em : null) ?? o.data_entrada;
  if (etapa === "entregue") return dias(desde, hoje) > 15 ? null : { etapa, nivel: 0, alerta: null, desde, acao: "abrir", proximo: "Nada; fica no histórico" };
  const parada = dias(desde, hoje);
  const video = o.atendimento === "video";

  // vídeo chamada aberta: o caminho é termo aceito → Pix → agendar
  if (video && (etapa === "recebida" || etapa === "diagnostico")) {
    const semPix = !o.em_garantia && !o.video_pago_em;
    if (!o.orcamento_aprovado_em) return { etapa, nivel: parada > 2 ? 1 : 0, alerta: parada > 2 ? "vídeo sem aceite do termo" : null, desde, acao: "abrir", proximo: "Mandar o termo + Pix ao cliente" };
    if (semPix) return { etapa, nivel: parada > 3 ? 1 : 0, alerta: parada > 3 ? "vídeo esperando o Pix" : null, desde, acao: "abrir", proximo: "Confirmar o Pix da hora técnica" };
    if (!o.agendado_em) return { etapa, nivel: 1, alerta: "vídeo pago sem agendar", desde, acao: "agendar", proximo: "Agendar a vídeo chamada" };
    const passou = o.agendado_em.slice(0, 10) < hoje;
    return { etapa, nivel: passou ? 2 : 0, alerta: passou ? "vídeo chamada já passou" : null, desde, acao: "concluir", proximo: passou ? "Registrar como foi e concluir" : "Fazer a vídeo chamada no dia marcado" };
  }

  const estourou = !!o.previsao && o.previsao < hoje && etapa !== "pronta";
  const base = (acao: AcaoOS, proximo: string, limite: number, texto: string): SituacaoOS =>
    estourou ? { etapa, nivel: 2, alerta: "previsão estourada", desde, acao, proximo }
      : parada > limite ? { etapa, nivel: 1, alerta: texto, desde, acao, proximo }
        : { etapa, nivel: 0, alerta: null, desde, acao, proximo };

  switch (etapa) {
    case "recebida": return base("diagnosticar", "Começar o diagnóstico", 2, "sem diagnóstico há dias");
    case "diagnostico": return o.em_garantia
      ? base("concluir", "Garantia: seguir direto para o reparo", 3, "diagnóstico parado")
      : base("orcamento", "Mandar o orçamento ao cliente", 3, "diagnóstico parado");
    case "aprovacao": return base("aprovado", "Cobrar a resposta do cliente", 3, "cliente sem responder");
    case "peca": return base("peca_chegou", "Avisar quando a peça chegar", 10, "peça demorando");
    case "reparo": return base("concluir", "Concluir com o laudo", 5, "reparo parado");
    default: return parada > 5
      ? { etapa, nivel: 1, alerta: "pronta e não retirada", desde, acao: "entregar", proximo: "Avisar o cliente e entregar" }
      : { etapa, nivel: 0, alerta: null, desde, acao: "entregar", proximo: "Avisar o cliente e entregar" };
  }
}

/** Situação nova ao apertar o botão do cartão (null = abre a OS para completar) */
export function proximoStatus(acao: AcaoOS): string | null {
  if (acao === "diagnosticar") return "em_diagnostico";
  if (acao === "orcamento") return "aguardando_aprovacao";
  if (acao === "aprovado" || acao === "peca_chegou") return "em_reparo";
  return null;
}
