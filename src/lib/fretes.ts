// Fretes: tipos do envio, rótulos, totais da carga (peso real × peso cubado) e os indicadores do painel operacional.
// Funções puras: o painel e o formulário usam as mesmas regras.

export type Volume = {
  embalagem_id?: string | null; descricao?: string | null; quantidade: number;
  largura_cm?: number | null; altura_cm?: number | null; comprimento_cm?: number | null; peso_kg?: number | null;
};

export type StatusEnvio = "cotacao" | "aprovacao" | "coleta" | "transito" | "entregue" | "cancelado";

export type Envio = {
  id: string; numero?: number; pedido_id: string | null; os_id?: string | null; cliente_id: string | null; unidade_id: string | null; vendedor_id: string | null;
  status: StatusEnvio;
  cep_origem: string | null; cidade_origem: string | null; uf_origem: string | null;
  cep_destino: string | null; cidade_destino: string | null; uf_destino: string | null; endereco_destino: string | null;
  volumes: Volume[]; qtd_volumes: number; peso_total_kg: number; cubagem_m3: number;
  valor_mercadoria: number; seguro: boolean;
  tipo_equipamento: string | null; restricoes: string[]; restricoes_obs: string | null;
  prazo_desejado: string | null; modalidade: string; pagador: string; centro_custo_id: string | null;
  transportadora_id: string | null; transportadora_nome: string | null; prazo_dias: number | null;
  valor_aprovado: number | null; aprovado_em: string | null;
  coleta_prevista: string | null; coletado_em: string | null; codigo_rastreio: string | null;
  entrega_prevista: string | null; entregue_em: string | null; comprovante_em: string | null;
  valor_final: number | null; cte_numero: string | null; observacoes: string | null;
  created_at: string; atualizado_em: string;
};

export type CotacaoEnvio = {
  id: string; envio_id: string; transportadora_id: string | null; transportadora_nome: string | null;
  valor: number; prazo_dias: number | null; validade: string | null; observacoes: string | null; escolhida: boolean; ativa: boolean; created_at: string;
};

export type OcorrenciaEnvio = {
  id: string; envio_id: string; tipo: string; descricao: string; responsavel: string | null; andamento: string | null;
  status: "aberta" | "resolvida"; created_at: string; atualizado_em: string; resolvida_em: string | null;
};

export const STATUS_ENVIO: Record<StatusEnvio, { rotulo: string; cor: string }> = {
  cotacao: { rotulo: "Aguardando cotação", cor: "bg-amber-100 text-amber-800" },
  aprovacao: { rotulo: "Aguardando aprovação", cor: "bg-orange-100 text-orange-800" },
  coleta: { rotulo: "Aguardando coleta", cor: "bg-sky-100 text-sky-800" },
  transito: { rotulo: "Em trânsito", cor: "bg-indigo-100 text-indigo-800" },
  entregue: { rotulo: "Entregue", cor: "bg-emerald-100 text-emerald-800" },
  cancelado: { rotulo: "Cancelado", cor: "bg-slate-200 text-slate-700" },
};

export const RESTRICOES: [string, string][] = [
  ["manter_em_pe", "Manter em pé (não tombar)"],
  ["fragil", "Frágil"],
  ["sem_doca", "Destino sem doca"],
  ["empilhadeira", "Precisa empilhadeira ou munck na descarga"],
  ["ajudante", "Precisa ajudante na descarga"],
  ["agendar", "Entrega com agendamento"],
  ["horario", "Horário restrito de recebimento"],
  ["veiculo_pequeno", "Rua estreita / só veículo pequeno"],
  ["dificil_acesso", "Zona rural ou difícil acesso"],
];

export const MODALIDADES: [string, string][] = [
  ["cif", "CIF: a MF contrata e paga"],
  ["fob", "FOB: o cliente contrata e paga"],
  ["terceiros", "Por conta de terceiros"],
  ["retira", "Cliente retira"],
  ["proprio", "Transporte próprio da MF"],
];

export const PAGADORES: [string, string][] = [["empresa", "MF Máquinas"], ["cliente", "Cliente"], ["terceiro", "Terceiro"]];

export const TIPOS_EMBALAGEM: [string, string][] = [
  ["caixa", "Pacote / Caixa"], ["envelope", "Envelope"], ["rolo", "Rolo / Cilindro"], ["palete", "Palete"],
  ["engradado", "Engradado de madeira"], ["fardo", "Fardo"], ["outro", "Outro"],
];

export const TIPOS_OCORRENCIA: [string, string][] = [
  ["atraso", "Atraso"], ["avaria", "Avaria"], ["extravio", "Extravio"], ["endereco", "Endereço / destinatário"],
  ["recusa", "Recusa"], ["reentrega", "Reentrega"], ["cobranca", "Cobrança indevida"], ["outro", "Outro"],
];

