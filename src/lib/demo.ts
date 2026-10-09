// =====================================================================
// MODO DEMONSTRAÇÃO (VITE_DEMO=1)
// Substitui o Supabase por um banco em memória com dados de exemplo e
// simula as Edge Functions (Focus NFe, avisos). Nada sai do navegador e
// tudo volta ao estado inicial ao recarregar a página.
// =====================================================================

import { EXEMPLOS, TIPOS_PADRAO } from "./avisos";

type Row = Record<string, any>;
type Db = Record<string, Row[]>;

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dias = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const quando = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
let seq = 1000;
const uid = () => `demo-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const U_SC = "un-sc", U_SP = "un-sp"; // matriz e filial da demonstração

export const USUARIOS_DEMO = [
  { user_id: "u-admin", nome: "Elem Olmedo", papel: "admin", email: "admin@mfmaquinas.com.br" },
  { user_id: "u-vendas", nome: "Carla Vendas", papel: "vendas", email: "vendas@mfmaquinas.com.br" },
  { user_id: "u-fin", nome: "Rafael Financeiro", papel: "financeiro", email: "financeiro@mfmaquinas.com.br" },
  { user_id: "u-tec", nome: "Diego Técnico", papel: "tecnico", email: "assistencia@mfmaquinas.com.br" },
  { user_id: "u-cont", nome: "Escritório Contábil Exemplo", papel: "contador", email: "contador@escritorio.com.br" },
];

/** Leitura simples do XML de NF-e para a demonstração. */
function lerXmlDemo(xml: string) {
  const tag = (t: string, dentro = xml) => dentro.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "";
  const bloco = (t: string) => xml.match(new RegExp(`<${t}[\\s>][\\s\\S]*?</${t}>`))?.[0] ?? "";
  const chave = xml.match(/Id="NFe(\d{44})"/)?.[1];
  if (!chave) return null;
  const emit = bloco("emit"), dest = bloco("dest");
  return { chave, numero: tag("nNF"), emit: tag("CNPJ", emit), emitente: tag("xNome", emit), dest: tag("CNPJ", dest) || tag("CPF", dest), destNome: tag("xNome", dest),
    valor: Number(tag("vNF")), data: tag("dhEmi") || quando(0), cancelada: ["101", "151"].includes(tag("cStat", bloco("infProt"))) };
}

// ---------------------------------------------------------------------
// Dados de exemplo
// ---------------------------------------------------------------------
function seed(): Db {
  const db: Db = {
    usuarios_erp: USUARIOS_DEMO.map((u, i) => ({
      ...u, ativo: true, created_at: quando(-200 + i), ultimo_acesso: quando(-i), avisos: {},
      telegram_chat_id: ["u-fin", "u-tec"].includes(u.user_id) ? 5000 + i : null,
    })),
    configuracoes: [{
      id: 1, razao_social: "MF MÁQUINAS LTDA", nome_fantasia: "MF Máquinas", cnpj: "46942855000132",
      inscricao_estadual: "261770233", uf: "SC", municipio: "São José", whatsapp: "4833755280",
      regime_tributario: 1, natureza_operacao: "Venda de mercadoria", cfop_padrao: "5102", icms_situacao_padrao: "102",
      pis_situacao_padrao: "49", cofins_situacao_padrao: "49", presenca_comprador: 9, dias_vencimento_boleto: 3,
      multa_percentual: 2, juros_percentual_mes: 1, entrada_automatica_estoque: true, conta_pagar_automatica: true,
      endereco: "Rua Leonel Felisbino da Silva, S/N, Q 4 - L 9 - Galpão 6, Areias - CEP 88113-837", telefone: "(48) 3375-5280", email: "mfmaquinasdesorvete@gmail.com",
      catalogo_texto: "Máquinas de sorvete soft, expresso e milk shake com garantia, peças e assistência técnica própria.",
      telegram_bot: "MFMaquinasAvisosBot", avisos_email_ativo: true, email_responder_para: "comercial@mfmaquinas.com.br",
      ibs_cbs_ativo: true, cbs_aliquota: 0.9, ibs_uf_aliquota: 0.1, ibs_mun_aliquota: 0,
      validade_orcamento_dias: 7, garantia_meses_padrao: 12, preventiva_meses: 6, comissao_percentual: 3,
      etiqueta_formato: "10x15", etiqueta_modelo: {},
      termo_garantia: "Garantia contra defeitos de fabricação conforme prazo indicado. Não cobre mau uso, quedas, ligação em tensão errada, falta de limpeza ou manutenção preventiva, nem peças de desgaste natural (vedações, correias, bicos).",
    }],
    clientes: [
      { id: "c1", tipo_pessoa: "PJ", nome: "Sorveteria Gelato Nobre Ltda", cpf_cnpj: "23456789000195", inscricao_estadual: "244123456119", contribuinte_icms: 1, email: "compras@gelatonobre.com.br", telefone: "1633334444", whatsapp: "16988887777", cep: "14020260", logradouro: "Av. Presidente Vargas", numero: "1200", bairro: "Jardim América", municipio: "Ribeirão Preto", uf: "SP" },
      { id: "c2", tipo_pessoa: "PJ", nome: "Açaí & Cia Franca ME", cpf_cnpj: "34567890000130", contribuinte_icms: 9, email: "acaieciafranca@gmail.com", whatsapp: "16977776666", cep: "14400000", logradouro: "Rua Voluntários da Franca", numero: "845", bairro: "Centro", municipio: "Franca", uf: "SP" },
      { id: "c3", tipo_pessoa: "PF", nome: "Juliana Rezende", cpf_cnpj: "12345678909", contribuinte_icms: 9, email: "ju.rezende@gmail.com", whatsapp: "34999112233", cep: "38400000", logradouro: "Rua Goiás", numero: "77", bairro: "Centro", municipio: "Uberlândia", uf: "MG" },
      { id: "c4", tipo_pessoa: "PJ", nome: "Doce Gelo Sorvetes Eireli", cpf_cnpj: "45678901000175", contribuinte_icms: 1, inscricao_estadual: "0012345670012", email: "financeiro@docegelo.com.br", whatsapp: "62988775544", cep: "74000000", logradouro: "Av. T-63", numero: "1500", bairro: "Setor Bueno", municipio: "Goiânia", uf: "GO" },
      { id: "c5", tipo_pessoa: "PJ", nome: "Lanchonete Ponto Doce", cpf_cnpj: "56789012000100", contribuinte_icms: 9, whatsapp: "16991234567", cep: "14800000", logradouro: "Av. Brasil", numero: "300", bairro: "Centro", municipio: "Araraquara", uf: "SP" },
    ],
    fornecedores: [
      { id: "f1", nome: "Refrigeração Andrade Ltda", cnpj: "11222333000181", whatsapp: "11991112200", telefone: "1132221100", email: "vendas@refriandrade.com.br", municipio: "São Paulo", uf: "SP" },
      { id: "f2", nome: "Inox Paulista Componentes", cnpj: "22333444000181", whatsapp: "19992223300", telefone: "1934445566", email: "pedidos@inoxpaulista.com.br", municipio: "Campinas", uf: "SP" },
      { id: "f3", nome: "EletroControl Automação", cnpj: "33444555000181", whatsapp: "41993334400", telefone: "4133221144", municipio: "Curitiba", uf: "PR" },
    ],
    produtos: [
      { id: "p1", sku: "MF-SOFT-300", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", tipo: "maquina", unidade: "UN", ncm: "84186990", origem: 0, peso_kg: 145, altura_cm: 150, largura_cm: 55, profundidade_cm: 80, preco_custo: 14800, preco_venda: 23900, garantia_meses: 12, estoque_atual: 4, estoque_minimo: 2, localizacao: "Galpão A", ativo: true, codigo_barras: null },
      { id: "p2", sku: "MF-SOFT-150", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", tipo: "maquina", unidade: "UN", ncm: "84186990", origem: 0, peso_kg: 82, altura_cm: 85, largura_cm: 50, profundidade_cm: 70, preco_custo: 8900, preco_venda: 14500, garantia_meses: 12, estoque_atual: 6, estoque_minimo: 2, localizacao: "Galpão A", ativo: true },
      { id: "p3", sku: "MF-SHAKE-2", descricao: "Máquina de Milk Shake MF-MS2 (2 hastes)", tipo: "maquina", unidade: "UN", ncm: "85094050", origem: 0, peso_kg: 14, altura_cm: 55, largura_cm: 35, profundidade_cm: 25, preco_custo: 2100, preco_venda: 3690, garantia_meses: 6, estoque_atual: 1, estoque_minimo: 3, localizacao: "Galpão B", ativo: true },
      { id: "p4", sku: "PC-MOT-05", descricao: "Motor do batedor 1/2 CV", tipo: "peca", fornecedor_padrao_id: "f1", peso_kg: 6, unidade: "UN", ncm: "85015210", origem: 0, preco_custo: 420, preco_venda: 790, estoque_atual: 9, estoque_minimo: 4, localizacao: "Prateleira 3", ativo: true, codigo_barras: "7891234567895" },
      { id: "p5", sku: "PC-VED-KIT", descricao: "Kit vedação do cilindro", tipo: "peca", fornecedor_padrao_id: "f2", peso_kg: 0.2, unidade: "UN", ncm: "40169300", origem: 0, preco_custo: 38, preco_venda: 95, estoque_atual: 40, estoque_minimo: 15, localizacao: "Prateleira 1", ativo: true },
      { id: "p6", sku: "PC-PLACA-V3", descricao: "Placa eletrônica controladora V3", tipo: "peca", fornecedor_padrao_id: "f3", peso_kg: 0.4, unidade: "UN", ncm: "85371020", origem: 0, preco_custo: 610, preco_venda: 1180, estoque_atual: 2, estoque_minimo: 3, localizacao: "Prateleira 5", ativo: true },
      { id: "p7", sku: "PC-BICO-INOX", descricao: "Bico dosador inox", tipo: "peca", fornecedor_padrao_id: "f2", peso_kg: 0.3, unidade: "UN", ncm: "73269090", origem: 0, preco_custo: 55, preco_venda: 140, estoque_atual: 25, estoque_minimo: 10, localizacao: "Prateleira 2", ativo: true },
      { id: "p8", sku: "PC-COMP-1HP", descricao: "Compressor 1 HP R404A", tipo: "peca", fornecedor_padrao_id: "f1", peso_kg: 14, unidade: "UN", ncm: "84143019", origem: 1, preco_custo: 1350, preco_venda: 2290, estoque_atual: 3, estoque_minimo: 2, localizacao: "Galpão B", ativo: true },
      { id: "p9", sku: "AC-CASQ-500", descricao: "Suporte para casquinhas inox (20 un.)", tipo: "acessorio", unidade: "UN", ncm: "73239900", origem: 0, preco_custo: 85, preco_venda: 189, estoque_atual: 14, estoque_minimo: 5, ativo: true },
      { id: "p10", sku: "IN-LUB-ALIM", descricao: "Lubrificante grau alimentício 250 g", tipo: "insumo", unidade: "UN", ncm: "34031900", origem: 0, preco_custo: 22, preco_venda: 49, estoque_atual: 30, estoque_minimo: 10, ativo: true },
    ],
    estoque_movimentos: [],
    pedidos: [
      { id: "pd1", numero: 101, cliente_id: "c1", origem: "whatsapp", status: "entregue", vendedor: "Carla", forma_pagamento: "boleto", parcelas: 3, intervalo_dias: 30, modalidade_frete: 0, desconto: 900, frete: 350, created_at: quando(-34), estoque_baixado: true },
      { id: "pd2", numero: 102, cliente_id: "c4", origem: "whatsapp", status: "faturado", vendedor: "Carla", forma_pagamento: "boleto", parcelas: 2, intervalo_dias: 30, modalidade_frete: 1, desconto: 0, frete: 0, created_at: quando(-6), estoque_baixado: true },
      { id: "pd3", numero: 103, cliente_id: "c2", origem: "whatsapp", status: "aprovado", vendedor: "Carla", forma_pagamento: "pix", parcelas: 1, intervalo_dias: 30, modalidade_frete: 9, desconto: 100, frete: 0, created_at: quando(-2), estoque_baixado: true },
      { id: "pd4", numero: 104, cliente_id: "c3", origem: "whatsapp", status: "orcamento", vendedor: "Carla", forma_pagamento: "boleto", parcelas: 4, intervalo_dias: 30, modalidade_frete: 1, desconto: 0, frete: 0, created_at: quando(-1), estoque_baixado: false },
      { id: "pd5", numero: 105, cliente_id: "c5", origem: "telefone", status: "orcamento", vendedor: "Carla", forma_pagamento: "boleto", parcelas: 1, intervalo_dias: 30, modalidade_frete: 9, desconto: 0, frete: 0, created_at: quando(0), estoque_baixado: false },
    ],
    pedido_itens: [
      { id: "pi1", pedido_id: "pd1", produto_id: "p1", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", quantidade: 1, valor_unitario: 23900, numero_serie: "MF300-2026-0081" },
      { id: "pi2", pedido_id: "pd1", produto_id: "p9", descricao: "Suporte para casquinhas inox (20 un.)", quantidade: 2, valor_unitario: 189 },
      { id: "pi3", pedido_id: "pd2", produto_id: "p2", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", quantidade: 2, valor_unitario: 14500, numero_serie: "MF150-2026-0144 / 0145" },
      { id: "pi4", pedido_id: "pd3", produto_id: "p3", descricao: "Máquina de Milk Shake MF-MS2 (2 hastes)", quantidade: 1, valor_unitario: 3690 },
      { id: "pi5", pedido_id: "pd4", produto_id: "p1", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", quantidade: 1, valor_unitario: 23500 },
      { id: "pi6", pedido_id: "pd5", produto_id: "p5", descricao: "Kit vedação do cilindro", quantidade: 4, valor_unitario: 95 },
      { id: "pi7", pedido_id: "pd5", produto_id: "p10", descricao: "Lubrificante grau alimentício 250 g", quantidade: 2, valor_unitario: 49 },
    ],
    ordens_servico: [
      { id: "os1", numero: 51, cliente_id: "c1", produto_id: "p1", equipamento: "Máquina de Sorvete Soft MF-300", numero_serie: "MF300-2025-0012", equipamento_id: "e4", checklist: checklistDemo(["Tampa do reservatório"]), fotos: [{ caminho: "demo/os1-a.jpg", criado_em: quando(-4) }, { caminho: "demo/os1-b.jpg", criado_em: quando(-4) }], defeito_relatado: "Sorvete saindo mole e motor fazendo barulho", diagnostico: "Rolamento do motor do batedor desgastado", status: "em_reparo", em_garantia: true, tecnico: "Diego", valor_mao_obra: 280, data_entrada: dias(-4), previsao: dias(1), created_at: quando(-4), estoque_baixado: false },
      { id: "os2", numero: 52, cliente_id: "c5", produto_id: "p2", equipamento: "Máquina de Sorvete Expressa MF-150", numero_serie: "MF150-2025-0230", equipamento_id: "e5", checklist: checklistDemo([]), fotos: [], defeito_relatado: "Não liga", diagnostico: "Placa controladora queimada (surto de energia)", status: "aguardando_peca", em_garantia: true, tecnico: "Diego", valor_mao_obra: 0, data_entrada: dias(-6), previsao: dias(3), created_at: quando(-6), estoque_baixado: false },
      { id: "os3", numero: 53, cliente_id: "c2", equipamento: "Máquina de Milk Shake (outra marca)", defeito_relatado: "Haste não gira", checklist: checklistDemo(["Cabo de energia e plugue"]), fotos: [], status: "aberta", em_garantia: false, tecnico: null, valor_mao_obra: 0, data_entrada: dias(0), created_at: quando(0), estoque_baixado: false },
      { id: "os4", numero: 50, cliente_id: "c4", produto_id: "p1", equipamento: "Máquina de Sorvete Soft MF-300", numero_serie: "MF300-2024-0007", equipamento_id: "e6", checklist: checklistDemo([]), fotos: [], defeito_relatado: "Vazamento no cilindro", diagnostico: "Vedação ressecada", solucao: "Troca do kit de vedação e lubrificação", status: "concluida", em_garantia: false, tecnico: "Diego", valor_mao_obra: 180, data_entrada: dias(-10), concluida_em: quando(-1), created_at: quando(-10), estoque_baixado: true },
    ],
    os_itens: [
      { id: "oi1", os_id: "os1", produto_id: "p4", descricao: "Motor do batedor 1/2 CV", quantidade: 1, valor_unitario: 790 },
      { id: "oi2", os_id: "os2", produto_id: "p6", descricao: "Placa eletrônica controladora V3", quantidade: 1, valor_unitario: 1180 },
      { id: "oi3", os_id: "os4", produto_id: "p5", descricao: "Kit vedação do cilindro", quantidade: 1, valor_unitario: 95 },
    ],
    contas_receber: [
      { id: "r1", descricao: "Pedido #101 - parcela 1/3", cliente_id: "c1", pedido_id: "pd1", parcela: 1, total_parcelas: 3, valor: 7909.33, vencimento: dias(-31), status: "pago", forma_pagamento: "boleto", data_pagamento: dias(-31), valor_pago: 7909.33 },
      { id: "r2", descricao: "Pedido #101 - parcela 2/3", cliente_id: "c1", pedido_id: "pd1", parcela: 2, total_parcelas: 3, valor: 7909.33, vencimento: dias(-1), status: "aberto", forma_pagamento: "boleto" },
      { id: "r3", descricao: "Pedido #101 - parcela 3/3", cliente_id: "c1", pedido_id: "pd1", parcela: 3, total_parcelas: 3, valor: 7909.34, vencimento: dias(29), status: "aberto", forma_pagamento: "boleto" },
      { id: "r4", descricao: "Pedido #102 - parcela 1/2", cliente_id: "c4", pedido_id: "pd2", parcela: 1, total_parcelas: 2, valor: 14500, vencimento: dias(-3), status: "pago", forma_pagamento: "boleto", data_pagamento: dias(-3), valor_pago: 14500 },
      { id: "r5", descricao: "Pedido #102 - parcela 2/2", cliente_id: "c4", pedido_id: "pd2", parcela: 2, total_parcelas: 2, valor: 14500, vencimento: dias(27), status: "aberto", forma_pagamento: "boleto" },
      { id: "r6", descricao: "Pedido #103 - parcela 1/1", cliente_id: "c2", pedido_id: "pd3", parcela: 1, total_parcelas: 1, valor: 3590, vencimento: dias(1), status: "aberto", forma_pagamento: "pix" },
      { id: "r7", descricao: "Assistência técnica OS #50", cliente_id: "c4", os_id: "os4", parcela: 1, total_parcelas: 1, valor: 275, vencimento: dias(2), status: "aberto", forma_pagamento: "boleto" },
    ],
    contas_pagar: [
      { id: "cp1", descricao: "NF 48211 - Refrigeração Andrade Ltda (1/2)", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48211 dup 001", valor: 4050, vencimento: dias(5), status: "aberto", nfe_recebida_id: "nr1" },
      { id: "cp2", descricao: "NF 48211 - Refrigeração Andrade Ltda (2/2)", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48211 dup 002", valor: 4050, vencimento: dias(35), status: "aberto", nfe_recebida_id: "nr1" },
      { id: "cp3", descricao: "Aluguel do galpão", categoria: "aluguel", valor: 6500, vencimento: dias(-2), status: "aberto" },
      { id: "cp4", descricao: "Energia elétrica", categoria: "energia/água/internet", valor: 1380, vencimento: dias(8), status: "aberto" },
      { id: "cp5", descricao: "DAS Simples Nacional", categoria: "impostos", valor: 3920, vencimento: dias(-12), status: "pago", data_pagamento: dias(-13), valor_pago: 3920 },
    ],
    notas_fiscais: [
      { id: "nf1", pedido_id: "pd1", referencia: "pedido-101-1", status: "autorizada", numero: "1287", serie: "1", chave: "35261012345678000190550010000012871000012870", valor_total: 23728, mensagem: "Autorizado o uso da NF-e", created_at: quando(-33), marcadores: ["mk1", "mk2"],
        payload: { natureza_operacao: "Venda de mercadoria", nome_destinatario: "Sorveteria Gelato Nobre Ltda", cnpj_destinatario: "12345678000190", uf_destinatario: "SP", municipio_destinatario: "Campinas",
        items: [{ numero_item: 1, codigo_produto: "MF-300", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", cfop: "5101", codigo_ncm: "84186990", unidade_comercial: "UN", quantidade_comercial: 1, valor_unitario_comercial: 23078, valor_bruto: 23078, icms_situacao_tributaria: "00", icms_base_calculo: 23078, icms_aliquota: 18, icms_valor: 4154.04, ipi_valor: 0, pis_valor: 380.79, cofins_valor: 1753.93 },
          { numero_item: 2, codigo_produto: "SUP-20", descricao: "Suporte para casquinhas inox (20 un.)", cfop: "5102", codigo_ncm: "73239300", unidade_comercial: "UN", quantidade_comercial: 2, valor_unitario_comercial: 600, valor_bruto: 1200, icms_situacao_tributaria: "00", icms_base_calculo: 1200, icms_aliquota: 18, icms_valor: 216 }] }, },
      { id: "nf0", pedido_id: null, referencia: "pedido-99-1", status: "erro", numero: null, serie: null, chave: null, valor_total: 3590, ambiente: "producao", created_at: quando(-2), marcadores: ["mk8"],
        mensagem: "Rejeição 233: IE do destinatário não cadastrada", destinatario_nome: "Açaí & Cia Franca ME",
        payload: { natureza_operacao: "Venda de mercadoria", nome_destinatario: "Açaí & Cia Franca ME", cnpj_destinatario: "44555666000177", indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: "123", uf_destinatario: "SP", municipio_destinatario: "Franca", cep_destinatario: "14400000", logradouro_destinatario: "Rua X", numero_destinatario: "10", bairro_destinatario: "Centro",
          items: [{ numero_item: 1, codigo_produto: "MF-150", descricao: "Máquina MF-150", cfop: "6101", codigo_ncm: "84186990", quantidade_comercial: 1, valor_unitario_comercial: 3590, valor_bruto: 3590 }] } },
      { id: "nfh", pedido_id: null, referencia: "pedido-1-teste", status: "autorizada", numero: "431", serie: "1", chave: "42261011222333000181550010000004311000004310", valor_total: 30, ambiente: "homologacao", created_at: quando(-1), destinatario_nome: "Elem Cilene", mensagem: "Autorizado o uso da NF-e" },
      { id: "nf2", pedido_id: "pd2", referencia: "pedido-102-1", status: "autorizada", numero: "1301", serie: "1", chave: "35261012345678000190550010000013011000013010", valor_total: 29000, mensagem: "Autorizado o uso da NF-e", created_at: quando(-5) },
    ],
    nfe_cartas_correcao: [],
    nfe_inutilizacoes: [],
    marcadores: [
      { id: "mk1", nome: "1ª venda", cor: "indigo", icone: "star", ativo: true, ordem: 1 }, { id: "mk2", nome: "Pago", cor: "emerald", icone: "circle-check", ativo: true, ordem: 2 },
      { id: "mk3", nome: "Aguardando pagamento", cor: "amber", icone: "clock", ativo: true, ordem: 3 }, { id: "mk4", nome: "Carta de correção", cor: "orange", icone: "file-pen", ativo: true, ordem: 4 },
      { id: "mk5", nome: "Enviado ao cliente", cor: "sky", icone: "send", ativo: true, ordem: 5 }, { id: "mk6", nome: "Garantia", cor: "slate", icone: "shield", ativo: true, ordem: 6 },
      { id: "mk7", nome: "Devolução", cor: "purple", icone: "undo-2", ativo: true, ordem: 7 }, { id: "mk8", nome: "Conferir", cor: "red", icone: "triangle-alert", ativo: true, ordem: 8 },
    ],
    regras_tributacao: [
      { id: "rt1", nome: "Venda para consumidor final de outro estado", ativo: true, prioridade: 50, operacao: "venda", destino: "interestadual", tipo_cliente: "nao_contribuinte",
        difal: true, observacao_nfe: "DIFAL recolhido conforme EC 87/2015 e LC 190/2022.", created_at: quando(-20) },
      { id: "rt2", nome: "Peças importadas para outro estado (4%)", ativo: true, prioridade: 60, operacao: "venda", destino: "interestadual", tipo_produto: "peca",
        origem_mercadoria: "importada", icms_aliquota: 4, observacao_nfe: "Mercadoria importada - Resolução do Senado Federal 13/2012.", created_at: quando(-20) },
      { id: "rt3", nome: "Remessa para conserto (exemplo, desligada)", ativo: false, prioridade: 90, cfop: "5915", icms_cst: "41", ipi_cst: "55", pis_cst: "08", cofins_cst: "08", created_at: quando(-20) },
    ],
    nfe_recebidas: [
      {
        id: "nr1", chave: "35261011222333000181550010000482111000482110", emitente_nome: "Refrigeração Andrade Ltda", emitente_cnpj: "11222333000181",
        valor_total: 8100, data_emissao: quando(-3), situacao: "autorizada", manifestacao: "ciencia", fornecedor_id: "f1", conta_pagar_id: "cp1",
        estoque_lancado: true, processamento: "concluido", processamento_msg: null, created_at: quando(-3),
        itens: [{ numero: 1, codigo: "CMP-1HP-404", ean: null, descricao: "COMPRESSOR HERMETICO 1HP R404A", ncm: "84143019", cfop: "6102", unidade: "UN", quantidade: 6, valor_unitario: 1350, valor_total: 8100 }],
      },
      {
        id: "nr2", chave: "35261022333444000181550010000093321000093320", emitente_nome: "Inox Paulista Componentes", emitente_cnpj: "22333444000181",
        valor_total: 1520, data_emissao: quando(-1), situacao: "autorizada", manifestacao: "ciencia", fornecedor_id: "f2", conta_pagar_id: null,
        estoque_lancado: false, processamento: "aguardando_vinculo", created_at: quando(-1),
        processamento_msg: "1 item(ns) sem produto vinculado: CONJUNTO BICO DOSADOR 3 SABORES INOX. Vincule uma vez; nas próximas notas será automático.",
        itens: [
          { numero: 1, codigo: "BD-INOX-01", ean: null, descricao: "BICO DOSADOR INOX 304", ncm: "73269090", cfop: "5102", unidade: "CX", quantidade: 2, valor_unitario: 550, valor_total: 1100 },
          { numero: 2, codigo: "BD-INOX-3S", ean: null, descricao: "CONJUNTO BICO DOSADOR 3 SABORES INOX", ncm: "73269090", cfop: "5102", unidade: "UN", quantidade: 3, valor_unitario: 140, valor_total: 420 },
        ],
      },
      {
        id: "nr3", chave: "35261023456789000195550010000005521000005520", emitente_nome: "Sorveteria Gelato Nobre Ltda", emitente_cnpj: "23456789000195",
        valor_total: 23900, data_emissao: quando(-2), situacao: "autorizada", manifestacao: "ciencia", fornecedor_id: null, conta_pagar_id: null,
        estoque_lancado: false, processamento: "revisao", created_at: quando(-2),
        processamento_msg: "Não parece compra (CFOP 5915). Ex.: remessa para conserto. Confira e lance manualmente se for o caso.",
        itens: [{ numero: 1, codigo: "MF300", ean: null, descricao: "MAQUINA SORVETE MF-300 P/ CONSERTO", ncm: "84186990", cfop: "5915", unidade: "UN", quantidade: 1, valor_unitario: 23900, valor_total: 23900 }],
      },
    ],
    produto_fornecedor: [
      { id: "pf1", fornecedor_id: "f1", codigo_fornecedor: "CMP-1HP-404", produto_id: "p8", fator_conversao: 1 },
      { id: "pf2", fornecedor_id: "f2", codigo_fornecedor: "BD-INOX-01", produto_id: "p7", fator_conversao: 10 },
    ],
    transportadoras: [
      { id: "t1", nome: "Rodonaves", whatsapp: "16997770001", regioes: "SP, MG, GO, PR", ativo: true },
      { id: "t2", nome: "Braspress", whatsapp: "11997770002", regioes: "Todo o Brasil", ativo: true },
      { id: "t3", nome: "Transportes Mogiana", whatsapp: "16997770003", regioes: "Interior de SP", ativo: true },
    ],
    cotacoes_frete: [
      { id: "cf1", pedido_id: "pd4", transportadora_id: "t1", valor: 690, prazo_dias: 4, observacoes: "coleta amanhã", escolhida: false, created_at: quando(-1) },
      { id: "cf2", pedido_id: "pd4", transportadora_id: "t2", valor: 845, prazo_dias: 3, observacoes: "seguro incluso", escolhida: false, created_at: quando(-1) },
    ],
    produto_componentes: [
      { id: "pc1", produto_id: "p1", componente_id: "p4", quantidade: 1 },
      { id: "pc2", produto_id: "p1", componente_id: "p8", quantidade: 1 },
      { id: "pc3", produto_id: "p1", componente_id: "p6", quantidade: 1 },
      { id: "pc4", produto_id: "p1", componente_id: "p7", quantidade: 3 },
      { id: "pc5", produto_id: "p1", componente_id: "p5", quantidade: 2 },
      { id: "pc6", produto_id: "p2", componente_id: "p4", quantidade: 1 },
      { id: "pc7", produto_id: "p2", componente_id: "p8", quantidade: 1 },
      { id: "pc8", produto_id: "p2", componente_id: "p6", quantidade: 1 },
      { id: "pc9", produto_id: "p2", componente_id: "p7", quantidade: 1 },
      { id: "pc10", produto_id: "p2", componente_id: "p5", quantidade: 1 },
    ],
    ordens_producao: [
      { id: "op1", numero: 12, produto_id: "p1", quantidade: 3, status: "em_producao", previsao: dias(6), responsavel: "Equipe montagem", numeros_serie: "", created_at: quando(-5) },
      { id: "op2", numero: 13, produto_id: "p2", quantidade: 4, status: "planejada", previsao: dias(15), responsavel: "Equipe montagem", created_at: quando(-1) },
      { id: "op3", numero: 11, produto_id: "p2", quantidade: 2, status: "concluida", previsao: dias(-20), concluida_em: quando(-22), created_at: quando(-35) },
    ],
    pedidos_compra: [
      { id: "pco1", numero: 31, fornecedor_id: "f3", ordem_producao_id: "op1", status: "enviado", previsao_entrega: dias(3), condicao_pagamento: "28 dias boleto", frete: 45, observacoes: "Peças para a OP #12", created_at: quando(-4), enviado_em: quando(-4) },
      { id: "pco2", numero: 32, fornecedor_id: "f2", status: "cotacao", previsao_entrega: dias(10), frete: 0, observacoes: "Reposição de estoque", created_at: quando(-1) },
      { id: "pco3", numero: 30, fornecedor_id: "f1", status: "recebido", previsao_entrega: dias(-9), frete: 120, created_at: quando(-18), recebido_em: quando(-9) },
    ],
    pedido_compra_itens: [
      { id: "pci1", pedido_compra_id: "pco1", produto_id: "p6", descricao: "Placa eletrônica controladora V3", quantidade: 2, custo_unitario: 610, quantidade_recebida: 0 },
      { id: "pci2", pedido_compra_id: "pco2", produto_id: "p5", descricao: "Kit vedação do cilindro", quantidade: 30, custo_unitario: 0, quantidade_recebida: 0 },
      { id: "pci3", pedido_compra_id: "pco2", produto_id: "p7", descricao: "Bico dosador inox", quantidade: 20, custo_unitario: 0, quantidade_recebida: 0 },
      { id: "pci4", pedido_compra_id: "pco3", produto_id: "p8", descricao: "Compressor 1 HP R404A", quantidade: 6, custo_unitario: 1350, quantidade_recebida: 6 },
    ],
    contatos_cliente: [
      { id: "cc1", cliente_id: "c3", equipamento_id: "e8", tipo: "preventiva", canal: "whatsapp", resultado: "mensagem enviada pelo WhatsApp", proximo_contato: null, created_at: quando(-20) },
    ],
    equipamentos: [
      { id: "e1", cliente_id: "c1", produto_id: "p1", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", numero_serie: "MF300-2026-0081", pedido_id: "pd1", data_venda: dias(-34), garantia_ate: dias(331), proxima_preventiva: dias(148) },
      { id: "e2", cliente_id: "c4", produto_id: "p2", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", numero_serie: "MF150-2026-0144", pedido_id: "pd2", data_venda: dias(-6), garantia_ate: dias(359), proxima_preventiva: dias(176) },
      { id: "e3", cliente_id: "c4", produto_id: "p2", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", numero_serie: "MF150-2026-0145", pedido_id: "pd2", data_venda: dias(-6), garantia_ate: dias(359), proxima_preventiva: dias(176) },
      { id: "e4", cliente_id: "c1", produto_id: "p1", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", numero_serie: "MF300-2025-0012", data_venda: dias(-345), garantia_ate: dias(20), proxima_preventiva: dias(-12), ultimo_contato: dias(-190) },
      { id: "e5", cliente_id: "c5", produto_id: "p2", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", numero_serie: "MF150-2025-0230", data_venda: dias(-200), garantia_ate: dias(165), proxima_preventiva: dias(-18) },
      { id: "e6", cliente_id: "c4", produto_id: "p1", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", numero_serie: "MF300-2024-0007", data_venda: dias(-610), garantia_ate: dias(-245), proxima_preventiva: dias(181), ultimo_contato: dias(-1) },
      { id: "e7", cliente_id: "c2", produto_id: "p3", descricao: "Máquina de Milk Shake MF-MS2 (2 hastes)", numero_serie: "MS2-2025-0410", data_venda: dias(-160), garantia_ate: dias(22), proxima_preventiva: dias(18) },
      { id: "e8", cliente_id: "c3", produto_id: "p2", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", numero_serie: "MF150-2024-0099", data_venda: dias(-480), garantia_ate: dias(-115), proxima_preventiva: dias(-40) },
    ],
  };
  db.clientes.forEach((c, i) => { c.avisos_email = true; c.codigo = i + 1; });
  db.fornecedores.forEach((f, i) => { f.codigo = i + 1; });
  db.transportadoras.forEach((t, i) => { t.codigo = i + 1; });
  db.clientes[0].nome_fantasia = "Gelato Nobre";
  db.fornecedores[0].nome_fantasia = "Refri Andrade";
  // Matriz SC e filial SP
  const fiscal = { regime_tributario: 3, natureza_operacao: "Venda de mercadoria", cfop_venda_producao: "5101", cfop_venda_revenda: "5102", icms_cst: "00", icms_reducao_base: 0,
    pis_cst: "01", pis_aliquota: 1.65, cofins_cst: "01", cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, ipi_cst: "50", ipi_enquadramento: "999", difal_ativo: true,
    transf_icms_cst: "41", transf_pis_cofins_cst: "08", transf_destacar_ipi: true, ativo: true, serie_nfe: 1,
    ipi_cst_aliquota_zero: "51", ibs_cbs_cst: "000", ibs_cbs_class_trib: "000001", transf_ibs_cbs_cst: "410", transf_ibs_cbs_class_trib: "410002", informacoes_complementares: null };
  db.unidades = [
    { id: U_SC, codigo: "SC", nome: "Matriz SC", matriz: true, fabrica: true, assistencia: true, razao_social: "MF MÁQUINAS LTDA", cnpj: "46942855000132", inscricao_estadual: "261770233",
      logradouro: "Rua Leonel Felisbino da Silva", numero: "S/N", complemento: "Q 4 - L 9 - Galpão 6", bairro: "Areias", municipio: "São José", uf: "SC", cep: "88113837", telefone: "(48) 3375-5280", whatsapp: "4833755280", email: "mfmaquinasdesorvete@gmail.com", instrucoes_pagamento: "Pix (CNPJ): 46.942.855/0001-32", icms_aliquota_interna: 17, ...fiscal },
    { id: U_SP, codigo: "SP", nome: "Filial SP", matriz: false, fabrica: true, assistencia: true, razao_social: "MF MÁQUINAS LTDA", cnpj: "46942855000213", inscricao_estadual: "797123456110",
      logradouro: "Av. Dom Pedro I", numero: "2450", bairro: "Distrito Industrial", municipio: "Ribeirão Preto", uf: "SP", cep: "14079000", telefone: "(16) 3333-0000", whatsapp: "16999990000", email: "filial@mfmaquinas.com.br", instrucoes_pagamento: "Pix (CNPJ): 12.345.678/0002-71\nItaú · Ag. 0987 · C/C 12345-6", icms_aliquota_interna: 18, ...fiscal },
  ];
  db.icms_uf = [];
  const naFilial = new Set(["pd2", "pd4", "os2", "os4", "op2", "pco2", "e2", "e3", "e5", "e6", "cp2"]);
  for (const t of ["pedidos", "ordens_servico", "contas_receber", "contas_pagar", "notas_fiscais", "nfe_recebidas", "ordens_producao", "pedidos_compra", "equipamentos"]) {
    for (const r of db[t] ?? []) r.unidade_id = naFilial.has(r.id) || naFilial.has(r.pedido_id) || naFilial.has(r.os_id) ? U_SP : U_SC;
  }
  // estoque: 60% na matriz, o resto na filial
  db.estoque_unidade = db.produtos.flatMap((p) => {
    const sc = Math.ceil(Number(p.estoque_atual) * 0.6), sp = Number(p.estoque_atual) - sc;
    return [{ produto_id: p.id, unidade_id: U_SC, quantidade: sc }, ...(sp ? [{ produto_id: p.id, unidade_id: U_SP, quantidade: sp }] : [])];
  });
  db.estoque_movimentos.forEach((m) => { m.unidade_id = U_SC; });
  db.transferencias = [
    { id: "tr1", numero: 1, origem_id: U_SC, destino_id: U_SP, status: "recebida", observacoes: null, enviada_em: quando(-9), recebida_em: quando(-7), created_at: quando(-10) },
    { id: "tr2", numero: 2, origem_id: U_SC, destino_id: U_SP, status: "enviada", observacoes: "Reposição de peças da assistência", enviada_em: quando(-1), recebida_em: null, created_at: quando(-1) },
  ];
  db.transferencia_itens = [
    { id: "ti1", transferencia_id: "tr1", produto_id: "p1", descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", quantidade: 1, custo_unitario: 14800, numero_serie: "MF300-2026-0079" },
    { id: "ti2", transferencia_id: "tr2", produto_id: "p4", descricao: "Motor do batedor 1/2 CV", quantidade: 2, custo_unitario: 420 },
    { id: "ti3", transferencia_id: "tr2", produto_id: "p5", descricao: "Kit vedação do cilindro", quantidade: 10, custo_unitario: 38 },
  ];
  db.notas_fiscais.push({ id: "nft1", transferencia_id: "tr1", unidade_id: U_SC, referencia: "transf-1-1", status: "autorizada", numero: "1295", serie: "1", valor_total: 14800, mensagem: "Autorizado o uso da NF-e", created_at: quando(-9) });
  const vitrine: Record<string, string> = {
    p1: "Máquina profissional para sorveterias e redes: 3 bicos (2 sabores + mix), produção contínua, painel digital e cilindros em inox.",
    p2: "Compacta de balcão, ideal para lanchonetes, açaiterias e food trucks. Liga em 220 V e começa a servir em 10 minutos.",
    p3: "Milk shake cremoso em segundos: 2 hastes independentes, copo inox e base antiderrapante.",
    p5: "Kit completo de vedações para o cilindro das máquinas MF. Troque a cada 6 meses para evitar vazamentos.",
    p7: "Bico dosador em aço inox, encaixe universal das linhas MF.",
  };
  db.produtos.forEach((p) => {
    if (vitrine[p.id]) Object.assign(p, { no_catalogo: true, descricao_catalogo: vitrine[p.id], foto_caminho: p.id === "p7" ? null : `demo/${p.id}.jpg` });
  });
  db.avisos_tipos = TIPOS_PADRAO.map((t) => ({ ...t }));
  db.avisos = ([
    ["resumo_diario", "telegram", "u-fin", null, -0.1, "enviado"],
    ["resumo_diario", "telegram", "u-tec", null, -0.1, "enviado"],
    ["os_nova", "telegram", "u-tec", null, 0, "enviado", { ...EXEMPLOS.os_nova, numero: 53, cliente: "Juliana Rezende" }],
    ["cli_os_recebida", "email", null, "c3", 0, "enviado", { ...EXEMPLOS.cli_os_recebida, numero: 53, cliente: "Juliana Rezende" }],
    ["pagamento_recebido", "telegram", "u-fin", null, -3, "enviado"],
    ["cli_pagamento", "email", null, "c4", -3, "enviado", { ...EXEMPLOS.cli_pagamento, cliente: "Doce Gelo Sorvetes Eireli" }],
    ["cli_os_pronta", "email", null, "c4", -1, "enviado", { ...EXEMPLOS.cli_os_pronta, numero: 50, cliente: "Doce Gelo Sorvetes Eireli" }],
    ["cli_preventiva", "email", null, "c1", -0.1, "erro", { ...EXEMPLOS.cli_preventiva, cliente: "Sorveteria Gelato Nobre Ltda" }, "e-mail: caixa postal cheia (tentará de novo)"],
  ] as const).map(([tipo, canal, usuario, cliente, d, status, dados, erroMsg], i) => ({
    id: i + 1, tipo, canal, usuario_id: usuario, cliente_id: cliente, status, tentativas: status === "erro" ? 2 : 1, erro: erroMsg ?? null,
    destino: canal === "email" ? db.clientes.find((c) => c.id === cliente)?.email : String(5000 + USUARIOS_DEMO.findIndex((u) => u.user_id === usuario)),
    dados: dados ?? EXEMPLOS[tipo], created_at: quando(d), enviado_em: status === "enviado" ? quando(d) : null,
  })).reverse();
  // DANFE por e-mail ao cliente das notas de pedido (a evolução das NF mostra)
  for (const [nota, cli, d] of [["nf1", "c1", -33], ["nf2", "c4", -5]] as const) {
    db.avisos.push({ id: db.avisos.length + 1, tipo: "cli_nfe", canal: "email", cliente_id: cli, status: "enviado", tentativas: 1, erro: null, chave: `nfe:${nota}`,
      destino: db.clientes.find((c) => c.id === cli)?.email, dados: {}, created_at: quando(d), enviado_em: quando(d) });
  }
  // ERP Line: notificações, loja, caixa de e-mail
  db.usuarios_erp.forEach((u) => { u.preferencias = {}; u.notificacoes_vistas_em = quando(-1); });
  db.notificacoes = [
    { id: 1, tipo: "pagamento", titulo: "Pagamento recebido: R$ 14.500,00", texto: "Doce Gelo Sorvetes Eireli · Pedido #102 - parcela 1/2", link: "/financeiro", papeis: ["financeiro", "vendas"], created_at: quando(-3) },
    { id: 2, tipo: "email", titulo: "Novo e-mail em Comercial", texto: "Juliana Rezende: Orçamento máquina expressa", link: "/email", papeis: ["vendas", "financeiro"], created_at: quando(-0.2) },
  ];
  db.loja_clientes = [];
  db.email_contas = [{ id: "ec1", nome: "Comercial", email: "comercial@mfmaquinas.com.br", imap_host: "imap.hostinger.com", imap_porta: 993, smtp_host: "smtp.hostinger.com", smtp_porta: 465, usuario: "comercial@mfmaquinas.com.br", unidade_id: null, papeis: ["vendas", "financeiro"], ativo: true, sincronizado_em: quando(-0.01), erro: null }];
  const xmlNfe = { indice: 0, nome: "NFe35261011222333000181550010000124001000000017.xml", tipo: "application/xml", tamanho: 9200, nfe: true };
  db.emails = [
    { id: "em1", conta_id: "ec1", uid: 101, de_nome: "Juliana Rezende", de_email: "ju.rezende@gmail.com", para: "comercial@mfmaquinas.com.br", assunto: "Orçamento máquina expressa", data: quando(-0.2),
      previa: "Oi! Vi a MF-150 no site e queria saber o prazo de entrega para Uberlândia e se dá para parcelar.", texto: "Oi! Vi a MF-150 no site e queria saber o prazo de entrega para Uberlândia e se dá para parcelar em 3x no boleto.\n\nObrigada,\nJuliana", html: null, anexos: [], lido: false, arquivado: false, cliente_id: "c3", fornecedor_id: null, respondido_em: null },
    { id: "em2", conta_id: "ec1", uid: 100, de_nome: "Refrigeração Andrade", de_email: "vendas@refriandrade.com.br", para: "comercial@mfmaquinas.com.br", assunto: "NF-e 12400 - compressores", data: quando(-1.1),
      previa: "Segue em anexo o XML e a DANFE da nota 12400 referente ao pedido de compressores.", texto: "Bom dia,\n\nSegue em anexo o XML e a DANFE da nota 12400 referente ao pedido de compressores.\n\nAtt,\nRefrigeração Andrade", html: null,
      anexos: [xmlNfe, { indice: 1, nome: "DANFE-12400.pdf", tipo: "application/pdf", tamanho: 84000, nfe: false }], lido: false, arquivado: false, cliente_id: null, fornecedor_id: "f1", respondido_em: null },
    { id: "em3", conta_id: "ec1", uid: 99, de_nome: "Sorveteria Gelato Nobre", de_email: "compras@gelatonobre.com.br", para: "comercial@mfmaquinas.com.br", assunto: "Re: Preventiva da MF-300", data: quando(-2.3),
      previa: "Pode ser na próxima terça de manhã. Obrigado pelo lembrete!", texto: "Pode ser na próxima terça de manhã. Obrigado pelo lembrete!", html: "<p>Pode ser na <b>próxima terça</b> de manhã.</p><p>Obrigado pelo lembrete!</p>", anexos: [], lido: true, arquivado: false, cliente_id: "c1", fornecedor_id: null, respondido_em: quando(-2.2) },
  ];
  historicoDemo(db);
  for (const t of ["pedidos", "ordens_servico", "contas_receber", "contas_pagar", "notas_fiscais", "nfe_recebidas", "ordens_producao", "pedidos_compra", "equipamentos"]) {
    for (const r of db[t] ?? []) r.unidade_id ??= U_SC;
  }
  recalcular(db);
  comercialDemo(db);
  bancosDemo(db);
  planoDemo(db);
  fretesDemo(db);
  return db;
}

/** Formas de pagamento, embalagens e envios em todas as situações do painel de fretes. */
function fretesDemo(db: Db) {
  const fp = (id: string, nome: string, meio: string, uso: string, parcelas: number, primeiro: number, ordem: number, taxa = 0, tarifa = 0) =>
    ({ id, nome, meio, uso, parcelas, intervalo_dias: 30, primeiro_em_dias: primeiro, taxa_percentual: taxa, tarifa_fixa: tarifa, conta_bancaria_id: null, ativo: true, ordem, observacoes: null, created_at: quando(-30) });
  db.formas_pagamento = [
    fp("fp1", "Pix à vista", "pix", "ambos", 1, 0, 10), fp("fp2", "Boleto à vista", "boleto", "ambos", 1, 3, 20, 0, 2.5), fp("fp3", "Boleto 30 dias", "boleto", "ambos", 1, 30, 21, 0, 2.5),
    fp("fp4", "Boleto 30/60/90", "boleto", "ambos", 3, 30, 22, 0, 2.5), fp("fp5", "Cartão de crédito à vista", "cartao", "receber", 1, 30, 30, 3.2),
    fp("fp6", "Cartão de crédito parcelado (até 12x)", "cartao", "receber", 10, 30, 31, 4.9), fp("fp7", "Cartão de débito", "cartao", "receber", 1, 1, 32, 1.5),
    fp("fp8", "Transferência (TED)", "transferencia", "ambos", 1, 0, 40), fp("fp9", "Dinheiro", "dinheiro", "ambos", 1, 0, 50),
    fp("fp10", "Débito automático", "debito_automatico", "pagar", 1, 0, 60), fp("fp11", "Cheque", "cheque", "ambos", 1, 0, 70),
  ];
  db.embalagens = [
    { id: "em1", descricao: "Engradado MF-300", tipo: "engradado", largura_cm: 80, altura_cm: 150, comprimento_cm: 70, peso_kg: 30, ativo: true, observacoes: "Máquina de piso, sempre em pé", created_at: quando(-30) },
    { id: "em2", descricao: "Caixa MF-150 Balcão", tipo: "caixa", largura_cm: 60, altura_cm: 90, comprimento_cm: 75, peso_kg: 12, ativo: true, observacoes: null, created_at: quando(-30) },
    { id: "em3", descricao: "Fardo Franquia", tipo: "fardo", largura_cm: 27, altura_cm: 17, comprimento_cm: 46, peso_kg: 11, ativo: true, observacoes: null, created_at: quando(-30) },
    { id: "em4", descricao: "Caixa de peças P", tipo: "caixa", largura_cm: 30, altura_cm: 20, comprimento_cm: 40, peso_kg: 1, ativo: true, observacoes: null, created_at: quando(-30) },
  ];
  const p1 = db.produtos.find((p) => p.id === "p1"); if (p1) Object.assign(p1, { embalagem_id: "em1", peso_kg: p1.peso_kg ?? 165 });
  const p2 = db.produtos.find((p) => p.id === "p2"); if (p2) Object.assign(p2, { embalagem_id: "em2", peso_kg: p2.peso_kg ?? 78 });
  const ped = (id: string) => db.pedidos.find((p) => p.id === id);
  const cli = (id: string) => db.clientes.find((c) => c.id === id) ?? {};
  const envio = (id: string, numero: number, x: Row): Row => {
    const p = x.pedido_id ? ped(x.pedido_id) : null;
    const c: Row = p ? cli(p.cliente_id) : {};
    return calcularEnvioDemo({
      id, numero, pedido_id: null, os_id: null, cliente_id: p?.cliente_id ?? null, unidade_id: U_SC, vendedor_id: p?.vendedor_id ?? null,
      cep_origem: "88117010", cidade_origem: "São José", uf_origem: "SC", cep_destino: c.cep ?? null, cidade_destino: c.municipio ?? null, uf_destino: c.uf ?? null,
      endereco_destino: c.logradouro ? `${c.logradouro}, ${c.numero ?? ""}` : null, valor_mercadoria: p?.valor_total ?? 0, seguro: true, tipo_equipamento: null, restricoes: [], restricoes_obs: null,
      prazo_desejado: null, modalidade: "cif", pagador: "empresa", centro_custo_id: null, transportadora_id: null, transportadora_nome: null, prazo_dias: null, valor_aprovado: null,
      aprovado_em: null, aprovado_por: null, coleta_prevista: null, coletado_em: null, codigo_rastreio: null, entrega_prevista: null, entregue_em: null, comprovante_em: null,
      valor_final: null, cte_numero: null, observacoes: null, created_at: quando(-5), ...x,
    });
  };
  const maq300 = { embalagem_id: "em1", descricao: "Engradado MF-300 · Máquina de Sorvete Soft MF-300", quantidade: 1, largura_cm: 80, altura_cm: 150, comprimento_cm: 70, peso_kg: 165 };
  const maq150 = { embalagem_id: "em2", descricao: "Caixa MF-150 Balcão · Máquina MF-150", quantidade: 2, largura_cm: 60, altura_cm: 90, comprimento_cm: 75, peso_kg: 78 };
  const pecas = { embalagem_id: "em4", descricao: "Caixa de peças P", quantidade: 1, largura_cm: 30, altura_cm: 20, comprimento_cm: 40, peso_kg: 4 };
  db.envios = [
    envio("ev1", 1, { pedido_id: "pd1", status: "entregue", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe", "empilhadeira"], transportadora_id: "t1",
      prazo_dias: 4, valor_aprovado: 690, aprovado_em: quando(-30), coletado_em: dias(-28), codigo_rastreio: "RDN-558120", entrega_prevista: dias(-24), entregue_em: dias(-24), valor_final: 780, cte_numero: "CT-e 4471", created_at: quando(-31) }),
    envio("ev2", 2, { pedido_id: "pd2", status: "entregue", volumes: [maq150], tipo_equipamento: "Máquina de Sorvete Expressa MF-150 Balcão", restricoes: ["manter_em_pe"], modalidade: "fob", pagador: "cliente", transportadora_id: "t2",
      prazo_dias: 5, valor_aprovado: 845, aprovado_em: quando(-6), coletado_em: dias(-5), codigo_rastreio: "BRP-90311", entrega_prevista: dias(-1), entregue_em: dias(-1), comprovante_em: dias(-1), valor_final: 845, created_at: quando(-6) }),
    envio("ev3", 3, { status: "cotacao", volumes: [pecas], tipo_equipamento: "Peças e acessórios", cep_destino: "01310100", cidade_destino: "São Paulo", uf_destino: "SP", valor_mercadoria: 1250, centro_custo_id: "cc3",
      observacoes: "Peças para o técnico de SP (OS de garantia)", created_at: quando(-1) }),
    envio("ev4", 4, { status: "aprovacao", volumes: [{ ...maq300, peso_kg: 165 }], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe", "sem_doca", "agendar"], cep_destino: "90010000", cidade_destino: "Porto Alegre", uf_destino: "RS",
      valor_mercadoria: 23900, prazo_desejado: dias(8), created_at: quando(-2) }),
    envio("ev5", 5, { status: "coleta", volumes: [maq150], tipo_equipamento: "Máquina de Sorvete Expressa MF-150 Balcão", cep_destino: "80010000", cidade_destino: "Curitiba", uf_destino: "PR", valor_mercadoria: 29000,
      transportadora_id: "t2", prazo_dias: 3, valor_aprovado: 520, aprovado_em: quando(-4), coleta_prevista: dias(-1), created_at: quando(-5) }),
    envio("ev6", 6, { status: "transito", volumes: [pecas, { ...pecas, descricao: "Fardo Franquia", embalagem_id: "em3", largura_cm: 27, altura_cm: 17, comprimento_cm: 46, peso_kg: 11, quantidade: 3 }], tipo_equipamento: "Peças e acessórios",
      cep_destino: "38400000", cidade_destino: "Uberlândia", uf_destino: "MG", valor_mercadoria: 3400, transportadora_id: "t3", prazo_dias: 2, valor_aprovado: 210, aprovado_em: quando(-3), coletado_em: dias(-2), entrega_prevista: dias(0), created_at: quando(-3) }),
    envio("ev7", 7, { status: "transito", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe"], cep_destino: "74000000", cidade_destino: "Goiânia", uf_destino: "GO", valor_mercadoria: 23900,
      transportadora_id: "t1", prazo_dias: 4, valor_aprovado: 980, aprovado_em: quando(-9), coletado_em: dias(-8), codigo_rastreio: "RDN-559004", entrega_prevista: dias(-2), prazo_desejado: dias(-1), created_at: quando(-10) }),
  ];
  db.envio_cotacoes = [
    { id: "ec1", envio_id: "ev4", transportadora_id: "t1", transportadora_nome: null, valor: 1180, prazo_dias: 5, validade: dias(3), observacoes: "veículo com plataforma", escolhida: false, ativa: true, created_at: quando(-1) },
    { id: "ec2", envio_id: "ev4", transportadora_id: "t2", transportadora_nome: null, valor: 1320, prazo_dias: 4, validade: dias(2), observacoes: "seguro incluso", escolhida: false, ativa: true, created_at: quando(-1) },
    { id: "ec3", envio_id: "ev5", transportadora_id: "t2", transportadora_nome: null, valor: 520, prazo_dias: 3, validade: null, observacoes: null, escolhida: true, ativa: true, created_at: quando(-4) },
  ];
  // um recibo de exemplo (conta recebida)
  const paga = db.contas_receber.find((c) => c.status === "pago" && c.cliente_id);
  const cliPaga = paga ? db.clientes.find((c) => c.id === paga.cliente_id) : null;
  db.recibos = paga ? [{
    id: "rc1", numero: 1, tipo: "recebimento", unidade_id: U_SC, conta_receber_id: paga.id, conta_pagar_id: null,
    pagador_nome: cliPaga?.nome ?? "Cliente", pagador_doc: cliPaga?.cpf_cnpj ?? null, recebedor_nome: "MF MAQUINAS LTDA", recebedor_doc: "46942855000132",
    valor: Number(paga.valor_pago ?? paga.valor), referente: paga.descricao, forma_pagamento: "Boleto", data_pagamento: paga.data_pagamento ?? dias(-3), cidade: "São José/SC",
    observacoes: null, cancelado_em: null, cancelado_motivo: null, created_at: quando(-3),
  }] : [];
  db.envio_ocorrencias = [
    { id: "eo1", envio_id: "ev7", tipo: "atraso", descricao: "Carga parada no centro de distribuição de Goiânia", responsavel: null, andamento: null, status: "aberta", resolvida_em: null, created_at: quando(-4), atualizado_em: quando(-4) },
    { id: "eo2", envio_id: "ev1", tipo: "cobranca", descricao: "CT-e veio R$ 90 acima da cotação (taxa de descarga)", responsavel: "Rafael", andamento: "Pedimos o abatimento à Rodonaves", status: "aberta", resolvida_em: null, created_at: quando(-20), atualizado_em: quando(-1) },
  ];
}

/** Totais da carga e status pelo andamento (no sistema real: gatilho do banco). */
function calcularEnvioDemo(e: Row): Row {
  let qtd = 0, peso = 0, m3 = 0;
  for (const v of e.volumes ?? []) {
    const q = Number(v.quantidade) || 0;
    qtd += q; peso += q * (Number(v.peso_kg) || 0);
    m3 += q * (Number(v.largura_cm) || 0) * (Number(v.altura_cm) || 0) * (Number(v.comprimento_cm) || 0) / 1e6;
  }
  Object.assign(e, { qtd_volumes: qtd, peso_total_kg: r2(peso), cubagem_m3: Math.round(m3 * 1e4) / 1e4, atualizado_em: new Date().toISOString() });
  e.status ??= "cotacao";
  e.restricoes ??= [];
  if (e.status !== "cancelado") {
    if (e.entregue_em) e.status = "entregue";
    else if (e.coletado_em && ["cotacao", "aprovacao", "coleta"].includes(e.status)) e.status = "transito";
  }
  if (e.coletado_em && !e.entrega_prevista && e.prazo_dias != null) {
    const d = new Date(e.coletado_em + "T12:00:00"); let n = 0;
    while (n < e.prazo_dias) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
    e.entrega_prevista = d.toISOString().slice(0, 10);
  }
  return e;
}

/** Plano de contas, centros de custo e contas fixas de exemplo. */
function planoDemo(db: Db) {
  const cat = (nome: string, tipo: string, grupo: string, ordem: number) => ({ id: `cat-${nome}`, nome, tipo, grupo, ordem, ativo: true, created_at: quando(-60) });
  db.categorias_financeiras = [
    cat("vendas", "receita", "receita", 10), cat("assistência técnica", "receita", "receita", 20), cat("receitas financeiras", "receita", "receita_financeira", 80),
    cat("outras receitas", "receita", "outros", 90), cat("impostos", "despesa", "deducao", 10), cat("fornecedores", "despesa", "custo", 20), cat("frete", "despesa", "custo", 30),
    cat("comissoes", "despesa", "despesa_operacional", 40), cat("folha", "despesa", "despesa_operacional", 41), cat("pró-labore", "despesa", "despesa_operacional", 42),
    cat("aluguel", "despesa", "despesa_operacional", 43), cat("energia/água/internet", "despesa", "despesa_operacional", 44), cat("marketing", "despesa", "despesa_operacional", 45),
    cat("manutenção", "despesa", "despesa_operacional", 46), cat("sistemas e assinaturas", "despesa", "despesa_operacional", 47), cat("tarifas bancárias", "despesa", "despesa_financeira", 60),
    cat("juros e multas", "despesa", "despesa_financeira", 61), cat("outros", "despesa", "outros", 90), cat("investimentos", "despesa", "investimento", 95),
    cat("distribuição de lucros", "despesa", "retirada", 96),
  ];
  db.centros_custo = [
    { id: "cc1", nome: "Fábrica", descricao: "Produção das máquinas", ativo: true, created_at: quando(-60) },
    { id: "cc2", nome: "Loja e vendas", descricao: null, ativo: true, created_at: quando(-60) },
    { id: "cc3", nome: "Assistência técnica", descricao: null, ativo: true, created_at: quando(-60) },
  ];
  for (const c of db.contas_receber) c.categoria ??= c.os_id ? "assistência técnica" : "vendas";
  for (const c of db.contas_pagar) c.rateio ??= c.categoria === "fornecedores" ? [{ centro_custo_id: "cc1", percentual: 100 }] : c.categoria === "aluguel" ? [{ centro_custo_id: "cc1", percentual: 70 }, { centro_custo_id: "cc2", percentual: 30 }] : [];
  db.contas_recorrentes = [
    { id: "rec1", tipo: "pagar", descricao: "Internet e telefone", fornecedor_id: null, cliente_id: null, categoria: "energia/água/internet", rateio: [], valor: 389.9, dia_vencimento: 15,
      frequencia: "mensal", inicio: dias(-1), fim: null, antecedencia_dias: 45, unidade_id: U_SC, forma_pagamento: null, observacoes: null, ativo: true, created_at: quando(-1) },
    { id: "rec2", tipo: "receber", descricao: "Contrato de manutenção - Gelato Nobre", fornecedor_id: null, cliente_id: "c1", categoria: "assistência técnica", rateio: [{ centro_custo_id: "cc3", percentual: 100 }],
      valor: 450, dia_vencimento: 28, frequencia: "trimestral", inicio: dias(-1), fim: null, antecedencia_dias: 60, unidade_id: U_SC, forma_pagamento: "boleto", observacoes: null, ativo: true, created_at: quando(-1) },
  ];
  gerarRecorrentesDemo(db);
  // Régua de cobrança, Pix das unidades e página do cliente
  const etapa = (id: string, evento: string, dias: number, nome: string, canal_email: boolean, canal_whatsapp: boolean, ativo: boolean, ordem: number, assunto: string, mensagem: string) =>
    ({ id, evento, dias, nome, canal_email, canal_whatsapp, ativo, ordem, assunto, mensagem, created_at: quando(-30) });
  db.regua_cobranca = [
    etapa("rg1", "criacao", 0, "Na criação da cobrança", false, false, false, 1, "Cobrança: {descricao}", "Olá, {cliente}! Segue a cobrança de *{descricao}*, no valor de *{valor}*, com vencimento em *{vencimento}*.\n\n{pagamento}\n\nSuas contas e a segunda via: {link}"),
    etapa("rg2", "vencimento", -3, "3 dias antes", true, false, true, 2, "Lembrete: pagamento vence em {vencimento}", "Olá, {cliente}! Passando para lembrar que *{descricao}* ({valor}) vence em *{vencimento}*. Se já pagou, pode desconsiderar.\n\n{pagamento}\n\nSuas contas e a segunda via: {link}"),
    etapa("rg3", "vencimento", 0, "No vencimento", false, true, true, 3, "Vence hoje: {descricao}", "Olá, {cliente}! Hoje vence *{descricao}*, no valor de *{valor}*.\n\n{pagamento}\n\nSe já pagou, pode desconsiderar. Qualquer dúvida, é só responder aqui."),
    etapa("rg4", "vencimento", 5, "5 dias depois", true, true, true, 4, "Pagamento em aberto desde {vencimento}", "Olá, {cliente}! Não identificamos o pagamento de *{descricao}* ({valor}), que venceu em {vencimento}. Se já pagou, desconsidere. Se precisar de outra data, é só responder.\n\n{pagamento}\n\nSuas contas e a segunda via: {link}"),
    etapa("rg5", "pagamento", 0, "No pagamento", true, false, true, 5, "Pagamento recebido · obrigado!", "Olá, {cliente}! Recebemos o pagamento de *{descricao}* ({valor}). Muito obrigado pela confiança!"),
  ];
  db.cobranca_envios = [];
  for (const u of db.unidades) if (u.codigo === "SC") Object.assign(u, { pix_chave: "46.942.855/0001-32", pix_nome: "MF MAQUINAS LTDA", pix_cidade: "Sao Jose" });
  db.clientes.forEach((c, i) => { c.portal_token ??= `demo-portal-${i + 1}`; });
  // categorias dos produtos (como no Tiny)
  const cats = ["As Máquinas My Frost", "Chave Extratora - Portelo", "Peças de Reposição", "Peças Eletrica - My Frost", "Peças Mecânica - My Frost",
    "Peças Refrigeração - My Frost", "Vedantes/ Orings My Frost", "As Extrutura Máquinas", "As Extrutura Máquinas > Cilindros", "Batedor de Milk"];
  db.produtos.forEach((p) => { p.categoria ??= p.tipo === "maquina" ? "As Máquinas My Frost" : /veda|o-?ring|borracha/i.test(p.descricao) ? "Vedantes/ Orings My Frost" : "Peças de Reposição"; });
  db.categorias_produto = [...new Set([...cats, ...db.produtos.map((p) => p.categoria).filter(Boolean)])].map((nome, i) => ({ id: `cat${i + 1}`, nome, ativo: true }));
  // cadastro para arrumar: etiquetas da Receita, um repetido, um fornecedor na lista e celular no campo telefone
  Object.assign(db.clientes[3], { tags: ["ie_baixada", "endereco_receita"], receita_situacao: "ATIVA", ie_situacao: "baixada", receita_em: quando(-2),
    receita: { nome: "Doce Gelo Sorvetes Eireli", fantasia: "Doce Gelo", situacao: "ATIVA", email: null, telefones: [], fonte: "CNPJ.ws", inscricoes: [{ numero: "0012345670012", uf: "GO", ativa: false }],
      endereco: { cep: "74115050", logradouro: "Rua 9", numero: "1200", complemento: "Sala 4", bairro: "Setor Oeste", municipio: "Goiânia", uf: "GO" } } });
  Object.assign(db.clientes[4], { tags: ["cnpj_irregular"], receita_situacao: "BAIXADA", receita_em: quando(-1) });
  db.clientes.push(
    { ...db.clientes[2], id: "c6", codigo: 6, cpf_cnpj: null, email: null, whatsapp: null, telefone: "34999112233", portal_token: "demo-portal-6", tags: [], receita: null },
    { id: "c7", codigo: 7, tipo_pessoa: "PJ", nome: "Refrigeração Andrade Ltda", cpf_cnpj: "11222333000181", contribuinte_icms: 1, telefone: "1132221100", municipio: "São Paulo", uf: "SP", avisos_email: true, portal_token: "demo-portal-7", tags: [] } as any,
    { id: "c8", codigo: 8, tipo_pessoa: "PF", nome: "Marileia Prestes", cpf_cnpj: "98765432100", contribuinte_icms: 9, telefone: "5599864949", municipio: "Campina das Missões", uf: "RS", avisos_email: true, portal_token: "demo-portal-8", tags: [] } as any,
  );
  db.configuracoes[0].site_url ??= null;
  // uma conta que vence hoje, para a fila do WhatsApp
  db.contas_receber.push({ id: "r9", descricao: "Pedido #104 - parcela 1/1", cliente_id: "c2", parcela: 1, total_parcelas: 1, valor: 1890, vencimento: dias(0), status: "aberto",
    forma_pagamento: "pix", unidade_id: U_SC, categoria: "vendas", rateio: [], created_at: quando(-20) });
}

const FREQ_MESES: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
function gerarRecorrentesDemo(base: Db, id?: string) {
  let n = 0;
  const pad = (x: number) => String(x).padStart(2, "0");
  for (const r of (base.contas_recorrentes ?? []).filter((x) => x.ativo && (!id || x.id === id))) {
    const passo = FREQ_MESES[r.frequencia] ?? 1;
    const limite = [r.fim ?? "9999-12-31", dias(Number(r.antecedencia_dias ?? 45))].sort()[0];
    const desde = [r.inicio, String(r.created_at).slice(0, 10)].sort()[1];
    let y = Number(r.inicio.slice(0, 4)), m = Number(r.inicio.slice(5, 7));
    for (let k = 0; k < 400; k++) {
      const comp = `${y}-${pad(m)}-01`;
      if (comp > limite) break;
      const venc = `${y}-${pad(m)}-${pad(Math.min(Number(r.dia_vencimento), new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
      const tab = r.tipo === "pagar" ? "contas_pagar" : "contas_receber";
      if (venc >= desde && venc <= limite && !base[tab].some((c) => c.recorrente_id === r.id && c.competencia === comp)) {
        base[tab].push({ id: uid(), descricao: `${r.descricao} · ${pad(m)}/${y}`, fornecedor_id: r.fornecedor_id ?? null, cliente_id: r.cliente_id ?? null,
          categoria: r.categoria ?? (r.tipo === "pagar" ? "outros" : "outras receitas"), rateio: r.rateio ?? [], valor: Number(r.valor), vencimento: venc, status: "aberto",
          unidade_id: r.unidade_id ?? U_SC, recorrente_id: r.id, competencia: comp, ...(r.tipo === "receber" ? { forma_pagamento: r.forma_pagamento ?? "boleto", parcela: 1, total_parcelas: 1 } : {}),
          observacoes: r.tipo === "pagar" ? "Conta fixa lançada pelo ERP" : undefined, created_at: new Date().toISOString() });
        n++;
      }
      m += passo; while (m > 12) { m -= 12; y++; }
    }
  }
  return n;
}
/** Conta fixa alterada: próximas em aberto acompanham; desativada ou encerrada cancela as próximas. */
function aplicarRecorrenteDemo(r: Row) {
  const tab = r.tipo === "pagar" ? "contas_pagar" : "contas_receber";
  for (const c of db[tab].filter((x) => x.recorrente_id === r.id && x.status === "aberto" && x.vencimento >= hojeISO())) {
    if (!r.ativo || (r.fim && c.vencimento > r.fim)) { c.status = "cancelado"; continue; }
    const ult = new Date(Date.UTC(Number(c.competencia.slice(0, 4)), Number(c.competencia.slice(5, 7)), 0)).getUTCDate();
    Object.assign(c, { valor: Number(r.valor), categoria: r.categoria ?? c.categoria, rateio: r.rateio ?? [], vencimento: `${c.competencia.slice(0, 8)}${String(Math.min(Number(r.dia_vencimento), ult)).padStart(2, "0")}` });
  }
  gerarRecorrentesDemo(db, r.id);
}

