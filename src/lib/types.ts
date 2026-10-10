export type Cliente = {
  id: string; codigo?: number | null; nome_fantasia?: string | null; tipo_pessoa: "PF" | "PJ"; nome: string; cpf_cnpj: string | null;
  inscricao_estadual: string | null; contribuinte_icms: number; email: string | null;
  telefone: string | null; whatsapp: string | null; cep: string | null; logradouro: string | null;
  numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null;
  uf: string | null; observacoes: string | null; avisos_email?: boolean; created_at?: string; preferencias?: string | null; portal_token?: string;
  tags?: string[] | null; receita?: any; receita_situacao?: string | null; ie_situacao?: string | null; receita_em?: string | null;
  telefone_adicional?: string | null; website?: string | null; email_nfe?: string | null; contato_observacoes?: string | null;
  inscricao_municipal?: string | null; inscricao_suframa?: string | null; regime_tributario?: number | null; data_nascimento?: string | null;
  status_crm?: string | null; vendedor_id?: string | null; forma_pagamento_id?: string | null; condicao_pagamento?: string | null;
  desconto_padrao?: number | null; limite_credito?: number | null; cobranca_diferente?: boolean;
  cobranca_cep?: string | null; cobranca_logradouro?: string | null; cobranca_numero?: string | null; cobranca_complemento?: string | null;
  cobranca_bairro?: string | null; cobranca_municipio?: string | null; cobranca_uf?: string | null;
};

/** Pessoa de contato do cliente (compras, financeiro…). Excluir = ativo false. */
export type PessoaContato = { id?: string; cliente_id?: string; nome: string; setor: string | null; email: string | null; telefone: string | null; ramal: string | null; ativo?: boolean };

/** Assinatura eletrônica da ficha cadastral (sem o desenho, que só vem no comprovante). */
export type AssinaturaFicha = {
  id: string; cliente_id: string; token: string; canal: "link" | "presencial"; status: "pendente" | "assinado" | "cancelado";
  nome: string | null; cpf: string | null; ip: string | null; hash: string | null; alteracoes: Record<string, { antes: string | null; depois: string | null }> | null;
  visualizado_em: string | null; assinado_em: string | null; expira_em: string; created_at: string;
};

export type Produto = {
  id: string; sku: string | null; descricao: string; tipo: string; unidade: string; ncm: string | null;
  cest: string | null; cfop: string | null; origem: number; icms_situacao: string | null;
  preco_custo: number; preco_venda: number; estoque_atual: number; estoque_minimo: number;
  localizacao: string | null; ativo: boolean; fornecedor_padrao_id?: string | null; garantia_meses?: number | null;
  peso_kg?: number | null; altura_cm?: number | null; largura_cm?: number | null; profundidade_cm?: number | null; embalagem_id?: string | null;
  no_catalogo?: boolean; descricao_catalogo?: string | null; foto_caminho?: string | null;
  id_externo?: string | null; marca?: string | null; categoria?: string | null; observacoes?: string | null;
  estoque_maximo?: number; sob_encomenda?: boolean; vendavel?: boolean; codigo_barras?: string | null; kit?: boolean;
  modelo?: string | null; codigo_fabricante?: string | null; codigos_alternativos?: string | null; fora_de_linha?: boolean;
  prazo_reposicao_dias?: number | null; compra_minima?: number | null; created_at?: string;
  titulo_anuncio?: string | null; slug?: string | null; meta_descricao?: string | null; palavras_chave?: string[] | null;
  descricao_anuncio?: string | null; gtin_isento?: boolean; unificado_em?: string | null; unificado_quando?: string | null;
};

export type Item = {
  id?: string; produto_id: string; descricao: string; quantidade: number;
  valor_unitario: number; numero_serie?: string | null; kit_escolha?: EscolhaKit | null;
};

export type Pedido = {
  id: string; numero: number; cliente_id: string; origem: string; status: string; vendedor: string | null;
  forma_pagamento: string; parcelas: number; primeiro_vencimento: string | null; intervalo_dias: number;
  modalidade_frete: number; valor_produtos: number; desconto: number; frete: number; valor_total: number;
  observacoes: string | null; created_at: string; cliente?: Cliente; itens?: Item[];
  /** ambiente "homologacao" = nota de teste, sem valor fiscal */
  notas?: { id: string; status: string; ambiente?: string }[];
  vendedor_id?: string | null; comissao_percentual?: number | null; unidade_id?: string | null;
  transportadora_id?: string | null; codigo_rastreio?: string | null; aprovado_em?: string | null; volumes?: number | null; peso_total_kg?: number | null;
  proposta_token?: string; proposta_status?: string | null; proposta_enviada_em?: string | null; proposta_visualizada_em?: string | null;
  proposta_respondida_em?: string | null; proposta_validade?: string | null; proposta_resposta_nome?: string | null;
  motivo_rejeicao?: string | null; motivo_rejeicao_texto?: string | null; concorrente?: string | null;
};

export type OrdemServico = {
  id: string; numero: number; cliente_id: string; produto_id: string | null; equipamento: string;
  numero_serie: string | null; defeito_relatado: string; diagnostico: string | null; solucao: string | null;
  status: string; em_garantia: boolean; tecnico: string | null; valor_mao_obra: number; valor_pecas: number;
  valor_total: number; data_entrada: string; previsao: string | null; observacoes: string | null;
  cliente?: Cliente; itens?: Item[];
};

