// Fretes: tipos do envio, rótulos, totais da carga (peso real × peso cubado) e os indicadores do painel operacional.
// Funções puras: o painel e o formulário usam as mesmas regras.

export type Volume = {
  embalagem_id?: string | null; descricao?: string | null; quantidade: number;
  largura_cm?: number | null; altura_cm?: number | null; comprimento_cm?: number | null; peso_kg?: number | null;
};

export type StatusEnvio = "cotacao" | "aprovacao" | "coleta" | "transito" | "entregue" | "cancelado";
export type TipoServico = "economico" | "padrao" | "expresso" | "dedicado";

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
  // condições comerciais, decisão, prova de entrega, conferência e conta a pagar (migração 0020)
  valor_cobrado_cliente?: number | null; tipo_servico?: TipoServico | null; tabela_versao?: string | null;
  valor_cotado?: number | null; cotacao_aprovada_id?: string | null; justificativa_escolha?: string | null; aprovado_por?: string | null;
  sem_comprovante_motivo?: string | null; sem_comprovante_por?: string | null; sem_comprovante_em?: string | null;
  conferencia_obs?: string | null; conferido_por?: string | null; conferido_em?: string | null;
  conta_pagar_id?: string | null; motivo_excecao?: string | null;
};

/** Adicional da cotação (TDE, TRT...). previsto = false: aceito depois da aprovação, com justificativa. */
export type Adicional = { tipo: string; valor: number; descricao?: string | null; previsto?: boolean; justificativa?: string | null; por?: string | null; em?: string | null };

export type CotacaoEnvio = {
  id: string; envio_id: string; transportadora_id: string | null; transportadora_nome: string | null;
  valor: number; prazo_dias: number | null; validade: string | null; observacoes: string | null; escolhida: boolean; ativa: boolean; created_at: string;
  adicionais?: Adicional[]; valor_total?: number | null; tipo_servico?: TipoServico | null; tabela_versao?: string | null;
};

export type OcorrenciaEnvio = {
  id: string; envio_id: string; tipo: string; descricao: string; responsavel: string | null; andamento: string | null;
  status: "aberta" | "resolvida"; created_at: string; atualizado_em: string; resolvida_em: string | null;
  resolucao?: string | null; resolvida_por?: string | null;
};

export type ExcecaoEnvio = {
  id: string; envio_id: string; tipo: "cotacao_mais_cara" | "adicional_nao_previsto" | "troca_transportadora" | "conferencia_frete" | "sem_comprovante";
  justificativa: string; detalhe: string | null; valor: number | null; created_by: string | null; created_at: string;
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
  ["atraso", "Atraso"], ["avaria", "Avaria"], ["reentrega", "Reentrega"], ["recusa", "Recusa"], ["cobranca", "Divergência de cobrança"],
  ["extravio", "Extravio"], ["endereco", "Endereço / destinatário"], ["outro", "Outro"],
];

export const TIPOS_SERVICO: [TipoServico, string][] = [["economico", "Econômico"], ["padrao", "Padrão"], ["expresso", "Expresso"], ["dedicado", "Dedicado"]];
export const rotuloServico = (s?: string | null) => TIPOS_SERVICO.find(([k]) => k === s)?.[1] ?? "Serviço não informado";

export const TIPOS_ADICIONAL: [string, string][] = [
  ["tde", "TDE (dificuldade de entrega)"], ["trt", "TRT (restrição de trânsito)"], ["agendamento", "Agendamento"], ["pedagio", "Pedágio"],
  ["gris", "GRIS (gerenciamento de risco)"], ["ad_valorem", "Ad valorem"], ["outro", "Outro"],
];
const ROTULO_ADICIONAL: Record<string, string> = { tde: "TDE", trt: "TRT", agendamento: "Agendamento", pedagio: "Pedágio", gris: "GRIS", ad_valorem: "Ad valorem", outro: "Outro" };
export const rotuloAdicional = (t: string) => ROTULO_ADICIONAL[t] ?? t;