/** Contas bancárias (Unicred, Nubank, InfinitePay), extrato, histórico e exceções de exemplo. */
function bancosDemo(db: Db) {
  const inicio = dias(-45);
  db.contas_bancarias = [
    { id: "cb1", unidade_id: U_SC, nome: "Unicred SC", banco: "unicred", agencia: "0101", numero: "12345-6", tipo: "corrente", saldo_inicial: 48250, saldo_inicial_data: inicio, ativo: true, created_at: quando(-45) },
    { id: "cb2", unidade_id: U_SC, nome: "Nubank SC", banco: "nubank", agencia: "0001", numero: "998877-1", tipo: "corrente", saldo_inicial: 6200, saldo_inicial_data: inicio, ativo: true, created_at: quando(-45) },
    { id: "cb3", unidade_id: U_SC, nome: "InfinitePay SC", banco: "infinitepay", agencia: null, numero: null, tipo: "pagamentos", saldo_inicial: 0, saldo_inicial_data: inicio, ativo: true, created_at: quando(-45) },
    { id: "cb4", unidade_id: U_SP, nome: "Unicred SP", banco: "unicred", agencia: "0207", numero: "54321-0", tipo: "corrente", saldo_inicial: 15400, saldo_inicial_data: inicio, ativo: true, created_at: quando(-45) },
  ];
  // exceções de exemplo: boleto lançado duas vezes e um pagamento redondo sem documento
  db.contas_pagar.push(
    { id: "cp6", descricao: "NF 48733 - Refrigeração Andrade (compressores)", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48733", valor: 2700, vencimento: dias(10), status: "aberto", unidade_id: U_SC, created_at: quando(-4) },
    { id: "cp7", descricao: "Boleto Refrigeração Andrade - compressores", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48733", valor: 2700, vencimento: dias(12), status: "aberto", unidade_id: U_SC, created_at: quando(-2) },
    { id: "cp8", descricao: "Adiantamento a fornecedor", categoria: "outros", valor: 10000, vencimento: dias(-20), status: "pago", data_pagamento: dias(-20), valor_pago: 10000, unidade_id: U_SC, created_at: quando(-21) },
  );
  db.extrato_lancamentos = [];
  const nomeCli = (id: string | null) => (db.clientes.find((c) => c.id === id)?.nome ?? "").toUpperCase();
  const add = (conta: string, data: string, valor: number, descricao: string, extra: Row = {}) => db.extrato_lancamentos.push({
    id: uid(), conta_bancaria_id: conta, importacao_id: null, data, valor: r2(valor), descricao, documento: null, identificador: uid(), status: "pendente",
    conta_receber_id: null, conta_pagar_id: null, baixou_conta: false, par_transferencia_id: null, observacao: null, conciliado_em: null, created_at: quando(-1), ...extra,
  });
  for (const c of db.contas_receber.filter((c) => c.status === "pago" && c.data_pagamento >= inicio && c.unidade_id === U_SC)) {
    c.conta_bancaria_id = "cb1";
    add("cb1", c.data_pagamento, Number(c.valor_pago ?? c.valor), `PIX RECEBIDO ${nomeCli(c.cliente_id)}`.trim(), { status: "conciliado", conta_receber_id: c.id, conciliado_em: quando(-1) });
  }
  db.contas_pagar.filter((c) => c.status === "pago" && c.data_pagamento >= inicio && c.unidade_id === U_SC).forEach((c, i) => {
    if (i === 0) return; // esta baixa fica sem conta bancária: aparece em "Baixa sem conferência no extrato"
    c.conta_bancaria_id = "cb1";
    add("cb1", c.data_pagamento, -Number(c.valor_pago ?? c.valor), `PAGTO ${c.descricao.toUpperCase()}`, { status: "conciliado", conta_pagar_id: c.id, conciliado_em: quando(-1) });
  });
  add("cb1", dias(-9), -39.9, "TARIFA PACOTE DE SERVICOS");
  add("cb1", dias(-1), 7909.33, "PIX RECEBIDO SORVETERIA GELATO NOBRE LTDA");
  add("cb1", dias(-3), -5000, "TED MESMA TITULARIDADE - NU PAGAMENTOS");
  add("cb2", dias(-3), 5000, "Transferência recebida - MF MAQUINAS LTDA");
  add("cb2", dias(-6), -189, "Pagamento de boleto - Google Ads");
  add("cb3", dias(-4), 3690, "Venda no crédito · Cliente balcão (Lanchonete)");
  add("cb3", dias(-4), -110.7, "Taxa · Taxa da venda no crédito");
  const ultima = (c: string) => db.extrato_lancamentos.filter((l) => l.conta_bancaria_id === c).map((l) => l.data).sort().pop();
  const saldo = (c: string) => r2(Number(db.contas_bancarias.find((b) => b.id === c)!.saldo_inicial) + db.extrato_lancamentos.filter((l) => l.conta_bancaria_id === c).reduce((s, l) => s + Number(l.valor), 0));
  db.extrato_importacoes = ["cb1", "cb2", "cb3"].map((c, i) => ({
    id: `imp${i + 1}`, conta_bancaria_id: c, arquivo: c === "cb3" ? "extrato-infinitepay.csv" : c === "cb2" ? "NU_998877_extrato.ofx" : "EXTRATO_UNICRED.ofx",
    formato: c === "cb3" ? "csv" : "ofx", periodo_inicio: inicio, periodo_fim: ultima(c), linhas_novas: db.extrato_lancamentos.filter((l) => l.conta_bancaria_id === c).length,
    linhas_repetidas: 0, conciliadas_auto: 0, created_at: quando(-0.5),
    // Nubank: o banco informa R$ 150 a menos (falta importar um período), para mostrar o alerta
    saldo_final: c === "cb3" ? null : c === "cb2" ? saldo(c) - 150 : saldo(c), saldo_final_data: c === "cb3" ? null : ultima(c),
  }));
  db.auditoria = [];
  db.auditoria_excecoes = [];
  db.auditoria_checklist = [];
  db.contagens_estoque = [];
  db.contagem_itens = [];
  const aud = (tabela: string, registro: string, acao: string, usuario: string, antes: Row | null, depois: Row | null, motivo: string | null, quandoDias: number) => {
    const u = USUARIOS_DEMO.find((x) => x.user_id === usuario);
    db.auditoria.push({ id: db.auditoria.length + 1, tabela, registro_id: registro, acao, usuario, usuario_nome: u?.nome ?? null,
      campos: acao === "update" ? Object.keys(depois ?? {}) : null, antes, depois, motivo, origem: "usuario", created_at: quando(quandoDias) });
  };
  aud("contas_pagar", "cp8", "insert", "u-fin", null, db.contas_pagar.find((c) => c.id === "cp8")!, null, -21);
  aud("contas_pagar", "cp8", "update", "u-fin", { status: "aberto", data_pagamento: null, valor_pago: null }, { status: "pago", data_pagamento: dias(-20), valor_pago: 10000 }, null, -20);
  aud("contas_pagar", "cp3", "update", "u-admin", { valor: 6200 }, { valor: 6500 }, "Reajuste anual do contrato de aluguel", -8);
  aud("contas_receber", "r6", "update", "u-fin", { vencimento: dias(-6) }, { vencimento: dias(1) }, "Cliente pediu prorrogação pelo WhatsApp", -5);
  aud("clientes", "c2", "update", "u-vendas", { email: "contato@acaiecia.com.br" }, { email: "acaieciafranca@gmail.com" }, null, -3);
  aud("contas_pagar", "cp7", "insert", "u-fin", null, db.contas_pagar.find((c) => c.id === "cp7")!, null, -2);
}

/** Vendedores, comissões, kit, propostas e layout da proposta (prévia). */
function comercialDemo(db: Db) {
  Object.assign(db.configuracoes[0], {
    proposta_titulo: "Proposta comercial", proposta_cor: "#0EA5E9", proposta_fotos: true,
    proposta_apresentacao: "Obrigado pelo interesse na MF Máquinas. Preparamos esta proposta com as máquinas e condições conversadas. Qualquer dúvida, fale com a gente pelo WhatsApp.",
    proposta_condicoes: "Instalação e treinamento inclusos para máquinas. Entrega em até 10 dias úteis após a confirmação do pagamento. Frete conforme modalidade informada.",
    proposta_rodape: "MF Máquinas · máquinas de sorvete, peças e assistência técnica própria em SC e SP.",
  });
  db.vendedores = [
    { id: "v1", nome: "Carla", tipo: "vendedor", user_id: "u-vendas", percentual: 3, base: "recebimento", descontar_frete: true, whatsapp: "48999990001", email: "vendas@mfmaquinas.com.br", ativo: true, created_at: quando(-200) },
    { id: "v2", nome: "Marcos", tipo: "vendedor", user_id: null, percentual: 3, base: "recebimento", descontar_frete: true, ativo: true, created_at: quando(-200) },
    { id: "v3", nome: "Paulo (representante RS)", tipo: "representante", user_id: null, percentual: 5, base: "faturamento", descontar_frete: true, cpf_cnpj: "33444555000181", pix: "paulo@rep.com.br", ativo: true, created_at: quando(-90) },
  ];
  for (const p of db.pedidos) p.vendedor_id = db.vendedores.find((v) => v.nome === p.vendedor)?.id ?? null;
  db.comissoes = [];
  for (const c of db.contas_receber.filter((x) => x.status === "pago" && x.pedido_id)) {
    const p = db.pedidos.find((x) => x.id === c.pedido_id);
    const v = db.vendedores.find((x) => x.id === p?.vendedor_id);
    if (!p || !v) continue;
    const base = r2(Number(c.valor_pago ?? c.valor) * Math.max(p.valor_total - p.frete, 0) / (p.valor_total || 1));
    const antiga = c.data_pagamento < dias(-45);
    db.comissoes.push({ id: uid(), vendedor_id: v.id, pedido_id: p.id, conta_receber_id: c.id, descricao: c.descricao, base, percentual: v.percentual,
      valor: r2(base * v.percentual / 100), status: antiga ? "paga" : "a_pagar", conta_pagar_id: null, pago_em: antiga ? c.data_pagamento : null, created_at: c.data_pagamento + "T12:00:00" });
  }
  // Kit vendido como um produto só, com estoque baixado das peças
  db.produtos.push({ id: "pk1", sku: "KIT-BICO-3", descricao: "Kit reposição 3 sabores (bicos + vedação)", tipo: "peca", kit: true, unidade: "UN", ncm: "84189900", origem: 0,
    preco_custo: 0, preco_venda: 690, estoque_atual: 0, estoque_minimo: 0, ativo: true, vendavel: true, created_at: quando(-60) });
  db.kit_componentes = [
    { id: "kc1", kit_id: "pk1", componente_id: "p7", quantidade: 3, opcional: false, grupo: null, padrao: true },
    { id: "kc2", kit_id: "pk1", componente_id: "p5", quantidade: 1, opcional: false, grupo: null, padrao: true },
    { id: "kc3", kit_id: "pk1", componente_id: "p10", quantidade: 1, opcional: true, grupo: null, padrao: true },
  ];
  // Propostas: histórico para a análise e duas em andamento
  const motivos = ["preco", "concorrente", "prazo", "preco", "frete"];
  db.pedidos.filter((p) => p.id.startsWith("ph")).forEach((p, k) => {
    Object.assign(p, { proposta_token: uid(), proposta_status: "aprovada", proposta_enviada_em: p.created_at, proposta_visualizada_em: p.created_at, proposta_respondida_em: p.created_at, proposta_resposta_nome: "Cliente" });
    if (k < motivos.length) {
      const perdida = { ...structuredClone(p), id: `pp${k}`, numero: 60 + k, status: "orcamento", estoque_baixado: false, proposta_token: uid(), proposta_status: "rejeitada",
        motivo_rejeicao: motivos[k], concorrente: motivos[k] === "concorrente" ? "Sorvetec" : null, motivo_rejeicao_texto: motivos[k] === "preco" ? "Achei caro para o momento" : null };
      db.pedidos.push(perdida);
      db.pedido_itens.filter((i) => i.pedido_id === p.id).forEach((i, j) => db.pedido_itens.push({ ...i, id: `pp${k}-${j}`, pedido_id: perdida.id }));
    }
  });
  for (const p of db.pedidos) p.proposta_token ??= uid();
  Object.assign(db.pedidos.find((p) => p.id === "pd4")!, { proposta_status: "visualizada", proposta_enviada_em: quando(-2), proposta_visualizada_em: quando(-1.5), proposta_validade: dias(5) });
  db.documentos = [];
  Object.assign(db.configuracoes[0], { nfe_automatica: true, expedicao_apos: "nfe", custos_pagamento: { cartao_pct: 3.5, boleto_fixo: 3, pix_pct: 0, transferencia_pct: 0, dinheiro_pct: 0 } });
  // pd2 já faturado: está para despachar; pedidos entregues recentes aparecem no fim do fluxo
  db.expedicoes = [{ id: "ex2", pedido_id: "pd2", unidade_id: db.pedidos.find((p) => p.id === "pd2")!.unidade_id, status: "embalado", itens_conferidos: db.pedido_itens.filter((i) => i.pedido_id === "pd2").map((i) => i.id),
    volumes: 2, peso_kg: 160, transportadora_id: null, codigo_rastreio: null, separando_em: quando(-1), conferido_em: quando(-1), embalado_em: quando(-0.5), created_at: quando(-1) }];
  const pd1 = db.pedidos.find((p) => p.id === "pd1")!;
  db.expedicoes.push({ id: "ex1", pedido_id: "pd1", unidade_id: pd1.unidade_id, status: "entregue", itens_conferidos: [], volumes: 1, created_at: quando(-30), entregue_em: quando(-3), despachado_em: quando(-6) });
  // Contador: impostos destacados nas notas (como viriam da emissão), um fechamento já enviado e uma mensagem
  for (const n of db.notas_fiscais.filter((x) => x.status === "autorizada" && x.pedido_id)) {
    const p = db.pedidos.find((x) => x.id === n.pedido_id);
    const c = db.clientes.find((x) => x.id === p?.cliente_id);
    const inter = (c?.uf ?? "SC") !== "SC";
    n.payload = { natureza_operacao: "Venda de mercadoria", nome_destinatario: c?.nome, cnpj_destinatario: c?.cpf_cnpj, uf_destinatario: c?.uf ?? "SC", municipio_destinatario: c?.municipio,
      items: db.pedido_itens.filter((i) => i.pedido_id === n.pedido_id).map((i, k) => {
      const v = i.quantidade * i.valor_unitario, aliq = inter ? 12 : 17, icms = r2(v * aliq / 100);
      const prod = db.produtos.find((x) => x.id === i.produto_id);
      const maquina = prod?.tipo === "maquina";
      return { numero_item: k + 1, codigo_produto: prod?.sku ?? "", descricao: i.descricao, codigo_ncm: prod?.ncm ?? "84186990", unidade_comercial: prod?.unidade ?? "UN",
        quantidade_comercial: i.quantidade, valor_unitario_comercial: i.valor_unitario,
        cfop: `${inter ? 6 : 5}${maquina ? "101" : "102"}`, valor_bruto: v, icms_situacao_tributaria: "00", icms_base_calculo: v, icms_aliquota: aliq, icms_valor: icms,
        ipi_valor: maquina ? r2(v * 0.05) : 0, pis_valor: r2((v - icms) * 0.0165), cofins_valor: r2((v - icms) * 0.076) };
    }) };
  }
  Object.assign(db.configuracoes[0], { contador_nome: "Escritório Contábil Exemplo", contador_email: "contador@escritorio.com.br", contador_envio_auto: true, contador_envio_dia: 5 });
  const mesPassado = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  db.fechamentos = [{ id: "fc1", unidade_id: U_SC, competencia: mesPassado, status: "enviado", enviado_em: quando(-2), arquivo_caminho: "demo.zip", created_at: quando(-2) }];
  db.contador_mensagens = [
    { id: "cm1", unidade_id: U_SC, competencia: mesPassado, autor: "u-cont", autor_nome: "Escritório Contábil Exemplo", texto: "Recebi o pacote. Falta o comprovante do aluguel do galpão, pode anexar?", resolvida: false, created_at: quando(-1.5) },
  ];
  recalcular(db);
}

function checklistDemo(atencao: string[]) {
  return ["Cabo de energia e plugue", "Torneiras / bicos dosadores", "Bandeja de gotejamento", "Tampa do reservatório",
    "Painel e botões sem trincas", "Batedor / pás do cilindro", "Equipamento limpo (sem calda)", "Acessórios entregues junto"]
    .map((item) => ({ item, ok: !atencao.includes(item), obs: atencao.includes(item) ? "Trincado / faltando, cliente ciente" : "" }));
}

/** Vendas e despesas dos 5 meses anteriores, para os gráficos e o DRE terem o que mostrar. */
function historicoDemo(db: Db) {
  const vendas = [
    [["p1", 1, 23900], ["p5", 6, 95]], [["p2", 1, 14500]], [["p3", 2, 3690], ["p9", 3, 189]], [["p2", 2, 14200]],
    [["p1", 1, 23900]], [["p4", 2, 790], ["p6", 1, 1180]], [["p1", 2, 23200], ["p10", 6, 49]], [["p3", 1, 3690]], [["p2", 1, 14500], ["p7", 4, 140]],
  ] as [string, number, number][][];
  const clientes = ["c1", "c2", "c3", "c4", "c5"];
  let n = 80;
  vendas.forEach((itens, k) => {
    const diasAtras = 40 + Math.round((k / vendas.length) * 120) + (k % 3) * 4;
    const id = `ph${k}`;
    db.pedidos.push({
      id, numero: ++n, cliente_id: clientes[k % 5], origem: "whatsapp", status: "entregue", vendedor: k % 3 === 1 ? "Marcos" : "Carla",
      forma_pagamento: "boleto", parcelas: 1, intervalo_dias: 30, modalidade_frete: 9, desconto: 0, frete: 0, created_at: quando(-diasAtras), estoque_baixado: true,
    });
    let total = 0;
    itens.forEach(([prod, qtd, preco], j) => {
      const desc = db.produtos.find((p) => p.id === prod)!.descricao;
      db.pedido_itens.push({ id: `${id}-${j}`, pedido_id: id, produto_id: prod, descricao: desc, quantidade: qtd, valor_unitario: preco });
      total += qtd * preco;
    });
    db.contas_receber.push({ id: `rh${k}`, descricao: `Pedido #${n} - parcela 1/1`, cliente_id: clientes[k % 5], pedido_id: id, parcela: 1, total_parcelas: 1, valor: total, vencimento: dias(-diasAtras + 3), status: "pago", forma_pagamento: "boleto", data_pagamento: dias(-diasAtras + 3), valor_pago: total });
  });
  for (let m = 1; m <= 5; m++) {
    for (const [desc, cat, valor] of [["Aluguel do galpão", "aluguel", 6500], ["Folha de pagamento", "folha", 7800], ["Energia elétrica", "energia/água/internet", 1250 + m * 40], ["Marketing (Instagram)", "marketing", 900]] as [string, string, number][]) {
      const doc = cat === "aluguel" ? `Boleto aluguel ${m}` : cat === "folha" ? `Folha ${m}` : cat === "energia/água/internet" ? `Fatura Celesc ${m}` : null;
      db.contas_pagar.push({ id: `dh${m}-${cat}`, descricao: desc, categoria: cat, documento: doc, valor, vencimento: dias(-30 * m + 5), status: "pago", data_pagamento: dias(-30 * m + 5), valor_pago: valor });
    }
  }
  db.ordens_servico.push(
    { id: "osh1", numero: 44, cliente_id: "c1", equipamento_id: "e4", produto_id: "p1", equipamento: "Máquina de Sorvete Soft MF-300", numero_serie: "MF300-2025-0012", defeito_relatado: "Preventiva semestral", diagnostico: "Equipamento em bom estado", solucao: "Limpeza, lubrificação e troca da vedação", status: "entregue", em_garantia: true, tecnico: "Diego", valor_mao_obra: 0, data_entrada: dias(-190), concluida_em: quando(-189), created_at: quando(-190), estoque_baixado: true, checklist: checklistDemo([]), fotos: [] },
    { id: "osh2", numero: 47, cliente_id: "c3", equipamento_id: "e8", produto_id: "p2", equipamento: "Máquina de Sorvete Expressa MF-150", numero_serie: "MF150-2024-0099", defeito_relatado: "Compressor desarmando", diagnostico: "Capacitor de partida em curto", solucao: "Troca do capacitor e teste de 2 h", status: "entregue", em_garantia: false, tecnico: "Diego", valor_mao_obra: 350, data_entrada: dias(-75), concluida_em: quando(-72), created_at: quando(-75), estoque_baixado: true, checklist: checklistDemo([]), fotos: [] },
  );
}

// Totais calculados (no sistema real: triggers do Postgres)
function recalcular(db: Db) {
  for (const p of db.pedidos) {
    p.valor_produtos = r2(db.pedido_itens.filter((i) => i.pedido_id === p.id).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0));
    p.valor_total = Math.max(r2(p.valor_produtos - Number(p.desconto || 0) + Number(p.frete || 0)), 0);
  }
  for (const o of db.ordens_servico) {
    o.valor_pecas = r2(db.os_itens.filter((i) => i.os_id === o.id).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0));
    o.valor_total = o.em_garantia ? 0 : r2(Number(o.valor_mao_obra || 0) + o.valor_pecas);
  }
  for (const i of [...db.pedido_itens, ...db.os_itens]) i.valor_total = r2(i.quantidade * i.valor_unitario);
  for (const pc of db.pedidos_compra ?? []) {
    pc.valor_total = r2(db.pedido_compra_itens.filter((i) => i.pedido_compra_id === pc.id).reduce((s, i) => s + i.quantidade * i.custo_unitario, 0) + Number(pc.frete || 0));
  }
}

