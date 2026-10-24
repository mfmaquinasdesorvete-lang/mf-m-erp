// Ajustes do negócio que a usuária muda em Configurações sem mexer no código (pedido de 24/10, .claude/configuravel):
//  - NUMEROS: prazos e padrões (dias, %, R$), em Configurações → Prazos e padrões;
//  - MENSAGENS: textos para o cliente (WhatsApp e e-mail) com variáveis, em Configurações → Mensagens ao cliente.
// Este catálogo é a fonte única do valor padrão, do nome e da explicação de cada item; a tabela config_ajustes guarda só
// o que ela mudou (sem linha = vale o padrão). Telas (src/lib/ajustes.ts), funções do Supabase e o banco leem por aqui:
// no SQL, public.cfg_num('chave', padrão) com o MESMO padrão daqui (o teste ajustes.test.ts confere). Sem Deno nem rede.
//
// Item novo: acrescente aqui (chave única, grupo, rótulo, explicação simples, padrão = o valor de hoje) e troque o número
// ou o texto fixo pela leitura (numero/mensagem nas telas, lerNumero/lerMensagem nas funções, cfg_num no banco).

export type Unidade = "dias" | "horas" | "%" | "R$" | "vezes" | "parcelas";
export type ItemNumero = {
  chave: string; grupo: string; rotulo: string; explicacao: string; unidade: Unidade; padrao: number;
  minimo?: number; maximo?: number; dono: string;
};
export type ItemMensagem = {
  chave: string; grupo: string; canal: "whatsapp" | "email"; rotulo: string; explicacao: string;
  /** variáveis que o texto aceita: nome → o que é (com um exemplo, usado na prévia) */
  variaveis: Record<string, { o_que: string; exemplo: string }>;
  assunto?: string; texto: string; dono: string;
};
/** O que a usuária mudou (linha de config_ajustes). */
export type Ajuste = { chave: string; valor?: number | null; assunto?: string | null; texto?: string | null };

const v = (o_que: string, exemplo: string) => ({ o_que, exemplo });
const CLIENTE = v("primeiro nome do cliente", "João");
const EMPRESA = v("nome fantasia da empresa (Configurações → Empresa)", "Sua Empresa");

export const NUMEROS: ItemNumero[] = [
  { chave: "pedido_parcelas", grupo: "Vendas", rotulo: "Parcelas do pedido novo", unidade: "parcelas", padrao: 1, minimo: 1, maximo: 24, dono: "GER",
    explicacao: "Em quantas parcelas o orçamento ou pedido novo já começa. O vendedor pode mudar em cada pedido." },
  { chave: "pedido_intervalo_dias", grupo: "Vendas", rotulo: "Intervalo entre as parcelas do pedido novo", unidade: "dias", padrao: 30, minimo: 1, maximo: 120, dono: "GER",
    explicacao: "Quantos dias entre uma parcela e outra no orçamento ou pedido novo." },
  { chave: "cobranca_whatsapp_janela", grupo: "Cobrança", rotulo: "Cobrança pelo WhatsApp atrasada ainda aparece por", unidade: "dias", padrao: 3, minimo: 0, maximo: 30, dono: "GER",
    explicacao: "Se a mensagem da régua não foi mandada no dia, ela continua na fila \"Cobrar hoje pelo WhatsApp\" por estes dias. Depois disso fica só a próxima etapa." },
];