export const REGIOES: Record<string, string[]> = {
  Sul: ["PR", "SC", "RS"],
  Sudeste: ["SP", "RJ", "MG", "ES"],
  "Centro-Oeste": ["GO", "MT", "MS", "DF"],
  Nordeste: ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA"],
  Norte: ["AM", "PA", "AC", "RO", "RR", "AP", "TO"],
};
export const regiaoDaUf = (uf?: string | null) => Object.entries(REGIOES).find(([, ufs]) => ufs.includes(String(uf ?? "").toUpperCase()))?.[0] ?? null;

/** Fator de cubagem do rodoviário (kg por m³): a transportadora cobra pelo maior entre o peso real e o cubado. */
export const FATOR_CUBAGEM = 300;

export function totaisCarga(volumes: Volume[]) {
  let qtd = 0, peso = 0, cubagem = 0, semMedida = 0, semPeso = 0;
  for (const v of volumes ?? []) {
    const q = Math.max(0, Number(v.quantidade) || 0);
    qtd += q;
    peso += q * (Number(v.peso_kg) || 0);
    const m3 = (Number(v.largura_cm) || 0) * (Number(v.altura_cm) || 0) * (Number(v.comprimento_cm) || 0) / 1_000_000;
    cubagem += q * m3;
    if (!m3) semMedida++;
    if (!Number(v.peso_kg)) semPeso++;
  }
  const pesoCubado = cubagem * FATOR_CUBAGEM;
  return { qtd, peso, cubagem, pesoCubado, pesoTaxado: Math.max(peso, pesoCubado), semMedida, semPeso };
}

/** O que falta para pedir a cotação (os dados padronizados). */
export function faltandoParaCotar(e: Partial<Envio>) {
  const falta: string[] = [];
  if (String(e.cep_origem ?? "").replace(/\D/g, "").length !== 8) falta.push("CEP de origem");
  if (String(e.cep_destino ?? "").replace(/\D/g, "").length !== 8) falta.push("CEP de destino");
  const t = totaisCarga(e.volumes ?? []);
  if (!t.qtd) falta.push("volumes");
  else {
    if (t.semPeso) falta.push("peso de todos os volumes");
    if (t.semMedida) falta.push("medidas de todos os volumes");
  }
  if (!(Number(e.valor_mercadoria) > 0)) falta.push("valor da mercadoria");
  if (!e.tipo_equipamento) falta.push("tipo de equipamento");
  return falta;
}

// ---------------------------------------------------------------------------------------------
// Painel operacional
// ---------------------------------------------------------------------------------------------
export type ContextoPainel = {
  hoje: string;                      // AAAA-MM-DD
  agora: number;                     // Date.now()
  ocorrencias: OcorrenciaEnvio[];
  statusPedido: (pedidoId: string) => string | undefined;
};

export type Indicador = {
  id: string; grupo: string; titulo: string; ajuda: string; tom: "atencao" | "ruim" | "info";
  teste: (e: Envio, c: ContextoPainel) => boolean;
};

const DIA = 86_400_000;
const antesDe = (d: string | null | undefined, hoje: string) => !!d && d < hoje;
const ocorrenciaParada = (o: OcorrenciaEnvio, agora: number) => o.status === "aberta" && (!o.responsavel?.trim() || agora - new Date(o.atualizado_em).getTime() > 3 * DIA);

export const INDICADORES: Indicador[] = [
  { id: "cotacao", grupo: "Cotação e aprovação", titulo: "Aguardando cotação", tom: "atencao", ajuda: "Envios sem nenhuma cotação registrada",
    teste: (e) => e.status === "cotacao" },
  { id: "aprovacao", grupo: "Cotação e aprovação", titulo: "Aguardando aprovação", tom: "atencao", ajuda: "Já têm cotação, falta escolher e aprovar",
    teste: (e) => e.status === "aprovacao" },
  { id: "coleta_atrasada", grupo: "Coleta", titulo: "Coletas atrasadas", tom: "ruim", ajuda: "Data de coleta passou, ou aprovado há mais de 2 dias sem data de coleta",
    teste: (e, c) => e.status === "coleta" && (antesDe(e.coleta_prevista, c.hoje) || (!e.coleta_prevista && !!e.aprovado_em && c.agora - new Date(e.aprovado_em).getTime() > 2 * DIA)) },
  { id: "coleta", grupo: "Coleta", titulo: "Coletas não realizadas", tom: "info", ajuda: "Frete aprovado, a transportadora ainda não coletou",
    teste: (e) => e.status === "coleta" },
  { id: "entrega_hoje", grupo: "Entrega", titulo: "Entregas previstas para hoje", tom: "info", ajuda: "Em trânsito com entrega prevista para hoje",
    teste: (e, c) => e.status === "transito" && e.entrega_prevista === c.hoje },
  { id: "prazo_estourado", grupo: "Entrega", titulo: "Prazo estourado", tom: "ruim", ajuda: "Ainda não entregue e a data prevista (ou o prazo combinado com o cliente) já passou",
    teste: (e, c) => (e.status === "coleta" || e.status === "transito") && antesDe(e.entrega_prevista ?? e.prazo_desejado, c.hoje) },
  { id: "sem_rastreio", grupo: "Documentos", titulo: "Cargas sem rastreio", tom: "atencao", ajuda: "Em trânsito sem código de rastreio",
    teste: (e) => e.status === "transito" && !e.codigo_rastreio?.trim() },
  { id: "sem_comprovante", grupo: "Documentos", titulo: "Sem comprovante de entrega", tom: "atencao", ajuda: "Entregue, mas o canhoto/comprovante não foi recebido",
    teste: (e) => e.status === "entregue" && !e.comprovante_em },
  { id: "frete_acima", grupo: "Custos", titulo: "Frete final acima do aprovado", tom: "ruim", ajuda: "O valor cobrado (CT-e/fatura) passou do valor aprovado na cotação",
    teste: (e) => e.status !== "cancelado" && e.valor_final != null && e.valor_aprovado != null && Number(e.valor_final) > Number(e.valor_aprovado) + 0.005 },
  { id: "ocorrencias", grupo: "Ocorrências", titulo: "Ocorrências paradas", tom: "ruim", ajuda: "Ocorrência aberta sem responsável ou sem atualização há mais de 3 dias",
    teste: (e, c) => c.ocorrencias.some((o) => o.envio_id === e.id && ocorrenciaParada(o, c.agora)) },
  { id: "sem_baixa", grupo: "Ocorrências", titulo: "Entregues sem baixa no pedido", tom: "atencao", ajuda: "O envio foi entregue e o pedido ainda não está como entregue no ERP",
    teste: (e, c) => e.status === "entregue" && !!e.pedido_id && !["entregue", "cancelado"].includes(c.statusPedido(e.pedido_id) ?? "entregue") },
];