const db = seed();
let numeroPedido = 105;
let numeroOS = 53;
let numeroNfe = 1301;
let numeroOP = 13;
let numeroPC = 32;

const TABELAS_COM_UNIDADE = ["pedidos", "ordens_servico", "contas_receber", "contas_pagar", "notas_fiscais", "nfe_recebidas", "ordens_producao", "pedidos_compra", "equipamentos"];
let numeroTransf = 2;

const proximoCodigo = (t: string) => Math.max(0, ...(db[t] ?? []).map((r) => Number(r.codigo) || 0)) + 1;

const DEFAULTS: Record<string, () => Row> = {
  etiquetas_envio: () => ({ impressoes: 0, editados: [], dados: {}, atualizado_em: new Date().toISOString() }),
  auditoria_checklist: () => ({ revisado_nome: db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? "Você", updated_at: new Date().toISOString() }),
  transferencias: () => ({ numero: ++numeroTransf, status: "rascunho", created_at: quando(0) }),
  pedidos: () => ({ numero: ++numeroPedido, status: "orcamento", estoque_baixado: false, created_at: quando(0) }),
  ordens_servico: () => ({ numero: ++numeroOS, status: "aberta", data_entrada: hojeISO(), estoque_baixado: false, created_at: quando(0) }),
  contas_receber: () => ({ status: "aberto", parcela: 1, total_parcelas: 1, created_at: quando(0) }),
  contas_pagar: () => ({ status: "aberto", categoria: "fornecedores", created_at: quando(0) }),
  produtos: () => ({ estoque_atual: 0, ativo: true, origem: 0, unidade: "UN", created_at: quando(0) }),
  ordens_producao: () => ({ numero: ++numeroOP, status: "planejada", created_at: quando(0) }),
  pedidos_compra: () => ({ numero: ++numeroPC, status: "cotacao", frete: 0, created_at: quando(0) }),
  pedido_compra_itens: () => ({ quantidade_recebida: 0 }),
  cotacoes_frete: () => ({ escolhida: false, created_at: quando(0) }),
  recibos: () => ({ numero: Math.max(0, ...(db.recibos ?? []).map((r) => Number(r.numero) || 0)) + 1, cancelado_em: null, cancelado_motivo: null, data_pagamento: hojeISO() }),
  transportadoras: () => ({ ativo: true, codigo: proximoCodigo("transportadoras"), created_at: quando(0) }),
  clientes: () => ({ codigo: proximoCodigo("clientes"), created_at: quando(0) }),
  fornecedores: () => ({ codigo: proximoCodigo("fornecedores"), created_at: quando(0) }),
  contatos_cliente: () => ({ created_at: quando(0) }),
  equipamentos: () => ({ created_at: quando(0) }),
};