export const TIPOS_EXCECAO: Record<ExcecaoEnvio["tipo"], string> = {
  cotacao_mais_cara: "Escolheu opção mais cara", adicional_nao_previsto: "Adicional não previsto", troca_transportadora: "Troca de transportadora",
  conferencia_frete: "Conferência do frete final", sem_comprovante: "Entregue sem comprovante",
};

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
// Regras da cotação, da entrega e do frete final (as mesmas do banco, migração 0020)
// ---------------------------------------------------------------------------------------------
const numero = (v: unknown) => Number(String(v ?? "").replace(",", "."));

/** Volumes sem as três medidas ou sem o peso: cotação assim não é comparável. Ex.: "volume 1: altura, peso". */
export function volumesIncompletos(volumes: Volume[]) {
  const faltas: string[] = [];
  const validos = (volumes ?? []).filter((v) => (v.quantidade == null ? 1 : Number(v.quantidade)) > 0);
  validos.forEach((v, i) => {
    const f = ([["largura_cm", "largura"], ["altura_cm", "altura"], ["comprimento_cm", "comprimento"], ["peso_kg", "peso"]] as const)
      .filter(([k]) => !(numero(v[k]) > 0)).map(([, r]) => r);
    if (f.length) faltas.push(`volume ${i + 1}: ${f.join(", ")}`);
  });
  if (!validos.length) faltas.push("nenhum volume");
  return faltas;
}
export const cargaComparavel = (volumes: Volume[]) => volumesIncompletos(volumes).length === 0;

/** Máquina: as medidas são da carga embalada (engradado ou caixa), não do produto. */
export const ehMaquina = (e: Partial<Envio>) =>
  /m[áa]quina/i.test(e.tipo_equipamento ?? "") || (e.volumes ?? []).some((v) => /m[áa]quina/i.test(v.descricao ?? ""));

/** Total da cotação: frete + adicionais. */
export const totalCotacao = (c: Pick<CotacaoEnvio, "valor" | "valor_total" | "adicionais">) =>
  c.valor_total != null ? Number(c.valor_total) : Math.round((Number(c.valor) + (c.adicionais ?? []).reduce((s, a) => s + Number(a.valor || 0), 0)) * 100) / 100;

export const cotacaoVencida = (c: Pick<CotacaoEnvio, "validade">, hoje: string) => !!c.validade && c.validade < hoje;

/** A mais barata entre as cotações ativas na validade: a referência para exigir justificativa. */
export function maisBarataValida(cotacoes: CotacaoEnvio[], hoje: string) {
  return cotacoes.filter((c) => c.ativa && !cotacaoVencida(c, hoje))
    .sort((a, b) => totalCotacao(a) - totalCotacao(b) || a.created_at.localeCompare(b.created_at))[0] ?? null;
}

/** O que impede a aprovação desta cotação e quando ela exige justificativa (mesmas regras de aprovar_frete_envio). */
export function analisarAprovacao(c: CotacaoEnvio, cotacoes: CotacaoEnvio[], envio: Partial<Envio>, hoje: string) {
  const bloqueio = cotacaoVencida(c, hoje) ? `cotação vencida em ${c.validade!.split("-").reverse().join("/")}: peça a cotação de novo`
    : !cargaComparavel(envio.volumes ?? []) ? "falta medida ou peso em algum volume: a cotação não é comparável" : null;
  const barata = maisBarataValida(cotacoes, hoje);
  const maisCara = !!barata && barata.id !== c.id && totalCotacao(c) > totalCotacao(barata) + 0.005;
  const troca = !!envio.aprovado_em && ((c.transportadora_id ?? null) !== (envio.transportadora_id ?? null)
    || (!c.transportadora_id && (c.transportadora_nome ?? "").trim() !== (envio.transportadora_nome ?? "").trim()));
  return { bloqueio, maisCara, troca, barata, precisaJustificativa: maisCara || troca };
}

/** Diferença acima de R$ 1,00 ou de 2% entre o faturado e o aprovado (mesma regra de frete_divergente no banco). */
export const TOLERANCIA_FRETE = { reais: 1, percentual: 0.02 };
export function freteDivergente(aprovado: number | null | undefined, final: number | null | undefined) {
  if (aprovado == null || final == null) return false;
  const d = Math.abs(Math.round((Number(final) - Number(aprovado)) * 100) / 100);
  return d > TOLERANCIA_FRETE.reais || (Number(aprovado) > 0 && d / Number(aprovado) > TOLERANCIA_FRETE.percentual);
}
export function diferencaFrete(e: Pick<Envio, "valor_aprovado" | "valor_final">) {
  if (e.valor_aprovado == null || e.valor_final == null) return null;
  const reais = Math.round((Number(e.valor_final) - Number(e.valor_aprovado)) * 100) / 100;
  return { reais, pct: Number(e.valor_aprovado) ? reais / Number(e.valor_aprovado) : null, divergente: freteDivergente(e.valor_aprovado, e.valor_final) };
}

