export type Cliente = {
  id: string; codigo?: number | null; nome_fantasia?: string | null; tipo_pessoa: "PF" | "PJ"; nome: string; cpf_cnpj: string | null;
  inscricao_estadual: string | null; contribuinte_icms: number; email: string | null;
  telefone: string | null; whatsapp: string | null; cep: string | null; logradouro: string | null;
  numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null;
  uf: string | null; observacoes: string | null; avisos_email?: boolean; created_at?: string; preferencias?: string | null; portal_token?: string;
  tags?: string[] | null; receita?: any; receita_situacao?: string | null; ie_situacao?: string | null; receita_em?: string | null;
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
export type Transportadora = Endereco & { id: string; codigo?: number | null; created_at?: string; nome: string; nome_fantasia?: string | null; cnpj?: string | null; inscricao_estadual?: string | null; contato?: string | null; whatsapp: string | null; telefone: string | null; email: string | null; regioes: string | null; ativo: boolean };

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