// Tempo real (no sistema real: Supabase Realtime)
const canais = new Set<(n: Row) => void>();
let seqNotif = 100;
function notificarDemo(tipo: string, titulo: string, texto: string, link: string, papeis: string[]) {
  const n = { id: ++seqNotif, tipo, titulo, texto, link, papeis, created_at: new Date().toISOString() };
  db.notificacoes.unshift(n);
  const papel = db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.papel;
  if (papel === "admin" || !papeis.length || papeis.includes(papel)) canais.forEach((f) => f(n));
}
const brlDemo = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Expedição criada na aprovação ou na NF-e autorizada (conforme Configurações). */
function expedicaoDemo(p: Row, momento: "aprovacao" | "nfe") {
  const apos = db.configuracoes[0].expedicao_apos ?? "nfe";
  if (momento === "aprovacao" && apos !== "aprovacao") return;
  db.expedicoes ??= [];
  const e = db.expedicoes.find((x) => x.pedido_id === p.id);
  if (e) { if (e.status === "cancelada") e.status = "separar"; return; }
  db.expedicoes.push({ id: uid(), pedido_id: p.id, unidade_id: p.unidade_id, status: "separar", itens_conferidos: [], volumes: p.volumes ?? null, peso_kg: p.peso_total_kg ?? null,
    transportadora_id: p.transportadora_id ?? null, codigo_rastreio: null, created_at: quando(0) });
}

function comissaoDemo(p: Row, valor: number, contaId: string | null, descricao: string) {
  const v = db.vendedores?.find((x) => x.id === p.vendedor_id);
  if (!v || (contaId && db.comissoes.some((c) => c.conta_receber_id === contaId))) return;
  const pct = Number(p.comissao_percentual ?? v.percentual);
  const base = r2(valor * (v.descontar_frete ? Math.max(p.valor_total - p.frete, 0) / (p.valor_total || 1) : 1));
  db.comissoes.push({ id: uid(), vendedor_id: v.id, pedido_id: p.id, conta_receber_id: contaId, descricao, base, percentual: pct, valor: r2(base * pct / 100), status: "a_pagar", conta_pagar_id: null, pago_em: null, created_at: quando(0) });
}

function movimentar(produtoId: string, tipo: string, qtd: number, motivo: string, extra: Row = {}) {
  const unidade_id = extra.unidade_id ?? unidadeDoUsuario();
  db.estoque_movimentos.push({ id: uid(), produto_id: produtoId, tipo, quantidade: qtd, motivo, created_at: quando(0), ...extra, unidade_id });
  const d = tipo === "entrada" ? Math.abs(qtd) : tipo === "saida" ? -Math.abs(qtd) : qtd;
  const p = db.produtos.find((x) => x.id === produtoId);
  if (p) p.estoque_atual = r2(Number(p.estoque_atual) + d);
  const e = db.estoque_unidade.find((x) => x.produto_id === produtoId && x.unidade_id === unidade_id);
  if (e) e.quantidade = r2(e.quantidade + d); else db.estoque_unidade.push({ produto_id: produtoId, unidade_id, quantidade: d });
}

/** Unidade escolhida no seletor (no sistema real: usuarios_erp.unidade_id do usuário logado). */
function unidadeDoUsuario() {
  return db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.unidade_id ?? U_SC;
}
const saldoUn = (produto: string, unidade: string) => Number(db.estoque_unidade.find((e) => e.produto_id === produto && e.unidade_id === unidade)?.quantidade ?? 0);

// ---------------------------------------------------------------------
// Consultas no estilo do supabase-js (select com relacionamentos)
// ---------------------------------------------------------------------
const FK_PAI: Record<string, string> = { clientes: "cliente_id", fornecedores: "fornecedor_id", pedidos: "pedido_id", produtos: "produto_id", transferencias: "transferencia_id", unidades: "unidade_id" };
const FK_FILHO: Record<string, string> = { pedidos: "pedido_id", ordens_servico: "os_id", pedidos_compra: "pedido_compra_id", transferencias: "transferencia_id" };

function dividir(sel: string) {
  const partes: string[] = [];
  let nivel = 0, atual = "";
  for (const ch of sel) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { partes.push(atual.trim()); atual = ""; } else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

function projetar(tabela: string, row: Row, sel: string): Row {
  const out: Row = {};
  for (const parte of dividir(sel)) {
    const rel = parte.match(/^(\w+):(\w+)\((.*)\)$/s);
    if (parte === "*") Object.assign(out, row);
    else if (rel) {
      const [, alias, alvo, sub] = rel;
      const fk = FK_PAI[alvo];
      if (fk && fk in row) {
        const pai = db[alvo].find((r) => r.id === row[fk]);
        out[alias] = pai ? projetar(alvo, pai, sub) : null;
      } else {
        const fkFilho = FK_FILHO[tabela];
        out[alias] = db[alvo].filter((r) => r[fkFilho] === row.id).map((r) => projetar(alvo, r, sub));
      }
    } else out[parte] = row[parte];
  }
  return structuredClone(out);
}

// Visões calculadas (no sistema real: views do Postgres)
const VIEWS: Record<string, () => Row[]> = {
  necessidade_producao: () => {
    const abertas = db.ordens_producao.filter((o) => ["planejada", "em_producao"].includes(o.status));
    return db.ordens_producao.flatMap((op) => db.produto_componentes.filter((c) => c.produto_id === op.produto_id).map((c) => {
      const p: Row = { ...db.produtos.find((x) => x.id === c.componente_id)!, estoque_atual: saldoUn(c.componente_id, op.unidade_id) };
      const reservado = abertas.filter((o) => o.id !== op.id && o.created_at < op.created_at && o.unidade_id === op.unidade_id)
        .reduce((s, o) => s + (db.produto_componentes.find((k) => k.produto_id === o.produto_id && k.componente_id === c.componente_id)?.quantidade ?? 0) * o.quantidade, 0);
      const caminho = db.pedido_compra_itens.filter((i) => i.produto_id === c.componente_id
        && ["cotacao", "enviado", "parcial"].includes(db.pedidos_compra.find((pc) => pc.id === i.pedido_compra_id)?.status))
        .reduce((s, i) => s + i.quantidade - i.quantidade_recebida, 0);
      return {
        ordem_id: op.id, componente_id: c.componente_id, descricao: p.descricao, unidade: p.unidade, fornecedor_padrao_id: p.fornecedor_padrao_id ?? null,
        preco_custo: p.preco_custo, necessario: c.quantidade * op.quantidade, estoque_atual: p.estoque_atual, reservado_outras_op: reservado, a_caminho: caminho,
      };
    }));
  },
  lembretes_manutencao: () => db.equipamentos.filter((e) => {
    if (!e.proxima_preventiva || e.proxima_preventiva > dias(15)) return false;
    if (e.preventiva_agendada && e.preventiva_agendada >= hojeISO()) return false;
    return !db.contatos_cliente.some((c) => c.equipamento_id === e.id && (c.created_at > quando(-7) || (c.proximo_contato && c.proximo_contato > hojeISO())));
  }).map((e) => {
    const c = db.clientes.find((x) => x.id === e.cliente_id);
    const ult = db.contatos_cliente.filter((x) => x.equipamento_id === e.id).map((x) => x.created_at).sort().pop();
    return { ...e, cliente_nome: c?.nome, cliente_whatsapp: c?.whatsapp, ultimo_lembrete: ult ? ult.slice(0, 10) : null };
  }),
};

// Histórico de alterações (no sistema real: gatilho zz_auditoria do Postgres)
const AUDITADAS = new Set(["contas_receber", "contas_pagar", "pedidos", "clientes", "fornecedores", "transportadoras", "produtos", "usuarios_erp",
  "configuracoes", "unidades", "vendedores", "comissoes", "contas_bancarias", "extrato_lancamentos", "auditoria_excecoes"]);
const IGNORAR_AUD = new Set(["motivo_alteracao", "updated_at", "valor_produtos", "valor_pecas", "valor_total", "created_at"]);
function registrarDemo(tabela: string, acao: string, antes: Row | null, depois: Row | null, motivo: string | null, origem: "usuario" | "sistema") {
  db.auditoria ??= [];
  let campos: string[] | null = null, a = antes, d = depois;
  if (acao === "update") {
    campos = Object.keys(depois ?? {}).filter((k) => !IGNORAR_AUD.has(k) && JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(depois?.[k] ?? null));
    if (!campos.length) return;
    a = Object.fromEntries(campos.map((k) => [k, antes?.[k] ?? null]));
    d = Object.fromEntries(campos.map((k) => [k, depois?.[k] ?? null]));
  }
  const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
  db.auditoria.push({ id: db.auditoria.length + 1, tabela, registro_id: String((depois ?? antes)?.id ?? (depois ?? antes)?.user_id ?? ""), acao, usuario: sessao?.user.id ?? null,
    usuario_nome: u?.nome ?? null, campos, antes: a, depois: d, motivo: motivo || null, origem, created_at: new Date().toISOString() });
}
/** Mesma regra do banco: mudar valor/vencimento, cancelar ou estornar uma conta exige motivo. */
function faltaMotivo(antes: Row, p: Row) {
  if (p.motivo_alteracao && String(p.motivo_alteracao).trim()) return false;
  const muda = (k: string) => k in p && JSON.stringify(p[k] ?? null) !== JSON.stringify(antes[k] ?? null);
  return muda("valor") && Number(p.valor) !== Number(antes.valor) || muda("vencimento")
    || (antes.status === "pago" && ((muda("status") && p.status !== "pago") || muda("valor_pago") || muda("data_pagamento")))
    || (p.status === "cancelado" && antes.status !== "cancelado");
}

class Query {
  private filtros: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private sel = "*";
  private ordem?: { col: string; asc: boolean };
  private lim?: number;
  private ini = 0;
  private umaLinha: "" | "single" | "maybe" = "";
  constructor(private tabela: string) {
    if (!db[tabela]) db[tabela] = [];
  }
  select(sel = "*") { this.sel = sel; return this; }
  insert(p: any) { this.op = "insert"; this.payload = Array.isArray(p) ? p : [p]; return this; }
  private conflito: string[] = [];
  private ignorarDuplicados = false;
  upsert(p: any, o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert"; this.payload = Array.isArray(p) ? p : [p];
    this.conflito = o?.onConflict ? o.onConflict.split(",").map((x) => x.trim()) : [];
    this.ignorarDuplicados = !!o?.ignoreDuplicates;
    return this;
  }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: any) { this.filtros.push((r) => r[c] === v); return this; }
  in(c: string, v: any[]) { this.filtros.push((r) => v.includes(r[c])); return this; }
  lt(c: string, v: any) { this.filtros.push((r) => r[c] < v); return this; }
  gte(c: string, v: any) { this.filtros.push((r) => r[c] >= v); return this; }
  lte(c: string, v: any) { this.filtros.push((r) => r[c] <= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.ordem = { col, asc: o?.ascending ?? true }; return this; }
  limit(n: number) { this.lim = n; return this; }
  range(de: number, ate: number) { this.ini = de; this.lim = ate - de + 1; return this; }
  single() { this.umaLinha = "single"; return this; }
  maybeSingle() { this.umaLinha = "maybe"; return this; }

  private executar(): { data: any; error: any } {
    if (VIEWS[this.tabela]) db[this.tabela] = VIEWS[this.tabela]();
    const t = db[this.tabela];
    let linhas: Row[];
    if (this.op === "insert" || this.op === "upsert") {
      linhas = this.payload.map((p: Row) => {
        const chaves = this.conflito.length ? this.conflito : p.chave ? ["chave"] : [];
        const existente = this.op === "upsert" && chaves.length ? t.find((r) => chaves.every((k) => r[k] === p[k])) : null;
        if (existente) return this.ignorarDuplicados ? existente : Object.assign(existente, p, { updated_at: new Date().toISOString() });
        const novo: Row = { id: uid(), created_at: new Date().toISOString(), ...(DEFAULTS[this.tabela]?.() ?? {}), ...p };
        if (TABELAS_COM_UNIDADE.includes(this.tabela) && !novo.unidade_id) novo.unidade_id = unidadeDoUsuario();
        t.push(novo);
        if (AUDITADAS.has(this.tabela)) registrarDemo(this.tabela, "insert", null, { ...novo }, null, "usuario");
        if (this.tabela === "contas_recorrentes") setTimeout(() => gerarRecorrentesDemo(db, novo.id));
        if (this.tabela === "envios") { novo.numero ??= Math.max(0, ...t.map((r) => Number(r.numero) || 0)) + 1; calcularEnvioDemo(novo); }
        if (this.tabela === "envio_cotacoes") { novo.ativa ??= true; novo.escolhida ??= false; const ev = db.envios.find((x) => x.id === novo.envio_id); if (ev?.status === "cotacao") ev.status = "aprovacao"; }
        if (this.tabela === "envio_ocorrencias") { novo.status ??= "aberta"; novo.atualizado_em = novo.created_at; }
        if (this.tabela === "estoque_movimentos") {
          t.pop();
          movimentar(novo.produto_id, novo.tipo, Number(novo.quantidade), novo.motivo ?? "", { numero_serie: novo.numero_serie, unidade_id: novo.unidade_id });
        }
        return novo;
      });
    } else {
      linhas = t.filter((r) => this.filtros.every((f) => f(r)));
      const conta = this.tabela === "contas_receber" || this.tabela === "contas_pagar";
      if (conta && this.op === "delete" && linhas.length) return erro("contas não podem ser excluídas: cancele a conta informando o motivo");
      if (conta && this.op === "update" && linhas.some((r) => faltaMotivo(r, this.payload))) return erro("informe o motivo da alteração (valor, vencimento, cancelamento ou estorno)");
      if (this.op === "update") linhas.forEach((r) => {
        const antes = r.status;
        const copia = AUDITADAS.has(this.tabela) ? { ...r } : null;
        Object.assign(r, this.payload);
        if (copia) { registrarDemo(this.tabela, "update", copia, { ...r }, this.payload.motivo_alteracao ?? null, "usuario"); delete r.motivo_alteracao; }
        if (this.tabela === "contas_recorrentes") aplicarRecorrenteDemo(r);
        if (this.tabela === "envios") calcularEnvioDemo(r);
        if (this.tabela === "envio_ocorrencias") { r.atualizado_em = new Date().toISOString(); if (r.status === "resolvida") r.resolvida_em ??= r.atualizado_em; }
        if (this.tabela === "pedidos" && this.payload.forma_pagamento_id) {
          const f = db.formas_pagamento?.find((x) => x.id === this.payload.forma_pagamento_id);
          if (f && ["boleto", "pix", "cartao", "dinheiro", "transferencia"].includes(f.meio)) r.forma_pagamento = f.meio;
        }
        if (this.tabela === "contas_pagar" && r.status === "pago" && antes !== "pago") {
          (db.comissoes ?? []).filter((c) => c.conta_pagar_id === r.id && c.status === "a_pagar").forEach((c) => Object.assign(c, { status: "paga", pago_em: r.data_pagamento ?? hojeISO() }));
        }
        if (this.tabela === "contas_receber" && r.status === "pago" && antes !== "pago") {
          const ped = db.pedidos.find((x) => x.id === r.pedido_id);
          if (ped && db.vendedores?.find((v) => v.id === ped.vendedor_id)?.base === "recebimento") comissaoDemo(ped, Number(r.valor_pago ?? r.valor), r.id, r.descricao);
          const cli = db.clientes.find((c) => c.id === r.cliente_id)?.nome;
          notificarDemo("pagamento", `Pagamento recebido: ${brlDemo(r.valor_pago ?? r.valor)}`, [cli, r.descricao].filter(Boolean).join(" · "), "/financeiro", ["financeiro", "vendas"]);
        }
      });
      if (this.op === "delete") {
        if (AUDITADAS.has(this.tabela)) linhas.forEach((r) => registrarDemo(this.tabela, "delete", { ...r }, null, null, "usuario"));
        db[this.tabela] = t.filter((r) => !linhas.includes(r));
      }
    }
    recalcular(db);
    if (this.op === "select" && this.ordem) {
      const { col, asc } = this.ordem;
      linhas = [...linhas].sort((a, b) => (a[col] ?? "") < (b[col] ?? "") ? (asc ? -1 : 1) : (a[col] ?? "") > (b[col] ?? "") ? (asc ? 1 : -1) : 0);
    }
    if (this.lim) linhas = linhas.slice(this.ini, this.ini + this.lim);
    const data = linhas.map((r) => projetar(this.tabela, r, this.sel));
    if (this.umaLinha) {
      if (!data[0] && this.umaLinha === "single") return { data: null, error: { message: "registro não encontrado" } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null };
  }

  then(res: (v: { data: any; error: any }) => any, rej?: (e: any) => any) {
    return new Promise((ok) => setTimeout(() => ok(this.executar()), 120)).then(res as any, rej);
  }
}

// ---------------------------------------------------------------------
// Regras de negócio (no sistema real: funções SQL)
// ---------------------------------------------------------------------
function erro(message: string) { return { data: null, error: { message } }; }

// Conciliação bancária (no sistema real: funções SQL importar_extrato, conciliar_lancamento…)
const podeFinanceiro = () => ["admin", "financeiro"].includes(db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.papel);
function atualizarDemo(tabela: string, r: Row, patch: Row, motivo: string | null = null) {
  const antes = { ...r };
  Object.assign(r, patch);
  registrarDemo(tabela, "update", antes, { ...r }, motivo, "sistema");
}
function vincularDemo(l: Row, tipo: "receber" | "pagar", contaId: string): string | null {
  const tabela = tipo === "receber" ? "contas_receber" : "contas_pagar";
  if (tipo === "receber" ? l.valor < 0 : l.valor > 0) return tipo === "receber" ? "saída do banco não pode ser ligada a uma conta a receber" : "entrada no banco não pode ser ligada a uma conta a pagar";
  const c = db[tabela].find((x) => x.id === contaId);
  if (!c) return "conta não encontrada";
  if (c.status === "cancelado") return "conta cancelada";
  if (db.extrato_lancamentos.some((x) => x.id !== l.id && x.status === "conciliado" && x[tipo === "receber" ? "conta_receber_id" : "conta_pagar_id"] === contaId)) return "esta conta já está conciliada com outra linha do extrato";
  let baixou = false;
  if (c.status === "aberto") {
    atualizarDemo(tabela, c, { status: "pago", data_pagamento: l.data, valor_pago: Math.abs(l.valor), conta_bancaria_id: l.conta_bancaria_id }, "Baixa pela conciliação bancária");
    baixou = true;
  } else if (!c.conta_bancaria_id) atualizarDemo(tabela, c, { conta_bancaria_id: l.conta_bancaria_id });
  atualizarDemo("extrato_lancamentos", l, { status: "conciliado", conta_receber_id: tipo === "receber" ? contaId : null, conta_pagar_id: tipo === "pagar" ? contaId : null, baixou_conta: baixou, conciliado_em: new Date().toISOString() });
  return null;
}
function conciliarAutoDemo(contaBancaria: string) {
  const unid = db.contas_bancarias.find((b) => b.id === contaBancaria)?.unidade_id;
  const perto = (a: string, b: string, n: number) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5 <= n;
  let n = 0;
  for (const l of db.extrato_lancamentos.filter((x) => x.conta_bancaria_id === contaBancaria && x.status === "pendente").sort((a, b) => a.data.localeCompare(b.data))) {
    const tipo = l.valor > 0 ? "receber" : "pagar";
    const campo = tipo === "receber" ? "conta_receber_id" : "conta_pagar_id";
    const ligadas = new Set(db.extrato_lancamentos.filter((x) => x.status === "conciliado").map((x) => x[campo]));
    const cands = db[tipo === "receber" ? "contas_receber" : "contas_pagar"].filter((c) => c.unidade_id === unid && !ligadas.has(c.id) && (
      (c.status === "aberto" && r2(c.valor) === Math.abs(l.valor) && perto(c.vencimento, l.data, 10))
      || (c.status === "pago" && r2(c.valor_pago ?? c.valor) === Math.abs(l.valor) && perto(c.data_pagamento ?? "", l.data, 3) && (!c.conta_bancaria_id || c.conta_bancaria_id === contaBancaria))));
    if (cands.length === 1 && !vincularDemo(l, tipo, cands[0].id)) n++;
  }
  return n;
}

// Financeiro: movimentos realizados (contas pagas + extrato sem conta) e saldo de cada conta bancária
const somaDiaDemo = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function movimentosDemo(de: string, ate: string) {
  const m = new Map<string, Row>();
  const add = (cb: string | null, d: string | null, v: number) => {
    if (!cb || !d || d < de || d > ate) return;
    const x = m.get(cb + "|" + d) ?? { conta_bancaria_id: cb, dia: d, entradas: 0, saidas: 0 };
    if (v > 0) x.entradas = r2(x.entradas + v); else x.saidas = r2(x.saidas - v);
    m.set(cb + "|" + d, x);
  };
  for (const c of db.contas_receber) if (c.status === "pago") add(c.conta_bancaria_id, c.data_pagamento, Number(c.valor_pago ?? c.valor));
  for (const c of db.contas_pagar) if (c.status === "pago") add(c.conta_bancaria_id, c.data_pagamento, -Number(c.valor_pago ?? c.valor));
  for (const l of db.extrato_lancamentos) if (["pendente", "ignorado", "transferencia"].includes(l.status)) add(l.conta_bancaria_id, l.data, Number(l.valor));
  return [...m.values()];
}
function saldosDemo() {
  return db.contas_bancarias.filter((b) => b.ativo).map((b) => {
    const imp = db.extrato_importacoes.filter((i) => i.conta_bancaria_id === b.id && i.saldo_final != null && i.saldo_final_data)
      .sort((a, c) => String(c.saldo_final_data).localeCompare(a.saldo_final_data))[0];
    const usa = !!imp && imp.saldo_final_data >= b.saldo_inicial_data;
    const base = usa ? Number(imp.saldo_final) : Number(b.saldo_inicial);
    const data = usa ? imp.saldo_final_data : b.saldo_inicial_data;
    const mov = movimentosDemo(usa ? somaDiaDemo(data, 1) : data, hojeISO()).filter((x) => x.conta_bancaria_id === b.id).reduce((s, x) => s + x.entradas - x.saidas, 0);
    return { conta_id: b.id, nome: b.nome, unidade_id: b.unidade_id, tipo: b.tipo, saldo: r2(base + mov), data_base: data, saldo_base: base, origem: usa ? "extrato" : "cadastro" };
  });
}
const reaisDemo = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const soDig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const whatsDemo = (t: unknown) => {
  let d = soDig(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") return d;
  if (d.length === 10 && /[6-9]/.test(d[2])) return d.slice(0, 2) + "9" + d.slice(2);
  return null;
};
const temMovimentoDemo = (id: string) => db.pedidos.some((p) => p.cliente_id === id) || db.contas_receber.some((r) => r.cliente_id === id)
  || db.ordens_servico.some((o) => o.cliente_id === id) || (db.contatos_cliente ?? []).some((c: any) => c.cliente_id === id);
const fornecedoresNosClientesDemo = () => db.clientes.filter((c) => !(c.tags ?? []).includes("fornecedor") && soDig(c.cpf_cnpj).length >= 11
  && (db.fornecedores.some((f) => soDig(f.cnpj) === soDig(c.cpf_cnpj)) || db.transportadoras.some((t) => soDig(t.cnpj) === soDig(c.cpf_cnpj))))
  .map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, cpf_cnpj: c.cpf_cnpj, motivo: db.fornecedores.some((f) => soDig(f.cnpj) === soDig(c.cpf_cnpj)) ? "mesmo CPF/CNPJ de um fornecedor" : "mesmo CNPJ de uma transportadora", tem_movimento: temMovimentoDemo(c.id), ja_e_fornecedor: true }));

