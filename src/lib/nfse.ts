// NFS-e (nota de serviço): tipos e como cada situação aparece nas telas.
export type StatusNfse = "rascunho" | "pendente" | "processando" | "autorizada" | "rejeitada" | "cancelada" | "incerto";

export type Nfse = {
  id: string; referencia: string; unidade_id: string; os_id: string | null; cliente_id: string | null; substitui_id: string | null;
  status: StatusNfse; ambiente: "producao" | "homologacao"; padrao: "nacional" | "municipal";
  valor_servicos: number; aliquota_iss: number | null; valor_iss: number | null; iss_retido: boolean; discriminacao: string;
  tomador: Record<string, any>; servico: Record<string, any>; mensagem: string | null;
  serie_dps: number | null; numero_dps: number | null;
  numero: string | null; codigo_verificacao: string | null; chave_acesso: string | null; data_emissao: string | null;
  url: string | null; url_danfse: string | null; xml_url: string | null; tentativas: number;
  solicitado_em: string; autorizada_em: string | null; cancelada_em: string | null; cancelamento_motivo: string | null; created_at: string;
};

export type EventoNfse = {
  id: number; nfse_id: string; tipo: string; status_antes: string | null; status_depois: string | null;
  http_status: number | null; detalhe: string | null; created_at: string;
};

export type NfseConfig = {
  unidade_id: string; ativo: boolean; padrao: "nacional" | "municipal"; codigo_municipio: string | null;
  item_lista_servico: string | null; codigo_tributacao_nacional: string | null; codigo_tributario_municipio: string | null;
  codigo_nbs: string | null; codigo_cnae: string | null; aliquota_iss: number | null; iss_retido: boolean;
  optante_simples_nacional: boolean; regime_especial_tributacao: number | null; natureza_operacao: number | null;
  incluir_pecas: boolean; discriminacao_modelo: string; enviar_email_tomador: boolean; observacoes: string | null;
  serie_dps: number; proximo_numero_dps: number; ibs_cbs_cst: string; ibs_cbs_class_trib: string;
  codigo_indicador_operacao: string | null; consumidor_final: boolean;
};

/** Regime especial de tributação: os códigos mudam conforme o padrão. */
export const REGIMES_NFSE: Record<"nacional" | "municipal", { valor: number; rotulo: string }[]> = {
  nacional: [
    { valor: 0, rotulo: "0 · Nenhum" }, { valor: 1, rotulo: "1 · Ato cooperado (cooperativa)" }, { valor: 2, rotulo: "2 · Estimativa" },
    { valor: 3, rotulo: "3 · Microempresa municipal" }, { valor: 4, rotulo: "4 · Notário ou registrador" }, { valor: 5, rotulo: "5 · Profissional autônomo" },
    { valor: 6, rotulo: "6 · Sociedade de profissionais" }, { valor: 9, rotulo: "9 · Outros" },
  ],
  municipal: [
    { valor: 1, rotulo: "1 · Microempresa municipal" }, { valor: 2, rotulo: "2 · Estimativa" }, { valor: 3, rotulo: "3 · Sociedade de profissionais" },
    { valor: 4, rotulo: "4 · Cooperativa" }, { valor: 5, rotulo: "5 · MEI do Simples Nacional" }, { valor: 6, rotulo: "6 · ME/EPP do Simples Nacional" },
  ],
};

export const NATUREZAS_NFSE = [
  { valor: 1, rotulo: "1 · Tributação no município" }, { valor: 2, rotulo: "2 · Tributação fora do município" }, { valor: 3, rotulo: "3 · Isenção" },
  { valor: 4, rotulo: "4 · Imune" }, { valor: 5, rotulo: "5 · Exigibilidade suspensa (decisão judicial)" }, { valor: 6, rotulo: "6 · Exigibilidade suspensa (procedimento administrativo)" },
];

export const SITUACAO_NFSE: Record<StatusNfse, { label: string; cor: string; ajuda: string }> = {
  rascunho: { label: "Rascunho", cor: "bg-slate-100 text-slate-700", ajuda: "Ainda não foi enviada" },
  pendente: { label: "Enviando", cor: "bg-sky-100 text-sky-800", ajuda: "Gravada no ERP; enviando para a Focus" },
  processando: { label: "Na prefeitura", cor: "bg-sky-100 text-sky-800", ajuda: "A Focus recebeu; aguardando a autorização da prefeitura" },
  autorizada: { label: "Autorizada", cor: "bg-emerald-100 text-emerald-800", ajuda: "Nota válida: a OS está faturada" },
  rejeitada: { label: "Rejeitada", cor: "bg-red-100 text-red-800", ajuda: "Não foi autorizada: corrija e reenvie (a tentativa fica no histórico)" },
  cancelada: { label: "Cancelada", cor: "bg-slate-200 text-slate-700", ajuda: "Cancelada na prefeitura" },
  incerto: { label: "Resultado incerto", cor: "bg-amber-100 text-amber-800", ajuda: "A Focus não respondeu a tempo. O ERP consulta pela mesma referência antes de qualquer reenvio" },
};

/** Situações em que a nota ainda pode mudar sozinha (a tela atualiza de tempos em tempos). */
export const NFSE_EM_ANDAMENTO: StatusNfse[] = ["pendente", "processando", "incerto"];

export const ROTULO_EVENTO: Record<string, string> = {
  status: "Situação", envio: "Enviada à Focus", consulta: "Consulta na Focus", webhook: "Aviso da Focus",
  timeout: "Sem resposta da Focus", reenvio: "Reenviada (mesma referência)", cancelamento_solicitado: "Cancelamento pedido",
  erro: "Erro", previa: "Conferência", cancelamento: "Cancelamento na Focus",
};