/** Prova de entrega: data do comprovante, anexo ou o motivo de não ter. */
export const temProvaEntrega = (e: Partial<Envio>, comAnexo?: Set<string>) =>
  !!e.comprovante_em || !!e.sem_comprovante_motivo?.trim() || (!!e.id && !!comAnexo?.has(e.id));

// ---------------------------------------------------------------------------------------------
// Painel operacional
// ---------------------------------------------------------------------------------------------
export type ContextoPainel = {
  hoje: string;                      // AAAA-MM-DD
  agora: number;                     // Date.now()
  ocorrencias: OcorrenciaEnvio[];
  statusPedido: (pedidoId: string) => string | undefined;
  cotacoes?: CotacaoEnvio[];          // para "cotação vencida aguardando aprovação"
  comAnexo?: Set<string>;             // envios com comprovante anexado
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
  { id: "cotacao_vencida", grupo: "Cotação e aprovação", titulo: "Cotação vencida aguardando aprovação", tom: "ruim", ajuda: "Aguardando aprovação com cotação fora da validade: peça de novo antes de aprovar",
    teste: (e, c) => e.status === "aprovacao" && (c.cotacoes ?? []).some((x) => x.envio_id === e.id && x.ativa && !x.escolhida && cotacaoVencida(x, c.hoje)) },
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
    teste: (e, c) => e.status === "entregue" && !e.comprovante_em && !c.comAnexo?.has(e.id) },
  { id: "sem_prova", grupo: "Documentos", titulo: "Entregues sem comprovante nem motivo", tom: "ruim", ajuda: "Entregue sem data do comprovante, sem anexo e sem o motivo de não ter",
    teste: (e, c) => e.status === "entregue" && !temProvaEntrega(e, c.comAnexo) },
  { id: "frete_acima", grupo: "Custos", titulo: "Frete final acima do aprovado", tom: "ruim", ajuda: "O valor cobrado (CT-e/fatura) passou do valor aprovado na cotação",
    teste: (e) => e.status !== "cancelado" && e.valor_final != null && e.valor_aprovado != null && Number(e.valor_final) > Number(e.valor_aprovado) + 0.005 },
  { id: "frete_divergente", grupo: "Custos", titulo: "Frete final acima do aprovado / divergente sem conferência", tom: "ruim",
    ajuda: "O faturado difere do aprovado em mais de R$ 1,00 ou 2% e ninguém registrou a conferência",
    teste: (e) => e.status !== "cancelado" && freteDivergente(e.valor_aprovado, e.valor_final) && !e.conferido_em },
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

// ---------------------------------------------------------------------------------------------
// Indicadores do mês: custo por envio e por destino, variação aprovado × faturado, entrega no prazo,
// tempo para cotar e para coletar, avaria/reentrega/ocorrência, comprovante, frete sobre a venda e margem,
// desempenho por transportadora e por rota. Sempre separados por tipo de serviço (econômico não se
// mistura com expresso), com o total à parte.
// ---------------------------------------------------------------------------------------------
export type PedidoValores = { valor_total: number; custo_itens: number | null };

export type DadosIndicadores = {
  cotacoes: CotacaoEnvio[];
  ocorrencias: OcorrenciaEnvio[];
  /** Valor do pedido e custo dos itens (null quando falta o custo de algum item). */
  pedidos: Map<string, PedidoValores>;
  /** Envios com o comprovante anexado. */
  comAnexo?: Set<string>;
};

export type Metricas = {
  envios: number;
  comCusto: number; custoTotal: number; custoMedio: number | null;
  conciliados: number; variacaoReais: number | null; variacaoPct: number | null; divergentes: number;
  entregues: number; comPrazo: number; noPrazo: number; noPrazoPct: number | null;
  tempoCotacaoDias: number | null; tempoColetaDias: number | null;
  avariaPct: number | null; reentregaPct: number | null; ocorrenciaPct: number | null;
  comprovantePct: number | null;
  pedidos: number; venda: number; freteEmpresa: number; freteSobreVenda: number | null;
  pedidosComCusto: number; margemAposFrete: number | null;
};