const rpcs: Record<string, (a: any) => { data: any; error: any }> = {
  evolucao_notas: () => {
    const dia = hojeISO();
    const cfg = db.configuracoes[0];
    const data = db.notas_fiscais.filter((n) => !n.excluida_em && n.origem !== "importada").map((n) => {
      const p = db.pedidos.find((x) => x.id === n.pedido_id);
      const c = db.clientes.find((x) => x.id === (p?.cliente_id ?? n.cliente_id));
      const av = (db.avisos ?? []).filter((a) => a.tipo === "cli_nfe" && a.chave === `nfe:${n.id}`).slice(-1)[0];
      const contas = db.contas_receber.filter((r) => r.status !== "cancelado" && ((n.pedido_id && r.pedido_id === n.pedido_id) || r.nota_fiscal_id === n.id));
      const et = (db.etiquetas_envio ?? []).filter((e) => e.impressa_em && (e.nota_fiscal_id === n.id || (n.pedido_id && e.pedido_id === n.pedido_id)))
        .sort((a, b) => (a.impressa_em < b.impressa_em ? 1 : -1))[0];
      const ex = n.pedido_id ? (db.expedicoes ?? []).find((e) => e.pedido_id === n.pedido_id) : null;
      const ev = n.pedido_id ? (db.envios ?? []).filter((v) => v.pedido_id === n.pedido_id && v.status !== "cancelado").sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] : null;
      const pagos = contas.filter((r) => r.data_pagamento).map((r) => r.data_pagamento).sort();
      return {
        nota_id: n.id, email_status: av?.status ?? null, email_em: av?.enviado_em ?? null,
        email_possivel: !!(cfg.avisos_email_ativo && c?.avisos_email !== false && /@/.test(c?.email ?? "")),
        contas_qtd: contas.length, contas_pagas: contas.filter((r) => r.status === "pago").length,
        contas_vencidas: contas.filter((r) => r.status === "aberto" && r.vencimento < dia).length,
        contas_aberto: contas.filter((r) => r.status === "aberto").reduce((t, r) => t + Number(r.valor) - Number(r.valor_pago ?? 0), 0),
        pago_em: pagos.slice(-1)[0] ?? null, estoque: !!(n.estoque_lancado || p?.estoque_baixado),
        etiqueta_em: et?.impressa_em ?? null, etiqueta_vezes: et?.impressoes ?? 0,
        exp_status: ex?.status ?? null, separando_em: ex?.separando_em ?? null, embalado_em: ex?.embalado_em ?? null, despachado_em: ex?.despachado_em ?? null, exp_entregue_em: ex?.entregue_em ?? null,
        envio_status: ev?.status ?? null, coletado_em: ev?.coletado_em ?? null, entrega_prevista: ev?.entrega_prevista ?? null, envio_entregue_em: ev?.entregue_em ?? null,
        rastreio: ev?.codigo_rastreio ?? ex?.codigo_rastreio ?? p?.codigo_rastreio ?? null, pedido_status: p?.status ?? null,
        cce: (db.nfe_cartas_correcao ?? []).filter((k) => k.nota_id === n.id && k.status === "autorizada").length,
        devolucao: db.notas_fiscais.some((d) => d.nota_referenciada_id === n.id && !d.excluida_em && ["autorizada", "processando", "contingencia"].includes(d.status)),
      };
    });
    return { data, error: null };
  },
  evolucao_recebidas: () => {
    const dia = hojeISO();
    const data = (db.nfe_recebidas ?? []).filter((n) => !n.excluida_em).map((n) => {
      const cp = db.contas_pagar.filter((c) => c.status !== "cancelado" && (c.nfe_recebida_id === n.id || c.id === n.conta_pagar_id));
      return cp.length ? {
        nota_id: n.id, contas_qtd: cp.length, contas_pagas: cp.filter((c) => c.status === "pago").length,
        contas_vencidas: cp.filter((c) => c.status === "aberto" && c.vencimento < dia).length,
        contas_aberto: cp.filter((c) => c.status === "aberto").reduce((t, c) => t + Number(c.valor) - Number(c.valor_pago ?? 0), 0),
        pago_em: cp.map((c) => c.data_pagamento).filter(Boolean).sort().slice(-1)[0] ?? null,
      } : null;
    }).filter(Boolean);
    return { data, error: null };
  },
  salvar_modelo_etiqueta: ({ p_modelo }) => {
    const papel = db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.papel;
    if (!["admin", "vendas", "financeiro"].includes(papel)) return erro("sem permissão para esta ação");
    if (!p_modelo || typeof p_modelo !== "object" || Array.isArray(p_modelo)) return erro("modelo inválido");
    const { formato_transporte, ...resto } = p_modelo;
    const c = db.configuracoes[0];
    c.etiqueta_modelo = resto;
    if (["10x15", "a4"].includes(formato_transporte)) c.etiqueta_formato = formato_transporte;
    return { data: null, error: null };
  },
  preencher_whatsapp_cadastros: () => {
    const n = { clientes: 0, fornecedores: 0, transportadoras: 0 };
    for (const t of ["clientes", "fornecedores", "transportadoras"] as const) {
      for (const c of (db as any)[t]) { const w = whatsDemo(c.whatsapp) ?? whatsDemo(c.telefone); if (w && w !== c.whatsapp) { c.whatsapp = w; n[t]++; } }
    }
    return { data: n, error: null };
  },
  clientes_com_historico: () => ({ data: db.clientes.filter((c) => temMovimentoDemo(c.id)).map((c) => c.id), error: null }),
  clientes_fornecedores: () => ({ data: fornecedoresNosClientesDemo(), error: null }),
  retirar_fornecedores_clientes: ({ p_ids }) => {
    let retirados = 0, mantidos = 0;
    for (const f of fornecedoresNosClientesDemo().filter((x) => p_ids.includes(x.id))) {
      const c = db.clientes.find((x) => x.id === f.id)!;
      if (f.tem_movimento) { c.tags = [...new Set([...(c.tags ?? []), "fornecedor"])]; mantidos++; } else { db.clientes = db.clientes.filter((x) => x.id !== f.id); retirados++; }
    }
    return { data: { retirados, mantidos_com_etiqueta: mantidos, fornecedores_criados: 0 }, error: null };
  },
  unificar_clientes: ({ p_manter, p_outros }) => {
    const m = db.clientes.find((x) => x.id === p_manter);
    if (!m) return { data: null, error: { message: "cliente principal não encontrado" } };
    let n = 0;
    for (const id of p_outros) {
      const o = db.clientes.find((x) => x.id === id);
      if (!o || id === p_manter) continue;
      for (const t of ["pedidos", "contas_receber", "ordens_servico", "equipamentos", "contatos_cliente", "notas_fiscais", "emails"]) {
        for (const r of ((db as any)[t] ?? [])) if (r.cliente_id === id) r.cliente_id = p_manter;
      }
      for (const k of ["nome_fantasia", "cpf_cnpj", "inscricao_estadual", "email", "telefone", "whatsapp", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf"]) {
        if (!m[k] && o[k]) m[k] = o[k];
      }
      m.tags = [...new Set([...(m.tags ?? []), ...(o.tags ?? [])])];
      db.clientes = db.clientes.filter((x) => x.id !== id);
      n++;
    }
    return { data: n, error: null };
  },
  registrar_cobranca: ({ p_conta, p_etapa, p_canal, p_situacao }) => {
    const c = db.contas_receber.find((x) => x.id === p_conta), e = db.regua_cobranca.find((x) => x.id === p_etapa);
    if (!c || !e) return erro("conta ou etapa da régua não encontrada");
    if (!db.cobranca_envios.some((x) => x.conta_receber_id === p_conta && x.etapa_id === p_etapa && x.canal === (p_canal ?? "whatsapp"))) {
      db.cobranca_envios.push({ id: uid(), conta_receber_id: p_conta, etapa_id: p_etapa, canal: p_canal ?? "whatsapp", situacao: p_situacao ?? "enviado", created_at: new Date().toISOString() });
    }
    if ((p_situacao ?? "enviado") === "enviado" && c.cliente_id) {
      db.contatos_cliente.push({ id: uid(), cliente_id: c.cliente_id, tipo: "cobranca", canal: p_canal ?? "whatsapp", resultado: `Régua de cobrança (${e.nome}): ${c.descricao} · ${reaisDemo(Number(c.valor))}`, created_at: new Date().toISOString() });
    }
    return { data: null, error: null };
  },
  area_cliente: ({ p_token }) => {
    const c = db.clientes.find((x) => x.portal_token === p_token);
    if (!c) return { data: null, error: null };
    const cfg = db.configuracoes[0];
    const u = (id: string) => db.unidades.find((x) => x.id === id) ?? {};
    return { data: {
      cliente: c.nome_fantasia?.trim() || c.nome,
      empresa: { nome: cfg.nome_fantasia || cfg.razao_social, whatsapp: cfg.whatsapp, telefone: cfg.telefone, email: cfg.email },
      abertas: db.contas_receber.filter((r) => r.cliente_id === c.id && r.status === "aberto").sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map((r) => {
        const un: Row = u(r.unidade_id);
        return { id: r.id, descricao: r.descricao, valor: r.valor, vencimento: r.vencimento, forma: r.forma_pagamento, pagamento: un.instrucoes_pagamento ?? null,
          pix_chave: un.pix_chave ?? null, pix_nome: un.pix_nome || un.razao_social || un.nome, pix_cidade: un.pix_cidade || un.municipio };
      }),
      pagas: db.contas_receber.filter((r) => r.cliente_id === c.id && r.status === "pago").sort((a, b) => String(b.data_pagamento).localeCompare(a.data_pagamento)).slice(0, 10)
        .map((r) => ({ descricao: r.descricao, valor: r.valor_pago ?? r.valor, data_pagamento: r.data_pagamento })),
    }, error: null };
  },
  gerar_recorrentes: () => (podeFinanceiro() ? { data: gerarRecorrentesDemo(db), error: null } : erro("sem permissão para esta ação")),
  saldos_bancarios: () => (podeFinanceiro() ? { data: saldosDemo(), error: null } : erro("sem permissão para esta ação")),
  movimentos_realizados: ({ p_de, p_ate }) => (podeFinanceiro() ? { data: movimentosDemo(p_de, p_ate), error: null } : erro("sem permissão para esta ação")),
  baixar_conta: ({ p_tabela, p_id, p_data, p_valor, p_conta_bancaria, p_restante_vencimento }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const c = db[p_tabela]?.find((x: Row) => x.id === p_id);
    if (!c) return erro("conta não encontrada");
    if (c.status !== "aberto") return erro("esta conta não está em aberto");
    const v = r2(Number(p_valor));
    if (!(v > 0)) return erro("informe o valor pago");
    if (p_restante_vencimento && v < Number(c.valor)) {
      const rest = r2(Number(c.valor) - v);
      const novo = { ...c, id: uid(), valor: rest, vencimento: p_restante_vencimento, status: "aberto", descricao: String(c.descricao).replace(/ \(restante\)$/, "") + " (restante)",
        conta_origem_id: c.id, data_pagamento: null, valor_pago: null, conta_bancaria_id: null, created_at: new Date().toISOString() };
      db[p_tabela].push(novo);
      atualizarDemo(p_tabela, c, { valor: v, status: "pago", data_pagamento: p_data, valor_pago: v, conta_bancaria_id: p_conta_bancaria ?? null },
        `Pagamento parcial: o restante de ${reaisDemo(rest)} ficou em aberto`);
      return { data: novo.id, error: null };
    }
    atualizarDemo(p_tabela, c, { status: "pago", data_pagamento: p_data, valor_pago: v, conta_bancaria_id: p_conta_bancaria ?? null },
      v === Number(c.valor) ? null : v < Number(c.valor) ? `Pago com desconto de ${reaisDemo(Number(c.valor) - v)}` : `Pago com juros/multa de ${reaisDemo(v - Number(c.valor))}`);
    return { data: null, error: null };
  },
  importar_extrato: ({ p_conta, p_arquivo, p_formato, p_linhas, p_saldo_final, p_saldo_data }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!p_linhas?.length) return erro("o arquivo não tem lançamentos");
    const datas = p_linhas.map((l: Row) => l.data).sort();
    const imp = { id: uid(), conta_bancaria_id: p_conta, arquivo: p_arquivo, formato: p_formato, periodo_inicio: datas[0], periodo_fim: datas[datas.length - 1],
      saldo_final: p_saldo_final ?? null, saldo_final_data: p_saldo_data ?? null, linhas_novas: 0, linhas_repetidas: 0, conciliadas_auto: 0, created_at: new Date().toISOString() };
    db.extrato_importacoes.push(imp);
    for (const l of p_linhas) {
      if (!Number(l.valor) || !l.identificador || db.extrato_lancamentos.some((x) => x.conta_bancaria_id === p_conta && x.identificador === l.identificador)) continue;
      db.extrato_lancamentos.push({ id: uid(), conta_bancaria_id: p_conta, importacao_id: imp.id, data: l.data, valor: r2(Number(l.valor)), descricao: l.descricao, documento: l.documento ?? null,
        identificador: l.identificador, status: "pendente", conta_receber_id: null, conta_pagar_id: null, baixou_conta: false, par_transferencia_id: null, observacao: null, created_at: new Date().toISOString() });
      imp.linhas_novas++;
    }
    imp.linhas_repetidas = p_linhas.length - imp.linhas_novas;
    imp.conciliadas_auto = conciliarAutoDemo(p_conta);
    return { data: { importacao: imp.id, novas: imp.linhas_novas, repetidas: imp.linhas_repetidas, conciliadas: imp.conciliadas_auto }, error: null };
  },
  conciliar_lancamento: ({ p_lanc, p_tipo, p_conta }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const l = db.extrato_lancamentos.find((x) => x.id === p_lanc);
    if (!l || l.status !== "pendente") return erro("esta linha do extrato já foi tratada");
    const e = vincularDemo(l, p_tipo, p_conta);
    return e ? erro(e) : { data: null, error: null };
  },
  desfazer_conciliacao: ({ p_lanc, p_motivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!String(p_motivo ?? "").trim()) return erro("informe o motivo");
    const l = db.extrato_lancamentos.find((x) => x.id === p_lanc);
    if (!l || l.status === "pendente") return erro("esta linha ainda não foi tratada");
    if (l.baixou_conta) {
      const tabela = l.conta_receber_id ? "contas_receber" : "contas_pagar";
      const c = db[tabela].find((x) => x.id === (l.conta_receber_id ?? l.conta_pagar_id));
      if (c) atualizarDemo(tabela, c, { status: "aberto", data_pagamento: null, valor_pago: null }, `Conciliação desfeita: ${p_motivo}`);
    }
    const par = db.extrato_lancamentos.find((x) => x.id === l.par_transferencia_id);
    if (par) atualizarDemo("extrato_lancamentos", par, { status: "pendente", par_transferencia_id: null, observacao: null, conciliado_em: null });
    atualizarDemo("extrato_lancamentos", l, { status: "pendente", conta_receber_id: null, conta_pagar_id: null, baixou_conta: false, par_transferencia_id: null, observacao: `Desfeito: ${p_motivo}`, conciliado_em: null });
    return { data: null, error: null };
  },
  ignorar_lancamento: ({ p_lanc, p_motivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!String(p_motivo ?? "").trim()) return erro("informe o motivo");
    const l = db.extrato_lancamentos.find((x) => x.id === p_lanc);
    if (!l || l.status !== "pendente") return erro("esta linha do extrato já foi tratada");
    atualizarDemo("extrato_lancamentos", l, { status: "ignorado", observacao: p_motivo, conciliado_em: new Date().toISOString() });
    return { data: null, error: null };
  },
  marcar_transferencia: ({ p_lanc, p_par }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const a = db.extrato_lancamentos.find((x) => x.id === p_lanc), b = db.extrato_lancamentos.find((x) => x.id === p_par);
    if (!a || !b || a.status !== "pendente" || b.status !== "pendente") return erro("as duas linhas precisam estar pendentes");
    if (a.conta_bancaria_id === b.conta_bancaria_id) return erro("escolha a linha da outra conta");
    if (r2(a.valor + b.valor) !== 0) return erro("os valores precisam ser iguais (saída numa conta, entrada na outra)");
    atualizarDemo("extrato_lancamentos", a, { status: "transferencia", par_transferencia_id: b.id, conciliado_em: new Date().toISOString() });
    atualizarDemo("extrato_lancamentos", b, { status: "transferencia", par_transferencia_id: a.id, conciliado_em: new Date().toISOString() });
    return { data: null, error: null };
  },
  lancar_do_extrato: ({ p_lanc, p_categoria, p_descricao }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const l = db.extrato_lancamentos.find((x) => x.id === p_lanc);
    if (!l || l.status !== "pendente") return erro("esta linha do extrato já foi tratada");
    const unid = db.contas_bancarias.find((b) => b.id === l.conta_bancaria_id)?.unidade_id;
    const id = uid();
    const desc = String(p_descricao ?? "").trim() || l.descricao;
    if (l.valor < 0) {
      db.contas_pagar.push({ id, descricao: desc, categoria: p_categoria ?? "outros", valor: -l.valor, vencimento: l.data, status: "pago", data_pagamento: l.data, valor_pago: -l.valor,
        unidade_id: unid, conta_bancaria_id: l.conta_bancaria_id, observacoes: "Lançado a partir do extrato bancário", created_at: new Date().toISOString() });
      registrarDemo("contas_pagar", "insert", null, db.contas_pagar[db.contas_pagar.length - 1], null, "sistema");
      atualizarDemo("extrato_lancamentos", l, { status: "conciliado", conta_pagar_id: id, conciliado_em: new Date().toISOString() });
    } else {
      db.contas_receber.push({ id, descricao: desc, valor: l.valor, vencimento: l.data, status: "pago", data_pagamento: l.data, valor_pago: l.valor, forma_pagamento: "transferencia",
        unidade_id: unid, conta_bancaria_id: l.conta_bancaria_id, parcela: 1, total_parcelas: 1, created_at: new Date().toISOString() });
      registrarDemo("contas_receber", "insert", null, db.contas_receber[db.contas_receber.length - 1], null, "sistema");
      atualizarDemo("extrato_lancamentos", l, { status: "conciliado", conta_receber_id: id, conciliado_em: new Date().toISOString() });
    }
    return { data: id, error: null };
  },
  erp_sem_usuarios: () => ({ data: false, error: null }),
  salvar_preferencias: ({ p }) => {
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.preferencias = { ...u.preferencias, ...p };
    return { data: null, error: null };
  },
  marcar_notificacoes_vistas: () => {
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.notificacoes_vistas_em = new Date().toISOString();
    return { data: null, error: null };
  },
  loja_meu_cadastro: () => {
    const l = db.loja_clientes.find((x) => x.user_id === sessao?.user.id);
    return { data: l ? db.clientes.find((c) => c.id === l.cliente_id) ?? null : null, error: null };
  },
  loja_salvar_cadastro: ({ p }) => {
    if (!sessao) return erro("entre na sua conta primeiro");
    const doc = String(p.cpf_cnpj ?? "").replace(/\D/g, "");
    if (![11, 14].includes(doc.length)) return erro("CPF ou CNPJ inválido");
    const l = db.loja_clientes.find((x) => x.user_id === sessao!.user.id);
    const campos = { nome: p.nome, tipo_pessoa: doc.length === 14 ? "PJ" : "PF", cpf_cnpj: doc, inscricao_estadual: p.inscricao_estadual || null, whatsapp: p.whatsapp, telefone: p.telefone || null,
      cep: p.cep, logradouro: p.logradouro, numero: p.numero, complemento: p.complemento || null, bairro: p.bairro, municipio: p.municipio, uf: String(p.uf ?? "").toUpperCase(), email: sessao.user.email, avisos_email: true, contribuinte_icms: 9 };
    if (l) { Object.assign(db.clientes.find((c) => c.id === l.cliente_id)!, campos); return { data: l.cliente_id, error: null }; }
    const existente = db.clientes.find((c) => String(c.cpf_cnpj ?? "").replace(/\D/g, "") === doc);
    const id = existente?.id ?? uid();
    if (!existente) db.clientes.push({ id, ...campos, observacoes: "Cadastro feito pela loja virtual" });
    db.loja_clientes.push({ user_id: sessao.user.id, cliente_id: id });
    return { data: id, error: null };
  },
  loja_criar_pedido: ({ p_itens, p_observacoes }) => {
    const l = db.loja_clientes.find((x) => x.user_id === sessao?.user.id);
    if (!l) return erro("complete o seu cadastro antes de fazer o pedido");
    const itens = (p_itens ?? []).map((i: Row) => ({ q: Math.floor(Number(i.quantidade)), p: db.produtos.find((x) => x.id === i.produto_id && x.ativo && x.no_catalogo && x.foto_caminho) })).filter((i: Row) => i.q > 0);
    if (!itens.length) return erro("carrinho vazio");
    if (itens.some((i: Row) => !i.p)) return erro("um dos produtos não está mais disponível na loja");
    const ped: Row = { id: uid(), ...DEFAULTS.pedidos(), cliente_id: l.cliente_id, origem: "loja", forma_pagamento: "pix", parcelas: 1, intervalo_dias: 30, modalidade_frete: 9, desconto: 0, frete: 0,
      observacoes: p_observacoes || null, unidade_id: db.configuracoes[0].loja_unidade_id ?? U_SC, loja_user_id: sessao!.user.id, vendedor: "Loja virtual" };
    db.pedidos.push(ped);
    for (const i of itens) db.pedido_itens.push({ id: uid(), pedido_id: ped.id, produto_id: i.p.id, descricao: i.p.descricao, quantidade: i.q, valor_unitario: i.p.preco_venda });
    recalcular(db);
    const cli = db.clientes.find((c) => c.id === l.cliente_id)!.nome;
    notificarDemo("pedido_loja", `Novo pedido na loja: #${ped.numero}`, `${cli} · ${brlDemo(ped.valor_total)}`, "/pedidos", ["vendas"]);
    return { data: { numero: ped.numero, total: ped.valor_total }, error: null };
  },
  loja_meus_pedidos: () => ({
    error: null,
    data: db.pedidos.filter((p) => p.loja_user_id && p.loja_user_id === sessao?.user.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((p) => ({
      numero: p.numero, data: p.created_at, status: p.status, total: p.valor_total, frete: p.frete, rastreio: p.codigo_rastreio ?? null,
      itens: db.pedido_itens.filter((i) => i.pedido_id === p.id).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valor: i.quantidade * i.valor_unitario })),
    })),
  }),
  abrir_contagem: ({ p_unidade, p_produtos, p_escopo }) => {
    const c: Row = { id: uid(), numero: db.contagens_estoque.length + 1, unidade_id: p_unidade, escopo: p_escopo, status: "aberta",
      criada_nome: "Você", created_at: new Date().toISOString() };
    db.contagens_estoque.unshift(c);
    for (const id of p_produtos as string[]) {
      const s = db.estoque_unidade?.find((x) => x.produto_id === id && x.unidade_id === p_unidade);
      db.contagem_itens.push({ id: uid(), contagem_id: c.id, produto_id: id, saldo_sistema: Number(s?.quantidade ?? 0), contado: null, justificativa: null });
    }
    return { data: c.id, error: null };
  },
  concluir_contagem: ({ p_contagem }) => {
    const c = db.contagens_estoque.find((x) => x.id === p_contagem);
    if (!c || c.status !== "aberta") return { data: null, error: { message: "contagem não está aberta" } };
    let ajustes = 0, contados = 0;
    for (const i of db.contagem_itens.filter((x) => x.contagem_id === p_contagem && x.contado != null)) {
      contados++;
      const atual = Number(db.estoque_unidade?.find((x) => x.produto_id === i.produto_id && x.unidade_id === c.unidade_id)?.quantidade ?? 0);
      const dif = Number(i.contado) - atual;
      if (!dif) continue;
      if (!i.justificativa) return { data: null, error: { message: `justifique a divergência de "${db.produtos.find((p) => p.id === i.produto_id)?.descricao}" antes de concluir` } };
      movimentar(i.produto_id, "ajuste", dif, `Contagem nº ${c.numero}: ${i.justificativa}`, { unidade_id: c.unidade_id });
      ajustes++;
    }
    if (!contados) return { data: null, error: { message: "nenhum item foi contado" } };
    Object.assign(c, { status: "concluida", ajustes, concluida_em: new Date().toISOString(), concluida_nome: "Você" });
    return { data: { ajustes, contados }, error: null };
  },
  cancelar_contagem: ({ p_contagem }) => {
    const c = db.contagens_estoque.find((x) => x.id === p_contagem);
    if (c) c.status = "cancelada";
    return { data: null, error: null };
  },
  importar_contatos: ({ p_itens }) => {
    const r = { clientes: 0, fornecedores: 0, transportadoras: 0, atualizados: 0 };
    const tabelas = { cliente: ["clientes", "cpf_cnpj"], fornecedor: ["fornecedores", "cnpj"], transportadora: ["transportadoras", "cnpj"] } as const;
    for (const it of p_itens as Row[]) {
      if (!it.nome) continue;
      for (const t of (it.tipos?.length ? it.tipos : ["cliente"]) as (keyof typeof tabelas)[]) {
        const [tabela, doc] = tabelas[t];
        const lista = db[tabela] as Row[];
        let c = lista.find((x) => (it.id_externo && x.id_externo === it.id_externo) || (it.cpf_cnpj && x[doc] === it.cpf_cnpj)
          || (!it.id_externo && !it.cpf_cnpj && x.nome.trim().toLowerCase() === it.nome.trim().toLowerCase()));
        if (!c) {
          c = { id: uid(), codigo: lista.reduce((m, x) => Math.max(m, Number(x.codigo ?? 0)), 0) + 1, created_at: quando(0), ...(t === "transportadora" ? { ativo: true } : {}) };
          lista.push(c);
          r[tabela] += 1;
        } else r.atualizados++;
        Object.assign(c, Object.fromEntries(Object.entries({
          id_externo: it.id_externo, nome: it.nome, nome_fantasia: it.fantasia, [doc]: it.cpf_cnpj, inscricao_estadual: it.ie,
          email: it.email, telefone: it.fone, whatsapp: it.celular, cep: it.cep, logradouro: it.endereco, numero: it.numero,
          complemento: it.complemento, bairro: it.bairro, municipio: it.cidade, uf: it.uf,
        }).filter(([, v]) => v !== "" && v != null)));
      }
    }
    return { data: r, error: null };
  },
  importar_produtos: ({ p_itens, p_unidade, p_lancar_estoque }) => {
    const r = { criados: 0, atualizados: 0, fornecedores_criados: 0, com_estoque: 0, negativos: 0 };
    for (const it of p_itens as Row[]) {
      let forn: Row | undefined;
      if (it.fornecedor) {
        forn = db.fornecedores.find((x) => x.nome.trim().toLowerCase() === it.fornecedor.trim().toLowerCase());
        if (!forn) { forn = { id: uid(), nome: it.fornecedor, ativo: true, created_at: quando(0) }; db.fornecedores.push(forn); r.fornecedores_criados++; }
      }
      let p = db.produtos.find((x) => (it.id_externo && x.id_externo === it.id_externo) || (it.sku && x.sku === it.sku));
      const novo = !p;
      if (!p) { p = { id: uid(), estoque_atual: 0, no_catalogo: false, created_at: quando(0) }; db.produtos.push(p); r.criados++; } else r.atualizados++;
      const { estoque, foto, fornecedor: _f, codigo_fornecedor, ...campos } = it;
      Object.assign(p, Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== "" && v !== null)), {
        foto_caminho: p.foto_caminho || foto || null, fornecedor_padrao_id: forn?.id ?? p.fornecedor_padrao_id ?? null,
        descricao_catalogo: p.descricao_catalogo || it.descricao_catalogo || null,
      });
      if (forn && codigo_fornecedor && !db.produto_fornecedor?.some((v) => v.fornecedor_id === forn!.id && v.codigo_fornecedor === codigo_fornecedor)) {
        (db.produto_fornecedor ??= []).push({ id: uid(), fornecedor_id: forn.id, codigo_fornecedor, produto_id: p.id, fator_conversao: 1 });
      }
      if (estoque < 0) r.negativos++;
      if (novo && p_lancar_estoque && estoque > 0) { movimentar(p.id, "entrada", estoque, "Saldo inicial (importação)", { unidade_id: p_unidade, referencia_tipo: "manual" }); r.com_estoque++; }
    }
    return { data: r, error: null };
  },
  marcar_proposta_enviada: ({ p_pedido }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p || p.status !== "orcamento") return erro("só orçamentos viram proposta");
    recalcular(db);
    if (p.valor_total <= 0) return erro("adicione os itens antes de enviar");
    Object.assign(p, { proposta_status: "enviada", proposta_enviada_em: quando(0), proposta_visualizada_em: null, proposta_respondida_em: null, motivo_rejeicao: null, motivo_rejeicao_texto: null,
      proposta_validade: p.proposta_validade && p.proposta_validade >= hojeISO() ? p.proposta_validade : dias(db.configuracoes[0].validade_orcamento_dias ?? 7) });
    p.proposta_token ??= uid();
    // na prévia o "cliente" abre a proposta logo depois
    setTimeout(() => { if (p.proposta_status === "enviada") { Object.assign(p, { proposta_status: "visualizada", proposta_visualizada_em: quando(0) });
      notificarDemo("proposta", `Proposta #${p.numero} aberta pelo cliente`, db.clientes.find((c) => c.id === p.cliente_id)?.nome ?? "", "/pedidos", ["vendas"]); } }, 6000);
    return { data: p.proposta_token, error: null };
  },
  proposta_publica: ({ p_token }) => {
    const p = db.pedidos.find((x) => x.proposta_token === p_token && x.proposta_status);
    if (!p) return { data: null, error: null };
    const cfg = db.configuracoes[0];
    if (p.proposta_status === "enviada") Object.assign(p, { proposta_status: "visualizada", proposta_visualizada_em: quando(0) });
    return { error: null, data: {
      numero: p.numero, data: p.proposta_enviada_em, validade: p.proposta_validade, status: p.proposta_status, pedido_status: p.status,
      cliente: db.clientes.find((c) => c.id === p.cliente_id)?.nome, vendedor: db.vendedores.find((v) => v.id === p.vendedor_id)?.nome ?? p.vendedor,
      itens: db.pedido_itens.filter((i) => i.pedido_id === p.id).map((i) => { const pr = db.produtos.find((x) => x.id === i.produto_id); return {
        descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario, total: i.quantidade * i.valor_unitario, foto: cfg.proposta_fotos ? pr?.foto_caminho ?? null : null,
        texto: pr?.descricao_catalogo ?? null, garantia_meses: pr?.tipo === "maquina" ? pr.garantia_meses ?? cfg.garantia_meses_padrao : null }; }),
      subtotal: p.valor_produtos, desconto: p.desconto, frete: p.frete, total: p.valor_total, forma_pagamento: p.forma_pagamento, parcelas: p.parcelas, observacoes: p.observacoes ?? null,
      motivo_rejeicao: p.motivo_rejeicao ?? null,
      empresa: { nome: cfg.nome_fantasia, razao_social: cfg.razao_social, cnpj: cfg.cnpj, whatsapp: cfg.whatsapp, telefone: cfg.telefone, email: cfg.email, endereco: cfg.endereco, municipio: cfg.municipio, uf: cfg.uf, termo_garantia: cfg.termo_garantia },
      layout: { titulo: cfg.proposta_titulo, apresentacao: cfg.proposta_apresentacao, condicoes: cfg.proposta_condicoes, rodape: cfg.proposta_rodape, cor: cfg.proposta_cor },
    } };
  },
  proposta_responder: ({ p_token, p_aprovar, p_nome, p_motivo, p_texto }) => {
    const p = db.pedidos.find((x) => x.proposta_token === p_token);
    if (!p || !["enviada", "visualizada"].includes(p.proposta_status) || p.status !== "orcamento") return erro("esta proposta já foi respondida");
    if (!String(p_nome ?? "").trim()) return erro("informe o seu nome");
    const cli = db.clientes.find((c) => c.id === p.cliente_id)?.nome ?? "";
    Object.assign(p, { proposta_respondida_em: quando(0), proposta_resposta_nome: p_nome.trim() });
    if (p_aprovar) {
      p.proposta_status = "aprovada";
      rpcs.aprovar_pedido({ p_pedido: p.id });
      notificarDemo("proposta", `Proposta #${p.numero} APROVADA`, `${cli} · ${brlDemo(p.valor_total)} · virou pedido`, "/pedidos", ["vendas", "financeiro"]);
      return { data: "aprovada", error: null };
    }
    Object.assign(p, { proposta_status: "rejeitada", motivo_rejeicao: p_motivo ?? "outro", motivo_rejeicao_texto: p_texto ?? null });
    notificarDemo("proposta", `Proposta #${p.numero} recusada`, cli, "/pedidos", ["vendas"]);
    return { data: "rejeitada", error: null };
  },
  avancar_expedicao: ({ p_expedicao, p_etapa, p_dados = {} }) => {
    const ordem = ["separar", "separando", "conferido", "embalado", "despachado", "entregue"];
    const e = db.expedicoes.find((x) => x.id === p_expedicao);
    if (!e || e.status === "cancelada") return erro("expedição não encontrada ou cancelada");
    if (ordem.indexOf(p_etapa) < ordem.indexOf(e.status)) return erro("a expedição já passou desta etapa");
    const p = db.pedidos.find((x) => x.id === e.pedido_id)!;
    if (p_etapa === "conferido" && (p_dados.itens_conferidos ?? e.itens_conferidos).length < db.pedido_itens.filter((i) => i.pedido_id === p.id).length) return erro("confira todos os itens antes de concluir a conferência");
    if (p_etapa === "embalado" && !(p_dados.volumes ?? e.volumes)) return erro("informe a quantidade de volumes");
    if (p_etapa === "despachado" && !db.notas_fiscais.some((n) => n.pedido_id === p.id && n.status === "autorizada")) return erro("o pedido ainda não tem NF-e autorizada: emita a nota antes de despachar");
    for (const k of ["itens_conferidos", "volumes", "peso_kg", "transportadora_id", "codigo_rastreio", "responsavel", "observacoes"]) if (p_dados[k] != null && p_dados[k] !== "") e[k] = p_dados[k];
    e.status = p_etapa;
    e[`${p_etapa === "separando" ? "separando" : p_etapa}_em`] = quando(0);
    if (p_etapa === "despachado") {
      Object.assign(p, { transportadora_id: e.transportadora_id, codigo_rastreio: e.codigo_rastreio, volumes: e.volumes, peso_total_kg: e.peso_kg, enviado_em: hojeISO() });
      if (e.codigo_rastreio) notificarDemo("outro", `Pedido #${p.numero} despachado`, `Rastreio ${e.codigo_rastreio} enviado ao cliente por e-mail`, "/fluxo", ["vendas"]);
    }
    if (p_etapa === "entregue" && ["aprovado", "faturado"].includes(p.status)) p.status = "entregue";
    return { data: null, error: null };
  },
  garantir_fechamento: ({ p_unidade, p_competencia }) => {
    db.fechamentos ??= [];
    let f = db.fechamentos.find((x) => x.unidade_id === p_unidade && x.competencia === p_competencia);
    if (!f) { f = { id: uid(), unidade_id: p_unidade, competencia: p_competencia, status: "aberto", created_at: quando(0) }; db.fechamentos.push(f); }
    return { data: f.id, error: null };
  },
  fechar_competencia: ({ p_unidade, p_competencia, p_observacoes }) => {
    if (p_competencia >= new Date().toISOString().slice(0, 7)) return erro("só dá para fechar meses que já terminaram");
    const id = rpcs.garantir_fechamento({ p_unidade, p_competencia }).data;
    Object.assign(db.fechamentos.find((x) => x.id === id)!, { status: "fechado", fechado_em: quando(0), observacoes: p_observacoes ?? null });
    notificarDemo("outro", `Mês ${p_competencia.split("-").reverse().join("/")} fechado pelo contador`, "", "/contador", ["financeiro"]);
    return { data: null, error: null };
  },
  reabrir_competencia: ({ p_unidade, p_competencia }) => {
    const f = db.fechamentos.find((x) => x.unidade_id === p_unidade && x.competencia === p_competencia);
    if (f) Object.assign(f, { status: f.enviado_em ? "enviado" : "aberto", fechado_em: null });
    return { data: null, error: null };
  },
  gerar_pagamento_comissoes: ({ p_ids, p_vencimento }) => {
    const sel = db.comissoes.filter((c) => p_ids.includes(c.id) && c.status === "a_pagar" && !c.conta_pagar_id);
    if (!sel.length) return erro("nenhuma comissão a pagar selecionada");
    if (new Set(sel.map((c) => c.vendedor_id)).size > 1) return erro("escolha comissões de um vendedor por vez");
    const v = db.vendedores.find((x) => x.id === sel[0].vendedor_id)!;
    const conta = { id: uid(), descricao: `Comissão ${v.nome} (${sel.length} lançamento${sel.length > 1 ? "s" : ""})`, categoria: "comissoes", valor: r2(sel.reduce((s, c) => s + c.valor, 0)),
      vencimento: p_vencimento, status: "aberto", unidade_id: U_SC, observacoes: "Gerado pelo ERP a partir das comissões", created_at: quando(0) };
    db.contas_pagar.push(conta);
    sel.forEach((c) => (c.conta_pagar_id = conta.id));
    return { data: conta.id, error: null };
  },
  definir_minha_unidade: ({ p_unidade }) => {
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.unidade_id = p_unidade;
    return { data: null, error: null };
  },
  enviar_transferencia: ({ p_transf }) => {
    const t = db.transferencias.find((x) => x.id === p_transf);
    if (!t || t.status !== "rascunho") return erro("só rascunhos podem ser enviados");
    const itens = db.transferencia_itens.filter((i) => i.transferencia_id === t.id);
    if (!itens.length) return erro("transferência sem itens");
    const faltas = itens.filter((i) => saldoUn(i.produto_id, t.origem_id) < i.quantidade).map((i) => `${i.descricao} (tem ${saldoUn(i.produto_id, t.origem_id)})`);
    if (faltas.length) return erro(`estoque insuficiente na origem: ${faltas.join(", ")}`);
    for (const i of itens) movimentar(i.produto_id, "saida", i.quantidade, `Transferência #${t.numero} (envio)`, { unidade_id: t.origem_id, numero_serie: i.numero_serie });
    Object.assign(t, { status: "enviada", enviada_em: quando(0) });
    return { data: null, error: null };
  },
  receber_transferencia: ({ p_transf }) => {
    const t = db.transferencias.find((x) => x.id === p_transf);
    if (!t || t.status !== "enviada") return erro("só transferências enviadas podem ser recebidas");
    for (const i of db.transferencia_itens.filter((x) => x.transferencia_id === t.id)) movimentar(i.produto_id, "entrada", i.quantidade, `Transferência #${t.numero} (recebimento)`, { unidade_id: t.destino_id, numero_serie: i.numero_serie });
    Object.assign(t, { status: "recebida", recebida_em: quando(0) });
    return { data: null, error: null };
  },
  cancelar_transferencia: ({ p_transf }) => {
    const t = db.transferencias.find((x) => x.id === p_transf);
    if (!t || ["recebida", "cancelada"].includes(t.status)) return erro("transferência já finalizada");
    if (t.status === "enviada") for (const i of db.transferencia_itens.filter((x) => x.transferencia_id === t.id)) movimentar(i.produto_id, "entrada", i.quantidade, `Transferência #${t.numero} (cancelada)`, { unidade_id: t.origem_id });
    t.status = "cancelada";
    return { data: null, error: null };
  },
  loja_dados: () => {
    const c = db.configuracoes[0];
    const ordem: Record<string, number> = { maquina: 0, acessorio: 1, peca: 2, insumo: 3 };
    return {
      error: null,
      data: {
        empresa: { nome: c.nome_fantasia, whatsapp: c.whatsapp, telefone: c.telefone, email: c.email, endereco: c.endereco, municipio: c.municipio, uf: c.uf, texto: c.catalogo_texto },
        produtos: db.produtos.filter((p) => p.ativo && p.no_catalogo && p.foto_caminho && p.preco_venda > 0)
          .sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9) || a.descricao.localeCompare(b.descricao))
          .map((p) => ({
            id: p.id, sku: p.sku, nome: p.descricao, descricao: p.descricao_catalogo, tipo: p.tipo, preco: p.preco_venda, foto: p.foto_caminho,
            disponibilidade: p.estoque_atual > 0 ? "in stock" : p.tipo === "maquina" ? "available for order" : "out of stock",
            garantia_meses: p.garantia_meses ?? c.garantia_meses_padrao,
          })),
      },
    };
  },
  telegram_gerar_vinculo: () => {
    // demonstração: conecta na hora (no sistema real, depois de tocar em INICIAR no Telegram)
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.telegram_chat_id = 9000 + Math.floor(Math.random() * 999);
    return { data: "demo", error: null };
  },
  telegram_desconectar: () => {
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.telegram_chat_id = null;
    return { data: null, error: null };
  },
  salvar_meus_avisos: ({ p_avisos }) => {
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.avisos = p_avisos;
    return { data: null, error: null };
  },
  reivindicar_primeiro_admin: () => ({ data: false, error: null }),
  aprovar_pedido: ({ p_pedido }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p || p.status !== "orcamento") return erro("só orçamentos podem ser aprovados");
    recalcular(db);
    const itensPed = db.pedido_itens.filter((x) => x.pedido_id === p.id);
    const valorItens = itensPed.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
    if (valorItens <= 0) return erro("pedido sem itens");
    if (p.valor_total <= 0) return erro(`o desconto (${brlDemo(Number(p.desconto ?? 0))}) é maior que o valor dos itens (${brlDemo(valorItens)})`);
    if (!(p.parcelas >= 1 && p.parcelas <= 24)) return erro("número de parcelas deve ser de 1 a 24");
    if (!db.configuracoes[0].vender_sem_estoque) {
      const precisa = new Map<string, number>();
      for (const i of itensPed) {
        if (db.produtos.find((x) => x.id === i.produto_id)?.kit) {
          const doKit = (db.kit_componentes ?? []).filter((c) => c.kit_id === i.produto_id);
          const comp = i.kit_escolha?.length ? i.kit_escolha : doKit.filter((c) => c.padrao).map((c) => ({ componente_id: c.componente_id, quantidade: c.quantidade }));
          for (const c of comp) precisa.set(c.componente_id, (precisa.get(c.componente_id) ?? 0) + c.quantidade * i.quantidade);
        } else precisa.set(i.produto_id, (precisa.get(i.produto_id) ?? 0) + Number(i.quantidade));
      }
      const faltas = [...precisa].flatMap(([id, qtd]) => {
        const pr = db.produtos.find((x) => x.id === id);
        const tem = Number(db.estoque_unidade.find((e) => e.produto_id === id && e.unidade_id === p.unidade_id)?.quantidade ?? 0);
        return pr && !pr.sob_encomenda && tem < qtd ? [`${pr.descricao} (pedido ${qtd}, estoque ${tem})`] : [];
      });
      if (faltas.length) return erro(`estoque insuficiente nesta unidade: ${faltas.join("; ")}. Transfira estoque, marque o produto como sob encomenda ou libere "vender sem estoque" nas configurações`);
    }
    for (const i of itensPed) {
      const ref = { unidade_id: p.unidade_id, referencia_tipo: "pedido", referencia_id: p.id };
      if (db.produtos.find((x) => x.id === i.produto_id)?.kit) {
        const doKit = (db.kit_componentes ?? []).filter((c) => c.kit_id === i.produto_id);
        const comp = i.kit_escolha?.length ? i.kit_escolha : doKit.filter((c) => c.padrao).map((c) => ({ componente_id: c.componente_id, quantidade: c.quantidade }));
        for (const c of comp) movimentar(c.componente_id, "saida", c.quantidade * i.quantidade, `Pedido #${p.numero} (kit ${i.descricao})`, ref);
      } else movimentar(i.produto_id, "saida", i.quantidade, `Pedido #${p.numero}`, ref);
    }
    const base = p.primeiro_vencimento ? new Date(p.primeiro_vencimento + "T12:00:00") : new Date(Date.now() + 3 * 864e5);
    const parcela = r2(p.valor_total / p.parcelas);
    for (let n = 1; n <= p.parcelas; n++) {
      db.contas_receber.push({
        id: uid(), descricao: `Pedido #${p.numero} - parcela ${n}/${p.parcelas}`, cliente_id: p.cliente_id, pedido_id: p.id, unidade_id: p.unidade_id,
        parcela: n, total_parcelas: p.parcelas, status: "aberto", forma_pagamento: p.forma_pagamento,
        valor: n === p.parcelas ? r2(p.valor_total - parcela * (p.parcelas - 1)) : parcela,
        vencimento: new Date(base.getTime() + (n - 1) * p.intervalo_dias * 864e5).toISOString().slice(0, 10),
      });
    }
    Object.assign(p, { status: "aprovado", estoque_baixado: true, aprovado_em: quando(0) });
    if (db.vendedores?.find((v) => v.id === p.vendedor_id)?.base === "faturamento") comissaoDemo(p, p.valor_total, null, `Pedido #${p.numero}`);
    expedicaoDemo(p, "aprovacao");
    // NF-e automática (na prévia: na hora, para qualquer canal)
    if (db.configuracoes[0].nfe_automatica) setTimeout(() => { if (!db.notas_fiscais.some((n) => n.pedido_id === p.id)) funcoes["nfe-emitir"]({ pedido_id: p.id }); }, 800);
    const cfg = db.configuracoes[0];
    for (const i of db.pedido_itens.filter((x) => x.pedido_id === p.id)) {
      const prod = db.produtos.find((x) => x.id === i.produto_id);
      if (prod?.tipo !== "maquina") continue;
      const series = String(i.numero_serie ?? "").split(/\s*[,/;]\s*/);
      for (let n = 0; n < Math.max(1, i.quantidade); n++) {
        db.equipamentos.push({
          id: uid(), cliente_id: p.cliente_id, produto_id: prod.id, descricao: i.descricao, numero_serie: series[n] || null, pedido_id: p.id,
          data_venda: hojeISO(), garantia_ate: dias(30.4 * (prod.garantia_meses ?? cfg.garantia_meses_padrao)), proxima_preventiva: dias(30.4 * cfg.preventiva_meses),
        });
      }
    }
    return { data: null, error: null };
  },
  cancelar_pedido: ({ p_pedido }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p) return erro("pedido não encontrado");
    if (db.notas_fiscais.some((n) => n.pedido_id === p.id && n.status === "autorizada")) return erro("pedido possui NF-e autorizada; cancele a nota antes");
    if (p.estoque_baixado) {
      const saiu = new Map<string, number>();
      for (const m of db.estoque_movimentos.filter((m) => m.referencia_tipo === "pedido" && m.referencia_id === p.id)) {
        saiu.set(m.produto_id, (saiu.get(m.produto_id) ?? 0) + (m.tipo === "saida" ? Math.abs(m.quantidade) : -Math.abs(m.quantidade)));
      }
      if (!saiu.size) for (const i of db.pedido_itens.filter((x) => x.pedido_id === p.id)) saiu.set(i.produto_id, i.quantidade); // pedidos de exemplo
      for (const [prod, q] of saiu) if (q > 0) movimentar(prod, "entrada", q, `Cancelamento pedido #${p.numero}`, { unidade_id: p.unidade_id, referencia_tipo: "pedido", referencia_id: p.id });
    }
    (db.comissoes ?? []).filter((c) => c.pedido_id === p.id && c.status === "a_pagar" && !c.conta_pagar_id).forEach((c) => (c.status = "cancelada"));
    (db.expedicoes ?? []).filter((e) => e.pedido_id === p.id && !["despachado", "entregue"].includes(e.status)).forEach((e) => (e.status = "cancelada"));
    db.contas_receber.filter((c) => c.pedido_id === p.id && c.status === "aberto").forEach((c) => (c.status = "cancelado"));
    Object.assign(p, { status: "cancelado", estoque_baixado: false });
    return { data: null, error: null };
  },
  marcar_notas: ({ p_tabela, p_ids, p_adicionar, p_remover }) => {
    const linhas = (db[p_tabela] ?? []).filter((n: Row) => p_ids.includes(n.id) && !n.excluida_em);
    for (const n of linhas) {
      const antes = { ...n };
      n.marcadores = [...new Set([...(n.marcadores ?? []), ...(p_adicionar ?? [])])].filter((x) => !(p_remover ?? []).includes(x));
      registrarDemo(p_tabela, "update", antes, n, null, "usuario");
    }
    return { data: linhas.length, error: null };
  },
  anotar_nota: ({ p_tabela, p_id, p_texto }) => {
    const n = (db[p_tabela] ?? []).find((x: Row) => x.id === p_id);
    if (n) { const antes = { ...n }; n.observacao_interna = String(p_texto ?? "").trim() || null; registrarDemo(p_tabela, "update", antes, n, null, "usuario"); }
    return { data: null, error: null };
  },
  excluir_nota: ({ p_tabela, p_id, p_motivo }) => {
    const n = (db[p_tabela] ?? []).find((x: Row) => x.id === p_id);
    if (!n) return erro("nota não encontrada");
    if (String(p_motivo ?? "").trim().length < 5) return erro("informe o motivo da exclusão (mínimo 5 letras)");
    if (p_tabela === "notas_fiscais" && !(n.status === "erro" || n.ambiente === "homologacao" || n.origem === "importada")) return erro("só dá para excluir nota rejeitada, de teste ou importada. Nota autorizada se cancela (até 24 h) ou se corrige com NF de devolução");
    if (p_tabela === "nfe_recebidas" && n.estoque_lancado) return erro("a entrada desta nota já foi lançada no estoque: estorne a entrada antes de excluir");
    if (p_tabela === "nfe_recebidas" && db.contas_pagar.some((c) => c.nfe_recebida_id === n.id && c.status !== "cancelado")) return erro("a nota tem contas a pagar lançadas: cancele as contas (com motivo) antes de excluir");
    const antes = { ...n };
    Object.assign(n, { excluida_em: quando(0), excluida_por: sessao?.user.id, excluida_motivo: String(p_motivo).trim() });
    registrarDemo(p_tabela, "update", antes, n, n.excluida_motivo, "usuario");
    return { data: null, error: null };
  },
  restaurar_nota: ({ p_tabela, p_id }) => {
    const n = (db[p_tabela] ?? []).find((x: Row) => x.id === p_id);
    if (n) Object.assign(n, { excluida_em: null, excluida_por: null, excluida_motivo: null });
    return { data: null, error: null };
  },
  notas_excluidas: ({ p_tabela }) => ({
    data: (db[p_tabela] ?? []).filter((n: Row) => n.excluida_em).map((n: Row) => ({
      id: n.id, numero: n.numero ?? (n.chave ? n.chave.slice(25, 34).replace(/^0+/, "") : null), chave: n.chave, nome: n.destinatario_nome ?? n.emitente_nome ?? null,
      valor: n.valor_total, status: n.status ?? n.situacao, emissao: n.created_at ?? n.data_emissao, excluida_em: n.excluida_em, excluida_motivo: n.excluida_motivo,
      excluida_por: db.usuarios_erp.find((u) => u.user_id === n.excluida_por)?.nome ?? null,
    })),
    error: null,
  }),
  usuarios_vendedores: () => ({
    data: db.usuarios_erp.filter((u) => u.ativo !== false && ["admin", "vendas", "financeiro"].includes(u.papel))
      .map((u) => ({ user_id: u.user_id, nome: u.nome, papel: u.papel, vendedor_id: db.vendedores.find((v) => v.user_id === u.user_id)?.id ?? null })),
    error: null,
  }),
  vendedor_do_usuario: ({ p_user }) => {
    const ja = db.vendedores.find((v) => v.user_id === p_user);
    if (ja) return { data: ja.id, error: null };
    const u = db.usuarios_erp.find((x) => x.user_id === p_user);
    if (!u) return erro("usuário não encontrado ou inativo");
    const novo = { id: uid(), nome: u.nome, tipo: "vendedor", user_id: p_user, percentual: Number(db.configuracoes[0].comissao_percentual ?? 0), base: "recebimento", descontar_frete: true, ativo: true, created_at: quando(0) };
    db.vendedores.push(novo);
    registrarDemo("vendedores", "insert", null, novo, null, "usuario");
    return { data: novo.id, error: null };
  },
  editar_pedido_aprovado: ({ p_pedido, p_dados, p_motivo }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p) return erro("pedido não encontrado");
    if (String(p_motivo ?? "").trim().length < 5) return erro("informe o motivo da alteração (mínimo 5 letras)");
    if (p.status === "cancelado" || p.status === "orcamento") return erro("só pedidos aprovados");
    const antes = { ...p };
    const vend = p_dados.vendedor_id || null, pct = p_dados.comissao_percentual === "" || p_dados.comissao_percentual == null ? null : Number(p_dados.comissao_percentual);
    Object.assign(p, { vendedor_id: vend, vendedor: vend !== antes.vendedor_id ? db.vendedores.find((v) => v.id === vend)?.nome ?? null : p.vendedor, comissao_percentual: vend ? pct : null,
      origem: p_dados.origem || p.origem, observacoes: p_dados.observacoes || null });
    registrarDemo("pedidos", "update", antes, p, String(p_motivo).trim(), "usuario");
    if (vend !== antes.vendedor_id || p.comissao_percentual !== antes.comissao_percentual) {
      (db.comissoes ?? []).filter((c) => c.pedido_id === p.id && c.status === "a_pagar" && !c.conta_pagar_id).forEach((c) => Object.assign(c, { status: "cancelada", conta_receber_id: null }));
      const v = db.vendedores.find((x) => x.id === vend);
      if (v?.base === "faturamento") comissaoDemo(p, p.valor_total, null, `Pedido #${p.numero}`);
      else if (v) for (const c of db.contas_receber.filter((c) => c.pedido_id === p.id && c.status === "pago")) comissaoDemo(p, Number(c.valor_pago ?? c.valor), c.id, c.descricao);
    }
    return { data: null, error: null };
  },
  reabrir_pedido: ({ p_pedido, p_motivo }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p) return erro("pedido não encontrado");
    const motivo = String(p_motivo ?? "").trim();
    if (motivo.length < 5) return erro("informe o motivo para reabrir o pedido (mínimo 5 letras)");
    if (!["aprovado", "faturado", "entregue"].includes(p.status)) return erro("só pedidos aprovados, faturados ou entregues podem ser reabertos");
    if (db.notas_fiscais.some((n) => n.pedido_id === p.id && n.ambiente !== "homologacao" && ["autorizada", "processando", "contingencia"].includes(n.status))) return erro("o pedido tem NF-e válida: cancele a nota ou emita uma NF de devolução antes de reabrir");
    if (db.contas_receber.some((c) => c.pedido_id === p.id && c.status === "pago")) return erro("o pedido tem parcela recebida: estorne o recebimento antes de reabrir");
    const antes = { ...p };
    const saiu = new Map<string, number>();
    for (const m of db.estoque_movimentos.filter((m) => m.referencia_tipo === "pedido" && m.referencia_id === p.id)) {
      saiu.set(m.produto_id, (saiu.get(m.produto_id) ?? 0) + (m.tipo === "saida" ? Math.abs(m.quantidade) : -Math.abs(m.quantidade)));
    }
    for (const [prod, q] of saiu) if (q > 0) movimentar(prod, "entrada", q, `Pedido #${p.numero} reaberto: ${motivo}`, { unidade_id: p.unidade_id, referencia_tipo: "pedido", referencia_id: p.id });
    (db.comissoes ?? []).filter((c) => c.pedido_id === p.id && c.status === "a_pagar" && !c.conta_pagar_id).forEach((c) => Object.assign(c, { status: "cancelada", conta_receber_id: null }));
    (db.expedicoes ?? []).filter((e) => e.pedido_id === p.id && !["despachado", "entregue"].includes(e.status)).forEach((e) => (e.status = "cancelada"));
    for (const c of db.contas_receber.filter((c) => c.pedido_id === p.id && c.status === "aberto")) {
      const a = { ...c };
      c.status = "cancelado";
      registrarDemo("contas_receber", "update", a, c, `Pedido #${p.numero} reaberto: ${motivo}`, "usuario");
    }
    Object.assign(p, { status: "orcamento", estoque_baixado: false, aprovado_em: null, reaberto_em: quando(0) });
    registrarDemo("pedidos", "update", antes, p, `Reaberto: ${motivo}`, "usuario");
    return { data: null, error: null };
  },
  concluir_os: ({ p_os }) => {
    const o = db.ordens_servico.find((x) => x.id === p_os);
    if (!o) return erro("OS não encontrada");
    if (!o.estoque_baixado) for (const i of db.os_itens.filter((x) => x.os_id === o.id)) movimentar(i.produto_id, "saida", i.quantidade, `OS #${o.numero}`, { unidade_id: o.unidade_id });
    recalcular(db);
    if (o.valor_total > 0) db.contas_receber.push({ id: uid(), descricao: `Assistência técnica OS #${o.numero}`, cliente_id: o.cliente_id, os_id: o.id, unidade_id: o.unidade_id, parcela: 1, total_parcelas: 1, valor: o.valor_total, vencimento: dias(3), status: "aberto", forma_pagamento: "boleto" });
    Object.assign(o, { status: "concluida", concluida_em: quando(0), estoque_baixado: true });
    const eq = db.equipamentos.find((e) => e.id === o.equipamento_id);
    if (eq) Object.assign(eq, { proxima_preventiva: dias(30.4 * db.configuracoes[0].preventiva_meses), ultimo_contato: hojeISO() });
    return { data: null, error: null };
  },
  receber_pedido_compra: ({ p_pedido, p_itens, p_gerar_conta, p_vencimento }) => {
    const pc = db.pedidos_compra.find((x) => x.id === p_pedido);
    if (!pc || ["recebido", "cancelado"].includes(pc.status)) return erro("pedido já finalizado");
    let valor = 0;
    for (const it of p_itens) {
      const item = db.pedido_compra_itens.find((i) => i.id === it.item_id);
      const q = Number(it.quantidade) || 0;
      if (!item || q <= 0) continue;
      if (item.quantidade_recebida + q > item.quantidade) return erro(`quantidade recebida maior que a pedida em ${item.descricao}`);
      movimentar(item.produto_id, "entrada", q, `Pedido de compra #${pc.numero}`, { unidade_id: pc.unidade_id });
      if (item.custo_unitario > 0) db.produtos.find((p) => p.id === item.produto_id)!.preco_custo = item.custo_unitario;
      item.quantidade_recebida += q;
      valor += q * item.custo_unitario;
    }
    const completo = db.pedido_compra_itens.filter((i) => i.pedido_compra_id === pc.id).every((i) => i.quantidade_recebida >= i.quantidade);
    pc.status = completo ? "recebido" : "parcial";
    if (completo) pc.recebido_em = quando(0);
    if (p_gerar_conta && valor > 0) {
      db.contas_pagar.push({ id: uid(), descricao: `Pedido de compra #${pc.numero}`, fornecedor_id: pc.fornecedor_id, unidade_id: pc.unidade_id, categoria: "fornecedores", documento: `PC ${pc.numero}`, valor: r2(valor + (completo ? Number(pc.frete || 0) : 0)), vencimento: p_vencimento ?? dias(30), status: "aberto" });
    }
    return { data: pc.status, error: null };
  },
  concluir_producao: ({ p_ordem }) => {
    const op = db.ordens_producao.find((x) => x.id === p_ordem);
    if (!op || ["concluida", "cancelada"].includes(op.status)) return erro("ordem já finalizada");
    const comps = db.produto_componentes.filter((c) => c.produto_id === op.produto_id);
    if (!comps.length) return erro("cadastre a ficha técnica da máquina antes de concluir a produção");
    const faltas = comps.map((c) => ({ c, p: db.produtos.find((x) => x.id === c.componente_id)! }))
      .filter(({ c, p }) => saldoUn(p.id, op.unidade_id) < c.quantidade * op.quantidade)
      .map(({ c, p }) => `${p.descricao} (falta ${c.quantidade * op.quantidade - saldoUn(p.id, op.unidade_id)})`);
    if (faltas.length) return erro(`peças insuficientes no estoque desta unidade: ${faltas.join(", ")}`);
    for (const c of comps) movimentar(c.componente_id, "saida", c.quantidade * op.quantidade, `Produção OP #${op.numero}`, { unidade_id: op.unidade_id });
    movimentar(op.produto_id, "entrada", op.quantidade, `Produção OP #${op.numero}`, { unidade_id: op.unidade_id });
    db.produtos.find((p) => p.id === op.produto_id)!.preco_custo = r2(comps.reduce((s, c) => s + c.quantidade * db.produtos.find((p) => p.id === c.componente_id)!.preco_custo, 0));
    Object.assign(op, { status: "concluida", concluida_em: quando(0) });
    return { data: null, error: null };
  },
  lancar_contas_nota: ({ p_nota, p_parcelas = 1, p_primeiro, p_intervalo = 30, p_forma = "boleto" }) => {
    const n = db.notas_fiscais.find((x) => x.id === p_nota);
    if (!n || n.status !== "autorizada") return erro("só depois que a nota for autorizada");
    if (db.contas_receber.some((c) => c.nota_fiscal_id === p_nota && c.status !== "cancelado")) return erro("as contas desta nota já foram lançadas");
    const parc = r2(n.valor_total / p_parcelas);
    for (let k = 1; k <= p_parcelas; k++) {
      const venc = new Date(Date.parse((p_primeiro ?? hojeISO()) + "T12:00:00Z") + (k - 1) * p_intervalo * 864e5).toISOString().slice(0, 10);
      db.contas_receber.push({ id: uid(), descricao: `NF-e ${n.numero}${p_parcelas > 1 ? ` - parcela ${k}/${p_parcelas}` : ""}`, cliente_id: n.cliente_id, valor: k === p_parcelas ? r2(n.valor_total - parc * (p_parcelas - 1)) : parc,
        vencimento: venc, forma_pagamento: p_forma, unidade_id: n.unidade_id, categoria: "vendas", parcela: k, total_parcelas: p_parcelas, status: "aberto", nota_fiscal_id: n.id, created_at: quando(0) });
    }
    return { data: p_parcelas, error: null };
  },
  estoque_nota_direta: ({ p_nota, p_estornar = false }) => {
    const n = db.notas_fiscais.find((x) => x.id === p_nota);
    if (!n?.itens) return erro("só para nota direta");
    if (!!n.estoque_lancado === !p_estornar) return erro(p_estornar ? "o estoque desta nota não foi baixado" : "o estoque desta nota já foi baixado");
    for (const i of n.itens) movimentar(i.produto_id, p_estornar ? "entrada" : "saida", Number(i.quantidade), `${p_estornar ? "Estorno da " : ""}NF-e ${n.numero} (nota direta)`, { unidade_id: n.unidade_id });
    n.estoque_lancado = !p_estornar;
    return { data: n.itens.length, error: null };
  },
  criar_envio_pedido: ({ p_pedido }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p) return erro("pedido não encontrado");
    const ja = db.envios.find((e) => e.pedido_id === p_pedido && e.status !== "cancelado");
    if (ja) return { data: ja.id, error: null };
    const c = db.clientes.find((x) => x.id === p.cliente_id) ?? {};
    const u = db.unidades.find((x) => x.id === (p.unidade_id ?? U_SC)) ?? {};
    let maquina: string | null = null;
    const volumes = db.pedido_itens.filter((i) => i.pedido_id === p_pedido).map((i) => {
      const pr = db.produtos.find((x) => x.id === i.produto_id) ?? {};
      const em = db.embalagens.find((x) => x.id === pr.embalagem_id);
      if (pr.tipo === "maquina") maquina ??= i.descricao;
      return { embalagem_id: em?.id, descricao: (em ? `${em.descricao} · ` : "") + i.descricao, quantidade: Math.ceil(i.quantidade),
        largura_cm: em?.largura_cm ?? pr.largura_cm, altura_cm: em?.altura_cm ?? pr.altura_cm, comprimento_cm: em?.comprimento_cm ?? pr.profundidade_cm, peso_kg: pr.peso_kg ?? em?.peso_kg };
    });
    const mod = Number(p.modalidade_frete);
    const novo = calcularEnvioDemo({
      id: uid(), numero: Math.max(0, ...db.envios.map((r) => Number(r.numero) || 0)) + 1, pedido_id: p.id, cliente_id: p.cliente_id, unidade_id: u.id ?? U_SC, vendedor_id: p.vendedor_id ?? null,
      status: "cotacao", cep_origem: u.cep ?? "88117010", cidade_origem: u.municipio ?? "São José", uf_origem: u.uf ?? "SC",
      cep_destino: c.cep ?? null, cidade_destino: c.municipio ?? null, uf_destino: c.uf ?? null, endereco_destino: c.logradouro ? `${c.logradouro}, ${c.numero ?? ""}` : null,
      volumes, valor_mercadoria: p.valor_total ?? 0, seguro: true, tipo_equipamento: maquina ?? "Peças e acessórios", restricoes: maquina ? ["manter_em_pe"] : [],
      modalidade: mod === 1 ? "fob" : mod === 2 ? "terceiros" : mod === 3 ? "proprio" : mod === 4 ? "retira" : "cif",
      pagador: mod === 1 || mod === 4 ? "cliente" : mod === 2 ? "terceiro" : "empresa", transportadora_id: p.transportadora_id ?? null, created_at: new Date().toISOString(),
    });
    db.envios.push(novo);
    return { data: novo.id, error: null };
  },
  aprovar_cotacao_envio: ({ p_cotacao, p_cobrar_cliente = false }) => {
    const c = db.envio_cotacoes.find((x) => x.id === p_cotacao && x.ativa);
    if (!c) return erro("cotação não encontrada");
    const e = db.envios.find((x) => x.id === c.envio_id)!;
    if (["entregue", "cancelado"].includes(e.status)) return erro(`este envio já foi ${e.status}`);
    db.envio_cotacoes.filter((x) => x.envio_id === c.envio_id).forEach((x) => (x.escolhida = x.id === c.id));
    Object.assign(e, { transportadora_id: c.transportadora_id, transportadora_nome: c.transportadora_id ? null : c.transportadora_nome, valor_aprovado: c.valor, prazo_dias: c.prazo_dias,
      aprovado_em: new Date().toISOString(), status: ["cotacao", "aprovacao"].includes(e.status) ? "coleta" : e.status });
    const p = db.pedidos.find((x) => x.id === e.pedido_id);
    if (p) { p.transportadora_id = c.transportadora_id; if (p_cobrar_cliente && p.status === "orcamento") Object.assign(p, { frete: c.valor, modalidade_frete: 0 }); }
    recalcular(db);
    return { data: null, error: null };
  },
  escolher_cotacao_frete: ({ p_cotacao, p_cobrar_cliente = true }) => {
    const c = db.cotacoes_frete.find((x) => x.id === p_cotacao);
    if (!c) return erro("cotação não encontrada");
    const p = db.pedidos.find((x) => x.id === c.pedido_id)!;
    db.cotacoes_frete.filter((x) => x.pedido_id === c.pedido_id).forEach((x) => (x.escolhida = x.id === c.id));
    p.transportadora_id = c.transportadora_id;
    if (p.status === "orcamento" && p_cobrar_cliente) Object.assign(p, { frete: c.valor, modalidade_frete: 0 });
    recalcular(db);
    return { data: null, error: null };
  },
  lancar_estoque_nfe: ({ p_nfe, p_itens }) => {
    const n = db.nfe_recebidas.find((x) => x.id === p_nfe);
    if (!n || n.estoque_lancado) return erro("estoque desta nota já foi lançado");
    let total = 0;
    for (const it of p_itens) {
      if (!it.produto_id) continue;
      const fator = Number(it.fator) || 1;
      movimentar(it.produto_id, "entrada", it.quantidade * fator, `NF ${n.chave.slice(25, 34).replace(/^0+/, "")} - ${n.emitente_nome}`, { unidade_id: n.unidade_id });
      if (it.atualizar_custo !== false) db.produtos.find((p) => p.id === it.produto_id)!.preco_custo = r2(it.valor_unitario / fator);
      if (n.fornecedor_id && it.codigo) {
        db.produto_fornecedor = db.produto_fornecedor.filter((v) => !(v.fornecedor_id === n.fornecedor_id && v.codigo_fornecedor === it.codigo));
        db.produto_fornecedor.push({ id: uid(), fornecedor_id: n.fornecedor_id, codigo_fornecedor: it.codigo, produto_id: it.produto_id, fator_conversao: fator });
      }
      total++;
    }
    if (!total) return erro("nenhum item vinculado a produto");
    Object.assign(n, { estoque_lancado: true, processamento: "concluido", processamento_msg: null });
    return { data: total, error: null };
  },
};

