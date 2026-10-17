// Sobre → Sistemas: o ERP Line visto como sistemas (finance-os, analytics-os) e a linguagem de comandos da empresa (ECL).
// Cada módulo diz se o ERP já tem, tem em parte ou ainda falta, e abre as telas onde está. Um sistema novo é só mais um item.

export type Situacao = "tem" | "parcial" | "falta";
export type Destino = { rotulo: string; to: string };
export type ModuloSistema = { nome: string; situacao: Situacao; texto: string; telas: Destino[] };
export type Sistema = { id: string; nome: string; texto: string; cor: string; modulos: ModuloSistema[] };

export const SITUACOES: { id: Situacao; nome: string; cor: string; ponto: string }[] = [
  { id: "tem", nome: "Já tem", cor: "bg-emerald-100 text-emerald-900 ring-emerald-300", ponto: "bg-emerald-500" },
  { id: "parcial", nome: "Em parte", cor: "bg-amber-100 text-amber-900 ring-amber-300", ponto: "bg-amber-500" },
  { id: "falta", nome: "Falta", cor: "bg-rose-100 text-rose-900 ring-rose-300", ponto: "bg-rose-500" },
];

export const SISTEMAS: Sistema[] = [
  {
    id: "finance-os", nome: "Sistema financeiro", cor: "from-[#f59e0b] to-[#b45309]",
    texto: "O dinheiro da empresa do começo ao fim: o que entra e sai, os bancos, a cobrança, os gastos separados, o resultado e o fechamento com o contador.",
    modulos: [
      { nome: "Contas a pagar e a receber", situacao: "tem", texto: "Uma situação por conta, aprovação antes de pagar, pagamento em lote, baixa parcial, contas fixas e recibos.",
        telas: [{ rotulo: "Contas", to: "/financeiro" }, { rotulo: "Aprovações", to: "/aprovacoes" }] },
      { nome: "Bancos e conciliação", situacao: "tem", texto: "Extratos por OFX, e-mail, Open Finance e Banco Inter, conciliados com as contas lançadas, com sugestões.",
        telas: [{ rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
      { nome: "Fluxo de caixa", situacao: "tem", texto: "Saldo nos bancos, o que entrou e saiu e o que vai entrar e sair nos próximos dias.",
        telas: [{ rotulo: "Painel do financeiro", to: "/painel/financeiro" }, { rotulo: "Relatórios", to: "/relatorios" }] },
      { nome: "DRE e plano de contas", situacao: "tem", texto: "Resultado do mês pelos lançamentos e pelos extratos (sem contar duas vezes), plano de contas e centros de custo.",
        telas: [{ rotulo: "DRE", to: "/financeiro?aba=dre" }, { rotulo: "Plano de contas", to: "/financeiro?aba=plano" }] },
      { nome: "Cobrança", situacao: "parcial", texto: "Régua de cobrança pelo WhatsApp, Pix copia e cola e link de pagamento na venda. Falta emitir boleto pelo ERP.",
        telas: [{ rotulo: "Cobrança", to: "/financeiro?aba=cobranca" }] },
      { nome: "Gastos separados", situacao: "tem", texto: "Combustível, marketplaces, impostos, tarifas, funcionários e quiosques, juntando todas as contas.",
        telas: [{ rotulo: "Gastos separados", to: "/gastos" }] },
      { nome: "Entre contas e sócios", situacao: "tem", texto: "Dinheiro entre as contas da MF, a sócia e as empresas ligadas, isolado do resultado.",
        telas: [{ rotulo: "Entre contas e sócios", to: "/partes-relacionadas" }] },
      { nome: "Auditoria e fechamento", situacao: "tem", texto: "Checklist do mês, exceções, histórico de alterações, mês travado e o pacote do contador.",
        telas: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Painel do contador", to: "/contador" }] },
      { nome: "Impostos", situacao: "parcial", texto: "Analista fiscal (auditoria e economia legal), calendário do Lucro Real e guias pagas. A apuração oficial continua com o contador.",
        telas: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }, { rotulo: "Impostos pagos", to: "/gastos?aba=impostos" }] },
      { nome: "Comissões", situacao: "tem", texto: "Por vendedor, categoria e linha de produto, ligadas às vendas e ao financeiro.",
        telas: [{ rotulo: "Comissões", to: "/comissoes" }] },
      { nome: "Orçamento (previsto x realizado)", situacao: "falta", texto: "Quanto se planeja gastar por categoria e centro de custo, comparado com o realizado mês a mês.", telas: [] },
    ],
  },
  {
    id: "analytics-os", nome: "Sistema de inteligência", cor: "from-[#8b5cf6] to-[#5b21b6]",
    texto: "Os números da empresa viram decisão: indicadores, painéis, cruzamentos, previsões, alertas e análise feita pela IA.",
    modulos: [
      { nome: "KPIs", situacao: "tem", texto: "Indicadores no alto de cada painel (vendas, financeiro, fábrica, assistência, fiscal), comparados com o período anterior.",
        telas: [{ rotulo: "Vendas", to: "/painel/vendas" }, { rotulo: "Financeiro", to: "/painel/financeiro" }, { rotulo: "Fábrica", to: "/painel/producao" }, { rotulo: "Assistência", to: "/painel/posvenda" }] },
      { nome: "Dashboards", situacao: "tem", texto: "Um painel por área e o Painel gerencial para decidir. Tocar num número abre a lista por trás dele.",
        telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Máquinas", to: "/painel/maquinas" }, { rotulo: "Produtos", to: "/painel/produtos" }, { rotulo: "Clientes", to: "/painel/cadastros" }] },
      { nome: "BI", situacao: "parcial", texto: "Faturamento, DRE, fluxo de caixa e margem de contribuição por venda, canal, produto, vendedor, cliente e unidade, tudo em Excel. Falta o cruzamento livre (escolher linhas e colunas na tela).",
        telas: [{ rotulo: "Relatórios", to: "/relatorios" }, { rotulo: "Margem", to: "/margem" }] },
      { nome: "Previsões", situacao: "parcial", texto: "O que entra e sai nos próximos dias, necessidades de compra e para quantos dias dá o estoque de máquinas. Falta prever vendas e compras pela produção planejada.",
        telas: [{ rotulo: "Painel do financeiro", to: "/painel/financeiro" }, { rotulo: "Compras", to: "/compras" }, { rotulo: "Painel das máquinas", to: "/painel/maquinas" }] },
      { nome: "Alertas", situacao: "tem", texto: "Avisos entre usuários com urgência e som, notificações, pendências fiscais, exceções da auditoria e peça faltando para a produção.",
        telas: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Painel fiscal", to: "/painel/notas" }] },
      { nome: "IA analítica", situacao: "parcial", texto: "Analista fiscal, correções sugeridas no cadastro de produtos e sugestões na conciliação. Falta perguntar em português (\"quanto vendi de pás em setembro?\") e receber a resposta.",
        telas: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }, { rotulo: "Correções de produtos", to: "/estoque?aba=qualidade" }] },
      { nome: "Benchmarking", situacao: "parcial", texto: "Comparação com o mês e o ano anterior, metas por vendedor e por região e ranking. Falta comparar com referências do setor.",
        telas: [{ rotulo: "Metas", to: "/metas" }, { rotulo: "Painel gerencial", to: "/gerencial" }] },
      { nome: "Tendências", situacao: "tem", texto: "Mês a mês, curva ABC, clientes parados, ritmo de venda de 90 dias por modelo e o que mais volta para a assistência.",
        telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Painel das máquinas", to: "/painel/maquinas" }] },
    ],
  },
];

/** capability-showcase: a vitrine do que o ERP Line já faz, para mostrar à equipe, a clientes e a parceiros. */
SISTEMAS.push({
  id: "capability-showcase", nome: "Vitrine de capacidades", cor: "from-[#0d9488] to-[#115e59]",
  texto: "O que o ERP Line já faz pela MF, do orçamento à nota, da fábrica à assistência, com o banco e o contador conectados.",
  modulos: [
    { nome: "Notas do Lucro Real nas duas unidades", situacao: "tem", texto: "NF-e de venda, transferência SC ↔ SP, entrada e devolução; NFS-e da assistência; Reforma Tributária (IBS/CBS) já no XML.",
      telas: [{ rotulo: "Notas fiscais", to: "/notas" }, { rotulo: "Painel fiscal", to: "/painel/notas" }] },
    { nome: "Banco que entra sozinho", situacao: "tem", texto: "Extratos pelo Open Finance, Banco Inter, InfinitePay e OFX por e-mail, conciliados com sugestões e baixa automática do Pix.",
      telas: [{ rotulo: "Bancos e conciliação", to: "/conciliacao" }] },
    { nome: "Do orçamento à entrega", situacao: "tem", texto: "Proposta aprovada pelo cliente online, pedido, nota automática, separação, embalagem, frete e rastreio num fluxo só.",
      telas: [{ rotulo: "Fluxo de pedidos", to: "/fluxo" }, { rotulo: "Venda de Peças", to: "/pedidos" }] },
    { nome: "Fábrica com ficha técnica", situacao: "tem", texto: "Ordens de produção, ficha técnica em vários níveis, custo pelas notas, peças que faltam e o teste do giga (REG-006).",
      telas: [{ rotulo: "Produção", to: "/producao" }, { rotulo: "Painel da fábrica", to: "/painel/producao" }] },
    { nome: "Assistência técnica", situacao: "tem", texto: "OS com a máquina e a garantia do cliente, NFS-e, técnicos parceiros por região e o histórico de consertos na ficha.",
      telas: [{ rotulo: "Ordens de serviço", to: "/assistencia" }, { rotulo: "Garantias", to: "/garantias" }] },
    { nome: "Venda em todo canal", situacao: "tem", texto: "Balcão (PDV), WhatsApp, loja, Mercado Livre com estoque e preço do ERP, feed do Google e representantes com portal.",
      telas: [{ rotulo: "PDV", to: "/pdv" }, { rotulo: "Mercado Livre", to: "/mercado-livre" }, { rotulo: "Comissões", to: "/comissoes" }] },
    { nome: "Cobrança automática", situacao: "tem", texto: "Régua de cobrança pelo WhatsApp oficial, Pix copia e cola, link de pagamento e página do cliente.",
      telas: [{ rotulo: "Cobrança", to: "/financeiro?aba=cobranca" }] },
    { nome: "Analista fiscal com IA", situacao: "tem", texto: "Auditoria das notas, apuração estimada e estratégias legais para pagar menos imposto, para o contador validar.",
      telas: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }] },
    { nome: "Cadastro que se conserta", situacao: "tem", texto: "Clientes conferidos na Receita, repetidos unificados sem perder nada e correções sugeridas nos produtos (NCM, custo, categoria).",
      telas: [{ rotulo: "Clientes", to: "/clientes" }, { rotulo: "Correções de produtos", to: "/estoque?aba=qualidade" }] },
    { nome: "Painéis para decidir", situacao: "tem", texto: "Um painel por área, metas por vendedor e região, margem de contribuição e curva ABC; tocar num número abre a lista.",
      telas: [{ rotulo: "Painel gerencial", to: "/gerencial" }, { rotulo: "Margem", to: "/margem" }] },
    { nome: "Contador conectado", situacao: "tem", texto: "Fechamento do mês com o pacote do contador, calendário de obrigações do Lucro Real e mês travado depois de conferido.",
      telas: [{ rotulo: "Painel do contador", to: "/contador" }] },
    { nome: "Controle e segurança", situacao: "tem", texto: "Perfil por função, pagamento só depois da aprovação, histórico de toda alteração e auditoria financeira com checklist.",
      telas: [{ rotulo: "Aprovações", to: "/aprovacoes" }, { rotulo: "Auditoria financeira", to: "/auditoria" }] },
  ],
});

// ---------------------------------------------------------------------------------------------------------------------
// Enterprise Command Language (ECL): a linguagem de domínio (DSL) da empresa. Gramática: VERBO + alvo, com as palavras
// da MF (financeiro, fiscal, produtos…). O ERP mostra onde aquilo é feito.

export type ComandoEcl = { verbo: string; nome: string; texto: string; alvos: { alvo: string; palavras: string[]; destinos: Destino[] }[] };

export const ECL: ComandoEcl[] = [
  {
    verbo: "AUDIT", nome: "Auditoria estruturada", texto: "Confere uma área com checklist e mostra o que está errado, por que importa e o que fazer.",
    alvos: [
      { alvo: "financeiro", palavras: ["financeiro", "financas", "contas", "bancos", "caixa"], destinos: [{ rotulo: "Auditoria financeira", to: "/auditoria" }, { rotulo: "Painel do contador", to: "/contador" }] },
      { alvo: "fiscal", palavras: ["fiscal", "impostos", "notas", "nf", "tributos"], destinos: [{ rotulo: "Analista fiscal", to: "/analista-fiscal" }, { rotulo: "Painel fiscal", to: "/painel/notas" }] },
      { alvo: "produtos", palavras: ["produtos", "cadastro", "estoque", "pecas"], destinos: [{ rotulo: "Qualidade do cadastro", to: "/estoque?aba=qualidade" }, { rotulo: "Marketplace e anúncios", to: "/estoque?aba=auditoria" }] },
      { alvo: "menu", palavras: ["menu", "telas", "erp", "sistema"], destinos: [{ rotulo: "Auditoria do menu", to: "/sobre?aba=esquemas" }] },
    ],
  },
  {
    verbo: "VISUALIZE", nome: "Mostra em página visual", texto: "Abre a página que mostra o assunto de relance: etapas, números, cores e o que falta.",
    alvos: [
      { alvo: "rodada", palavras: ["rodada", "plano", "trabalho", "pendencias"], destinos: [{ rotulo: "Rodada atual", to: "/sobre?aba=rodada" }] },
      { alvo: "sistemas", palavras: ["sistemas", "capacidades", "modulos", "erp"], destinos: [{ rotulo: "Sistemas e capacidades", to: "/sobre?aba=sistemas" }] },
      { alvo: "processos", palavras: ["processos", "menu", "esquemas", "fluxo"], destinos: [{ rotulo: "Esquemas", to: "/sobre?aba=esquemas" }] },
      { alvo: "financeiro", palavras: ["financeiro", "dinheiro", "caixa"], destinos: [{ rotulo: "Painel do financeiro", to: "/painel/financeiro" }] },
    ],
  },
  {
    verbo: "IMPROVE", nome: "Propõe melhorias", texto: "Traz sugestões prontas para aplicar ou anotar, com o motivo de cada uma.",
    alvos: [
      { alvo: "produtos", palavras: ["produtos", "cadastro", "ncm", "custo", "pecas"], destinos: [{ rotulo: "Correções sugeridas", to: "/estoque?aba=qualidade" }] },
      { alvo: "impostos", palavras: ["impostos", "fiscal", "tributos", "economia"], destinos: [{ rotulo: "Estratégias do analista fiscal", to: "/analista-fiscal" }] },
      { alvo: "conciliacao", palavras: ["conciliacao", "bancos", "extrato"], destinos: [{ rotulo: "Sugestões da conciliação", to: "/conciliacao" }] },
      { alvo: "erp", palavras: ["erp", "telas", "menu", "sistema", "ideias"], destinos: [{ rotulo: "Ideias", to: "/sobre?aba=ideias" }] },
    ],
  },
];

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type Interpretacao =
  | { ok: true; comando: ComandoEcl; alvo: string | null; destinos: Destino[] }
  | { ok: false; motivo: string };

/** Lê "AUDIT financeiro" (ou "audit", "improve produtos"…): sem alvo, devolve todos os destinos do verbo. */
export function interpretarEcl(texto: string): Interpretacao {
  const [verbo = "", ...resto] = sem(texto).split(/\s+/).filter(Boolean);
  if (!verbo) return { ok: false, motivo: "Digite um comando, por exemplo: AUDIT financeiro" };
  const comando = ECL.find((c) => c.verbo.toLowerCase() === verbo);
  if (!comando) return { ok: false, motivo: `Comando "${verbo.toUpperCase()}" não existe. Use ${ECL.map((c) => c.verbo).join(" ou ")}.` };
  const alvoTexto = resto.join(" ");
  if (!alvoTexto) return { ok: true, comando, alvo: null, destinos: comando.alvos.flatMap((a) => a.destinos) };
  const alvo = comando.alvos.find((a) => a.palavras.some((p) => alvoTexto.includes(p)));
  if (!alvo) return { ok: false, motivo: `${comando.verbo} funciona com: ${comando.alvos.map((a) => a.alvo).join(", ")}.` };
  return { ok: true, comando, alvo: alvo.alvo, destinos: alvo.destinos };
}