export const MENSAGENS: ItemMensagem[] = [
  // ---------- Cobrança ----------
  { chave: "wa_cobranca_conta", grupo: "Cobrança", canal: "whatsapp", rotulo: "Cobrar uma conta (financeiro)", dono: "GER",
    explicacao: "Botão do WhatsApp nas contas a receber em aberto do painel do financeiro.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, descricao: v("o que é a conta", "Pedido #120 - parcela 1/2"), valor: v("valor da conta", "R$ 1.250,00"), vencimento: v("data do vencimento", "20/10/2026") },
    texto: "Olá {cliente}! Aqui é do financeiro da {empresa}. Consta em aberto *{descricao}*, no valor de *{valor}*, com vencimento em {vencimento}. Precisa da segunda via ou de outra forma de pagamento?" },
  { chave: "wa_cobranca_atrasados", grupo: "Cobrança", canal: "whatsapp", rotulo: "Cobrar cliente em atraso (todas as contas dele)", dono: "GER",
    explicacao: "Botão do WhatsApp na lista \"Clientes inadimplentes\" do painel do financeiro.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, quantas: v("\"o valor de\" (uma conta) ou \"3 parcelas, somando\"", "2 parcelas, somando"), valor: v("total em atraso", "R$ 2.500,00"), desde: v("o vencimento mais antigo", "05/10/2026") },
    texto: "Olá {cliente}! Aqui é do financeiro da {empresa}. Consta em aberto {quantas} *{valor}*, com vencimento desde {desde}. Podemos ajudar com a segunda via ou combinar o pagamento?" },
  { chave: "wa_cobranca_boleto", grupo: "Cobrança", canal: "whatsapp", rotulo: "Mandar a cobrança com Pix e segunda via", dono: "GER",
    explicacao: "Botão do WhatsApp em Contas a pagar e receber, na conta a receber.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, descricao: v("o que é a conta", "Pedido #120 - parcela 1/2"), valor: v("valor da conta", "R$ 1.250,00"), vencimento: v("data do vencimento", "20/10/2026"),
      pix: v("o Pix copia e cola (some quando não houver)", "*Pix copia e cola:*\n00020126…"), como_pagar: v("as instruções de pagamento da unidade (some quando não houver)", "*Como pagar:*\nBoleto ou Pix"),
      area_cliente: v("o link da área do cliente (some quando não houver)", "Suas contas e a segunda via: https://…/cliente/abc") },
    texto: "Olá {cliente}! Segue a cobrança da *{empresa}*:\n{descricao}\nValor: {valor} · Vencimento: {vencimento}\n\n{pix}\n\n{como_pagar}\n\n{area_cliente}" },
  { chave: "wa_link_pagamento", grupo: "Cobrança", canal: "whatsapp", rotulo: "Link de pagamento de uma conta", dono: "GER",
    explicacao: "Mensagem que acompanha o link de pagamento (InfinitePay ou Mercado Pago) de uma conta a receber.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, descricao: v("o que é a conta", "Pedido #120 - parcela 1/2"), valor: v("valor da conta", "R$ 1.250,00"), vencimento: v("data do vencimento", "20/10/2026"),
      meios: v("como pode pagar pelo link", "por Pix ou cartão (em até 12x)"), link: v("o link de pagamento", "https://…") },
    texto: "Olá {cliente}! Segue o link para pagamento da *{empresa}*:\n{descricao}\nValor: {valor} · Vencimento: {vencimento}\n\nPague {meios}:\n{link}" },

  // ---------- Vendas ----------
  { chave: "wa_pedido", grupo: "Vendas", canal: "whatsapp", rotulo: "Mandar o orçamento ou pedido", dono: "GER",
    explicacao: "Botão do WhatsApp dentro do orçamento ou pedido (vai junto com o PDF).",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, documento: v("\"o orçamento #…\" ou \"o pedido #…\"", "o orçamento #120"), itens: v("um item por linha, com quantidade e valor", "• 1x Máquina de sorvete — R$ 18.900,00"),
      desconto: v("linha do desconto (some quando não houver)", "Desconto: R$ 500,00"), frete: v("linha do frete (some quando não houver)", "Frete: R$ 350,00"), total: v("total do pedido", "R$ 18.750,00"),
      pagamento: v("forma de pagamento e parcelas", "Boleto em 3x"), pix: v("Pix copia e cola quando a forma é Pix (some quando não houver)", "*Pix copia e cola* (entrada, R$ 1.000,00):\n00020126…") },
    texto: "Olá {cliente}! Segue {documento} da *{empresa}*:\n\n{itens}\n\n{desconto}\n{frete}\n*Total: {total}*\nPagamento: {pagamento}\n\n{pix}" },
  { chave: "wa_link_pedido", grupo: "Vendas", canal: "whatsapp", rotulo: "Link de pagamento do pedido", dono: "GER",
    explicacao: "Mensagem que acompanha o link de pagamento do pedido (venda no Pix ou no cartão).",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, pedido: v("\" (pedido #…)\" quando o pedido tem número", " (pedido #120)"), valor: v("\"Valor em aberto: …\" ou \"Total: …\"", "Total: R$ 18.750,00"),
      meios: v("como pode pagar pelo link", "por Pix ou cartão (em até 12x)"), link: v("o link de pagamento", "https://…") },
    texto: "Olá {cliente}! Sua compra na *{empresa}* foi confirmada{pedido}.\n{valor}\n\nPague {meios} neste link:\n{link}\n\nAssim que o pagamento cair, a gente já segue com o seu pedido." },
  { chave: "wa_proposta_link", grupo: "Vendas", canal: "whatsapp", rotulo: "Mandar a proposta para aprovar", dono: "GER",
    explicacao: "Botão \"Enviar proposta\" do orçamento: manda o link para o cliente ver e aprovar.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, numero: v("número da proposta", "120"), link: v("link da proposta", "https://…/proposta/abc") },
    texto: "Olá {cliente}! Segue a nossa proposta nº {numero}. Veja os detalhes e aprove por aqui:\n{link}" },
  { chave: "wa_proposta_cobrar", grupo: "Vendas", canal: "whatsapp", rotulo: "Perguntar se viu a proposta", dono: "GER",
    explicacao: "Botão do WhatsApp no Fluxo de vendas, na proposta parada esperando resposta.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, numero: v("número da proposta", "120"), link: v("link da proposta (some se ainda não foi enviada)", "https://…/proposta/abc") },
    texto: "Olá {cliente}! Tudo bem? Conseguiu ver a nossa proposta nº {numero}? Fico à disposição para tirar qualquer dúvida.\n{link}" },
  { chave: "wa_despacho", grupo: "Vendas", canal: "whatsapp", rotulo: "Pedido despachado", dono: "GER",
    explicacao: "Botão do WhatsApp no envio do pedido, depois de despachar.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, pedido: v("número do pedido", "120"), transportadora: v("linha da transportadora (some quando não houver)", "Transportadora: Rodonaves"),
      rastreio: v("linha do código de rastreio (some quando não houver)", "Código de rastreio: AB123"), previsao: v("linha da entrega prevista (some quando não houver)", "Entrega prevista: 30/10/2026") },
    texto: "Olá {cliente}! Seu pedido #{pedido} da *{empresa}* foi despachado.\n{transportadora}\n{rastreio}\n{previsao}\nQualquer dúvida, é só chamar!" },

  // ---------- Assistência ----------
  { chave: "wa_os_pronta", grupo: "Assistência", canal: "whatsapp", rotulo: "OS pronta para retirar", dono: "GER",
    explicacao: "Botão do WhatsApp no quadro das OS, na OS pronta.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, os: v("número da OS", "350"), equipamento: v("equipamento da OS", "Máquina de sorvete") },
    texto: "Olá {cliente}! Sua OS #{os} ({equipamento}) está pronta para retirar na {empresa}." },
  { chave: "wa_os_orcamento", grupo: "Assistência", canal: "whatsapp", rotulo: "Perguntar se viu o orçamento da OS", dono: "GER",
    explicacao: "Botão do WhatsApp no quadro das OS, na OS esperando aprovação do orçamento.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, os: v("número da OS", "350"), equipamento: v("equipamento da OS", "Máquina de sorvete") },
    texto: "Olá {cliente}! Conseguiu ver o orçamento da OS #{os} ({equipamento})? Fico à disposição." },
  { chave: "wa_os_atualizacao", grupo: "Assistência", canal: "whatsapp", rotulo: "Atualização da OS", dono: "GER",
    explicacao: "Botão do WhatsApp dentro da OS: conta ao cliente como está o conserto.",
    variaveis: { cliente: CLIENTE, empresa: EMPRESA, os: v("número da OS", "350"), equipamento: v("equipamento da OS", "Máquina de sorvete"), situacao: v("situação da OS", "em conserto"),
      diagnostico: v("linha do diagnóstico (some quando não houver)", "Diagnóstico: troca do motor"), valor: v("valor ou \"coberto pela garantia\" (some quando não houver)", "Valor: R$ 850,00"),
      agenda: v("vídeo chamada agendada ou previsão (some quando não houver)", "Previsão: 30/10/2026"), outra_empresa: v("aviso quando a máquina é de outra empresa (some quando não for)", "A Sua Empresa é uma empresa diferente da Outra e responde pelo serviço e pelas peças desta OS.") },
    texto: "Olá {cliente}! Atualização da sua OS #{os} na *{empresa}*:\nEquipamento: {equipamento}\nStatus: {situacao}\n{diagnostico}\n{valor}\n{agenda}\n{outra_empresa}" },
];