// ---------------------------------------------------------------------
// Edge Functions simuladas
// ---------------------------------------------------------------------
function itensVinculados(n: Row) {
  return (n.itens ?? []).map((i: Row) => {
    const v = db.produto_fornecedor.find((x) => x.fornecedor_id === n.fornecedor_id && x.codigo_fornecedor === i.codigo);
    const porEan = i.ean ? db.produtos.find((p) => p.codigo_barras === i.ean) : null;
    return { ...i, produto_id: v?.produto_id ?? porEan?.id ?? null, fator: Number(v?.fator_conversao ?? 1) };
  });
}

/** XML de exemplo (o que o fornecedor manda por e-mail). */
function xmlExemplo() {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe35261011222333000181550010000124001000000017" versao="4.00">
<ide><nNF>12400</nNF><dhEmi>${new Date().toISOString()}</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ><xNome>Refrigeração Andrade Ltda</xNome></emit><dest><CNPJ>46942855000132</CNPJ></dest>
<det nItem="1"><prod><cProd>CMP-1HP-404</cProd><cEAN>SEM GTIN</cEAN><xProd>COMPRESSOR HERMETICO 1HP R404A</xProd><NCM>84143019</NCM><CFOP>6102</CFOP><uCom>UN</uCom><qCom>3</qCom><vUnCom>1350.00</vUnCom><vProd>4050.00</vProd></prod></det>
<total><ICMSTot><vNF>4050.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
}

