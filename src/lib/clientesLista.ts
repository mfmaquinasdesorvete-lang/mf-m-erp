// Colunas que a lista de clientes (e o painel dos cadastros) baixa: todas menos as pesadas que a lista não usa.
// `receita` (a resposta inteira da Receita, metade do peso da tabela) e `dados_arquivados` ficam de fora; a ficha
// (ReceitaCliente) busca a `receita` do cliente aberto. Coluna nova que a lista ou o formulário usem: acrescente aqui.
export const SELECT_LISTA_CLIENTES = [
  "id", "tipo_pessoa", "nome", "cpf_cnpj", "inscricao_estadual", "contribuinte_icms", "email", "telefone", "whatsapp", "cep",
  "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "observacoes", "created_at", "avisos_email", "email_token",
  "codigo", "nome_fantasia", "id_externo", "preferencias", "portal_token", "tags", "receita_situacao", "ie_situacao", "receita_em",
  "arquivado_em", "arquivado_motivo", "unificado_em", "telefone_adicional", "website", "email_nfe", "contato_observacoes",
  "inscricao_municipal", "inscricao_suframa", "regime_tributario", "data_nascimento", "status_crm", "vendedor_id",
  "forma_pagamento_id", "condicao_pagamento", "desconto_padrao", "limite_credito", "cobranca_diferente", "cobranca_cep",
  "cobranca_logradouro", "cobranca_numero", "cobranca_complemento", "cobranca_bairro", "cobranca_municipio", "cobranca_uf",
  "tabela_preco_id", "marcadores", "endereco_etiqueta", "enderecos_extras", "unificacoes", "compra_maquina_em", "portal_conferir",
  "tecnico_id", "cadastro_origem_em", "portal_link", "instagram", "facebook", "tiktok", "redes_sugeridas", "redes_buscado_em",
  "inativo_em", "inativo_motivo",
].join(", ");