export type FiltrosPainel = {
  de?: string; ate?: string; transportadora?: string; regiao?: string; uf?: string; vendedor?: string; status?: string; equipamento?: string;
};

export function filtrarEnvios(envios: Envio[], f: FiltrosPainel) {
  return envios.filter((e) => {
    const dia = e.created_at.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (f.transportadora && e.transportadora_id !== f.transportadora) return false;
    if (f.regiao && regiaoDaUf(e.uf_destino) !== f.regiao) return false;
    if (f.uf && e.uf_destino !== f.uf) return false;
    if (f.vendedor && e.vendedor_id !== f.vendedor) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.equipamento && e.tipo_equipamento !== f.equipamento) return false;
    return true;
  });
}

/** Mensagem padronizada para pedir cotação (WhatsApp/e-mail da transportadora). */
export function mensagemCotacao(e: Partial<Envio>, nomes: { cliente?: string; empresa?: string } = {}) {
  const t = totaisCarga(e.volumes ?? []);
  const kg = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
  const cep = (c?: string | null) => (c ? String(c).replace(/^(\d{5})(\d{3})$/, "$1-$2") : "—");
  const linhasVol = (e.volumes ?? []).map((v) =>
    `• ${v.quantidade}x ${v.descricao || "volume"}: ${[v.largura_cm, v.altura_cm, v.comprimento_cm].every(Boolean) ? `${v.largura_cm}×${v.altura_cm}×${v.comprimento_cm} cm (L×A×C)` : "medidas a confirmar"}, ${v.peso_kg ? kg(Number(v.peso_kg)) : "peso a confirmar"} cada`);
  const restr = RESTRICOES.filter(([k]) => e.restricoes?.includes(k)).map(([, r]) => r);
  const brl = (n?: number | null) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return [
    `Olá! Aqui é da *${nomes.empresa || "MF Máquinas"}*. Pode cotar este frete${e.numero ? ` (envio #${e.numero})` : ""}?`,
    `*Origem:* CEP ${cep(e.cep_origem)}${e.cidade_origem ? ` · ${e.cidade_origem}/${e.uf_origem ?? ""}` : ""}`,
    `*Destino:* CEP ${cep(e.cep_destino)}${e.cidade_destino ? ` · ${e.cidade_destino}/${e.uf_destino ?? ""}` : ""}`,
    `*Carga:* ${t.qtd} volume(s), ${kg(t.peso)} (peso real), ${t.cubagem.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`,
    ...linhasVol,
    `*Equipamento:* ${e.tipo_equipamento || "—"}`,
    `*Valor da mercadoria:* ${brl(e.valor_mercadoria)}${e.seguro ? " · com seguro" : " · sem seguro"}`,
    restr.length || e.restricoes_obs ? `*Carregamento/descarga:* ${[...restr, e.restricoes_obs].filter(Boolean).join("; ")}` : "",
    e.prazo_desejado ? `*Entregar até:* ${e.prazo_desejado.split("-").reverse().join("/")}` : "",
    `*Modalidade:* ${MODALIDADES.find(([k]) => k === e.modalidade)?.[1] ?? "CIF"}`,
    `Preciso do valor, do prazo e da data de coleta. Obrigado!`,
  ].filter(Boolean).join("\n");
}