/** Lê o XML no navegador (no sistema real: função nfe-recebidas-sync no servidor). */
function importarXmlDemo(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const inf = doc.getElementsByTagName("infNFe")[0];
  if (!inf) throw new Error("o arquivo não é o XML de uma NF-e");
  const txt = (el: Element | Document, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? "";
  const chave = (inf.getAttribute("Id") ?? "").replace(/^NFe/, "");
  const existente = db.nfe_recebidas.find((x) => x.chave === chave);
  if (existente?.estoque_lancado) return { ok: true, id: existente.id, ja_existia: true };
  const emit = inf.getElementsByTagName("emit")[0];
  const cnpjEmit = txt(emit, "CNPJ");
  const destCnpj = txt(inf.getElementsByTagName("dest")[0], "CNPJ");
  const unidade = db.unidades.find((u) => String(u.cnpj).replace(/\D/g, "") === destCnpj);
  if (!unidade) throw new Error(`esta nota não é para a MF (destinatário ${destCnpj})`);
  const itens = Array.from(inf.getElementsByTagName("det")).map((d, i) => ({
    numero: i + 1, codigo: txt(d, "cProd"), ean: null, descricao: txt(d, "xProd"), ncm: txt(d, "NCM"), cfop: txt(d, "CFOP"), unidade: txt(d, "uCom") || "UN",
    quantidade: Number(txt(d, "qCom")), valor_unitario: Number(txt(d, "vUnCom")), valor_total: Number(txt(d, "vProd")),
  }));
  const forn = db.fornecedores.find((f) => f.cnpj === cnpjEmit);
  const n: Row = existente ?? { id: uid(), created_at: quando(0) };
  Object.assign(n, { chave, emitente_nome: txt(emit, "xNome"), emitente_cnpj: cnpjEmit, valor_total: Number(txt(inf, "vNF")), data_emissao: txt(inf, "dhEmi"),
    situacao: "autorizada", manifestacao: null, fornecedor_id: forn?.id ?? null, conta_pagar_id: n.conta_pagar_id ?? null, estoque_lancado: false,
    processamento: "pendente", origem: "xml", xml, itens, unidade_id: unidade.id });
  if (!existente) db.nfe_recebidas.push(n);
  processarRecebida(n);
  return { ok: true, id: n.id, ja_existia: !!existente, numero: txt(inf, "nNF"), emitente: n.emitente_nome, processamento: n.processamento, processamento_msg: n.processamento_msg };
}

function processarRecebida(n: Row) {
  const itens = itensVinculados(n);
  if (!n.conta_pagar_id) {
    const cp = { id: uid(), descricao: `NF ${n.chave.slice(25, 34).replace(/^0+/, "")} - ${n.emitente_nome}`, fornecedor_id: n.fornecedor_id, categoria: "fornecedores", valor: n.valor_total, vencimento: dias(28), status: "aberto", nfe_recebida_id: n.id };
    db.contas_pagar.push(cp);
    n.conta_pagar_id = cp.id;
  }
  const sem = itens.filter((i: Row) => !i.produto_id);
  if (sem.length) return Object.assign(n, { processamento: "aguardando_vinculo", processamento_msg: `${sem.length} item(ns) sem produto vinculado: ${sem.map((i: Row) => i.descricao).join(", ")}.` });
  rpcs.lancar_estoque_nfe({ p_nfe: n.id, p_itens: itens.map((i: Row) => ({ ...i, atualizar_custo: true })) });
}

/** NF de devolução na prévia: usa os itens da nota (payload) ou da nota de fornecedor. */
function devolucaoDemo(b: any) {
  const o = b.devolucao;
  const emitida: Row | null = o.tipo === "emitida" ? db.notas_fiscais.find((n) => n.id === o.id) ?? null : null;
  const recebida: Row = o.tipo === "recebida" ? db.nfe_recebidas.find((n) => n.id === o.id) ?? {} : {};
  const itensOrig = emitida ? (emitida.payload?.items ?? []).map((i: Row) => ({ numero: i.numero_item, codigo: i.codigo_produto, descricao: i.descricao, unidade: i.unidade_comercial ?? "UN", quantidade: i.quantidade_comercial, valor_unitario: i.valor_unitario_comercial, cfop: i.cfop }))
    : (recebida?.itens ?? []).map((i: Row) => ({ numero: i.numero, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario, cfop: i.cfop }));
  if (!itensOrig.length) throw new Error("a nota não tem os itens enviados à SEFAZ");
  const tipo = emitida ? "venda" : "compra";
  const inter = emitida ? emitida.payload?.uf_destinatario !== "SC" : true;
  const ja = new Map<number, number>();
  for (const d of db.notas_fiscais.filter((n) => n.finalidade === "devolucao" && (n.nota_referenciada_id === o.id || n.nfe_recebida_id === o.id) && n.status !== "cancelada")) for (const i of d.devolucao_itens ?? []) ja.set(i.numero, (ja.get(i.numero) ?? 0) + i.quantidade);
  const cfopDev = (c: string) => tipo === "venda" ? ({ "5": "1", "6": "2" } as Row)[c[0]] + (["101", "107"].includes(c.slice(1)) ? "201" : "202") : (inter ? "6" : "5") + "202";
  const prod = (codigo: string) => db.produtos.find((p) => p.sku === codigo);
  if (b.previa) return {
    ok: true, tipo, original: { numero: emitida?.numero ?? recebida.chave.slice(25, 34).replace(/^0+/, ""), serie: "1", chave: emitida?.chave ?? recebida.chave, data: emitida?.created_at ?? recebida.data_emissao },
    destinatario: emitida ? { nome: emitida.payload?.nome_destinatario, doc: emitida.payload.cnpj_destinatario ?? emitida.payload.cpf_destinatario, uf: emitida.payload.uf_destinatario, municipio: emitida.payload.municipio_destinatario ?? "" }
      : { nome: recebida.emitente_nome, doc: recebida.emitente_cnpj, uf: recebida.chave.slice(0, 2) === "35" ? "SP" : "SC", municipio: "" },
    faltas: [], interestadual: inter,
    avisos: ["Emissão em homologação (teste): a devolução sai sem valor fiscal e não mexe no estoque.", ...(tipo === "venda" && emitida?.payload?.cnpj_destinatario ? ["O cliente é contribuinte do ICMS: normalmente é ele quem emite a NF de devolução (ela chega em NF-e recebidas). Emita esta só se ele não emitir a dele."] : [])],
    cfops: tipo === "compra" ? [["202", "compra para comercialização"], ["201", "compra para industrialização"], ["556", "compra de material de uso ou consumo"]].map(([c, d]) => ({ cfop: (inter ? "6" : "5") + c, descricao: d })) : [],
    itens: itensOrig.map((i: Row) => ({ ...i, devolvida: ja.get(i.numero) ?? 0, disponivel: i.quantidade - (ja.get(i.numero) ?? 0), cfop_original: i.cfop, cfop: cfopDev(i.cfop),
      produto_id: prod(i.codigo)?.id ?? null, produto_nome: prod(i.codigo)?.descricao ?? null, kit: false })),
  };
  if (String(b.motivo ?? "").trim().length < 15) throw new Error("descreva o motivo da devolução (mínimo 15 caracteres): ele vai na nota");
  const sel = (b.itens ?? []).filter((x: Row) => x.quantidade > 0);
  const valor = r2(sel.reduce((s: number, x: Row) => s + x.quantidade * (itensOrig.find((i: Row) => i.numero === x.numero)?.valor_unitario ?? 0), 0));
  const nota: Row = { id: uid(), referencia: `devolucao-${tipo}-${uid().slice(0, 4)}`, status: "processando", ambiente: "homologacao", finalidade: "devolucao", tipo_operacao: tipo === "venda" ? "entrada" : "saida",
    nota_referenciada_id: emitida?.id ?? null, nfe_recebida_id: recebida?.id ?? null, chave_referenciada: emitida?.chave ?? recebida?.chave, valor_total: valor, created_at: quando(0),
    destinatario_nome: emitida?.payload?.nome_destinatario ?? recebida?.emitente_nome, marcadores: ["mk7"], unidade_id: emitida?.unidade_id ?? db.unidades[0].id,
    devolucao_itens: sel.map((x: Row) => ({ numero: x.numero, quantidade: x.quantidade })),
    payload: { natureza_operacao: tipo === "venda" ? "Devolução de venda" : "Devolução de compra", nome_destinatario: emitida?.payload?.nome_destinatario ?? recebida?.emitente_nome,
      informacoes_adicionais_contribuinte: `Devolução referente à NF-e ${emitida?.numero ?? ""}. Motivo: ${b.motivo}`,
      items: sel.map((x: Row, k: number) => { const i = itensOrig.find((y: Row) => y.numero === x.numero); return { numero_item: k + 1, codigo_produto: i.codigo, descricao: i.descricao, cfop: x.cfop, quantidade_comercial: x.quantidade, valor_bruto: r2(x.quantidade * i.valor_unitario) }; }) } };
  db.notas_fiscais.push(nota);
  const orig: Row = emitida ?? recebida;
  orig.marcadores = [...new Set([...(orig.marcadores ?? []), "mk7"])];
  setTimeout(() => Object.assign(nota, { status: "autorizada", numero: String(++numeroNfe), serie: "1", mensagem: "Autorizado o uso da NF-e" }), 2500);
  return { ok: true, nota };
}

const funcoes: Record<string, (b: any) => any> = {
  "nfe-emitir": (b) => {
    if (b.devolucao) return devolucaoDemo(b);
    if (b.avulsa) {
      const a = b.avulsa;
      const c = db.clientes.find((x) => x.id === a.cliente_id);
      if (!c) throw new Error("escolha o cliente");
      const itens = (a.itens ?? []).map((i: Row) => ({ ...i, descricao: i.descricao || db.produtos.find((p) => p.id === i.produto_id)?.descricao }));
      const total = r2(itens.reduce((s2: number, i: Row) => s2 + i.quantidade * i.valor_unitario, 0) - Number(a.desconto ?? 0) + Number(a.frete ?? 0));
      const nota: Row = { id: uid(), pedido_id: null, unidade_id: a.unidade_id, cliente_id: c.id, destinatario_nome: c.nome, destinatario_doc: c.cpf_cnpj,
        referencia: `direta-${uid()}`, status: "processando", valor_total: total, created_at: quando(0), operacao: a.operacao, itens, estoque_lancado: false,
        tipo_operacao: "saida", finalidade: "normal", observacao_interna: "Nota direta",
        payload: { natureza_operacao: a.natureza || "Venda de mercadoria", items: itens.map((i: Row, k: number) => ({ numero_item: k + 1, descricao: i.descricao, quantidade_comercial: i.quantidade, valor_unitario_comercial: i.valor_unitario, valor_bruto: r2(i.quantidade * i.valor_unitario) })) } };
      db.notas_fiscais.push(nota);
      setTimeout(() => Object.assign(nota, { status: "autorizada", numero: String(++numeroNfe), serie: "1", mensagem: "Autorizado o uso da NF-e" }), 3000);
      return { ok: true, nota };
    }
    if (b.transferencia_id) {
      const t = db.transferencias.find((x) => x.id === b.transferencia_id)!;
      const valor = db.transferencia_itens.filter((i) => i.transferencia_id === t.id).reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);
      const nota = { id: uid(), transferencia_id: t.id, unidade_id: t.origem_id, referencia: `transf-${t.numero}-1`, status: "processando", valor_total: r2(valor), created_at: quando(0) };
      db.notas_fiscais.push(nota);
      setTimeout(() => Object.assign(nota, { status: "autorizada", numero: String(++numeroNfe), serie: "1", mensagem: "Autorizado o uso da NF-e" }), 3000);
      return { ok: true, nota };
    }
    const p = db.pedidos.find((x) => x.id === b.pedido_id)!;
    const tentativa = db.notas_fiscais.filter((n) => n.pedido_id === p.id).length + 1;
    const nota = { id: uid(), pedido_id: p.id, unidade_id: p.unidade_id, referencia: `pedido-${p.numero}-${tentativa}`, status: "processando", valor_total: p.valor_total, created_at: quando(0) };
    db.notas_fiscais.push(nota);
    // simula a SEFAZ autorizando alguns segundos depois (o gatilho da Focus faria isso)
    setTimeout(() => {
      Object.assign(nota, { status: "autorizada", numero: String(++numeroNfe), serie: "1", chave: `352610123456780001905500100000${numeroNfe}1000${numeroNfe}0`.slice(0, 44), mensagem: "Autorizado o uso da NF-e" });
      if (p.status === "aprovado") p.status = "faturado";
      expedicaoDemo(p, "nfe");
    }, 4000);
    return { ok: true, nota };
  },
  "nfe-consultar": (b) => {
    if (b.acao === "ambiente") return { ok: true, ambiente: "homologacao" };
    if (b.acao === "diagnostico") return { ok: true, ambiente: "homologacao", itens: [
      { grupo: "Ambiente", titulo: "FOCUS_NFE_ENV", nivel: "erro", detalhe: "O ERP leu um texto de 32 caracteres que não é o nome de um ambiente (parece um token colado no lugar errado) e por isso está emitindo em HOMOLOGAÇÃO.", acao: "No Supabase (Edge Functions → Secrets), deixe FOCUS_NFE_ENV com a palavra producao e coloque o Token de Produção em FOCUS_NFE_TOKEN_PRODUCAO." },
      { grupo: "Matriz SC (SC)", titulo: "Token da Focus (homologação) · FOCUS_NFE_TOKEN", nivel: "ok", detalhe: "A Focus aceitou o token neste ambiente." },
      { grupo: "Matriz SC (SC)", titulo: "Numeração (série 1)", nivel: "info", detalhe: "A última nota real desta unidade é a 430. Na Focus (Documentos fiscais → Produção), o próximo número deve ser 431." },
    ] };
    if (b.acao === "importar_xml") {
      return { ok: true, resultados: (b.xmls as string[]).map((xml) => {
        const x = lerXmlDemo(xml);
        if (!x) return { situacao: "ignorada", mensagem: "não é XML de NF-e" };
        const u = db.unidades.find((un) => un.cnpj === x.emit);
        if (!u) return { situacao: "ignorada", numero: x.numero, mensagem: `emitente ${x.emit} não é uma unidade da MF` };
        const existe = db.notas_fiscais.find((n) => n.chave === x.chave);
        const n: Row = existe ?? { id: uid(), referencia: `importada-${x.chave}`, origem: "importada", unidade_id: u.id };
        Object.assign(n, { status: x.cancelada ? "cancelada" : "autorizada", numero: x.numero, serie: "1", chave: x.chave, valor_total: x.valor, created_at: x.data,
          destinatario_nome: x.destNome, mensagem: "Importada do sistema anterior" });
        if (!existe) db.notas_fiscais.push(n);
        return { situacao: existe ? "atualizada" : "importada", numero: x.numero };
      }) };
    }
    if (b.acao === "inutilizar") {
      if (!b.justificativa || b.justificativa.trim().length < 15) throw new Error("a justificativa deve ter ao menos 15 caracteres");
      const i = { id: uid(), unidade_id: b.unidade_id, serie: Number(b.serie), numero_inicial: Number(b.numero_inicial), numero_final: Number(b.numero_final),
        justificativa: b.justificativa, status: "autorizada", mensagem: "Inutilização de número homologado", created_at: quando(0) };
      (db.nfe_inutilizacoes ??= []).unshift(i);
      return { ok: true, inutilizacao: i };
    }
    const n = db.notas_fiscais.find((x) => x.id === b.nota_id)!;
    if (b.acao === "reenviar_corrigida") {
      if (n.status !== "erro") throw new Error("só nota rejeitada pode ser corrigida e reenviada");
      const a = b.alteracoes ?? {};
      const p = { ...n.payload, ...(a.natureza_operacao ? { natureza_operacao: a.natureza_operacao } : {}), ...(a.destinatario ?? {}) };
      p.items = (n.payload?.items ?? []).map((i: Row) => ({ ...i, ...((a.itens ?? []).find((x: Row) => x.numero_item === i.numero_item) ?? {}) }));
      Object.assign(n, { payload: p, status: "processando", mensagem: null, historico_envios: [...(n.historico_envios ?? []), { referencia: n.referencia, mensagem: n.mensagem, em: quando(0) }], referencia: `${n.referencia}-c2` });
      setTimeout(() => Object.assign(n, { status: "autorizada", numero: String(++numeroNfe), serie: "1", chave: `352610123456780001905500100000${numeroNfe}1000${numeroNfe}0`.slice(0, 44), mensagem: "Autorizado o uso da NF-e" }), 2500);
      return { ok: true, nota: n };
    }
    if (b.acao === "carta_correcao") {
      if (String(b.correcao ?? "").trim().length < 15) throw new Error("a correção deve ter entre 15 e 1.000 caracteres");
      const seq = (db.nfe_cartas_correcao ?? []).filter((c) => c.nota_id === n.id).length + 1;
      const c = { id: uid(), nota_id: n.id, sequencia: seq, correcao: b.correcao.trim(), status: "autorizada", mensagem: "Evento registrado e vinculado a NF-e", pdf_url: null, created_at: quando(0) };
      (db.nfe_cartas_correcao ??= []).push(c);
      return { ok: true, carta: c };
    }
    if (b.acao === "reenviar") Object.assign(n, { status: "autorizada", numero: String(++numeroNfe), serie: "1", mensagem: "Autorizado o uso da NF-e (reenviada da contingência)" });
    if (b.acao === "cancelar") {
      n.status = "cancelada";
      n.mensagem = "Cancelamento de NF-e homologado";
      const p = db.pedidos.find((x) => x.id === n.pedido_id);
      if (p?.status === "faturado") p.status = "aprovado";
    }
    return { ok: true, nota: n };
  },
  "contador-pacote": (b) => {
    const u = db.unidades.find((x) => x.id === b.unidade_id)!;
    const notas = db.notas_fiscais.filter((n) => n.unidade_id === b.unidade_id && n.created_at.startsWith(b.competencia) && n.status === "autorizada");
    const texto = [`Fechamento ${b.competencia} — ${u.razao_social} (${u.nome})`, "", `NF-e autorizadas: ${notas.length}`, "",
      "Na prévia o pacote traz só este resumo. No sistema publicado vem o ZIP com todos os XML e as planilhas."].join("\r\n");
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain" }));
    db.fechamentos ??= [];
    const id = rpcs.garantir_fechamento({ p_unidade: b.unidade_id, p_competencia: b.competencia }).data;
    const f = db.fechamentos.find((x) => x.id === id)!;
    Object.assign(f, { arquivo_caminho: "demo.zip", ...(b.enviar_email ? { enviado_em: quando(0), status: f.status === "fechado" ? "fechado" : "enviado" } : {}) });
    return { ok: true, url, arquivos: 9, faltando: [], enviado: !!b.enviar_email };
  },
  "proposta-enviar": (b) => {
    const r = rpcs.marcar_proposta_enviada({ p_pedido: b.pedido_id });
    if (r.error) throw new Error(r.error.message);
    const p = db.pedidos.find((x) => x.id === b.pedido_id)!;
    return { ok: true, para: b.para || db.clientes.find((c) => c.id === p.cliente_id)?.email, link: `/proposta/${p.proposta_token}` };
  },
  // na prévia as fotos continuam pelo link (não há armazenamento)
  "produtos-fotos": () => ({ copiadas: 0, falharam: 0, restantes: 0 }),
  "nfe-recebidas-sync": (b) => {
    if (b.acao === "importar_xmls") {
      const desde = db.configuracoes[0].recebidas_processar_desde ?? hojeISO();
      return { ok: true, resultados: (b.xmls as string[]).map((xml) => {
        const x = lerXmlDemo(xml);
        if (!x) return { situacao: "ignorada", mensagem: "não é XML de NF-e" };
        if (!db.unidades.some((u) => u.cnpj === x.dest)) return { situacao: "ignorada", numero: x.numero, mensagem: "esta nota não é para a MF" };
        const existe = db.nfe_recebidas.find((n) => n.chave === x.chave);
        const historico = x.data.slice(0, 10) < desde;
        const n: Row = existe ?? { id: uid(), chave: x.chave, created_at: quando(0), conta_pagar_id: null, estoque_lancado: false, origem: "xml" };
        Object.assign(n, { emitente_nome: x.emitente, emitente_cnpj: x.emit, valor_total: x.valor, data_emissao: x.data, situacao: x.cancelada ? "cancelada" : "autorizada",
          manifestacao: null, processamento: historico || x.cancelada ? "ignorada" : "pendente",
          processamento_msg: historico ? "Histórico: já lançada no sistema anterior." : null });
        if (!existe) db.nfe_recebidas.push(n);
        return { situacao: existe ? "atualizada" : "importada", numero: x.numero, processamento: n.processamento, cancelada: !!x.cancelada };
      }) };
    }
    if (b.acao === "sincronizar") {
      const n: Row = {
        id: uid(), chave: `352610${Date.now()}`.padEnd(44, "7"), emitente_nome: "Refrigeração Andrade Ltda", emitente_cnpj: "11222333000181",
        valor_total: 2700, data_emissao: quando(0), situacao: "autorizada", manifestacao: "ciencia", fornecedor_id: "f1",
        conta_pagar_id: null, estoque_lancado: false, processamento: "pendente", created_at: quando(0),
        itens: [{ numero: 1, codigo: "CMP-1HP-404", ean: null, descricao: "COMPRESSOR HERMETICO 1HP R404A", ncm: "84143019", cfop: "6102", unidade: "UN", quantidade: 2, valor_unitario: 1350, valor_total: 2700 }],
      };
      db.nfe_recebidas.push(n);
      processarRecebida(n);
      return { ok: true, processadas: 1, automaticas: 1 };
    }
    const n = db.nfe_recebidas.find((x) => x.id === b.nfe_id || x.chave === b.chave);
    if (b.acao === "itens") return { ok: true, itens: itensVinculados(n!) };
    if (b.acao === "processar") { if (n) processarRecebida(n); return { ok: true, processamento: n?.processamento, automaticas: 0 }; }
    if (b.acao === "lancar_conta") { processarRecebida({ ...n!, itens: [] }); return { ok: true, contas: 1 }; }
    if (b.acao === "manifestar") { n!.manifestacao = b.tipo; return { ok: true }; }
    if (b.acao === "xml") return { ok: true, xml: n?.xml ?? "<nfeProc><!-- XML de demonstração --></nfeProc>" };
    if (b.acao === "importar_xml") return importarXmlDemo(b.xml);
    return { ok: true };
  },
  "email-caixa": (b) => {
    if (b.acao === "sincronizar") {
      const novo = { id: uid(), conta_id: "ec1", uid: 102 + db.emails.length, de_nome: "Açaí & Cia Franca", de_email: "acaieciafranca@gmail.com", para: "comercial@mfmaquinas.com.br",
        assunto: "Peças para a milk shake", data: new Date().toISOString(), previa: "Bom dia! Preciso de 2 bicos dosadores e um kit de vedação. Vocês têm a pronta entrega?",
        texto: "Bom dia! Preciso de 2 bicos dosadores e um kit de vedação. Vocês têm a pronta entrega?\n\nAbraço", html: null, anexos: [], lido: false, arquivado: false, cliente_id: "c2", fornecedor_id: null, respondido_em: null };
      db.emails.unshift(novo);
      db.email_contas[0].sincronizado_em = new Date().toISOString();
      notificarDemo("email", "Novo e-mail em Comercial", `${novo.de_nome}: ${novo.assunto}`, "/email", ["vendas", "financeiro"]);
      return { ok: true, resultado: { Comercial: 1 } };
    }
    const e = db.emails.find((x) => x.id === b.email_id);
    if (b.acao === "anexo") {
      const a = e?.anexos[b.indice];
      const conteudo = a?.nfe ? xmlExemplo() : "Arquivo de demonstração";
      return { ok: true, nome: a?.nome ?? "anexo.txt", tipo: a?.tipo ?? "text/plain", base64: btoa(unescape(encodeURIComponent(conteudo))) };
    }
    if (b.acao === "importar_nfe") return importarXmlDemo(xmlExemplo());
    if (b.acao === "responder") { if (e) Object.assign(e, { respondido_em: new Date().toISOString(), lido: true }); return { ok: true }; }
    if (b.acao === "salvar_conta") {
      const c = { ...b.conta }; delete c.senha;
      if (c.id) Object.assign(db.email_contas.find((x) => x.id === c.id)!, c); else db.email_contas.push({ ...c, id: uid(), sincronizado_em: null, erro: null });
      return { ok: true };
    }
    if (b.acao === "remover_conta") { db.email_contas = db.email_contas.filter((x) => x.id !== b.conta_id); db.emails = db.emails.filter((x) => x.conta_id !== b.conta_id); return { ok: true }; }
    return { ok: true };
  },
  "avisos-config": (b) => {
    if (b.acao === "telegram_status") return { ok: true, robo: db.configuracoes[0].telegram_bot, webhook: true, conectados: db.usuarios_erp.filter((u) => u.telegram_chat_id).length, erro: null, email: true };
    if (b.acao === "telegram_configurar") return { ok: true, robo: db.configuracoes[0].telegram_bot };
    if (b.acao === "enviar_agora") {
      const fila = db.avisos.filter((a) => a.status !== "enviado");
      fila.forEach((a) => Object.assign(a, { status: "enviado", erro: null, enviado_em: quando(0) }));
      return { ok: true, enviados: fila.length, erros: 0 };
    }
    return { ok: true };
  },
  "focus-config": () => ({ ok: true, ambiente: "homologacao", eventos: ["nfe", "nfe_recebida"] }),
  "clientes-receita": (b) => {
    const comCnpj = db.clientes.filter((c) => soDig(c.cpf_cnpj).length === 14);
    if (b.acao === "um") {
      const c = db.clientes.find((x) => x.id === b.cliente_id);
      if (c) Object.assign(c, { receita_em: new Date().toISOString(), receita_situacao: c.receita_situacao ?? "ATIVA", ie_situacao: c.ie_situacao ?? "ativa" });
      return { ok: true };
    }
    const n = (t: string) => comCnpj.filter((c) => (c.tags ?? []).includes(t)).length;
    return { ok: true, com_cnpj: comCnpj.length, conferidos: comCnpj.filter((c) => c.receita_em).length, irregulares: n("cnpj_irregular"), ie_baixada: n("ie_baixada"), endereco_diferente: n("endereco_receita") };
  },
  "tiny-importar": () => ({ ok: true, configurado: false, estado: null }),
  "usuarios-admin": (b) => {
    if (b.acao === "listar") return { ok: true, usuarios: db.usuarios_erp };
    if (b.acao === "criar") { db.usuarios_erp.push({ user_id: uid(), nome: b.nome, papel: b.papel, email: b.email, ativo: true, ultimo_acesso: null }); return { ok: true }; }
    if (b.acao === "atualizar") { Object.assign(db.usuarios_erp.find((u) => u.user_id === b.user_id)!, b); return { ok: true }; }
    return { ok: true };
  },
};