export type ServicoChave = TipoServico | "nao_informado";
export type Segmento = { chave: string; rotulo: string; detalhe?: string; m: Metricas };

const r2 = (n: number) => Math.round(n * 100) / 100;
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (n: number, de: number) => (de ? n / de : null);
const diaUTC = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");

/** Custo do frete do envio: o faturado (CT-e) ou, sem ele, o aprovado. */
export const custoFrete = (e: Pick<Envio, "valor_final" | "valor_aprovado">) =>
  e.valor_final != null ? Number(e.valor_final) : e.valor_aprovado != null ? Number(e.valor_aprovado) : null;

/** Data prometida: a entrega prevista ou, sem ela, o prazo combinado com o cliente. */
export const dataPrometida = (e: Pick<Envio, "entrega_prevista" | "prazo_desejado">) => e.entrega_prevista ?? e.prazo_desejado ?? null;

/** Envios do mês (AAAA-MM) pela data de criação, sem os cancelados. */
export const enviosDoMes = (envios: Envio[], mes: string) => envios.filter((e) => e.status !== "cancelado" && e.created_at.slice(0, 7) === mes);

export const servicoDe = (e: Pick<Envio, "tipo_servico">): ServicoChave => (e.tipo_servico ?? "nao_informado") as ServicoChave;

export function calcularMetricas(envios: Envio[], d: DadosIndicadores): Metricas {
  const custos = envios.map(custoFrete).filter((v): v is number => v != null);
  const conc = envios.filter((e) => e.valor_aprovado != null && e.valor_final != null);
  const somaAprov = conc.reduce((s, e) => s + Number(e.valor_aprovado), 0);
  const somaDif = conc.reduce((s, e) => s + Number(e.valor_final) - Number(e.valor_aprovado), 0);

  const entregues = envios.filter((e) => e.status === "entregue" || !!e.entregue_em);
  const comPrazo = entregues.filter((e) => !!e.entregue_em && !!dataPrometida(e));
  const noPrazo = comPrazo.filter((e) => e.entregue_em!.slice(0, 10) <= dataPrometida(e)!);

  // tempo para cotar: criação do envio → primeira cotação; para coletar: aprovação → coleta realizada
  const primeira = new Map<string, number>();
  for (const c of d.cotacoes) {
    const t = Date.parse(c.created_at);
    if (!primeira.has(c.envio_id) || t < primeira.get(c.envio_id)!) primeira.set(c.envio_id, t);
  }
  const tCot = envios.filter((e) => primeira.has(e.id)).map((e) => Math.max(0, (primeira.get(e.id)! - Date.parse(e.created_at)) / DIA));
  const tCol = envios.filter((e) => e.aprovado_em && e.coletado_em).map((e) => Math.max(0, (diaUTC(e.coletado_em!) - diaUTC(e.aprovado_em!)) / DIA));

  const tipos = new Map<string, Set<string>>();
  for (const o of d.ocorrencias) {
    if (!tipos.has(o.envio_id)) tipos.set(o.envio_id, new Set());
    tipos.get(o.envio_id)!.add(o.tipo);
  }
  const comTipo = (t?: string) => envios.filter((e) => tipos.has(e.id) && (!t || tipos.get(e.id)!.has(t))).length;

  const comprovante = entregues.filter((e) => !!e.comprovante_em || !!d.comAnexo?.has(e.id)).length;

  // venda: cada pedido conta uma vez; frete da MF só quando ela paga (FOB é do cliente)
  const porPedido = new Map<string, { venda: number; custo: number | null; frete: number }>();
  for (const e of envios) {
    const p = e.pedido_id ? d.pedidos.get(e.pedido_id) : undefined;
    if (!p || !e.pedido_id) continue;
    const x = porPedido.get(e.pedido_id) ?? { venda: Number(p.valor_total) || 0, custo: p.custo_itens, frete: 0 };
    if (e.pagador === "empresa") x.frete += custoFrete(e) ?? 0;
    porPedido.set(e.pedido_id, x);
  }
  const ps = [...porPedido.values()];
  const venda = ps.reduce((s, p) => s + p.venda, 0);
  const freteEmpresa = ps.reduce((s, p) => s + p.frete, 0);
  const comCustoItens = ps.filter((p) => p.custo != null);
  const vendaC = comCustoItens.reduce((s, p) => s + p.venda, 0);
  const margem = vendaC ? comCustoItens.reduce((s, p) => s + p.venda - (p.custo ?? 0) - p.frete, 0) / vendaC : null;

  return {
    envios: envios.length,
    comCusto: custos.length, custoTotal: r2(custos.reduce((s, x) => s + x, 0)), custoMedio: custos.length ? r2(custos.reduce((s, x) => s + x, 0) / custos.length) : null,
    conciliados: conc.length, variacaoReais: conc.length ? r2(somaDif) : null, variacaoPct: somaAprov ? somaDif / somaAprov : null,
    divergentes: conc.filter((e) => freteDivergente(e.valor_aprovado, e.valor_final)).length,
    entregues: entregues.length, comPrazo: comPrazo.length, noPrazo: noPrazo.length, noPrazoPct: pct(noPrazo.length, comPrazo.length),
    tempoCotacaoDias: media(tCot), tempoColetaDias: media(tCol),
    avariaPct: pct(comTipo("avaria"), envios.length), reentregaPct: pct(comTipo("reentrega"), envios.length), ocorrenciaPct: pct(comTipo(), envios.length),
    comprovantePct: pct(comprovante, entregues.length),
    pedidos: ps.length, venda: r2(venda), freteEmpresa: r2(freteEmpresa), freteSobreVenda: venda ? freteEmpresa / venda : null,
    pedidosComCusto: comCustoItens.length, margemAposFrete: margem,
  };
}