const porChave = <T extends { chave: string }>(l: T[]) => new Map(l.map((i) => [i.chave, i]));
const NUM = porChave(NUMEROS), MSG = porChave(MENSAGENS);
export const itemNumero = (chave: string) => NUM.get(chave);
export const itemMensagem = (chave: string) => MSG.get(chave);

/** O número em uso: o que ela gravou (dentro do mínimo e do máximo) ou o padrão. */
export function lerNumero(ajustes: Ajuste[] | Map<string, Ajuste> | null | undefined, chave: string): number {
  const item = NUM.get(chave);
  if (!item) throw new Error(`ajuste desconhecido: ${chave}`);
  const a = ajustes instanceof Map ? ajustes.get(chave) : ajustes?.find((x) => x.chave === chave);
  const n = a?.valor == null ? NaN : Number(a.valor);
  if (!Number.isFinite(n)) return item.padrao;
  return Math.min(item.maximo ?? Infinity, Math.max(item.minimo ?? -Infinity, n));
}

/**
 * Troca as variáveis {nome} pelos valores. Variável vazia some; a linha que ficou vazia por causa dela também some
 * (assim "Desconto: …" sai do texto quando não há desconto) e não sobram mais de uma linha em branco seguidas.
 */
export function preencher(texto: string, vars: Record<string, string | number | null | undefined>): string {
  const linhas = texto.split("\n").flatMap((linha) => {
    const tinha = /\{[a-z_]+\}/.test(linha);
    const nova = linha.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
    return tinha && !nova.trim() ? [] : nova.split("\n");
  });
  return linhas.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** O texto em uso (o que ela escreveu ou o padrão), já com as variáveis preenchidas. */
export function lerMensagem(ajustes: Ajuste[] | Map<string, Ajuste> | null | undefined, chave: string,
  vars: Record<string, string | number | null | undefined>): { assunto: string; texto: string } {
  const item = MSG.get(chave);
  if (!item) throw new Error(`mensagem desconhecida: ${chave}`);
  const a = ajustes instanceof Map ? ajustes.get(chave) : ajustes?.find((x) => x.chave === chave);
  return {
    assunto: preencher(a?.assunto?.trim() || item.assunto || "", vars),
    texto: preencher(a?.texto?.trim() || item.texto, vars),
  };
}

/** Prévia com os exemplos de cada variável. */
export const exemplos = (item: ItemMensagem) => Object.fromEntries(Object.entries(item.variaveis).map(([k, x]) => [k, x.exemplo]));

/** Variáveis que o texto usa e o modelo não conhece (erro de digitação: {clinte}). */
export const variaveisDesconhecidas = (item: ItemMensagem, texto: string) =>
  [...new Set([...texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))].filter((k) => !(k in item.variaveis));
