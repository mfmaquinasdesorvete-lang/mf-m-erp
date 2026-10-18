// =====================================================================
// MODO DEMONSTRAÇÃO (VITE_DEMO=1)
// Substitui o Supabase por um banco em memória com dados de exemplo e
// simula as Edge Functions (Focus NFe, avisos). Nada sai do navegador e
// tudo volta ao estado inicial ao recarregar a página.
// =====================================================================

import { EXEMPLOS, TIPOS_PADRAO } from "./avisos";
import { configPreco, foraDaFaixa, margemAlvo, PRECO_PADRAO, precoSugerido } from "./precificacao";
import { percentualPedido } from "./comissao";
import { consumoEstrutura, custoEstrutura, temFicha, type LinhaFicha } from "./estrutura";
import { pecasDoKit } from "./kits";
import { modeloDaMensagem, nomeModelo } from "../../supabase/functions/_shared/whatsapp-modelos";
import { cfopDaOperacao, chaveValida, operacaoNota } from "../../supabase/functions/_shared/nfe-operacoes";
import { pendencias as pendenciasConta, quemPode, regrasDe, type ContaRevisao, type TipoConta } from "./aprovacao";
import { gerarLinhaBancaria } from "./boleto";
import { analisarAprovacao, cargaComparavel, freteDivergente, totalCotacao, type CotacaoEnvio, type Envio } from "./fretes";
import { gerarParcelas } from "./parcelamentos";
import { totaisOc, type ItemOc } from "./ordemCompra";
import { ultimoDiaUtil } from "./obrigacoes";
import { conferirAgendamento, frequenciaDe, type FrequenciaColeta } from "./coleta";
import { faltaParaCotarRte } from "../../supabase/functions/_shared/rodonaves";

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
  { user_id: "u-admin", nome: "Admin Exemplo", papel: "admin", email: "admin@exemplo.com.br" },
  { user_id: "u-vendas", nome: "Carla Vendas", papel: "vendas", email: "vendas@mfmaquinas.com.br" },
  { user_id: "u-fin", nome: "Rafael Financeiro", papel: "financeiro", email: "financeiro@mfmaquinas.com.br" },
  { user_id: "u-tec", nome: "Diego Técnico", papel: "tecnico", email: "assistencia@mfmaquinas.com.br" },
  { user_id: "u-cont", nome: "Escritório Contábil Exemplo", papel: "contador", email: "contador@escritorio.com.br" },
  { user_id: "u-exp", nome: "Lucas Expedição", papel: "expedicao", email: "expedicao@mfmaquinas.com.br" },
  { user_id: "u-mkt", nome: "Bruna Marketplaces", papel: "marketplace", email: "marketplaces@mfmaquinas.com.br" },
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
      ...u, ativo: true, created_at: quando(-200 + i), ultimo_acesso: quando(-i), avisos: {}, trocar_senha: false,
      papeis_extras: u.user_id === "u-vendas" ? ["tecnico"] : [], cargo: ({ "u-admin": "Diretora", "u-vendas": "Vendedora", "u-fin": "Financeiro", "u-tec": "Técnico de campo", "u-cont": "Contabilidade", "u-exp": "Estoquista" } as Record<string, string>)[u.user_id] ?? null,
      telefone: u.user_id === "u-cont" ? null : "4899999" + String(1000 + i),
      telegram_chat_id: ["u-fin", "u-tec"].includes(u.user_id) ? 5000 + i : null,
    })),
    configuracoes: [{
      id: 1, aprovacao_revisor1: ["u-admin"], aprovacao_revisor2: ["u-fin"], aprovacao_alcada: 300, razao_social: "MF MÁQUINAS LTDA", nome_fantasia: "MF Máquinas", cnpj: "46942855000132",
      inscricao_estadual: "261770233", uf: "SC", municipio: "São José", whatsapp: "4833755280",
      regime_tributario: 1, natureza_operacao: "Venda de mercadoria", cfop_padrao: "5102", icms_situacao_padrao: "102",
      pis_situacao_padrao: "49", cofins_situacao_padrao: "49", presenca_comprador: 9, dias_vencimento_boleto: 3,
      multa_percentual: 2, juros_percentual_mes: 1, entrada_automatica_estoque: true, conta_pagar_automatica: true,
      endereco: "Rua Leonel Felisbino da Silva, S/N, Q 4 - L 9 - Galpão 6, Areias - CEP 88113-837", telefone: "(48) 3375-5280", email: "mfmaquinasdesorvete@gmail.com",
      catalogo_texto: "Máquinas de sorvete soft, expresso e milk shake com garantia, peças e assistência técnica própria.",
      telegram_bot: "MFMaquinasAvisosBot", avisos_email_ativo: true, email_responder_para: "comercial@mfmaquinas.com.br",
      ibs_cbs_ativo: true, cbs_aliquota: 0.9, ibs_uf_aliquota: 0.1, ibs_mun_aliquota: 0,
      validade_orcamento_dias: 7, garantia_meses_padrao: 12, taxa_diagnostico_video: 150, preventiva_meses: 6, comissao_percentual: 3, precificacao: PRECO_PADRAO,
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
      { id: "f4", nome: "Cadastro Nacional de Empresas", cnpj: "44555666000181", municipio: "São Paulo", uf: "SP", bloqueado: true,
        bloqueio_motivo: "Golpe: boleto falso que chega todo mês. Não pagar.", bloqueado_em: quando(-3), bloqueado_por_nome: "Administrador" },
      // marca com filiais (nomes e CNPJs inventados) e um repetido sem CNPJ na mesma cidade
      { id: "f5", nome: "Distribuidora Frio Exemplo S.A.", nome_fantasia: "Frio Exemplo", cnpj: "55666777000101", telefone: "5130001000", municipio: "Porto Alegre", uf: "RS", receita_situacao: "ATIVA",
        rede: [{ municipio: "Recife", uf: "PE", endereco: "Av. Exemplo, 100", telefone: "8130001000", origem: "site da marca" }] },
      { id: "f6", nome: "Distribuidora Frio Exemplo S.A.", nome_fantasia: "Frio Exemplo", cnpj: "55666777000282", telefone: "4830002000", municipio: "São José", uf: "SC", matriz_id: "f5", receita_situacao: "ATIVA" },
      { id: "f7", nome: "Distribuidora Frio Exemplo S.A.", nome_fantasia: "Frio Exemplo", cnpj: "55666777000363", telefone: "1130003000", municipio: "Osasco", uf: "SP", matriz_id: "f5", receita_situacao: "ATIVA" },
      { id: "f8", nome: "Frio Exemplo - São José/SC", cnpj: null, telefone: "4830002000", municipio: "São José", uf: "SC", matriz_id: "f5" },
      // a mesma empresa das transportadoras (raiz do CNPJ igual): a fatura de frete lançada como "fornecedores" vira Transportadoras
      { id: "f9", nome: "Rodonaves Transportes e Encomendas Ltda", cnpj: "44914992000138", municipio: "Ribeirão Preto", uf: "SP" },
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
      { id: "sv1", sku: "SV-GAS", descricao: "Carga de gás (serviço)", tipo: "servico", unidade: "UN", ncm: "00000000", origem: 0, preco_custo: 90, preco_venda: 250, estoque_atual: 0, estoque_minimo: 0, ativo: true, vendavel: true, gtin_isento: true },
      { id: "sv2", sku: "SV-LIMPEZA", descricao: "Limpeza e lavagem (serviço)", tipo: "servico", unidade: "UN", ncm: "00000000", origem: 0, preco_custo: 0, preco_venda: 180, estoque_atual: 0, estoque_minimo: 0, ativo: true, vendavel: true, gtin_isento: true },
      { id: "p9", sku: "AC-CASQ-500", descricao: "Suporte para casquinhas inox (20 un.)", tipo: "acessorio", unidade: "UN", ncm: "73239900", origem: 0, preco_custo: 85, preco_venda: 189, estoque_atual: 14, estoque_minimo: 5, ativo: true },
      { id: "p10", sku: "IN-LUB-ALIM", descricao: "Lubrificante grau alimentício 250 g", tipo: "insumo", unidade: "UN", ncm: "34031900", origem: 0, preco_custo: 22, preco_venda: 49, estoque_atual: 30, estoque_minimo: 10, ativo: true },
      { id: "p11", sku: "CP-CABO-001", descricao: "Uso Interno - Cabo PP 3x4,00 mm", tipo: "insumo", unidade: "MT", ncm: "85444900", origem: 0, preco_custo: 18.5, preco_venda: 0, estoque_atual: 120, estoque_minimo: 50, ativo: true, vendavel: false },
      // subconjunto: tem a própria ficha e entra na ficha da MF-300
      { id: "psc1", sku: "SC-PAINEL-300", descricao: "Painel elétrico montado MF-300", tipo: "insumo", unidade: "UN", ncm: "85371020", origem: 0, preco_custo: 0, preco_venda: 0, estoque_atual: 0, estoque_minimo: 0, ativo: true, vendavel: false, subconjunto_estocado: false },
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
      { id: "cp3", descricao: "Aluguel do galpão", categoria: "aluguel", valor: 6500, vencimento: dias(-2), status: "aberto", decisao: "pagar", pagar_em: dias(0), decisao_por_nome: "Fabiano", decisao_em: quando(-1) },
      { id: "cp4", descricao: "Energia elétrica", categoria: "energia/água/internet", valor: 1380, vencimento: dias(8), status: "aberto", decisao: "agendado", pagar_em: dias(6), decisao_por_nome: "Fabiano", decisao_em: quando(-1) },
      { id: "cpg1", descricao: "Taxa de cadastro nacional", fornecedor_id: "f4", categoria: "fornecedores", valor: 389.9, vencimento: dias(6), status: "aberto", decisao: "nao_pagar",
        decisao_motivo: "Fornecedor bloqueado (golpe): Golpe: boleto falso que chega todo mês. Não pagar.", decisao_por_nome: "ERP (fornecedor bloqueado)", decisao_em: quando(-1) },
      { id: "cp20", descricao: "Manutenção da empilhadeira", categoria: "manutenção", valor: 2240, vencimento: dias(3), status: "aberto", decisao: "nao_pagar", decisao_motivo: "Esperando boleto ou NF correta", decisao_por_nome: "Fabiano", decisao_em: quando(-2) },
      { id: "cp21", descricao: "Frete Braspress - NF 1290", categoria: "fretes", valor: 386.4, vencimento: dias(0), status: "aberto" },
      { id: "cp5", descricao: "DAS Simples Nacional", categoria: "impostos", valor: 3920, vencimento: dias(-12), status: "pago", data_pagamento: dias(-13), valor_pago: 3920 },
      // esperando aprovação: o financeiro (2º revisor) faz a 1ª das lançadas pela administradora e a 2ª das que ela já revisou
      { id: "cpa1", descricao: "Fatura de fretes 5521", fornecedor_id: "f9", categoria: "fornecedores", documento: "Fatura 5521", valor: 1280.5, vencimento: dias(3), status: "aberto", revisao: "em_revisao", lancamento: "manual", criado_por: "u-admin" },
      { id: "cpa2", descricao: "NF 48390 - Refrigeração Andrade Ltda", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48390", valor: 2890, vencimento: dias(6), status: "aberto", revisao: "em_revisao",
        lancamento: "manual", criado_por: "u-vendas", revisao1_por: "u-admin", revisao1_nome: "Admin Exemplo", revisao1_em: quando(-1), exige_2a: true, motivo_2a: "valor a partir de R$ 300,00" },
      { id: "cpa3", descricao: "Salários de outubro", categoria: "folha", documento: "Folha 10/2026", valor: 4000, vencimento: dias(2), status: "aberto", revisao: "em_revisao", lancamento: "manual", criado_por: "u-admin" },
      { id: "cpa4", descricao: "DARF IRPJ trimestral", categoria: "impostos", valor: 1750, vencimento: dias(-1), status: "aberto", revisao: "em_revisao", lancamento: "manual", criado_por: "u-admin" },
      { id: "cpa5", descricao: "Honorários contábeis", categoria: "serviços profissionais", documento: "NFS-e 812", valor: 1500, vencimento: dias(9), status: "aberto", revisao: "aprovado", revisao1_nome: "Admin Exemplo", revisao1_em: quando(-2) },
      { id: "cpa6", descricao: "Internet fibra da fábrica", categoria: "energia/água/internet", valor: 189.9, vencimento: dias(4), status: "aberto", revisao: "devolvido",
        revisao_comentario: "Falta anexar o boleto", lancamento: "manual", criado_por: "u-fin" },
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
      { id: "nfh", pedido_id: null, referencia: "pedido-1-teste", status: "autorizada", numero: "431", serie: "1", chave: "42261011222333000181550010000004311000004310", valor_total: 30, ambiente: "homologacao", created_at: quando(-1), destinatario_nome: "Cliente Teste", mensagem: "Autorizado o uso da NF-e" },
      { id: "nf2", pedido_id: "pd2", referencia: "pedido-102-1", status: "autorizada", numero: "1301", serie: "1", chave: "35261012345678000190550010000013011000013010", valor_total: 29000, mensagem: "Autorizado o uso da NF-e", created_at: quando(-5) },
    ],
    nfe_cartas_correcao: [],
    nfe_inutilizacoes: [],
    // painel pessoal do administrador (exemplos inventados; no sistema real: public.pessoal_contas e pessoal_lancamentos, só o dono lê)
    pessoal_contas: [
      { id: "pc1", nome: "Conta pessoal", tipo: "corrente", banco: "Banco Exemplo", cor: "sky", saldo_inicial: 4200, saldo_inicial_em: dias(-40), limite: null, ativa: true, ordem: 0 },
      { id: "pc2", nome: "Cartão pessoal", tipo: "cartao", banco: "Cartão Exemplo", cor: "violet", saldo_inicial: 0, saldo_inicial_em: dias(-40), limite: 8000, ativa: true, ordem: 1 },
      { id: "pc3", nome: "Reserva", tipo: "investimento", banco: "Corretora Exemplo", cor: "emerald", saldo_inicial: 15000, saldo_inicial_em: dias(-40), limite: null, ativa: true, ordem: 2 },
    ],
    pessoal_lancamentos: [
      { id: "pl1", conta_id: "pc1", data: dias(-12), descricao: "Pró-labore", valor: 6000, categoria: "Salário e pró-labore", situacao: "realizado", anulado: false },
      { id: "pl2", conta_id: "pc1", data: dias(-10), descricao: "Aluguel do apartamento", valor: -2200, categoria: "Casa", situacao: "realizado", anulado: false },
      { id: "pl3", conta_id: "pc2", data: dias(-8), descricao: "Supermercado Exemplo", valor: -640.35, categoria: "Mercado", situacao: "realizado", anulado: false },
      { id: "pl4", conta_id: "pc2", data: dias(-6), descricao: "Drogaria Exemplo", valor: -89.9, categoria: "Saúde", situacao: "realizado", anulado: false },
      { id: "pl5", conta_id: "pc2", data: dias(-4), descricao: "Streaming de vídeo", valor: -55.9, categoria: "Assinaturas", situacao: "realizado", anulado: false },
      { id: "pl6", conta_id: "pc1", data: dias(-3), descricao: "Posto de combustível", valor: -250, categoria: "Transporte", situacao: "realizado", anulado: false },
      { id: "pl7", conta_id: "pc3", data: dias(-2), descricao: "Rendimento da reserva", valor: 128.4, categoria: "Investimentos", situacao: "realizado", anulado: false },
      { id: "pl8", conta_id: "pc1", data: dias(5), descricao: "Escola", valor: -1350, categoria: "Educação", situacao: "previsto", anulado: false },
      { id: "pl9", conta_id: "pc1", data: dias(9), descricao: "Fatura do cartão pessoal", valor: -786.15, categoria: "Cartão (fatura)", situacao: "previsto", anulado: false },
      { id: "pl10", conta_id: "pc1", data: dias(-15), descricao: "PAGTO FINANC VEIC 08/48", valor: -1890.45, categoria: "Transporte", situacao: "realizado", anulado: false },
      { id: "pl11", conta_id: "pc2", data: dias(-7), descricao: "IFOOD *RESTAURANTE EXEMPLO", valor: -78.9, categoria: "Lazer", situacao: "realizado", anulado: false },
      { id: "pl12", conta_id: "pc2", data: dias(-1), descricao: "IFOOD *LANCHES EXEMPLO", valor: -45.5, categoria: "Lazer", situacao: "realizado", anulado: false },
      { id: "pl13", conta_id: "pc1", data: dias(-11), descricao: "PAGAMENTO DARF 2089", valor: -1320, categoria: "Impostos e taxas", situacao: "realizado", anulado: false },
      { id: "pl14", conta_id: "pc1", data: dias(-14), descricao: "UNIMED EXEMPLO", valor: -980, categoria: "Saúde", situacao: "realizado", anulado: false },
      { id: "pl15", conta_id: "pc1", data: dias(-9), descricao: "PIX ENVIADO GELADOS EXEMPLO", valor: -3000, categoria: "Transferências", situacao: "realizado", anulado: false },
      { id: "pl16", conta_id: "pc1", data: dias(-5), descricao: "TARIFA PACOTE DE SERVICOS", valor: -39.9, categoria: "Impostos e taxas", situacao: "realizado", anulado: false },
      { id: "pl17", conta_id: "pc1", data: dias(-36), descricao: "UNIMED EXEMPLO", valor: -980, categoria: "Saúde", situacao: "realizado", anulado: false },
      { id: "pl18", conta_id: "pc1", data: dias(-13), descricao: "JUROS LIMITE DA CONTA", valor: -412.37, categoria: "Impostos e taxas", situacao: "realizado", anulado: false },
      { id: "pl19", conta_id: "pc1", data: dias(-44), descricao: "JUROS LIMITE DA CONTA", valor: -388.1, categoria: "Impostos e taxas", situacao: "realizado", anulado: false },
      { id: "pl20", conta_id: "pc1", data: dias(-15), descricao: "MULTA FINANC VEIC", valor: -77.54, categoria: "Transporte", situacao: "realizado", anulado: false },
      { id: "pl21", conta_id: "pc1", data: dias(-8), descricao: "PIX QRS CONECTCAR", valor: -150, categoria: "Transporte", situacao: "realizado", anulado: false },
      { id: "pl22", conta_id: "pc1", data: dias(-6), descricao: "PIX TRANSF FULANO EX06 10", valor: -1200, categoria: "Transferências", situacao: "realizado", anulado: false },
      { id: "pl23", conta_id: "pc1", data: dias(-4), descricao: "PAG BOLETO TAB DE NOTAS", valor: -1476.88, categoria: "Outros", situacao: "realizado", anulado: false },
      { id: "pl24", conta_id: "pc1", data: dias(-3), descricao: "PIX QRS FACEBOOK SE", valor: -250, categoria: "Transferências", situacao: "realizado", anulado: false },
      { id: "pl25", conta_id: "pc1", data: dias(-2), descricao: "PAG BOLETO TELEFONIA EXEMPLO", valor: -189.9, categoria: "Casa", situacao: "realizado", anulado: false },
      { id: "pl26", conta_id: "pc1", data: dias(-12), descricao: "DA OPERADORA BL IT 1234", valor: -317.17, categoria: "Casa", situacao: "realizado", anulado: false, identificador: "20261006001" },
      { id: "pl27", conta_id: "pc1", data: dias(-12), descricao: "DA OPERADORA BL/IT 1234", valor: -317.17, categoria: "Casa", situacao: "realizado", anulado: false, identificador: "pdf:demo-1" },
      { id: "pl28", conta_id: "pc1", data: dias(-1), descricao: "REND PAGO APLIC AUT MAIS", valor: 0.12, categoria: "Investimentos", situacao: "realizado", anulado: false },
    ],
    // regras dos cards do painel pessoal (no sistema real: public.pessoal_regras, só o dono lê)
    pessoal_regras: [
      { id: "pr1", texto: "transf fulano ex / fulano exemplo", card: "comissoes", rotulo: "Fulano Exemplo", sentido: "saida", da_empresa: false, observacao: null, meta_total: null, parcelas: null, ativa: true, ordem: 1 },
      { id: "pr2", texto: "telefonia exemplo", card: "Telefones da fábrica", rotulo: null, sentido: "ambos", da_empresa: true, observacao: "Linhas da fábrica pagas pela conta pessoal", meta_total: null, parcelas: null, ativa: true, ordem: 2 },
      { id: "pr3", texto: "pag boleto itau", card: "cartoes", rotulo: null, sentido: "saida", da_empresa: false, observacao: "Cartões do banco cancelados", meta_total: null, parcelas: null, ativa: true, ordem: 3 },
    ],
    pessoal_conexoes: [],
    pessoal_enderecos: [
      { id: "pe1", endereco: "Rua Exemplo, 100 – Centro – Cidade Exemplo/SC", lembranca: null, periodo: null, atual: true, ordem: 0 },
      { id: "pe2", endereco: "Avenida Teste, 200 – Bairro Antigo – Cidade Exemplo/SC", lembranca: "Primeira casa e onde nasceu a primeira empresa", periodo: "2015 a 2019", atual: false, ordem: 1 },
    ],
    pessoal_empresas: [
      { id: "pq1", cnpj: "11222333000181", razao_social: "EMPRESA EXEMPLO LTDA", nome_fantasia: "Exemplo", situacao: "ATIVA", data_situacao: "2020-03-10", abertura: "2020-03-10", natureza: "206-2 - Sociedade Empresária Limitada", porte: "Empresa de pequeno porte (EPP)", cnae: "2829-1/99 Fabricação de outras máquinas", municipio: "Cidade Exemplo", uf: "SC", capital_social: 100000, qualificacao: "Sócia-administradora", entrada: "2020-03-10", saida: null, lembranca: null, fonte: null, conferido_em: quando(-3), ordem: 0, socios: [{ nome: "ADMIN EXEMPLO", qualificacao: "Sócio-Administrador", entrada: "2020-03-10" }] },
      { id: "pq2", cnpj: "11444777000161", razao_social: "LOJA TESTE LTDA", nome_fantasia: "Loja Teste", situacao: "BAIXADA", data_situacao: "2024-02-25", abertura: "2017-06-25", natureza: null, porte: null, cnae: null, municipio: "Cidade Exemplo", uf: "SC", capital_social: 50000, qualificacao: null, entrada: null, saida: null, lembranca: "A primeira loja", fonte: null, conferido_em: null, ordem: 1, socios: null },
    ],
    // data real em que virou cliente (no sistema real: a view public.clientes_desde)
    clientes_desde: [
      { cliente_id: "c1", desde: "2019-03-12", fonte: "compra_maquina" }, { cliente_id: "c2", desde: "2022-08-05", fonte: "my_frost" },
      { cliente_id: "c3", desde: "2024-11-20", fonte: "proposta" },
    ],
    // correções sugeridas para o cadastro (no sistema real: public.produto_sugestoes, gerar/aplicar/ignorar_sugestoes_produtos)
    produto_sugestoes: [
      { id: "ps1", produto_id: "p4", campo: "marca", valor: "WEG", fonte: "regra", confianca: "alta", detalhe: "o nome do produto cita a marca", situacao: "pendente", criado_em: quando(-1) },
      { id: "ps2", produto_id: "p6", campo: "ncm", valor: "85371090", fonte: "analise", confianca: "media", detalhe: "placa controladora montada: 8537.10.90 (confirmar com o contador)", situacao: "pendente", criado_em: quando(-1) },
      { id: "ps3", produto_id: "p7", campo: "categoria", valor: "Peças de reposição", fonte: "produto_parecido", confianca: "media", detalhe: "outros bicos dosadores estão nessa categoria", situacao: "pendente", criado_em: quando(-1) },
      { id: "ps4", produto_id: "p11", campo: "categoria", valor: "Componentes elétricos", fonte: "analise", confianca: "baixa", detalhe: "cabo elétrico de uso interno", situacao: "pendente", criado_em: quando(-1) },
      { id: "ps5", produto_id: "p5", campo: "codigo_barras", valor: "7891234567895", fonte: "nota_fornecedor", confianca: "alta", detalhe: "NF 93321 de Inox Paulista Componentes (mesmo código do fornecedor)", situacao: "pendente", criado_em: quando(-1) },
      { id: "ps6", produto_id: "p8", campo: "ncm", valor: null, fonte: "regra", confianca: "conferir", detalhe: "conferir se o NCM é o da peça e não o da máquina", situacao: "pendente", criado_em: quando(-1) },
      { id: "ps7", produto_id: "psc1", campo: "preco_custo", valor: "386.4", fonte: "ficha_tecnica", confianca: "alta", detalhe: "soma das peças da ficha técnica", situacao: "pendente", criado_em: quando(-1) },
    ],
    marcadores: [
      { id: "mk1", nome: "1ª venda", cor: "indigo", icone: "star", ativo: true, ordem: 1 }, { id: "mk2", nome: "Pago", cor: "emerald", icone: "circle-check", ativo: true, ordem: 2 },
      { id: "mk3", nome: "Aguardando pagamento", cor: "amber", icone: "clock", ativo: true, ordem: 3 }, { id: "mk4", nome: "Carta de correção", cor: "orange", icone: "file-pen", ativo: true, ordem: 4 },
      { id: "mk5", nome: "Enviado ao cliente", cor: "sky", icone: "send", ativo: true, ordem: 5 }, { id: "mk6", nome: "Garantia", cor: "slate", icone: "shield", ativo: true, ordem: 6 },
      { id: "mk7", nome: "Devolução", cor: "purple", icone: "undo-2", ativo: true, ordem: 7 }, { id: "mk8", nome: "Conferir", cor: "red", icone: "triangle-alert", ativo: true, ordem: 8 },
      { id: "mk9", nome: "Quiosques", cor: "amber", icone: "package", ativo: true, ordem: 9 },
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
        // XML completo (só os totais, para o Analista fiscal ler o ICMS destacado)
        xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vBC>8100.00</vBC><vICMS>972.00</vICMS><vST>0.00</vST><vProd>8100.00</vProd><vFrete>0.00</vFrete><vIPI>0.00</vIPI><vPIS>133.65</vPIS><vCOFINS>615.60</vCOFINS><vNF>8100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
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
      {
        // nota antiga (histórico do sistema anterior): os itens servem para ligar cadastro e fornecedores
        id: "nr4", chave: "42261033444555000181550010000127741000127740", emitente_nome: "Casa das Peças Refrigeração", emitente_cnpj: "33444555000181",
        valor_total: 1386, data_emissao: quando(-40), situacao: "autorizada", manifestacao: "ciencia", fornecedor_id: "f3", conta_pagar_id: null,
        estoque_lancado: false, processamento: "ignorada", processamento_msg: "Histórico: já lançada no sistema anterior.", origem: "xml", created_at: quando(-40),
        itens: [
          { numero: 1, codigo: "MTB-12", ean: "7891234567895", descricao: "MOTOR BATEDOR 1/2CV 220V", ncm: "85015210", cfop: "5102", unidade: "UN", quantidade: 2, valor_unitario: 405, valor_total: 810 },
          { numero: 2, codigo: "KV-300", ean: null, descricao: "KIT VEDACAO CILINDRO MF300", ncm: "40169300", cfop: "5102", unidade: "UN", quantidade: 6, valor_unitario: 41, valor_total: 246 },
          { numero: 3, codigo: "PAP-A4", ean: null, descricao: "PAPEL SULFITE A4 CHAMEX 500 FLS", ncm: "48025610", cfop: "5102", unidade: "PCT", quantidade: 5, valor_unitario: 30, valor_total: 150 },
          { numero: 4, codigo: "PS-M6X20", ean: null, descricao: "PARAFUSO SEXTAVADO INOX M6 X 20", ncm: "73181500", cfop: "5102", unidade: "CX", quantidade: 2, valor_unitario: 90, valor_total: 180 },
        ],
      },
    ],
    produto_fornecedor: [
      { id: "pf1", fornecedor_id: "f1", codigo_fornecedor: "CMP-1HP-404", produto_id: "p8", fator_conversao: 1 },
      { id: "pf2", fornecedor_id: "f2", codigo_fornecedor: "BD-INOX-01", produto_id: "p7", fator_conversao: 10 },
    ],
    transportadoras: [
      { id: "t1", nome: "Rodonaves Transportes e Encomendas Ltda", nome_fantasia: "Rodonaves", whatsapp: "16997770001", regioes: "SP, MG, GO, PR", ativo: true, tipo: "transportadora",
        site: "https://www.rodonaves.com.br", rastreio_url: "https://rodonaves.com.br/rastreio-de-mercadoria", api: "sim", api_doc_url: "https://dev.rodonaves.com.br/",
        api_recursos: ["cotacao", "rastreio", "coleta", "comprovante"], api_como_obter: "Pedir o acesso ao comercial da unidade.", servicos: ["fracionado", "expresso", "aereo"],
        abrangencia: ["SP", "SC", "PR", "MG"], pesquisa_em: quando(-1), pesquisa_fontes: ["https://dev.rodonaves.com.br/"],
        contatos: [{ nome: "Equipe comercial 133", cargo: "Comercial", email: "comercial.133@exemplo.com", telefone: "(48) 3202-7150", filial: "Biguaçu-SC" }],
        emails_operacionais: [{ email: "coleta.133@exemplo.com", uso: "pedir coleta" }],
        condicoes: "• Reajuste de 12,8% a partir de 05/10/2025.\n• Cotação vale 15 dias.", ultimo_contato: dias(-15),
        rede: [{ nome: "Unidade 766 - Vinhedo", municipio: "Vinhedo", uf: "SP", telefone: "(19) 3341-4200", origem: "e-mail" }] },
      { id: "t4", nome: "Rodonaves Transportes e Encomendas Ltda", nome_fantasia: "Rodonaves · Biguaçu", cnpj: "44914992002424", municipio: "Biguaçu", uf: "SC", telefone: "4832027150", ativo: true, tipo: "transportadora", matriz_id: "t1" },
      { id: "t5", nome: "Rodonaves Transportes e Encomendas Ltda", nome_fantasia: "Rodonaves · Ribeirão Preto", cnpj: "44914992000138", municipio: "Ribeirão Preto", uf: "SP", ativo: true, tipo: "transportadora", matriz_id: "t1" },
      { id: "t2", nome: "Braspress Transportes Urgentes Ltda", nome_fantasia: "Braspress", whatsapp: "11997770002", regioes: "Todo o Brasil", ativo: true, tipo: "transportadora",
        site: "https://www.braspress.com", api: "sim", api_recursos: ["cotacao", "rastreio"], api_doc_url: "https://api.braspress.com/home", pesquisa_em: quando(-1) },
      { id: "t3", nome: "Transportes Mogiana", whatsapp: "16997770003", regioes: "Interior de SP", ativo: true, tipo: "transportadora" },
      { id: "t6", nome: "Expresso São Miguel S.A.", nome_fantasia: "São Miguel", ativo: true, tipo: "transportadora", site: "https://www.expressosaomiguel.com.br", api: "parcial",
        api_recursos: ["rastreio", "comprovante"], servicos: ["fracionado"], abrangencia: ["SC", "PR", "RS", "SP"], pesquisa_em: quando(-1), conferido_em: quando(0), conferido_por: "Fabiano",
        contatos: [{ nome: "Atendimento Palhoça", email: "atendimento@exemplo.com", telefone: "(48) 3382-1300", filial: "Palhoça-SC" }],
        rede: [{ nome: "Filial Joinville", cnpj: "00428307001089", municipio: "Joinville", uf: "SC", origem: "e-mail" }, { nome: "Filial Palhoça", cnpj: "00428307001160", municipio: "Palhoça", uf: "SC", origem: "e-mail" }] },
      { id: "t7", nome: "Expresso São Miguel S.A.", nome_fantasia: "São Miguel · Palhoça", cnpj: "00428307001160", municipio: "Palhoça", uf: "SC", telefone: "4833821300", email: "atendimento@exemplo.com", ativo: true, tipo: "transportadora", matriz_id: "t6" },
      { id: "t8", nome: "Expresso São Miguel S.A.", nome_fantasia: "São Miguel · Campinas", cnpj: "00428307001917", municipio: "Campinas", uf: "SP", ativo: true, tipo: "transportadora", matriz_id: "t6" },
      { id: "t9", nome: "Expresso São Miguel - Curitiba/Pr", cnpj: "00428307001240", municipio: "Curitiba", uf: "PR", telefone: "4135673100", ativo: true, tipo: "transportadora" },
      { id: "t10", nome: "Correios", nome_fantasia: "Correios", ativo: true, tipo: "correios", site: "https://www.correios.com.br", api: "sim", api_recursos: ["cotacao", "rastreio", "etiqueta"], pesquisa_em: quando(-1) },
      { id: "t11", nome: "Correios Pac", ativo: true, tipo: "correios", matriz_id: "t10" },
      { id: "t12", nome: "Melhor Envio", nome_fantasia: "Melhor Envio", ativo: true, tipo: "plataforma", site: "https://melhorenvio.com.br", api: "sim", api_recursos: ["cotacao", "etiqueta", "rastreio"],
        integracoes: ["Jadlog", "Latam Cargo", "Azul Cargo", "Correios", "Loggi"], pesquisa_em: quando(-1) },
      { id: "t13", nome: "Fedex Brasil (Tnt Mercúrio)", nome_fantasia: "Fedex", ativo: true, tipo: "transportadora", api: "sim",
        alerta: "Na internet consta que a FedEx encerrou coletas e entregas dentro do Brasil em 06/02/2026. Confirme antes de cotar.", pesquisa_em: quando(-1) },
    ],
    cotacoes_frete: [
      { id: "cf1", pedido_id: "pd4", transportadora_id: "t1", valor: 690, prazo_dias: 4, observacoes: "coleta amanhã", escolhida: false, created_at: quando(-1) },
      { id: "cf2", pedido_id: "pd4", transportadora_id: "t2", valor: 845, prazo_dias: 3, observacoes: "seguro incluso", escolhida: false, created_at: quando(-1) },
    ],
    produto_componentes: [
      { id: "pc1", produto_id: "p1", componente_id: "p4", quantidade: 1 },
      { id: "pc2", produto_id: "p1", componente_id: "p8", quantidade: 1 },
      { id: "pc3", produto_id: "p1", componente_id: "psc1", quantidade: 1 },
      { id: "pc11", produto_id: "psc1", componente_id: "p6", quantidade: 1 },
      { id: "pc12", produto_id: "psc1", componente_id: "p11", quantidade: 2.5 },
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
    tecnicos: [
      { id: "tc1", nome: "Rafael Souza", tipo: "interno", whatsapp: "48999990001", municipio: "São José", uf: "SC", ufs: ["SC"], cidades: [], especialidades: "refrigeração e parte elétrica", ativo: true, created_at: quando(-30) },
      { id: "tc2", nome: "Marcos Refrigeração", tipo: "parceiro", whatsapp: "34999990002", municipio: "Uberlândia", uf: "MG", ufs: [], cidades: ["Uberlândia/MG", "Uberaba/MG"], especialidades: "máquinas de sorvete expresso", ativo: true, created_at: quando(-20) },
    ],
    produtos_midia: [],
        fornecimentos: [
      { id: "fm1", produto_id: "p4", fornecedor_id: "f1", codigo_fornecedor: "MT-050", preco: 410, preco_em: dias(-40), preco_origem: "nota", prazo_dias: 7, preferido: true, ativo: true, ultima_compra_em: dias(-40) },
      { id: "fm2", produto_id: "p5", fornecedor_id: "f2", codigo_fornecedor: "VD-KIT-22", preco: 38.5, preco_em: dias(-25), preco_origem: "nota", prazo_dias: 10, preferido: true, ativo: true, ultima_compra_em: dias(-25) },
      { id: "fm3", produto_id: "p5", fornecedor_id: "f1", codigo_fornecedor: null, preco: 44.9, preco_em: dias(-60), preco_origem: "cotacao", prazo_dias: 5, preferido: false, ativo: true, ultima_compra_em: null },
      { id: "fm4", produto_id: "p6", fornecedor_id: "f3", codigo_fornecedor: "ECV3", preco: 610, preco_em: dias(-4), preco_origem: "pedido", prazo_dias: 12, preferido: true, ativo: true, ultima_compra_em: null },
      { id: "fm5", produto_id: "p7", fornecedor_id: "f2", codigo_fornecedor: "BD-INOX", preco: 62, preco_em: dias(-25), preco_origem: "nota", prazo_dias: 10, preferido: true, ativo: true, ultima_compra_em: dias(-25) },
      { id: "fm6", produto_id: "p8", fornecedor_id: "f1", codigo_fornecedor: "CP1HP", preco: 1350, preco_em: dias(-9), preco_origem: "pedido", prazo_dias: 9, preferido: true, ativo: true, ultima_compra_em: dias(-9) },
    ],
    cotacoes: [
      { id: "cot1", numero: 1, titulo: "Vedação e bicos", status: "enviada", prazo_resposta: dias(2), entrega_desejada: dias(15), observacoes: "Entrega em São José/SC",
        unidade_id: null, enviada_em: quando(-1), created_at: quando(-1) },
    ],
    cotacao_itens: [
      { id: "cti1", cotacao_id: "cot1", produto_id: "p5", descricao: "Kit vedação do cilindro", quantidade: 30, unidade: "UN", ordem: 0 },
      { id: "cti2", cotacao_id: "cot1", produto_id: "p7", descricao: "Bico dosador inox", quantidade: 20, unidade: "UN", ordem: 1 },
    ],
    cotacao_fornecedores: [
      { id: "ctf1", cotacao_id: "cot1", fornecedor_id: "f2", token: "c0ca0000-0000-4000-8000-000000000001", email: "pedidos@inoxpaulista.com.br", status: "respondida", enviado_em: quando(-1),
        visto_em: quando(-1), respondido_em: quando(0), respondido_por: "Marcos", condicao_pagamento: "28 dias boleto", prazo_entrega_dias: 10, frete: 60, frete_tipo: "FOB", validade: dias(10), created_at: quando(-1) },
      { id: "ctf2", cotacao_id: "cot1", fornecedor_id: "f1", token: "c0ca0000-0000-4000-8000-000000000002", email: "vendas@refriandrade.com.br", status: "respondida", enviado_em: quando(-1),
        visto_em: quando(-1), respondido_em: quando(0), respondido_por: "Patrícia", condicao_pagamento: "30/60 dias", prazo_entrega_dias: 5, frete: 0, frete_tipo: "CIF", validade: dias(7), created_at: quando(-1) },
      { id: "ctf3", cotacao_id: "cot1", fornecedor_id: "f3", token: "c0ca0000-0000-4000-8000-000000000003", email: null, status: "enviada", enviado_em: quando(-1), created_at: quando(-1) },
    ],
    cotacao_respostas: [
      { id: "ctr1", cotacao_fornecedor_id: "ctf1", cotacao_item_id: "cti1", preco_unitario: 39.9, prazo_dias: 10, disponivel: true, vencedor: false },
      { id: "ctr2", cotacao_fornecedor_id: "ctf1", cotacao_item_id: "cti2", preco_unitario: 61, prazo_dias: 10, disponivel: true, vencedor: false },
      { id: "ctr3", cotacao_fornecedor_id: "ctf2", cotacao_item_id: "cti1", preco_unitario: 36.5, prazo_dias: 5, disponivel: true, vencedor: false },
      { id: "ctr4", cotacao_fornecedor_id: "ctf2", cotacao_item_id: "cti2", preco_unitario: null, prazo_dias: null, disponivel: false, observacao: "Sem estoque deste modelo", vencedor: false },
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
      { id: "e8", cliente_id: "c3", produto_id: "p2", descricao: "Máquina de Sorvete Expressa MF-150 Balcão", numero_serie: "MF150-2024-0099", data_venda: dias(-480), garantia_ate: dias(-115), proxima_preventiva: dias(-40), usada: true },
      // vendida pela empresa anterior (outra empresa): sem garantia nem preventiva da MF
      { id: "e9", cliente_id: "c2", produto_id: null, descricao: "My Frost Top 300 - Máquina de Sorvete Expresso", numero_serie: null, data_venda: "2022-03-15", garantia_ate: null, proxima_preventiva: null, origem: "My Frost", origem_ref: "demo-1" },
    ],
  };
  db.clientes.forEach((c, i) => { c.avisos_email = true; c.codigo = i + 1; });
  Object.assign(db.produtos.find((p) => p.id === "p1")!, {
    especificacoes: [{ nome: "Voltagem", valor: "220 V monofásica" }, { nome: "Produção (litros/hora)", valor: "36" }, { nome: "Sabores", valor: "2 + 1 misto" }, { nome: "Gás refrigerante", valor: "R404A" }],
    etapas_producao: ["Vácuo e teste de vazamento", "Giga de teste", "Teste de produção", "Acabamento", "Adesivação + conferência final", "Placa de identificação"],
    dicas_manutencao: "Lave o cilindro e as pás todo fim de dia com água morna e detergente neutro.\nLubrifique as vedações uma vez por semana com lubrificante grau alimentício.\nDeixe 15 cm livres atrás da máquina para o ar circular.",
  });
  db.ordens_producao[0].etapas = db.produtos.find((p) => p.id === "p1")!.etapas_producao.map((nome: string, i: number) => ({ nome, feita: i < 2, por: i < 2 ? "Diego" : null, em: i < 2 ? quando(-1) : null }));
  db.equipamentos.forEach((e, i) => { e.token = `e9a00000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`; });
  db.fornecedores.forEach((f, i) => { f.codigo = i + 1; });
  db.transportadoras.forEach((t, i) => { t.codigo = i + 1; });
  db.clientes[0].nome_fantasia = "Gelato Nobre";
  db.fornecedores[0].nome_fantasia = "Refri Andrade";
  // Matriz SC e filial SP
  const fiscal = { regime_tributario: 3, natureza_operacao: "Venda de mercadoria", cfop_venda_producao: "5101", cfop_venda_revenda: "5102", icms_cst: "00", icms_reducao_base: 0,
    pis_cst: "01", pis_aliquota: 1.65, cofins_cst: "01", cofins_aliquota: 7.6, pis_cofins_exclui_icms: true, ipi_cst: "50", ipi_enquadramento: "999", difal_ativo: true,
    transf_icms_cst: "41", transf_pis_cofins_cst: "49", transf_destacar_ipi: true, transf_cbenef: null, transf_ipi_base: "custo", ativo: true, serie_nfe: 1,
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
  // cadastros repetidos que vieram do sistema antigo (Produtos → Auditoria e marketplace mostra e unifica)
  const rep = (id: string, extra: Row) => ({ id, sku: null, tipo: "peca", unidade: "UN", ncm: "84186910", origem: 0, preco_custo: 10, preco_venda: 45, estoque_atual: 0, estoque_minimo: 0, ativo: true, created_at: quando(-30), ...extra });
  db.produtos.push(
    rep("pdup1", { descricao: "Parafuso de Chave - UN", estoque_atual: 3, id_externo: "920759745" }),
    rep("pdup2", { descricao: "Parafuso de Chave - UN", id_externo: "922445508", foto_caminho: null }),
    rep("pdup3", { descricao: "Parafuso de chave", estoque_atual: 2, id_externo: "922445539" }),
    rep("pdup4", { descricao: "Motor Ventilador Exaustor My Frost", sku: "FS/4-350", ncm: "84145990", preco_custo: 261.46, preco_venda: 522.92, estoque_atual: 2, marca: "My Frost" }),
    rep("pdup5", { descricao: "Motor Ventilador Exaustor My Frost", sku: "FS/4-300 EM", ncm: "84145990", preco_custo: 285.89, preco_venda: 579, estoque_atual: 10, marca: "My Frost" }),
    rep("pdup6", { descricao: "Rele Sub Sobretensao Voltimetro 63a 220v Monofasico Regulavel", preco_custo: 111.25, preco_venda: 333.75, ncm: "85364900" }),
    rep("pdup7", { descricao: "Rele Sub Sobretensao Voltimetro 63a 220v Monofasico Regulavel", preco_custo: 111.25, preco_venda: 333.75, ncm: "85364900" }),
    rep("pdup8", { descricao: "Pistão da Chave Extratora - Simples + Vedações", sku: "PC-PISTAO-001", preco_custo: 32, preco_venda: 95.97, estoque_atual: 4 }),
    rep("pdup9", { descricao: "Pistão My Frost da Chave Extratora - Simples + Vedação", sku: "P140", preco_custo: 32, preco_venda: 95.97, codigo_fabricante: "CE-140" }),
  );
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
  db.notificacoes_ciencia = [];
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
    // extrato do Nubank que chegou por e-mail e ficou para conferir (remetente ainda não autorizado na conta)
    { id: "em-ofx", conta_id: "ec1", uid: 99, de_nome: "Nubank", de_email: "extrato@nubank.com.br", para: "comercial@mfmaquinas.com.br", assunto: "Seu extrato da conta PJ", data: quando(-0.5),
      previa: "Olá! Segue em anexo o extrato do período que você pediu.", texto: "Olá! Segue em anexo o extrato do período que você pediu.", html: null,
      anexos: [{ indice: 0, nome: "NU_9988771_extrato.ofx", tipo: "application/x-ofx", tamanho: 2400, nfe: false, extrato: true }],
      extratos: [{ indice: 0, nome: "NU_9988771_extrato.ofx", status: "aguardando", motivo: "extrato@nubank.com.br não está nos remetentes autorizados de Nubank SC", conta_id: "cb2", conta: "Nubank SC", periodo: [dias(-3), dias(-1)] }],
      lido: false, arquivado: false, cliente_id: null, fornecedor_id: null, respondido_em: null },
  ];
  historicoDemo(db);
  for (const t of ["pedidos", "ordens_servico", "contas_receber", "contas_pagar", "notas_fiscais", "nfe_recebidas", "ordens_producao", "pedidos_compra", "equipamentos"]) {
    for (const r of db[t] ?? []) r.unidade_id ??= U_SC;
  }
  recalcular(db);
  comercialDemo(db);
  bancosDemo(db);
  planoDemo(db);
  aprovacaoDemo(db);
  fretesDemo(db);
  fichaDemo(db);
  origemPagarDemo(db);
  scrumDemo(db);
  renegociacaoDemo(db);
  return db;
}

/** Cadastro completo dos clientes (CRM, vendedor, condição, crédito), pessoas de contato e fichas assinadas. */
function fichaDemo(db: Db) {
  const set = (id: string, x: Row) => Object.assign(db.clientes.find((c) => c.id === id) ?? {}, x);
  set("c1", { nome_fantasia: "Gelato Nobre", status_crm: "cliente", vendedor_id: "v1", forma_pagamento_id: "fp4", condicao_pagamento: "30 60 90", limite_credito: 50000,
    desconto_padrao: 3, email_nfe: "nfe@gelatonobre.com.br", telefone_adicional: "1633335555", website: "https://gelatonobre.com.br", inscricao_municipal: "123456",
    regime_tributario: 1, contato_observacoes: "Compras com o Marcos; boletos para a Ana no financeiro.", cobranca_diferente: false });
  set("c2", { status_crm: "negociacao", vendedor_id: "v2", condicao_pagamento: "À vista" });
  set("c3", { status_crm: "cliente", vendedor_id: "v1", data_nascimento: "1990-05-14" });
  set("c4", { status_crm: "cliente", vendedor_id: "v3", forma_pagamento_id: "fp3", limite_credito: 20000, cobranca_diferente: true,
    cobranca_cep: "74115060", cobranca_logradouro: "Rua 9", cobranca_numero: "120", cobranca_bairro: "Setor Oeste", cobranca_municipio: "Goiânia", cobranca_uf: "GO" });
  set("c5", { status_crm: "lead", compra_maquina_em: "2021-10-01" });
  db.clientes_pessoas = [
    { id: "cp1", cliente_id: "c1", nome: "Marcos Lima", setor: "Compras", email: "compras@gelatonobre.com.br", telefone: "16988880001", ramal: "21", ativo: true, created_at: quando(-60) },
    { id: "cp2", cliente_id: "c1", nome: "Ana Paula Souza", setor: "Financeiro", email: "financeiro@gelatonobre.com.br", telefone: "1633334444", ramal: "30", ativo: true, created_at: quando(-60) },
  ];
  db.clientes_assinaturas = [];
  const c1 = db.clientes.find((c) => c.id === "c1")!;
  const a: Row = { id: "as1", cliente_id: "c1", token: "4c1a7e2b-9d3f-4a51-8e6c-0b2d9f7a1c01", canal: "presencial", status: "assinado", termo: termoDemo(db), dados: fichaClienteDemo(c1, db),
    alteracoes: null, nome: "Marcos Lima", cpf: "12345678909", assinatura_png: ASSINATURA_DEMO, ip: "177.38.12.40", user_agent: "Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36",
    visualizado_em: null, assinado_em: quando(-40), expira_em: quando(-40), created_at: quando(-40) };
  a.hash = hashDemo(a);
  db.clientes_assinaturas.push(a);
  const h = (dias: number, horasDepois = 0) => new Date(Date.now() - dias * 864e5 - 6 * 36e5 + horasDepois * 36e5).toISOString();
  db.backups_registro = [0, 1, 2, 3].map((d) => ({
    id: `bk${d}`, data: h(d).slice(0, 10), status: "ok", pasta: `erp-${h(d).slice(0, 10)}`, partes: 1, tamanho: 31_400_000 - d * 120_000, sha256: "demo",
    tabelas: 74, linhas: 48_210 - d * 140, arquivos: 107, restauracao_ok: true, detalhe: null, hostinger_em: d === 0 ? null : h(d, 4), created_at: h(d),
  }));
  db.backups_registro.splice(3, 0, { id: "bkx", data: h(3).slice(0, 10), status: "erro", pasta: null, partes: null, tamanho: null, sha256: null, tabelas: null, linhas: null,
    arquivos: null, restauracao_ok: null, detalhe: "O backup de hoje falhou no GitHub (exemplo da prévia)", hostinger_em: null, created_at: h(3, 1) });
  db.clientes_assinaturas.push({ id: "as2", cliente_id: "c2", token: "4c1a7e2b-9d3f-4a51-8e6c-0b2d9f7a1c02", canal: "link", status: "pendente", termo: termoDemo(db), dados: null, alteracoes: null,
    nome: null, cpf: null, assinatura_png: null, ip: null, user_agent: null, hash: null, visualizado_em: quando(-1), assinado_em: null,
    expira_em: new Date(Date.now() + 12 * 864e5).toISOString(), created_at: quando(-3) });
}

const ASSINATURA_DEMO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAB4CAYAAADfRGj6AAAQAElEQVR4AexdCXzcxPV+T7tOYlsqAUISawMEmnI41oazpQcUSqEUylnullKgHC1H2tICLVCOlvv4A6FQzgItNyXcR6FchUI5g7RxuK9mZSeBEJBsB3tX8/9Gu+s4kMvO2t61n377NKOZ0RzfjD69eSNpDZJNEBAEBAFBoCIREIKuyG6RSgkCgoAgQCQELaNAEBAEqhOBYVBrIehh0MnSREFAEKhOBISgq7PfpNaCgCAwDBAQgh4GnSxNHI4ISJuHAgJC0EOhF6UNgoAgMCQREIIekt0qjRIEBIGhgIAQ9FDoRWlDbxGQ9IJAVSAgBF0V3SSVFAQEgeGIgBD0cOx1abMgIAhUBQJC0FXRTQNbSSlNEBAEKgMBIejK6AephSAgCAgCX0BACPoLkEiAICAICAKVgYAQdG/7QdILAoKAIDBACAhBDxDQUowgIAgIAr1FQAi6t4hJekFAEBAEBgiBMhP0ANVaihEEBAFBYBggIAQ9DDpZmigICALViYAQdHX2m9RaEBAEyoxAJWYnBF2JvSJ1EgQEAUEACAhBAwT5CQKCgCBQiQgIQVdir0idBIFKQ0DqMygICEEPCuxSqCAgCAgCy0dACHr5GEkKQUAQEAQGBQEh6EGBXQodWghIawSB/kGg6gi6PjV5imk7R5kp53bTTt9c35Ce2j/QSK6CgCAgCAwuAlVD0Ob4SWtYqfRzBiVmMPM0Jt6TmfY1DLrITKVnm+Obth5cKKV0QUAQEATKi0BVEHSd3bgxJepmoOlfgxR+it4lpUJ9wEQpThiPmw3pH+pjkYpCQCojCAgCfUSg4gnatJv2SXDyZZCwHbdRRedFXdGUwHfXDYyPx0akDlJEHXGcQX8bmZqyXuyXnSAgCAgCVY5ARRN0vd20HbNxi8YYJNyl8rRX4GeOa5ubcXUYzZ7d0Zb1rmMVHaWPQeK1I5Q6X/tFBAFBQBCodgQqlqBHjd9gokF8RxHgTyivtgtb3dJxMbjggLSvhe8GCBHTznUNzqZUJZtUUxAQBASBpSFgLC1ikMOTyUTN3cT8JYWNVH6nsNV7cll1CtqMqUpRXqdJMMUatfaLCAKCgCBQrQhUJEGbKedSJk5rUGHaOCfwZz6j/cuUBTMWMNEjxTR7Ek0aWfSLIwgIAoJAVSJQcQStH5dj4sNjNImeb/O9k4r+5TqRim6MEzGbVsOoHWO/7AQBQUAQqFIEKo2gk5zga2IslQpyC3kP+GOzBdzl/tpawjugccdPdCiDd1juCZJAEBAEBIEKRqCiCNqynWOJeF3Cpkid2PHRq1l4e/F7byEpeio+QZEQdAyE7AQBQWAQEChLkRVD0PVjm8Yp5lMKrVJvhX7mzwV/L/dKvaDPYOa1RtmNa2m/iCAgCAgC1YhAxRA0J42LmahWg5hX/Gu4EaTXPxBzTND6xBplyON2GggRQUAQqEoEKoKga1PO15lpH40gTBtPtvvuvdrfF1FR+7Ol85RhbFbyiysICAKVg4DUZMUQqAiCThJdWKqu6lLHlPx9ccPWt+ZhoTC2XTOpjfqSh5wjCAgCgkAlIDDoBG2On7wNEW9Bhe1v3a9xF477un89PlHxpNiVnSAgCAgCVYjAoBM0JRLxc84KW2dn7vRyYMhKfaDzUUTxEyHaLyIIVA0CUlFBoIjAoBJ07fjGr2Jh8DtxXZinfzav+a3Yv5I7Rfy+zoKZkpa93hjtFxkcBOpt57tWKn2DaaczcD/WYqbS/7Js5xz95wuDUyspVRBYQQQmTKjV3/YZNS69zgqeUdZkg0rQSSNxYqk1UaTOLPlX1sVCY0zQOp98VDMowOqyh7PohV/TdpoNZv36/QG4WU4GHqO1xDdl5uMMSsywUs7zmsQRLj9BYPAQGLO+VZtKb2HZTQdDzsW4vN+y0+9aarX2hMEv1iTpnZFrNA64yXTQCNoc3ziZmHfRPQLrxj/bW7yXtL8swhybOHReBifkWWgNxECJbdeZKecvSeL/MPOG3cUqekYR/YUidSH6ezop9VEhjjfXJF6fcvSjlYWgZe4lUhBYSQTWaDRNrH1ZtnMcxuptIOJ3rJEjP00SPUtsXAP5LRHvSEwTqbhB6VvISdVVPBwwZ9AImoxkt/ZMis4oZ4tznbluDRqksGY585a8lo6AiZuuRau/zIu+paIT36CiqDHw3W+FWffnQYt3bOh7ewRd+YkURb9H37fpRAbxBabtXKn9IosjYNmTvwkiOckqmIqeMlPp2fAr007PBWbNkEfr7fRvR45t+vLiZ8qRRkDjpxUA4HQjpNkakQw4kXiMmM/BWN2LmJYwy1ZvYWzeC/44M4qin6jO/DoLW2Z184rOdyDEGIhCPl+Gniow035xuFLPhi1e4fXsOGDldz1t2WxQ912QZOs3BMwG5zBOJDPEvL4uRCmakcvnvhZk3QPDlswsHbaYzGsOg5bMWXlFWyHtPB3HzIcinz9q/3CX+GYHQrZsJyBOPA0i0bhoU9GWTJTS+DDTGsy8IWRbg+ncETXGW2bKeRVk9FMdPywFMzhtMgMRnw550kqlFQE/AwoAM+8PWTSr0wAp9SlmdI8qojMjpX6UV7lNMGY5yHpfgVKxC5SKE9taMn9rm9fcqpMPtBgDXaAur6YmebR2teRZlVV71nnGAuCL7nBaJIybPNA7M+X8hQ2+olQuCPfy0Hc37mhtfr4UtjS3vcV9Oae6NsdF8j+dBvmcNJwJxmpIbwlSvju+2REdgBueqXGJRakApqFn4b9BUXRGpOgaaHn34fhNSPxj4rRB/FeQ0wcmbppx4FDereKsWmend7bs9HnA7QWLx7QZWPcAEZ8M2apn0zEu2zHOngJm5yuV36+zMwcS9lYJfW+7mIh976Z2v/mVnucMtt8Y+ApMHMVMPymW+2Z7NnN/0V9WRzEHxQwXDfBigDhlQgALK7gwHgQplD4PS6SiQ0Lf/UVvStBTR5VTPyClQn2eAYKpt5u20/7hIvXjHMdKOfeTQU+BlOO1Gd12EMpLBFNQlFPpwPe+BPlGoGcl2cxJbb77s8B3d8bxel1d6stIC8VHva3PY+Y1cbO7wrSdR81x6bE6bKiIhZuYmUqfYWGB2TJ5foLpHmL6DTF//s1hfePSN7OfR13RFIzL+tD3vg3Mfhv6M2/pOdOuVGyMga5YfYO5F8rUq/kUUdStdSGsrD8uXuzIdGgTNBY8LLvpYNNOXwVN9glckC1wOzB434TcX287B9Gq664CHMr6qxuzYYM5csS/ian41UA1n1T+W4GfubYvBekXlCJS+vOy8elMxk1YVZ9AQ3wbZTeuZcGUYSTZJb0wRYUN2t6/I6W2A6Fspk1BbXM8rxCz5P3Cud47SHtpkPUmKRVNxZ1yvk4Jot6WEsrV31nXx9UotXbTmhjfv8DYnm7Z6ZBwE2Oi3xPx5tRjA2avQC5REe2pcjQuyLrrQQ4Ms5m/6PHVI2nVeAecoA02urUtg3LX9RdSsCnF2hgGqFUqY6i59bZztjkiOZew8sxMP2PibzPzeLijiHgSZEdM96616swFGOCnEE1EOK30Vp+aPMUYmXwJ5UyJM1Pq9a4cbxb4K/DPN/EJS961+ZlHcIGdqmOZaUxCqUf0jUAfDzmx7Tr031k1nNQLTweU2of2P0wqt2Xou1u1+d6jpfDeuKGfuUTlOzbANfCYPo+Zx3HCmK7L08fVIPV20/Yg4/PNlOMm2fiAmf7MzLtBIagv1R9YzVNKXYVF6B8G7eFoYLYJZGrY4v4jnOPOLaWrZndACRoLH40A+JsaMIB7c5B9rfiolQ4pszDFBI1yuju0zCUMWna149Jfw+B9HeR7PBPFXwDUlVGkXJgJrsegnUakur/qp+OY6VTTtl6vsxs31sd9lfqGyd8zlKEXrRp0HijrqaA9scXCOe67+nhlBRfYaeizh3U+zLwBbgTPW7azgT7ulcD8UgfbpGmnL7Zs5xnTdmZBWi0sGmmB/33MMO6De7p+EaFXea9k4no7vZ/JY95E/53QnZWih3JEX0f7dwj85qe7w/vo0d+kgV11W2B5ajGL0bo8tLe5riG9STGsYhxww2SsPfzastMPmimnA4rcw+CKY5nY6VlJReoJjPET8hFtCqzGhr53GBah76SP3/mkZ7qh4h9QgqZE8rBu4KKoXx+pYioQNNwhRdD1DempySQ9h8G7XgFLNR8keYrKt48Ns96UwPd+ikF7TJD1vhpkXY5U9D3EFxbgmNcyOPkMLgBtZiqc3os9iO44w0g8RMwFs5FS16Osb9OCGQt6kc1yk4adn+2liAraH/EEIn4Rdsef0TK22tWnpGJCLtgmn9XPtSZgm2SmY1DfbzDIHjKulAX8axHxTnBPThj8ogkC1wRRrlkGLWEzG5o2NO30UwbTTRiXdiGJegd9tH3gu9/vyLrPFcLKtw999zRN/Lhhx2/por0bJgx6Ce09rXyl9CEnbZpraNodeFxm2en39KKoQXwBwWTGxItmeoreUyq6LK9olyBHJsb4NoHvnaMXl/tQatWdYnTXuN89E0cxqcLioKI3wtbME/1ZJDSHNp0/LvQCmeiDfhD9jKVlNx0C0jtZX+Bw96qFzazsRWFAI+/bDIMuouKGNl4dcP4roe+drjWmYvBiDswG/2Tu2hg4FAmPanEB3Gam0t35LHbCEg70IpNpO3cR8zmlaOR3Ei6Un5aOy+p++HoQZl1of6r4H5NUD7vjVZadfte005dBTrUanAtM2/k75BEcz02OUrNjQi7YJksf3+pRLfUxkXoL2tezStHTcD/tEYmm8QYGCMJMWW/Wp9IH9oxbef/EUfW2cxYbRjMzbVnKD/U4Lch6X0YfPVIK6w9XE3+QDRz02cWl/Jn5DxaI0bSdo2jChO5ZWCm+7K6e0Yx3drTsJv2W3vP6WWQyjDuZ6efEtHapPGjI+l+RHopIHavyuabAd9eByebIdv0J4jlufE2X0g4H1xioRmJxcE8iXpWwRaz6bXEQ2cc/LmrQxKpfCBoX3P4gTJc48TSxcTUTn27gAod7m7aZWbZz3aixTlk+1qTtsGZN8t/IO9Z8cWHPi+IFJPdQmt0cLwbFjV7KTpuSNOGBlM4tJWGiqaadfml5LzeACA/lJL3OzLsWz/1EazPIr38ejywWoh3ceH6Mth4JYunQx7iQJzIuaMgpZPCvmflHkO8y0xpxfHGHcz5USt2N9h6v7bkBZhJB1lsNoh+r+kbou1sGvrdKZ1c0iVR0CIi7+0kihsZuEF2HG9hj9Ws0ji9m2WcHWvMeMC29YTB3mzNQt391ctd6qMepfc641ye+txB99ksVqW+TIm33JgIxMvM0S606G0R9OswMjVSmrTSjsUqPv40c+WkiwfcTG/otvc17FqNi01x0XqSi7cOsVxtgNtGW9S4MW5tn9kw3HP0YiwPTbF5scbDr+v4uVRHHNmhccKPKWZZlN35LExsuuBuRt7PUvJkPrKnhty3bOW6paVYgoj7VuJEx/bDeyAAAEABJREFUomYGM8XftlZEj6lc5PRlASnwveMLhETxhjw3GaFfbrCdJ62Gpt/psuIIaFSmfhU25TwLItSmqNFxuFIvdqlcOtZm4oD+34HELst1qSaQ2qWE8pdUolI0Dxf5HSCfI5BmQ5yzRuh7u6G95y7LnvvZ3MzbgZ+5FsT9A6LOMSDq/yvlz0TbcE3Sgza9bSmsN66+8Zl2+iE2jH8wc/w2K9owJ4qin6Bu3/1s9iz9CFhvsixL2rDFeyrw3YkFrOiNQqa8Gup4MieSM61U+mNdb8gp9Q3pHXCD2ZBWm/SlQrol7Cc0rqZt2lphsWznHNN29IxmXmlGQ0xLePxNfYz+up0iOlTlaBxIGaa5zHFtWCReQgkrEjRk0wwIQWtNkpm+pVHExXSz1ui0vz8FF1iP9+YnjipHWZbddC4xNFmm7kUWpdQHkEvzFO2MQbc3Bv6f0MZ53eXBLGBBm+4+7oWnLtW0k6GSTwO7+DlW5H9RiKl/29zMnF5ks1hSTUhaAwaRlZ4TJ2beigzjTIOSr+ACVfoDMZxIwCTC3aYCtPGUwPc2X+g3f0ADvBUfITtalx9AG44ot3E+n/9qV47WDTpzVui7Y8OstxfI5wqkea0v1dNjMsh6v4a9dk1F6kmdBzONwQVyB0jnUlrFiWd/OnxZYtmTv4n0t+obH87/Xikt8JsWLuxYr60l87dS2GC6Bazc9UnRrhiv/+5Rl9G63pBTYU57kGGWsWrrPrHsdAh53cTN3Ew5T2CG4WFcB5ZKfqRt2gbzjRhIxzGzntHgZrcoR7R9Fil1Ha6Nw6OcSgPn1dBfewct7tVD5WmLRa0trw/jr7wZLim3mgTvWwpXKt/v2rMuS7FKaLcg7y0suH3bW/Z6Y0ws7lA8PSvkoQd1PlKbhb63NuTo9mzmPgy62zHwTw6N+WtHSp1dSIk9tGkM7CPhW+Ef0h+VIOM+Ythf9Vkq+hny/5X2rqy0w54XtCfWUhRpM8VSF/igrXfgwvqryucmo42nr2y55Tq/Lds8o7115gvxkyPzmuOZUrny7si6s4Hz1iCTPxXzBGHxkVY9vWk2OIdpZaMY3u2Y4xsbMT5+AckQTF7MvHcpEuQ0vYjfMTT/rcXs3qU0g+kGvntP6LtbRZ25BoyHfRSpK9HvmS/USY9DpvXQtq1YP85J1ESlxeIeiXG+h2vjVtIv10T5HQLOrR76XmPgewfh2rhyec9z98hKvEDAgPT7TxmqQNBKfdTWMvPhfi9QF6C4LG3TdkhFI59iLizuYAAuVCo6JsSgbl/aF/hmz+6ACeJ3Kq+2xmDv0NVh5kst29lN+5cn0E4uR/ppxXQLMBXcCprvNcXj8jgLZiwIs5mTgqy7Ki6mPVDPi5VSd5Gie3FzOSefVzuFPH91XFgHwxbYXJ5CqycXkMnJETR1VdSmQUars8FX1GizVSqtoEXOQH++ZsGvTQMcP6dLk0stBJbTI5wf+t4eg41fqU7LcvW3JjAebsPN6fAw6zra5BOBYDEWDsb4+D3aM02Rul0RPQ73SVLqHoRdGik6TqloXz2jwVjiMOulQ9/dN365Rl/rs5e/RrKseg33uLKQ2LJANBuaNsQdFx0OCx/xbctKW964nhp033KuXX1KyhiRBDnzhnEOSj2b6yJok5kSecbBS9uFrd6TEUXxwl6chnm6Cdtu7F/Crmi3fImJjoijFb3R2ZnbHFPBnlPQOKqcO1xM08Os+8vQ93YPfHcX3FxOaG/1HiDcaMpZTrXl1QZNPcx6uMmqvXHjKiysFRvBxFNA2vGHoYpBeoC3gbj+qqfxwHIPfX53XJV5tMmnDQSLsfBXjI+z0J5jgMXeYdb9TghMAt/bFWFHt/nueaGfuVXPaKqsiVVR3X4naAziwlfrNBxK3aKdARHmHiaO3pc4qmHDtZOjoqdw5lcguO7UI4EffEfbQ/XxigpMH/ergikhPgU2vXv0okp8UNoVHqE7qWi3jO3b0FT+EXSEX62G7wWUmjFUXRDS7QEW1kDSG2Ag7K6UOh3uPQraNeQJHE/DMW5un44JfO9gmcYP1ZEw8O3qd4LG1C8maBBOFtNGTXgD1ErFfS4IC0I1RvJRIi48JqfoPmgL2xP1zZYdwpSAi/hfpDfY7fSiipVynrWw6Fhvp6/Wr2szsf6cpE5BKlJHhFl3z6H6dlTcyErZ9aIege++HvjeXRgLesF01xCaJGQbHB+jw/s6PnpRBUk6zBDoV4Kua3A2JeJJFG/q9tgZoB0rqtFF4cbQ42kOHbJcMUyTptOiej8X+DV70EpuoZ/fEYsnly/KhrcgLDoaTIcwUelFgf92dkWTcCPr9+fEF9VDfIKAIFCpCPQrQSdY7VNqOBYRbi75B8gttS3Xm/JMO30pY5W6eM6bQUg7Er3UW5Ivnt7Tae4MffcXWHTZjmBb7hkD4n6alNodiyxb6Gdze8aJXxAQBIYvAiUS6xcEFHH89AbsdLM7Wpf/8fayVqJkg0bhK5qvZTcdzEw/1+lBmh92qdx36RPvY31cLmnzvUcD310fZMwlAXHrN9vuKlcZ5ctHchIEBIHBRKDfCFo/sM/db1DR3we6kbD5xouETCq/ImVbtrOBYr5Mp1VEHRHltl84CC9l6PJFBAFBQBDQCPQbQSsyYu1ZF0IcDdzTG3GBeseFtjFH+miZMi5dT0z3wrQxMk4X0QHtfmX99U1cL9kJAoLAsEKgQGL90WSmH8bZKnqvLTvz1dg/oDsVL7xBk17uW4RWgmAfLyxmwrRxddji/mMFqipJBAFBQBDoVwT6haD1c77QRhuKNR8csmOO/0kFZpZlvl5b35CeCu15Z11XkPms0M/16pVsfZ6IICAICAL9gUC/ELTB6gfdlVV0d7d/AD2sVPwFLpDuUgnaHN84mZnOj6ulVNiVUyDq5s74WHaCgCAgCAwyAv1C0Ey0c9wupT7q79eU43KWuOOYoIl5KQQ9aSQbSf3B8KQ+Pc9qP3nETSMhIggIApWCQPkJekLjaiDFzYoNvLfoDrijWMUmDlJqiQRt2rX673Xiv43Sduf2bOa+Aa+kFCgICAKCwDIQKDtBW/lkz7fuBsW8odvLqqBB8xI06PpUeluEF23N6p2QPpyqzxERBAQBQYCocjAoO0ETK9hx9Ye9VGfgBw8NUlOZmOp12V+wQY/eaDQrih/7Q1yUV/k9yffbdVoRQUAQEAQqCYEyE/SmNYp5O91AVvzwoH08ZtV1C/ZnVAT1WczEYdXn/85MhX98UHRmuzzvDJTkJwgIApWIQFkJum5853eZKH7+mCgatFeXa+vMgv0ZiBtKfQIn/tWnnJ8S8U4Ub+qFsMU7OfbKThAQBFYUAUk3gAiUlaANY9HjdSpvDNqiWyKf+4IGXZtKTzAUXaKxVaQWdpLxY+0XEQQEAUGgUhEoK0ET8+5xQ5X6z2D+GWQ+kVxE0FEU/zlqgtTfUL+CZq3U8Z9lX30jrqvsBAFBQBCoUATKRtDxSx/EpbcHB+3pDY1zQuUnaleLYuMTmDZ+xcRbx8dEj4V+Jtak9bGIIFBOBCQvQaCcCJSNoFWCk6WK5T4zbiz5B8NVnBhRKtcgtbZBfGHxeEF+If+k6BdHEBAEBIGKRsAoV+30B5E6O3Nf6Yq6JnZ89Gq2XPn2JR9DqZImT0x0RikPFUWHDHbdSnURVxAQBASB5SFQNoLWBek/OF3YMmuxfz/W4QMtirj4JAlKZi7Yo5W6PmzJ3IkQ+Q0WAlKuIFAhCIwa66xbm0pvMWr8Bt3m0Aqp2mLVKCtBL5bzIB4wqcVePFGkXg3oo18MYpWkaEFAEOhHBGpXn5KqT02eYo6fvE29nd5Pf6XSTKXPgP9qy07fY9nOM3DfNe10m5VKq5oafhs22WdrEiPeHblGY/F/U/uxgn3MekgSdMT5f5bw0ORM+Y7t5G3BEiLiCgIVisAqzqqj7Ma1zPGNk2vHpb9Wbzvfhexv2k1Hg1hPNW3nUrg3w/0n3Jfhvg83JtzkKDXboMQMTiQeM5huMgy6CObN38N/COycOxPzN4hpIjPVUY9NKWo3RiSX+834HqcMqHdIEnRbtnkGRbQVReqwMOttFLa+NW9AUe1TYXKSIFBFCIBMa1PpCZbtbFDX4Gxqjne+XTfe2dFMOXuBVA8CeR6FuBPgnm7a6Yst27kGcbdZdvpB004/Bf+r8L8D/1z4OyxotZbJ82s4+T4nkplkkp4zmB+B3MhsXAJiPYWZj2SmfZl5O2bamJnX4s8R7ucRBAF/CJmpiB6HeyvkEoroRM0NpNRulKd1OrLu7M+fVynHQ5KgNbj6M6dBi3eV9osIAsMOgVXXXaVuzPq2nr7XY+pfm3K+rj8SBlLcxbQn72vZTYeY0Ewt2znetJ3TLDt9PkwCl4MorzdTzu1WynkA7uOm7bwImQX//xA239JEqsXk+Umi/xHzrITBL3KCn0gk+H4mvg2kei0zT0PcWXBPZqZj4D8YcXsR0w443hL+NPzrwL8G/KNoRTb9ZUpF74JYXyRFDymlbtSEi1nyyXCPVCraVxFtG+VUOuqKxgdZl0PfXQPSFGbd78DdFzI1aHHPDMANge/dPZjva6xIk4csQa9I4yWNINCvCNh2HY3eaLQ5Lj22FtrmqHHpdSw7vX79OMfRWqcmTbPB2aq+YfL3QJS7QfPc37K7ifM4006fatnOOabtTNO2VNNO3wT/dMjDkCchmjxnWnYatlWn1bKdT7sJtM5ckBg5MjtiRPJNA1P/JPF/DKJHQYp3MyduJjauZmimxHw2M/+BmI5loiOAx0+YeE8i/j7crRG3KWQD+CcgbFXqy6ZUCBJtAam+oZR6CST6OPz3gVRvRviV8F8A/6kRRb9RkTo8UrR/nqKdCbNglc81RZ25Bk22INRVAt9dN/C9zQPf/X7oez8OfXdqmPX+BPey0M/cGmbdx9rmeF7b3MycvlS10s5Bn1ValZZYHwkczghMmFBL0AjN8ZPW0ItBo7DyPjI1ZT0QX1Od3bixtldaDektzfFNW9c3pHeos9M7mw3pH2pNEVrjTyxNeqmmI0y76Zj6VNOxVkPT70zb+YPZ4PzRAgFCM7wQx9PMlHMFjq+F/++QWyF3Iu4+uA8j7nHLTj+N4+fhn2HaTjP8b8GFHdRpgf8jnBtYWrssCY9ps+qjjzlJc5LQNmuS9A6I8DUjya7WOpMgTTb4ScNIPETM06F53kiLiPMcZjoF4ccx81EG0yHMtB8z7wbZHrIVRJNnIzHBtsrjiNmicm+K2kCoPoh1Fkj0aYo1V7oVxHoFNNlzCeYChB8ZRerHMamq3JYRNNgulVs7aA9HF4nVCrOeDVJdP/S9zUJos/DvHPru/mHWOxz+38B/Wls2c0HY4l3Z5rs36++zBy3uv8PW5plt85pby92saslPCLpaeqo/6mnbdTR6o9H1Y5vG1dpNa47EajYWaBrriqRnau0OCzV1sC2C1HY37aZ96huaDrBiwkv/HGtO+6UAAAmXSURBVGQ4FZrdb81U+kQT2l697ZxtpRxNdljMca60bOc6U2t9qfQdlp2+x7SdItFhRT3l9CS6NxHXk+gWaYKa7NRq7VaduYATdXP1YpBeeR9B6nUQn5fg5MvaXkkGPcUJ43HDoAcTTPewQXcwNEWD6HrSpEfG5czGxQYZ55NhnMnMp7HBJxHzcUT8KwYJMvFhOD4I/h9B9obsjrid4G6PuK2J6Zs43hz+KQjbEP4vw4UdlMfDr/+owqT+2RaAEFuI1NsgywyKeB7HT+D4QRzfCfLEVF9dBaK8JFLqbByfAvI8ISL1a4QdSSr6WRRFB+CcvUGwu0ZRfgeVV1vnSH0jH9GmClpq/A4DSDU2DbQZqwY8v65Arq4ZZt1U6HuNoe9uCTKF5uruG2a9IwLfOx4keibCL2tr8W6MSdVvflprsAv95g/o43e6P1RGsvUJAYzfPp0nJ60MArZdp7VBPeXVWiCmv1to7Q9E+H3LdnYzNRGm0geCIA+D/+h6O/0bMyZB53TEnwP/RZDL4dfa3o3wawK817Sdf5op5wkrlX7OtNOv4HimlXK0lvcBjucg/GMzlW6Hq2IpanhGjdGaZOMDPR3mRHJmokh6rLU7LNQkEnw/GcadzMYthmHcQDHh0WUGVsqh2Z3LRH9iaHsG8/FUIDss5vChxHwgwvdD/A+JaWdmLhIdVtSJexLdJMT1JLrya4K0jE2pEGT3MchsLkhsNkhM2zlfB/llEPYKzvwvwp/E8WOIewhyL/z/QNzNpNT1IESQo/oz0lyE43NVpP4E/x/g1yR5LOKPRtjhEamDQKA/QhyIUu2Wz6sdVT7ahlT+W5ookX5D/aKXyrePDTpzVkyQsKPCXRWEaAdZb1KYdZ0g634tzHrbBFlvxzDr/jCMp/reYSGm+22+97vQ904HeZ7TlvX+L/TdywI/c01bS+bvYda7PfDde9paZj4ctnpPdmS9Z9tb3Je1lhq/wwBSjU0DC2YsoNmzO9Bu+ZUDgZXIQwh6eeBhaq2n1Va8Wt20WUykmEJDW9wfBHq4njKDCP9g2enzQH6Xg/huMG3nTsjDZmG1eoZVIMkWy3YKU2AQI0Mb1FNerQUmiZ7V2h+I8AFins6aCImuY4OvgP8Sg+k8jkmQTybm4+CfCjkCfq3t7Q+/JsAfgOS2Y+JvE9HXmGkjZm4kYq3lrclMY4loNBMteomH+mHDlLhAdqoVxPQB/G/BbQaZzUBpWvPrQXTqni8SXXQZCKxAdBSdgXNPAXH9LiIFoouOAdEdAZI7OMKUWlG0D+J2B9HthLDtVLdWGG0eUX4jFUWNJc0w/1mXTWrhGkFH+ypBSTsskB8Hvgcy9FYDmY0Dia0ZFOycG4QgQ4RtEmTdLcKst3WYdbdF3Pchu8C/J+L2D3zvp6GvydE7Ksx6v8Lx8Zimnwz/H+HXJHkh4i9F2JUgzOtAoDchDkTp3d3e6j0YtmaeCPyZz2iiRPrX9Ite8VNH85px0yDZhjkCQ5OgR280epR+nnJcukkvxMAOua2Zcvay7KZD6lPOr0w7fYqlV61t50r4bwGBPgBXP/pTJNP0HLOkaWJqrafVIMNZCcN4ISZSTKEN5htBoH/RU2bGdJmYfgPyOwLj6QAc7w7Znpn0avUUKpDkeGIuzxRYqQCE9yHILQsCfAckpu2D0PTUc4rUkzh+BFrefYjH9Je0lncdwq9E+DSEX4DwM3H+qSC3IvGpo2BLPDQiOlBhJZyiaA9Nekprd1ioyeVoi7zKbRJPhblrPa3lRXrhhnOrf07TA9m5ZpDVZOc1gJjWhv8rcCeHvrtxkHW15teD6Lxdw6z7OaLLHBmWiC6bOSksaINng9xAdJlpILorQHJ/1VPqMJu5DaR2F4juAYQ9ukgrzLzYlp35atiSmVXSDNs/nNUS+G98SPPf+lS0Q5KtShCoaILWZgBM+3fEFH8/EObPLds5od52zoL/chO2TSvl3A/3KUjGTKVnWyUNFQszNfp5yiR5SeJ49ZqJbyNMzQ3iC5npVNKr1syHwr8PEX8fbg8ypbFMvdM0FdQzUuojEOD7SqlmIoK2SHpKfC/I8BbI1YroYgWtEAT4e6WiY0hFh+B4nzxFP1Al7a9AhJM7u6JJOaI14+mu1vpK2p52fe9LoX58KOtOCLLel8OCfRCanvd1kNvWON4+8N2dw3j66+4f+N5BYdY7HOHHBL77mzDrnhj67mmB7xWJz/szbIlXt2XdG0KshActmema9GLtDgs1HXPc/7b7za+EWLD5bPasN7WWFy/czG6eT6Lpoavl13cE5MxlIWAsK3Iw40ZhpZ4Sde9j2n+/wXQTCPMyYj7LYD4B/iNAqPsR8Y5wt4RMRlgK8SusoSoQKkhzLjRQTMHpZZDn4yDXwqM/Sl1FkbpQKXV6pOi3KlJH6Ck14ndV0Crz+fxXFabPmkBLK9Vh1qsF4Y0JfHdi6HuTg1hbjKfEu4S+ux/k0DDr/hJa30kgwLNAhNMCP3Mtjm9rz2bu79b+CkTY/NnczNsdWXd2PN3VWh/JJggIAsMNgYolaN0RIN2l2EvVfJDluyDYVzSxgkjvIqWwWEOXIOy0qPg8pVL5/fRUnfSjP13RlK585zqBnpZDCw1BqCDNcUHWwxTc3TTMut8BuRYe/YFNMWjxjg1975Q23z0/nlZjlRrx92itsr115gt6+qwJVFaqdU+JCAKCQH8gULEEvbD1tfe6crRuTkXf1LbP3EKesMje6a0Oslw39N1NNLGGvrd74OvFGndq6LunthWfpwz9mbe0t3oPBPrRn7kZV+dJelreH0hKnoJA+RGQHIc5AhVL0LpfFs5x3+3wM/8JW5tnxt9xFnunhkVEEBAEhgkCFU3Qw6QPpJmCgCAgCCwRASHoJcIigdWAgNRREBjqCAhBD/UelvYJAoJA1SIgBF21XScVFwQEgaGOgBD0UO1haZcgIAhUPQJC0FXfhdIAQUAQGKoICEEP1Z6VdgkCgkDVIzBMCbrq+00aIAgIAsMAASHoYdDJ0kRBQBCoTgSEoKuz36TWgoAgMAwQWBJBD4NmSxMFAUFAEKh8BISgK7+PpIaCgCAwTBEQgh6mHS/NFgSGJAJDrFFC0EOsQ6U5goAgMHQQEIIeOn0pLREEBIEhhoAQ9BDrUGmOILB0BCSm2hAQgq62HpP6CgKCwLBBQAh62HS1NFQQEASqDQEh6GrrMalvfyEg+QoCFYeAEHTFdYlUSBAQBASBAgJC0AUcZC8ICAKCQMUhIARdcV1SmRWSWgkCgsDAI/D/AAAA///XNVk5AAAABklEQVQDAD1HlvBbUA/XAAAAAElFTkSuQmCC";
function termoDemo(base: Db = db) {
  const e = base.configuracoes?.[0]?.nome_fantasia || "MF Máquinas";
  return `Declaro que as informações desta ficha cadastral são verdadeiras e me comprometo a avisar a ${e} sobre qualquer alteração. Autorizo o uso destes dados para emissão de notas fiscais, entregas, cobranças, garantia, assistência técnica e contato comercial, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Reconheço como válida esta assinatura eletrônica, registrada com data, hora, endereço IP e código de verificação (Medida Provisória nº 2.200-2/2001, art. 10, § 2º).`;
}
function fichaClienteDemo(c: Row, base: Db = db): Row {
  const k = ["codigo", "tipo_pessoa", "nome", "nome_fantasia", "cpf_cnpj", "inscricao_estadual", "inscricao_municipal", "data_nascimento", "email", "email_nfe", "telefone",
    "telefone_adicional", "whatsapp", "website", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "cobranca_diferente", "cobranca_cep",
    "cobranca_logradouro", "cobranca_numero", "cobranca_complemento", "cobranca_bairro", "cobranca_municipio", "cobranca_uf"];
  const out: Row = Object.fromEntries(k.filter((x) => c[x] != null && c[x] !== "").map((x) => [x, c[x]]));
  const pessoas = (base.clientes_pessoas ?? []).filter((p) => p.cliente_id === c.id && p.ativo)
    .map((p) => Object.fromEntries(["nome", "setor", "email", "telefone", "ramal"].filter((x) => p[x]).map((x) => [x, p[x]])));
  if (pessoas.length) out.pessoas = pessoas;
  return out;
}
/** Na prévia o código é um resumo simples (no sistema real: SHA-256 no banco). */
function hashDemo(a: Row) {
  const t = [a.id, a.cliente_id, a.canal, a.termo, JSON.stringify(a.dados ?? ""), a.nome, a.cpf, a.assinatura_png, a.ip, a.user_agent, a.assinado_em].join("|");
  let out = "";
  for (let k = 0; k < 8; k++) {
    let h = 2166136261 ^ k;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out;
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
      valor_final: null, cte_numero: null, observacoes: null, created_at: quando(-5),
      valor_cobrado_cliente: p ? Number(p.frete ?? 0) : null, tipo_servico: null, tabela_versao: null, valor_cotado: null, cotacao_aprovada_id: null, justificativa_escolha: null,
      sem_comprovante_motivo: null, sem_comprovante_por: null, sem_comprovante_em: null, conferencia_obs: null, conferido_por: null, conferido_em: null,
      conta_pagar_id: null, motivo_excecao: null, ...x,
    });
  };
  // cotação com adicionais e total (no sistema real o total vem do gatilho)
  const cot = (id: string, envio_id: string, transportadora_id: string | null, valor: number, x: Row = {}): Row => {
    const adicionais: Row[] = x.adicionais ?? [];
    return {
      id, envio_id, transportadora_id, transportadora_nome: null, valor, prazo_dias: 4, validade: dias(5), observacoes: null, escolhida: false, ativa: true,
      created_at: quando(-1), tipo_servico: "padrao", tabela_versao: null, ...x, adicionais, valor_total: r2(valor + adicionais.reduce((s, a) => s + Number(a.valor), 0)),
    };
  };
  const maq300 = { embalagem_id: "em1", descricao: "Engradado MF-300 · Máquina de Sorvete Soft MF-300", quantidade: 1, largura_cm: 80, altura_cm: 150, comprimento_cm: 70, peso_kg: 165 };
  const maq150 = { embalagem_id: "em2", descricao: "Caixa MF-150 Balcão · Máquina MF-150", quantidade: 2, largura_cm: 60, altura_cm: 90, comprimento_cm: 75, peso_kg: 78 };
  const pecas = { embalagem_id: "em4", descricao: "Caixa de peças P", quantidade: 1, largura_cm: 30, altura_cm: 20, comprimento_cm: 40, peso_kg: 4 };
  const hora = (d: number, h: number) => new Date(Date.now() + d * 864e5 + h * 36e5).toISOString();
  const shake = { embalagem_id: null, descricao: "Caixa MF-MS2 · Máquina de Milk Shake", quantidade: 2, largura_cm: 40, altura_cm: 65, comprimento_cm: 35, peso_kg: 18 };
  db.envios = [
    envio("ev1", 1, { pedido_id: "pd1", status: "entregue", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe", "empilhadeira"], transportadora_id: "t1",
      prazo_dias: 4, valor_aprovado: 690, aprovado_em: quando(-30), coletado_em: dias(-28), codigo_rastreio: "RDN-558120", entrega_prevista: dias(-24), entregue_em: dias(-24), valor_final: 780, cte_numero: "CT-e 4471", created_at: quando(-31),
      tipo_servico: "padrao", tabela_versao: "RDN 2026/09", valor_cotado: 690, cotacao_aprovada_id: "ec0", aprovado_por: "u-vendas" }),
    envio("ev2", 2, { pedido_id: "pd2", status: "entregue", volumes: [maq150], tipo_equipamento: "Máquina de Sorvete Expressa MF-150 Balcão", restricoes: ["manter_em_pe"], modalidade: "fob", pagador: "cliente", transportadora_id: "t2",
      prazo_dias: 5, valor_aprovado: 845, aprovado_em: quando(-6), coletado_em: dias(-5), codigo_rastreio: "BRP-90311", entrega_prevista: dias(-1), entregue_em: dias(-1), comprovante_em: dias(-1), valor_final: 845, created_at: quando(-6),
      tipo_servico: "economico", tabela_versao: "BRP-2026", valor_cotado: 845, cotacao_aprovada_id: "ec7", aprovado_por: "u-vendas" }),
    envio("ev3", 3, { status: "cotacao", volumes: [pecas], tipo_equipamento: "Peças e acessórios", cep_destino: "01310100", cidade_destino: "São Paulo", uf_destino: "SP", valor_mercadoria: 1250, centro_custo_id: "cc3",
      observacoes: "Peças para o técnico de SP (OS de garantia)", created_at: quando(-1) }),
    envio("ev4", 4, { status: "aprovacao", volumes: [{ ...maq300, peso_kg: 165 }], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe", "sem_doca", "agendar"], cep_destino: "90010000", cidade_destino: "Porto Alegre", uf_destino: "RS",
      valor_mercadoria: 23900, prazo_desejado: dias(8), created_at: quando(-2) }),
    envio("ev5", 5, { status: "coleta", volumes: [maq150], tipo_equipamento: "Máquina de Sorvete Expressa MF-150 Balcão", cep_destino: "80010000", cidade_destino: "Curitiba", uf_destino: "PR", valor_mercadoria: 29000,
      transportadora_id: "t2", prazo_dias: 3, valor_aprovado: 520, aprovado_em: quando(-4), coleta_prevista: dias(-1), created_at: quando(-5),
      tipo_servico: "expresso", tabela_versao: "BRP-2026", valor_cotado: 520, cotacao_aprovada_id: "ec3", aprovado_por: "u-vendas" }),
    envio("ev6", 6, { status: "transito", volumes: [pecas, { ...pecas, descricao: "Fardo Franquia", embalagem_id: "em3", largura_cm: 27, altura_cm: 17, comprimento_cm: 46, peso_kg: 11, quantidade: 3 }], tipo_equipamento: "Peças e acessórios",
      cep_destino: "38400000", cidade_destino: "Uberlândia", uf_destino: "MG", valor_mercadoria: 3400, transportadora_id: "t3", prazo_dias: 2, valor_aprovado: 210, aprovado_em: quando(-3), coletado_em: dias(-2), entrega_prevista: dias(0), created_at: quando(-3),
      tipo_servico: "economico", tabela_versao: "MOG 2026/10", valor_cotado: 210, cotacao_aprovada_id: "ec5", aprovado_por: "u-vendas" }),
    envio("ev7", 7, { status: "transito", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe"], cep_destino: "74000000", cidade_destino: "Goiânia", uf_destino: "GO", valor_mercadoria: 23900,
      transportadora_id: "t1", prazo_dias: 4, valor_aprovado: 980, aprovado_em: quando(-9), coletado_em: dias(-8), codigo_rastreio: "RDN-559004", entrega_prevista: dias(-2), prazo_desejado: dias(-1), created_at: quando(-10),
      tipo_servico: "padrao", tabela_versao: "RDN 2026/09", valor_cotado: 980, cotacao_aprovada_id: "ec6", aprovado_por: "u-fin" }),
    // meses anteriores: entregues, para os indicadores do mês terem o que mostrar
    envio("ev8", 8, { pedido_id: "ph0", status: "entregue", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe"], valor_mercadoria: 24470, transportadora_id: "t1",
      prazo_dias: 4, valor_aprovado: 650, valor_cotado: 650, aprovado_em: hora(-43, 2), aprovado_por: "u-vendas", coletado_em: dias(-42), codigo_rastreio: "RDN-551870", entrega_prevista: dias(-38), entregue_em: dias(-38),
      comprovante_em: dias(-37), valor_final: 650, cte_numero: "CT-e 4102", tipo_servico: "padrao", tabela_versao: "RDN 2026/08", cotacao_aprovada_id: "ec8", conta_pagar_id: "cpf8", created_at: quando(-44) }),
    envio("ev9", 9, { pedido_id: "ph1", status: "entregue", volumes: [{ ...maq150, quantidade: 1 }], tipo_equipamento: "Máquina de Sorvete Expressa MF-150 Balcão", valor_mercadoria: 14500, transportadora_id: "t2",
      prazo_dias: 2, valor_aprovado: 820, valor_cotado: 820, aprovado_em: hora(-57, 3), aprovado_por: "u-vendas", coletado_em: dias(-56), codigo_rastreio: "BRP-87002", entrega_prevista: dias(-54), entregue_em: dias(-53),
      comprovante_em: dias(-52), valor_final: 870, cte_numero: "CT-e 88120", tipo_servico: "expresso", tabela_versao: "BRP-2026", cotacao_aprovada_id: "ec9", conta_pagar_id: "cpf9", created_at: quando(-58),
      conferencia_obs: "CT-e cobrou TDE de R$ 50 (cliente em zona de restrição); aceito, a Braspress confirmou a tabela", conferido_por: "u-fin", conferido_em: quando(-50) }),
    envio("ev10", 10, { pedido_id: "ph2", status: "entregue", volumes: [shake], tipo_equipamento: "Máquina de Milk Shake MF-MS2", valor_mercadoria: 7947, transportadora_id: "t3",
      prazo_dias: 3, valor_aprovado: 380, valor_cotado: 380, aprovado_em: hora(-74, 0), aprovado_por: "u-fin", coletado_em: dias(-73), codigo_rastreio: "MOG-22013", entrega_prevista: dias(-69), entregue_em: dias(-69),
      comprovante_em: dias(-68), valor_final: 380, cte_numero: "CT-e 3310", tipo_servico: "economico", tabela_versao: "MOG 2026/07", cotacao_aprovada_id: "ec10", created_at: quando(-76) }),
    envio("ev11", 11, { pedido_id: "ph3", status: "entregue", volumes: [maq150], tipo_equipamento: "Máquina de Sorvete Expressa MF-150 Balcão", restricoes: ["manter_em_pe"], valor_mercadoria: 28400, transportadora_id: "t1",
      prazo_dias: 4, valor_aprovado: 990, valor_cotado: 990, aprovado_em: hora(-19, 4), aprovado_por: "u-vendas", coletado_em: dias(-18), codigo_rastreio: "RDN-556640", entrega_prevista: dias(-14), entregue_em: dias(-12),
      valor_final: 990, cte_numero: "CT-e 4390", tipo_servico: "padrao", tabela_versao: "RDN 2026/09", cotacao_aprovada_id: "ec11", created_at: quando(-20),
      sem_comprovante_motivo: "Cliente recebeu e não assinou o canhoto; confirmou o recebimento por WhatsApp", sem_comprovante_por: "u-vendas", sem_comprovante_em: quando(-11) }),
    envio("ev12", 12, { pedido_id: "ph4", status: "entregue", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe"], valor_mercadoria: 23900, transportadora_id: "t2",
      prazo_dias: 4, valor_aprovado: 410, valor_cotado: 410, aprovado_em: hora(-14, 6), aprovado_por: "u-vendas", coletado_em: dias(-13), codigo_rastreio: "BRP-89411", entrega_prevista: dias(-9), entregue_em: dias(-9),
      comprovante_em: dias(-8), valor_final: 410, cte_numero: "CT-e 88731", tipo_servico: "economico", tabela_versao: "BRP-2026", cotacao_aprovada_id: "ec12", conta_pagar_id: "cpf12", created_at: quando(-15) }),
    envio("ev13", 13, { status: "entregue", volumes: [maq300], tipo_equipamento: "Máquina de Sorvete Soft MF-300", restricoes: ["manter_em_pe"], cep_destino: "90010000", cidade_destino: "Porto Alegre", uf_destino: "RS", valor_mercadoria: 23900,
      transportadora_id: "t2", prazo_dias: 2, valor_aprovado: 1450, valor_cotado: 1450, aprovado_em: hora(-24, 3), aprovado_por: "u-vendas", coletado_em: dias(-23), codigo_rastreio: "BRP-88100", entrega_prevista: dias(-21), entregue_em: dias(-21),
      comprovante_em: dias(-20), valor_final: 1450.5, cte_numero: "CT-e 88402", tipo_servico: "expresso", tabela_versao: "BRP-2026", cotacao_aprovada_id: "ec13b", created_at: quando(-25),
      justificativa_escolha: "Cliente precisava antes do feriado: a Rodonaves só entregava em 6 dias" }),
    envio("ev14", 14, { status: "entregue", volumes: [pecas], tipo_equipamento: "Peças e acessórios", cep_destino: "80010000", cidade_destino: "Curitiba", uf_destino: "PR", valor_mercadoria: 1800,
      transportadora_id: "t1", prazo_dias: 3, valor_aprovado: 180, valor_cotado: 180, aprovado_em: hora(-7, 3), aprovado_por: "u-vendas", coletado_em: dias(-6), codigo_rastreio: "RDN-560221", entrega_prevista: dias(-3), entregue_em: dias(-3),
      comprovante_em: dias(-2), valor_final: 180, cte_numero: "CT-e 4502", tipo_servico: "padrao", tabela_versao: "RDN 2026/10", cotacao_aprovada_id: "ec14", created_at: quando(-8) }),
    envio("ev15", 15, { status: "entregue", volumes: [pecas, { ...pecas, quantidade: 2 }], tipo_equipamento: "Peças e acessórios", cep_destino: "01310100", cidade_destino: "São Paulo", uf_destino: "SP", valor_mercadoria: 2600,
      transportadora_id: "t3", prazo_dias: 2, valor_aprovado: 260, valor_cotado: 260, aprovado_em: hora(-7, 8), aprovado_por: "u-fin", coletado_em: dias(-5), codigo_rastreio: "MOG-22988", entrega_prevista: dias(-2), entregue_em: dias(-1),
      comprovante_em: dias(-1), valor_final: 295, cte_numero: "CT-e 3502", tipo_servico: "economico", tabela_versao: "MOG 2026/10", cotacao_aprovada_id: "ec15", created_at: quando(-7) }),
  ];
  db.envio_cotacoes = [
    cot("ec0", "ev1", "t1", 690, { prazo_dias: 4, validade: dias(-26), escolhida: true, tabela_versao: "RDN 2026/09", created_at: hora(-31, 6) }),
    cot("ec1", "ev4", "t1", 1100, { prazo_dias: 5, validade: dias(3), observacoes: "veículo com plataforma", tabela_versao: "RDN 2026/10", adicionais: [{ tipo: "tde", valor: 80 }] }),
    cot("ec2", "ev4", "t2", 1250, { prazo_dias: 3, validade: dias(2), observacoes: "seguro incluso", tipo_servico: "expresso", tabela_versao: "BRP-2026", adicionais: [{ tipo: "gris", valor: 40 }, { tipo: "pedagio", valor: 30 }] }),
    cot("ec4", "ev4", "t3", 990, { prazo_dias: 7, validade: dias(-2), observacoes: "tabela de agosto", tipo_servico: "economico", tabela_versao: "MOG 2026/08", created_at: hora(-2, 3) }),
    cot("ec3", "ev5", "t2", 520, { prazo_dias: 3, validade: dias(1), escolhida: true, tipo_servico: "expresso", tabela_versao: "BRP-2026", created_at: hora(-5, 4) }),
    cot("ec5", "ev6", "t3", 210, { prazo_dias: 2, validade: dias(4), escolhida: true, tipo_servico: "economico", tabela_versao: "MOG 2026/10", created_at: hora(-3, 1) }),
    cot("ec6", "ev7", "t1", 980, { prazo_dias: 4, validade: dias(-5), escolhida: true, tabela_versao: "RDN 2026/09", created_at: hora(-10, 3) }),
    cot("ec7", "ev2", "t2", 845, { prazo_dias: 5, validade: dias(-1), escolhida: true, tipo_servico: "economico", tabela_versao: "BRP-2026", created_at: hora(-6, 2) }),
    cot("ec8", "ev8", "t1", 650, { validade: dias(-40), escolhida: true, tabela_versao: "RDN 2026/08", created_at: hora(-44, 5) }),
    cot("ec9", "ev9", "t2", 820, { prazo_dias: 2, validade: dias(-55), escolhida: true, tipo_servico: "expresso", tabela_versao: "BRP-2026", created_at: hora(-58, 20) }),
    cot("ec10", "ev10", "t3", 380, { prazo_dias: 3, validade: dias(-72), escolhida: true, tipo_servico: "economico", tabela_versao: "MOG 2026/07", created_at: hora(-75, 10) }),
    cot("ec11", "ev11", "t1", 990, { validade: dias(-16), escolhida: true, tabela_versao: "RDN 2026/09", created_at: hora(-20, 7) }),
    cot("ec12", "ev12", "t2", 410, { validade: dias(-11), escolhida: true, tipo_servico: "economico", tabela_versao: "BRP-2026", created_at: hora(-15, 3) }),
    cot("ec13a", "ev13", "t1", 1290, { prazo_dias: 6, validade: dias(-22), tabela_versao: "RDN 2026/09", created_at: hora(-25, 2) }),
    cot("ec13b", "ev13", "t2", 1380, { prazo_dias: 2, validade: dias(-22), escolhida: true, tipo_servico: "expresso", tabela_versao: "BRP-2026", adicionais: [{ tipo: "gris", valor: 70 }], created_at: hora(-25, 4) }),
    cot("ec14", "ev14", "t1", 180, { prazo_dias: 3, validade: dias(-4), escolhida: true, tabela_versao: "RDN 2026/10", created_at: hora(-8, 6) }),
    cot("ec15", "ev15", "t3", 260, { prazo_dias: 2, validade: dias(-4), escolhida: true, tipo_servico: "economico", tabela_versao: "MOG 2026/10", created_at: hora(-7, 2) }),
  ];
  db.envio_excecoes = [
    { id: "ex1", envio_id: "ev13", tipo: "cotacao_mais_cara", justificativa: "Cliente precisava antes do feriado: a Rodonaves só entregava em 6 dias",
      detalhe: "Braspress por R$ 1.450,00; a mais barata válida era Rodonaves por R$ 1.290,00", valor: 160, created_by: "u-vendas", created_at: hora(-24, 3) },
    { id: "ex2", envio_id: "ev9", tipo: "conferencia_frete", justificativa: "CT-e cobrou TDE de R$ 50 (cliente em zona de restrição); aceito, a Braspress confirmou a tabela",
      detalhe: "Aprovado R$ 820,00 · faturado R$ 870,00", valor: 50, created_by: "u-fin", created_at: quando(-50) },
    { id: "ex3", envio_id: "ev11", tipo: "sem_comprovante", justificativa: "Cliente recebeu e não assinou o canhoto; confirmou o recebimento por WhatsApp", detalhe: null, valor: null, created_by: "u-vendas", created_at: quando(-11) },
  ];
  // frete pago: contas a pagar dos envios já fechados
  const contaFrete = (id: string, envio: number, transp: string, doc: string, valor: number, venc: number, pago: boolean) => ({
    id, descricao: `Frete envio #${envio} · ${transp}`, categoria: "frete", documento: doc, valor, vencimento: dias(venc), status: pago ? "pago" : "aberto",
    data_pagamento: pago ? dias(venc) : null, valor_pago: pago ? valor : null, unidade_id: U_SC, rateio: [], observacoes: `Gerado pelo ERP a partir do envio #${envio}`, created_at: quando(venc - 20),
  });
  db.contas_pagar.push(contaFrete("cpf8", 8, "Rodonaves", "CT-e 4102", 650, -20, true), contaFrete("cpf9", 9, "Braspress", "CT-e 88120", 870, -35, true),
    contaFrete("cpf12", 12, "Braspress", "CT-e 88731", 410, 15, false));
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
    { id: "eo3", envio_id: "ev10", tipo: "avaria", descricao: "Lateral do gabinete amassada na descarga", responsavel: "Rafael", andamento: "Fotos enviadas à Mogiana", status: "resolvida",
      resolucao: "Mogiana reembolsou o conserto (R$ 180) no abatimento da fatura", resolvida_por: "u-fin", resolvida_em: quando(-60), created_at: quando(-69), atualizado_em: quando(-60) },
    { id: "eo4", envio_id: "ev11", tipo: "reentrega", descricao: "Cliente fechado na primeira tentativa de entrega", responsavel: "Carla", andamento: null, status: "resolvida",
      resolucao: "Reentregue no dia seguinte sem custo extra (combinado com a Rodonaves)", resolvida_por: "u-vendas", resolvida_em: quando(-12), created_at: quando(-13), atualizado_em: quando(-12) },
    { id: "eo5", envio_id: "ev9", tipo: "atraso", descricao: "Entrega um dia depois do previsto (chuva na rodovia)", responsavel: "Carla", andamento: null, status: "resolvida",
      resolucao: "Cliente avisado no mesmo dia; sem prejuízo", resolvida_por: "u-vendas", resolvida_em: quando(-53), created_at: quando(-54), atualizado_em: quando(-53) },
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

// ---------------------------------------------------------------------
// Fornecedor marcado como golpe (no sistema real: gatilhos da migração fornecedor_golpe). Valida e completa antes de gravar.
const GOLPE_ERP = "ERP (fornecedor bloqueado)";
const bloqueioDemo = (id?: string | null) => { const f = db.fornecedores.find((x) => x.id === id); return f?.bloqueado ? String(f.bloqueio_motivo ?? "golpe") : null; };
const segurarDemo = (c: Row, motivo: string) => Object.assign(c, { decisao: "nao_pagar", pagar_em: null, decisao_motivo: `Fornecedor bloqueado (golpe): ${motivo}`, decisao_por_nome: GOLPE_ERP, decisao_em: new Date().toISOString() });
function golpeDemo(tabela: string, antes: Row | null, r: Row): string | null {
  if (tabela === "fornecedores") {
    if (r.bloqueado && !antes?.bloqueado) {
      if (String(r.bloqueio_motivo ?? "").trim().length < 3) return "diga o motivo do bloqueio (ex.: boleto falso que chega todo mês)";
      Object.assign(r, { bloqueado_em: new Date().toISOString(), bloqueado_por_nome: db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? "ERP" });
      if (r.id) db.contas_pagar.filter((c) => c.fornecedor_id === r.id && c.status === "aberto").forEach((c) => segurarDemo(c, r.bloqueio_motivo));
    } else if (!r.bloqueado && antes?.bloqueado) {
      if (db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.papel !== "admin") return "só o administrador tira o bloqueio de um fornecedor marcado como golpe";
      Object.assign(r, { bloqueio_motivo: null, bloqueado_em: null, bloqueado_por_nome: null });
      db.contas_pagar.filter((c) => c.fornecedor_id === r.id && c.status === "aberto" && c.decisao_por_nome === GOLPE_ERP)
        .forEach((c) => Object.assign(c, { decisao: null, pagar_em: null, decisao_motivo: null, decisao_por_nome: null, decisao_em: null }));
    } else if (r.bloqueado && String(r.bloqueio_motivo ?? "").trim().length < 3) return "diga o motivo do bloqueio (ex.: boleto falso que chega todo mês)";
    return null;
  }
  if (tabela !== "contas_pagar") return null;
  const motivo = bloqueioDemo(r.fornecedor_id);
  if (!motivo) return null;
  if (r.status === "pago" && (antes ? antes.status !== "pago" : !r.id_externo)) return `"${r.descricao}" é de um fornecedor marcado como golpe (${motivo}): não pode ser paga. Se for engano, o administrador tira o bloqueio no cadastro do fornecedor.`;
  if (r.status === "aberto") {
    if (antes && ["pagar", "agendado"].includes(r.decisao) && r.decisao !== antes.decisao) return `"${r.descricao}" é de um fornecedor marcado como golpe (${motivo}): não pode ser aprovada nem agendada. Se for engano, o administrador tira o bloqueio no cadastro do fornecedor.`;
    if (r.decisao !== "nao_pagar") segurarDemo(r, motivo);
  }
  return null;
}
const REGRAS_GOLPE = new Set(["fornecedores", "contas_pagar"]);

// Regras dos fretes (no sistema real: gatilhos da migração 0020). Validam e completam a linha antes de gravar.
// ---------------------------------------------------------------------
const REGRAS_FRETE = new Set(["envios", "envio_cotacoes", "envio_ocorrencias"]);
const TIPOS_ADICIONAL_DEMO = ["tde", "trt", "agendamento", "pedagio", "gris", "ad_valorem", "outro"];
const ROTULO_ADICIONAL_DEMO: Record<string, string> = { tde: "TDE", trt: "TRT", agendamento: "Agendamento", pedagio: "Pedágio", gris: "GRIS", ad_valorem: "Ad valorem", outro: "Outro" };
const nomeTranspDemo = (id?: string | null, nome?: string | null) => db.transportadoras.find((t) => t.id === id)?.nome ?? (nome?.trim() || "sem transportadora");
const brlTxt = (v: unknown) => `R$ ${r2(Number(v ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numOuNulo = (v: unknown) => (v == null || v === "" ? null : Number(v));
const texto = (v: unknown) => String(v ?? "").trim() || null;
function excecaoDemo(envio_id: string, tipo: string, justificativa: string, detalhe: string | null = null, valor: number | null = null) {
  (db.envio_excecoes ??= []).push({ id: uid(), envio_id, tipo, justificativa, detalhe, valor, created_by: sessao?.user.id ?? null, created_at: new Date().toISOString() });
}

function regraFreteDemo(tabela: string, antes: Row | null, n: Row): string | null {
  const eu = sessao?.user.id ?? null, agora = new Date().toISOString();
  if (tabela === "envio_cotacoes") {
    n.adicionais = Array.isArray(n.adicionais) ? n.adicionais : [];
    for (const a of n.adicionais) {
      if (!TIPOS_ADICIONAL_DEMO.includes(a.tipo)) return "adicional inválido: use TDE, TRT, agendamento, pedágio, GRIS, ad valorem ou outro";
      if (!(Number(a.valor) >= 0)) return "informe o valor de cada adicional";
    }
    n.valor_total = r2(Number(n.valor) + n.adicionais.reduce((s: number, a: Row) => s + Number(a.valor), 0));
    n.tabela_versao = texto(n.tabela_versao);
    if (!antes) {
      const ev = db.envios.find((x) => x.id === n.envio_id);
      if (!cargaComparavel(ev?.volumes ?? [])) return "cotação sem medidas não é comparável: preencha largura, altura, comprimento e peso de todos os volumes (carga embalada) e salve o envio";
      if (!n.validade) return "informe até quando a cotação vale (validade)";
      n.escolhida = false;
      n.tipo_servico ??= "padrao";
    } else {
      if (!!n.escolhida !== !!antes.escolhida) return "a cotação é escolhida pelo botão Aprovar";
      if (antes.escolhida && (["valor", "tipo_servico", "tabela_versao", "validade", "transportadora_id", "transportadora_nome"].some((k) => (n[k] ?? null) !== (antes[k] ?? null))
        || JSON.stringify(n.adicionais) !== JSON.stringify(antes.adicionais ?? []))) {
        return "a cotação aprovada não muda: para um adicional que não estava previsto, use \"Adicional não previsto\" (com justificativa)";
      }
      if (antes.escolhida && antes.ativa && !n.ativa) return "a cotação aprovada não sai da lista: aprove outra antes";
    }
    return null;
  }
  if (tabela === "envio_ocorrencias") {
    n.resolucao = texto(n.resolucao);
    n.responsavel = texto(n.responsavel);
    if (n.status === "resolvida") {
      if (!antes || antes.status !== "resolvida" || (antes.resolucao && !n.resolucao)) {
        if (!n.resolucao || n.resolucao.length < 3) return "para marcar como resolvida, escreva como a ocorrência foi resolvida";
        if (!antes || antes.status !== "resolvida") n.resolvida_por = eu;
      }
    } else n.resolvida_por = null;
    return null;
  }
  // envios
  const motivo = String(n.motivo_excecao ?? "").trim();
  n.sem_comprovante_motivo = texto(n.sem_comprovante_motivo);
  n.conferencia_obs = texto(n.conferencia_obs);
  const protegidos = ["valor_aprovado", "valor_cotado", "aprovado_em", "aprovado_por", "cotacao_aprovada_id", "justificativa_escolha", "conta_pagar_id"];
  if (!antes) {
    for (const k of protegidos) n[k] = null;
    if (n.valor_cobrado_cliente == null && n.pedido_id) n.valor_cobrado_cliente = Number(db.pedidos.find((p) => p.id === n.pedido_id)?.frete ?? 0);
  } else {
    if (protegidos.some((k) => (n[k] ?? null) !== (antes[k] ?? null))) return "o frete aprovado e a conta a pagar mudam só pelos botões (Aprovar, Adicional não previsto, Lançar no contas a pagar)";
    const troca = !!antes.aprovado_em && n.status !== "cancelado" && ((n.transportadora_id ?? null) !== (antes.transportadora_id ?? null)
      || (!n.transportadora_id && (n.transportadora_nome ?? "").trim() !== (antes.transportadora_nome ?? "").trim()));
    if (troca) {
      if (motivo.length < 5) return `o frete já foi aprovado com ${nomeTranspDemo(antes.transportadora_id, antes.transportadora_nome)}: informe a justificativa da troca de transportadora`;
      excecaoDemo(antes.id, "troca_transportadora", motivo, `De ${nomeTranspDemo(antes.transportadora_id, antes.transportadora_nome)} para ${nomeTranspDemo(n.transportadora_id, n.transportadora_nome)}`);
    }
  }
  // sem comprovante: o motivo, com quem e quando
  const motivoAntes = antes ? texto(antes.sem_comprovante_motivo) : null;
  if (!n.sem_comprovante_motivo) { n.sem_comprovante_por = null; n.sem_comprovante_em = null; }
  else if (n.sem_comprovante_motivo !== motivoAntes) {
    if (n.sem_comprovante_motivo.length < 5) return "explique por que não há comprovante de entrega";
    n.sem_comprovante_por = eu; n.sem_comprovante_em = agora;
    if (antes) excecaoDemo(antes.id, "sem_comprovante", n.sem_comprovante_motivo);
  } else { n.sem_comprovante_por = antes!.sem_comprovante_por; n.sem_comprovante_em = antes!.sem_comprovante_em; }
  // não fecha sem prova de entrega
  const status = n.status !== "cancelado" && n.entregue_em ? "entregue" : n.status;
  const anexo = !!antes && (db.documentos ?? []).some((d) => d.entidade === "geral" && d.entidade_id === antes.id);
  if (status === "entregue" && !n.comprovante_em && !n.sem_comprovante_motivo && !anexo) {
    const provaAntes = !!antes && antes.status === "entregue" && (!!antes.comprovante_em || !!texto(antes.sem_comprovante_motivo));
    if (!antes || antes.status !== "entregue" || provaAntes) return "para marcar como entregue, informe a data do comprovante, anexe o comprovante ou escreva por que não há comprovante";
  }
  // conferência do frete final: mudou o valor, confere de novo
  const confAntes = antes ? texto(antes.conferencia_obs) : null;
  if (antes && n.conferencia_obs === confAntes && (numOuNulo(n.valor_final) !== numOuNulo(antes.valor_final) || numOuNulo(n.valor_aprovado) !== numOuNulo(antes.valor_aprovado))) n.conferencia_obs = null;
  if (!n.conferencia_obs) { n.conferido_por = null; n.conferido_em = null; }
  else if (n.conferencia_obs !== confAntes) {
    if (numOuNulo(n.valor_final) == null) return "informe o frete final faturado antes de registrar a conferência";
    if (n.conferencia_obs.length < 5) return "escreva o que foi conferido no frete final";
    n.conferido_por = eu; n.conferido_em = agora;
    if (antes) excecaoDemo(antes.id, "conferencia_frete", n.conferencia_obs, `Aprovado ${brlTxt(n.valor_aprovado)} · faturado ${brlTxt(n.valor_final)}`, r2(Number(n.valor_final) - Number(n.valor_aprovado ?? 0)));
  } else { n.conferido_por = antes!.conferido_por; n.conferido_em = antes!.conferido_em; }
  n.motivo_excecao = null;
  return null;
}

/** Fluxo de aprovação (migração fluxo_aprovacao): contas de exemplo em cada etapa. */
function aprovacaoDemo(db: Db) {
  const auto = { lancamento: "automatico", revisao1_nome: "Automático (passou nas validações)", revisao1_em: quando(-5) };
  for (const c of db.contas_receber) Object.assign(c, c.status === "aberto" ? { revisao: "aprovado", ...auto } : { revisao: "historico" });
  for (const c of db.contas_pagar) c.revisao ??= "historico";
  const conta = (id: string, patch: Row) => Object.assign(db.contas_pagar.find((c) => c.id === id) ?? {}, patch);
  conta("cp1", { revisao: "aprovado", ...auto });
  conta("cp2", { revisao: "aprovado", ...auto });
  conta("cp3", { revisao: "em_revisao", lancamento: "manual", criado_por: "u-fin" });
  // boletos com a linha digitável (Conferir boleto): aluguel vencido (multa e juros) e o boleto do golpe
  conta("cp3", { linha_digitavel: gerarLinhaBancaria("756", dias(-2), 6500, "1434200001234567800001018"), boleto_multa_pct: 2, boleto_juros_mes_pct: 1 });
  conta("cpg1", { linha_digitavel: gerarLinhaBancaria("237", dias(6), 389.9, "3381090000045678901234000") });
  conta("cp4", { revisao: "em_revisao", lancamento: "manual", criado_por: "u-fin", documento: "Fatura 10/2026", revisao1_por: "u-admin", revisao1_nome: "Admin Exemplo",
    revisao1_em: quando(-1), exige_2a: true, motivo_2a: "valor a partir de R$ 300,00" });
  conta("cp20", { revisao: "devolvido", lancamento: "manual", criado_por: "u-fin", revisao_comentario: "Falta anexar a nota da manutenção" });
  conta("cp21", { revisao: "em_revisao", lancamento: "manual", criado_por: "u-fin", categoria: "frete", documento: "CT-e 1290" });
  conta("cpg1", { revisao: "em_revisao", lancamento: "manual", criado_por: "u-fin" });
  conta("cp5", { revisao: "aprovado", lancamento: "manual", criado_por: "u-fin", revisao1_por: "u-admin", revisao1_nome: "Admin Exemplo", revisao1_em: quando(-14),
    revisao2_por: "u-fin", revisao2_nome: "Rafael Financeiro", revisao2_em: quando(-14), exige_2a: true, motivo_2a: "valor a partir de R$ 300,00", documento: "Guia DAS 09/2026" });
  db.contas_pagar.push({ id: "cp30", descricao: "Material de escritório", categoria: "outros", documento: "NFC-e 552", valor: 184.5, vencimento: dias(4), status: "aberto",
    created_at: quando(-1), revisao: "em_revisao", lancamento: "manual", criado_por: "u-fin" });
  // boleto vencido de conta já aprovada: dá para conferir os juros e pagar (Conferir boleto)
  db.contas_pagar.push({ id: "cp31", descricao: "Caixas de papelão - Embalagens Sul", categoria: "fornecedores", documento: "NF 7781", valor: 1840, vencimento: dias(-3), status: "aberto",
    created_at: quando(-6), revisao: "aprovado", lancamento: "manual", criado_por: "u-fin", revisao1_por: "u-admin", revisao1_nome: "Admin Exemplo", revisao1_em: quando(-5),
    revisao2_por: "u-fin", revisao2_nome: "Rafael Financeiro", revisao2_em: quando(-5), exige_2a: true, motivo_2a: "valor a partir de R$ 300,00",
    linha_digitavel: gerarLinhaBancaria("136", dias(-3), 1840, "0070120004433221100009871"), boleto_multa_pct: 2, boleto_juros_mes_pct: 1 });
  db.revisoes_contas = [
    { id: "rv1", tabela: "contas_pagar", conta_id: "cp4", acao: "aprovou", etapa: "1ª revisão", comentario: null, usuario_nome: "Admin Exemplo", created_at: quando(-1) },
    { id: "rv2", tabela: "contas_pagar", conta_id: "cp20", acao: "devolveu", etapa: "1ª revisão", comentario: "Falta anexar a nota da manutenção", usuario_nome: "Admin Exemplo", created_at: quando(-1) },
  ];
}

/** Conta a pagar em aberto ainda sem aprovação (no sistema real: gatilho trg_zs_pagamento_aprovado). */
const semAprovacaoDemo = (c: Row) => c.status === "aberto" && !!c.revisao && !["aprovado", "historico"].includes(c.revisao);

/** Revisão das contas (no sistema real: revisar_contas e contador_conferir). */
function revisarDemo(tabela: string, ids: string[], acao: string, comentario: string | null) {
  const eu = db.usuarios_erp.find((u) => u.user_id === sessao?.user.id);
  if (!eu || !["admin", "financeiro"].includes(eu.papel) && !(eu.papeis_extras ?? []).includes("financeiro")) return erro("sem permissão para esta ação");
  const com = (comentario ?? "").trim();
  if ((acao === "devolver" || acao === "rejeitar") && com.length < 5) return erro("escreva o motivo (fica no histórico e quem lançou vê)");
  const regras = regrasDe(db.configuracoes[0]);
  const tipo: TipoConta = tabela === "contas_pagar" ? "pagar" : "receber";
  const log = (id: string, a: string, etapa: string | null) =>
    db.revisoes_contas.push({ id: uid(), tabela, conta_id: id, acao: a, etapa, comentario: com || null, usuario_nome: eu.nome, created_at: new Date().toISOString() });
  let n = 0;
  for (const id of ids) {
    const c = db[tabela].find((x) => x.id === id);
    if (!c) return erro("conta não encontrada");
    if (acao === "reenviar") {
      if (c.revisao !== "devolvido") return erro(`"${c.descricao}" não está devolvida`);
      atualizarDemo(tabela, c, { revisao: "em_revisao" }); log(id, "reenviou", null); n++; continue;
    }
    const q = quemPode(c as ContaRevisao, { id: eu.user_id, admin: eu.papel === "admin" }, regras);
    if (!q.pode) return erro(`"${c.descricao}": ${q.motivo}`);
    const etapa = `${q.etapa}ª revisão`;
    if (acao === "devolver") {
      atualizarDemo(tabela, c, { revisao: "devolvido", revisao_comentario: com, revisao1_por: null, revisao1_nome: null, revisao1_em: null, revisao2_por: null, revisao2_nome: null, revisao2_em: null });
    } else if (acao === "rejeitar") {
      atualizarDemo(tabela, c, { revisao: "rejeitado", revisao_comentario: com, ...(c.status === "aberto" ? { status: "cancelado" } : {}) }, `Rejeitada na revisão: ${com}`);
    } else {
      const pend = pendenciasConta(c as ContaRevisao, tipo, {
        anexos: new Set((db.documentos ?? []).filter((d) => d.entidade === (tipo === "pagar" ? "conta_pagar" : "conta_receber")).map((d) => d.entidade_id)),
        categorias: db.categorias_financeiras as { nome: string; tipo: string; ativo?: boolean }[], todas: db[tabela] as ContaRevisao[],
      });
      let exige = !!c.exige_2a, motivo: string | null = c.motivo_2a ?? null;
      if (pend.length) {
        if (com.length < 10) return erro(`"${c.descricao}" tem pendência (${pend.join(", ")}): para aprovar mesmo assim, escreva por quê (vai para a 2ª revisão)`);
        exige = true; motivo = `${motivo ? `${motivo} · ` : ""}aprovada com pendência (${pend.join(", ")})`;
      }
      if (Number(c.valor) >= regras.alcada) { exige = true; motivo ??= `valor a partir de R$ ${regras.alcada.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`; }
      const agora = new Date().toISOString();
      atualizarDemo(tabela, c, q.etapa === 1
        ? { revisao1_por: eu.user_id, revisao1_nome: eu.nome, revisao1_em: agora, exige_2a: exige, motivo_2a: motivo, revisao: exige ? "em_revisao" : "aprovado", ...(com ? { revisao_comentario: com } : {}) }
        : { revisao2_por: eu.user_id, revisao2_nome: eu.nome, revisao2_em: agora, revisao: "aprovado", ...(com ? { revisao_comentario: com } : {}) });
    }
    log(id, acao === "aprovar" ? "aprovou" : acao === "devolver" ? "devolveu" : "rejeitou", etapa);
    n++;
  }
  return { data: n, error: null };
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
  // WhatsApp oficial: número ligado (envio automático desligado), um modelo aprovado e um em análise, mensagens de exemplo
  Object.assign(db.configuracoes[0], { whatsapp_numero_id: "109876543210987", whatsapp_waba_id: "123456789012345", whatsapp_numero: "+55 48 3030-4040", whatsapp_nome: "MF Máquinas", whatsapp_api_ativo: false });
  for (const [id, st] of [["rg3", "APPROVED"], ["rg4", "PENDING"]] as const) {
    const e = db.regua_cobranca.find((x) => x.id === id)!;
    const m = modeloDaMensagem(e.mensagem);
    Object.assign(e, { wa_modelo: nomeModelo(e as any, m.texto), wa_texto: m.texto, wa_variaveis: m.variaveis, wa_mensagem_base: e.mensagem, wa_status: st, wa_erro: null });
  }
  db.whatsapp_mensagens = [
    { id: "wm1", direcao: "saida", telefone: "5548999112233", cliente_id: "c1", conta_receber_id: "r2", etapa_id: "rg3", modelo: "mf_regua_vencimento_0", status: "lido", erro: null,
      texto: "Olá, Gelato! Hoje vence *Pedido #101 - parcela 2/3*, no valor de *R$ 7.909,33*.\n\nPix copia e cola: 000201…", created_at: quando(-1.2) },
    { id: "wm2", direcao: "entrada", telefone: "5548999112233", cliente_id: "c1", texto: "Oi! Vou pagar amanhã cedo, pode ser? O Pix já está separado.", status: "recebido", erro: null, created_at: quando(-0.2) },
    { id: "wm3", direcao: "saida", telefone: "5547988776655", cliente_id: "c4", conta_receber_id: "r7", etapa_id: "rg4", modelo: "mf_regua_vencimento_5", status: "entregue", erro: null,
      texto: "Olá, Sorveteria! Não identificamos o pagamento de *Assistência técnica OS #50* (R$ 275,00)…", created_at: quando(-2) },
    { id: "wm4", direcao: "saida", telefone: "5511912345678", cliente_id: "c5", conta_receber_id: null, etapa_id: "rg3", modelo: "mf_regua_vencimento_0", status: "erro",
      erro: "Este número não tem WhatsApp.", texto: "Olá! Hoje vence *Pedido #105*…", created_at: quando(-3) },
  ];
  for (const u of db.unidades) if (u.codigo === "SC") Object.assign(u, { pix_chave: "46.942.855/0001-32", pix_nome: "MF MAQUINAS LTDA", pix_cidade: "Sao Jose" });
  for (const u of db.unidades) u.infinitepay_tag ??= u.codigo === "SC" ? "myfrost" : "mf-maquinas";
  // chaves e certificados com data para vencer (exemplo; no sistema real: public.vencimentos_chaves, só o administrador)
  db.vencimentos_chaves = [
    { id: "vc1", nome: "Chave do Supabase no GitHub", tipo: "chave", onde: "GitHub → Settings → Secrets → SUPABASE_ACCESS_TOKEN (backup e funções)",
      vence_em: quando(5).slice(0, 10), avisar_dias: 15, como_renovar: "Gerar outra chave no Supabase (Account → Access Tokens) e trocar o secret no GitHub.", situacao: "ativa" },
  ];
  // regra do extrato por favorecido (no sistema real: public.conciliacao_regras): a tarifa da OLIST vira sugestão pronta
  db.conciliacao_regras = [
    { id: "rg1", chave: "OLIST SERVICOS DIGITAIS", direcao: "saida", rotulo: "OLIST SERVICOS DIGITAIS LTDA", acao: "lancar", categoria: "tarifas bancárias",
      motivo: null, fornecedor_id: null, cliente_id: null, ativo: true, usos: 12, ultimo_uso: quando(-20), criado_em: quando(-40), atualizado_em: quando(-20) },
  ];
  // registro das execuções dos comandos (exemplos; no sistema real: public.ecl_execucoes, só o administrador)
  db.ecl_execucoes = [
    { id: "ex1", comando: "MONITOR", alvo: "automacoes", origem: "monitor", situacao: "em_andamento", criado_em: quando(-0.1),
      entrada: "Vigia automático (de hora em hora)", diagnostico: "Backup: nenhuma cópia guardada até hoje\n3 NF-e com erro há mais de 1 dia",
      decisao: "Avisar o administrador no sino do ERP: backup como urgente e com ciência; o resto como importante.",
      entrega: "2 aviso(s) novo(s) no sino do ERP", validacao: "A próxima rodada (daqui a 1 hora) confere de novo; o mesmo aviso não se repete por 20 horas.",
      proxima_acao: "Backup: corrigir os secrets do GitHub e rodar o \"Backup diário\" de novo\nNotas fiscais: abrir as notas com erro e corrigir" },
    { id: "ex2", comando: "ANALYZE", alvo: "erp", origem: "claude", situacao: "concluida", criado_em: quando(-0.2),
      entrada: "ANALYZE erp: gargalos, UX, desempenho, consistência, riscos e oportunidades",
      diagnostico: "Gargalos: extrato quase todo a conciliar.\nUX: telas sem erro e sem nada saindo da tela.\nDesempenho: abre rápido.\nConsistência: tipos e testes em dia.\nRiscos: backup sem cópia guardada.\nOportunidades: conciliação em lote.",
      decisao: "Construir o Monitor com aviso urgente do backup; o resto entra na fila.", entrega: "Aba Monitor, vigia de hora em hora e este registro.",
      validacao: "Testes automáticos e varredura das telas no computador e no celular.", proxima_acao: "Empresa: corrigir os secrets do backup no GitHub." },
  ];
  // parcelamentos de impostos (exemplos inventados; no sistema real: public.parcelamentos e parcelamento_parcelas)
  {
    const mesAtras = (k: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }; };
    const ate = (k: number) => { const m = mesAtras(k); return ultimoDiaUtil(m.ano, m.mes); };
    const diaDez = (k: number) => { const m = mesAtras(k); return `${m.ano}-${String(m.mes).padStart(2, "0")}-10`; };
    const base = { descricao: null, valor_consolidado: null, corrige_selic: true, max_atrasos: 3, observacoes: null, dia_vencimento: null };
    db.parcelamentos = [
      { ...base, id: "pa1", unidade_id: U_SC, orgao: "receita_federal", modalidade: "Parcelamento ordinário (Lei 10.522)", numero: "10010.000000/2025-01", data_adesao: ate(14),
        qtd_parcelas: 60, valor_parcela: 1850, valor_consolidado: 111000, primeira_parcela: ate(14), vencimento_regra: "ultimo_dia_util", rescinde_ultima: true, situacao: "ativo" },
      { ...base, id: "pa2", unidade_id: U_SC, orgao: "pgfn", modalidade: "Transação tributária (PGFN)", numero: "TR-0000001", data_adesao: ate(8),
        qtd_parcelas: 24, valor_parcela: 920, primeira_parcela: ate(8), vencimento_regra: "ultimo_dia_util", rescinde_ultima: true, situacao: "ativo",
        observacoes: "Débitos de IRPJ e CSLL inscritos em dívida ativa (exemplo)." },
      { ...base, id: "pa3", unidade_id: U_SC, orgao: "sefaz_sc", modalidade: "Parcelamento de ICMS", numero: "SC-2025-0001", data_adesao: diaDez(5),
        qtd_parcelas: 12, valor_parcela: 640, primeira_parcela: diaDez(5), vencimento_regra: "dia", dia_vencimento: 10, rescinde_ultima: false, situacao: "ativo" },
      { ...base, id: "pa4", unidade_id: U_SP, orgao: "sefaz_sp", modalidade: "Parcelamento de ICMS (PEP)", numero: "SP-2023-0002", data_adesao: diaDez(30),
        qtd_parcelas: 18, valor_parcela: 410, primeira_parcela: diaDez(30), vencimento_regra: "dia", dia_vencimento: 10, rescinde_ultima: false, situacao: "quitado" },
    ];
    const hoje = hojeISO();
    // quem pagou: a maioria a MF, algumas outra empresa ou a conta pessoal (como acontece de verdade)
    const quem = ["mf", "mf", "outra_empresa", "mf", "pessoal", "mf"];
    const atrasar: Record<string, number> = { pa1: 1, pa2: 2, pa3: 0, pa4: 0 };
    db.parcelamento_parcelas = db.parcelamentos.flatMap((p) => {
      const lista = gerarParcelas(p as never);
      const passadas = lista.filter((x) => x.vencimento < hoje).length;
      return lista.map((x) => {
        const paga = x.vencimento < hoje && x.numero <= passadas - atrasar[p.id];
        const por = quem[x.numero % quem.length];
        return {
          id: `pp-${p.id}-${x.numero}`, parcelamento_id: p.id, numero: x.numero, vencimento: x.vencimento, valor: x.valor, situacao: paga ? "pago" : "a_pagar",
          pago_em: paga ? x.vencimento : null, valor_pago: paga ? Math.round(Number(x.valor) * (p.corrige_selic ? 1.03 : 1) * 100) / 100 : null,
          pago_por: paga ? por : null, pago_por_nome: paga && por === "outra_empresa" ? "Empresa ligada (exemplo)" : null,
          extrato_lancamento_id: null, observacao: null, atualizado_em: quando(-1),
        };
      });
    });
  }
  db.clientes.forEach((c, i) => { c.portal_token ??= `demo-portal-${i + 1}`; });
  // categorias dos produtos (como no Tiny)
  const cats = ["As Máquinas My Frost", "Chave Extratora - Portelo", "Peças de Reposição", "Peças Eletrica - My Frost", "Peças Mecânica - My Frost",
    "Peças Refrigeração - My Frost", "Vedantes/ Orings My Frost", "As Extrutura Máquinas", "As Extrutura Máquinas > Cilindros", "Batedor de Milk"];
  db.produtos.forEach((p) => { p.categoria ??= p.tipo === "maquina" ? "As Máquinas My Frost" : /veda|o-?ring|borracha/i.test(p.descricao) ? "Vedantes/ Orings My Frost" : "Peças de Reposição"; });
  db.categorias_produto = [...new Set([...cats, ...db.produtos.map((p) => p.categoria).filter(Boolean)])].map((nome, i) => ({ id: `cat${i + 1}`, nome, ativo: true }));
  // formação de preço: três peças cujo custo subiu na última nota e ficaram abaixo da margem desejada
  db.preco_sugestoes = [["p6", 560], ["p4", 390], ["p8", 1290]].map(([id, anterior], i) => {
    const p = db.produtos.find((x) => x.id === id)!;
    const alvo = margemAlvo(p as any, PRECO_PADRAO, db.categorias_produto as any).margem;
    return { id: `ps${i + 1}`, produto_id: id, status: "pendente", origem: "custo", custo_anterior: anterior, custo_novo: p.preco_custo,
      preco_atual: p.preco_venda, preco_sugerido: precoSugerido(Number(p.preco_custo), alvo, PRECO_PADRAO), margem_alvo: alvo,
      preco_aprovado: null, decidido_por: null, decidido_em: null, created_at: quando(-i) };
  });
  // categorias dos cadastros (tipo de contato)
  db.tipos_contato = [
    { id: "fornecedor", chave: "fornecedor", nome: "Fornecedor", cor: "purple", ordem: 1, ativo: true, sistema: true },
    { id: "revenda", chave: "revenda", nome: "Revenda", cor: "indigo", ordem: 2, ativo: true, sistema: false },
    { id: "parceiro", chave: "parceiro", nome: "Técnico parceiro", cor: "orange", ordem: 3, ativo: true, sistema: true },
    { id: "compra_usada", chave: "compra_usada", nome: "Compra máquina usada", cor: "emerald", ordem: 4, ativo: true, sistema: true },
    { id: "licenciado_my_frost", chave: "licenciado_my_frost", nome: "Licenciado My Frost", cor: "purple", ordem: 5, ativo: true, sistema: true },
  ];
  // a cliente da máquina usada (e8) está no cadastro de quem compra usada
  { const c3 = db.clientes.find((c: Row) => c.id === "c3"); if (c3) c3.tags = [...(c3.tags ?? []), "compra_usada"]; }
  // NFS-e: matriz configurada no padrão nacional (a OS #50 está concluída e pode ser faturada)
  db.nfse_config = [{ unidade_id: U_SC, ativo: true, padrao: "nacional", codigo_municipio: "4216602", item_lista_servico: "14.01", codigo_tributacao_nacional: "140101",
    codigo_tributario_municipio: null, codigo_nbs: null, codigo_cnae: null, aliquota_iss: 2, iss_retido: false, optante_simples_nacional: false,
    regime_especial_tributacao: null, natureza_operacao: null, incluir_pecas: false, enviar_email_tomador: true, observacoes: null,
    discriminacao_modelo: "Serviço de assistência técnica — OS nº {os}. Equipamento: {equipamento}. Serviço realizado: {solucao}",
    serie_dps: 1, proximo_numero_dps: 1, ibs_cbs_cst: "000", ibs_cbs_class_trib: "000001", codigo_indicador_operacao: null, consumidor_final: false }];
  db.nfse = [];
  db.nfse_eventos = [];
  // NFS-e feitas fora do ERP: uma emitida no Tiny (só RPS) e uma recebida do escritório de contabilidade
  const nfseFora = (x: Row) => ({ codigo_verificacao: null, chave_acesso: null, competencia: null, municipio: null, cliente_id: null, fornecedor_id: null,
    valor_iss: null, iss_retido: false, valor_ir: 0, valor_inss: 0, valor_pis: 0, valor_cofins: 0, valor_csll: 0, valor_liquido: null, discriminacao: null,
    codigo_servico: null, prestador_doc: null, prestador_nome: null, tomador_doc: null, tomador_nome: null, numero: null, rps: null, conta_pagar_id: null, created_at: quando(0), ...x });
  // modo fiscal avançado: uma quebra na fabricação documentada e um furto ainda sem boletim de ocorrência
  db.baixas_estoque = [
    { id: "bx1", numero: 1, unidade_id: U_SC, motivo: "quebra_fabricacao", produto_id: "p4", quantidade: 1, custo_unitario: 420, valor: 420, peso_kg: null,
      equipamento: null, fornecedor_id: null, nota_devolucao_id: null, evidencia: "Foto no grupo da produção", descricao: "Motor queimou no teste do giga", situacao: "registrada",
      cancelada_motivo: null, criado_por_nome: "Rafael Financeiro", created_at: quando(-12) },
    { id: "bx2", numero: 2, unidade_id: U_SC, motivo: "furto_extravio", produto_id: "p4", quantidade: 1, custo_unitario: 420, valor: 420, peso_kg: null,
      equipamento: null, fornecedor_id: null, nota_devolucao_id: null, evidencia: null, descricao: "Não achado no inventário de setembro", situacao: "registrada",
      cancelada_motivo: null, criado_por_nome: "Rafael Financeiro", created_at: quando(-5) },
  ];
  db.configuracoes[0].fiscal_avancado = true;
  // frequência de coleta (como no portal da Rodonaves): Rodonaves seg–sex na matriz; São Miguel só terça e quinta à tarde
  db.coleta_frequencias = [
    { id: "cf1", transportadora_id: "t1", unidade_id: U_SC, dias: [1, 2, 3, 4, 5], manha: true, tarde: true, antecedencia_dias: 1, observacao: "Pedir até 11h para coletar à tarde", atualizado_em: quando(-3) },
    { id: "cf2", transportadora_id: "t6", unidade_id: U_SC, dias: [2, 4], manha: false, tarde: true, antecedencia_dias: 1, observacao: null, atualizado_em: quando(-3) },
  ];
  db.nfse_importadas = [
    nfseFora({ id: "nsi1", tipo: "emitida", unidade_id: U_SC, chave: "emitida:sc:r2426", rps: "2426", data_emissao: dias(-60), tomador_nome: "Sorveteria Franquia Ltda",
      valor_servicos: 6000, valor_pis: 39, valor_cofins: 180, valor_csll: 60, situacao: "sem_numero", origem: "tiny" }),
    nfseFora({ id: "nsi2", tipo: "tomada", unidade_id: U_SC, chave: "tomada:11222333000181:n55", numero: "55", data_emissao: dias(-10), prestador_doc: "11222333000181",
      prestador_nome: "Escritório Contábil Exemplo", tomador_doc: "46942855000132", valor_servicos: 1500, valor_iss: 30, iss_retido: true, valor_ir: 22.5,
      valor_pis: 9.75, valor_cofins: 45, valor_csll: 15, valor_liquido: 1377.75, discriminacao: "Honorários contábeis", situacao: "normal", origem: "xml" }),
  ];
  // cadastro para arrumar: etiquetas da Receita, um repetido, um fornecedor na lista e celular no campo telefone
  // c4 também é licenciado da licenciadora de sorveterias (venda de máquinas e proposta do Tiny aparecem com o selo)
  Object.assign(db.clientes[3], { tags: ["ie_baixada", "endereco_receita", "licenciado_my_frost"], receita_situacao: "ATIVA", ie_situacao: "baixada", receita_em: quando(-2),
    receita: { nome: "Doce Gelo Sorvetes Eireli", fantasia: "Doce Gelo", situacao: "ATIVA", email: null, telefones: [], fonte: "CNPJ.ws", inscricoes: [{ numero: "0012345670012", uf: "GO", ativa: false }],
      endereco: { cep: "74115050", logradouro: "Rua 9", numero: "1200", complemento: "Sala 4", bairro: "Setor Oeste", municipio: "Goiânia", uf: "GO" } } });
  Object.assign(db.clientes[4], { tags: ["cnpj_irregular"], receita_situacao: "BAIXADA", receita_em: quando(-1) });
  db.clientes.push(
    { ...db.clientes[2], id: "c6", codigo: 6, cpf_cnpj: null, email: null, whatsapp: null, telefone: "34999112233", portal_token: "demo-portal-6", tags: [], receita: null },
    { id: "c7", codigo: 7, tipo_pessoa: "PJ", nome: "Refrigeração Andrade Ltda", cpf_cnpj: "11222333000181", contribuinte_icms: 1, telefone: "1132221100", municipio: "São Paulo", uf: "SP", avisos_email: true, portal_token: "demo-portal-7", tags: [] } as any,
    { id: "c8", codigo: 8, tipo_pessoa: "PF", nome: "Marileia Prestes", cpf_cnpj: "98765432100", contribuinte_icms: 9, telefone: "5599864949", municipio: "Campina das Missões", uf: "RS", avisos_email: true, portal_token: "demo-portal-8", tags: [] } as any,
  );
  db.configuracoes[0].site_url ??= null;
  // códigos EAN de exemplo: duas máquinas com o mesmo código inventado (777 é da GS1 Bolívia) e o kit com código de fora
  for (const id of ["p1", "p2", "p3"]) Object.assign(db.produtos.find((p) => p.id === id) ?? {}, { marca: "MF" });
  Object.assign(db.produtos.find((p) => p.id === "p2") ?? {}, { codigo_barras: "7778877353538" });
  Object.assign(db.produtos.find((p) => p.id === "p3") ?? {}, { codigo_barras: "7778877353538" });
  Object.assign(db.produtos.find((p) => p.id === "p5") ?? {}, { codigo_barras: "7779182251083", marca: "MF" });
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
    // cartão de uma pessoa: os débitos viram o "Cartão Rafael" no Início (o real é o Cartão Fabiano)
    { id: "cb5", unidade_id: U_SP, nome: "InfinitePay SP", etiqueta: "Vendas", banco: "infinitepay", agencia: null, numero: null, tipo: "pagamentos", saldo_inicial: 3000, saldo_inicial_data: inicio, ativo: true, created_at: quando(-45),
      cartao_nome: "Cartão Rafael", cartao_responsavel: "u-fin" },

    { id: "cb6", unidade_id: U_SC, nome: "Banco Inter SC", banco: "inter", agencia: "0001", numero: "1234567-8", tipo: "corrente", saldo_inicial: 0, saldo_inicial_data: inicio, ativo: true, created_at: quando(-10) },
  ];
  // exceções de exemplo: boleto lançado duas vezes e um pagamento redondo sem documento
  db.contas_pagar.push(
    { id: "cp6", descricao: "NF 48733 - Refrigeração Andrade (compressores)", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48733", valor: 2700, vencimento: dias(10), status: "aberto", unidade_id: U_SC, created_at: quando(-4) },
    { id: "cp7", descricao: "Boleto Refrigeração Andrade - compressores", fornecedor_id: "f1", categoria: "fornecedores", documento: "NF 48733", valor: 2700, vencimento: dias(12), status: "aberto", unidade_id: U_SC, created_at: quando(-2),
      linha_digitavel: gerarLinhaBancaria("341", dias(12), 2700, "1090048733000123456789000") },
    { id: "cp8", descricao: "Adiantamento a fornecedor", categoria: "outros", valor: 10000, vencimento: dias(-20), status: "pago", data_pagamento: dias(-20), valor_pago: 10000, unidade_id: U_SC, created_at: quando(-21) },
  );
  db.extrato_lancamentos = [];
  // gastos do cartão (hoje, ontem e no mês): padaria, posto, mercado, material, farmácia e um Pix
  ([[0, -12.5, "PADARIA CENTRAL · mfmaquinas"], [0, -64, "MP *RESTAURANTE DO CENTRO · mfmaquinas"], [0, -180, "AUTO POSTO EXEMPLO · mfmaquinas"],
    [0, -128.72, "ELETRO MATERIAIS EXEMPLO · mfmaquinas"], [-1, -73.08, "SUPERMERCADO EXEMPLO · mfmaquinas"], [-1, -22.9, "DROGARIA EXEMPLO · mfmaquinas"],
    [-1, -350, "Pix PRESTADOR EXEMPLO · Enviado"], [-3, -95.4, "JIM.COM* ESPETARIA DO ZE · mfmaquinas"], [-5, -2000, "Pix MF MAQUINAS LTDA · Enviado"],
    [-6, -210, "POSTO DA SERRA · mfmaquinas"], [-8, -45, "CASA DOS PARAFUSOS · mfmaquinas"]] as [number, number, string][])
    .forEach(([d, v, desc], i) => db.extrato_lancamentos.push({ id: `cx${i + 1}`, conta_bancaria_id: "cb5", importacao_id: null, data: dias(d), valor: v, descricao: desc, documento: null,
      identificador: `cx-${i + 1}`, status: "pendente", conta_receber_id: null, conta_pagar_id: null, baixou_conta: false, par_transferencia_id: null, observacao: null,
      conciliado_em: null, created_at: quando(d) }));
  db.cartao_gastos = [{ lancamento_id: "cx6", situacao: "pessoal", categoria: null, nota_numero: null, nfe_recebida_id: null, observacao: null, atualizado_em: quando(-1) }];
  // a NF-e do material comprado no cartão já chegou da SEFAZ (casa pelo valor)
  db.nfe_recebidas.push({ id: "nr-cartao", chave: "35261099888777000166550010000001231000001230", emitente_nome: "Eletro Materiais Exemplo Ltda", emitente_cnpj: "99888777000166",
    valor_total: 128.72, data_emissao: quando(0), situacao: "autorizada", manifestacao: "ciencia", unidade_id: U_SP, processamento: "pendente", created_at: quando(0), itens: [] });
  db.openfinance_conexoes = [];
  // Banco Inter SC ligado pela API, com o boleto com Pix (prévia: um boleto em aberto na conta r9)
  db.inter_conexoes = [{ id: "ix1", conta_bancaria_id: "cb6", conta_corrente: null, status: "ativa", erro: null, desde: dias(-10), sincronizado_em: quando(0), ultimas_novas: 0,
    saldo: 15230.4, saldo_em: quando(0), certificado_validade: quando(300), boletos: true, boletos_erro: null, boletos_webhook_em: quando(-1),
    boleto_multa_pct: 2, boleto_juros_mes_pct: 1, boleto_dias_baixa: 30, boleto_mensagem: "Não receber após 30 dias do vencimento", created_at: quando(-10) }];
  db.boletos_inter = [{ id: "bi1", conta_receber_id: "r9", conexao_id: "ix1", unidade_id: U_SC, codigo_solicitacao: "demo-bi1", seu_numero: "R9", valor: 1890, vencimento: dias(0),
    situacao: "A_RECEBER", situacao_data: dias(-1), nosso_numero: "00012345678", linha_digitavel: "07790001161234567890123456789012398760000189000",
    codigo_barras: "07798987600001890000001112345678901234567890", pix_copia_cola: "00020101021226870014br.gov.bcb.pix2565pix.exemplo.com/qr/v2/cobv/demo520400005303986540518905802BR5913MF MAQUINAS6013FLORIANOPOLIS62070503***6304ABCD",
    txid: "demo", valor_recebido: null, origem_recebimento: null, baixa_em: null, motivo_cancelamento: null, erro: null, criado_nome: "Rafael Financeiro", created_at: quando(-1), atualizado_em: quando(-1) }];
  db.compras_legado = [];
  // descontos: máximo por tipo de venda; na prévia o administrador aprova com a senha 123456
  db.regras_desconto = [
    { id: uid(), canal: "todos", forma_pagamento: "qualquer", maximo_percentual: 10, ativo: true, observacao: null, created_at: quando(-5) },
    { id: uid(), canal: "balcao", forma_pagamento: "pix", maximo_percentual: 15, ativo: true, observacao: "Pix no balcão", created_at: quando(-5) },
  ];
  db.aprovacoes_desconto = [];
  db.senhas_aprovacao = [{ user_id: "u-admin", senha: "123456" }];
  // propostas do Tiny (histórico): MF com valores; My Frost (empresa anterior) sem valores
  const propTiny = (empresa: string, numero: number, d: number, situacao: string, cliente_id: string, itens: Row[], extra: Row = {}) => ({
    id: uid(), empresa, tiny_id: `demo-${empresa}-${numero}`, numero, data: dias(d), proximo_contato: null, situacao, vendedor: "Vendedor exemplo",
    cliente_id, contato_nome: null, aos_cuidados: null, unidade_id: empresa === "mf" ? U_SC : null, validade_dias: 7,
    prazo_entrega: empresa === "mf" ? "20 dias de produção + frete" : null, observacoes: null,
    desconto: empresa === "mf" ? 0 : null, frete: empresa === "mf" ? 0 : null,
    total: empresa === "mf" ? itens.reduce((t: number, i: Row) => t + i.quantidade * i.valor_unitario, 0) : null,
    itens, created_at: quando(d), ...extra,
  });
  db.propostas_tiny = [
    propTiny("mf", 139, -40, "Concluído", "c1", [{ descricao: "Máquina de Sorvete Soft MF-300 (3 bicos)", quantidade: 1, valor_unitario: 23900, produto_id: "p1" }],
      { observacoes: "Pagamento: 50% no pedido e 50% antes do envio. Garantia de 12 meses a partir da nota fiscal." }),
    propTiny("mf", 161, -12, "Aguardando", "c4", [{ descricao: "Máquina de Sorvete Expressa MF-150 Balcão", quantidade: 2, valor_unitario: 14500, produto_id: "p2" },
      { descricao: "Kit vedação do cilindro", quantidade: 4, valor_unitario: 95, produto_id: "p5" }], { proximo_contato: dias(3) }),
    propTiny("mf", 158, -25, "Não aprovado", "c5", [{ descricao: "Máquina de Milk Shake MF-MS2 (2 hastes)", quantidade: 1, valor_unitario: 3690, produto_id: "p3" }]),
    propTiny("mf", 163, -6, "Pendente", "c3", [{ descricao: "Máquina de Sorvete Expressa MF-150 Balcão", quantidade: 1, valor_unitario: 14500, produto_id: "p2" }], { proximo_contato: dias(-2) }),
    propTiny("my_frost", 1071, -420, "Concluído", "c2", [{ descricao: "My Frost Top 300 - Máquina de Sorvete Expresso", quantidade: 1 }]),
  ];
  // notas fiscais da empresa anterior (no sistema real: aba NFes do backup, via importar_notas_legado)
  db.notas_legado = [
    { id: uid(), origem: "My Frost", numero: "5395", data: dias(-412), valor: 21500, natureza: "Venda de producao do estabelecimento", cliente_id: "c2" },
    { id: uid(), origem: "My Frost", numero: "6120", data: dias(-95), valor: 3000, natureza: "Remessa de mercadoria ou bem para conserto ou reparo", cliente_id: "c2" },
  ];
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
  // Pix de vendas sem conta a receber (Vendas → marcar → Conciliar acha o par)
  add("cb1", dias(0), 1754, "PIX RECEBIDO LANCHONETE PONTO DOCE");
  add("cb1", dias(-1), 2329, "TRANSFERENCIA RECEBIDA PELO PIX");
  add("cb1", dias(-3), -5000, "TED MESMA TITULARIDADE - NU PAGAMENTOS");
  add("cb2", dias(-3), 5000, "Transferência recebida - MF MAQUINAS LTDA");
  add("cb2", dias(-6), -189, "Pagamento de boleto - Google Ads");
  add("cb1", dias(-1), -2700, "PAGAMENTO DE BOLETO - REFRIGERACAO ANDRADE");
  add("cb3", dias(-4), 3690, "Venda no crédito · Cliente balcão (Lanchonete)");
  add("cb3", dias(-4), -110.7, "Taxa · Taxa da venda no crédito");
  // cartão da empresa: abastecimentos e pedágio (tela Combustível)
  add("cb3", dias(-2), -250, "POSTO ESTRELA DO SUL LTDA · cartao");
  add("cb3", dias(-12), -180.5, "AUTO POSTO BOA VIAGEM · cartao");
  add("cb3", dias(-40), -210, "POSTO ESTRELA DO SUL LTDA · cartao");
  add("cb3", dias(-5), -12.3, "AUTOBAN · cartao");
  // compras em marketplaces (tela Compras em marketplaces): notas das lojas com o intermediador (infIntermed) e os pagamentos
  const notaMkt = (id: string, nf: number, d: number, loja: string, cnpj: string, intermed: string, usuario: string, itens: [string, number, number][], infCpl = "", fornecedor: string | null = null) => {
    const total = r2(itens.reduce((t, [, q, v]) => t + q * v, 0));
    db.nfe_recebidas.push({
      id, chave: `422610${cnpj}55001${String(nf).padStart(9, "0")}1${String(nf).padStart(8, "0")}5`, emitente_nome: loja, emitente_cnpj: cnpj, valor_total: total, data_emissao: quando(d),
      situacao: "autorizada", manifestacao: "ciencia", fornecedor_id: fornecedor, conta_pagar_id: null, estoque_lancado: false, processamento: "concluido", processamento_msg: null,
      unidade_id: U_SC, created_at: quando(d), marcadores: [],
      xml: `<nfeProc><NFe><infNFe><ide><indIntermed>1</indIntermed></ide><total><ICMSTot><vNF>${total.toFixed(2)}</vNF></ICMSTot></total><infIntermed><CNPJ>${intermed}</CNPJ><idCadIntTran>${usuario}</idCadIntTran></infIntermed><infAdic><infCpl>${infCpl}</infCpl></infAdic></infNFe></NFe></nfeProc>`,
    });
    db.nfe_recebida_itens = [...(db.nfe_recebida_itens ?? []), ...itens.map(([descricao, quantidade, valor_unitario], i) => ({ nfe_id: id, numero: i + 1, descricao, quantidade, valor_unitario, valor_total: r2(quantidade * valor_unitario) }))];
  };
  notaMkt("nmk1", 4410, -20, "Loja Exemplo Peças Online Ltda", "45111222000190", "03007331000141", "LOJAEXEMPLOPECAS", [["Rolamento 6202 2RS", 4, 18.9], ["Retentor 25x40x7", 6, 24.31]], "PEDIDO 2000008011112222", "fmk1");
  notaMkt("nmk2", 1287, -35, "Eletro Componentes Exemplo Ltda", "38222333000171", "03007331000141", "ELETROCOMPEXEMPLO", [["Contatora 220V 25A", 2, 345.27]]);
  notaMkt("nmk3", 4388, -50, "Loja Exemplo Peças Online Ltda", "45111222000190", "03007331000141", "LOJAEXEMPLOPECAS", [["Correia em V A-32", 2, 29.5]], "", "fmk1");
  notaMkt("nmk4", 77, -15, "Utilidades Exemplo Comércio Ltda", "29333444000152", "99888777000166", "utilidades.exemplo", [["Organizador de bancada com 12 gavetas", 1, 98.75]], "Venda pelo TikTok Shop");
  db.fornecedores.push({ id: "fmk1", nome: "Loja Exemplo Peças Online Ltda", cnpj: "45111222000190", municipio: "Joinville", uf: "SC", created_at: quando(-60) });
  add("cb3", dias(-21), -221.45, "Pix PIX Marketplace · Enviado");
  add("cb3", dias(-36), -690.54, "MERCADOLIVRE*ELETROCOMP · cartao");
  add("cb3", dias(-16), -98.75, "Pix BYTEDANCE BRASIL TECNOLOGIA LTDA · Enviado");
  add("cb3", dias(-8), -134.9, "MERCADOLIVRE*LOJAEXEMPLO · cartao");
  add("cb3", dias(-7), -64, "MP *RESTAURANTEEXEMPLO · cartao");
  // montagem dos quiosques (Gastos separados → Quiosques): notas com o marcador "Quiosques" e os pagamentos dessas lojas
  notaMkt("nq1", 9021, -44, "Madeiras Exemplo Comércio de Chapas Ltda", "31444555000109", "", "", [["MDF BRANCO TX 2F 15MM 2750X1840", 6, 289.9], ["FITA BRANCO TX 22MM 50MT", 4, 38.5], ["DOBRADIÇA CURVA AMORT CALÇO FIX", 12, 9.8], ["PARAFUSO PHILLIPS 4,0X40 CX 500", 2, 41]]);
  notaMkt("nq2", 3310, -30, "Tintas Exemplo Ltda", "32555666000177", "", "", [["TINTA PU PRETO FOSCO 3,6L", 2, 412], ["PRIMER PU CINZA 3,6L", 1, 265], ["ENDURECEDOR 066 0,834ML", 3, 58.9], ["LIXA SECO 220", 20, 2.4]]);
  for (const id of ["nq1", "nq2"]) { const n = db.nfe_recebidas.find((x: Row) => x.id === id); if (n) { n.marcadores = ["mk9"]; n.xml = null; } }
  add("cb1", dias(-43), -2093, "PIX MADEIRAS EXEMPLO COMERCIO DE CHAPAS · Enviado");
  add("cb3", dias(-29), -1313.7, "TINTAS EXEMPLO · cartao");
  // Sobre o ERP Line → Handoff, Ideias e Esquemas (exemplos inventados; no sistema real: public.projeto_itens e public.cadeias_causa)
  const item = (x: Row) => ({ detalhe: null, area: "geral", responsavel: null, prioridade: "media", esforco: null, situacao: "aberta", prazo: null, motivo: null,
    votos: [], criado_por: null, criado_nome: "Claude", concluido_em: null, atualizado_em: quando(-1), created_at: quando(-2), ...x });
  db.projeto_itens = [
    item({ id: "pj1", tipo: "pendencia", titulo: "Autorizar a publicação da nova tela de Vendas", detalhe: "Responder \"pode publicar\".", area: "vendas", responsavel: "empresa", prioridade: "alta" }),
    item({ id: "pj2", tipo: "pendencia", titulo: "Baixar do Tiny os XML das notas que faltam", detalhe: "Tiny → Notas → baixar XML; no ERP: Importar dados → NF-e emitidas.", area: "notas", responsavel: "empresa", prioridade: "alta", prazo: dias(-2) }),
    item({ id: "pj3", tipo: "pendencia", titulo: "Conferir os prazos do calendário de obrigações", area: "notas", responsavel: "contador", situacao: "aguardando", motivo: "resposta do contador" }),
    item({ id: "pj4", tipo: "pendencia", titulo: "Relatório de giro do estoque", area: "producao", responsavel: "claude", situacao: "andamento" }),
    item({ id: "pj5", tipo: "pendencia", titulo: "Filtros com período em todas as listas", area: "geral", responsavel: "claude", prioridade: "baixa" }),
    item({ id: "pj6", tipo: "pendencia", titulo: "Cadastrar as embalagens novas", area: "logistica", responsavel: "empresa", situacao: "feita", concluido_em: quando(-1) }),
    item({ id: "pj7", tipo: "decisao", titulo: "Venda não é NF: totais e contas usam o valor da venda", area: "financeiro", situacao: "feita", concluido_em: quando(-5) }),
    item({ id: "pj8", tipo: "decisao", titulo: "Nada é apagado: cancelar ou descartar com motivo", situacao: "feita", concluido_em: quando(-5) }),
    item({ id: "pj9", tipo: "ideia", titulo: "Avisar o cliente quando a máquina sair do conserto", area: "posvenda", prioridade: "alta", esforco: "pequeno", votos: ["u-admin", "u2"] }),
    item({ id: "pj10", tipo: "ideia", titulo: "App para técnicos: fotos e assinatura na OS", area: "posvenda", prioridade: "alta", esforco: "grande", votos: ["u2"] }),
    item({ id: "pj11", tipo: "ideia", titulo: "Previsão de compras pela produção planejada", area: "producao", situacao: "avaliando" }),
    item({ id: "pj12", tipo: "ideia", titulo: "Etiqueta de envio direto do pedido", area: "logistica", situacao: "planejada", esforco: "medio" }),
  ];
  db.cadeias_causa = [
    { id: "cc1", titulo: "Vendas antigas aparecem como \"Sem conta\"", efeito: "Na lista de Vendas, as vendas importadas aparecem como \"Sem conta\"", area: "vendas",
      elos: [
        { texto: "Os pedidos antigos entraram pela planilha de pedidos", tipo: "fato", evidencia: "Importar dados → histórico; os pedidos têm origem de importação", ligacao: "comprovada" },
        { texto: "A planilha não traz as contas a receber", tipo: "fato", evidencia: "Os pedidos importados não têm campo de pagamento", ligacao: "comprovada" },
        { texto: "A maioria dessas vendas já foi recebida", tipo: "hipotese", evidencia: null, ligacao: "correlacao" },
      ], conclusao: "O \"Sem conta\" vem da importação. Que já foram recebidas é hipótese: conferir no extrato.", situacao: "em_revisao", motivo: null,
      criado_por: null, criado_nome: "Claude", revisado_nome: null, revisado_em: null, atualizado_em: quando(-1), created_at: quando(-1) },
  ];
  // tela Entre contas, sócios e empresas ligadas (nomes e documentos inventados)
  db.partes_relacionadas = [
    { id: "pr1", nome: "Sócia Exemplo da Silva", tipo: "socio", documentos: ["12345678909"], nomes_extrato: [], observacao: null, ativo: true, created_at: quando(-30) },
    { id: "pr2", nome: "Gelados Exemplo Indústria", tipo: "empresa", documentos: ["11222333000181", "11222333000262"], nomes_extrato: ["GELADOS EXEMPLO"], observacao: null, ativo: true, created_at: quando(-30) },
  ];
  add("cb1", dias(-30), 5000, "Pix GELADOS EXEMPLO INDUSTRIA E COMERCIO LTDA · Recebido");
  add("cb3", dias(-12), -2000, "Pix GELADOS EXEMPLO INDUSTRIA E COMERCIO LTDA · Enviado");
  add("cb2", dias(-18), -1500, "Transferência enviada pelo Pix - SOCIA EXEMPLO DA SILVA - •••.456.789-•• - BANCO EXEMPLO");
  add("cb1", dias(-9), 3000, "Pix Sócia Exemplo da Silva · Recebido");
  add("cb1", dias(-6), -2500, "Pix MF MAQUINAS LTDA · Enviado");
  add("cb2", dias(-6), 2500, "Transferência recebida pelo Pix - MF MAQUINAS LTDA");
  // carteira dos licenciados My Frost (nomes inventados; no sistema real: public.licenciados_lojas e licenciados_pagamentos, só o dono lê)
  const lojaDemo = { cidade: "Cidade Exemplo", responsavel: null, documento: null, telefone: null, cliente_id: null, observacoes: null, email: null, email_institucional: null,
    contrato_assinado_em: null, contrato_vence_em: null, contrato_obs: null };
  db.licenciados_lojas = [
    { ...lojaDemo, id: "lj1", nome: "My Frost Centro Exemplo", uf: "SC", nomes_extrato: ["BELTRAN"], situacao: "ativa", inicio: dias(-200), valor_combinado: 40000, mensalidade: 1500, cor: "rosa", ordem: 0,
      modelo: "quiosque", endereco: "Rua Exemplo, 100 - Anexo ao Mercado Exemplo - Centro", cep: "88000000", responsavel: "Licenciado Exemplo", telefone: "(48) 90000-0000",
      email_institucional: "centro@exemplo.com.br", contrato: "assinado", contrato_assinado_em: dias(-210), contrato_vence_em: dias(1250) },
    { ...lojaDemo, id: "lj2", nome: "My Frost Praia Teste", cidade: "Praia Teste", uf: "SP", nomes_extrato: [], situacao: "implantacao", inicio: dias(-40), valor_combinado: 35000, mensalidade: null, cor: "turquesa", ordem: 1,
      modelo: "loja", endereco: null, cep: null, contrato: "negociando" },
    { ...lojaDemo, id: "lj3", nome: "My Frost Bairro Modelo", cidade: "Bairro Modelo", uf: "MG", nomes_extrato: [], situacao: "fechando", inicio: dias(-320), valor_combinado: null, mensalidade: null, cor: "laranja", ordem: 2,
      modelo: "loja_cafeteria", endereco: "Avenida Teste, 200 - Loja 5", cep: null, contrato: "sem", observacoes: "Vai fechar: combinar a devolução das máquinas." },
  ];
  db.licenciados_maquinas = [
    { id: "lm1", loja_id: "lj1", descricao: "Máquina de sorvete soft 2 sabores", numero_serie: "EX-001", data_compra: dias(-205), valor: 18000, situacao: "na_loja", observacao: null },
    { id: "lm2", loja_id: "lj1", descricao: "Máquina de açaí", numero_serie: null, data_compra: dias(-205), valor: 9000, situacao: "manutencao", observacao: "Na assistência" },
    { id: "lm3", loja_id: "lj3", descricao: "Máquina de sorvete expresso", numero_serie: "EX-014", data_compra: dias(-330), valor: 21000, situacao: "na_loja", observacao: null },
  ];
  const custoDemo = { observacao: null, anulado: false };
  db.licenciados_custos = [
    { ...custoDemo, id: "lc1", loja_id: "lj1", data: dias(-206), categoria: "maquinas", descricao: "2 máquinas", valor: 27000 },
    { ...custoDemo, id: "lc2", loja_id: "lj1", data: dias(-204), categoria: "moveis", descricao: "Quiosque 3×5 m", valor: 12500 },
    { ...custoDemo, id: "lc3", loja_id: "lj1", data: dias(-202), categoria: "inauguracao", descricao: "Campanha de abertura", valor: 1800 },
    { ...custoDemo, id: "lc4", loja_id: "lj2", data: dias(-30), categoria: "montagem", descricao: "Viagem da equipe de montagem", valor: 2400 },
    { ...custoDemo, id: "lc5", loja_id: "lj2", data: dias(-28), categoria: "insumos", descricao: "Bases e caldas iniciais", valor: 3200, anulado: true },
  ];
  db.licenciados_arquivos = [];
  const pagDemo = { taxa: 0, observacao: null, descartado: false, anulado: false };
  db.licenciados_pagamentos = [
    { ...pagDemo, id: "lp1", loja_id: "lj1", data: dias(-150), valor: 20000, tipo: "licenca", forma: "pix", origem: "manual", origem_id: null, onde: "Conta pessoal", descricao: "Entrada da licença" },
    { ...pagDemo, id: "lp2", loja_id: "lj1", data: dias(-35), valor: 1500, tipo: "mensalidade", forma: "pix", origem: "pessoal", origem_id: "pl29", onde: "Conta pessoal", descricao: "PIX TRANSF BELTRAN13 09" },
    { ...pagDemo, id: "lp3", loja_id: "lj2", data: dias(-38), valor: 10000, tipo: "licenca", forma: "pix", origem: "manual", origem_id: null, onde: "Conta pessoal", descricao: "Sinal da licença" },
  ];
  const lancDemo = { conta_id: "pc1", categoria: "Transferências", situacao: "realizado", anulado: false };
  db.pessoal_lancamentos.push(
    { ...lancDemo, id: "pl29", data: dias(-35), descricao: "PIX TRANSF BELTRAN13 09", valor: 1500 },
    { ...lancDemo, id: "pl30", data: dias(-7), descricao: "PIX TRANSF BELTRAN11 10", valor: 10000 },
    { ...lancDemo, id: "pl31", data: dias(-16), descricao: "Transferência recebida pelo Pix - SORVETERIA TESTE LTDA - 11.444.777/0001-61 - BANCO EXEMPLO (0001) Agência: 1", valor: 5000 },
    { ...lancDemo, id: "pl32", data: dias(-20), descricao: "DESBLO PIX RECEBIDO 28/09", valor: 5000 },
  );
  db.contas_receber.push({ id: "rlic1", descricao: "Licenciamento My Frost Sorveterias — recebido pela InfinitePay SP por conta de terceiros · InfiniteTap (ABC123)",
    cliente_id: null, pedido_id: null, parcela: 1, total_parcelas: 1, valor: 20000, vencimento: dias(-25), status: "pago", forma_pagamento: "cartao", data_pagamento: dias(-24),
    valor_pago: 20000, conta_bancaria_id: "cb5", categoria: "recebido por conta de terceiros", unidade_id: U_SP, created_at: quando(-24) });
  db.extrato_lancamentos.push({ id: "xlic1", conta_bancaria_id: "cb5", importacao_id: null, data: dias(-24), valor: 17788, descricao: "Vendas · Depósito InfinitePay", documento: null,
    identificador: "xlic1", status: "conciliado", conta_receber_id: "rlic1", conta_pagar_id: null, baixou_conta: true, par_transferencia_id: null,
    observacao: "Recebido por conta de terceiros (licenciamento My Frost Sorveterias): venda InfinitePay R$ 20.000,00 − taxa R$ 2.212,00", conciliado_em: quando(-24), created_at: quando(-24) });
  // tela Impostos, tarifas e funcionários (nomes inventados; "Rafael Souza Lima" e "Diego Martins" estão no cadastro de funcionários)
  add("cb1", dias(-20), -1843.27, "Pix SECRETARIA DE ESTADO DA FAZENDA · Enviado");
  add("cb1", dias(-25), -2310.5, "DARF - RECEITA FEDERAL · Pagamento efetuado");
  add("cb2", dias(-33), -96.4, "Transferência enviada por boleto - PREFEITURA MUNICIPAL DE EXEMPLO");
  add("cb3", dias(-44), -388.74, "DEPARTAMENTO ESTADUAL DE TRANSITO · Pagamento efetuado");
  add("cb2", dias(-11), -2, "OLIST SERVICOS DIGITAIS LTDA · Tarifa lembretes de pagamento - ref. 101");
  add("cb2", dias(-10), -0.5, "OLIST SERVICOS DIGITAIS LTDA · Tarifa Pix recebido - ref. 102");
  add("cb2", dias(-4), -0.5, "OLIST SERVICOS DIGITAIS LTDA · Tarifa Pix recebido - ref. 103");
  add("cb1", dias(-15), -3400, "Pix RAFAEL SOUZA LIMA · Enviado");
  add("cb1", dias(-45), -3400, "Pix RAFAEL SOUZA LIMA · Enviado");
  add("cb2", dias(-14), -150, "DIEGO MARTINS · Transferência enviada pelo Pix");
  // fatura da transportadora paga por boleto (conferência dos CT-e) e a oficina dos veículos (não é posto)
  add("cb1", dias(-24), -412.6, "Transferência enviada por Boleto - EXPRESSO SAO MIGUEL S A - ***283070001** - Ref. CP-501");
  add("cb1", dias(-70), -356.1, "Transferência enviada por Boleto - EXPRESSO SAO MIGUEL S A - ***283070001** - Ref. CP-388");
  add("cb1", dias(-12), -614.17, "Transferência enviada por Boleto - OFICINA EXEMPLO DIESEL LTDA - ***000000001** - Ref. CP-90");
  // compras repetidas no cartão da maquininha: a conciliação "Por favorecido" junta e lança de uma vez
  for (const [d, v] of [[-3, -38.5], [-10, -42], [-17, -35.9], [-24, -40.2], [-31, -37]] as const) add("cb3", dias(d), v, `PADARIA PAO EXEMPLO ${d === -17 ? "02" : "01"} · mfmaquinas`);
  for (const [d, v] of [[-8, -64.9], [-38, -64.9]] as const) add("cb2", dias(d), v, "Transferência enviada por Boleto - INTERNET EXEMPLO TELECOM LTDA - 12345678000199 - Ref. CP-77");
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
/** Scrum das equipes (exemplos inventados; no sistema real: scrum_times, scrum_sprints, scrum_itens e scrum_daily) */
// Renegociação de exemplo: duas contas do fornecedor trocadas por um acordo em 3 parcelas (1 paga), com o histórico
function renegociacaoDemo(db: Db) {
  const neg = "neg1";
  const base = { fornecedor_id: "f2", categoria: "fornecedores", unidade_id: U_SC, rateio: [], negociacao_id: neg };
  db.contas_pagar.push(
    { id: "cpn1", ...base, descricao: "NF 9012 - Inox Paulista (tampas)", documento: "NF 9012", valor: 1850, vencimento: dias(-40), status: "cancelado", negociacao_papel: "original", revisao: "historico", created_at: quando(-60) },
    { id: "cpn2", ...base, descricao: "NF 9077 - Inox Paulista (eixos)", documento: "NF 9077", valor: 1320, vencimento: dias(-25), status: "cancelado", negociacao_papel: "original", revisao: "historico", created_at: quando(-45) },
    { id: "cpn3", ...base, descricao: "Acordo Inox Paulista · parcela 1/3", valor: 1000, vencimento: dias(-10), status: "pago", data_pagamento: dias(-10), valor_pago: 1000, negociacao_papel: "acordo", revisao: "aprovado", created_at: quando(-20) },
    { id: "cpn4", ...base, descricao: "Acordo Inox Paulista · parcela 2/3", valor: 1000, vencimento: dias(20), status: "aberto", decisao: "agendado", pagar_em: dias(20), negociacao_papel: "acordo", revisao: "aprovado", created_at: quando(-20) },
    { id: "cpn5", ...base, descricao: "Acordo Inox Paulista · parcela 3/3", valor: 1000, vencimento: dias(50), status: "aberto", negociacao_papel: "acordo", revisao: "aprovado", created_at: quando(-20) },
  );
  db.pagar_negociacoes = [
    { id: neg, titulo: "Acordo Inox Paulista", fornecedor_id: "f2", unidade_id: U_SC, valor_original: 3170, valor_acordo: 3000, parcelas: 3, situacao: "acordo",
      observacoes: "Tiraram os juros e R$ 170 de desconto para pagar em 3 vezes.", criado_nome: "Rafael Financeiro", created_at: quando(-20), atualizado_em: quando(-20) },
  ];
  db.pagar_negociacao_eventos = [
    { id: "ne1", negociacao_id: neg, tipo: "nota", quando: dias(-24), texto: "Liguei para o financeiro do fornecedor: aceitam parcelar sem juros se a 1ª for paga em 10 dias.", arquivo_caminho: null, arquivo_nome: null, arquivo_tipo: null, criado_por: "u-fin", criado_nome: "Rafael Financeiro", created_at: quando(-24) },
    { id: "ne2", negociacao_id: neg, tipo: "print", quando: dias(-21), texto: "Proposta enviada pelo WhatsApp", arquivo_caminho: "conta_pagar/negociacao-neg1/print.jpg", arquivo_nome: "print-whatsapp.jpg", arquivo_tipo: "image/jpeg", criado_por: "u-fin", criado_nome: "Rafael Financeiro", created_at: quando(-21) },
    { id: "ne3", negociacao_id: neg, tipo: "acordo", quando: dias(-20), texto: "2 contas (R$ 3.170,00) trocada(s) por 3 parcelas de R$ 1.000,00.", arquivo_caminho: null, arquivo_nome: null, arquivo_tipo: null, criado_por: "u-fin", criado_nome: "Rafael Financeiro", created_at: quando(-20) },
  ];
}

function scrumDemo(db: Db) {
  const segunda = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const desloca = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
  const inicio = desloca(segunda, -7);
  db.scrum_times = [
    { id: "st1", nome: "ERP Line", cor: "#6366f1", descricao: "Melhorias do sistema; as Ideias do Sobre o ERP Line viram itens do backlog.", sprint_dias: 7, membros: ["u-admin", "u-fin"], dono_produto: "u-admin", scrum_master: "u-fin", ordem: 1, ativo: true },
    { id: "st2", nome: "Produção", cor: "#f97316", descricao: "Fábrica, montagem das máquinas, compras de peças e estoque.", sprint_dias: 14, membros: ["u-tec"], dono_produto: null, scrum_master: null, ordem: 2, ativo: true },
    { id: "st3", nome: "Assistência", cor: "#14b8a6", descricao: "Ordens de serviço, garantias, preventivas e técnicos parceiros.", sprint_dias: 14, membros: ["u-tec"], dono_produto: null, scrum_master: null, ordem: 3, ativo: true },
    { id: "st4", nome: "Vendas", cor: "#10b981", descricao: "Vendas de peças e máquinas, propostas, marketplaces e metas.", sprint_dias: 14, membros: ["u-vendas", "u-mkt"], dono_produto: null, scrum_master: null, ordem: 4, ativo: true },
    { id: "st5", nome: "Financeiro", cor: "#f59e0b", descricao: "Contas, conciliação, cobrança, fechamento com o contador e fiscal.", sprint_dias: 14, membros: ["u-fin"], dono_produto: null, scrum_master: null, ordem: 5, ativo: true },
  ];
  const sprint = (x: Row) => ({ objetivo: null, pontos_planejados: null, pontos_feitos: null, revisao: null, retro_bom: null, retro_melhorar: null, retro_acoes: null, encerrada_em: null, created_at: quando(-30), ...x });
  db.scrum_sprints = [
    sprint({ id: "ss1", time_id: "st1", numero: 1, inicio: desloca(inicio, -21), fim: desloca(inicio, -15), status: "encerrada", pontos_planejados: 18, pontos_feitos: 13, revisao: "• Filtro por período nas notas\n• Aviso de vencimento das chaves", retro_bom: "Entregas pequenas todo dia", retro_melhorar: "Itens grandes demais", retro_acoes: "Dividir tudo acima de 8 pontos" }),
    sprint({ id: "ss2", time_id: "st1", numero: 2, inicio: desloca(inicio, -14), fim: desloca(inicio, -8), status: "encerrada", pontos_planejados: 16, pontos_feitos: 15 }),
    sprint({ id: "ss3", time_id: "st1", numero: 3, inicio: desloca(inicio, -7), fim: desloca(inicio, -1), status: "encerrada", pontos_planejados: 20, pontos_feitos: 17 }),
    sprint({ id: "ss4", time_id: "st1", numero: 4, objetivo: "Técnicos registram a OS inteira pelo celular", inicio: segunda, fim: desloca(segunda, 6), status: "ativa", pontos_planejados: 21 }),
    sprint({ id: "ss5", time_id: "st4", numero: 1, objetivo: "Propostas respondidas em até 24 h", inicio: desloca(segunda, -7), fim: desloca(segunda, 6), status: "ativa", pontos_planejados: 13 }),
  ];
  const feito = (dias: number) => new Date(new Date(`${segunda}T15:00:00Z`).getTime() + dias * 864e5).toISOString();
  const it = (x: Row) => ({ tipo: "historia", descricao: null, criterio_aceite: null, tarefas: [], cenarios: null, testes: [], pontos: 3, prioridade: 10, status: "a_fazer", responsavel_id: null, ideia_id: null, created_by: "u-admin", concluido_em: null, created_at: quando(-10), ...x });
  db.scrum_itens = [
    it({ id: "si1", time_id: "st1", sprint_id: "ss4", titulo: "Fotos da máquina na OS pelo celular", pontos: 5, status: "feito", responsavel_id: "u-fin", concluido_em: feito(0), criterio_aceite: "A foto aparece na OS e no PDF" }),
    it({ id: "si2", time_id: "st1", sprint_id: "ss4", titulo: "Assinatura do cliente na tela", pontos: 5, status: "revisao", responsavel_id: "u-admin" }),
    it({ id: "si3", time_id: "st1", sprint_id: "ss4", titulo: "Checklist da preventiva", tipo: "tarefa", pontos: 3, status: "fazendo", responsavel_id: "u-fin",
      tarefas: [{ texto: "Pegar o modelo do checklist com a fábrica", feito: true }, { texto: "Montar os itens na OS", feito: true }, { texto: "Testar no celular", feito: false }] }),
    it({ id: "si4", time_id: "st1", sprint_id: "ss4", titulo: "OS abre sem internet e envia depois", pontos: 8, status: "a_fazer" }),
    it({ id: "si5", time_id: "st1", sprint_id: "ss4", titulo: "Erro ao anexar foto grande no iPhone", tipo: "bug", pontos: 0, status: "feito", responsavel_id: "u-fin", concluido_em: feito(1) }),
    it({ id: "si6", time_id: "st1", sprint_id: null, titulo: "Avisar o cliente quando a máquina sair do conserto", tipo: "melhoria", pontos: 2, prioridade: 10, ideia_id: "pj9" }),
    it({ id: "si7", time_id: "st1", sprint_id: null, titulo: "Relatório de giro do estoque", pontos: 5, prioridade: 20 }),
    it({ id: "si8", time_id: "st1", sprint_id: null, titulo: "Importar extrato do Mercado Pago", tipo: "tarefa", pontos: null, prioridade: 30 }),
    it({ id: "si9", time_id: "st4", sprint_id: "ss5", titulo: "Modelo de proposta para açaí", pontos: 5, status: "feito", responsavel_id: "u-vendas", concluido_em: feito(-4) }),
    it({ id: "si10", time_id: "st4", sprint_id: "ss5", titulo: "Ligar para propostas paradas há 7 dias", tipo: "tarefa", pontos: 3, status: "fazendo", responsavel_id: "u-vendas" }),
    it({ id: "si11", time_id: "st4", sprint_id: "ss5", titulo: "Fotos novas dos anúncios", pontos: 5, status: "a_fazer", responsavel_id: "u-mkt" }),
  ];
  for (const [sp, n] of [["ss1", 5], ["ss2", 4], ["ss3", 5]] as const) {
    for (let k = 0; k < n; k++) db.scrum_itens.push(it({ id: `${sp}-${k}`, time_id: "st1", sprint_id: sp, titulo: `Entrega ${k + 1} da sprint`, pontos: 3, status: "feito", concluido_em: quando(-20) }));
  }
  db.scrum_comentarios = [
    { id: "sc1", item_id: "si2", user_id: "u-admin", texto: "Vamos usar a assinatura com o dedo na própria tela. Falta o texto do termo de entrega.", created_at: quando(-3) },
    { id: "sc2", item_id: "si2", user_id: "u-fin", texto: "Precisa guardar a assinatura no PDF da OS também?", created_at: quando(-2) },
    { id: "sc3", item_id: "si2", user_id: "u-admin", texto: "Sim, combinado: vai no PDF. Vou testar no iPhone amanhã.", created_at: quando(-1) },
    { id: "sc4", item_id: "si2", user_id: "u-fin", texto: "E se o cliente não estiver na hora, quem assina?", created_at: quando(0) },
  ];
  db.scrum_daily = [
    { id: "sd1", sprint_id: "ss4", user_id: "u-fin", nome: "Rafael Financeiro", dia: hojeISO(), fiz: "Fotos na OS e o erro do iPhone", vou_fazer: "Checklist da preventiva", impedimentos: "Falta o modelo do checklist da fábrica", impedimento_resolvido: false, created_at: quando(0) },
  ];
}

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
  // equipe (cadastro de funcionários): técnicos aparecem na OS; uma pessoa em experiência e uma aniversariante do mês
  const mesAtual = hojeISO().slice(5, 7);
  db.funcionarios = [
    { id: "fu1", nome: "Carla Mendes", apelido: "Carla", cargo: "Vendedora", setor: "Vendas", unidade_id: U_SC, vinculo: "clt", situacao: "ativo",
      data_admissao: "2022-03-14", salario: 2800, dia_pagamento: 5, whatsapp: "48999990001", email: "vendas@mfmaquinas.com.br", cpf: "52998224725",
      data_nascimento: `1990-${mesAtual}-21`, faz_assistencia: false, user_id: "u-vendas", vendedor_id: "v1", ativo: true, created_at: quando(-900) },
    { id: "fu2", nome: "Rafael Souza Lima", apelido: "Rafa", cargo: "Técnico de campo", setor: "Assistência técnica", unidade_id: U_SC, vinculo: "clt", situacao: "ativo",
      data_admissao: "2020-08-03", salario: 3400, dia_pagamento: 5, whatsapp: "48999990004", cnh: "01234567890", cnh_categoria: "B", cnh_validade: "2028-05-10",
      data_nascimento: "1988-02-11", faz_assistencia: true, user_id: "u-tec", ativo: true, created_at: quando(-1500) },
    { id: "fu3", nome: "Diego Martins", cargo: "Montador", setor: "Produção", unidade_id: U_SC, vinculo: "experiencia", situacao: "ativo",
      data_admissao: dias(-80), salario: 2300, dia_pagamento: 5, whatsapp: "48999990010", data_nascimento: "1999-07-30", faz_assistencia: false, ativo: true, created_at: quando(-80) },
    { id: "fu4", nome: "Paula Ribeiro", cargo: "Técnica de bancada", setor: "Assistência técnica", unidade_id: U_SP, vinculo: "clt", situacao: "ferias",
      data_admissao: "2023-01-09", salario: 3100, dia_pagamento: 5, whatsapp: "11999990020", data_nascimento: "1993-11-02", faz_assistencia: true, ativo: true, created_at: quando(-600) },
    { id: "fu5", nome: "Fabiano Costa", cargo: "Financeiro", setor: "Financeiro e administrativo", unidade_id: U_SC, vinculo: "pj", situacao: "ativo",
      data_admissao: "2021-06-01", salario: 4500, dia_pagamento: 10, pix: "fabiano@exemplo.com", user_id: "u-fin", faz_assistencia: false, ativo: true, created_at: quando(-1200) },
    { id: "fu6", nome: "João Pedro Alves", cargo: "Auxiliar de expedição", setor: "Expedição e logística", unidade_id: U_SC, vinculo: "clt", situacao: "desligado",
      data_admissao: "2024-02-05", data_desligamento: "2025-12-19", motivo_desligamento: "Pedido de demissão", salario: 1900, faz_assistencia: false, ativo: true, created_at: quando(-500) },
  ];
  // % por categoria: máquina paga menos, peças pagam mais; a Carla tem um % próprio em vedantes
  db.comissao_regras = [
    { id: "cr1", categoria: "As Máquinas My Frost", vendedor_id: null, percentual: 2, ativo: true, created_at: quando(-30) },
    { id: "cr2", categoria: "Peças de Reposição", vendedor_id: null, percentual: 6, ativo: true, created_at: quando(-30) },
    { id: "cr3", categoria: "Vedantes/ Orings My Frost", vendedor_id: "v1", percentual: 8, ativo: true, created_at: quando(-10) },
  ];
  // tabelas de preço: marketplace mais caro (taxas), revenda com desconto; o cliente Açaí & Cia é revendedor
  db.tabelas_preco = [
    { id: "tp1", nome: "Marketplace", canal: "marketplace", ajuste_percentual: 20, arredondamento: "final90", observacoes: "Cobre a taxa do marketplace e o frete grátis", ativo: true, created_at: quando(-40) },
    { id: "tp2", nome: "Revenda", canal: "revenda", ajuste_percentual: -15, arredondamento: "centavos", observacoes: "Pedido mínimo R$ 1.000", ativo: true, created_at: quando(-40) },
  ];
  db.tabela_preco_itens = [{ id: "tpi1", tabela_id: "tp2", produto_id: "p5", preco: 72, created_at: quando(-20) }];
  // linhas de produtos (como no Tiny): máquinas da franquia com 2% fixo; peças conforme o desconto; acessórios só agrupam
  db.linhas_produto = [
    { id: "lp1", nome: "Máquinas Franquia", comissao_tipo: "fixa", comissao_percentual: 2, comissao_faixas: [], ativo: true, marcadores: [], created_at: quando(-30) },
    { id: "lp2", nome: "Peças e reposição", comissao_tipo: "desconto", comissao_percentual: 0, ativo: true, marcadores: [], created_at: quando(-30),
      comissao_faixas: [{ desconto_ate: 0, percentual: 6 }, { desconto_ate: 5, percentual: 4 }, { desconto_ate: 10, percentual: 2 }] },
    { id: "lp3", nome: "Acessórios", comissao_tipo: "herda", comissao_percentual: 0, comissao_faixas: [], ativo: true, marcadores: [], created_at: quando(-30) },
  ];
  db.produtos.forEach((p) => { p.linha_id ??= ["p1", "p2"].includes(p.id) ? "lp1" : ["p4", "p5", "p6", "p7", "p8"].includes(p.id) ? "lp2" : p.id === "p9" ? "lp3" : null; });
  const revendedor = db.clientes.find((c) => c.id === "c2");
  if (revendedor) revendedor.tabela_preco_id = "tp2";
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
  db.produtos.push({ id: "pk2", sku: "KIT-REV-6", descricao: "Kit revisão completa 6 sabores (2 kits de 3 + vedação extra)", tipo: "peca", kit: true, unidade: "UN", ncm: "84189900", origem: 0,
    preco_custo: 0, preco_venda: 1490, estoque_atual: 0, estoque_minimo: 0, ativo: true, vendavel: true, created_at: quando(-30) });
  db.kit_componentes = [
    { id: "kc1", kit_id: "pk1", componente_id: "p7", quantidade: 3, opcional: false, grupo: null, padrao: true },
    { id: "kc2", kit_id: "pk1", componente_id: "p5", quantidade: 1, opcional: false, grupo: null, padrao: true },
    { id: "kc3", kit_id: "pk1", componente_id: "p10", quantidade: 1, opcional: true, grupo: null, padrao: true },
    // kit dentro de kit: sai pelas peças do kit de dentro
    { id: "kc4", kit_id: "pk2", componente_id: "pk1", quantidade: 2, opcional: false, grupo: null, padrao: true },
    { id: "kc5", kit_id: "pk2", componente_id: "p5", quantidade: 1, opcional: false, grupo: null, padrao: true },
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
  // Separação e embalagem: dois pedidos faturados esperando separação e um em conferência
  const novosExp: [string, number, string, [string, number, number][], "separar" | "separando", number][] = [
    ["pd6", 106, "c2", [["p4", 2, 790], ["p7", 4, 140], ["p9", 1, 189]], "separar", -1.2],
    ["pd7", 107, "c5", [["p6", 1, 1180], ["p10", 6, 49], ["p7", 2, 140]], "separar", -0.15],
    ["pd8", 108, "c3", [["p3", 1, 3690], ["p10", 2, 49]], "separando", -0.1],
  ];
  novosExp.forEach(([id, numero, cliente_id, itens, status, d], k) => {
    const unidade_id = pd1.unidade_id;
    // pd7: venda no cartão em 6x, para a conferência de risco antes de despachar
    db.pedidos.push({ id, numero, cliente_id, origem: k === 1 ? "loja" : "whatsapp", status: "faturado", vendedor: "Carla", forma_pagamento: id === "pd7" ? "cartao" : "pix", parcelas: id === "pd7" ? 6 : 1, intervalo_dias: 30,
      modalidade_frete: 0, desconto: 0, frete: 0, created_at: quando(d - 0.4), aprovado_em: quando(d - 0.3), estoque_baixado: true, unidade_id });
    itens.forEach(([produto_id, quantidade, valor_unitario], j) => db.pedido_itens.push({ id: `${id}-i${j}`, pedido_id: id, produto_id, descricao: db.produtos.find((x) => x.id === produto_id)!.descricao, quantidade, valor_unitario }));
    db.notas_fiscais.push({ id: `nf-${id}`, pedido_id: id, referencia: `pedido-${numero}-1`, status: "autorizada", numero: String(1290 + k), serie: "1", chave: `4226${String(numero).padStart(40, "0")}`,
      valor_total: itens.reduce((s, [, q, v]) => s + q * v, 0), mensagem: "Autorizado o uso da NF-e", ambiente: "producao", created_at: quando(d - 0.25), marcadores: [], unidade_id });
    db.expedicoes.push({ id: `ex-${id}`, pedido_id: id, unidade_id, status, itens_conferidos: [], volumes: null, peso_kg: null, transportadora_id: null, codigo_rastreio: null,
      responsavel: status === "separando" ? "Lucas Expedição" : null, separando_em: status === "separando" ? quando(d) : null, created_at: quando(d - 0.2) });
  });
  // Mercado Livre (demonstração): a conta conectada e vendas depois da venda (envio, NF-e e rastreio)
  db.ml_contas = [{ id: "mlc1", ml_user_id: 123456, apelido: "LOJA.DEMO", unidade_id: U_SP, status: "ativa", erro: null, token_expira_em: quando(0.2), conectado_em: quando(-20),
    sincronizado_em: quando(-0.01), ultimas_novas: 2, enviar_estoque: true, enviar_preco: false, emitir_nfe: true, created_at: quando(-20) }];
  const mlVenda = (id: string, n: number, d: number, extra: Row): Row => ({
    id, conta_id: "mlc1", ml_order_id: 2000010000000 + n, ml_pack_id: null, pedido_id: null, data_venda: quando(d), comprador: `COMPRADOR${n}`, total: 0, logistica: "cross_docking",
    situacao: "importada", pendencia: null, envio_status: null, envio_substatus: null, envio_modo: "me2", rastreio_ml: null, envio_atualizado_em: quando(d + 0.1),
    nota_enviada_em: null, nota_erro: null, nota_tentativas: 0, rastreio_enviado_em: null, rastreio_erro: null, rastreio_tentativas: 0, created_at: quando(d), ...extra });
  db.ml_pedidos = [
    mlVenda("mlp1", 1, -6, { pedido_id: "pd1", total: 389.8, envio_status: "delivered", rastreio_ml: "MEL4471200BR", nota_enviada_em: quando(-5.8), nota_ml_id: "fd-1" }),
    mlVenda("mlp2", 2, -1.2, { pedido_id: "pd6", total: 2349, envio_status: "ready_to_ship", envio_substatus: "invoice_pending" }),
    mlVenda("mlp3", 3, -0.1, { pedido_id: "pd8", total: 3788, envio_status: "handling", envio_modo: "custom", logistica: null }),
    mlVenda("mlp4", 4, -2, { pedido_id: "pd2", total: 1560, envio_status: "ready_to_ship", envio_modo: "me1", logistica: null, rastreio_erro: "O Mercado Livre recusou: shipment status invalid for update", rastreio_tentativas: 5 }),
    mlVenda("mlp5", 5, -0.05, { total: 179.9, situacao: "pendente", pendencia: "Produto do anúncio MLB123 sem ligação com o cadastro" }),
  ];
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
  Object.assign(db.configuracoes[0], { contador_nome: "Escritório Contábil Exemplo", contador_email: "financeiro@escritorio-exemplo.com.br", contador_envio_auto: true, contador_envio_dia: 5,
    contador_dados: { razao: "Escritório Contábil Exemplo Ltda", telefone: "(19) 3000-1000", site: "www.escritorio-exemplo.com.br", instagram: "escritorioexemplo", endereco: "Rua Exemplo, 100 - Centro - Campinas - SP" } });
  // CT-e da transportadora (no sistema real: public.ctes e cte_faturas, pela planilha do site dela; nomes inventados)
  {
    const MF = "46942855000132";
    const linha = (n: number, d: number, sentido: string, outro: string, outroCnpj: string, frete: "pago" | "a_pagar", valor: number, nf: number, prevAtraso = 0, fatura: string | null = null) => {
      const entrada = sentido === "entrada", transf = sentido === "transferencia";
      const rem = entrada ? [outroCnpj, outro] : [MF, "MF MAQUINAS LTDA"];
      const dest = entrada ? [MF, "MF MAQUINAS LTDA"] : transf ? ["46942855000213", "MF MAQUINAS LTDA"] : [outroCnpj, outro];
      const paga = (frete === "pago" && !entrada) || (frete === "a_pagar" && (entrada || transf));
      return { id: `cte${n}`, transportadora_id: "t7", transportadora_raiz: "00428307", numero: String(3100000 + n), tipo: "CT-e", emissao: dias(d),
        ag_origem: entrada ? "PORTO ALEGRE" : "PALHOCA", ag_destino: entrada ? "PALHOCA" : transf ? "AMERICANA" : "CURITIBA",
        remetente_cnpj: rem[0], remetente_nome: rem[1], destinatario_cnpj: dest[0], destinatario_nome: dest[1], nf_numero: String(20000 + n), nf_serie: "1", nf_valor: nf,
        frete, peso_tipo: "Peso", peso: 3 + (n % 7) * 4, volumes: 1 + (n % 3), valor, prev_entrega: dias(d + 1), ocorrencia: d + 1 + prevAtraso <= 0 ? "ENTREGUE" : "EM TRANSITO",
        ocorrencia_em: d + 1 + prevAtraso <= 0 ? `${dias(d + 1 + prevAtraso)}T11:20:00-03:00` : null, sentido, mf_paga: paga, unidade_id: transf ? U_SP : U_SC,
        nfe_recebida_id: entrada ? `nfe-${n}` : null, nota_fiscal_id: entrada ? null : `nf-${n}`, fatura_id: fatura, origem: "planilha", arquivo: "transportadora.csv" };
    };
    db.cte_faturas = [{ id: "fat1", transportadora_id: "t7", transportadora_raiz: "00428307", numero: "FT-55120", emissao: dias(-40), vencimento: dias(-25), valor: 412.6,
      situacao: "aberta", conta_pagar_id: null, unidade_id: U_SC, observacao: null, origem: "manual", criado_em: quando(-40) }];
    db.ctes = [
      linha(1, -62, "entrada", "COMPONENTES EXEMPLO LTDA", "11222333000144", "a_pagar", 88.36, 4054, 0, "fat1"),
      linha(2, -58, "entrada", "REDUTORES EXEMPLO LTDA", "22333444000155", "a_pagar", 189.6, 7833.19, 0, "fat1"),
      linha(3, -55, "saida", "SORVETERIA EXEMPLO LTDA", "33444555000166", "pago", 74.94, 1120, 1, "fat1"),
      linha(4, -50, "entrada", "DISTRIBUIDORA FRIO EXEMPLO", "44555666000177", "pago", 294, 20529.83),
      linha(5, -33, "entrada", "COMPONENTES EXEMPLO LTDA", "11222333000144", "a_pagar", 62.49, 300),
      linha(6, -30, "entrada", "REDUTORES EXEMPLO LTDA", "22333444000155", "a_pagar", 166.24, 5825.36),
      linha(7, -27, "saida", "GELATERIA EXEMPLO ME", "55666777000188", "pago", 68.86, 980),
      linha(8, -24, "transferencia", "", "", "a_pagar", 121.41, 100, 0),
      linha(9, -20, "entrada", "VEDACOES EXEMPLO LTDA", "66777888000199", "a_pagar", 70.23, 464, 3),
      linha(10, -15, "entrada", "COMPONENTES EXEMPLO LTDA", "11222333000144", "a_pagar", 139, 188, 6),
      linha(11, -12, "saida", "ACAITERIA EXEMPLO LTDA", "77888999000100", "pago", 131.23, 600),
      linha(12, -8, "entrada", "REDUTORES EXEMPLO LTDA", "22333444000155", "a_pagar", 553.23, 24703),
      linha(13, -5, "entrada", "METALURGICA EXEMPLO LTDA", "88999000000111", "a_pagar", 81.91, 1286.08),
      linha(14, -1, "saida", "SORVETERIA EXEMPLO LTDA", "33444555000166", "pago", 72.5, 420),
    ];
    // os que vieram sozinhos da SEFAZ (pela Focus): com a chave, quem paga (tomador) e, às vezes, a fatura no próprio CT-e
    const sefaz = (n: number, extra: Row) => Object.assign(linha(n, extra.d as number, extra.sentido as string, extra.outro as string, extra.cnpj as string,
      extra.frete as "pago" | "a_pagar", extra.valor as number, extra.nf as number), {
      chave: `4226100042830700011857001${String(3100000 + n).padStart(9, "0")}1${String(n).padStart(8, "0")}0`.slice(0, 44), origem: "sefaz", ag_origem: null, ag_destino: null,
      situacao: extra.situacao ?? "autorizado", tomador: extra.frete === "pago" ? "remetente" : "destinatario", emitente_nome: "TRANSPORTADORA EXEMPLO S/A",
      cobranca: extra.cobranca ?? null, sefaz_em: quando(extra.d as number), arquivo: null, ocorrencia: null, ocorrencia_em: null,
    });
    db.ctes.push(
      sefaz(15, { d: -4, sentido: "entrada", outro: "REDUTORES EXEMPLO LTDA", cnpj: "22333444000155", frete: "a_pagar", valor: 212.37, nf: 9850,
        cobranca: { fatura: "FT-60210", valor: 292.37, duplicatas: [{ numero: "1", vencimento: dias(12), valor: 292.37 }] } }),
      sefaz(16, { d: -3, sentido: "entrada", outro: "VEDACOES EXEMPLO LTDA", cnpj: "66777888000199", frete: "a_pagar", valor: 80, nf: 610,
        cobranca: { fatura: "FT-60210", valor: 292.37, duplicatas: [{ numero: "1", vencimento: dias(12), valor: 292.37 }] } }),
      sefaz(17, { d: -2, sentido: "saida", outro: "GELATERIA EXEMPLO ME", cnpj: "55666777000188", frete: "pago", valor: 95.1, nf: 1480, situacao: "cancelado" }),
    );
  }
  // contatos do escritório por setor (no sistema real: public.contabilidade_contatos; nomes só no banco)
  db.contabilidade_contatos = ([
    ["recepcao", "Ana Recepção", "atendimento", "(19) 9 1111-0001"], ["fiscal", "Bia Fiscal", "fiscal01", "(19) 9 1111-0002"], ["fiscal", "Caio Fiscal", "fiscal02", "(19) 3000-1002"],
    ["pessoal", "Duda Pessoal", "pessoal01", "(19) 9 1111-0003"], ["contabil", "Edu Contábil", "contabil01", "(19) 3000-1003"], ["societario", "Fábio Societário", "societario01", "(19) 9 1111-0004"],
    ["financeiro", "Gil Financeiro", "financeiro", "(19) 3000-1000"], ["certificado", "Hugo Certificado", "certificado", "(19) 9 1111-0005"], ["portador", "Ivo Portador", null, "(19) 9 1111-0006"],
  ] as const).map(([setor, nome, usuario, whatsapp], i) => ({ id: `cc${i + 1}`, setor, nome, email: usuario ? `${usuario}@escritorio-exemplo.com.br` : null, whatsapp, observacao: null, ordem: i, ativo: true }));
  db.emails.push({ id: "em-contab", conta_id: "ec1", uid: 98, de_nome: "Bia Fiscal", de_email: "fiscal01@escritorio-exemplo.com.br", para: "comercial@mfmaquinas.com.br",
    assunto: "Guias de ICMS e IPI do mês", data: quando(-0.8), previa: "Seguem as guias para pagamento até o dia 10.", texto: "Seguem as guias para pagamento até o dia 10.", html: null,
    anexos: [{ indice: 0, nome: "guia-icms.pdf", tipo: "application/pdf", tamanho: 52000, nfe: false }, { indice: 1, nome: "darf-ipi.pdf", tipo: "application/pdf", tamanho: 48000, nfe: false }],
    lido: false, arquivado: false, cliente_id: null, fornecedor_id: null, respondido_em: null });
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
/** Visão contas_pagar_origem (demonstração): de onde veio cada conta a pagar, a mesma regra do banco resumida. */
function origemPagarDemo(db: Db) {
  db.contas_pagar_origem = (db.contas_pagar ?? []).map((c) => {
    const nr = (db.nfe_recebidas ?? []).find((n) => (c.nfe_recebida_id ? n.id === c.nfe_recebida_id : n.conta_pagar_id === c.id));
    const fat = (db.cte_faturas ?? []).find((f) => f.conta_pagar_id === c.id);
    const env = (db.envios ?? []).find((e) => e.conta_pagar_id === c.id);
    const st = (db.nfse_importadas ?? []).find((n) => n.conta_pagar_id === c.id);
    const gn = (db.gnre_guias ?? []).find((g) => g.conta_pagar_id === c.id);
    const dv = (db.notas_fiscais ?? []).find((n) => n.conta_pagar_id === c.id);
    const oc = /^PC (\d+)/.exec(c.documento ?? "")?.[1] ?? /^Pedido de compra #(\d+)/.exec(c.descricao ?? "")?.[1] ?? null;
    const obs = String(c.observacoes ?? "");
    const origem = dv || nr?.finalidade === "devolucao" ? "dv" : nr ? "nf" : fat ? "cte" : env ? "frete" : st ? "st" : gn ? "gnre" : oc ? "oc" : c.recorrente_id ? "fixa"
      : obs.startsWith("Gerado pelo ERP a partir das comissões") ? "comissao" : obs.startsWith("Lançado a partir do extrato bancário") ? "extrato" : "outro";
    return {
      id: c.id, origem, nf_numero: nr?.chave ? String(Number(String(nr.chave).slice(25, 34))) : st?.numero ?? gn?.nf_numero ?? dv?.numero ?? null, oc_numero: oc,
      envio_numero: env?.numero != null ? String(env.numero) : null, fatura_numero: fat?.numero != null ? String(fat.numero) : null,
      emissao_efetiva: c.emissao ?? (String(nr?.data_emissao ?? st?.data_emissao ?? c.created_at ?? "").slice(0, 10) || null),
    };
  });
}

function recalcular(db: Db) {
  if (db.contas_pagar_origem) origemPagarDemo(db);
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
    pc.valor_total = totaisOc(db.pedido_compra_itens.filter((i) => i.pedido_compra_id === pc.id) as ItemOc[], pc).total;
  }
}

const db = seed();

/** Conferência de risco (demonstração): a mesma ideia do banco, com os sinais principais. */
function riscoDemo(pedidoId: string) {
  const p = db.pedidos.find((x) => x.id === pedidoId);
  if (!p) return null;
  if (p.forma_pagamento !== "cartao" || p.origem === "marketplace" || p.status === "cancelado") {
    return { elegivel: false, pontos: 0, nivel: "baixo", motivos: [], travar: false, ativo: true, limite: 25, conferencia: null };
  }
  const c = db.clientes.find((x) => x.id === p.cliente_id) ?? {};
  const motivos: { codigo: string; pontos: number; texto: string }[] = [];
  const add = (codigo: string, pontos: number, texto: string) => motivos.push({ codigo, pontos, texto });
  if (!db.contas_receber.some((r) => r.pedido_id === p.id && r.status === "pago")) add("pagamento", 40, "Pagamento por cartão ou link ainda sem baixa no ERP");
  if (!db.pedidos.some((o) => o.cliente_id === p.cliente_id && o.id !== p.id && o.created_at < p.created_at && !["cancelado", "orcamento"].includes(o.status))) add("cliente_novo", 25, "Primeira compra do cliente");
  const valor = Number(p.valor_total ?? db.pedido_itens.filter((i) => i.pedido_id === p.id).reduce((s, i) => s + i.quantidade * i.valor_unitario, 0));
  if (valor >= 3000) add("valor_alto", 20, "Valor a partir de R$ 3.000,00");
  if (![11, 14].includes(String(c.cpf_cnpj ?? "").replace(/\D/g, "").length)) add("sem_documento", 30, "Cliente sem CPF/CNPJ válido no cadastro");
  if (Number(p.parcelas) >= 6) add("parcelas", 10, `Cartão em ${p.parcelas}x`);
  const pontos = motivos.reduce((s, m) => s + m.pontos, 0);
  const conf = (db.conferencias_risco ?? []).find((x) => x.pedido_id === p.id);
  const travar = conf?.situacao === "recusada" || (pontos >= 25 && !(conf?.situacao === "aprovada" && Number(conf.valor_conferido) === valor));
  return {
    elegivel: true, pontos, nivel: pontos >= 50 ? "alto" : pontos >= 25 ? "medio" : "baixo", motivos, travar, ativo: true, limite: 25, meio: "cartao",
    conferencia: conf ? { situacao: conf.situacao, por: conf.decidido_por_nome, em: conf.decidido_em, observacao: conf.observacao, pontos: conf.pontos, valor: conf.valor_conferido, valor_mudou: Number(conf.valor_conferido) !== valor } : null,
  };
}
// Troca do Tiny (implantação): o mesmo plano do sistema real, com as duas primeiras etapas feitas
db.implantacao_etapas ??= ([
  [1, 1, "Cada pessoa entra no ERP pelo menos uma vez", "Vendas, assistência, contador e financeiro com o próprio usuário.", 3, "Administrador", "usuarios", true],
  [1, 2, "Apagar os dados de teste", "Vendas, notas e contas criadas só para testar saem do ERP antes do uso de verdade.", 3, "Administrador", null, true],
  [1, 3, "Treino rápido por área (30 minutos cada)", "Vendas, financeiro, fábrica e assistência: o caminho do dia a dia de cada um.", 9, "Administrador", null, false],
  [1, 4, "Contador valida as regras de imposto", "Uma nota de cada tipo: venda, remessa, devolução e transferência SC↔SP.", 10, "Contador", null, false],
  [1, 5, "Inventário do estoque (SC e SP)", "Contar as peças e insumos em Estoque → Contagem.", 10, "Fábrica", "estoque_contado", false],
  [1, 6, "Custo de todas as peças e insumos", "Sem custo não há margem certa nem custo das máquinas pela ficha técnica.", 10, "Financeiro", "custos", false],
  [1, 7, "NCM em todos os produtos", "Os insumos sem NCM travam a nota de remessa e de devolução.", 10, "Financeiro", "ncm", false],
  [1, 8, "Clientes com CPF/CNPJ, telefone e estado", "Necessário para a nota, a cobrança e o WhatsApp.", 14, "Vendas", "clientes", false],
  [1, 9, "Fornecedores com CNPJ", "Necessário para lançar a nota de compra e pagar com segurança.", 14, "Financeiro", "fornecedores", false],
  [2, 1, "Toda venda nasce no ERP", "Orçamento → pedido → aprovação no ERP; o Tiny fica só para consulta.", 15, "Vendas", "pedidos", false],
  [2, 2, "Notas fiscais só pelo ERP", "Nenhuma nota nova emitida no Tiny a partir desta data.", 15, "Financeiro", "notas_erp", false],
  [2, 3, "Contas a receber e cobrança pelo ERP", "As parcelas nascem da venda; a régua de cobrança avisa o cliente.", 15, "Financeiro", "contas", false],
  [2, 4, "Conferência diária do banco", "Extrato do banco conferido com as contas todo dia.", 20, "Financeiro", "extrato", false],
  [3, 1, "Compras e reposição pelo ERP", "Pedido de compra, cotação e recebimento com entrada no estoque.", 42, "Fábrica", null, false],
  [3, 2, "Produção com ordem de produção", "A OP baixa as peças da ficha técnica e coloca a máquina no estoque.", 42, "Fábrica", "producao", false],
  [3, 3, "Assistência com OS e nota de serviço", "Entrada, laudo, peças, entrega e NFS-e pelo ERP.", 49, "Assistência", "os", false],
  [4, 1, "Desligar o Tiny", "Baixar o histórico final do Tiny e cancelar a assinatura.", 57, "Administrador", null, false],
] as const).map(([fase, ordem, titulo, detalhe, dias, responsavel, indicador, feito]) => ({
  id: uid(), fase, ordem, titulo, detalhe, prazo: quando(dias).slice(0, 10), responsavel, indicador, observacao: null,
  feito_em: feito ? quando(-1) : null, feito_nome: feito ? "Admin Exemplo" : null, created_at: quando(-2),
}));
let numeroPedido = 108;
let numeroOS = 53;
let numeroNfe = 1301;
let numeroOP = 13;
let numeroPC = 32;

const TABELAS_COM_UNIDADE = ["pedidos", "ordens_servico", "contas_receber", "contas_pagar", "notas_fiscais", "nfe_recebidas", "ordens_producao", "pedidos_compra", "equipamentos"];
let numeroTransf = 2;

const proximoCodigo = (t: string) => Math.max(0, ...(db[t] ?? []).map((r) => Number(r.codigo) || 0)) + 1;

const DEFAULTS: Record<string, () => Row> = {
  scrum_comentarios: () => ({ user_id: sessao?.user.id ?? null, created_at: quando(0) }),
  pagar_negociacao_eventos: () => ({ criado_por: sessao?.user.id ?? null, quando: hojeISO(), created_at: quando(0) }),
  pagar_negociacoes: () => ({ situacao: "negociando", created_at: quando(0), atualizado_em: quando(0) }),
  licenciados_arquivos: () => ({ criado_em: new Date().toISOString() }),
  licenciados_custos: () => ({ anulado: false, created_at: quando(0) }),
  licenciados_maquinas: () => ({ situacao: "na_loja", created_at: quando(0) }),
  scrum_itens: () => ({ status: "a_fazer", tipo: "historia", tarefas: [], cenarios: null, testes: [], prioridade: 1000, sprint_id: null, ideia_id: null, responsavel_id: null, concluido_em: null, created_by: sessao?.user.id ?? null, created_at: quando(0) }),
  scrum_sprints: () => ({ status: "planejada", pontos_planejados: null, pontos_feitos: null, created_at: quando(0) }),
  scrum_daily: () => ({ user_id: sessao?.user.id ?? null, dia: hojeISO(), impedimento_resolvido: false, created_at: quando(0) }),
  etiquetas_envio: () => ({ impressoes: 0, editados: [], dados: {}, atualizado_em: new Date().toISOString() }),
  auditoria_checklist: () => ({ revisado_nome: db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? "Você", updated_at: new Date().toISOString() }),
  transferencias: () => ({ numero: ++numeroTransf, status: "rascunho", created_at: quando(0) }),
  pedidos: () => ({ numero: ++numeroPedido, status: "orcamento", estoque_baixado: false, created_at: quando(0) }),
  ordens_servico: () => ({ numero: ++numeroOS, status: "aberta", data_entrada: hojeISO(), estoque_baixado: false, created_at: quando(0) }),
  contas_receber: () => ({ status: "aberto", parcela: 1, total_parcelas: 1, created_at: quando(0), revisao: "em_revisao", lancamento: "manual", criado_por: sessao?.user.id ?? null }),
  contas_pagar: () => ({ status: "aberto", categoria: "fornecedores", created_at: quando(0), revisao: "em_revisao", lancamento: "manual", criado_por: sessao?.user.id ?? null }),
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
  clientes_pessoas: () => ({ ativo: true, created_at: quando(0) }),
  equipamentos: () => ({ created_at: quando(0) }),
  fornecimentos: () => ({ preferido: false, ativo: true, codigo_fornecedor: null, preco: null, preco_em: null, preco_origem: null, prazo_dias: null, ultima_compra_em: null, updated_at: new Date().toISOString() }),
  cotacoes: () => ({ numero: Math.max(0, ...(db.cotacoes ?? []).map((c) => Number(c.numero) || 0)) + 1, status: "rascunho", criado_por: sessao?.user.id ?? null }),
  cotacao_itens: () => ({ ordem: 0 }),
  cotacao_fornecedores: () => ({ token: uid(), status: "pendente", created_at: new Date().toISOString() }),
};

// Fornecedor preferido do produto (no banco: gatilho trg_fornecimento_preferido)
function preferidoDemo(f: Row) {
  for (const x of db.fornecimentos ?? []) if (x.produto_id === f.produto_id && x.id !== f.id) x.preferido = false;
  const p = db.produtos.find((x) => x.id === f.produto_id);
  if (p) p.fornecedor_padrao_id = f.fornecedor_id;
}

// Mesmo que fornecimento_registrar: o preço só troca se a informação for mais nova
function fornecimentoDemo(produto: string, fornecedor: string, preco: number | null, origem: string, prazo: number | null) {
  db.fornecimentos ??= [];
  const hoje = hojeISO();
  const f = db.fornecimentos.find((x) => x.produto_id === produto && x.fornecedor_id === fornecedor);
  if (!f) { db.fornecimentos.push({ id: uid(), produto_id: produto, fornecedor_id: fornecedor, ...DEFAULTS.fornecimentos(), preco, preco_em: preco != null ? hoje : null, preco_origem: preco != null ? origem : null, prazo_dias: prazo }); return; }
  if (preco != null && (!f.preco_em || hoje >= f.preco_em)) Object.assign(f, { preco, preco_em: hoje, preco_origem: origem });
  if (prazo != null) f.prazo_dias = prazo;
  f.updated_at = new Date().toISOString();
}

const nomeFornDemo = (id: string) => { const f = db.fornecedores.find((x) => x.id === id); return f?.nome_fantasia?.trim() || f?.nome || "fornecedor"; };

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
  const itensP = (db.pedido_itens ?? []).filter((i) => i.pedido_id === p.id);
  const pct = r2(percentualPedido((db.comissao_regras ?? []) as any, v as any, itensP as any, (id) => db.produtos.find((x) => x.id === id)?.categoria, p.comissao_percentual)?.pct ?? Number(v.percentual));
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
const FK_PAI: Record<string, string> = { clientes: "cliente_id", fornecedores: "fornecedor_id", contas_pagar: "conta_pagar_id", pedidos: "pedido_id", produtos: "produto_id", transferencias: "transferencia_id", unidades: "unidade_id", ordens_servico: "os_id", transportadoras: "transportadora_id" };
const FK_FILHO: Record<string, string> = { pedidos: "pedido_id", ordens_servico: "os_id", pedidos_compra: "pedido_compra_id", transferencias: "transferencia_id", contas_receber: "conta_receber_id", notas_fiscais: "nota_fiscal_id" };

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
    const rel = parte.match(/^(\w+):(\w+)(?:!\w+)?\((.*)\)$/s);
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
    // mesma regra do banco: explode a estrutura em todos os níveis (subconjunto com estoque próprio é consumido pronto)
    const fichas = db.produto_componentes as LinhaFicha[];
    const consumo = (o: Row) => consumoEstrutura(fichas, db.produtos as any, o.produto_id, Number(o.quantidade), (db.kit_componentes ?? []) as any);
    return db.ordens_producao.flatMap((op) => [...consumo(op)].map(([componente_id, necessario]) => {
      const p: Row = { ...db.produtos.find((x) => x.id === componente_id)!, estoque_atual: saldoUn(componente_id, op.unidade_id) };
      const reservado = abertas.filter((o) => o.id !== op.id && o.created_at < op.created_at && o.unidade_id === op.unidade_id)
        .reduce((s, o) => s + (consumo(o).get(componente_id) ?? 0), 0);
      const caminho = db.pedido_compra_itens.filter((i) => i.produto_id === componente_id
        && ["cotacao", "enviado", "parcial"].includes(db.pedidos_compra.find((pc) => pc.id === i.pedido_compra_id)?.status))
        .reduce((s, i) => s + i.quantidade - i.quantidade_recebida, 0)
        + abertas.filter((o) => o.produto_id === componente_id && o.unidade_id === op.unidade_id).reduce((s, o) => s + Number(o.quantidade), 0);
      return {
        ordem_id: op.id, componente_id, descricao: p.descricao, unidade: p.unidade, fornecedor_padrao_id: p.fornecedor_padrao_id ?? null,
        preco_custo: p.preco_custo, necessario, estoque_atual: p.estoque_atual, reservado_outras_op: reservado, a_caminho: caminho,
        subconjunto: !!p.subconjunto_estocado && temFicha(fichas, componente_id),
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
  "configuracoes", "unidades", "vendedores", "funcionarios", "comissoes", "contas_bancarias", "extrato_lancamentos", "auditoria_excecoes",
  "parcelamentos", "parcelamento_parcelas", "conciliacao_regras", "contabilidade_contatos", "cte_faturas"]);
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
  neq(c: string, v: any) { this.filtros.push((r) => r[c] !== v); return this; }
  like(c: string, v: string) { const rx = new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"); this.filtros.push((r) => rx.test(String(r[c] ?? ""))); return this; }
  in(c: string, v: any[]) { this.filtros.push((r) => v.includes(r[c])); return this; }
  is(c: string, v: any) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, op: string, v: any) { this.filtros.push((r) => (op === "is" ? (r[c] ?? null) !== v : r[c] !== v)); return this; }
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
      if (REGRAS_FRETE.has(this.tabela)) {
        for (const p of this.payload) { const falha = regraFreteDemo(this.tabela, null, p); if (falha) return erro(falha); }
      }
      if (REGRAS_GOLPE.has(this.tabela)) {
        for (const p of this.payload) { const falha = golpeDemo(this.tabela, null, { ...p }); if (falha) return erro(falha); }
      }
      linhas = this.payload.map((p: Row) => {
        const chaves = this.conflito.length ? this.conflito : p.chave ? ["chave"] : [];
        const existente = this.op === "upsert" && chaves.length ? t.find((r) => chaves.every((k) => r[k] === p[k])) : null;
        if (existente) return this.ignorarDuplicados ? existente : Object.assign(existente, p, { updated_at: new Date().toISOString() });
        const novo: Row = { id: uid(), created_at: new Date().toISOString(), ...(DEFAULTS[this.tabela]?.() ?? {}), ...p };
        if (REGRAS_GOLPE.has(this.tabela)) golpeDemo(this.tabela, null, novo);
        if (TABELAS_COM_UNIDADE.includes(this.tabela) && !novo.unidade_id) novo.unidade_id = unidadeDoUsuario();
        t.push(novo);
        if (AUDITADAS.has(this.tabela)) registrarDemo(this.tabela, "insert", null, { ...novo }, null, "usuario");
        if (this.tabela === "contas_recorrentes") setTimeout(() => gerarRecorrentesDemo(db, novo.id));
        if (this.tabela === "envios") { novo.numero ??= Math.max(0, ...t.map((r) => Number(r.numero) || 0)) + 1; calcularEnvioDemo(novo); }
        if (this.tabela === "envio_cotacoes") { novo.ativa ??= true; novo.escolhida ??= false; const ev = db.envios.find((x) => x.id === novo.envio_id); if (ev?.status === "cotacao") ev.status = "aprovacao"; }
        if (this.tabela === "envio_ocorrencias") { novo.status ??= "aberta"; novo.atualizado_em = novo.created_at; }
        if (this.tabela === "fornecimentos" && novo.preferido) preferidoDemo(novo);
        // como o gatilho trg_op_etapas: a OP nasce com a lista de conferência das etapas da máquina
        if (this.tabela === "ordens_producao" && !novo.etapas?.length)
          novo.etapas = (db.produtos.find((x) => x.id === novo.produto_id)?.etapas_producao ?? []).map((nome: string) => ({ nome, feita: false }));
        if (this.tabela === "estoque_movimentos") {
          t.pop();
          movimentar(novo.produto_id, novo.tipo, Number(novo.quantidade), novo.motivo ?? "", { numero_serie: novo.numero_serie, unidade_id: novo.unidade_id });
        }
        return novo;
      });
    } else {
      linhas = t.filter((r) => this.filtros.every((f) => f(r)));
      // OC e OP excluídas somem das listas (no sistema real: política "nao_excluida")
      if (this.op === "select" && ["pedidos_compra", "ordens_producao", "ordens_servico"].includes(this.tabela)) linhas = linhas.filter((r) => !r.excluida_em);
      const conta = this.tabela === "contas_receber" || this.tabela === "contas_pagar";
      if (conta && this.op === "delete" && linhas.length) return erro("contas não podem ser excluídas: cancele a conta informando o motivo");
      if (conta && this.op === "update" && linhas.some((r) => faltaMotivo(r, this.payload))) return erro("informe o motivo da alteração (valor, vencimento, cancelamento ou estorno)");
      // regras dos fretes: cada linha validada e completada antes de gravar
      const candidatos = new Map<Row, Row>();
      if (this.op === "update" && REGRAS_FRETE.has(this.tabela)) {
        for (const r of linhas) {
          const cand = { ...r, ...this.payload };
          const falha = regraFreteDemo(this.tabela, r, cand);
          if (falha) return erro(falha);
          candidatos.set(r, cand);
        }
      }
      if (this.op === "update" && REGRAS_GOLPE.has(this.tabela)) {
        for (const r of linhas) {
          const cand = { ...r, ...this.payload };
          const falha = golpeDemo(this.tabela, r, cand);
          if (falha) return erro(falha);
          candidatos.set(r, cand);
        }
      }
      if (this.op === "update") linhas.forEach((r) => {
        const antes = r.status;
        const copia = AUDITADAS.has(this.tabela) ? { ...r } : null;
        Object.assign(r, candidatos.get(r) ?? this.payload);
        if (copia) { registrarDemo(this.tabela, "update", copia, { ...r }, this.payload.motivo_alteracao ?? null, "usuario"); delete r.motivo_alteracao; }
        if (this.tabela === "contas_recorrentes") aplicarRecorrenteDemo(r);
        if (this.tabela === "envios") calcularEnvioDemo(r);
        if (this.tabela === "envio_ocorrencias") { r.atualizado_em = new Date().toISOString(); if (r.status === "resolvida") r.resolvida_em ??= r.atualizado_em; }
        if (this.tabela === "fornecimentos" && this.payload.preferido === true) preferidoDemo(r);
        // no sistema real: gatilho trg_scrum_item
        if (this.tabela === "scrum_itens") r.concluido_em = r.status === "feito" ? (antes === "feito" ? r.concluido_em : new Date().toISOString()) : null;
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
function assinanteDemo(nome: string, cpf: string, png: string) {
  if (String(nome ?? "").trim().length < 5 || !/\s/.test(String(nome).trim())) return "informe o nome completo de quem assina";
  if (String(cpf ?? "").replace(/\D/g, "").length !== 11) return "informe o CPF de quem assina (11 números)";
  if (!String(png ?? "").startsWith("data:image/png;base64,")) return "faça a assinatura no quadro";
  return null;
}
const temPapelDemo = (...p: string[]) => { const pa = db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.papel; return pa === "admin" || p.includes(pa); };
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

/** PDV: cliente genérico "Consumidor Final" (criado na primeira venda de balcão sem cliente). */
function pdvConsumidorDemo() {
  const cfg = db.configuracoes[0];
  if (cfg.pdv_cliente_id && db.clientes.some((c) => c.id === cfg.pdv_cliente_id)) return cfg.pdv_cliente_id as string;
  const c = { id: uid(), ...DEFAULTS.clientes(), nome: "Consumidor Final", tipo_pessoa: "PF", avisos_email: false, tags: [], contribuinte_icms: 9,
    observacoes: "Cliente genérico das vendas de balcão (PDV) sem identificação do comprador." };
  db.clientes.push(c);
  cfg.pdv_cliente_id = c.id;
  return c.id;
}

const rpcs: Record<string, (a: any) => { data: any; error: any }> = {
  // no sistema real: public.renegociar_contas_pagar (Contas a pagar → marcar → Renegociar)
  renegociar_contas_pagar: ({ p_ids, p_titulo, p_trocar, p_valor, p_parcelas, p_primeiro, p_obs }) => {
    const cs = db.contas_pagar.filter((c) => p_ids.includes(c.id) && c.status === "aberto" && !c.negociacao_id);
    if (cs.length !== p_ids.length) return { data: null, error: { message: "Só entram contas em aberto e que não estejam em outra renegociação." } };
    const id = uid(), total = cs.reduce((t, c) => t + Number(c.valor), 0), p = cs[0];
    db.pagar_negociacoes = [...(db.pagar_negociacoes ?? []), { id, titulo: p_titulo, fornecedor_id: p.fornecedor_id ?? null, unidade_id: p.unidade_id ?? null, valor_original: total,
      valor_acordo: p_trocar ? p_valor : null, parcelas: p_trocar ? p_parcelas : null, situacao: p_trocar ? "acordo" : "negociando", observacoes: p_obs, criado_nome: "Você (demonstração)", created_at: quando(0), atualizado_em: quando(0) }];
    if (p_trocar) {
      cs.forEach((c) => Object.assign(c, { negociacao_id: id, negociacao_papel: "original", status: "cancelado", motivo_alteracao: `Renegociada: ${p_titulo}` }));
      const cada = Math.round((p_valor / p_parcelas) * 100) / 100;
      for (let i = 1; i <= p_parcelas; i++) {
        const d = new Date(`${p_primeiro}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i - 1);
        db.contas_pagar.push({ id: uid(), descricao: `${p_titulo} · parcela ${i}/${p_parcelas}`, fornecedor_id: p.fornecedor_id ?? null, unidade_id: p.unidade_id ?? null, categoria: p.categoria, rateio: p.rateio ?? [],
          valor: i === p_parcelas ? Math.round((p_valor - cada * (p_parcelas - 1)) * 100) / 100 : cada, vencimento: d.toISOString().slice(0, 10), status: "aberto",
          revisao: "em_revisao", negociacao_id: id, negociacao_papel: "acordo", created_at: quando(0) });
      }
    } else cs.forEach((c) => Object.assign(c, { negociacao_id: id, negociacao_papel: "acordo" }));
    db.pagar_negociacao_eventos = [...(db.pagar_negociacao_eventos ?? []), { id: uid(), negociacao_id: id, tipo: "acordo", quando: hojeISO(),
      texto: p_trocar ? `${cs.length} conta(s) trocada(s) por ${p_parcelas} parcela(s).` : `Negociação aberta para ${cs.length} conta(s).`, arquivo_caminho: null, arquivo_nome: null, arquivo_tipo: null,
      criado_por: sessao?.user.id ?? null, criado_nome: "Você (demonstração)", created_at: quando(0) }];
    return { data: id, error: null };
  },
  // no sistema real: public.conciliar_vendas (Vendas → marcar → Conciliar). Aqui só a venda sem conta x entrada de mesmo valor.
  conciliar_vendas: ({ p_ids, p_aplicar = false, p_escolhidos = [] }) => {
    const vendas = db.pedidos.filter((p) => p_ids.includes(p.id) && ["aprovado", "faturado", "entregue"].includes(p.status) && Number(p.valor_total) > 0);
    const semConta = vendas.filter((p) => !db.contas_receber.some((c) => c.pedido_id === p.id && c.status !== "cancelado"));
    const contaDe = (l: Row) => db.contas_bancarias.find((b) => b.id === l.conta_bancaria_id);
    // de 10 dias antes a 60 dias depois da venda
    const perto = (p: Row, data: string) => { const d = (Date.parse(data) - Date.parse(String(p.aprovado_em ?? p.created_at).slice(0, 10))) / 864e5; return d >= -10 && d <= 60; };
    const cand = semConta.map((p) => ({ p, ls: db.extrato_lancamentos.filter((l) => l.status === "pendente" && Number(l.valor) === Number(p.valor_total)
      && contaDe(l)?.unidade_id === p.unidade_id && perto(p, l.data)) }));
    const usos = (id: string) => cand.filter((c) => c.ls.some((l) => l.id === id)).length;
    const pares = cand.filter((c) => c.ls.length === 1 && usos(c.ls[0].id) === 1).map(({ p, ls: [l] }) => {
      const cl = db.clientes.find((x) => x.id === p.cliente_id);
      const nome = String(cl?.nome ?? "").split(/\s+/).find((t) => t.length >= 4)?.toUpperCase() ?? "§";
      return { lanc: l.id, numero: p.numero, cliente: cl?.nome ?? null, valor: Number(l.valor), data: l.data, banco: contaDe(l)?.nome ?? null,
        descricao: l.descricao, tipo: "nova", nome_confere: String(l.descricao).toUpperCase().includes(nome), centavos: Number(l.valor) % 1 !== 0, pedido: p };
    });
    let conciliadas = 0;
    if (p_aplicar) for (const x of pares.filter((x) => p_escolhidos.includes(x.lanc))) {
      const id = uid();
      db.contas_receber.push({ id, descricao: `Pedido #${x.numero} - parcela 1/1`, cliente_id: x.pedido.cliente_id, pedido_id: x.pedido.id, parcela: 1, total_parcelas: 1,
        valor: x.valor, vencimento: x.data, status: "pago", data_pagamento: x.data, valor_pago: x.valor, unidade_id: x.pedido.unidade_id, revisao: "historico" });
      if (!vincularDemo(db.extrato_lancamentos.find((l) => l.id === x.lanc)!, "receber", id)) conciliadas++;
    }
    const comPar = new Set(pares.map((x) => x.pedido.id));
    return { error: null, data: {
      vendas: vendas.length, ja: vendas.length - semConta.length, pares: pares.map(({ pedido: _p, ...x }) => x),
      duvida: cand.filter((c) => c.ls.length > 0 && !comPar.has(c.p.id)).map((c) => c.p.numero),
      sem_par: cand.filter((c) => c.ls.length === 0).map((c) => c.p.numero),
      pulados: db.pedidos.filter((p) => p_ids.includes(p.id) && !vendas.includes(p)).map((p) => ({ numero: p.numero, motivo: p.status === "orcamento" ? "orçamento: aprove a venda antes" : "venda cancelada" })),
      aplicado: p_aplicar, conciliadas, contas_criadas: conciliadas, erros: [],
    } };
  },
  // no sistema real: public.saude_sistema (Sobre → Monitor; só o administrador)
  saude_sistema: () => {
    const ha = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    const auto = (nome: string, agenda: string, minAtras: number | null, x: Partial<Row> = {}) => ({ nome, agenda, ativo: true, ultima: minAtras == null ? null : ha(minAtras),
      ultima_situacao: minAtras == null ? null : "succeeded", ultima_seg: 0.05, rodadas_24h: 0, falhas_24h: 0, falhas_7d: 0, ultimo_erro: null, ultimo_erro_em: null, ...x });
    return { error: null, data: {
      agora: new Date().toISOString(), historico_linhas: 34805,
      automacoes: [
        auto("erp-nfe-processar", "*/15 * * * *", 7, { rodadas_24h: 96 }), auto("erp-whatsapp-enviar", "* * * * *", 0, { rodadas_24h: 1440 }),
        auto("erp-avisos-enviar", "* * * * *", 0, { rodadas_24h: 1440 }), auto("erp-email-caixa", "*/5 * * * *", 3, { rodadas_24h: 288 }),
        auto("erp-inter", "23 */4 * * *", 130, { rodadas_24h: 6 }), auto("erp-openfinance", "17 */4 * * *", 136, { rodadas_24h: 6 }),
        auto("erp-mercadolivre-anuncios", "*/5 * * * *", 3, { rodadas_24h: 288, falhas_24h: 2, falhas_7d: 2, ultimo_erro: "connection timeout", ultimo_erro_em: ha(300) }),
        auto("erp-contas-fixas", "50 10 * * *", 960, { rodadas_24h: 1 }), auto("erp-regua-cobranca", "2 11 * * *", 948, { rodadas_24h: 1 }),
        auto("erp-parcelamentos-avisos", "7 11 * * *", null), auto("erp-vigiar-sistema", "13 * * * *", 40, { rodadas_24h: 24 }),
      ],
      filas: [
        { chave: "nfe_erro", qtd: 1, desde: ha(3 * 1440) }, { chave: "nfe_vinculo", qtd: 4, desde: ha(2 * 1440) },
        { chave: "extrato", qtd: 120, total: 300, desde: ha(5 * 1440) }, { chave: "avisos", qtd: 0, desde: null },
        { chave: "whatsapp", qtd: 1, desde: ha(3 * 1440) }, { chave: "mercadolivre", qtd: 0, desde: null }, { chave: "sugestoes", qtd: (db.produto_sugestoes ?? []).filter((x: Row) => x.situacao === "pendente").length, desde: ha(1440) },
      ],
      backup: { ultimo_ok: null, falhas_seguidas: 3, ultimo: { em: ha(2 * 1440), status: "erro", detalhe: "O backup de hoje falhou no GitHub (exemplo)", hostinger_em: null } },
      chamadas: { ok: 96, erro: 0, tempo_esgotado: 0, desde: ha(360), ultimo_erro: null },
      vencimentos: (db.vencimentos_chaves ?? []).filter((v: Row) => (v.situacao ?? "ativa") === "ativa")
        .map((v: Row) => ({ ...v, origem: "cadastro", dias: Math.round((Date.parse(v.vence_em) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5) }))
        .sort((a: Row, b: Row) => a.vence_em.localeCompare(b.vence_em)),
    } };
  },
  // no sistema real: public.gerar/aplicar/ignorar_sugestoes_produtos (Produtos → Qualidade do cadastro)
  gerar_sugestoes_produtos: () => ({ data: { novas: 0, vencidas: 0 }, error: null }),
  aplicar_sugestoes_produtos: ({ p_ids }) => {
    let aplicadas = 0, puladas = 0;
    for (const s of (db.produto_sugestoes ?? []).filter((x: Row) => p_ids.includes(x.id) && x.situacao === "pendente" && x.valor != null)) {
      const p = db.produtos.find((x: Row) => x.id === s.produto_id);
      if (!p) continue;
      const antes = p[s.campo];
      if (s.campo === "preco_custo" ? Number(antes) > 0 : ["categoria", "marca", "codigo_barras"].includes(s.campo) && antes) { s.situacao = "vencida"; puladas++; continue; }
      p[s.campo] = s.campo === "preco_custo" ? Number(s.valor) : s.valor;
      Object.assign(s, { situacao: "aplicada", valor_anterior: antes ?? null, decidido_nome: "Você", decidido_em: new Date().toISOString() });
      aplicadas++;
    }
    return { data: { aplicadas, puladas }, error: null };
  },
  ignorar_sugestoes_produtos: ({ p_ids }) => {
    const l = (db.produto_sugestoes ?? []).filter((x: Row) => p_ids.includes(x.id) && x.situacao === "pendente");
    for (const s of l) Object.assign(s, { situacao: "ignorada", decidido_nome: "Você", decidido_em: new Date().toISOString() });
    return { data: l.length, error: null };
  },
  // no sistema real: public.salvar_item_projeto, mudar_situacao_projeto e votar_ideia (Sobre → Handoff e Ideias)
  salvar_item_projeto: (a) => {
    if (String(a.p_titulo ?? "").trim().length < 3) return erro("escreva o título (pelo menos 3 letras)");
    const lista = (db.projeto_itens ??= []);
    const dados = { titulo: String(a.p_titulo).trim(), detalhe: a.p_detalhe || null, area: a.p_area || "geral", responsavel: a.p_tipo === "pendencia" ? a.p_responsavel : null,
      prioridade: a.p_prioridade || "media", esforco: a.p_tipo === "ideia" ? a.p_esforco ?? null : null, prazo: a.p_tipo === "pendencia" ? a.p_prazo ?? null : null, atualizado_em: new Date().toISOString() };
    const r = a.p_id ? lista.find((x: Row) => x.id === a.p_id) : null;
    if (r) { Object.assign(r, dados); return { data: r.id, error: null }; }
    const novo = { id: uid(), tipo: a.p_tipo, situacao: a.p_tipo === "decisao" ? "feita" : "aberta", motivo: null, votos: [], criado_por: sessao?.user.id ?? null,
      criado_nome: db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? null, concluido_em: a.p_tipo === "decisao" ? dados.atualizado_em : null, created_at: dados.atualizado_em, ...dados };
    lista.unshift(novo);
    return { data: novo.id, error: null };
  },
  mudar_situacao_projeto: (a) => {
    const r = (db.projeto_itens ?? []).find((x: Row) => x.id === a.p_id);
    if (!r) return erro("item não encontrado");
    if (a.p_situacao === "descartada" && String(a.p_motivo ?? "").trim().length < 5) return erro("escreva o motivo (pelo menos 5 letras)");
    Object.assign(r, { situacao: a.p_situacao, motivo: ["descartada", "aguardando"].includes(a.p_situacao) ? a.p_motivo : null,
      concluido_em: a.p_situacao === "feita" ? new Date().toISOString() : null, atualizado_em: new Date().toISOString() });
    return { data: null, error: null };
  },
  votar_ideia: (a) => {
    const r = (db.projeto_itens ?? []).find((x: Row) => x.id === a.p_id);
    const eu = sessao?.user.id ?? "anon";
    if (!r) return erro("só ideias recebem voto");
    const votou = !r.votos.includes(eu);
    r.votos = votou ? [...r.votos, eu] : r.votos.filter((v: string) => v !== eu);
    return { data: votou, error: null };
  },
  // no sistema real: public.salvar_cadeia e revisar_cadeia (Sobre → Esquemas → Cadeia de causas)
  salvar_cadeia: (a) => {
    const lista = (db.cadeias_causa ??= []);
    const dados = { titulo: a.p_titulo, efeito: a.p_efeito, area: a.p_area || "geral", elos: a.p_elos, conclusao: a.p_conclusao || null, situacao: "em_revisao", motivo: null,
      revisado_nome: null, revisado_em: null, atualizado_em: new Date().toISOString() };
    const r = a.p_id ? lista.find((x: Row) => x.id === a.p_id) : null;
    if (r) { Object.assign(r, dados); return { data: r.id, error: null }; }
    const novo = { id: uid(), criado_por: sessao?.user.id ?? null, criado_nome: db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? null, created_at: dados.atualizado_em, ...dados };
    lista.unshift(novo);
    return { data: novo.id, error: null };
  },
  revisar_cadeia: (a) => {
    const r = (db.cadeias_causa ?? []).find((x: Row) => x.id === a.p_id);
    if (!r) return erro("cadeia não encontrada");
    if (a.p_situacao === "descartada" && String(a.p_motivo ?? "").trim().length < 5) return erro("escreva o motivo (pelo menos 5 letras)");
    const revisada = a.p_situacao === "revisada";
    Object.assign(r, { situacao: a.p_situacao, motivo: a.p_situacao === "descartada" ? a.p_motivo : null, revisado_em: revisada ? new Date().toISOString() : null,
      revisado_nome: revisada ? db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? null : null, atualizado_em: new Date().toISOString() });
    return { data: null, error: null };
  },
  // no sistema real: public.marcar_obrigacao e public.salvar_calendario_fiscal (calendário de obrigações do contador)
  marcar_obrigacao: (a) => {
    if (a.p_situacao === "nao_se_aplica" && String(a.p_observacao ?? "").trim().length < 5) return { data: null, error: { message: "escreva por que não se aplica (pelo menos 5 letras)" } };
    const lista = (db.obrigacoes_cumpridas ??= []);
    const igual = (r: Row) => r.chave === a.p_chave && r.competencia === a.p_competencia && (r.unidade_id ?? null) === (a.p_unidade ?? null);
    const feito = a.p_situacao === "feito";
    const dados = { chave: a.p_chave, competencia: a.p_competencia, unidade_id: a.p_unidade ?? null, situacao: a.p_situacao,
      feito_em: feito ? a.p_feito_em ?? new Date().toISOString().slice(0, 10) : null, valor: feito ? a.p_valor ?? null : null,
      recibo: a.p_recibo || null, observacao: a.p_observacao || null, atualizado_em: new Date().toISOString(),
      registrado_nome: db.usuarios_erp.find((u) => u.user_id === sessao?.user.id)?.nome ?? null };
    const r = lista.find(igual);
    if (r) Object.assign(r, dados); else lista.push({ id: `ob${lista.length + 1}`, created_at: dados.atualizado_em, ...dados });
    return { data: (r ?? lista[lista.length - 1]).id, error: null };
  },
  salvar_calendario_fiscal: ({ p }) => { db.configuracoes[0].calendario_fiscal = p; return { data: null, error: null }; },
  // no sistema real: public.busca_geral (mesmas regras, com as permissões de quem busca)
  busca_geral: ({ p_termo, p_limite }) => {
    const t = String(p_termo ?? "").trim();
    if (t.length < 2) return { data: [], error: null };
    const lim = Math.min(Math.max(Number(p_limite) || 5, 1), 20);
    const sem = (x: unknown) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const tem = (x: unknown) => sem(x).includes(sem(t));
    const d = t.replace(/\D/g, "");
    const num = /^#?\s*\d{1,9}$/.test(t) ? d : null;
    const cli = (id: unknown) => (db.clientes ?? []).find((c: Row) => c.id === id);
    const r: Row[] = [];
    r.push(...(db.clientes ?? []).filter((c: Row) => tem(c.nome) || tem(c.nome_fantasia) || (d.length >= 5 && String(c.cpf_cnpj ?? "").replace(/\D/g, "").startsWith(d)) || (num && String(c.codigo) === num))
      .slice(0, lim).map((c: Row) => ({ tipo: "cliente", id: c.id, titulo: c.nome_fantasia || c.nome, sub: [c.nome_fantasia ? c.nome : null, [c.municipio, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ") })));
    r.push(...(db.pedidos ?? []).filter((p: Row) => (num && String(p.numero) === num) || (!num && (tem(cli(p.cliente_id)?.nome) || tem(cli(p.cliente_id)?.nome_fantasia))))
      .slice(0, lim).map((p: Row) => ({ tipo: "venda", id: p.id, titulo: `Venda #${p.numero}`, sub: [cli(p.cliente_id)?.nome, p.status].filter(Boolean).join(" · "), valor: p.valor_total })));
    r.push(...(db.notas_fiscais ?? []).filter((n: Row) => !n.excluida_em && ((num && String(n.numero) === num) || (!num && (tem(n.destinatario_nome) || tem(cli(n.cliente_id)?.nome)))))
      .slice(0, lim).map((n: Row) => ({ tipo: "nota", id: n.id, titulo: `NF-e ${n.numero ?? "(sem número)"}`, sub: [cli(n.cliente_id)?.nome ?? n.destinatario_nome, n.status].filter(Boolean).join(" · "), valor: n.valor_total })));
    r.push(...(db.produtos ?? []).filter((p: Row) => tem(p.descricao) || sem(p.sku).startsWith(sem(t)) || (d.length >= 8 && p.codigo_barras === d))
      .slice(0, lim).map((p: Row) => ({ tipo: "produto", id: p.id, titulo: p.descricao, sub: [p.sku, p.tipo, p.ativo ? null : "inativo"].filter(Boolean).join(" · ") })));
    r.push(...(db.ordens_servico ?? []).filter((o: Row) => (num && String(o.numero) === num) || (!num && (tem(cli(o.cliente_id)?.nome) || tem(o.numero_serie) || tem(o.equipamento))))
      .slice(0, lim).map((o: Row) => ({ tipo: "os", id: o.id, titulo: `OS #${o.numero}`, sub: [cli(o.cliente_id)?.nome, o.equipamento, o.status].filter(Boolean).join(" · ") })));
    r.push(...(db.fornecedores ?? []).filter((f: Row) => tem(f.nome) || tem(f.nome_fantasia))
      .slice(0, lim).map((f: Row) => ({ tipo: "fornecedor", id: f.id, titulo: f.nome_fantasia || f.nome, sub: [f.municipio, f.uf].filter(Boolean).join("/") })));
    return { data: r, error: null };
  },
  // no sistema real: public.usuarios_ultimo_acesso (data do login, de auth.users)
  usuarios_ultimo_acesso: () => ({ data: (db.usuarios_erp ?? []).map((u: Row) => ({ user_id: u.user_id, ultimo_acesso: u.ultimo_acesso ?? null })), error: null }),
  // no sistema real: public.implantacao_indicadores (contagens feitas no banco)
  implantacao_indicadores: () => {
    const desde = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString();
    const notas = (db.notas_fiscais ?? []).filter((n: Row) => n.status === "autorizada" && n.created_at > desde(14));
    const prod = (db.produtos ?? []).filter((p: Row) => p.ativo);
    const extrato = (db.extrato_lancamentos ?? []).filter((l: Row) => l.data > desde(30).slice(0, 10));
    return {
      data: {
        usuarios: (db.usuarios_erp ?? []).filter((u: Row) => u.ativo).map((u: Row) => ({ nome: u.nome, papel: u.papel, ultimo_login: u.user_id === "u-cont" ? null : u.ultimo_acesso })),
        notas_erp_14d: notas.filter((n: Row) => n.origem !== "importada").length, notas_tiny_14d: notas.filter((n: Row) => n.origem === "importada").length,
        notas_tiny_ultima: quando(-16), notas_erp_ultima: quando(-1),
        pedidos_7d: (db.pedidos ?? []).filter((p: Row) => p.created_at > desde(7) && p.status !== "cancelado").length,
        pedidos_30d: (db.pedidos ?? []).filter((p: Row) => p.created_at > desde(30) && p.status !== "cancelado").length,
        contas_7d: [...(db.contas_pagar ?? []), ...(db.contas_receber ?? [])].filter((c: Row) => c.created_at > desde(7)).length,
        extrato_30d: extrato.length, extrato_conciliado_30d: extrato.filter((l: Row) => l.status === "conciliado").length,
        os_30d: (db.ordens_servico ?? []).filter((o: Row) => o.created_at > desde(30)).length,
        op_30d: (db.ordens_producao ?? []).filter((o: Row) => o.created_at > desde(30)).length,
        estoque_itens: prod.filter((p: Row) => p.tipo !== "maquina" && !p.kit).length, estoque_contados_60d: 6,
        pecas_sem_custo: prod.filter((p: Row) => p.tipo === "peca" && p.vendavel && !p.kit && !Number(p.preco_custo)).length,
        insumos_sem_custo: prod.filter((p: Row) => p.tipo === "insumo" && !Number(p.preco_custo)).length,
        sem_ncm: prod.filter((p: Row) => p.tipo !== "servico" && !p.ncm).length,
        clientes_sem_doc: (db.clientes ?? []).filter((c: Row) => !String(c.cpf_cnpj ?? "").replace(/\D/g, "")).length,
        clientes_sem_telefone: (db.clientes ?? []).filter((c: Row) => !c.telefone && !c.whatsapp).length,
        clientes_sem_uf: (db.clientes ?? []).filter((c: Row) => !c.uf).length,
        fornecedores_sem_cnpj: (db.fornecedores ?? []).filter((f: Row) => !f.cnpj).length,
      },
      error: null,
    };
  },
  // técnicos que já atenderam o cliente (pelas OS) e os da região dele (cidades e estados que cada um atende)
  // no sistema real: public.compras_marketplace (lê o grupo infIntermed e o texto do XML das notas de fornecedor)
  compras_marketplace: () => ({
    data: (db.nfe_recebidas ?? []).filter((n: Row) => !n.excluida_em && n.xml && (/<infIntermed>/.test(n.xml) || /tik\s*tok|bytedance|shopee|mercado\s*livre|mercadolivre/i.test(n.xml))).map((n: Row) => ({
      nota_id: n.id,
      intermediador_cnpj: n.xml.match(/<infIntermed>\s*<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ?? null,
      loja_usuario: n.xml.match(/<infIntermed>[\s\S]*?<idCadIntTran>([^<]*)<\/idCadIntTran>/)?.[1] ?? null,
      pedido: n.xml.match(/pedido[^0-9<]{0,20}(\d{6,20})/i)?.[1] ?? null,
      citado: n.xml.match(/(tik\s*tok|bytedance|shopee|amazon|mercado\s*livre|mercadolivre|aliexpress|shein|temu|magalu)/i)?.[1]?.toLowerCase() ?? null,
    })),
    error: null,
  }),
  // no sistema real: public.maquinas_do_cliente (equipamentos + NF-e de venda emitidas + data do cadastro)
  maquinas_do_cliente: ({ p_cliente }) => {
    const c = db.clientes.find((x: Row) => x.id === p_cliente);
    const eq = (db.equipamentos ?? []).filter((e: Row) => e.cliente_id === p_cliente).map((e: Row) => ({
      fonte: "equipamento", descricao: e.descricao, quantidade: 1, data: e.data_venda ?? null, garantia_ate: e.garantia_ate ?? null,
      nota: null, numero_serie: e.numero_serie ?? null, equipamento_id: e.id, origem: e.origem ?? null,
    }));
    const d: string | null = c?.compra_maquina_em ?? null;
    const cad = d && !eq.some((e: Row) => String(e.data ?? "").slice(0, 7) === d.slice(0, 7)) ? [{
      fonte: "cadastro", descricao: "Máquina (modelo não informado)", quantidade: 1, data: d,
      garantia_ate: new Date(Date.UTC(Number(d.slice(0, 4)) + 1, Number(d.slice(5, 7)), 0)).toISOString().slice(0, 10),
      nota: null, numero_serie: null, equipamento_id: null, origem: null,
    }] : [];
    return { data: [...eq, ...cad].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? ""))), error: null };
  },
  tecnicos_do_cliente: ({ p_cliente }) => {
    const c = db.clientes.find((x: Row) => x.id === p_cliente);
    const sa = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const cid = sa(c?.municipio), uf = String(c?.uf ?? "").toUpperCase();
    const lista = (db.tecnicos ?? []).filter((t: Row) => t.ativo !== false).map((t: Row) => {
      const os = (db.ordens_servico ?? []).filter((o: Row) => o.cliente_id === p_cliente && !o.excluida_em && (o.tecnico_id === t.id || sa(o.tecnico) === sa(t.nome)));
      const naCidade = !!cid && ((t.cidades ?? []).some((x: string) => sa(x.split("/")[0]) === cid && (!x.split("/")[1] || x.split("/")[1].toUpperCase() === uf)) || (sa(t.municipio) === cid && String(t.uf).toUpperCase() === uf));
      const noEstado = !!uf && ((t.ufs ?? []).includes(uf) || String(t.uf).toUpperCase() === uf);
      return { id: t.id, nome: t.nome, tipo: t.tipo, whatsapp: t.whatsapp, telefone: t.telefone ?? null, municipio: t.municipio, uf: t.uf,
        atendimentos: os.length, ultimo: os.map((o: Row) => o.data_entrada).sort().pop() ?? null, na_cidade: naCidade, no_estado: noEstado };
    }).filter((t: Row) => t.atendimentos > 0 || t.no_estado || t.na_cidade);
    return { data: lista.sort((a: Row, b: Row) => b.atendimentos - a.atendimentos || Number(b.na_cidade) - Number(a.na_cidade) || a.nome.localeCompare(b.nome)), error: null };
  },
  maquina_publica: ({ p_token }) => {
    const e = db.equipamentos.find((x: Row) => x.token === p_token);
    if (!e) return { data: null, error: null };
    const p = db.produtos.find((x: Row) => x.id === e.produto_id);
    const c = db.clientes.find((x: Row) => x.id === e.cliente_id);
    const cfg = db.configuracoes[0];
    return {
      data: {
        maquina: { descricao: p?.descricao ?? e.descricao, modelo: p?.modelo, numero_serie: e.numero_serie, data_venda: e.data_venda, garantia_ate: e.garantia_ate,
          proxima_preventiva: e.proxima_preventiva, usada: e.usada, outra_empresa: e.origem, foto: p?.foto_caminho },
        cliente: String(c?.nome_fantasia || c?.nome || "").trim().split(" ")[0] || null,
        especificacoes: p?.especificacoes ?? [], dicas: p?.dicas_manutencao ?? null,
        midia: (db.produtos_midia ?? []).filter((m: Row) => m.produto_id === p?.id && m.ativo !== false).map((m: Row) => ({ tipo: m.tipo, titulo: m.titulo, caminho: m.caminho, mime: m.mime })),
        empresa: { nome: cfg.nome_fantasia || cfg.razao_social, whatsapp: cfg.whatsapp, telefone: cfg.telefone, email: cfg.email },
      },
      error: null,
    };
  },
  historico_custos: ({ p_produto }) => {
    const p = db.produtos.find((x: Row) => x.id === p_produto);
    if (!p) return { data: [], error: null };
    const linhas: Row[] = [{ data: quando(-60), evento: "cadastro", detalhe: null, quantidade: null, valor_unitario: null,
      preco_custo: Math.round(Number(p.preco_custo ?? 0) * 0.92 * 100) / 100, preco_venda: Math.round(Number(p.preco_venda ?? 0) * 0.95 * 100) / 100, saldo: 0, usuario: "Administrador" }];
    for (const pc of db.pedidos_compra ?? []) {
      for (const i of db.pedido_compra_itens.filter((x: Row) => x.pedido_compra_id === pc.id && x.produto_id === p_produto && Number(x.custo_unitario) > 0)) {
        const f = db.fornecedores.find((x: Row) => x.id === pc.fornecedor_id);
        linhas.push({ data: pc.recebido_em ?? pc.created_at, evento: "compra", detalhe: `Pedido de compra ${pc.numero} · ${f?.nome_fantasia || f?.nome || ""}`, quantidade: i.quantidade,
          valor_unitario: i.custo_unitario, preco_custo: null, preco_venda: null, saldo: Number(p.estoque_atual ?? 0), usuario: null });
      }
    }
    if (Number(p.preco_custo) > 0) linhas.push({ data: quando(-8), evento: "alteracao", detalhe: "Custo atualizado pela nota de compra", quantidade: null, valor_unitario: null,
      preco_custo: p.preco_custo, preco_venda: p.preco_venda, saldo: Number(p.estoque_atual ?? 0), usuario: "Administrador" });
    return { data: linhas.sort((a, b) => String(b.data).localeCompare(String(a.data))), error: null };
  },
  sugerir_ncm: ({ p_produto }) => {
    const p = db.produtos.find((x: Row) => x.id === p_produto);
    if (!p) return { data: [], error: null };
    const sa = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const genericas = ["para", "compativel", "maquina", "maquinas", "frost", "sorvete", "expresso", "sabores", "sabor", "unidade", "peca", "pecas", "novo", "nova", "original"];
    const palavras = [...new Set(sa(p.descricao).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !genericas.includes(w)))];
    const porNcm = new Map<string, Row>();
    for (const o of db.produtos.filter((x: Row) => x.id !== p.id && /^\d{8}$/.test(String(x.ncm ?? "")))) {
      const comuns = palavras.filter((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(sa(o.descricao))).length;
      const pts = (comuns >= Math.min(2, palavras.length) && palavras.length ? comuns * 20 : 0) + (p.categoria && o.categoria === p.categoria ? 3 : 0);
      if (!pts) continue;
      const atual = porNcm.get(o.ncm) ?? { ncm: o.ncm, fonte: comuns ? "produto parecido" : "mesma categoria", detalhe: o.descricao, pontos: 0 };
      atual.pontos = Math.min(300, atual.pontos + pts);
      porNcm.set(o.ncm, atual);
    }
    return { data: [...porNcm.values()].sort((a, b) => b.pontos - a.pontos).slice(0, 5), error: null };
  },
  nomes_tecnicos: () => ({
    data: (db.funcionarios ?? []).filter((f: Row) => f.ativo && f.faz_assistencia && f.situacao !== "desligado")
      .map((f: Row) => ({ nome: f.apelido || f.nome })).sort((a: Row, b: Row) => a.nome.localeCompare(b.nome)),
    error: null,
  }),
  // apagar dados de teste (no sistema real: public.testes_apagar): na prévia só lista o que foi marcado
  testes_apagar: ({ p_pedidos = [], p_os = [], p_ops = [], p_contas = [], p_executar }) => {
    const cli = (id: string) => db.clientes.find((c: Row) => c.id === id)?.nome ?? null;
    const peds = db.pedidos.filter((p: Row) => p_pedidos.includes(Number(p.numero)));
    const oss = (db.ordens_servico ?? []).filter((o: Row) => p_os.includes(Number(o.numero)));
    const resumo = {
      pedidos: peds.map((p: Row) => ({ numero: p.numero, cliente: cli(p.cliente_id), total: p.valor_total, status: p.status })),
      os: oss.map((o: Row) => ({ numero: o.numero, cliente: cli(o.cliente_id), status: o.status })),
      ops: (db.ordens_producao ?? []).filter((o: Row) => p_ops.includes(Number(o.numero))).map((o: Row) => ({ numero: o.numero, maquina: null, status: o.status })),
      contas: (db.contas_receber ?? []).filter((c: Row) => p_contas.includes(c.id) || peds.some((p: Row) => p.id === c.pedido_id))
        .map((c: Row) => ({ descricao: c.descricao, valor: c.valor, status: c.status })),
      estoque_volta: [], notas_reais: [], notas_teste: 0,
    };
    if (p_executar) return erro("Na prévia com dados de exemplo nada é apagado.");
    return { data: resumo, error: null };
  },
  // formação de preço (no sistema real: public.gerar_sugestoes_preco e public.decidir_precos)
  gerar_sugestoes_preco: () => {
    if (!podeFinanceiro()) return erro("só o financeiro ou o administrador revisa os preços");
    const cfg = configPreco(db.configuracoes[0]?.precificacao);
    let n = 0;
    for (const p of db.produtos.filter((x) => x.ativo !== false && x.vendavel !== false && !x.kit && Number(x.preco_custo) > 0)) {
      db.preco_sugestoes.filter((s) => s.produto_id === p.id && s.status === "pendente").forEach((s) => Object.assign(s, { status: "substituida", decidido_em: new Date().toISOString() }));
      const alvo = margemAlvo(p as any, cfg, db.categorias_produto as any).margem;
      const sug = precoSugerido(Number(p.preco_custo), alvo, cfg);
      if (sug == null || !foraDaFaixa(Number(p.preco_venda || 0), sug, cfg)) continue;
      db.preco_sugestoes.push({ id: `ps${Date.now()}${n}`, produto_id: p.id, status: "pendente", origem: "revisao", custo_anterior: null, custo_novo: p.preco_custo,
        preco_atual: Number(p.preco_venda || 0), preco_sugerido: sug, margem_alvo: alvo, preco_aprovado: null, decidido_por: null, decidido_em: null, created_at: new Date().toISOString() });
      n++;
    }
    return { data: n, error: null };
  },
  decidir_precos: ({ p_ids, p_aprovar, p_precos }) => {
    if (!podeFinanceiro()) return erro("só o financeiro ou o administrador aprova preços");
    let n = 0;
    for (const [k, id] of (p_ids as string[]).entries()) {
      const s = db.preco_sugestoes.find((x) => x.id === id && x.status === "pendente");
      if (!s) continue;
      const agora = new Date().toISOString(), quem = sessao?.user.id ?? null;
      if (p_aprovar) {
        const v = Math.round(Number(p_precos?.[k] ?? s.preco_sugerido) * 100) / 100;
        if (!(v > 0)) return erro("preço inválido");
        const p = db.produtos.find((x) => x.id === s.produto_id);
        if (p) {
          const antes = { ...p }; p.preco_venda = v;
          registrarDemo("produtos", "update", antes, { ...p }, `Formação de preço: custo ${brlDemo(s.custo_anterior ?? s.custo_novo)} → ${brlDemo(s.custo_novo)}, margem desejada ${s.margem_alvo}%`, "usuario");
        }
        Object.assign(s, { status: "aprovada", preco_aprovado: v, decidido_por: quem, decidido_em: agora });
      } else Object.assign(s, { status: "recusada", decidido_por: quem, decidido_em: agora });
      n++;
    }
    return { data: n, error: null };
  },
  ultimas_compras: ({ p_fornecedor, p_busca, p_limite }) => {
    const b = String(p_busca ?? "").trim().toLowerCase();
    if (!p_fornecedor && b.length < 3) return { data: [], error: null };
    const casa = (t: string) => !b || t.toLowerCase().startsWith(b) || t.toLowerCase().includes(" " + b);
    const nomeF = (id: string | null) => { const f = db.fornecedores.find((x) => x.id === id); return f ? f.nome_fantasia || f.nome : null; };
    const linhas: Row[] = [];
    for (const pc of db.pedidos_compra ?? []) {
      if (pc.excluida_em || pc.status === "cancelado" || (p_fornecedor && pc.fornecedor_id !== p_fornecedor)) continue;
      for (const i of db.pedido_compra_itens.filter((x) => x.pedido_compra_id === pc.id && casa(x.descricao))) {
        linhas.push({ tipo: "pedido", numero: String(pc.numero), ref_id: pc.id, data: String(pc.enviado_em ?? pc.created_at).slice(0, 10), descricao: i.descricao,
          quantidade: i.quantidade, unidade: "UN", valor_unitario: i.custo_unitario, fornecedor: nomeF(pc.fornecedor_id), produto_id: i.produto_id });
      }
    }
    for (const n of db.nfe_recebidas ?? []) {
      if (n.excluida_em || (p_fornecedor && n.fornecedor_id !== p_fornecedor)) continue;
      for (const i of (n.itens ?? []).filter((x: Row) => casa(x.descricao))) {
        linhas.push({ tipo: "nota", numero: String(n.chave ?? "").slice(25, 34).replace(/^0+/, ""), ref_id: n.id, data: String(n.data_emissao).slice(0, 10), descricao: i.descricao,
          quantidade: i.quantidade, unidade: i.unidade ?? "UN", valor_unitario: i.valor_unitario, fornecedor: nomeF(n.fornecedor_id) ?? n.emitente_nome, produto_id: null });
      }
    }
    return { data: linhas.sort((x, y) => String(y.data).localeCompare(String(x.data))).slice(0, p_limite ?? 300), error: null };
  },
  // conferir itens das notas de fornecedor (no sistema real: itens_notas_fornecedor, lendo nfe_recebida_itens)
  itens_notas_fornecedor: ({ p_unidade, p_desde }) => {
    const grupos = new Map<string, Row>();
    const notas = (db.nfe_recebidas ?? []).filter((n: Row) => !n.excluida_em && n.situacao !== "cancelada" && n.fornecedor_id && n.finalidade !== "devolucao"
      && (!p_unidade || !n.unidade_id || n.unidade_id === p_unidade) && (!p_desde || String(n.data_emissao).slice(0, 10) >= p_desde))
      .sort((a: Row, b: Row) => String(b.data_emissao).localeCompare(String(a.data_emissao)));
    for (const n of notas) for (const i of (n.itens ?? []) as Row[]) {
      if (!/^(51|54|61|64|71)/.test(String(i.cfop ?? "")) || !String(i.codigo ?? "").trim()) continue;
      const k = `${n.fornecedor_id}|${i.codigo}`;
      const g = grupos.get(k);
      const data = String(n.data_emissao).slice(0, 10);
      if (!g) grupos.set(k, { fornecedor_id: n.fornecedor_id, codigo: i.codigo, descricao: i.descricao, ncm: i.ncm, ean: i.ean, unidade: i.unidade, notas: 1,
        quantidade: Number(i.quantidade), ultimo_valor: i.valor_unitario, ultima_data: data, primeira_data: data, _notas: new Set([n.id]) });
      else { g._notas.add(n.id); g.notas = g._notas.size; g.quantidade += Number(i.quantidade); g.primeira_data = data; g.ean ??= i.ean; }
    }
    const lista: Row[] = [...grupos.values()].map(({ _notas, ...g }: Row): Row => {
      const f = db.fornecedores.find((x: Row) => x.id === g.fornecedor_id);
      const pf = (db.produto_fornecedor ?? []).find((x: Row) => x.fornecedor_id === g.fornecedor_id && x.codigo_fornecedor === g.codigo);
      const se = (db.fornecedor_itens_sem_estoque ?? []).find((x: Row) => x.fornecedor_id === g.fornecedor_id && x.codigo_fornecedor === g.codigo && x.ativo);
      const cod = String(g.codigo).toUpperCase();
      const sug = !pf && !se ? db.produtos.find((p: Row) => p.ativo !== false && !p.unificado_em && ((g.ean && p.codigo_barras === g.ean)
        || (cod.length >= 4 && String(p.codigo_fabricante ?? "").toUpperCase() === cod) || ((/[A-Z]/.test(cod) || cod.length >= 6) && String(p.sku ?? "").toUpperCase() === cod))) : null;
      return { ...g, fornecedor: f?.nome_fantasia || f?.nome || null, fornecedor_cnpj: f?.cnpj ?? null, produto_id: pf?.produto_id ?? null, fator: pf?.fator_conversao ?? null,
        sem_estoque: se?.tipo ?? null, sugestao_id: sug?.id ?? null, sugestao_motivo: sug ? (g.ean && sug.codigo_barras === g.ean ? "mesmo código de barras" : "mesmo código") : null };
    });
    return { data: lista.sort((a, b) => String(b.ultima_data).localeCompare(String(a.ultima_data)) || b.notas - a.notas), error: null };
  },
  ligar_itens_fornecedor: ({ p_itens }) => {
    if (!podeFinanceiro()) return erro("sem permissão");
    db.produto_fornecedor ??= [];
    db.fornecedor_itens_sem_estoque ??= [];
    let n = 0;
    for (const v of p_itens ?? []) {
      const pf = db.produto_fornecedor.find((x: Row) => x.fornecedor_id === v.fornecedor_id && x.codigo_fornecedor === v.codigo);
      const se = db.fornecedor_itens_sem_estoque.find((x: Row) => x.fornecedor_id === v.fornecedor_id && x.codigo_fornecedor === v.codigo);
      if (v.acao === "produto") {
        if (!db.produtos.some((p: Row) => p.id === v.produto_id)) return erro(`produto não encontrado para o item "${v.descricao ?? v.codigo}"`);
        if (pf) Object.assign(pf, { produto_id: v.produto_id, fator_conversao: Number(v.fator) || 1 });
        else db.produto_fornecedor.push({ id: uid(), fornecedor_id: v.fornecedor_id, codigo_fornecedor: v.codigo, descricao_fornecedor: v.descricao, produto_id: v.produto_id, fator_conversao: Number(v.fator) || 1 });
        if (se) se.ativo = false;
        const ult = (rpcs.itens_notas_fornecedor({}).data as Row[]).find((x) => x.fornecedor_id === v.fornecedor_id && x.codigo === v.codigo);
        fornecimentoDemo(v.produto_id, v.fornecedor_id, ult?.ultimo_valor != null ? Math.round((Number(ult.ultimo_valor) / (Number(v.fator) || 1)) * 100) / 100 : null, "nota", null);
      } else if (["consumo", "ativo", "servico", "outro"].includes(v.acao)) {
        if (pf) return erro(`o item "${v.descricao ?? v.codigo}" já está ligado a um produto: para trocar, ligue a outro produto`);
        if (se) Object.assign(se, { tipo: v.acao, ativo: true });
        else db.fornecedor_itens_sem_estoque.push({ id: uid(), fornecedor_id: v.fornecedor_id, codigo_fornecedor: v.codigo, descricao: v.descricao, tipo: v.acao, ativo: true });
      } else if (v.acao === "pendente") { if (se) se.ativo = false; } else return erro(`ação inválida: ${v.acao}`);
      n++;
    }
    return { data: n, error: null };
  },
  unificar_produtos: ({ p_principal, p_outros, p_motivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const m = db.produtos.find((p) => p.id === p_principal);
    if (!m || m.ativo === false) return erro("o principal está inativo: escolha um ativo");
    let n = 0;
    for (const id of p_outros ?? []) {
      const o = db.produtos.find((p) => p.id === id);
      if (!o || id === p_principal || o.unificado_em) continue;
      if (!!o.kit !== !!m.kit) return erro(`"${o.kit ? o.descricao : m.descricao}" é kit e o outro não é: não dá para unificar`);
      for (const e of db.estoque_unidade.filter((x) => x.produto_id === id && Number(x.quantidade))) {
        const q = Number(e.quantidade);
        movimentar(id, q > 0 ? "saida" : "entrada", Math.abs(q), `Unificação de cadastro: saldo passou para "${m.descricao}"`, { unidade_id: e.unidade_id, referencia_tipo: "unificacao" });
        movimentar(p_principal, q > 0 ? "entrada" : "saida", Math.abs(q), `Unificação de cadastro: saldo veio de "${o.descricao}"`, { unidade_id: e.unidade_id, referencia_tipo: "unificacao" });
      }
      for (const t of ["pedido_itens", "os_itens", "pedido_compra_itens", "produto_fornecedor", "equipamentos", "ordens_producao", "transferencia_itens", "ordens_servico"]) {
        (db[t] ?? []).forEach((r) => { if (r.produto_id === id) r.produto_id = p_principal; });
      }
      (db.kit_componentes ?? []).forEach((r) => { if (r.kit_id === id) r.kit_id = p_principal; if (r.componente_id === id) r.componente_id = p_principal; });
      (db.produto_componentes ?? []).forEach((r) => { if (r.produto_id === id) r.produto_id = p_principal; if (r.componente_id === id) r.componente_id = p_principal; });
      const alt = [...String(m.codigos_alternativos ?? "").split(","), o.sku, o.codigo_barras, o.id_externo && `Tiny ${o.id_externo}`]
        .map((x) => String(x ?? "").trim()).filter((x) => x && x !== (m.sku ?? o.sku) && x !== (m.codigo_barras || o.codigo_barras));
      const skuOutro = o.sku;
      Object.assign(o, { ativo: false, no_catalogo: false, unificado_em: p_principal, unificado_quando: new Date().toISOString(), sku: null, slug: null,
        observacoes: [o.observacoes, `Unificado em "${m.descricao}" em ${new Date().toLocaleDateString("pt-BR")}: ${p_motivo || "cadastro repetido"}${skuOutro ? `. SKU era ${skuOutro}` : ""}`].filter(Boolean).join("\n") });
      Object.assign(m, { sku: m.sku ?? skuOutro, codigo_barras: m.codigo_barras || o.codigo_barras, foto_caminho: m.foto_caminho ?? o.foto_caminho, ncm: m.ncm ?? o.ncm,
        marca: m.marca ?? o.marca, modelo: m.modelo ?? o.modelo, peso_kg: m.peso_kg || o.peso_kg, no_catalogo: !!(m.no_catalogo || o.no_catalogo),
        codigos_alternativos: [...new Set(alt)].join(", ") || null });
      n++;
    }
    return { data: n, error: null };
  },
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
  clientes_virar_fornecedor: ({ p_ids, p_manter_cliente }) => {
    if (!temPapelDemo("vendas", "financeiro")) return erro("sem permissão para esta ação");
    const r = { movidos: 0, mantidos: 0, fornecedores_criados: 0, anexos: 0, fornecedor_id: null as string | null };
    for (const id of p_ids ?? []) {
      const c = db.clientes.find((x) => x.id === id);
      if (!c) continue;
      const doc = String(c.cpf_cnpj ?? "").replace(/\D/g, "");
      let f = db.fornecedores.find((x) => (doc ? String(x.cnpj ?? "").replace(/\D/g, "") === doc : !x.cnpj && x.nome.trim().toLowerCase() === c.nome.trim().toLowerCase()));
      if (!f) {
        f = { id: uid(), nome: c.nome, nome_fantasia: c.nome_fantasia ?? null, cnpj: doc || null, inscricao_estadual: c.inscricao_estadual ?? null, email: c.email ?? null,
          telefone: c.telefone ?? null, whatsapp: c.whatsapp ?? null, cep: c.cep ?? null, logradouro: c.logradouro ?? null, numero: c.numero ?? null, complemento: c.complemento ?? null,
          bairro: c.bairro ?? null, municipio: c.municipio ?? null, uf: c.uf ?? null, observacoes: c.observacoes ?? null, tags: [], created_at: new Date().toISOString() };
        db.fornecedores.push(f);
        r.fornecedores_criados++;
      }
      if (p_manter_cliente) { c.tags = [...new Set([...(c.tags ?? []), "fornecedor"])].sort(); r.mantidos++; }
      else {
        for (const d of db.documentos ?? []) if (d.entidade === "cliente" && d.entidade_id === c.id) { d.entidade = "fornecedor"; d.entidade_id = f.id; r.anexos++; }
        db.clientes = db.clientes.filter((x) => x.id !== c.id);
        r.movidos++;
      }
      r.fornecedor_id = f.id;
    }
    return { data: r, error: null };
  },
  termo_ficha_cadastral: () => ({ data: termoDemo(), error: null }),
  ficha_cadastral_link: ({ p_cliente }) => {
    if (!temPapelDemo("vendas", "financeiro", "tecnico")) return erro("sem permissão para esta ação");
    db.clientes_assinaturas ??= [];
    let a = db.clientes_assinaturas.find((x) => x.cliente_id === p_cliente && x.canal === "link" && x.status === "pendente" && Date.parse(x.expira_em) > Date.now() + 2 * 864e5);
    if (!a) {
      a = { id: uid(), cliente_id: p_cliente, token: crypto.randomUUID(), canal: "link", status: "pendente", termo: termoDemo(), dados: null, alteracoes: null, nome: null, cpf: null,
        assinatura_png: null, ip: null, user_agent: null, hash: null, visualizado_em: null, assinado_em: null, expira_em: new Date(Date.now() + 15 * 864e5).toISOString(), created_at: new Date().toISOString() };
      db.clientes_assinaturas.push(a);
    }
    return { data: { id: a.id, token: a.token, expira_em: a.expira_em }, error: null };
  },
  ficha_cadastral_assinar_presencial: ({ p_cliente, p_nome, p_cpf, p_png, p_user_agent }) => {
    if (!temPapelDemo("vendas", "financeiro", "tecnico")) return erro("sem permissão para esta ação");
    const falha = assinanteDemo(p_nome, p_cpf, p_png);
    if (falha) return erro(falha);
    const c = db.clientes.find((x) => x.id === p_cliente);
    if (!c) return erro("cliente não encontrado");
    const agora = new Date().toISOString();
    const a: Row = { id: uid(), cliente_id: p_cliente, token: crypto.randomUUID(), canal: "presencial", status: "assinado", termo: termoDemo(), dados: fichaClienteDemo(c), alteracoes: null,
      nome: String(p_nome).trim(), cpf: String(p_cpf).replace(/\D/g, ""), assinatura_png: p_png, ip: "189.6.20.15", user_agent: p_user_agent ?? null, visualizado_em: null, assinado_em: agora, expira_em: agora, created_at: agora };
    a.hash = hashDemo(a);
    (db.clientes_assinaturas ??= []).push(a);
    if (!c.status_crm || ["lead", "negociacao"].includes(c.status_crm)) c.status_crm = "cliente";
    return { data: { id: a.id, hash: a.hash, assinado_em: a.assinado_em }, error: null };
  },
  ficha_cadastral_cancelar: ({ p_id }) => {
    const a = (db.clientes_assinaturas ?? []).find((x) => x.id === p_id && x.status === "pendente");
    if (!a) return erro("só dá para cancelar um link que ainda não foi assinado");
    Object.assign(a, { status: "cancelado", cancelado_em: new Date().toISOString() });
    return { data: null, error: null };
  },
  ficha_cadastral_conferir: ({ p_id }) => {
    const a = (db.clientes_assinaturas ?? []).find((x) => x.id === p_id);
    return { data: !!a?.hash && a.hash === hashDemo(a), error: null };
  },
  ficha_cadastral_publica: ({ p_token }) => {
    const a = (db.clientes_assinaturas ?? []).find((x) => x.token === p_token && x.canal === "link");
    if (!a) return { data: null, error: null };
    const status = a.status === "pendente" && Date.parse(a.expira_em) < Date.now() ? "vencido" : a.status;
    if (status === "pendente") a.visualizado_em ??= new Date().toISOString();
    const cfg = db.configuracoes[0];
    const c = db.clientes.find((x) => x.id === a.cliente_id);
    return { data: { status, termo: a.termo, dados: status === "pendente" ? fichaClienteDemo(c ?? {}) : status === "assinado" ? a.dados : null, nome: a.nome, assinado_em: a.assinado_em,
      hash: a.hash, expira_em: a.expira_em, empresa: { nome: cfg.nome_fantasia || cfg.razao_social, razao_social: cfg.razao_social, cnpj: cfg.cnpj, whatsapp: cfg.whatsapp, telefone: cfg.telefone, email: cfg.email } }, error: null };
  },
  ficha_cadastral_assinar: ({ p_token, p_nome, p_cpf, p_png, p_dados, p_user_agent }) => {
    const a = (db.clientes_assinaturas ?? []).find((x) => x.token === p_token && x.canal === "link");
    if (!a) return erro("link não encontrado");
    if (a.status === "assinado") return erro("esta ficha já foi assinada");
    if (a.status !== "pendente") return erro("este link foi cancelado: peça um novo");
    if (Date.parse(a.expira_em) < Date.now()) return erro("link vencido: peça um novo");
    const falha = assinanteDemo(p_nome, p_cpf, p_png);
    if (falha) return erro(falha);
    const c = db.clientes.find((x) => x.id === a.cliente_id)!;
    const alt: Row = {};
    for (const k of ["email", "email_nfe", "telefone", "whatsapp", "data_nascimento", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf"]) {
      if (!p_dados || !(k in p_dados)) continue;
      let v: string | null = String(p_dados[k] ?? "").trim().slice(0, 200) || null;
      if (v && ["telefone", "whatsapp", "cep"].includes(k)) v = v.replace(/\D/g, "") || null;
      if (v && ["email", "email_nfe"].includes(k)) { v = v.toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return erro(`e-mail inválido: ${v}`); }
      if (v && k === "uf") v = v.slice(0, 2).toUpperCase();
      if ((c[k] ?? null) !== v) alt[k] = { antes: c[k] ?? null, depois: v };
    }
    for (const [k, v] of Object.entries(alt)) c[k] = (v as Row).depois;
    const agora = new Date().toISOString();
    Object.assign(a, { status: "assinado", nome: String(p_nome).trim(), cpf: String(p_cpf).replace(/\D/g, ""), assinatura_png: p_png, ip: "200.150.12.7", user_agent: p_user_agent ?? null,
      assinado_em: agora, dados: fichaClienteDemo(c), alteracoes: Object.keys(alt).length ? alt : null });
    a.hash = hashDemo(a);
    if (!c.status_crm || ["lead", "negociacao"].includes(c.status_crm)) c.status_crm = "cliente";
    notificarDemo("outro", "Ficha cadastral assinada", [c.nome_fantasia || c.nome, Object.keys(alt).length ? `atualizou ${Object.keys(alt).sort().join(", ")}` : ""].filter(Boolean).join(" · "), "/clientes", ["vendas", "financeiro"]);
    return { data: { hash: a.hash, assinado_em: a.assinado_em, ip: a.ip, dados: a.dados }, error: null };
  },
  unificar_clientes: ({ p_manter, p_outros }) => {
    const m = db.clientes.find((x) => x.id === p_manter);
    if (!m) return { data: null, error: { message: "cliente principal não encontrado" } };
    let n = 0;
    for (const id of p_outros) {
      const o = db.clientes.find((x) => x.id === id);
      if (!o || id === p_manter) continue;
      for (const t of ["pedidos", "contas_receber", "ordens_servico", "equipamentos", "contatos_cliente", "notas_fiscais", "emails", "clientes_pessoas", "clientes_assinaturas"]) {
        for (const r of ((db as any)[t] ?? [])) if (r.cliente_id === id) r.cliente_id = p_manter;
      }
      // nada se perde: o que só o outro tinha completa; o que é diferente fica guardado (endereço 2/3, pessoa de contato) com o aviso
      const completou: string[] = [], trouxe: string[] = [], fora: string[] = [];
      const rotulos: Record<string, string> = { cpf_cnpj: "CPF/CNPJ", email: "e-mail", whatsapp: "WhatsApp", telefone: "telefone", logradouro: "endereço", inscricao_estadual: "inscrição estadual", nome_fantasia: "nome fantasia" };
      const semEndereco = !m.logradouro && !m.cep;
      for (const k of ["nome_fantasia", "cpf_cnpj", "inscricao_estadual", "email", "telefone", "whatsapp", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf",
        "telefone_adicional", "website", "email_nfe", "contato_observacoes", "inscricao_municipal", "inscricao_suframa", "regime_tributario", "data_nascimento", "status_crm",
        "vendedor_id", "forma_pagamento_id", "condicao_pagamento", "desconto_padrao", "limite_credito", "endereco_etiqueta"]) {
        const endereco = ["cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "endereco_etiqueta"].includes(k);
        if (!m[k] && o[k] && (!endereco || semEndereco)) { m[k] = o[k]; if (rotulos[k]) completou.push(rotulos[k]); }
      }
      const chave = (e: any) => `${String(e.cep ?? "").replace(/\D/g, "")}|${String(e.numero ?? "").replace(/\s/g, "").toLowerCase()}|${String(e.logradouro ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
      const texto = (e: any) => [[e.logradouro, e.numero].filter(Boolean).join(", "), e.bairro, [e.municipio, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" - ");
      m.enderecos_extras = m.enderecos_extras ?? [];
      for (const e of [{ etiqueta: o.endereco_etiqueta, cep: o.cep, logradouro: o.logradouro, numero: o.numero, complemento: o.complemento, bairro: o.bairro, municipio: o.municipio, uf: o.uf }, ...(o.enderecos_extras ?? [])]) {
        if (!e.logradouro && !e.cep) continue;
        if (chave(e) === chave(m) || m.enderecos_extras.some((x: any) => chave(x) === chave(e))) continue;
        if (m.enderecos_extras.length < 2) {
          m.enderecos_extras = [...m.enderecos_extras, { ...e, origem: `cadastro nº ${o.codigo ?? "?"}` }];
          trouxe.push(`endereço ${texto(e)} (agora é o endereço ${m.enderecos_extras.length + 1})`);
        } else fora.push(`endereço ${texto(e)} (não coube: o cadastro já tem 3 endereços)`);
      }
      const emailNovo = o.email && ![m.email, m.email_nfe].map((x) => String(x ?? "").toLowerCase()).includes(String(o.email).toLowerCase()) ? o.email : null;
      const fim = (t: any) => String(t ?? "").replace(/\D/g, "").slice(-8);
      const telNovo = [o.whatsapp, o.telefone].find((t) => fim(t).length === 8 && ![m.whatsapp, m.telefone, m.telefone_adicional].map(fim).includes(fim(t))) ?? null;
      if (emailNovo || telNovo || (o.nome && ![m.nome, m.nome_fantasia].map((x) => String(x ?? "").toLowerCase()).includes(String(o.nome).toLowerCase()))) {
        (db as any).clientes_pessoas = [...((db as any).clientes_pessoas ?? []), { id: uid(), cliente_id: p_manter, nome: o.nome ?? "Cadastro unificado", setor: `Cadastro unificado nº ${o.codigo ?? "?"}`, email: emailNovo, telefone: telNovo, ramal: null, ativo: true, created_at: new Date().toISOString() }];
        trouxe.push(`pessoa de contato ${[o.nome ?? "sem nome", emailNovo, telNovo].filter(Boolean).join(" · ")}`);
      }
      const doc = String(o.cpf_cnpj ?? "").replace(/\D/g, "");
      if ((doc.length === 11 || doc.length === 14) && doc !== String(m.cpf_cnpj ?? "").replace(/\D/g, "")) trouxe.push(`${doc.length === 11 ? "CPF" : "CNPJ"} ${doc}`);
      m.unificacoes = [...(m.unificacoes ?? []), { id: o.id, codigo: o.codigo, nome: o.nome, doc: doc || undefined, em: new Date().toISOString(), por: "Demonstração",
        email: o.email ?? undefined, whatsapp: o.whatsapp ?? undefined, telefone: o.telefone ?? undefined, endereco: texto(o) || undefined,
        completou: completou.length ? completou : undefined, trouxe: trouxe.length ? trouxe : undefined, fora: fora.length ? fora : undefined }];
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
          pix_chave: un.pix_chave ?? null, pix_nome: un.pix_nome || un.razao_social || un.nome, pix_cidade: un.pix_cidade || un.municipio,
          link: (["pix", "cartao"].includes(r.forma_pagamento) || r.vencimento < dias(0)) && !!(r.unidade_id ? un.infinitepay_tag : db.unidades.find((x) => x.matriz)?.infinitepay_tag) };
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
    if (p_tabela === "contas_pagar" && semAprovacaoDemo(c)) return erro(`"${c.descricao}" ainda não foi aprovada: o pagamento só pode ser registrado depois da aprovação (Financeiro → Aprovações).`);
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
  revisar_contas: ({ p_tabela, p_ids, p_acao, p_comentario }) => revisarDemo(p_tabela, p_ids ?? [], p_acao, p_comentario ?? null),
  // "este boleto já foi pago?" (no sistema real: boleto_conferir)
  boleto_conferir: ({ p_linha, p_valor, p_vencimento, p_conta }) => {
    const ref = Date.parse(p_vencimento ?? dias(0));
    const dist = (d: string) => Math.round((Date.parse(d) - ref) / 864e5);
    const contas = p_linha ? db.contas_pagar.filter((c) => c.linha_digitavel === p_linha && c.id !== p_conta && c.status !== "cancelado" && (!p_conta || c.conta_origem_id !== p_conta))
      .map((c) => ({ id: c.id, descricao: c.descricao, status: c.status, valor: c.valor, valor_pago: c.valor_pago ?? null, data_pagamento: c.data_pagamento ?? null, vencimento: c.vencimento })) : [];
    const v = Number(p_valor) || 0;
    const extrato = v > 0 ? db.extrato_lancamentos
      .filter((e) => Number(e.valor) < 0 && ((-e.valor >= v && -e.valor <= Math.round(v * 115) / 100) || (p_conta && e.conta_pagar_id === p_conta)) && dist(e.data) >= -15 && dist(e.data) <= 60)
      .sort((a, b) => Math.abs(dist(a.data)) - Math.abs(dist(b.data))).slice(0, 10)
      .map((e) => ({ id: e.id, data: e.data, valor: -Number(e.valor), descricao: e.descricao, banco: db.contas_bancarias.find((b) => b.id === e.conta_bancaria_id)?.nome ?? null, conta_pagar_id: e.conta_pagar_id ?? null })) : [];
    return { data: { contas, extrato }, error: null };
  },
  // EANs que os fornecedores mandam nas notas, ligados ao produto pelo código do fornecedor (no sistema real: eans_das_notas)
  eans_das_notas: () => ({ data: [
    { produto_id: "p5", ean: "7898730745918", fornecedor: "Vedações Sul Ltda", codigo_fornecedor: "VED-CIL-01", descricao_nota: "KIT VEDACAO CILINDRO SOFT", ultima_nota: quando(-12), notas: 4 },
    { produto_id: "p8", ean: "7896504123450", fornecedor: "Refrigeração Distribuidora", codigo_fornecedor: "CMP-1HP-404", descricao_nota: "COMPRESSOR HERMETICO 1HP R404A", ultima_nota: quando(-30), notas: 2 },
  ], error: null }),
  contador_conferir: ({ p_tabela, p_ids, p_acao, p_comentario }) => {
    const eu = db.usuarios_erp.find((u) => u.user_id === sessao?.user.id);
    if (eu?.papel !== "contador") return erro("só o contador valida os lançamentos");
    const com = String(p_comentario ?? "").trim();
    if (p_acao === "duvida" && com.length < 5) return erro("escreva a dúvida");
    for (const id of p_ids ?? []) {
      const c = db[p_tabela].find((x) => x.id === id);
      if (!c) return erro("lançamento não encontrado");
      if (p_acao === "validar" && !["aprovado", "historico"].includes(c.revisao)) return erro(`"${c.descricao}" ainda não foi aprovada internamente`);
      atualizarDemo(p_tabela, c, { contador_status: p_acao === "validar" ? "validado" : p_acao === "duvida" ? "duvida" : null, contador_em: new Date().toISOString(),
        contador_nome: eu.nome, ...(p_acao === "duvida" ? { contador_comentario: com } : {}) });
      db.revisoes_contas.push({ id: uid(), tabela: p_tabela, conta_id: id, acao: p_acao === "validar" ? "validou" : p_acao === "duvida" ? "perguntou" : "desfez a validação",
        etapa: "contador", comentario: com || null, usuario_nome: eu.nome, created_at: new Date().toISOString() });
      if (p_acao === "duvida") db.contador_mensagens.push({ id: uid(), unidade_id: c.unidade_id ?? U_SC, competencia: String(c.data_pagamento ?? c.vencimento).slice(0, 7), autor: eu.user_id,
        autor_nome: eu.nome, texto: `Dúvida sobre "${c.descricao}": ${com}`, resolvida: false, conta_tabela: p_tabela, conta_id: id, created_at: new Date().toISOString() });
    }
    return { data: (p_ids ?? []).length, error: null };
  },
  programar_pagamento: ({ p_ids, p_acao, p_data, p_motivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!["pagar", "agendar", "nao_pagar", "limpar"].includes(p_acao)) return erro("ação inválida");
    const dia = hojeISO();
    if (p_acao === "agendar" && !p_data) return erro("escolha o dia do pagamento");
    if (p_acao === "agendar" && p_data < dia) return erro("o dia do pagamento não pode ser no passado");
    const motivo = String(p_motivo ?? "").trim();
    if (p_acao === "nao_pagar" && motivo.length < 3) return erro("diga por que não vai pagar (fica no histórico)");
    const nome = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id)?.nome ?? null;
    const golpe = (p_acao === "pagar" || p_acao === "agendar") && db.contas_pagar.find((x) => (p_ids ?? []).includes(x.id) && x.status === "aberto" && bloqueioDemo(x.fornecedor_id));
    const semAprov = (p_acao === "pagar" || p_acao === "agendar") && db.contas_pagar.find((x) => (p_ids ?? []).includes(x.id) && semAprovacaoDemo(x));
    if (semAprov) return erro(`"${semAprov.descricao}" ainda não foi aprovada: só dá para pagar ou agendar depois da aprovação (Financeiro → Aprovações).`);
    if (golpe) return erro(`"${golpe.descricao}" é de um fornecedor marcado como golpe (${bloqueioDemo(golpe.fornecedor_id)}): não pode ser aprovada nem agendada. Se for engano, o administrador tira o bloqueio no cadastro do fornecedor.`);
    let n = 0;
    for (const c of db.contas_pagar.filter((x) => (p_ids ?? []).includes(x.id) && x.status === "aberto")) {
      const quando = p_acao === "pagar" ? (c.vencimento > dia ? c.vencimento : dia) : p_acao === "agendar" ? p_data : null;
      const limpar = p_acao === "limpar";
      atualizarDemo("contas_pagar", c, {
        decisao: limpar ? null : p_acao === "agendar" ? "agendado" : p_acao, pagar_em: quando, decisao_motivo: limpar ? null : motivo || null,
        decisao_por_nome: limpar ? null : nome, decisao_em: limpar ? null : new Date().toISOString(),
      }, p_acao === "pagar" ? `Aprovada para pagar em ${quando}` : p_acao === "agendar" ? `Agendada para pagar em ${quando}` : p_acao === "nao_pagar" ? `Não pagar: ${motivo}` : "Decisão de pagamento desfeita");
      n++;
    }
    return { data: n, error: null };
  },
  pagar_em_lote: ({ p_ids, p_data, p_conta_bancaria, p_incluir_nao_pagar }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!p_data) return erro("informe a data do pagamento");
    const banco = p_conta_bancaria ? db.contas_bancarias.find((b) => b.id === p_conta_bancaria && b.ativo) : null;
    if (p_conta_bancaria && !banco) return erro("conta bancária não encontrada");
    const contas = db.contas_pagar.filter((x) => (p_ids ?? []).includes(x.id));
    const ok = contas.filter((c) => c.status === "aberto" && (p_incluir_nao_pagar || c.decisao !== "nao_pagar") && !bloqueioDemo(c.fornecedor_id));
    const semAprov = ok.find(semAprovacaoDemo);
    if (semAprov) return erro(`"${semAprov.descricao}" ainda não foi aprovada: o pagamento só pode ser registrado depois da aprovação (Financeiro → Aprovações).`);
    const fora = ok.find((c) => banco && c.unidade_id && c.unidade_id !== banco.unidade_id);
    if (fora) return erro(`"${fora.descricao}" é de outra unidade que a conta bancária ${banco?.nome}: pague essa num lote separado`);
    for (const c of ok) atualizarDemo("contas_pagar", c, { status: "pago", data_pagamento: p_data, valor_pago: Number(c.valor), conta_bancaria_id: p_conta_bancaria ?? null });
    return { data: { pagas: ok.length, total: r2(ok.reduce((s2, c) => s2 + Number(c.valor), 0)), puladas: contas.length - ok.length }, error: null };
  },
  agrupar_transportadoras: ({ p_marca, p_filiais, p_nova_marca }) => {
    if (!temPapelDemo("vendas", "financeiro")) return erro("sem permissão para esta ação");
    let marca = p_marca;
    if (!marca) {
      if (String(p_nova_marca ?? "").trim().length < 2) return erro("informe o nome da marca");
      const tipo = db.transportadoras.find((t) => (p_filiais ?? []).includes(t.id))?.tipo ?? "transportadora";
      const n = { id: uid(), nome: String(p_nova_marca).trim(), tipo, ativo: true, codigo: proximoCodigo("transportadoras"), created_at: quando(0) };
      db.transportadoras.push(n);
      marca = n.id;
    } else if (db.transportadoras.find((t) => t.id === marca)?.matriz_id) return erro("a marca escolhida não existe ou já é filial de outra");
    for (const f of p_filiais ?? []) {
      if (f === marca) continue;
      for (const t of db.transportadoras.filter((x) => x.matriz_id === f)) t.matriz_id = marca;
      const t = db.transportadoras.find((x) => x.id === f);
      if (t) atualizarDemo("transportadoras", t, { matriz_id: marca });
    }
    return { data: marca, error: null };
  },
  unificar_transportadoras: ({ p_principal, p_outros, p_motivo }) => {
    if (!temPapelDemo("vendas", "financeiro")) return erro("sem permissão para esta ação");
    const m = db.transportadoras.find((t) => t.id === p_principal);
    if (!m || !m.ativo) return erro("o principal está inativo: escolha um ativo");
    let n = 0;
    for (const id of p_outros ?? []) {
      const o = db.transportadoras.find((t) => t.id === id);
      if (!o || id === p_principal || o.unificado_em) continue;
      for (const tab of ["pedidos", "envios", "envio_cotacoes", "cotacoes_frete", "expedicoes"]) for (const r of db[tab] ?? []) if (r.transportadora_id === id) r.transportadora_id = p_principal;
      for (const t of db.transportadoras.filter((x) => x.matriz_id === id)) t.matriz_id = m.matriz_id ?? m.id;
      for (const k of ["cnpj", "telefone", "email", "whatsapp", "municipio", "uf", "logradouro", "cep"]) if (!m[k] && o[k]) m[k] = o[k];
      atualizarDemo("transportadoras", o, { ativo: false, matriz_id: null, unificado_em: p_principal, observacoes: [o.observacoes, `Unificado em "${m.nome}": ${p_motivo ?? "cadastro repetido"}`].filter(Boolean).join("\n") });
      n++;
    }
    return { data: n, error: null };
  },
  agrupar_fornecedores: ({ p_marca, p_filiais, p_nova_marca }) => {
    if (!temPapelDemo("financeiro")) return erro("sem permissão para esta ação");
    let marca = p_marca;
    if (!marca) {
      if (String(p_nova_marca ?? "").trim().length < 2) return erro("informe o nome da marca");
      const n = { id: uid(), nome: String(p_nova_marca).trim(), nome_fantasia: String(p_nova_marca).trim(), codigo: proximoCodigo("fornecedores"), created_at: quando(0) };
      db.fornecedores.push(n);
      marca = n.id;
    } else if (db.fornecedores.find((t) => t.id === marca)?.matriz_id) return erro("a marca escolhida já é filial de outra");
    for (const f of p_filiais ?? []) {
      if (f === marca) continue;
      for (const t of db.fornecedores.filter((x) => x.matriz_id === f)) t.matriz_id = marca;
      const t = db.fornecedores.find((x) => x.id === f);
      if (t && !t.unificado_em) atualizarDemo("fornecedores", t, { matriz_id: marca });
    }
    return { data: marca, error: null };
  },
  unificar_fornecedores: ({ p_principal, p_outros, p_motivo }) => {
    if (!temPapelDemo("financeiro")) return erro("sem permissão para esta ação");
    const m = db.fornecedores.find((t) => t.id === p_principal);
    if (!m || m.unificado_em) return erro("o principal já foi unificado em outro: escolha outro");
    let n = 0;
    for (const id of p_outros ?? []) {
      const o = db.fornecedores.find((t) => t.id === id);
      if (!o || id === p_principal || o.unificado_em) continue;
      for (const tab of ["contas_pagar", "nfe_recebidas", "pedidos_compra", "cotacao_fornecedores", "contas_recorrentes"]) for (const r of db[tab] ?? []) if (r.fornecedor_id === id) r.fornecedor_id = p_principal;
      for (const r of db.produtos ?? []) if (r.fornecedor_padrao_id === id) r.fornecedor_padrao_id = p_principal;
      for (const t of db.fornecedores.filter((x) => x.matriz_id === id)) t.matriz_id = m.matriz_id ?? m.id;
      for (const k of ["cnpj", "telefone", "email", "whatsapp", "municipio", "uf", "logradouro", "cep"]) if (!m[k] && o[k]) m[k] = o[k];
      atualizarDemo("fornecedores", o, { matriz_id: null, unificado_em: p_principal, unificado_quando: new Date().toISOString(), observacoes: [o.observacoes, `Unificado em "${m.nome_fantasia || m.nome}": ${p_motivo ?? "cadastro repetido"}`].filter(Boolean).join("\n") });
      n++;
    }
    return { data: n, error: null };
  },
  descartar_cobranca_link: ({ p_id }) => {
    const l = (db.cobrancas_link ?? []).find((x) => x.id === p_id && ["aberto", "erro"].includes(x.status));
    if (l) l.status = "descartado";
    return { data: null, error: null };
  },
  conferir_transportadora: ({ p_id }) => {
    const t = db.transportadoras.find((x) => x.id === p_id);
    if (t) atualizarDemo("transportadoras", t, { conferido_em: new Date().toISOString(), conferido_por: db.usuarios_erp.find((x) => x.user_id === sessao?.user.id)?.nome ?? null });
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
  emails_da_contabilidade: ({ p_limite }) => {
    const ativos = (db.contabilidade_contatos ?? []).filter((c) => c.ativo && c.email);
    const dominios = new Set(ativos.map((c) => String(c.email).split("@")[1]?.toLowerCase()));
    const linhas = db.emails.filter((e) => !e.arquivado).map((e) => {
      const c = ativos.find((x) => String(x.email).toLowerCase() === String(e.de_email ?? "").toLowerCase());
      if (!c && !dominios.has(String(e.de_email ?? "").split("@")[1]?.toLowerCase())) return null;
      return { id: e.id, conta_id: e.conta_id, data: e.data, de_nome: e.de_nome, de_email: e.de_email, assunto: e.assunto, previa: e.previa, anexos: e.anexos, lido: e.lido, setor: c?.setor ?? "escritorio", contato: c?.nome ?? null };
    }).filter(Boolean).sort((a, b) => String(b!.data).localeCompare(String(a!.data)));
    return { data: linhas.slice(0, Number(p_limite) || 50), error: null };
  },
  ctes_sefaz_situacao: () => ({ data: { em: quando(0), novos: 0, atualizados: 0, completos: 0, erro: null, pendentes_xml: 0,
    da_sefaz: (db.ctes ?? []).filter((c) => c.chave).length }, error: null }),
  importar_ctes: ({ p_transportadora, p_linhas, p_arquivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const dig = (x: unknown) => String(x ?? "").replace(/\D/g, "");
    const raiz = dig(db.transportadoras.find((t) => t.id === p_transportadora)?.cnpj).slice(0, 8) || null;
    const unid = (c: string) => db.unidades.find((u) => dig(u.cnpj) === c)?.id ?? null;
    let novos = 0, atualizados = 0, ignorados = 0;
    db.ctes ??= [];
    for (const l of p_linhas ?? []) {
      if (!String(l.numero ?? "").trim() || !l.emissao) { ignorados++; continue; }
      const rem = dig(l.remetente_cnpj), dest = dig(l.destinatario_cnpj), ur = unid(rem), ud = unid(dest);
      const sentido = ur && ud ? "transferencia" : ud ? "entrada" : ur ? "saida" : "outro";
      const mf_paga = (l.frete === "pago" && !!ur) || (l.frete === "a_pagar" && !!ud);
      const ja = db.ctes.find((c) => (c.transportadora_raiz ?? "") === (raiz ?? "") && (c.ag_origem ?? "") === (l.ag_origem ?? "") && c.numero === String(l.numero).trim());
      if (ja) { Object.assign(ja, { ocorrencia: l.ocorrencia, ocorrencia_em: l.ocorrencia_em, prev_entrega: l.prev_entrega }); atualizados++; continue; }
      db.ctes.push({ ...l, id: uid(), numero: String(l.numero).trim(), transportadora_id: p_transportadora, transportadora_raiz: raiz, remetente_cnpj: rem, destinatario_cnpj: dest,
        sentido, mf_paga, unidade_id: l.frete === "pago" ? ur ?? ud : ud ?? ur, nfe_recebida_id: null, nota_fiscal_id: null, fatura_id: null, origem: "planilha", arquivo: p_arquivo });
      novos++;
    }
    return { data: { novos, atualizados, ignorados }, error: null };
  },
  registrar_baixa_estoque: ({ p_unidade, p_motivo, p_descricao, p_itens, p_evidencia, p_fornecedor, p_equipamento }) => {
    if (!podeFinanceiro()) return erro("sem permissão para dar baixa no estoque");
    if (String(p_descricao ?? "").trim().length < 5) return erro("descreva o que aconteceu (pelo menos 5 letras)");
    if (["obsolescencia", "furto_extravio"].includes(p_motivo) && String(p_evidencia ?? "").trim().length < 3)
      return erro(p_motivo === "furto_extravio" ? "informe o número do boletim de ocorrência (sem ele a perda não é dedutível)" : "informe o laudo (e fotos) da obsolescência ou deterioração (sem ele a perda pode ser glosada)");
    if (p_motivo === "defeito_fornecedor" && !p_fornecedor) return erro("escolha o fornecedor para a NF de devolução");
    if (p_motivo === "manutencao_fabrica" && String(p_equipamento ?? "").trim().length < 2) return erro("informe a máquina da fábrica em que as peças foram aplicadas");
    db.baixas_estoque ??= [];
    const numero = db.baixas_estoque.reduce((m: number, b: Row) => Math.max(m, b.numero), 0) + 1;
    let valor = 0;
    for (const i of p_itens ?? []) {
      const p = db.produtos.find((x) => x.id === i.produto_id);
      const qtd = Number(i.quantidade);
      if (!p || !(qtd > 0)) return erro("item inválido");
      if (p_motivo === "sucata" && !(Number(i.peso_kg) > 0)) return erro(`pese a sucata: informe o peso (kg) de ${p.descricao}`);
      if (saldoUn(p.id, p_unidade) < qtd) return erro(`saldo insuficiente de ${p.descricao} nesta unidade`);
      const id = uid();
      const v = r2(Number(p.preco_custo ?? 0) * qtd);
      db.baixas_estoque.push({ id, numero, unidade_id: p_unidade, motivo: p_motivo, produto_id: p.id, quantidade: qtd, custo_unitario: p.preco_custo ?? 0, valor: v,
        peso_kg: Number(i.peso_kg) || null, equipamento: p_equipamento || null, fornecedor_id: p_fornecedor || null, nota_devolucao_id: null,
        evidencia: p_evidencia || null, descricao: String(p_descricao).trim(), situacao: "registrada", cancelada_motivo: null, criado_por_nome: "Você", created_at: quando(0) });
      movimentar(p.id, "saida", qtd, `Baixa #${numero}: ${p_descricao}`, { referencia_tipo: "baixa", referencia_id: id, unidade_id: p_unidade });
      valor += v;
    }
    return { data: { numero, itens: (p_itens ?? []).length, valor: r2(valor) }, error: null };
  },
  documentar_baixa_estoque: ({ p_id, p_evidencia, p_nota_devolucao, p_equipamento, p_peso_kg, p_comprovada }) => {
    if (!podeFinanceiro()) return erro("sem permissão");
    const b = (db.baixas_estoque ?? []).find((x: Row) => x.id === p_id);
    if (!b) return erro("baixa não encontrada");
    Object.assign(b, { evidencia: p_evidencia || b.evidencia, nota_devolucao_id: p_nota_devolucao || b.nota_devolucao_id, equipamento: p_equipamento || b.equipamento,
      peso_kg: Number(p_peso_kg) > 0 ? Number(p_peso_kg) : b.peso_kg, situacao: p_comprovada ? "comprovada" : b.situacao });
    return { data: null, error: null };
  },
  cancelar_baixa_estoque: ({ p_numero, p_motivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão");
    if (String(p_motivo ?? "").trim().length < 5) return erro("informe o motivo do cancelamento");
    const lista = (db.baixas_estoque ?? []).filter((x: Row) => x.numero === p_numero && x.situacao !== "cancelada");
    for (const b of lista) {
      movimentar(b.produto_id, "entrada", b.quantidade, `Baixa #${b.numero} cancelada: ${p_motivo}`, { referencia_tipo: "baixa", referencia_id: b.id, unidade_id: b.unidade_id });
      Object.assign(b, { situacao: "cancelada", cancelada_motivo: p_motivo });
    }
    return lista.length ? { data: lista.length, error: null } : erro("baixa não encontrada ou já cancelada");
  },
  importar_nfse: ({ p_itens }) => {
    if (!podeFinanceiro()) return erro("sem permissão para importar notas de serviço");
    const dig = (x: unknown) => String(x ?? "").replace(/\D/g, "");
    const unid = (c: string) => (c ? db.unidades.find((u) => dig(u.cnpj) === c)?.id ?? null : null);
    let novas = 0, atualizadas = 0, ignoradas = 0;
    const motivos: string[] = [];
    db.nfse_importadas ??= [];
    for (const i of p_itens ?? []) {
      const prest = dig(i.prestador_doc), toma = dig(i.tomador_doc);
      let unidade = unid(prest), tipo = unidade ? "emitida" : null;
      if (!unidade && unid(toma)) { unidade = unid(toma); tipo = "tomada"; }
      if (!unidade && i.origem === "tiny") { unidade = i.unidade_id; tipo = "emitida"; }
      const numero = String(i.numero ?? "").replace(/^0+/, ""), rps = String(i.rps ?? "").replace(/^0+/, "");
      if (!unidade) { ignoradas++; motivos.push(`${i.arquivo ?? "nota"}: nem o prestador nem o tomador é uma unidade da MF`); continue; }
      if (!(Number(i.valor_servicos) > 0) || !i.data_emissao || !(numero || rps)) { ignoradas++; motivos.push(`${i.arquivo ?? "nota"}: sem número, data ou valor`); continue; }
      const chave = `${tipo}:${tipo === "emitida" ? unidade : prest}:${numero ? "n" + numero : "r" + rps}`;
      const ja = db.nfse_importadas.find((n: Row) => n.chave === chave || (rps && n.tipo === tipo && n.unidade_id === unidade && n.rps === rps));
      const dados = { ...i, tipo, unidade_id: unidade, chave, numero: numero || ja?.numero || null, rps: rps || ja?.rps || null, prestador_doc: prest || null,
        tomador_doc: toma || null, valor_servicos: Number(i.valor_servicos), iss_retido: !!i.iss_retido,
        situacao: i.situacao === "cancelada" ? "cancelada" : numero || ja?.numero ? "normal" : "sem_numero" };
      if (ja) { Object.assign(ja, dados); atualizadas++; } else { db.nfse_importadas.push({ id: uid(), created_at: quando(0), cliente_id: null, fornecedor_id: null, ...dados }); novas++; }
    }
    return { data: { novas, atualizadas, ignoradas, motivos }, error: null };
  },
  registrar_servico_tomado: ({ p }) => {
    if (!podeFinanceiro()) return erro("sem permissão para lançar serviços tomados");
    db.nfse_importadas ??= [];
    const atual = p?.id ? db.nfse_importadas.find((n: Row) => n.id === p.id && n.tipo === "tomada") : null;
    if (p?.id && !atual) return erro("serviço tomado não encontrado");
    if (atual && atual.origem !== "manual") return erro("só dá para corrigir o serviço lançado na tela; a nota do XML vem do arquivo");
    if (atual?.conta_pagar_id && db.contas_pagar.some((c) => c.id === atual.conta_pagar_id && c.status !== "cancelado")) return erro("este serviço já tem conta a pagar: cancele a conta antes de corrigir");
    if (atual && p.cancelar === "true") { atual.situacao = "cancelada"; return { data: atual.id, error: null }; }
    const unidade = db.unidades.find((u) => u.id === p.unidade_id);
    if (!unidade) return erro("escolha a unidade da MF que tomou o serviço");
    const forn = db.fornecedores.find((f) => f.id === p.fornecedor_id);
    if (!forn) return erro("escolha o fornecedor (prestador do serviço)");
    const valor = Number(p.valor_servicos);
    if (!(valor > 0)) return erro("informe o valor do serviço");
    if (String(p.discriminacao ?? "").trim().length < 3) return erro("descreva o serviço tomado");
    const numero = String(p.numero ?? "").trim().replace(/^0+/, "") || null;
    const n = (k: string) => Number(p[k]) || 0;
    const issRetido = !!p.iss_retido && n("valor_iss") > 0;
    const liquido = r2(valor - n("valor_ir") - n("valor_inss") - n("valor_pis") - n("valor_cofins") - n("valor_csll") - (issRetido ? n("valor_iss") : 0));
    if (liquido <= 0) return erro("as retenções passam do valor do serviço");
    const prest = String(forn.cnpj ?? "").replace(/\D/g, "") || null;
    const id = atual?.id ?? uid();
    const chave = `tomada:${prest ?? forn.id}:${numero ? "n" + numero : "m" + id}`;
    if (db.nfse_importadas.some((x: Row) => x.chave === chave && x.id !== id)) return erro(`a NFS-e ${numero} deste fornecedor já está no ERP`);
    const dados = { tipo: "tomada", unidade_id: unidade.id, chave, numero, rps: null, data_emissao: p.data_emissao, competencia: p.competencia ?? null,
      prestador_doc: prest, prestador_nome: forn.nome, tomador_doc: unidade.cnpj ?? null, tomador_nome: unidade.razao_social ?? unidade.nome, fornecedor_id: forn.id, cliente_id: null,
      valor_servicos: valor, valor_iss: p.valor_iss != null ? n("valor_iss") : null, iss_retido: issRetido, valor_ir: n("valor_ir"), valor_inss: n("valor_inss"),
      valor_pis: n("valor_pis"), valor_cofins: n("valor_cofins"), valor_csll: n("valor_csll"), valor_liquido: liquido, discriminacao: String(p.discriminacao).trim(),
      codigo_servico: null, municipio: null, codigo_verificacao: null, chave_acesso: null, situacao: numero ? "normal" : "sem_numero", origem: "manual" };
    if (atual) Object.assign(atual, dados); else db.nfse_importadas.push({ id, created_at: new Date().toISOString(), conta_pagar_id: null, ...dados });
    return { data: id, error: null };
  },
  lancar_conta_servico_tomado: ({ p_nfse, p_vencimento, p_categoria, p_fornecedor }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!p_vencimento) return erro("informe o vencimento");
    const nota = (db.nfse_importadas ?? []).find((n: Row) => n.id === p_nfse && n.tipo === "tomada");
    if (!nota) return erro("serviço tomado não encontrado");
    if (nota.situacao === "cancelada") return erro("serviço tomado cancelado: não lança conta");
    if (nota.conta_pagar_id && db.contas_pagar.some((c) => c.id === nota.conta_pagar_id && c.status !== "cancelado")) return erro("a conta a pagar deste serviço já foi lançada");
    const forn = db.fornecedores.find((f) => f.id === (nota.fornecedor_id ?? p_fornecedor));
    if (!forn) return erro("escolha o fornecedor do serviço (o CNPJ do prestador não está no cadastro)");
    const ret = Number(nota.valor_ir) + Number(nota.valor_inss) + Number(nota.valor_pis) + Number(nota.valor_cofins) + Number(nota.valor_csll) + (nota.iss_retido ? Number(nota.valor_iss ?? 0) : 0);
    const valor = r2(nota.valor_liquido ?? Number(nota.valor_servicos) - ret);
    const conta = { id: uid(), created_at: new Date().toISOString(), descricao: [nota.numero ? `NFS-e ${nota.numero}` : "Serviço tomado", forn.nome, String(nota.discriminacao ?? "").slice(0, 80)].filter(Boolean).join(" · "),
      categoria: p_categoria || "serviços profissionais", fornecedor_id: forn.id, valor, vencimento: p_vencimento, status: "aberto", unidade_id: nota.unidade_id,
      documento: nota.numero ? `NFS-e ${nota.numero}` : null, emissao: nota.data_emissao, competencia: `${String(nota.competencia ?? nota.data_emissao).slice(0, 7)}-01`,
      chave_pix: forn.chave_pix ?? null, revisao: "em_revisao", lancamento: "manual", criado_por: sessao?.user.id ?? null,
      observacoes: "Lançado a partir do serviço tomado (Notas fiscais → NFS-e → Recebidas)" + (ret > 0 ? ". Retenções a recolher pela MF em guia própria (confirmar com o contador)" : "") };
    db.contas_pagar.push(conta);
    nota.conta_pagar_id = conta.id;
    nota.fornecedor_id ??= forn.id;
    return { data: conta.id, error: null };
  },
  criar_fatura_cte: ({ p_ctes, p_numero, p_vencimento, p_valor, p_emissao, p_lancar }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!String(p_numero ?? "").trim()) return erro("informe o número da fatura");
    if (!p_vencimento) return erro("informe o vencimento");
    const sel = (db.ctes ?? []).filter((c) => (p_ctes ?? []).includes(c.id) && c.mf_paga && !c.fatura_id && (c.situacao ?? "autorizado") === "autorizado");
    if (!sel.length) return erro("escolha os CT-e da fatura");
    if (sel.length !== p_ctes.length) return erro("só entram CT-e pagos pela MF e ainda sem fatura");
    const valor = p_valor ?? r2(sel.reduce((s, c) => s + Number(c.valor), 0));
    const id = uid();
    db.cte_faturas.push({ id, transportadora_id: sel[0].transportadora_id, transportadora_raiz: sel[0].transportadora_raiz, numero: String(p_numero).trim(), emissao: p_emissao,
      vencimento: p_vencimento, valor, situacao: "aberta", conta_pagar_id: null, unidade_id: sel[0].unidade_id, observacao: null, origem: "manual", criado_em: new Date().toISOString() });
    for (const c of sel) c.fatura_id = id;
    if (p_lancar) {
      const conta = { id: uid(), created_at: new Date().toISOString(), descricao: `Fatura de frete nº ${String(p_numero).trim()} · Expresso São Miguel (${sel.length} CT-e)`, categoria: "frete",
        fornecedor_id: null, valor, vencimento: p_vencimento, status: "aberto", unidade_id: sel[0].unidade_id, observacoes: "Lançada pela fatura de CT-e (Logística → Fretes e envios → Faturas)" };
      db.contas_pagar.push(conta);
      db.cte_faturas[db.cte_faturas.length - 1].conta_pagar_id = conta.id;
    }
    return { data: id, error: null };
  },
  cancelar_fatura_cte: ({ p_fatura, p_motivo }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (String(p_motivo ?? "").trim().length < 3) return erro("informe o motivo");
    const f = db.cte_faturas.find((x) => x.id === p_fatura && x.situacao !== "cancelada");
    if (!f) return erro("fatura não encontrada ou já cancelada");
    Object.assign(f, { situacao: "cancelada", observacao: [f.observacao, `Cancelada: ${String(p_motivo).trim()}`].filter(Boolean).join(" · ") });
    for (const c of db.ctes ?? []) if (c.fatura_id === f.id) c.fatura_id = null;
    return { data: null, error: null };
  },
  conciliar_em_lote: ({ p_ids, p_acao, p_direcao, p_categoria, p_motivo, p_fornecedor, p_cliente, p_regra }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    if (!["lancar", "ignorar"].includes(p_acao)) return erro("ação inválida: use lancar ou ignorar");
    if ((p_ids ?? []).length > 300) return erro("no máximo 300 linhas por vez");
    if (p_acao === "lancar" && !String(p_categoria ?? "").trim()) return erro("escolha a categoria");
    if (p_acao === "ignorar" && String(p_motivo ?? "").trim().length < 3) return erro("informe o motivo");
    let feitos = 0; const erros: { id: string; erro: string }[] = [];
    for (const id of p_ids ?? []) {
      const l = db.extrato_lancamentos.find((x) => x.id === id);
      const problema = !l ? "linha do extrato não encontrada" : l.status !== "pendente" ? "esta linha do extrato já foi tratada"
        : (p_direcao === "entrada") !== (l.valor > 0) ? (l.valor > 0 ? "é uma entrada, não uma saída" : "é uma saída, não uma entrada") : null;
      const r = problema ? erro(problema) : p_acao === "lancar"
        ? rpcs.lancar_do_extrato({ p_lanc: id, p_categoria, p_descricao: null, p_fornecedor, p_cliente })
        : rpcs.ignorar_lancamento({ p_lanc: id, p_motivo: String(p_motivo).trim() });
      if (r.error) erros.push({ id, erro: r.error.message }); else feitos++;
    }
    const regra = p_regra && feitos ? db.conciliacao_regras?.find((x) => x.id === p_regra) : null;
    if (regra) Object.assign(regra, { usos: Number(regra.usos ?? 0) + feitos, ultimo_uso: new Date().toISOString() });
    return { data: { feitos, erros }, error: null };
  },
  lancar_do_extrato: ({ p_lanc, p_categoria, p_descricao, p_fornecedor, p_cliente }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const l = db.extrato_lancamentos.find((x) => x.id === p_lanc);
    if (!l || l.status !== "pendente") return erro("esta linha do extrato já foi tratada");
    const unid = db.contas_bancarias.find((b) => b.id === l.conta_bancaria_id)?.unidade_id;
    const id = uid();
    const desc = String(p_descricao ?? "").trim() || l.descricao;
    if (l.valor < 0) {
      db.contas_pagar.push({ id, descricao: desc, categoria: p_categoria ?? "outros", fornecedor_id: p_fornecedor ?? null, valor: -l.valor, vencimento: l.data, status: "pago", data_pagamento: l.data, valor_pago: -l.valor,
        unidade_id: unid, conta_bancaria_id: l.conta_bancaria_id, observacoes: "Lançado a partir do extrato bancário", created_at: new Date().toISOString() });
      registrarDemo("contas_pagar", "insert", null, db.contas_pagar[db.contas_pagar.length - 1], null, "sistema");
      atualizarDemo("extrato_lancamentos", l, { status: "conciliado", conta_pagar_id: id, conciliado_em: new Date().toISOString() });
    } else {
      db.contas_receber.push({ id, descricao: desc, categoria: p_categoria ?? "outras receitas", cliente_id: p_cliente ?? null, valor: l.valor, vencimento: l.data, status: "pago", data_pagamento: l.data, valor_pago: l.valor, forma_pagamento: "transferencia",
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
  // avisos entre usuários (no sistema real: public.enviar_aviso, ciente_aviso e usuarios_para_aviso)
  usuarios_para_aviso: () => ({ data: db.usuarios_erp.filter((u: Row) => u.ativo !== false).map((u: Row) => ({ user_id: u.user_id, nome: u.nome, papel: u.papel })), error: null }),
  enviar_aviso: ({ p_titulo, p_texto, p_urgencia = "normal", p_para = [], p_papeis = [], p_link }) => {
    if (!String(p_titulo ?? "").trim()) return { data: null, error: { message: "Escreva o aviso" } };
    const eu = db.usuarios_erp.find((u: Row) => u.user_id === sessao?.user.id);
    const pessoas = (p_para ?? []).length > 0;
    const n = { id: ++seqNotif, tipo: "outro", titulo: String(p_titulo).trim(), texto: p_texto || null, link: p_link || null,
      papeis: pessoas ? ["mensagem"] : p_papeis ?? [], urgencia: p_urgencia, destinatarios: pessoas ? p_para : [], remetente_id: sessao?.user.id ?? null,
      remetente_nome: eu?.nome ?? null, exige_ciencia: p_urgencia !== "normal", created_at: new Date().toISOString() };
    db.notificacoes.unshift(n);
    const papel = eu?.papel;
    if (pessoas ? p_para.includes(sessao?.user.id) : papel === "admin" || !n.papeis.length || n.papeis.includes(papel)) canais.forEach((f) => f(n));
    return { data: n.id, error: null };
  },
  registrar_acesso: ({ p_dispositivo, p_navegador }) => {
    db.acessos_usuarios ??= [];
    const agora = new Date().toISOString();
    const eu = db.usuarios_erp.find((u: Row) => u.user_id === sessao?.user.id);
    const aberto = db.acessos_usuarios.find((a: Row) => a.user_id === sessao?.user.id && Date.now() - Date.parse(a.ultimo_sinal_em) < 30 * 60_000);
    if (aberto) { aberto.ultimo_sinal_em = agora; return { data: aberto.id, error: null }; }
    const id = db.acessos_usuarios.length + 1;
    db.acessos_usuarios.unshift({ id, user_id: sessao?.user.id, nome: eu?.nome ?? null, entrou_em: agora, ultimo_sinal_em: agora, dispositivo: p_dispositivo ?? null, navegador: p_navegador ?? null, ip: null });
    return { data: id, error: null };
  },
  gnre_lancar_nota: ({ p_nota }) => {
    db.gnre_guias = db.gnre_guias ?? [];
    if (db.gnre_guias.some((g: Row) => g.nota_fiscal_id === p_nota)) return { data: null, error: { message: "Esta nota já tem GNRE lançada" } };
    const n = db.notas_fiscais.find((x: Row) => x.id === p_nota);
    const itens = (n?.payload?.items ?? []) as Row[];
    const soma = (f: (i: Row) => number) => r2(itens.reduce((t, i) => t + f(i), 0));
    const difal = soma((i) => Number(i.icms_valor_uf_destino ?? 0)), fcp = soma((i) => Number(i.fcp_valor_uf_destino ?? 0));
    const st = soma((i) => Number(i.icms_valor_st ?? 0) + Number(i.fcp_valor_st ?? 0));
    const total = r2(difal + fcp + st);
    if (!n || n.status !== "autorizada" || total <= 0) return { data: null, error: { message: "Esta nota não tem DIFAL, FCP nem ICMS-ST para outro estado (ou não está autorizada)" } };
    const uf = String(n.payload?.uf_destinatario ?? "").toUpperCase();
    const venc = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const conta = { id: uid(), descricao: `GNRE – NF ${n.numero ?? "?"} – ${uf}`, categoria: "impostos", documento: `NF ${n.numero ?? "?"} · GNRE`, valor: total, vencimento: venc,
      status: "aberto", revisao: "aprovado", lancamento: "automatico", unidade_id: n.unidade_id ?? null, emissao: new Date().toISOString().slice(0, 10),
      observacoes: "Gerado pelo ERP (demonstração). Gerar a guia no portal da GNRE.", created_at: new Date().toISOString(), rateio: [], marcadores: [] };
    db.contas_pagar.unshift(conta);
    const g = { id: uid(), nota_fiscal_id: n.id, unidade_id: n.unidade_id ?? null, uf, nf_numero: n.numero, valor_difal: difal, valor_fcp: fcp, valor_st: st, valor_total: total,
      vencimento: venc, conta_pagar_id: conta.id, situacao: "a_gerar", codigo_barras: null, observacao: "Lançada pelo financeiro", created_at: new Date().toISOString() };
    db.gnre_guias.unshift(g);
    return { data: g.id, error: null };
  },
  custos_anteriores_produtos: () => ({ data: [], error: null }),
  unidades_com_boleto_inter: () => ({ data: [...new Set((db.inter_conexoes ?? []).filter((c: Row) => c.boletos && c.status !== "desligada")
    .map((c: Row) => db.contas_bancarias.find((cb: Row) => cb.id === c.conta_bancaria_id)?.unidade_id).filter(Boolean))], error: null }),
  inter_regras_boleto: ({ p_conexao, p_multa, p_juros, p_dias, p_mensagem }) => {
    const c = (db.inter_conexoes ?? []).find((x: Row) => x.id === p_conexao);
    if (!c) return { data: null, error: { message: "Conta do Inter não encontrada." } };
    if (p_multa < 0 || p_multa > 2) return { data: null, error: { message: "Multa entre 0 e 2% (limite do Código de Defesa do Consumidor)." } };
    Object.assign(c, { boleto_multa_pct: p_multa, boleto_juros_mes_pct: p_juros, boleto_dias_baixa: p_dias, boleto_mensagem: p_mensagem || null });
    return { data: null, error: null };
  },
  scrum_iniciar_sprint: ({ p_sprint }) => {
    const s = (db.scrum_sprints ?? []).find((x: Row) => x.id === p_sprint && x.status === "planejada");
    if (!s) return { data: null, error: { message: "Só uma sprint planejada pode ser iniciada." } };
    if (db.scrum_sprints.some((x: Row) => x.time_id === s.time_id && x.status === "ativa")) return { data: null, error: { message: "A equipe já tem uma sprint em andamento: encerre-a antes." } };
    Object.assign(s, { status: "ativa", pontos_planejados: (db.scrum_itens ?? []).filter((i: Row) => i.sprint_id === s.id).reduce((t: number, i: Row) => t + (i.pontos ?? 0), 0) });
    return { data: null, error: null };
  },
  scrum_encerrar_sprint: ({ p_sprint, p_revisao = null, p_bom = null, p_melhorar = null, p_acoes = null }) => {
    const s = (db.scrum_sprints ?? []).find((x: Row) => x.id === p_sprint && x.status === "ativa");
    if (!s) return { data: null, error: { message: "Só a sprint em andamento pode ser encerrada." } };
    const itens = (db.scrum_itens ?? []).filter((i: Row) => i.sprint_id === s.id);
    const txt = (v: unknown) => String(v ?? "").trim() || null;
    Object.assign(s, { status: "encerrada", encerrada_em: new Date().toISOString(), revisao: txt(p_revisao), retro_bom: txt(p_bom), retro_melhorar: txt(p_melhorar), retro_acoes: txt(p_acoes),
      pontos_feitos: itens.filter((i: Row) => i.status === "feito").reduce((t: number, i: Row) => t + (i.pontos ?? 0), 0) });
    const voltam = itens.filter((i: Row) => i.status !== "feito").sort((a: Row, b: Row) => a.prioridade - b.prioridade || String(a.created_at).localeCompare(String(b.created_at)));
    const backlog = (db.scrum_itens ?? []).filter((i: Row) => i.time_id === s.time_id && !i.sprint_id).map((i: Row) => Number(i.prioridade));
    const topo = backlog.length ? Math.min(...backlog) : 1000;
    voltam.forEach((i: Row, k: number) => Object.assign(i, { sprint_id: null, status: i.status === "revisao" ? "fazendo" : i.status, prioridade: topo - 10 * (voltam.length - k) }));
    return { data: voltam.length, error: null };
  },
  lancar_conta_devolucao: ({ p_nota = null, p_recebida = null, p_valor = null, p_vencimento = null, p_chave_pix = null }) => {
    const n = p_nota ? db.notas_fiscais.find((x: Row) => x.id === p_nota) : (db.nfe_recebidas ?? []).find((x: Row) => x.id === p_recebida);
    if (!n || n.finalidade !== "devolucao") return { data: null, error: { message: "Esta nota não é uma devolução de venda" } };
    if (n.conta_pagar_id && db.contas_pagar.some((c: Row) => c.id === n.conta_pagar_id && c.status !== "cancelado")) return { data: null, error: { message: "Esta devolução já tem conta a pagar" } };
    const valor = r2(Number(p_valor ?? n.valor_total));
    if (!(valor > 0) || valor > Number(n.valor_total)) return { data: null, error: { message: "O reembolso não pode passar do valor da nota de devolução" } };
    const num = p_nota ? n.numero : String(Number(String(n.chave ?? "").slice(25, 34)) || "?");
    const nome = p_nota ? n.destinatario_nome : n.emitente_nome;
    const conta = { id: uid(), descricao: `Devolução de venda – NF ${num}${nome ? ` – ${nome}` : ""}`, categoria: "devoluções de vendas", documento: `NF ${num} · devolução`,
      valor, vencimento: p_vencimento ?? new Date().toISOString().slice(0, 10), status: "aberto", revisao: "em_revisao", lancamento: "manual", chave_pix: p_chave_pix,
      unidade_id: n.unidade_id ?? null, created_at: new Date().toISOString(), rateio: [], marcadores: [], observacoes: "Reembolso ao cliente pela devolução de venda (demonstração)." };
    db.contas_pagar.unshift(conta);
    n.conta_pagar_id = conta.id;
    return { data: conta.id, error: null };
  },
  gnre_informar_guia: ({ p_id, p_codigo }) => {
    const g = (db.gnre_guias ?? []).find((x: Row) => x.id === p_id);
    const cod = String(p_codigo ?? "").replace(/\D/g, "");
    if (!g) return { data: null, error: { message: "Guia não encontrada" } };
    if (cod.length !== 44 && cod.length !== 48) return { data: null, error: { message: "O código de barras da GNRE tem 44 ou 48 números" } };
    g.codigo_barras = cod; g.situacao = "gerada";
    const c = db.contas_pagar.find((x: Row) => x.id === g.conta_pagar_id && x.status === "aberto");
    if (c) c.linha_digitavel = cod;
    return { data: null, error: null };
  },
  responder_aviso: ({ p_id, p_texto, p_urgencia = "normal" }) => {
    if (!String(p_texto ?? "").trim()) return { data: null, error: { message: "Escreva a resposta" } };
    const o = db.notificacoes.find((n: Row) => n.id === p_id && n.remetente_id);
    if (!o) return { data: null, error: { message: "aviso não encontrado" } };
    const euId = sessao?.user.id;
    const para = [...new Set([...(o.destinatarios ?? []), o.remetente_id])].filter((x) => x && x !== euId);
    if (!para.length) return { data: null, error: { message: "não há para quem responder" } };
    const eu = db.usuarios_erp.find((u: Row) => u.user_id === euId);
    const n = { id: ++seqNotif, tipo: "outro", titulo: `Re: ${String(o.titulo).replace(/^(Re: )+/, "")}`.slice(0, 140), texto: String(p_texto).trim(), link: o.link ?? null,
      papeis: ["mensagem"], urgencia: p_urgencia, destinatarios: para, remetente_id: euId ?? null, remetente_nome: eu?.nome ?? null,
      exige_ciencia: p_urgencia !== "normal", conversa_id: o.conversa_id ?? o.id, resposta_de: o.id, created_at: new Date().toISOString() };
    db.notificacoes.unshift(n);
    return { data: n.id, error: null };
  },
  ciente_aviso: ({ p_id }) => {
    db.notificacoes_ciencia = db.notificacoes_ciencia ?? [];
    if (!db.notificacoes_ciencia.some((c: Row) => c.notificacao_id === p_id && c.user_id === sessao?.user.id))
      db.notificacoes_ciencia.push({ notificacao_id: p_id, user_id: sessao?.user.id, ciente_em: new Date().toISOString() });
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
  cotacao_marcar_enviada: ({ p_ids }) => {
    let n = 0;
    for (const cf of db.cotacao_fornecedores.filter((x) => (p_ids ?? []).includes(x.id))) {
      const c = db.cotacoes.find((x) => x.id === cf.cotacao_id);
      if (cf.status === "pendente" && ["rascunho", "enviada"].includes(c?.status)) { cf.status = "enviada"; n++; }
      cf.enviado_em = new Date().toISOString();
      if (c?.status === "rascunho") Object.assign(c, { status: "enviada", enviada_em: c.enviada_em ?? new Date().toISOString() });
    }
    return { data: n, error: null };
  },
  cotacao_publica: ({ p_token }) => {
    const cf = (db.cotacao_fornecedores ?? []).find((x) => x.token === p_token);
    const c = cf && db.cotacoes.find((x) => x.id === cf.cotacao_id);
    if (!cf || !c || c.status === "rascunho") return { data: null, error: null };
    if (["pendente", "enviada"].includes(cf.status) && c.status === "enviada") Object.assign(cf, { status: "vista", visto_em: new Date().toISOString() });
    const cfg = db.configuracoes[0];
    const itens = db.cotacao_itens.filter((i) => i.cotacao_id === c.id).sort((a, b) => a.ordem - b.ordem).map((i) => {
      const p = db.produtos.find((x) => x.id === i.produto_id);
      const r = db.cotacao_respostas.find((x) => x.cotacao_item_id === i.id && x.cotacao_fornecedor_id === cf.id);
      return { id: i.id, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade ?? p?.unidade, observacao: i.observacao ?? null,
        codigo_fabricante: p?.codigo_fabricante ?? null, marca: p?.marca ?? null, modelo: p?.modelo ?? null,
        seu_codigo: (db.fornecimentos ?? []).find((f) => f.produto_id === i.produto_id && f.fornecedor_id === cf.fornecedor_id)?.codigo_fornecedor ?? null,
        preco_unitario: r?.preco_unitario ?? null, prazo_dias: r?.prazo_dias ?? null, disponivel: r?.disponivel ?? true, obs_resposta: r?.observacao ?? null };
    });
    return { data: { numero: c.numero, titulo: c.titulo, status: c.status, situacao: cf.status, prazo_resposta: c.prazo_resposta, entrega_desejada: c.entrega_desejada,
      observacoes: c.observacoes, fornecedor: nomeFornDemo(cf.fornecedor_id), itens,
      condicao_pagamento: cf.condicao_pagamento ?? null, prazo_entrega_dias: cf.prazo_entrega_dias ?? null, frete: cf.frete ?? null, frete_tipo: cf.frete_tipo ?? null,
      validade: cf.validade ?? null, obs_fornecedor: cf.observacoes ?? null, respondido_por: cf.respondido_por ?? null, respondido_em: cf.respondido_em ?? null,
      empresa: { nome: cfg.nome_fantasia || cfg.razao_social, razao_social: cfg.razao_social, cnpj: cfg.cnpj, whatsapp: cfg.whatsapp, telefone: cfg.telefone, email: cfg.email, municipio: cfg.municipio, uf: cfg.uf },
      cor: cfg.proposta_cor || "#0EA5E9" }, error: null };
  },
  cotacao_responder: ({ p_token, p_itens, p_dados }) => {
    const cf = (db.cotacao_fornecedores ?? []).find((x) => x.token === p_token);
    if (!cf) return erro("cotação não encontrada");
    const c = db.cotacoes.find((x) => x.id === cf.cotacao_id)!;
    if (c.status !== "enviada") return erro("esta cotação já foi encerrada: fale com o comprador");
    const nome = String(p_dados?.respondido_por ?? "").trim().slice(0, 120);
    if (!nome) return erro("informe o seu nome");
    if (!Array.isArray(p_itens) || p_itens.length > 500) return erro("itens inválidos");
    const txt = (v: any, re: RegExp) => (re.test(String(v ?? "")) ? Number(v) : null);
    const validos = p_itens.map((e: Row) => ({ e, item: db.cotacao_itens.find((i) => i.id === e.item_id && i.cotacao_id === c.id) }))
      .filter((x): x is { e: Row; item: Row } => !!x.item);
    if (!validos.some((x: Row) => txt(x.e.preco_unitario, /^\d{1,9}(\.\d{1,4})?$/) != null)) return erro('informe o preço de ao menos um item (ou use "Não vamos cotar")');
    for (const { e, item } of validos) {
      const preco = txt(e.preco_unitario, /^\d{1,9}(\.\d{1,4})?$/);
      const prazo = txt(e.prazo_dias, /^\d{1,3}$/);
      const dados = { preco_unitario: preco, prazo_dias: prazo == null ? null : Math.min(prazo, 730), disponivel: (e.disponivel ?? true) !== false && preco != null,
        observacao: String(e.observacao ?? "").trim().slice(0, 300) || null, updated_at: new Date().toISOString() };
      const r = db.cotacao_respostas.find((x) => x.cotacao_fornecedor_id === cf.id && x.cotacao_item_id === item.id);
      if (r) Object.assign(r, dados); else db.cotacao_respostas.push({ id: uid(), cotacao_fornecedor_id: cf.id, cotacao_item_id: item.id, vencedor: false, ...dados });
      if (preco != null) fornecimentoDemo(item.produto_id, cf.fornecedor_id, preco, "cotacao", dados.prazo_dias);
    }
    const prazoEnt = txt(p_dados?.prazo_entrega_dias, /^\d{1,3}$/);
    Object.assign(cf, { status: "respondida", respondido_em: new Date().toISOString(), respondido_por: nome,
      condicao_pagamento: String(p_dados?.condicao_pagamento ?? "").trim().slice(0, 200) || null,
      prazo_entrega_dias: prazoEnt == null ? null : Math.min(prazoEnt, 730), frete: txt(p_dados?.frete, /^\d{1,9}(\.\d{1,2})?$/),
      frete_tipo: ["CIF", "FOB"].includes(p_dados?.frete_tipo) ? p_dados.frete_tipo : null,
      validade: /^\d{4}-\d{2}-\d{2}$/.test(String(p_dados?.validade ?? "")) ? p_dados.validade : null,
      observacoes: String(p_dados?.observacoes ?? "").trim().slice(0, 1000) || null });
    notificarDemo("outro", `Cotação nº ${c.numero} respondida`, `${nomeFornDemo(cf.fornecedor_id)} mandou os preços. Confira o mapa comparativo.`, "/producao?aba=cotacoes", ["financeiro", "tecnico"]);
    return { data: "respondida", error: null };
  },
  cotacao_recusar: ({ p_token, p_nome, p_motivo = null }) => {
    const cf = (db.cotacao_fornecedores ?? []).find((x) => x.token === p_token);
    if (!cf) return erro("cotação não encontrada");
    const c = db.cotacoes.find((x) => x.id === cf.cotacao_id)!;
    if (c.status !== "enviada") return erro("esta cotação já foi encerrada");
    if (!String(p_nome ?? "").trim()) return erro("informe o seu nome");
    Object.assign(cf, { status: "recusou", respondido_em: new Date().toISOString(), respondido_por: String(p_nome).trim().slice(0, 120), observacoes: String(p_motivo ?? "").trim().slice(0, 1000) || null });
    notificarDemo("outro", `Cotação nº ${c.numero}: fornecedor não vai cotar`, nomeFornDemo(cf.fornecedor_id) + (p_motivo ? ` · ${String(p_motivo).slice(0, 80)}` : ""), "/producao?aba=cotacoes", ["financeiro", "tecnico"]);
    return { data: "recusou", error: null };
  },
  cotacao_gerar_pedidos: ({ p_cotacao, p_escolhas }) => {
    const c = db.cotacoes.find((x) => x.id === p_cotacao);
    if (!c) return erro("cotação não encontrada");
    if (["encerrada", "cancelada"].includes(c.status)) return erro("esta cotação já foi encerrada");
    const esc: Row[] = Array.isArray(p_escolhas) ? p_escolhas : [];
    if (!esc.length) return erro("escolha o fornecedor de ao menos um item");
    const resp = (e: Row) => db.cotacao_respostas.find((r) => r.cotacao_item_id === e.item_id && r.cotacao_fornecedor_id === e.cotacao_fornecedor_id);
    if (esc.some((e) => db.cotacao_itens.find((i) => i.id === e.item_id)?.cotacao_id !== c.id || resp(e)?.preco_unitario == null || !resp(e)?.disponivel)) return erro("há item escolhido sem preço desse fornecedor");
    const saida: Row[] = [];
    for (const cf of db.cotacao_fornecedores.filter((x) => x.cotacao_id === c.id && esc.some((e) => e.cotacao_fornecedor_id === x.id))) {
      const meus = esc.filter((e) => e.cotacao_fornecedor_id === cf.id);
      const prazo = Math.max(...meus.map((e) => Number(resp(e)?.prazo_dias ?? 0)));
      const pc: Row = { id: uid(), ...DEFAULTS.pedidos_compra(), fornecedor_id: cf.fornecedor_id, previsao_entrega: dias(cf.prazo_entrega_dias ?? (prazo || 15)),
        condicao_pagamento: cf.condicao_pagamento ?? null, frete: Number(cf.frete ?? 0), unidade_id: c.unidade_id ?? unidadeDoUsuario(),
        observacoes: [`Vencedor da cotação nº ${c.numero}`, cf.frete_tipo && `frete ${cf.frete_tipo}`, cf.validade && `proposta válida até ${cf.validade.split("-").reverse().join("/")}`].filter(Boolean).join(" · ") };
      db.pedidos_compra.push(pc);
      for (const e of meus.sort((a, b) => (db.cotacao_itens.find((i) => i.id === a.item_id)?.ordem ?? 0) - (db.cotacao_itens.find((i) => i.id === b.item_id)?.ordem ?? 0))) {
        const i = db.cotacao_itens.find((x) => x.id === e.item_id)!;
        db.pedido_compra_itens.push({ id: uid(), pedido_compra_id: pc.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade, custo_unitario: r2(Number(resp(e)!.preco_unitario)), quantidade_recebida: 0 });
        resp(e)!.vencedor = true;
      }
      cf.pedido_compra_id = pc.id;
      saida.push({ pedido_id: pc.id, numero: pc.numero, fornecedor: db.fornecedores.find((x) => x.id === cf.fornecedor_id)?.nome });
    }
    Object.assign(c, { status: "encerrada", encerrada_em: new Date().toISOString() });
    return { data: saida, error: null };
  },
  pdv_consumidor_final: () => ({ data: pdvConsumidorDemo(), error: null }),
  pdv_finalizar: ({ p }) => {
    const itens: Row[] = Array.isArray(p?.itens) ? p.itens : [];
    const pags: Row[] = Array.isArray(p?.pagamentos) ? p.pagamentos : [];
    if (!itens.length) return erro("carrinho vazio");
    if (!pags.length) return erro("escolha a forma de pagamento");
    if (pags.some((x) => !(Number(x.valor) > 0))) return erro("valor de pagamento inválido");
    const cfg = db.configuracoes[0];
    const cli = p.cliente_id || pdvConsumidorDemo();
    if (pags.some((x) => x.meio === "prazo") && cli === cfg.pdv_cliente_id) return erro("venda a prazo precisa de cliente identificado");
    const texto = (m: string) => ({ dinheiro: "dinheiro", cartao_credito: "cartao", cartao_debito: "cartao", transferencia: "transferencia", prazo: "boleto" } as Record<string, string>)[m] ?? "pix";
    const principal = [...pags].sort((a, b) => Number(b.valor) - Number(a.valor))[0].meio;
    const ped: Row = { id: uid(), ...DEFAULTS.pedidos(), cliente_id: cli, origem: "balcao", forma_pagamento: texto(principal), parcelas: 1, primeiro_vencimento: hojeISO(),
      intervalo_dias: 30, modalidade_frete: 9, desconto: Number(p.desconto) || 0, frete: 0, observacoes: p.observacoes || null, unidade_id: p.unidade_id || U_SC,
      vendedor_id: p.vendedor_id || null, vendedor: db.vendedores?.find((v) => v.id === p.vendedor_id)?.nome ?? null };
    const desfazer = () => { db.pedido_itens = db.pedido_itens.filter((x) => x.pedido_id !== ped.id); db.pedidos = db.pedidos.filter((x) => x.id !== ped.id); };
    db.pedidos.push(ped);
    for (const i of itens) {
      const pr = db.produtos.find((x) => x.id === i.produto_id);
      if (!pr || !(Number(i.quantidade) > 0)) { desfazer(); return erro(pr ? "quantidade inválida" : "produto não encontrado"); }
      db.pedido_itens.push({ id: uid(), pedido_id: ped.id, produto_id: pr.id, descricao: pr.descricao, quantidade: Number(i.quantidade), valor_unitario: r2(Number(i.valor_unitario)), numero_serie: i.numero_serie || null });
    }
    recalcular(db);
    const soma = r2(pags.reduce((t, x) => t + Number(x.valor), 0));
    if (Math.abs(soma - ped.valor_total) > 0.009) { desfazer(); return erro(`os pagamentos (${brlDemo(soma)}) não fecham com o total da venda (${brlDemo(ped.valor_total)})`); }
    const ap = rpcs.aprovar_pedido({ p_pedido: ped.id });
    if (ap.error) { desfazer(); return ap; }
    const primeira = db.contas_receber.find((c) => c.pedido_id === ped.id && c.status === "aberto");
    const contas = pags.map((x, k) => {
      const pago = !["link", "prazo"].includes(x.meio);
      const valor = r2(Number(x.valor));
      const dados = {
        descricao: `Pedido #${ped.numero} - balcão${pags.length > 1 ? ` (pagamento ${k + 1}/${pags.length})` : ""}${x.meio === "cartao_credito" ? " · crédito" : x.meio === "cartao_debito" ? " · débito" : x.meio === "link" ? " · link InfinitePay" : ""}`,
        valor, vencimento: x.meio === "prazo" ? x.vencimento || dias(30) : hojeISO(), forma_pagamento: texto(x.meio), parcela: k + 1, total_parcelas: pags.length,
        status: pago ? "pago" : "aberto", data_pagamento: pago ? hojeISO() : null, valor_pago: pago ? valor : null,
      };
      if (k === 0 && primeira) { Object.assign(primeira, dados); return { id: primeira.id, meio: x.meio, valor, pago, vencimento: dados.vencimento }; }
      const nova = { id: uid(), ...DEFAULTS.contas_receber(), ...dados, cliente_id: cli, pedido_id: ped.id, unidade_id: ped.unidade_id, categoria: "vendas" };
      db.contas_receber.push(nova);
      return { id: nova.id, meio: x.meio, valor, pago, vencimento: dados.vencimento };
    });
    if (p.entregar !== false) ped.status = "entregue";
    return { data: { pedido_id: ped.id, numero: ped.numero, total: ped.valor_total, cliente_id: cli, itens: itens.length, contas }, error: null };
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
          ...(tabela === "clientes" && !c.compra_maquina_em ? { compra_maquina_em: it.compra_maquina } : {}),
        }).filter(([, v]) => v !== "" && v != null)));
      }
    }
    return { data: r, error: null };
  },
  // base da My Frost (no sistema real: public.importar_legado_myfrost / importar_pecas_myfrost)
  importar_legado_myfrost: ({ p_clientes }) => {
    const r = { novos: 0, existentes: 0, arquivados: 0, maquinas: 0, compras: 0, erros: [] as Row[] };
    for (const c of p_clientes as Row[]) {
      let cli = (c.cliente_id && db.clientes.find((x: Row) => x.id === c.cliente_id))
        || db.clientes.find((x: Row) => x.id_externo === `myfrost:${c.ref}` || (c.cpf_cnpj && x.cpf_cnpj === c.cpf_cnpj));
      if (!cli) {
        cli = { id: uid(), ...DEFAULTS.clientes(), codigo: db.clientes.reduce((m: number, x: Row) => Math.max(m, Number(x.codigo ?? 0)), 0) + 1,
          nome: c.nome, nome_fantasia: c.fantasia || null, tipo_pessoa: c.tipo_pessoa, cpf_cnpj: c.cpf_cnpj || null, email: c.email || null,
          telefone: c.telefone || null, whatsapp: c.celular || null, municipio: c.municipio || null, uf: c.uf || null, observacoes: c.obs,
          tags: [...c.tags], id_externo: `myfrost:${c.ref}`, created_at: quando(0) };
        db.clientes.push(cli);
        r.novos++;
      } else {
        cli.tags = [...new Set([...(cli.tags ?? []), ...c.tags])].sort();
        r.existentes++;
      }
      for (const m of c.maquinas ?? []) {
        if (db.equipamentos.some((e: Row) => e.origem_ref === m.ref)) continue;
        const prod = db.produtos.find((p: Row) => p.tipo === "maquina" && p.descricao.toLowerCase().includes(String(m.modelo).toLowerCase()));
        db.equipamentos.push({ id: uid(), cliente_id: cli.id, produto_id: prod?.id ?? null, descricao: m.descricao, numero_serie: null, pedido_id: null,
          data_venda: m.data, garantia_ate: null, proxima_preventiva: null, ultimo_contato: null, observacoes: m.obs, origem: "My Frost", origem_ref: m.ref,
          usada: !!m.usada, created_at: quando(0) });
        if (m.usada && !(cli.tags ?? []).includes("compra_usada")) cli.tags = [...(cli.tags ?? []), "compra_usada"].sort();
        r.maquinas++;
      }
      for (const x of c.compras ?? []) {
        if (db.compras_legado.some((y: Row) => y.ref === x.ref)) continue;
        db.compras_legado.push({ id: uid(), cliente_id: cli.id, origem: "My Frost", ...x, created_at: quando(0) });
        r.compras++;
      }
    }
    return { data: r, error: null };
  },
  // propostas do Tiny (no sistema real: public.importar_propostas_tiny)
  importar_propostas_tiny: ({ p_empresa, p_propostas, p_unidade }) => {
    const mf = p_empresa === "mf";
    const r = { novas: 0, atualizadas: 0, clientes_novos: 0, sem_cliente: 0, erros: [] as Row[] };
    for (const p of p_propostas as Row[]) {
      if (!p.tiny_id) { r.erros.push({ proposta: p.numero ?? "?", erro: "proposta sem ID do Tiny" }); continue; }
      const ext = p.contato_id ? (mf ? p.contato_id : `myfrost:${p.contato_id}`) : null;
      let cli = db.clientes.find((x: Row) => (ext && x.id_externo === ext) || (p.cpf_cnpj && x.cpf_cnpj === p.cpf_cnpj));
      if (!cli && !mf) { r.sem_cliente++; continue; }
      if (!cli) {
        cli = { id: uid(), ...DEFAULTS.clientes(), codigo: db.clientes.reduce((m: number, x: Row) => Math.max(m, Number(x.codigo ?? 0)), 0) + 1,
          nome: p.nome, tipo_pessoa: String(p.cpf_cnpj ?? "").length === 11 ? "PF" : "PJ", cpf_cnpj: p.cpf_cnpj || null, email: p.email || null,
          telefone: p.fone || null, whatsapp: p.celular || null, municipio: p.municipio || null, uf: p.uf || null, id_externo: ext, created_at: quando(0) };
        db.clientes.push(cli);
        r.clientes_novos++;
      }
      const itens = (p.itens ?? []).map((i: Row) => mf
        ? { descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario, produto_id: db.produtos.find((x: Row) => x.id_externo && x.id_externo === i.tiny_produto_id)?.id ?? null }
        : { descricao: i.descricao, quantidade: i.quantidade });
      const sub = itens.reduce((t: number, i: Row) => t + i.quantidade * (i.valor_unitario ?? 0), 0);
      const linha = {
        empresa: p_empresa, tiny_id: p.tiny_id, numero: Number(p.numero) || null, data: p.data, proximo_contato: p.proximo_contato, situacao: p.situacao || null,
        vendedor: p.vendedor || null, cliente_id: cli.id, contato_nome: p.nome || null, aos_cuidados: p.aos_cuidados || null,
        unidade_id: mf ? p_unidade ?? null : null, validade_dias: Number(p.validade) || null,
        prazo_entrega: mf ? p.prazo_entrega || null : null, observacoes: mf ? p.observacoes || null : null,
        desconto: mf ? p.desconto ?? 0 : null, frete: mf ? p.frete ?? 0 : null, total: mf ? Math.max(sub - (p.desconto ?? 0) + (p.frete ?? 0), 0) : null, itens,
      };
      const ja = db.propostas_tiny.find((x: Row) => x.empresa === p_empresa && x.tiny_id === p.tiny_id);
      if (ja) { Object.assign(ja, linha); r.atualizadas++; } else { db.propostas_tiny.push({ id: uid(), ...linha, created_at: quando(0) }); r.novas++; }
    }
    return { data: r, error: null };
  },
  // notas fiscais da My Frost (no sistema real: public.importar_notas_legado) — só de quem já é cliente, pelo CPF/CNPJ
  importar_notas_legado: ({ p_notas }) => {
    const r = { novas: 0, atualizadas: 0, sem_cliente: 0, ambiguas: 0, erros: [] as Row[] };
    db.notas_legado ??= [];
    for (const n of p_notas as Row[]) {
      const docs = new Set(((n.docs ?? []) as string[]).map((d) => String(d).replace(/\D/g, "")));
      const clis = [...new Set(db.clientes.filter((c: Row) => docs.has(String(c.cpf_cnpj ?? "").replace(/\D/g, ""))).map((c: Row) => c.unificado_em ?? c.id))];
      if (clis.length > 1) { r.ambiguas++; continue; }
      if (!clis.length) { r.sem_cliente++; continue; }
      const numero = String(n.numero ?? "").replace(/\D/g, "").replace(/^0+/, "");
      if (!numero) { r.erros.push({ nota: n.numero ?? "?", erro: "nota sem número" }); continue; }
      const linha = { numero, data: n.data ?? null, valor: typeof n.valor === "number" ? r2(n.valor) : null, natureza: n.natureza || null, cliente_id: clis[0] };
      const ja = db.notas_legado.find((x: Row) => x.numero === numero);
      if (ja) { Object.assign(ja, linha); r.atualizadas++; } else { db.notas_legado.push({ id: uid(), origem: "My Frost", ...linha, created_at: quando(0) }); r.novas++; }
    }
    return { data: r, error: null };
  },
  // composição dos kits do Tiny (no sistema real: public.importar_kits_tiny) — só preenche kit sem componentes
  importar_kits_tiny: ({ p_kits }) => {
    const r = { kits: 0, componentes: 0, ja_tinham: [] as string[], ignorados: 0 };
    db.kit_componentes ??= [];
    for (const k of p_kits as Row[]) {
      const kit = db.produtos.find((p: Row) => p.id === k.kit_id);
      if (!kit?.kit) { r.ignorados++; continue; }
      if (db.kit_componentes.some((c: Row) => c.kit_id === kit.id)) { r.ja_tinham.push(kit.descricao); continue; }
      let ok = false;
      for (const i of (k.itens ?? []) as Row[]) {
        const q = Math.round(Number(i.quantidade) * 1000) / 1000;
        if (!i.componente_id || i.componente_id === kit.id || !(q > 0) || !db.produtos.some((p: Row) => p.id === i.componente_id)) { r.ignorados++; continue; }
        const ja = db.kit_componentes.find((c: Row) => c.kit_id === kit.id && c.componente_id === i.componente_id);
        if (ja) ja.quantidade += q;
        else db.kit_componentes.push({ id: uid(), kit_id: kit.id, componente_id: i.componente_id, quantidade: q, opcional: false, grupo: null, padrao: true });
        r.componentes++; ok = true;
      }
      if (ok) r.kits++;
    }
    return { data: r, error: null };
  },
  importar_pecas_myfrost: ({ p_pecas }) => {
    const r = { novas: 0, ja_existiam: 0, erros: [] as Row[] };
    for (const x of p_pecas as Row[]) {
      if (db.produtos.some((p: Row) => p.id_externo === `myfrost:${x.ref}`)) { r.ja_existiam++; continue; }
      const skuUsado = x.sku && db.produtos.some((p: Row) => (p.sku ?? "").toUpperCase() === String(x.sku).toUpperCase());
      db.produtos.push({ id: uid(), ...DEFAULTS.produtos?.(), sku: skuUsado ? null : x.sku || null, descricao: x.descricao, tipo: "peca", unidade: x.unidade || "UN",
        ncm: x.ncm || null, preco_venda: x.preco_venda, preco_custo: x.preco_custo, ativo: true, id_externo: `myfrost:${x.ref}`, estoque_atual: 0, created_at: quando(0) });
      r.novas++;
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
  // descontos (no sistema real: public.aprovar_desconto e a senha de aprovação de cada administrador)
  aprovadores_desconto: () => ({
    data: db.usuarios_erp.filter((u: Row) => u.papel === "admin" && db.senhas_aprovacao.some((s: Row) => s.user_id === u.user_id)).map((u: Row) => ({ user_id: u.user_id, nome: u.nome })),
    error: null,
  }),
  tem_senha_aprovacao: () => ({ data: db.senhas_aprovacao.some((s: Row) => s.user_id === sessao?.user.id), error: null }),
  definir_senha_aprovacao: ({ p_senha }) => {
    if (String(p_senha ?? "").length < 6) return erro("a senha de aprovação precisa de pelo menos 6 caracteres");
    db.senhas_aprovacao = [...db.senhas_aprovacao.filter((s: Row) => s.user_id !== sessao?.user.id), { user_id: sessao?.user.id, senha: p_senha }];
    return { data: null, error: null };
  },
  aprovar_desconto: ({ p_aprovador, p_senha, p_percentual, p_contexto, p_pedido, p_canal, p_forma, p_motivo }) => {
    const s = db.senhas_aprovacao.find((x: Row) => x.user_id === p_aprovador);
    if (!s) return { data: { ok: false, erro: "este administrador ainda não criou a senha de aprovação" }, error: null };
    if (s.senha !== p_senha) return { data: { ok: false, erro: "senha de aprovação incorreta (na prévia: 123456)", restantes: 4 }, error: null };
    const ped = p_pedido ? db.pedidos.find((x: Row) => x.id === p_pedido) : null;
    if (ped) ped.desconto_aprovado_pct = Math.round(p_percentual * 100) / 100;
    const nome = db.usuarios_erp.find((u: Row) => u.user_id === p_aprovador)?.nome ?? "";
    db.aprovacoes_desconto.unshift({ id: uid(), contexto: p_contexto, pedido_id: p_pedido ?? null, percentual: p_percentual, maximo_percentual: null,
      canal: ped?.origem ?? p_canal, forma_pagamento: ped?.forma_pagamento ?? p_forma, aprovado_por: p_aprovador, aprovado_por_nome: nome,
      solicitado_por: sessao?.user.id ?? null, solicitado_por_nome: db.usuarios_erp.find((u: Row) => u.user_id === sessao?.user.id)?.nome ?? null,
      motivo: p_motivo ?? null, criado_em: quando(0), usado_em: ped ? quando(0) : null });
    return { data: { ok: true, percentual: p_percentual, aprovado_por: nome }, error: null };
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
      pagamento: ["aprovado", "faturado", "entregue"].includes(p.status) ? {
        em_aberto: r2(db.contas_receber.filter((r) => r.pedido_id === p.id && r.status === "aberto").reduce((s, r) => s + Number(r.valor), 0)),
        pago: r2(db.contas_receber.filter((r) => r.pedido_id === p.id && r.status === "pago").reduce((s, r) => s + Number(r.valor_pago ?? r.valor), 0)),
        link: cfg.link_pagamento_ao_aprovar !== false && ["pix", "cartao"].includes(p.forma_pagamento)
          && !!(db.unidades.find((u) => u.id === p.unidade_id) ?? db.unidades.find((u) => u.matriz))?.infinitepay_tag,
      } : null,
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
    if (p_etapa === "despachado" && riscoDemo(p.id)?.travar) return erro("conferência de risco pendente: o financeiro precisa aprovar antes de despachar");
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
  risco_pedido: ({ p_pedido }) => ({ data: riscoDemo(p_pedido), error: null }),
  riscos_para_despachar: () => ({
    data: (db.expedicoes ?? []).filter((e) => ["separar", "separando", "conferido", "embalado"].includes(e.status)).flatMap((e) => {
      const r = riscoDemo(e.pedido_id); const p = db.pedidos.find((x) => x.id === e.pedido_id);
      if (!r?.elegivel || !p) return [];
      const c = db.clientes.find((x) => x.id === p.cliente_id);
      return [{ pedido_id: p.id, numero: p.numero, cliente: c?.nome_fantasia || c?.nome || null, valor: Number(p.valor_total ?? 0), etapa: e.status, pontos: r.pontos, nivel: r.nivel, travar: r.travar, situacao: r.conferencia?.situacao ?? null }];
    }),
    error: null,
  }),
  decidir_risco: ({ p_pedido, p_decisao, p_observacao }) => {
    if (String(p_observacao ?? "").trim().length < 5) return erro("escreva o que foi conferido (pelo menos 5 letras)");
    const r = riscoDemo(p_pedido); const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!r?.elegivel || !p) return erro("este pedido não passa pela conferência de risco");
    db.conferencias_risco = [...(db.conferencias_risco ?? []).filter((x) => x.pedido_id !== p_pedido),
      { id: uid(), pedido_id: p_pedido, situacao: p_decisao, pontos: r.pontos, nivel: r.nivel, motivos: r.motivos, valor_conferido: Number(p.valor_total ?? 0), observacao: p_observacao, decidido_por_nome: "Administrador (demonstração)", decidido_em: quando(0) }];
    return { data: riscoDemo(p_pedido), error: null };
  },
  ml_tentar_de_novo: ({ p_ml_pedido }) => {
    const v = (db.ml_pedidos ?? []).find((x) => x.id === p_ml_pedido);
    if (v) Object.assign(v, { nota_tentativas: v.nota_enviada_em ? v.nota_tentativas : 0, nota_erro: null, rastreio_tentativas: v.rastreio_enviado_em ? v.rastreio_tentativas : 0, rastreio_erro: null });
    return { data: null, error: null };
  },
  ml_configurar: ({ p_conta, p_emitir_nfe }) => {
    const c = (db.ml_contas ?? []).find((x) => x.id === p_conta);
    if (!c) return erro("conta do Mercado Livre não encontrada");
    if (p_emitir_nfe != null) c.emitir_nfe = p_emitir_nfe;
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
  marcar_senha_trocada: () => {
    const u = db.usuarios_erp.find((x) => x.user_id === sessao?.user.id);
    if (u) u.trocar_senha = false;
    return { data: null, error: null };
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
  // entrada da transferência com a NF-e autorizada: estoque do destino + livro de entradas (nfe_recebidas), sem duplicar
  receber_transferencia_nfe: ({ p_transf }) => {
    const t = db.transferencias.find((x) => x.id === p_transf);
    if (!t || !["enviada", "recebida"].includes(t.status)) return erro("só transferência enviada (em trânsito) ou recebida tem entrada");
    const n = db.notas_fiscais.filter((x) => x.transferencia_id === t.id && x.status === "autorizada" && x.chave && x.ambiente !== "homologacao").slice(-1)[0];
    if (!n) return erro("a NF-e desta transferência ainda não está autorizada (em produção): sem ela a entrada não vai para o livro de entradas");
    const destino = db.unidades.find((u) => u.id === t.destino_id);
    const origem = db.unidades.find((u) => u.id === t.origem_id);
    const itens = ((n.payload?.items ?? []) as Row[]).map((i, k) => ({ numero: k + 1, descricao: i.descricao, cfop: i.cfop,
      cfop_entrada: `${String(i.cfop ?? "").startsWith("6") ? "2" : "1"}152`, quantidade: i.quantidade_comercial, valor_total: i.valor_bruto, icms_valor: Number(i.icms_valor ?? 0) }));
    const cfops = [...new Set(itens.map((i) => i.cfop_entrada))].join(", ");
    const icms = r2(itens.reduce((s2, i) => s2 + i.icms_valor, 0));
    let r = db.nfe_recebidas.find((x) => x.chave === n.chave);
    const jaLancado = !!r?.estoque_lancado;
    let estoque = false;
    const eraEnviada = t.status === "enviada";
    if (eraEnviada) {
      if (!jaLancado) {
        for (const i of db.transferencia_itens.filter((x) => x.transferencia_id === t.id)) movimentar(i.produto_id, "entrada", i.quantidade, `Transferência #${t.numero} (recebimento, NF-e ${n.numero ?? ""})`, { unidade_id: t.destino_id, numero_serie: i.numero_serie });
        estoque = true;
      }
      Object.assign(t, { status: "recebida", recebida_em: quando(0) });
    }
    const msg = `Transferência #${t.numero} de ${origem?.nome ?? ""}: entrada pela tela Transferências (CFOP de entrada ${cfops}).`;
    if (r) Object.assign(r, { transferencia_id: t.id, cfop_entrada: cfops, icms_credito: icms, processamento: "concluido", estoque_lancado: true, observacao_interna: msg });
    else {
      r = { id: uid(), chave: n.chave, emitente_nome: origem?.razao_social ?? origem?.nome, emitente_cnpj: origem?.cnpj, valor_total: n.valor_total, data_emissao: n.created_at,
        situacao: "autorizada", manifestacao: null, nfe_completa: false, unidade_id: destino?.id, processamento: "concluido", processamento_msg: msg, estoque_lancado: true,
        itens, transferencia_id: t.id, cfop_entrada: cfops, icms_credito: icms, observacao_interna: msg, origem: "sefaz", marcadores: [], created_at: quando(0) };
      db.nfe_recebidas.push(r);
    }
    return { data: { nfe_recebida_id: r!.id, estoque, cfop_entrada: cfops, icms_credito: icms, aviso: eraEnviada && jaLancado ? "O estoque desta nota já tinha entrado pelas NF-e recebidas: a transferência foi marcada como recebida sem lançar de novo." : null }, error: null };
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
          .map((p) => {
            const disponibilidade = p.estoque_atual > 0 ? "in stock" : p.tipo === "maquina" ? "available for order" : "out of stock";
            return {
              id: p.id, sku: p.sku, nome: p.descricao, descricao: p.descricao_catalogo, tipo: p.tipo, preco: p.preco_venda, foto: p.foto_caminho,
              disponibilidade, garantia_meses: p.garantia_meses ?? c.garantia_meses_padrao,
              titulo: p.titulo_anuncio || null, gtin: p.gtin_isento ? null : p.codigo_barras || null, categoria: p.categoria || null, peso_kg: p.peso_kg || null,
              prazo_dias: disponibilidade === "available for order" ? p.prazo_reposicao_dias || 30 : null,
            };
          }),
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
          const comp = pecasDoKit(i.produto_id, (db.kit_componentes ?? []) as any, i.kit_escolha);
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
        const comp = pecasDoKit(i.produto_id, (db.kit_componentes ?? []) as any, i.kit_escolha);
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
  // marcadores em todos os cadastros (no sistema real: public.marcar_registros)
  marcar_registros: ({ p_tabela, p_ids, p_adicionar, p_remover }) => {
    const linhas = (db[p_tabela] ?? []).filter((n: Row) => p_ids.includes(n.id));
    for (const n of linhas) n.marcadores = [...new Set([...(n.marcadores ?? []), ...(p_adicionar ?? [])])].filter((x) => !(p_remover ?? []).includes(x));
    return { data: linhas.length, error: null };
  },
  // OC, OP e OS feitas erradas (no sistema real: public.excluir_documento / restaurar_documento / documentos_excluidos)
  excluir_documento: ({ p_tabela, p_id, p_motivo }) => {
    if (String(p_motivo ?? "").trim().length < 5) return erro("escreva o motivo da exclusão (pelo menos 5 letras)");
    const d = (db[p_tabela] ?? []).find((x: Row) => x.id === p_id && !x.excluida_em);
    if (!d) return erro("documento não encontrado");
    if (p_tabela === "pedidos_compra" && (["parcial", "recebido"].includes(d.status) || (db.pedido_compra_itens ?? []).some((i: Row) => i.pedido_compra_id === p_id && Number(i.quantidade_recebida) > 0)))
      return erro(`a OC #${d.numero} já teve mercadoria recebida: o estoque mexeu, não dá para excluir (cancele o saldo)`);
    if (p_tabela === "ordens_producao" && d.status === "concluida") return erro(`a OP #${d.numero} já foi concluída: o estoque mexeu, não dá para excluir`);
    if (p_tabela === "ordens_servico") {
      if ((db.nfse ?? []).some((n: Row) => n.os_id === p_id && ["pendente", "processando", "autorizada", "incerto"].includes(n.status)))
        return erro(`a OS #${d.numero} tem NFS-e emitida (ou em emissão): cancele a nota antes de excluir`);
      if ((db.contas_receber ?? []).some((c: Row) => c.os_id === p_id && c.status === "pago")) return erro(`a OS #${d.numero} já tem valor recebido: estorne o recebimento antes de excluir`);
      for (const c of db.contas_receber ?? []) if (c.os_id === p_id && c.status === "aberto") c.status = "cancelado";
    }
    const motivo = String(p_motivo).trim();
    Object.assign(d, { excluida_em: quando(0), excluida_por: sessao?.user.id, excluida_motivo: motivo, excluida_status: d.status,
      status: p_tabela === "pedidos_compra" ? "cancelado" : "cancelada" });
    if (p_tabela === "ordens_producao")
      for (const c of db.pedidos_compra ?? []) if (c.ordem_producao_id === p_id && !c.excluida_em && c.status === "cotacao")
        Object.assign(c, { excluida_em: quando(0), excluida_por: sessao?.user.id, excluida_motivo: `Junto com a OP #${d.numero}: ${motivo}`, excluida_status: c.status, status: "cancelado" });
    return { data: null, error: null };
  },
  restaurar_documento: ({ p_tabela, p_id }) => {
    const d = (db[p_tabela] ?? []).find((x: Row) => x.id === p_id && x.excluida_em);
    if (!d) return erro("documento excluído não encontrado");
    const status = p_tabela === "ordens_servico" && ["concluida", "entregue"].includes(d.excluida_status) ? "aberta" : d.excluida_status ?? d.status;
    Object.assign(d, { status, excluida_em: null, excluida_por: null, excluida_motivo: null, excluida_status: null });
    if (p_tabela === "ordens_producao")
      for (const c of db.pedidos_compra ?? []) if (c.ordem_producao_id === p_id && c.excluida_em && String(c.excluida_motivo ?? "").startsWith(`Junto com a OP #${d.numero}:`))
        Object.assign(c, { status: c.excluida_status ?? "cotacao", excluida_em: null, excluida_por: null, excluida_motivo: null, excluida_status: null });
    return { data: null, error: null };
  },
  documentos_excluidos: () => ({
    data: [
      ...(db.pedidos_compra ?? []).filter((c: Row) => c.excluida_em).map((c: Row) => ({ tabela: "pedidos_compra", id: c.id, numero: String(c.numero),
        descricao: db.fornecedores.find((f: Row) => f.id === c.fornecedor_id)?.nome ?? "sem fornecedor", excluida_em: c.excluida_em, excluida_motivo: c.excluida_motivo, excluida_por: "demo" })),
      ...(db.ordens_producao ?? []).filter((o: Row) => o.excluida_em).map((o: Row) => ({ tabela: "ordens_producao", id: o.id, numero: String(o.numero),
        descricao: db.produtos.find((p: Row) => p.id === o.produto_id)?.descricao ?? "", excluida_em: o.excluida_em, excluida_motivo: o.excluida_motivo, excluida_por: "demo" })),
      ...(db.ordens_servico ?? []).filter((o: Row) => o.excluida_em).map((o: Row) => ({ tabela: "ordens_servico", id: o.id, numero: String(o.numero),
        descricao: [db.clientes.find((c: Row) => c.id === o.cliente_id)?.nome, o.equipamento].filter(Boolean).join(" · "), excluida_em: o.excluida_em, excluida_motivo: o.excluida_motivo, excluida_por: "demo" })),
    ], error: null,
  }),
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
  // NF da venda emitida por outra empresa (no sistema real: public.registrar_nf_outra_empresa)
  registrar_nf_outra_empresa: ({ p_pedido, p_dados, p_entregue }) => {
    const p = db.pedidos.find((x) => x.id === p_pedido);
    if (!p) return erro("pedido não encontrado");
    if (!["aprovado", "faturado", "entregue"].includes(p.status)) return erro("só dá para registrar a nota em pedido aprovado, faturado ou entregue");
    if (db.notas_fiscais.some((n) => n.pedido_id === p.id && n.status === "autorizada" && n.ambiente !== "homologacao")) return erro("o pedido já tem NF-e autorizada emitida pelo ERP");
    const antes = { ...p };
    const num = String(p_dados?.numero ?? "").trim();
    if (!num) {
      Object.assign(p, { nf_outra_empresa: null, nf_outra_cnpj: null, nf_outra_numero: null, nf_outra_data: null, nf_outra_chave: null, nf_outra_valor: null, nf_outra_motivo: null });
      registrarDemo("pedidos", "update", antes, p, "NF de outra empresa retirada", "usuario");
      return { data: p.status, error: null };
    }
    if (!String(p_dados.empresa ?? "").trim() || !p_dados.data) return erro("informe a empresa que emitiu e a data da nota");
    if (p_dados.data > dias(0)) return erro("a data da nota não pode ser depois de hoje");
    Object.assign(p, {
      nf_outra_empresa: String(p_dados.empresa).trim(), nf_outra_cnpj: String(p_dados.cnpj ?? "").replace(/\D/g, "") || null, nf_outra_numero: num, nf_outra_data: p_dados.data,
      nf_outra_chave: String(p_dados.chave ?? "").replace(/\D/g, "") || null, nf_outra_valor: p_dados.valor === "" || p_dados.valor == null ? null : Number(p_dados.valor),
      nf_outra_motivo: String(p_dados.motivo ?? "").trim() || null,
      status: p_entregue ? "entregue" : p.status === "aprovado" ? "faturado" : p.status,
    });
    registrarDemo("pedidos", "update", antes, p, `NF nº ${num} de ${p.nf_outra_empresa}`, "usuario");
    return { data: p.status, error: null };
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
  reabrir_os: ({ p_os, p_motivo, p_status = "em_reparo" }) => {
    const o = db.ordens_servico.find((x) => x.id === p_os);
    if (!o) return erro("OS não encontrada");
    if (String(p_motivo ?? "").trim().length < 5) return erro("escreva o motivo da reabertura (pelo menos 5 letras)");
    if (o.status !== "concluida") return erro("só a OS concluída e ainda não entregue pode ser reaberta");
    if (db.contas_receber.some((c) => c.os_id === o.id && c.status === "pago")) return erro("a cobrança desta OS já foi recebida: estorne o recebimento no financeiro antes de reabrir");
    for (const c of db.contas_receber.filter((x) => x.os_id === o.id && x.status === "aberto")) c.status = "cancelado";
    if (o.estoque_baixado) for (const i of db.os_itens.filter((x) => x.os_id === o.id)) movimentar(i.produto_id, "entrada", i.quantidade, `OS #${o.numero} reaberta`, { unidade_id: o.unidade_id });
    Object.assign(o, { status: p_status, concluida_em: null, estoque_baixado: false,
      reaberturas: [...(o.reaberturas ?? []), { em: quando(0), nome: "Você (prévia)", motivo: String(p_motivo).trim(), concluida_em: o.concluida_em, voltou_para: p_status }] });
    return { data: null, error: null };
  },
  receber_pedido_compra: ({ p_pedido, p_itens, p_gerar_conta, p_vencimento }) => {
    const pc = db.pedidos_compra.find((x) => x.id === p_pedido);
    if (!pc || ["recebido", "cancelado"].includes(pc.status)) return erro("pedido já finalizado");
    let valor = 0;
    const primeira = !db.pedido_compra_itens.some((i) => i.pedido_compra_id === pc.id && i.quantidade_recebida > 0);
    for (const it of p_itens) {
      const item = db.pedido_compra_itens.find((i) => i.id === it.item_id);
      const q = Number(it.quantidade) || 0;
      if (!item || q <= 0) continue;
      if (item.quantidade_recebida + q > item.quantidade) return erro(`quantidade recebida maior que a pedida em ${item.descricao}`);
      movimentar(item.produto_id, "entrada", q, `Pedido de compra #${pc.numero}`, { unidade_id: pc.unidade_id });
      if (item.custo_unitario > 0) db.produtos.find((p) => p.id === item.produto_id)!.preco_custo = item.custo_unitario;
      item.quantidade_recebida += q;
      valor += totaisOc([{ custo_unitario: Number(item.custo_unitario), ipi_aliquota: item.ipi_aliquota, quantidade: q, icms_st_valor: Number(item.icms_st_valor || 0) * q / item.quantidade }], {}).total;
    }
    const completo = db.pedido_compra_itens.filter((i) => i.pedido_compra_id === pc.id).every((i) => i.quantidade_recebida >= i.quantidade);
    pc.status = completo ? "recebido" : "parcial";
    if (completo) pc.recebido_em = quando(0);
    if (completo) valor += Number(pc.frete || 0) + Number(pc.outras_despesas || 0) - Number(pc.desconto || 0);
    const base = { fornecedor_id: pc.fornecedor_id, unidade_id: pc.unidade_id, categoria: pc.categoria || "fornecedores", documento: `PC ${pc.numero}`, status: "aberto", forma_pagamento_id: pc.forma_pagamento_id ?? null };
    if (p_gerar_conta && valor > 0) {
      const parc = (pc.parcelas ?? []) as { vencimento: string; valor: number }[];
      if (parc.length && completo && primeira) {
        // como no banco: uma conta por parcela, a última acerta os centavos
        const soma = parc.reduce((t, x) => t + Number(x.valor || 0), 0);
        let usado = 0;
        parc.forEach((x, k) => {
          const v = k === parc.length - 1 ? r2(valor - usado) : r2(soma > 0 ? valor * Number(x.valor || 0) / soma : valor / parc.length);
          usado += v;
          db.contas_pagar.push({ id: uid(), ...base, descricao: `Pedido de compra #${pc.numero} (${k + 1}/${parc.length})`, valor: v, vencimento: x.vencimento || p_vencimento || dias(30 * (k + 1)) });
        });
      } else {
        db.contas_pagar.push({ id: uid(), ...base, descricao: `Pedido de compra #${pc.numero}`, valor: r2(valor), vencimento: p_vencimento ?? dias(30) });
      }
    }
    return { data: pc.status, error: null };
  },
  concluir_producao: ({ p_ordem }) => {
    const op = db.ordens_producao.find((x) => x.id === p_ordem);
    if (!op || ["concluida", "cancelada"].includes(op.status)) return erro("ordem já finalizada");
    const fichas = db.produto_componentes as LinhaFicha[];
    if (!temFicha(fichas, op.produto_id)) return erro("cadastre a ficha técnica antes de concluir a produção");
    const comps = [...consumoEstrutura(fichas, db.produtos as any, op.produto_id, Number(op.quantidade), (db.kit_componentes ?? []) as any)];
    const faltas = comps.map(([id, q]) => ({ q, p: db.produtos.find((x) => x.id === id)! }))
      .filter(({ q, p }) => saldoUn(p.id, op.unidade_id) < q)
      .map(({ q, p }) => `${p.descricao} (falta ${q - saldoUn(p.id, op.unidade_id)})`);
    if (faltas.length) return erro(`peças insuficientes no estoque desta unidade: ${faltas.join(", ")}`);
    for (const [id, q] of comps) movimentar(id, "saida", q, `Produção OP #${op.numero}`, { unidade_id: op.unidade_id });
    movimentar(op.produto_id, "entrada", op.quantidade, `Produção OP #${op.numero}`, { unidade_id: op.unidade_id });
    db.produtos.find((p) => p.id === op.produto_id)!.preco_custo = r2(custoEstrutura(fichas, db.produtos as any, op.produto_id, (db.kit_componentes ?? []) as any));
    Object.assign(op, { status: "concluida", concluida_em: quando(0) });
    return { data: null, error: null };
  },
  lancar_contas_nota: ({ p_nota, p_parcelas = 1, p_primeiro, p_intervalo = 30, p_forma = "boleto" }) => {
    const n = db.notas_fiscais.find((x) => x.id === p_nota);
    if (n?.tipo_operacao === "entrada") return erro("nota de entrada não gera conta a receber (o pagamento de uma compra vai em Contas a pagar)");
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
    if (!!n.estoque_lancado === !p_estornar) return erro(p_estornar ? "o estoque desta nota não foi lançado" : "o estoque desta nota já foi lançado");
    // nota de entrada: lançar dá entrada e estornar tira
    const entra = p_estornar !== (n.tipo_operacao === "entrada");
    for (const i of n.itens) movimentar(i.produto_id, entra ? "entrada" : "saida", Number(i.quantidade), `${p_estornar ? "Estorno da " : ""}NF-e ${n.tipo_operacao === "entrada" ? "de entrada " : ""}${n.numero} (nota direta)`, { unidade_id: n.unidade_id });
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
  // aprovação com as regras: carga completa, cotação na validade, justificativa se não for a mais barata válida ou se trocar a transportadora
  aprovar_frete_envio: ({ p_cotacao, p_justificativa = null, p_cobrar_cliente = false }) => {
    const c = db.envio_cotacoes.find((x) => x.id === p_cotacao && x.ativa);
    if (!c) return erro("cotação não encontrada");
    const e = db.envios.find((x) => x.id === c.envio_id)!;
    if (["entregue", "cancelado"].includes(e.status)) return erro(`este envio já foi ${e.status}`);
    if (c.escolhida && e.cotacao_aprovada_id === c.id) return { data: null, error: null };
    const doEnvio = db.envio_cotacoes.filter((x) => x.envio_id === c.envio_id);
    const r = analisarAprovacao(c as CotacaoEnvio, doEnvio as CotacaoEnvio[], e as Envio, hojeISO());
    if (r.bloqueio) return erro(r.bloqueio);
    const just = String(p_justificativa ?? "").trim();
    const total = totalCotacao(c as CotacaoEnvio);
    if (r.maisCara && just.length < 5) return erro(`esta não é a opção mais barata (${nomeTranspDemo(r.barata!.transportadora_id, r.barata!.transportadora_nome)} por ${brlTxt(totalCotacao(r.barata!))}): informe a justificativa da escolha`);
    if (r.troca && just.length < 5) return erro(`o frete já foi aprovado com ${nomeTranspDemo(e.transportadora_id, e.transportadora_nome)}: informe a justificativa da troca de transportadora`);
    if (r.maisCara) excecaoDemo(e.id, "cotacao_mais_cara", just, `${nomeTranspDemo(c.transportadora_id, c.transportadora_nome)} por ${brlTxt(total)}; a mais barata válida era ${nomeTranspDemo(r.barata!.transportadora_id, r.barata!.transportadora_nome)} por ${brlTxt(totalCotacao(r.barata!))}`, r2(total - totalCotacao(r.barata!)));
    if (r.troca) excecaoDemo(e.id, "troca_transportadora", just, `De ${nomeTranspDemo(e.transportadora_id, e.transportadora_nome)} para ${nomeTranspDemo(c.transportadora_id, c.transportadora_nome)}`);
    doEnvio.forEach((x) => (x.escolhida = x.id === c.id));
    if (e.valor_aprovado !== total) Object.assign(e, { conferencia_obs: null, conferido_por: null, conferido_em: null });
    Object.assign(e, { transportadora_id: c.transportadora_id, transportadora_nome: c.transportadora_id ? null : c.transportadora_nome, valor_cotado: total, valor_aprovado: total, prazo_dias: c.prazo_dias,
      tipo_servico: c.tipo_servico ?? "padrao", tabela_versao: c.tabela_versao ?? null, cotacao_aprovada_id: c.id, justificativa_escolha: r.maisCara || r.troca ? just : null,
      aprovado_em: new Date().toISOString(), aprovado_por: sessao?.user.id ?? null, status: ["cotacao", "aprovacao"].includes(e.status) ? "coleta" : e.status });
    const p = db.pedidos.find((x) => x.id === e.pedido_id);
    if (p) {
      p.transportadora_id = c.transportadora_id;
      if (p_cobrar_cliente && p.status === "orcamento") { Object.assign(p, { frete: total, modalidade_frete: 0 }); e.valor_cobrado_cliente = total; }
    }
    recalcular(db);
    return { data: null, error: null };
  },
  aprovar_cotacao_envio: ({ p_cotacao, p_cobrar_cliente = false }) => rpcs.aprovar_frete_envio({ p_cotacao, p_justificativa: null, p_cobrar_cliente }),
  // cartão corporativo: o do responsável e, para o financeiro e o administrador, todos
  cartoes_corporativos: () => ({ data: db.contas_bancarias.filter((c) => c.cartao_nome && c.ativo && (podeFinanceiro() || c.cartao_responsavel === sessao?.user.id)).map((c) => {
    const u = db.unidades.find((x) => x.id === c.unidade_id);
    const datas = db.extrato_lancamentos.filter((e) => e.conta_bancaria_id === c.id).map((e) => e.data).sort();
    return { id: c.id, nome: c.nome, cartao_nome: c.cartao_nome, cartao_responsavel: c.cartao_responsavel, unidade_id: c.unidade_id, unidade_nome: u?.nome ?? null, unidade_cnpj: u?.cnpj ?? null, extrato_ate: datas[datas.length - 1] ?? null };
  }), error: null }),
  gastos_cartao: ({ p_conta, p_de }) => {
    const c = db.contas_bancarias.find((x) => x.id === p_conta);
    if (!c || !(podeFinanceiro() || c.cartao_responsavel === sessao?.user.id)) return erro("Sem acesso a este cartão");
    return { data: db.extrato_lancamentos.filter((e) => e.conta_bancaria_id === p_conta && Number(e.valor) < 0 && e.data >= p_de && e.status !== "transferencia")
      .sort((a, b) => (a.data < b.data ? 1 : -1)).map((e) => {
        const g = (db.cartao_gastos ?? []).find((x: Row) => x.lancamento_id === e.id) ?? {};
        return { id: e.id, data: e.data, valor: e.valor, descricao: e.descricao, identificador: e.identificador, status: e.status, conta_pagar_id: e.conta_pagar_id,
          situacao: g.situacao ?? "pendente", categoria: g.categoria ?? null, nota_numero: g.nota_numero ?? null, nfe_recebida_id: g.nfe_recebida_id ?? null, observacao: g.observacao ?? null, atualizado_em: g.atualizado_em ?? null };
      }), error: null };
  },
  notas_cartao: ({ p_conta }) => {
    const c = db.contas_bancarias.find((x) => x.id === p_conta);
    return { data: db.nfe_recebidas.filter((n) => n.unidade_id === c?.unidade_id).map((n) => ({ id: n.id, chave: n.chave, emitente_nome: n.emitente_nome, valor_total: n.valor_total, data_emissao: String(n.data_emissao).slice(0, 10) })), error: null };
  },
  marcar_gasto_cartao: ({ p_lancamento, p_situacao, p_categoria = null, p_nota = null, p_obs = null, p_nfe = null }) => {
    const e = db.extrato_lancamentos.find((x) => x.id === p_lancamento && Number(x.valor) < 0);
    if (!e) return erro("Lançamento não encontrado");
    const c = db.contas_bancarias.find((x) => x.id === e.conta_bancaria_id);
    if (!(podeFinanceiro() || c?.cartao_responsavel === sessao?.user.id)) return erro("Sem acesso a este cartão");
    if (p_situacao === "sem_nota" && String(p_obs ?? "").trim().length < 3) return erro("Escreva por que não há nota");
    db.cartao_gastos ??= [];
    let g = db.cartao_gastos.find((x: Row) => x.lancamento_id === p_lancamento);
    if (!g) { g = { lancamento_id: p_lancamento, categoria: null, nota_numero: null, nfe_recebida_id: null, observacao: null }; db.cartao_gastos.push(g); }
    Object.assign(g, { situacao: p_situacao, categoria: p_categoria ?? g.categoria, nota_numero: String(p_nota ?? "").trim() || (p_situacao === "recebida" ? g.nota_numero : null),
      nfe_recebida_id: p_nfe ?? (p_situacao === "recebida" ? g.nfe_recebida_id : null), observacao: String(p_obs ?? "").trim() || g.observacao, atualizado_em: new Date().toISOString() });
    return { data: null, error: null };
  },
  // agendamento da coleta: mesma regra do banco (frequência da transportadora no endereço; fora dela, só urgência)
  agendar_coleta: ({ p_envio, p_data, p_periodo, p_protocolo = null, p_urgente = false, p_obs = null }) => {
    const e = db.envios.find((x) => x.id === p_envio);
    if (!e) return erro("Envio não encontrado");
    if (["entregue", "cancelado"].includes(e.status) || e.coletado_em) return erro("Este envio já foi coletado, entregue ou cancelado");
    if (!e.transportadora_id && !String(e.transportadora_nome ?? "").trim()) return erro("Escolha a transportadora antes de agendar a coleta");
    const t = db.transportadoras.find((x) => x.id === e.transportadora_id);
    const problema = conferirAgendamento(p_data, p_periodo, hojeISO(), frequenciaDe((db.coleta_frequencias ?? []) as FrequenciaColeta[], t ? { id: String(t.id), matriz_id: t.matriz_id ?? null } : null, e.unidade_id), !!p_urgente);
    if (problema) return erro(problema);
    Object.assign(e, { coleta_prevista: p_data, coleta_periodo: p_periodo, coleta_urgente: !!p_urgente, coleta_protocolo: String(p_protocolo ?? "").trim() || e.coleta_protocolo || null,
      coleta_obs: String(p_obs ?? "").trim() || null, coleta_agendada_por: sessao?.user.id ?? null, coleta_agendada_em: new Date().toISOString() });
    return { data: { coleta_prevista: p_data, coleta_periodo: p_periodo, urgente: !!p_urgente }, error: null };
  },
  // adicional fora da cotação aprovada: só com justificativa; soma no aprovado
  registrar_adicional_envio: ({ p_envio, p_tipo, p_valor, p_justificativa, p_descricao = null }) => {
    const e = db.envios.find((x) => x.id === p_envio);
    if (!e) return erro("envio não encontrado");
    if (e.status === "cancelado") return erro("este envio foi cancelado");
    const c = db.envio_cotacoes.find((x) => x.id === e.cotacao_aprovada_id) ?? db.envio_cotacoes.find((x) => x.envio_id === p_envio && x.escolhida && x.ativa);
    if (!e.aprovado_em || !c) return erro("o frete ainda não foi aprovado: registre o adicional na própria cotação");
    if (!TIPOS_ADICIONAL_DEMO.includes(p_tipo)) return erro("adicional inválido: use TDE, TRT, agendamento, pedágio, GRIS, ad valorem ou outro");
    if (!(Number(p_valor) > 0)) return erro("informe o valor do adicional");
    const just = String(p_justificativa ?? "").trim();
    if (just.length < 5) return erro("adicional fora da cotação aprovada só com justificativa (quem pediu e por quê)");
    const valor = r2(Number(p_valor));
    c.adicionais = [...(c.adicionais ?? []), { tipo: p_tipo, ...(texto(p_descricao) ? { descricao: texto(p_descricao) } : {}), valor, previsto: false, justificativa: just, por: sessao?.user.id ?? null, em: new Date().toISOString() }];
    c.valor_total = r2(Number(c.valor) + c.adicionais.reduce((s: number, a: Row) => s + Number(a.valor), 0));
    if (e.valor_final != null) Object.assign(e, { conferencia_obs: null, conferido_por: null, conferido_em: null });
    e.valor_aprovado = r2(Number(e.valor_aprovado ?? 0) + valor);
    excecaoDemo(e.id, "adicional_nao_previsto", just, ROTULO_ADICIONAL_DEMO[p_tipo] + (texto(p_descricao) ? ` · ${texto(p_descricao)}` : ""), valor);
    return { data: null, error: null };
  },
  // frete pago: lança o frete final no contas a pagar (categoria frete) e liga ao envio
  lancar_frete_contas_pagar: ({ p_envio, p_vencimento = null }) => {
    if (!podeFinanceiro()) return erro("sem permissão para esta ação");
    const e = db.envios.find((x) => x.id === p_envio);
    if (!e) return erro("envio não encontrado");
    if (e.status === "cancelado") return erro("este envio foi cancelado");
    if (!(Number(e.valor_final) > 0)) return erro("informe o frete final faturado pela transportadora (valor do CT-e) antes de lançar");
    if (e.pagador !== "empresa") return erro(`o frete deste envio é pago pelo ${e.pagador === "cliente" ? "cliente" : "terceiro"}`);
    if (e.conta_pagar_id && db.contas_pagar.some((c) => c.id === e.conta_pagar_id && c.status !== "cancelado")) return erro("o frete deste envio já está no contas a pagar");
    if (freteDivergente(e.valor_aprovado, e.valor_final) && !e.conferido_em) return erro("o frete final diverge do aprovado: registre a conferência antes de lançar");
    const ped = db.pedidos.find((p) => p.id === e.pedido_id);
    const conta: Row = {
      id: uid(), descricao: `Frete envio #${e.numero} · ${nomeTranspDemo(e.transportadora_id, e.transportadora_nome)}`, categoria: "frete", documento: texto(e.cte_numero),
      valor: Number(e.valor_final), vencimento: p_vencimento ?? dias(30), status: "aberto", data_pagamento: null, valor_pago: null, unidade_id: e.unidade_id ?? U_SC,
      rateio: e.centro_custo_id ? [{ centro_custo_id: e.centro_custo_id, percentual: 100 }] : [], observacoes: `Gerado pelo ERP a partir do envio #${e.numero}${ped ? ` (pedido #${ped.numero})` : ""}`, created_at: quando(0),
    };
    db.contas_pagar.push(conta);
    registrarDemo("contas_pagar", "insert", null, { ...conta }, null, "sistema");
    e.conta_pagar_id = conta.id;
    return { data: conta.id, error: null };
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
/** Extrato OFX de exemplo (conta Nubank SC da demonstração). */
function ofxExemplo() {
  const d = (n: number) => dias(n).replace(/-/g, "");
  return `OFXHEADER:100\nDATA:OFXSGML\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0260<ACCTID>9988771</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${d(-3)}<TRNAMT>1850.00<FITID>demo-email-1<MEMO>Pix recebido Sorveteria Gelato Nobre</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d(-2)}<TRNAMT>-89.90<FITID>demo-email-2<MEMO>Tarifa pacote de serviços</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${d(-1)}<TRNAMT>420.00<FITID>demo-email-3<MEMO>Pix recebido Juliana Rezende</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>8380.10<DTASOF>${d(-1)}</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

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

// NFS-e: simula a Focus/prefeitura (autoriza alguns segundos depois; o texto com "rejeitar" volta rejeitado)
let numeroNfse = 120;
function nfseDemo(b: Row) {
  const evento = (n: Row, tipo: string, detalhe: string | null, antes: string | null = null, depois: string | null = null) =>
    db.nfse_eventos.push({ id: db.nfse_eventos.length + 1, nfse_id: n.id, tipo, status_antes: antes, status_depois: depois, http_status: null, detalhe, created_at: quando(0) });
  const mudar = (n: Row, status: string, extra: Row = {}) => {
    const antes = n.status;
    Object.assign(n, extra, { status, updated_at: quando(0) });
    evento(n, "status", extra.mensagem ?? null, antes, status);
    const os = db.ordens_servico.find((o) => o.id === n.os_id);
    if (status === "autorizada" && os) {
      Object.assign(os, { faturada_em: quando(0), nfse_id: n.id });
      db.contas_receber.filter((c) => c.os_id === os.id && !c.nfse_id).forEach((c) => { c.nfse_id = n.id; });
    }
    if (status === "cancelada" && os && os.nfse_id === n.id) {
      Object.assign(os, { faturada_em: null, nfse_id: null });
      db.contas_receber.filter((c) => c.nfse_id === n.id).forEach((c) => { c.nfse_id = null; });
    }
  };
  const nota = () => { const n = db.nfse.find((x) => x.id === b.id); if (!n) throw new Error("NFS-e não encontrada"); return n; };
  if (b.acao === "previa" || b.acao === "emitir") {
    const os = db.ordens_servico.find((o) => o.id === b.os_id);
    if (!os) throw new Error("OS não encontrada");
    const c = db.clientes.find((x) => x.id === os.cliente_id);
    const cfg = db.nfse_config.find((x) => x.unidade_id === (os.unidade_id ?? U_SC));
    const valor = r2(Number(os.valor_mao_obra ?? 0) + (cfg?.incluir_pecas ? Number(os.valor_pecas ?? 0) : 0));
    const pendencias: string[] = [];
    if (!cfg?.ativo) pendencias.push("A NFS-e não está ativada para esta unidade: Notas fiscais → NFS-e (serviços) → Configuração por unidade");
    if (!["concluida", "entregue"].includes(os.status)) pendencias.push("Conclua a OS antes de emitir a nota de serviço");
    if (valor <= 0) pendencias.push(os.em_garantia ? "OS em garantia sem valor cobrado: não há serviço a faturar" : "A OS não tem valor de mão de obra");
    if (!c?.cpf_cnpj) pendencias.push("O cliente não tem CPF/CNPJ válido no cadastro");
    const viva = db.nfse.find((n) => n.os_id === os.id && ["pendente", "processando", "autorizada", "incerto"].includes(n.status));
    if (viva) pendencias.push(viva.status === "autorizada" ? `Esta OS já tem NFS-e autorizada (nº ${viva.numero})` : "Esta OS já tem uma NFS-e em andamento: aguarde o resultado");
    const aliquota = cfg?.aliquota_iss ?? null;
    const discriminacao = (b.discriminacao?.trim() || String(cfg?.discriminacao_modelo ?? "Serviço de assistência técnica — OS nº {os}. Equipamento: {equipamento}. Serviço realizado: {solucao}").replace("{os}", String(os.numero)).replace("{equipamento}", os.equipamento ?? "—")
      .replace("{solucao}", os.solucao || os.diagnostico || "—").replace("{serie}", os.numero_serie ?? "—").replace("{defeito}", os.defeito_relatado ?? "—").replace("{cliente}", c?.nome ?? ""));
    const previa = {
      pendencias, avisos: c?.email ? [] : ["Cliente sem e-mail: a nota não será enviada por e-mail (dá para mandar o PDF pelo WhatsApp)"],
      ambiente: "producao", padrao: cfg?.padrao ?? "nacional",
      tomador: { nome: c?.nome ?? "—", documento: c?.cpf_cnpj ?? "", email: c?.email ?? null,
        endereco: [[c?.logradouro, c?.numero].filter(Boolean).join(", "), c?.bairro, [c?.municipio, c?.uf].filter(Boolean).join("/")].filter(Boolean).join(" · "),
        municipio: [c?.municipio, c?.uf].filter(Boolean).join("/") || null },
      valor_servicos: valor, valor_pecas: Number(os.valor_pecas ?? 0), incluir_pecas: !!cfg?.incluir_pecas, aliquota_iss: aliquota,
      valor_iss: aliquota != null ? r2(valor * aliquota / 100) : null, iss_retido: !!cfg?.iss_retido, discriminacao,
    };
    if (b.acao === "previa") return previa;
    if (pendencias.length) throw new Error(`Antes de emitir: ${pendencias.join("; ")}`);
    const tentativa = db.nfse.filter((n) => n.os_id === os.id).length + 1;
    const dps = cfg ? cfg.proximo_numero_dps++ : null;
    const n: Row = {
      id: uid(), referencia: `nfse-os-${os.numero}-${tentativa}-${uid().slice(-6)}`, unidade_id: os.unidade_id ?? U_SC, os_id: os.id, cliente_id: os.cliente_id,
      substitui_id: b.substitui_id ?? null, status: "pendente", ambiente: "producao", padrao: previa.padrao, valor_servicos: valor, aliquota_iss: aliquota,
      valor_iss: previa.valor_iss, iss_retido: previa.iss_retido, discriminacao, tomador: previa.tomador, servico: { os_numero: os.numero }, serie_dps: dps ? cfg!.serie_dps : null,
      numero_dps: dps, numero: null, codigo_verificacao: null, chave_acesso: null, data_emissao: null, url: null, url_danfse: null, xml_url: null, mensagem: null,
      tentativas: 1, solicitado_em: quando(0), solicitado_por: sessao?.user.id ?? null, autorizada_em: null, cancelada_em: null, cancelamento_motivo: null, created_at: quando(0),
    };
    db.nfse.push(n);
    evento(n, "status", null, null, "pendente");
    evento(n, "envio", "recebida, aguardando a prefeitura");
    mudar(n, "processando");
    setTimeout(() => {
      if (/rejeitar/i.test(discriminacao)) mudar(n, "rejeitada", { mensagem: "L99 — Regime Especial de Tributação ausente/inválido — Correção: Corrija o Regime Especial de Tributação" });
      else {
        const numero = String(++numeroNfse);
        mudar(n, "autorizada", { numero, codigo_verificacao: "ABC" + numero, data_emissao: quando(0), autorizada_em: quando(0),
          chave_acesso: `4216602212345678000190000000000${numero}2610${numero}`.padEnd(50, "0").slice(0, 50),
          url: "https://www.nfse.gov.br/consultapublica", url_danfse: "https://www.nfse.gov.br/consultapublica" });
      }
    }, 2500);
    return { ok: true, nfse: n };
  }
  if (b.acao === "consultar") { const n = nota(); evento(n, "consulta", n.status); return { ok: true, nfse: n }; }
  if (b.acao === "cancelar") {
    const n = nota();
    const motivo = String(b.motivo ?? "").trim();
    if (motivo.length < 15) throw new Error("Escreva o motivo do cancelamento (de 15 a 255 caracteres)");
    if (n.status !== "autorizada") throw new Error("Só uma NFS-e autorizada pode ser cancelada");
    Object.assign(n, { cancelamento_motivo: motivo, cancelamento_solicitado_em: quando(0) });
    evento(n, "cancelamento_solicitado", motivo);
    mudar(n, "cancelada", { cancelada_em: quando(0) });
    return { ok: true, nfse: n };
  }
  throw new Error("ação inválida");
}

const funcoes: Record<string, (b: any) => any> = {
  mercadolivre: (b) => {
    if (b.acao !== "pos_venda") return { ok: true, resultado: null };
    const conta = (db.ml_contas ?? [])[0];
    const notas = { enviadas: 0, erros: 0 }, rastreios = { enviados: 0, erros: 0 };
    for (const v of db.ml_pedidos ?? []) {
      const autorizada = db.notas_fiscais.some((n) => n.pedido_id === v.pedido_id && n.status === "autorizada");
      if (conta?.emitir_nfe && v.pedido_id && autorizada && !v.nota_enviada_em && !v.nota_erro && v.situacao !== "cancelada") {
        Object.assign(v, { nota_enviada_em: quando(0), nota_ml_id: `fd-${v.id}` }); notas.enviadas++;
      }
      const exp = db.expedicoes.find((e) => e.pedido_id === v.pedido_id && ["despachado", "entregue"].includes(e.status) && e.codigo_rastreio);
      if (["me1", "custom"].includes(v.envio_modo) && exp && !v.rastreio_enviado_em && v.rastreio_tentativas < 5) {
        Object.assign(v, { rastreio_enviado_em: quando(0), rastreio_erro: null, envio_status: "shipped", rastreio_ml: exp.codigo_rastreio }); rastreios.enviados++;
      }
    }
    return { ok: true, resultado: { notas, rastreios } };
  },
  nfse: (b) => nfseDemo(b),
  "cotacao-enviar": (b) => {
    const forns = db.cotacao_fornecedores.filter((x) => x.cotacao_id === b.cotacao_id && (b.fornecedores?.length ? b.fornecedores.includes(x.id) : x.status === "pendente"));
    const comEmail = forns.filter((x) => x.email || db.fornecedores.find((f) => f.id === x.fornecedor_id)?.email);
    rpcs.cotacao_marcar_enviada({ p_ids: comEmail.map((x) => x.id) });
    return { ok: true, enviados: comEmail.length, sem_email: forns.filter((x) => !comEmail.includes(x)).map((x) => nomeFornDemo(x.fornecedor_id)), falhas: [] };
  },
  "nfe-emitir": (b) => {
    if (b.devolucao) return devolucaoDemo(b);
    if (b.avulsa) {
      const a = b.avulsa;
      const c = db.clientes.find((x) => x.id === a.cliente_id);
      if (!c) throw new Error("escolha o cliente");
      const itens = (a.itens ?? []).map((i: Row) => ({ ...i, descricao: i.descricao || db.produtos.find((p) => p.id === i.produto_id)?.descricao }));
      const total = r2(itens.reduce((s2: number, i: Row) => s2 + i.quantidade * i.valor_unitario, 0) - Number(a.desconto ?? 0) + Number(a.frete ?? 0));
      const op = operacaoNota(a.operacao);
      const chave = String(a.chave_referenciada ?? "").replace(/\D/g, "");
      if (chave && !chaveValida(chave)) throw new Error("chave da NF referenciada inválida: confira os 44 números (ou deixe em branco)");
      const entrada = !!op?.entrada;
      const cfop = op?.cfop ? cfopDaOperacao(op.cfop, (c.uf ?? "SC").toUpperCase() !== "SC") : "5102";
      const nota: Row = { id: uid(), pedido_id: null, unidade_id: a.unidade_id, cliente_id: c.id, destinatario_nome: c.nome, destinatario_doc: c.cpf_cnpj,
        referencia: `${entrada ? "entrada" : "direta"}-${uid()}`, status: "processando", valor_total: total, created_at: quando(0), operacao: a.operacao, itens, estoque_lancado: false,
        tipo_operacao: entrada ? "entrada" : "saida", finalidade: "normal", observacao_interna: entrada ? `Nota de entrada · ${op!.rotulo}` : "Nota direta",
        chave_referenciada: chave || null,
        payload: { natureza_operacao: a.natureza || op?.natureza || "Venda de mercadoria", tipo_documento: entrada ? 0 : 1, ...(chave ? { notas_referenciadas: [{ chave_nfe: chave }] } : {}),
          items: itens.map((i: Row, k: number) => ({ numero_item: k + 1, descricao: i.descricao, cfop, quantidade_comercial: i.quantidade, valor_unitario_comercial: i.valor_unitario, valor_bruto: r2(i.quantidade * i.valor_unitario),
            ...(entrada ? { icms_situacao_tributaria: op!.icms_cst, pis_situacao_tributaria: op!.pis_cofins_cst, cofins_situacao_tributaria: op!.pis_cofins_cst } : {}) })) } };
      db.notas_fiscais.push(nota);
      setTimeout(() => Object.assign(nota, { status: "autorizada", numero: String(++numeroNfe), serie: "1", mensagem: "Autorizado o uso da NF-e" }), 3000);
      return { ok: true, nota };
    }
    if (b.transferencia_id) {
      const t = db.transferencias.find((x) => x.id === b.transferencia_id)!;
      const valor = db.transferencia_itens.filter((i) => i.transferencia_id === t.id).reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);
      const origem = db.unidades.find((u) => u.id === t.origem_id);
      const inter = origem?.uf !== db.unidades.find((u) => u.id === t.destino_id)?.uf;
      const items = db.transferencia_itens.filter((i) => i.transferencia_id === t.id).map((i, k) => ({ numero_item: k + 1, descricao: i.descricao,
        cfop: `${inter ? "6" : "5"}${db.produtos.find((p) => p.id === i.produto_id)?.tipo === "maquina" && origem?.fabrica ? "151" : "152"}`,
        quantidade_comercial: i.quantidade, valor_unitario_comercial: i.custo_unitario, valor_bruto: r2(i.quantidade * i.custo_unitario), icms_situacao_tributaria: origem?.transf_icms_cst ?? "41" }));
      const nota = { id: uid(), transferencia_id: t.id, unidade_id: t.origem_id, referencia: `transf-${t.numero}-1`, status: "processando", valor_total: r2(valor), created_at: quando(0),
        ambiente: "producao", payload: { natureza_operacao: "Transferência de mercadoria", items } };
      db.notas_fiscais.push(nota);
      setTimeout(() => Object.assign(nota, { status: "autorizada", numero: String(++numeroNfe), serie: "1", chave: `42261000000000000000550010000${String(numeroNfe).padStart(6, "0")}100000000`.slice(0, 44), mensagem: "Autorizado o uso da NF-e" }), 3000);
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
    if (b.acao === "sincronizar_ctes") return { ok: true, novos: 0, atualizados: 0, completos: 0, avisos: [] };
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
      const conteudo = a?.nfe ? xmlExemplo() : a?.extrato ? ofxExemplo() : "Arquivo de demonstração";
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
  // Rodonaves: na demonstração a cotação é uma conta de exemplo (peso e valor), com as mesmas exigências da função
  rodonaves: (b) => {
    if (b.acao === "testar") return { ok: true, servidor: "01wapi (demonstração)", tentativas: [] };
    if (b.acao !== "cotar") return { ok: true };
    const e = db.envios.find((x) => x.id === b.envio_id);
    if (!e) throw new Error("envio não encontrado");
    const u = db.unidades.find((x) => x.id === e.unidade_id);
    const falta = faltaParaCotarRte({ ...e, cep_origem: e.cep_origem || u?.cep }, u?.cnpj);
    if (falta.length) throw new Error(`Para cotar na Rodonaves falta: ${falta.join(", ")}. Complete e salve o envio.`);
    const valor = r2(48 + Number(e.peso_total_kg) * 1.9 + Number(e.valor_mercadoria) * 0.006);
    return { ok: true, valor, prazo: e.uf_destino === "SC" ? 2 : 5, origem: `${String(u?.municipio ?? "").toUpperCase()}/${u?.uf ?? ""}`,
      destino: `${String(e.cidade_destino ?? "").toUpperCase()}/${e.uf_destino ?? ""}`, servidor: "demonstração" };
  },
  infinitepay: (b) => {
    // mesmo caminho da função: conta, pedido (todas as parcelas em aberto), proposta aprovada e área do cliente
    const alvoConta = (id: string) => {
      const c = db.contas_receber.find((x) => x.id === id);
      if (!c) throw new Error("conta não encontrada");
      if (c.status !== "aberto") throw new Error("esta conta não está em aberto");
      return { contaId: c.id, pedidoId: null as string | null, unidadeId: c.unidade_id, descricao: c.descricao, valor: Number(c.valor), forma: c.forma_pagamento as string | null };
    };
    const alvoPedido = (id: string) => {
      const p = db.pedidos.find((x) => x.id === id);
      if (!p) throw new Error("pedido não encontrado");
      if (!["aprovado", "faturado", "entregue"].includes(p.status)) throw new Error("Aprove a venda antes de gerar o link de pagamento.");
      const abertas = db.contas_receber.filter((x) => x.pedido_id === p.id && x.status === "aberto");
      if (!abertas.length) throw new Error("Este pedido não tem parcela em aberto: já está pago.");
      return { contaId: abertas.length === 1 ? abertas[0].id : null, pedidoId: p.id, unidadeId: p.unidade_id,
        descricao: `Pedido #${p.numero}${abertas.length > 1 ? ` (${abertas.length} parcelas)` : ""}`, valor: r2(abertas.reduce((s, x) => s + Number(x.valor), 0)), forma: p.forma_pagamento as string | null };
    };
    if (b.acao === "mp_status") return { unidades: db.unidades.map((u) => ({ unidade_id: u.id, codigo: u.codigo, secret: "MERCADOPAGO_ACCESS_TOKEN", conta: "CONTA_EXEMPLO", erro: null })) };
    let a: ReturnType<typeof alvoConta>;
    if (b.acao === "criar") a = alvoConta(b.conta_id);
    else if (b.acao === "criar_pedido") a = alvoPedido(b.pedido_id);
    else if (b.acao === "pagar_proposta") {
      const p = db.pedidos.find((x) => x.proposta_token === b.token && x.proposta_status);
      if (!p) throw new Error("proposta não encontrada");
      if (!["pix", "cartao"].includes(p.forma_pagamento)) throw new Error("Esta venda não é paga por link: fale com o vendedor.");
      a = alvoPedido(p.id);
    } else if (b.acao === "pagar_conta") {
      const cli = db.clientes.find((x) => x.portal_token === b.token);
      const c = cli && db.contas_receber.find((x) => x.id === b.conta_id && x.cliente_id === cli.id);
      if (!c) throw new Error("conta não encontrada");
      a = alvoConta(c.id);
    } else return { ok: true };
    const u = db.unidades.find((x) => x.id === a.unidadeId) ?? db.unidades.find((x) => x.matriz);
    if (!u) throw new Error("unidade não encontrada");
    // cartão pelo Checkout do Mercado Pago quando a configuração manda (ou o botão pede)
    const provedor = b.provedor === "mercadopago" || b.provedor === "infinitepay" ? b.provedor
      : a.forma === "cartao" && db.configuracoes[0]?.link_cartao_provedor === "mercadopago" ? "mercadopago" : "infinitepay";
    if (provedor === "infinitepay" && !u.infinitepay_tag) throw new Error(`Cadastre a InfiniteTag da ${u.nome} em Configurações → Unidades.`);
    const handle = provedor === "mercadopago" ? `mercadopago:${u.codigo}` : u.infinitepay_tag;
    if (!db.cobrancas_link) db.cobrancas_link = [];
    const doAlvo = (l: Row) => l.status === "aberto" && (a.pedidoId ? l.pedido_id === a.pedidoId || (a.contaId && l.conta_receber_id === a.contaId) : l.conta_receber_id === a.contaId);
    const igual = db.cobrancas_link.find((l) => doAlvo(l) && l.handle === handle && Number(l.valor) === a.valor && (l.conta_receber_id ?? null) === a.contaId);
    if (igual) return { id: igual.id, url: igual.url, reaproveitado: true, provedor };
    for (const l of db.cobrancas_link) if (doAlvo(l)) l.status = "descartado";
    const l: Row = { id: uid(), conta_receber_id: a.contaId, pedido_id: a.pedidoId, unidade_id: u.id, provedor, handle, descricao: a.descricao, valor: a.valor, status: "aberto",
      url: provedor === "mercadopago" ? `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=demo-${uid().slice(0, 8)}` : `https://checkout.infinitepay.io/${u.infinitepay_tag}?demo=${uid().slice(0, 8)}`,
      created_at: new Date().toISOString(), metodo: null, parcelas: null, recibo_url: null, pago_em: null, erro: null };
    db.cobrancas_link.push(l);
    return { id: l.id, url: l.url, reaproveitado: false, provedor };
  },
  whatsapp: (b) => {
    const cfg = db.configuracoes[0];
    if (!db.whatsapp_mensagens) db.whatsapp_mensagens = [];
    const st = () => ({ configurado: !!cfg.whatsapp_numero_id, ativo: !!cfg.whatsapp_api_ativo, numero: cfg.whatsapp_numero, nome: cfg.whatsapp_nome,
      numero_id: cfg.whatsapp_numero_id, waba_id: cfg.whatsapp_waba_id, assinatura: true, webhook: "https://seu-projeto.supabase.co/functions/v1/whatsapp", verify_token: "demo3f9a1c" });
    if (b.acao === "status") return st();
    if (b.acao === "configurar") { Object.assign(cfg, { whatsapp_numero_id: b.numero_id, whatsapp_waba_id: b.waba_id, whatsapp_numero: "+55 48 3030-4040", whatsapp_nome: "MF Máquinas" }); return { ok: true, numero: cfg.whatsapp_numero, webhook: st().webhook, verify_token: st().verify_token, inscrito: true }; }
    if (b.acao === "automatico") { cfg.whatsapp_api_ativo = b.ligado === true; return { ok: true, ativo: cfg.whatsapp_api_ativo }; }
    if (b.acao === "modelos") {
      let enviados = 0;
      for (const e of db.regua_cobranca.filter((x) => x.canal_whatsapp)) {
        if (e.wa_modelo && e.wa_mensagem_base === e.mensagem && e.wa_status !== "REJECTED") { if (e.wa_status === "PENDING") e.wa_status = "APPROVED"; continue; }
        const m = modeloDaMensagem(e.mensagem);
        Object.assign(e, { wa_modelo: nomeModelo(e as any, m.texto), wa_texto: m.texto, wa_variaveis: m.variaveis, wa_mensagem_base: e.mensagem, wa_status: "PENDING", wa_erro: null });
        enviados++;
      }
      return { ok: true, enviados, erros: [] };
    }
    if (b.acao === "responder") {
      db.whatsapp_mensagens.unshift({ id: uid(), direcao: "saida", telefone: b.telefone, cliente_id: db.whatsapp_mensagens.find((m) => m.telefone === b.telefone)?.cliente_id ?? null,
        texto: b.texto, status: "enviado", erro: null, created_at: new Date().toISOString() });
      return { ok: true };
    }
    if (b.acao === "teste") return { ok: true };
    return { ok: true, enviadas: 0, erros: 0 };
  },
  inter: (b) => {
    // prévia: o "Inter" aceita qualquer credencial com certificado e chave e manda alguns lançamentos
    if (!db.inter_conexoes) db.inter_conexoes = [];
    const novos = (c: Row) => {
      let n = 0;
      for (const l of [
        { data: dias(-2), valor: 3200, descricao: "Pix recebido · PIX RECEBIDO · Doce Gelo Sorvetes", id: "1" },
        { data: dias(-1), valor: -12.5, descricao: "Tarifa · Tarifa Pix", id: "2" },
      ]) {
        const identificador = `inter-demo-${c.id}-${l.id}`;
        if (db.extrato_lancamentos.some((x) => x.conta_bancaria_id === c.conta_bancaria_id && x.identificador === identificador)) continue;
        db.extrato_lancamentos.push({ id: uid(), conta_bancaria_id: c.conta_bancaria_id, importacao_id: null, data: l.data, valor: l.valor, descricao: l.descricao, documento: null,
          identificador, status: "pendente", conta_receber_id: null, conta_pagar_id: null, baixou_conta: false, par_transferencia_id: null, observacao: null,
          origem: "inter", inter_conexao_id: c.id, created_at: new Date().toISOString() });
        n++;
      }
      const conciliadas = n ? conciliarAutoDemo(c.conta_bancaria_id) : 0;
      Object.assign(c, { status: "ativa", erro: null, sincronizado_em: new Date().toISOString(), ultimas_novas: n, saldo: 15230.4, saldo_em: new Date().toISOString() });
      return { novas: n, conciliadas, saldo: c.saldo };
    };
    if (b.acao === "ligar") {
      let c = db.inter_conexoes.find((x) => x.id === b.conexao_id && x.status !== "desligada");
      if (!c) {
        if (!String(b.client_id ?? "").trim() || !String(b.client_secret ?? "").trim()) throw new Error("Informe o Client ID e o Client Secret do app do Inter.");
        if (!/BEGIN CERTIFICATE/.test(String(b.cert ?? "")) || !/PRIVATE KEY/.test(String(b.key ?? ""))) throw new Error("Envie o certificado (.crt) e a chave (.key) do app do Inter.");
        c = { id: uid(), conta_bancaria_id: b.conta_bancaria_id, conta_corrente: b.conta_corrente || null, status: "ativa", erro: null, desde: b.desde,
          sincronizado_em: null, ultimas_novas: 0, saldo: null, saldo_em: null, certificado_validade: quando(365), created_at: new Date().toISOString() };
        db.inter_conexoes.push(c);
      } else Object.assign(c, { conta_corrente: b.conta_corrente || null, desde: b.desde || c.desde });
      return { ok: true, conexao_id: c.id, ...novos(c) };
    }
    if (b.acao === "sincronizar") {
      const resultado: Record<string, unknown> = {};
      for (const c of db.inter_conexoes.filter((x) => x.status !== "desligada" && (!b.conexao_id || x.id === b.conexao_id))) resultado[c.id] = novos(c);
      return { ok: true, resultado };
    }
    if (b.acao === "desligar") { const c = db.inter_conexoes.find((x) => x.id === b.conexao_id); if (c) c.status = "desligada"; return { ok: true }; }
    if (b.acao === "boletos_ligar" || b.acao === "boletos_desligar") {
      const c = db.inter_conexoes.find((x) => x.id === b.conexao_id);
      if (c) Object.assign(c, { boletos: b.acao === "boletos_ligar", boletos_erro: null, boletos_webhook_em: b.acao === "boletos_ligar" ? new Date().toISOString() : null });
      return { ok: true, aviso: null };
    }
    if (!db.boletos_inter) db.boletos_inter = [];
    if (b.acao === "boleto_emitir") {
      const conta = db.contas_receber.find((x) => x.id === b.conta_id);
      if (!conta || conta.status !== "aberto") throw new Error("Só conta em aberto recebe boleto.");
      if (db.boletos_inter.some((x) => x.conta_receber_id === conta.id && ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "PROTESTO"].includes(x.situacao))) throw new Error("Esta conta já tem um boleto em aberto: cancele o anterior para emitir outro.");
      const cx = db.inter_conexoes.find((x) => x.boletos && db.contas_bancarias.find((cb) => cb.id === x.conta_bancaria_id)?.unidade_id === conta.unidade_id);
      if (!cx) throw new Error("A unidade desta conta não tem conta do Inter com boletos ligados (Bancos e conciliação → Banco Inter → Ligar boletos).");
      const centavos = String(Math.round(Number(conta.valor) * 100)).padStart(10, "0");
      const boleto = { id: uid(), conta_receber_id: conta.id, conexao_id: cx.id, unidade_id: conta.unidade_id, codigo_solicitacao: `demo-${uid()}`, seu_numero: conta.id.slice(0, 12),
        valor: Number(conta.valor), vencimento: b.vencimento || conta.vencimento, situacao: "A_RECEBER", situacao_data: hojeISO(), nosso_numero: String(Date.now()).slice(-11),
        linha_digitavel: `0779000116${String(Date.now()).slice(-10)}12345678901234567890`.slice(0, 32) + "9" + "8760" + centavos, codigo_barras: null,
        pix_copia_cola: `00020101021226870014br.gov.bcb.pix2565pix.exemplo.com/qr/v2/cobv/${uid()}5204000053039865802BR5913MF MAQUINAS6304ABCD`, txid: uid(),
        valor_recebido: null, origem_recebimento: null, baixa_em: null, motivo_cancelamento: null, erro: null, criado_nome: "Você", created_at: new Date().toISOString(), atualizado_em: new Date().toISOString() };
      db.boletos_inter.unshift(boleto);
      return { ok: true, boleto };
    }
    const bol = db.boletos_inter.find((x) => x.id === b.id);
    if (b.acao === "boleto_atualizar") return { ok: true, resultado: bol?.situacao ?? "", boleto: bol };
    if (b.acao === "boleto_pdf") {
      // PDF de uma página só com o texto, para a prévia
      const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 60 780 Td (Boleto com Pix - previa) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
      return { pdf: btoa(pdf) };
    }
    if (b.acao === "boleto_cancelar") {
      if (bol) Object.assign(bol, { situacao: "CANCELADO", motivo_cancelamento: b.motivo, atualizado_em: new Date().toISOString() });
      return { ok: true, situacao: "CANCELADO" };
    }
    return { ok: true };
  },
  // Meu Pluggy do painel pessoal: na prévia, sem a chave (mostra o passo a passo)
  "pessoal-pluggy": (b) => {
    if (b.acao === "status") return { configurado: false };
    throw new Error("Falta a chave do Meu Pluggy: cadastre os secrets PLUGGY_PESSOAL_CLIENT_ID e PLUGGY_PESSOAL_CLIENT_SECRET no Supabase (Edge Functions → Secrets).");
  },
  openfinance: (b) => {
    // prévia: a "Pluggy" responde na hora; o banco de teste manda alguns lançamentos (um deles paga uma conta em aberto)
    const cfg = db.configuracoes[0];
    if (!db.openfinance_conexoes) db.openfinance_conexoes = [];
    if (b.acao === "status") return { configurado: !!cfg.pluggy_demo, origem: cfg.pluggy_demo ? "cofre" : null };
    if (b.acao === "configurar") {
      if (!String(b.client_id ?? "").trim() || !String(b.client_secret ?? "").trim()) throw new Error("Informe o Client ID e o Client Secret da Pluggy.");
      cfg.pluggy_demo = true;
      return { ok: true, origem: "cofre" };
    }
    if (!cfg.pluggy_demo) throw new Error("Ligue o Open Finance primeiro: informe as chaves da Pluggy em Bancos e conciliação.");
    if (b.acao === "token") return { token: "demo" };
    // como o MeuPluggy (grátis): uma conexão só traz todas as contas que a empresa ligou em meu.pluggy.ai
    const CONTAS_OF = [
      { id: "acc-inf1", nome: "InfinitePay Empresas 1730", tipo: "BANK", saldo: 1531.44 }, { id: "acc-inf2", nome: "InfinitePay Empresas 4538", tipo: "BANK", saldo: 645.68 },
      { id: "acc-nu", nome: "Nubank Empresas 998877-1", tipo: "BANK", saldo: 18452.37 }, { id: "acc-cartao", nome: "InfinitePay Crédito", tipo: "CREDIT", saldo: 0 }];
    if (b.acao === "contas") return { instituicao: "MeuPluggy", contas: CONTAS_OF };
    const novos = (c: Row, linhas: { data: string; valor: number; descricao: string }[]) => {
      let n = 0;
      for (const l of linhas) {
        const identificador = `pluggy:demo-${c.id}-${l.data}-${l.valor}`;
        if (db.extrato_lancamentos.some((x) => x.conta_bancaria_id === c.conta_bancaria_id && x.identificador === identificador)) continue;
        db.extrato_lancamentos.push({ id: uid(), conta_bancaria_id: c.conta_bancaria_id, importacao_id: null, data: l.data, valor: r2(l.valor), descricao: l.descricao, documento: null,
          identificador, status: "pendente", conta_receber_id: null, conta_pagar_id: null, baixou_conta: false, par_transferencia_id: null, observacao: null,
          origem: "openfinance", conexao_id: c.id, created_at: new Date().toISOString() });
        n++;
      }
      const conciliadas = n ? conciliarAutoDemo(c.conta_bancaria_id) : 0;
      // saldo que o "banco" informa: o mesmo do extrato (bate com o cartão da conta)
      const cb = db.contas_bancarias.find((x) => x.id === c.conta_bancaria_id);
      const saldo = cb ? r2(Number(cb.saldo_inicial) + db.extrato_lancamentos.filter((x) => x.conta_bancaria_id === cb.id && x.data >= cb.saldo_inicial_data).reduce((t, x) => t + Number(x.valor), 0)) : c.saldo;
      Object.assign(c, { status: "ativa", erro: null, sincronizado_em: new Date().toISOString(), ultimas_novas: n, saldo, saldo_em: new Date().toISOString() });
      return { novas: n, conciliadas };
    };
    if (b.acao === "ligar") {
      for (const x of db.openfinance_conexoes) if (x.conta_bancaria_id === b.conta_bancaria_id && x.status !== "desligada") x.status = "desligada";
      const ext = CONTAS_OF.find((x) => x.id === b.conta_externa_id);
      if (!ext) throw new Error("essa conta não está nesta conexão do banco");
      const c: Row = { id: uid(), item_id: b.item_id, conta_externa_id: b.conta_externa_id, conta_bancaria_id: b.conta_bancaria_id, instituicao: "MeuPluggy",
        conta_externa_nome: ext.nome, status: "ativa", status_provedor: "UPDATED", erro: null, desde: b.desde, sincronizado_em: null, ultimas_novas: 0,
        saldo: ext.saldo, saldo_em: new Date().toISOString(), consentimento_ate: quando(365), created_at: new Date().toISOString() };
      db.openfinance_conexoes.push(c);
      const unid = db.contas_bancarias.find((x) => x.id === c.conta_bancaria_id)?.unidade_id;
      const aberta = db.contas_receber.find((r) => r.status === "aberto" && r.unidade_id === unid && Math.abs(Date.parse(r.vencimento) - Date.now()) < 8 * 864e5);
      const r = novos(c, [
        { data: dias(-3), valor: -189.9, descricao: "Pagamento de boleto · CELESC DISTRIBUICAO" },
        { data: dias(-2), valor: 1250, descricao: "Transferência recebida pelo Pix · MARCOS PAULO ME" },
        { data: dias(-1), valor: -45.8, descricao: "Tarifa pacote de serviços" },
        ...(aberta ? [{ data: dias(0), valor: Number(aberta.valor), descricao: `Transferência recebida pelo Pix · ${(db.clientes.find((x) => x.id === aberta.cliente_id)?.nome ?? "CLIENTE").toUpperCase()}` }] : []),
      ]);
      return { ok: true, conexao_id: c.id, ...r };
    }
    if (b.acao === "sincronizar") {
      const resultado: Row = {};
      for (const c of db.openfinance_conexoes.filter((x) => x.status !== "desligada" && (!b.conexao_id || x.id === b.conexao_id))) {
        resultado[c.id] = novos(c, [{ data: dias(0), valor: -r2(30 + Math.random() * 300), descricao: `Compra no débito · POSTO ${Math.floor(Math.random() * 90 + 10)}` }]);
      }
      return { ok: true, resultado };
    }
    if (b.acao === "desligar") {
      const c = db.openfinance_conexoes.find((x) => x.id === b.conexao_id);
      if (c) c.status = "desligada";
      return { ok: true };
    }
    return { ok: true };
  },
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
    const ADIC = ["vendas", "financeiro", "tecnico", "expedicao", "marketplace", "compras"];
    const extras = (v: any, papel: string) => (Array.isArray(v) && !["admin", "contador"].includes(papel) ? [...new Set(v as string[])].filter((p) => ADIC.includes(p) && p !== papel) : []);
    const ultimoAdmin = (u: Row, papel: string, ativo: boolean) => u.papel === "admin" && u.ativo && (papel !== "admin" || !ativo)
      && !db.usuarios_erp.some((x) => x.user_id !== u.user_id && x.papel === "admin" && x.ativo);
    if (b.acao === "listar") return { ok: true, usuarios: db.usuarios_erp };
    if (b.acao === "criar") {
      if (db.usuarios_erp.some((u) => u.email === String(b.email).toLowerCase())) throw new Error("já existe um usuário com este e-mail");
      const user_id = uid();
      db.usuarios_erp.push({ user_id, nome: b.nome, papel: b.papel, papeis_extras: extras(b.papeis_extras, b.papel), cargo: b.cargo || null,
        telefone: String(b.telefone ?? "").replace(/\D/g, "") || null, unidade_id: b.unidade_id || null, email: String(b.email).toLowerCase(),
        ativo: true, trocar_senha: true, ultimo_acesso: null, created_at: new Date().toISOString(), avisos: {} });
      return { ok: true, user_id };
    }
    if (b.acao === "atualizar") {
      const u = db.usuarios_erp.find((x) => x.user_id === b.user_id);
      if (!u) throw new Error("usuário não encontrado");
      const papel = b.papel ?? u.papel, ativo = b.ativo ?? u.ativo;
      if (b.user_id === sessao?.user.id && (ativo === false || papel !== "admin")) throw new Error("você não pode desativar nem tirar o próprio acesso de administrador");
      if (ultimoAdmin(u, papel, ativo)) throw new Error("é preciso manter ao menos um administrador ativo");
      const { acao: _a, user_id: _u, ...resto } = b;
      Object.assign(u, resto, { papel, ativo, papeis_extras: extras(b.papeis_extras ?? u.papeis_extras, papel),
        ...(b.telefone !== undefined ? { telefone: String(b.telefone ?? "").replace(/\D/g, "") || null } : {}),
        ...(b.email !== undefined ? { email: String(b.email).toLowerCase() } : {}) });
      return { ok: true };
    }
    if (b.acao === "redefinir_senha") {
      const u = db.usuarios_erp.find((x) => x.user_id === b.user_id);
      if (u && b.user_id !== sessao?.user.id) u.trocar_senha = true;
      return { ok: true };
    }
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
arquivos.set("conta_pagar/negociacao-neg1/print.jpg", fotoExemplo("Proposta: 3x R$ 1.000", "#ccfbf1"));

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