/** Agrupa e calcula as métricas de cada grupo (mais envios primeiro). */
export function agruparMetricas(envios: Envio[], d: DadosIndicadores, chave: (e: Envio) => string, rotulo: (k: string, e: Envio) => string, detalhe?: (k: string) => string): Segmento[] {
  const grupos = new Map<string, Envio[]>();
  for (const e of envios) {
    const k = chave(e);
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  return [...grupos.entries()]
    .map(([k, es]) => ({ chave: k, rotulo: rotulo(k, es[0]), detalhe: detalhe?.(k), m: calcularMetricas(es, d) }))
    .sort((a, b) => b.m.envios - a.m.envios || a.rotulo.localeCompare(b.rotulo));
}

export const SERVICOS_ORDEM: [ServicoChave, string][] = [...TIPOS_SERVICO, ["nao_informado", "Serviço não informado"]];

/** Uma linha por tipo de serviço (na ordem econômico → dedicado) e o total separado. */
export function indicadoresPorServico(envios: Envio[], d: DadosIndicadores) {
  const servicos = SERVICOS_ORDEM
    .map(([k, r]) => ({ chave: k as string, rotulo: r, m: calcularMetricas(envios.filter((e) => servicoDe(e) === k), d) }))
    .filter((s) => s.m.envios > 0);
  return { servicos, total: calcularMetricas(envios, d) };
}

/** Recorte de um serviço ("todos" = total). */
export const doServico = (envios: Envio[], servico: string) => (servico === "todos" ? envios : envios.filter((e) => servicoDe(e) === servico));

export const porDestino = (envios: Envio[], d: DadosIndicadores) =>
  agruparMetricas(envios, d, (e) => e.uf_destino ?? "—", (k) => (k === "—" ? "UF não informada" : `${k} · ${regiaoDaUf(k) ?? "?"}`));

export const porRota = (envios: Envio[], d: DadosIndicadores) =>
  agruparMetricas(envios, d, (e) => `${e.uf_origem ?? "?"} → ${e.uf_destino ?? "?"}`, (k) => k);

export const porTransportadora = (envios: Envio[], d: DadosIndicadores, nome: (e: Envio) => string) =>
  agruparMetricas(envios, d, (e) => e.transportadora_id ?? `nome:${(e.transportadora_nome ?? "").trim().toLowerCase() || "—"}`,
    (k, e) => (k === "nome:—" ? "Sem transportadora (em cotação)" : nome(e)));

/** Mês anterior / seguinte (AAAA-MM). */
export function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