export type Equipamento = {
  id: string; cliente_id: string; produto_id: string | null; descricao: string; numero_serie: string | null;
  pedido_id: string | null; data_venda: string; garantia_ate: string | null; proxima_preventiva: string | null;
  ultimo_contato: string | null; observacoes: string | null; cliente?: Cliente;
};

export type ItemChecklist = { item: string; ok: boolean; obs?: string };
export type FotoOS = { caminho: string; legenda?: string; criado_em: string };

export type Config = {
  razao_social: string; nome_fantasia: string | null; cnpj: string | null; inscricao_estadual: string | null;
  municipio: string | null; uf: string | null; whatsapp: string | null; endereco: string | null; telefone: string | null;
  email: string | null; validade_orcamento_dias: number; garantia_meses_padrao: number; preventiva_meses: number;
  comissao_percentual: number; termo_garantia: string;
  proposta_titulo?: string; proposta_apresentacao?: string | null; proposta_condicoes?: string | null;
  proposta_rodape?: string | null; proposta_cor?: string; proposta_fotos?: boolean;
  nfe_automatica?: boolean; vender_sem_estoque?: boolean; expedicao_apos?: "aprovacao" | "nfe";
  etiqueta_formato?: "10x15" | "a4";
  contador_nome?: string | null; contador_email?: string | null; contador_envio_auto?: boolean; contador_envio_dia?: number;
  custos_pagamento?: { cartao_pct?: number; boleto_fixo?: number; pix_pct?: number; transferencia_pct?: number; dinheiro_pct?: number };
};

export type Vendedor = {
  id: string; nome: string; tipo: "vendedor" | "representante"; user_id: string | null; percentual: number;
  base: "recebimento" | "faturamento"; descontar_frete: boolean; cpf_cnpj: string | null; email: string | null;
  whatsapp: string | null; pix: string | null; ativo: boolean;
};
export type KitComponente = { id: string; kit_id: string; componente_id: string; quantidade: number; opcional: boolean; grupo: string | null; padrao: boolean };
export type EscolhaKit = { componente_id: string; quantidade: number }[];

type Endereco = { cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; municipio: string | null; uf: string | null };
export type Fornecedor = Endereco & { id: string; codigo?: number | null; created_at?: string; nome: string; nome_fantasia?: string | null; cnpj: string | null; inscricao_estadual?: string | null; telefone: string | null; whatsapp: string | null; email: string | null; observacoes?: string | null; chave_pix?: string | null;
  // conferência com a Receita (como nos clientes)
  tags?: string[] | null; receita?: any; receita_situacao?: string | null; ie_situacao?: string | null; receita_em?: string | null };
export type TipoTransportadora = "transportadora" | "correios" | "agencia" | "aerea" | "plataforma" | "aplicativo" | "autonomo" | "proprio" | "retira" | "outro";
export type ApiTransportadora = "sim" | "parcial" | "plataforma" | "nao" | "desconhecido";
export type ContatoTransportadora = { nome?: string; cargo?: string; email?: string; telefone?: string; whatsapp?: string; filial?: string };
export type UnidadeRede = { nome?: string; cnpj?: string; municipio?: string; uf?: string; endereco?: string; telefone?: string; email?: string; origem?: string };
export type Transportadora = Endereco & {
  id: string; codigo?: number | null; created_at?: string; nome: string; nome_fantasia?: string | null; cnpj?: string | null; inscricao_estadual?: string | null;
  contato?: string | null; whatsapp: string | null; telefone: string | null; email: string | null; regioes: string | null; ativo: boolean; observacoes?: string | null;
  /** marca a que esta filial pertence (nulo = é a marca, o cartão da lista) */
  matriz_id?: string | null; tipo?: TipoTransportadora;
  site?: string | null; rastreio_url?: string | null; portal_url?: string | null; cotacao_url?: string | null;
  api?: ApiTransportadora; api_doc_url?: string | null; api_recursos?: string[]; api_como_obter?: string | null; sistema?: string | null;
  integracoes?: string[]; servicos?: string[]; abrangencia?: string[]; sac_telefone?: string | null; sac_email?: string | null;
  contatos?: ContatoTransportadora[]; emails_operacionais?: { email: string; uso?: string }[]; rede?: UnidadeRede[];
  condicoes?: string | null; restricoes?: string | null; alerta?: string | null; ultimo_contato?: string | null;
  pesquisa_em?: string | null; pesquisa_fontes?: string[]; conferido_em?: string | null; conferido_por?: string | null;
  unificado_em?: string | null;
};

export type OrdemProducao = {
  id: string; numero: number; produto_id: string; quantidade: number; status: string; previsao: string | null;
  responsavel: string | null; numeros_serie: string | null; observacoes: string | null; concluida_em: string | null; created_at: string;
  produto?: Produto;
};
export type Necessidade = {
  ordem_id: string; componente_id: string; descricao: string; unidade: string; fornecedor_padrao_id: string | null; preco_custo: number;
  necessario: number; estoque_atual: number; reservado_outras_op: number; a_caminho: number;
};
export type ItemCompra = { id?: string; produto_id: string; descricao: string; quantidade: number; custo_unitario: number; quantidade_recebida?: number };
export type PedidoCompra = {
  id: string; numero: number; fornecedor_id: string | null; ordem_producao_id: string | null; status: string; previsao_entrega: string | null;
  condicao_pagamento: string | null; frete: number; valor_total: number; observacoes: string | null; created_at: string;
  fornecedor?: Fornecedor | null; itens?: ItemCompra[];
};