// ---------------------------------------------------------------------
// Cliente compatível com o supabase-js
// ---------------------------------------------------------------------
type Sessao = { user: { id: string; email: string; user_metadata: Row } } | null;
let sessao: Sessao = null;
const ouvintes = new Set<(e: string, s: Sessao) => void>();
const avisar = () => ouvintes.forEach((f) => f("SIGNED_IN", sessao));

/** Entra como um dos usuários de exemplo (tela de login da demonstração). */
export function entrarDemo(userId: string) {
  const u = USUARIOS_DEMO.find((x) => x.user_id === userId)!;
  sessao = { user: { id: u.user_id, email: u.email, user_metadata: { nome: u.nome } } };
  avisar();
  simularEventos();
}

// Demonstração dos pop-ups: um pedido chega pela loja e um cliente paga, poucos segundos depois de entrar
let simulado = false;
function simularEventos() {
  if (simulado) return;
  simulado = true;
  setTimeout(() => {
    const p = db.produtos.find((x) => x.id === "p3")!;
    const ped: Row = { id: uid(), ...DEFAULTS.pedidos(), cliente_id: "c2", origem: "loja", forma_pagamento: "pix", parcelas: 1, intervalo_dias: 30, modalidade_frete: 9, desconto: 0, frete: 0, unidade_id: U_SP, vendedor: "Loja virtual" };
    db.pedidos.push(ped);
    db.pedido_itens.push({ id: uid(), pedido_id: ped.id, produto_id: p.id, descricao: p.descricao, quantidade: 1, valor_unitario: p.preco_venda });
    recalcular(db);
    notificarDemo("pedido_loja", `Novo pedido na loja: #${ped.numero}`, `Açaí & Cia Franca ME · ${brlDemo(ped.valor_total)}`, "/pedidos", ["vendas"]);
  }, 9000);
  setTimeout(() => {
    const c = db.contas_receber.find((x) => x.id === "r2");
    if (c && c.status === "aberto") {
      Object.assign(c, { status: "pago", data_pagamento: hojeISO(), valor_pago: c.valor });
      notificarDemo("pagamento", `Pagamento recebido: ${brlDemo(c.valor)}`, `Sorveteria Gelato Nobre Ltda · ${c.descricao} (Pix)`, "/financeiro", ["financeiro", "vendas"]);
    }
  }, 22000);
}

// Clientes da loja virtual (no sistema real: Supabase Auth)
const contasLoja: { id: string; email: string; senha: string; nome: string }[] = [];

// Fotos da OS: guardadas na memória do navegador (no sistema real, Supabase Storage)
const arquivos = new Map<string, string>();
function fotoExemplo(texto: string, cor: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="${cor}"/><rect x="120" y="90" width="240" height="300" rx="18" fill="#e2e8f0"/><rect x="150" y="120" width="180" height="70" rx="8" fill="#94a3b8"/><circle cx="240" cy="270" r="40" fill="#cbd5e1"/><text x="240" y="440" font-family="Arial" font-size="22" fill="#0d1b2e" text-anchor="middle">${texto}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function fotoProduto(tipo: "soft" | "balcao" | "shake" | "kit", cor: string) {
  const corpo = {
    soft: `<rect x="150" y="70" width="200" height="330" rx="22" fill="#e8edf3"/><rect x="170" y="95" width="160" height="60" rx="10" fill="#0b1f3a"/><rect x="185" y="110" width="60" height="10" rx="5" fill="#00d4ff"/><circle cx="200" cy="215" r="16" fill="#94a3b8"/><circle cx="250" cy="215" r="16" fill="#94a3b8"/><circle cx="300" cy="215" r="16" fill="#94a3b8"/><rect x="180" y="250" width="140" height="18" rx="6" fill="#cbd5e1"/><rect x="165" y="400" width="30" height="20" fill="#475569"/><rect x="305" y="400" width="30" height="20" fill="#475569"/>`,
    balcao: `<rect x="130" y="150" width="240" height="220" rx="22" fill="#e8edf3"/><rect x="150" y="170" width="200" height="50" rx="10" fill="#0b1f3a"/><rect x="165" y="185" width="70" height="10" rx="5" fill="#00d4ff"/><circle cx="210" cy="265" r="18" fill="#94a3b8"/><circle cx="290" cy="265" r="18" fill="#94a3b8"/><rect x="170" y="310" width="160" height="16" rx="6" fill="#cbd5e1"/>`,
    shake: `<rect x="170" y="90" width="160" height="60" rx="16" fill="#e8edf3"/><rect x="235" y="150" width="30" height="170" fill="#cbd5e1"/><rect x="150" y="330" width="200" height="60" rx="14" fill="#e8edf3"/><path d="M215 220 h70 l-10 100 h-50z" fill="#94a3b8"/>`,
    kit: `<circle cx="250" cy="250" r="110" fill="none" stroke="#1f2937" stroke-width="22"/><circle cx="250" cy="250" r="60" fill="none" stroke="#334155" stroke-width="16"/><circle cx="250" cy="250" r="25" fill="none" stroke="#475569" stroke-width="10"/>`,
  }[tipo];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="${cor}"/><ellipse cx="250" cy="430" rx="150" ry="18" fill="#000" opacity=".08"/>${corpo}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
arquivos.set("demo/p1.jpg", fotoProduto("soft", "#f6f8fb"));
arquivos.set("demo/p2.jpg", fotoProduto("balcao", "#f3f7fa"));
arquivos.set("demo/p3.jpg", fotoProduto("shake", "#f7f5f2"));
arquivos.set("demo/p5.jpg", fotoProduto("kit", "#f5f7f9"));
arquivos.set("demo/os1-a.jpg", fotoExemplo("Frente: painel ok", "#f1f5f9"));
arquivos.set("demo/os1-b.jpg", fotoExemplo("Tampa trincada", "#fef3c7"));

export function criarClienteDemo() {
  return {
    from: (t: string) => new Query(t),
    rpc: (nome: string, args: any = {}) => new Promise((ok) => setTimeout(() => ok((rpcs[nome] ?? (() => ({ data: null, error: null })))(args)), 150)),
    storage: {
      from: () => ({
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: arquivos.get(caminho) ?? "" } }),
        upload: async (caminho: string, blob: Blob) => { arquivos.set(caminho, URL.createObjectURL(blob)); return { data: { path: caminho }, error: null }; },
        createSignedUrl: async (caminho: string) => ({ data: { signedUrl: arquivos.get(caminho) ?? "" }, error: arquivos.has(caminho) ? null : { message: "arquivo da prévia não existe mais (recarregou a página)" } }),
        createSignedUrls: async (caminhos: string[]) => ({ data: caminhos.map((c) => ({ path: c, signedUrl: arquivos.get(c) ?? "" })), error: null }),
        remove: async (caminhos: string[]) => { caminhos.forEach((c) => arquivos.delete(c)); return { data: null, error: null }; },
      }),
    },
    channel: () => {
      let cb: ((n: Row) => void) | null = null;
      const canal: Row = {
        on: (_t: string, _f: Row, f: (p: { new: Row }) => void) => { cb = (n) => f({ new: n }); return canal; },
        subscribe: () => { if (cb) canais.add(cb); return canal; },
        _cb: () => cb,
      };
      return canal;
    },
    removeChannel: (canal: Row) => { const f = canal._cb?.(); if (f) canais.delete(f); return Promise.resolve("ok"); },
    functions: {
      invoke: (nome: string, { body }: { body: any }) => new Promise((ok) =>
        setTimeout(() => {
          try { ok({ data: funcoes[nome]?.(body) ?? { ok: true }, error: null }); } catch (e) { ok({ data: null, error: { message: (e as Error).message } }); }
        }, 500)),
    },
    auth: {
      getSession: async () => ({ data: { session: sessao } }),
      onAuthStateChange: (f: (e: string, s: Sessao) => void) => {
        ouvintes.add(f);
        return { data: { subscription: { unsubscribe: () => ouvintes.delete(f) } } };
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const c = contasLoja.find((x) => x.email === email.toLowerCase() && x.senha === password);
        if (!c) return { error: { message: "Na demonstração: crie uma conta na loja, ou escolha um perfil da equipe na tela de entrada." } };
        sessao = { user: { id: c.id, email: c.email, user_metadata: { nome: c.nome, tipo: "cliente_loja" } } };
        avisar();
        return { data: { session: sessao }, error: null };
      },
      signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: Row } }) => {
        if (contasLoja.some((x) => x.email === email.toLowerCase())) return { data: {}, error: { message: "Este e-mail já tem conta: entre com a senha." } };
        const c = { id: uid(), email: email.toLowerCase(), senha: password, nome: options?.data?.nome ?? "" };
        contasLoja.push(c);
        sessao = { user: { id: c.id, email: c.email, user_metadata: { ...options?.data } } };
        avisar();
        return { data: { session: sessao, user: sessao.user }, error: null };
      },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      signOut: async () => { sessao = null; ouvintes.forEach((f) => f("SIGNED_OUT", null)); return { error: null }; },
      updateUser: async () => ({ data: {}, error: null }),
    },
  };
}
