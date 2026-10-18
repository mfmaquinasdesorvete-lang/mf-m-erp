// Cards do painel pessoal: cada lançamento vai para um tipo (juros do limite, financiamento, impostos, cartões…) pelo
// texto do extrato. Antes das regras prontas valem as regras da própria pessoa (public.pessoal_regras, só do dono):
// "o que tiver este texto vai para este card", com nome próprio, observação e meta (ex.: empréstimo de 3 x R$ 7 mil).
// Nomes de pessoas e empresas ficam só nessas regras, nunca aqui. Também acha o mesmo lançamento importado duas vezes
// (PDF e OFX do mesmo extrato) e o dinheiro que só passou de uma conta da pessoa para outra. Funções puras.
import { daEmpresa, type ContaPessoal, type Empresa, type Faixa, type LancPessoal } from "./pessoal";
import { chaveDoLanc, origemDo } from "../../supabase/functions/_shared/repetidos";

export { chaveDoLanc, origemDo, semRepetidos } from "../../supabase/functions/_shared/repetidos";

export type SentidoRegra = "saida" | "entrada" | "ambos";
export type RegraPessoal = {
  id: string; texto: string; card: string; rotulo: string | null; sentido: SentidoRegra; da_empresa: boolean;
  observacao: string | null; meta_total: number | null; parcelas: number | null; ativa: boolean; ordem: number;
};

export type GrupoPessoalId = "juros_limite" | "habitacao" | "veiculo" | "emprestimos" | "empresas" | "pagou_mf" | "comissoes" | "impostos"
  | "protestos" | "saude" | "seguros" | "cartoes" | "pedagio" | "postos" | "redes" | "mercadolivre" | "delivery" | "farmacia" | "mercado"
  | "online" | "assinaturas" | "casa" | "doacoes" | "tarifas" | "entre_contas" | "rendimentos";

/** Tipo e categoria da conta a pagar da MF quando o gasto é da empresa ("Lançar na MF"). */
export type NaMF = { tipo: "imposto" | "pessoal" | "fornecedor" | "servico" | "casa" | "outros"; categoria: string };

export type CardPessoal = {
  id: string; nome: string; dica: string;
  /** o que mostrar ao contador (card em âmbar) */
  aviso?: string;
  /** explicação que aparece ao abrir o card (não vai para o contador) */
  nota?: string;
  sentido: SentidoRegra;
  /** card em vermelho, em destaque, com o total de 12 meses */
  destaque?: boolean;
  /** fora das entradas e saídas do painel (dinheiro que só passou de uma conta sua para outra) */
  fora?: boolean;
  naMF?: NaMF;
  proprio?: boolean;
};
type CardPronto = CardPessoal & { id: GrupoPessoalId; testa?: (d: string, l: LancPessoal, e: Empresa) => boolean; sub?: (d: string) => string | null };

export const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Texto para comparar: sem acento, minúsculo, pontuação vira espaço. */
const limpo = (s: unknown) => ` ${sem(s).replace(/[^a-z0-9]+/g, " ").trim()} `;

const ATRASO = /multa|c perm|comiss(ao)? (de )?perm|juros|\bmora\b|atraso/;

/** Imposto pelo texto do extrato: o máximo de detalhe que o banco deixa ver. */
export function tipoImposto(d: string): string {
  if (/irpf|imposto de renda|carne leao/.test(d)) return "Imposto de renda (IRPF)";
  if (/\bdas\b|pgdas|simples nac/.test(d)) return "DAS (Simples ou MEI)";
  if (/darf|receita fed/.test(d)) return "DARF (Receita Federal)";
  if (/ipva/.test(d)) return "IPVA";
  if (/licenciamento|detran|departamento estadual de tr|transito/.test(d)) return "Detran (licenciamento e multas)";
  if (/iptu/.test(d)) return "IPTU";
  if (/\bgps\b|inss/.test(d)) return "INSS (GPS)";
  if (/fgts/.test(d)) return "FGTS";
  if (/gnre|icms|\bdae\b|\bdare\b|sefaz|fazenda/.test(d)) return "ICMS e GNRE (Sefaz)";
  if (/prefeitura|\biss\b|instituto de planejamento|alvara|municip/.test(d)) return "Prefeitura (ISS, alvará e taxas)";
  if (/secretaria/.test(d)) return "Secretaria (taxas)";
  return "Outros impostos e taxas";
}

/** De qual banco é o cartão pago. */
export function bancoDoCartao(d: string): string {
  if (/itau/.test(d)) return "Itaú";
  if (/midway|riachuelo/.test(d)) return "Midway (Riachuelo)";
  if (/\bbv\b/.test(d)) return "BV";
  if (/\bpan\b/.test(d)) return "Pan";
  if (/nubank|nu pagamento/.test(d)) return "Nubank";
  for (const [re, nome] of [[/santander/, "Santander"], [/bradesco/, "Bradesco"], [/caixa/, "Caixa"], [/\bc6\b/, "C6"], [/\binter\b/, "Inter"], [/sicredi/, "Sicredi"], [/sicoob/, "Sicoob"], [/mercado pago/, "Mercado Pago"]] as const) {
    if (re.test(d)) return nome;
  }
  return "Outros cartões";
}

const NA_MF_AVISO = "Gasto da empresa pago com o seu dinheiro: lance na MF (Contas a pagar, já paga) e anote como dinheiro do sócio. Confirmar com o contador.";

/** Os cards prontos, na ordem em que o lançamento é testado (entra no primeiro que combina). */
export const CARDS_PRONTOS: CardPronto[] = [
  { id: "juros_limite", nome: "Juros do limite da conta", dica: "Juros do cheque especial, juros de excesso do limite e adiantamento a depositante", sentido: "saida", destaque: true,
    nota: "Os juros do cheque especial são os mais caros do banco. Cada mês com a conta no negativo vira juros aqui: deixar a conta no positivo (ou trocar por um crédito mais barato) é dinheiro que sobra.",
    testa: (d) => /juros (do )?(limite|excesso|cheque)|excesso (de )?lim|limite da conta|cheque especial|adiant ?depositante|adiantamento a depositante/.test(d),
    sub: (d) => (/adiant/.test(d) ? "Adiantamento a depositante" : /excesso/.test(d) ? "Juros de excesso do limite" : "Juros do limite") },
  { id: "habitacao", nome: "Casa própria", dica: "Financiamento da casa (Caixa Habitação e outros)", sentido: "saida",
    nota: "Guarde o informe anual do banco: o financiamento da casa vai na declaração do IR (bens e dívidas). Confirmar com o contador.",
    testa: (d) => /habitacao|financ(iamento)? (imob|habit)|credito imob|\bsfh\b|minha casa minha vida/.test(d) },
  { id: "veiculo", nome: "Financiamento do carro", dica: "Parcela do carro (PAGTO FINANC VEIC), consórcio, leasing; multa e juros de atraso em vermelho", sentido: "saida",
    aviso: "Se o carro também serve à empresa, há caminhos dentro da lei (reembolso por km com controle ou o carro em nome da MF). Confirmar com o contador.",
    testa: (d) => /financ|\bfin veic|\bcdc\b|consorcio|leasing|parcela (do )?(carro|veiculo)/.test(d),
    sub: (d) => (ATRASO.test(d) ? "Multa e juros (pagas com atraso)" : "Parcelas") },
  { id: "emprestimos", nome: "Empréstimos", dica: "Empréstimo do banco ou entre pessoas (use uma regra com a meta, ex.: 3 x R$ 7 mil)", sentido: "ambos",
    aviso: "Dívida com pessoa ou banco acima de R$ 5 mil no fim do ano vai na declaração do IR (Dívidas e ônus), com o nome de quem emprestou. Confirmar com o contador.",
    testa: (d) => /emprestimo|consignado|cred(ito)? pessoal|parc(ela)? emprest/.test(d) },
  { id: "empresas", nome: "Entre você e as empresas", dica: "Pix entre a sua conta e a MF ou as empresas ligadas, nos dois sentidos", sentido: "ambos",
    aviso: "O que saiu para a empresa: aporte do sócio ou empréstimo (contrato de mútuo). O que veio dela: pró-labore, lucros ou devolução do empréstimo. Confirmar com o contador.",
    testa: (_d, l, e) => daEmpresa(l.descricao, e) },
  { id: "pagou_mf", nome: "Contas da MF pagas por você", dica: "Dívidas e contas da empresa pagas pela conta pessoal (pelas suas regras)", sentido: "saida",
    aviso: "Conta da MF paga com o seu dinheiro: lance na MF (Contas a pagar, já paga) e anote como empréstimo ou aporte do sócio. Confirmar com o contador.",
    naMF: { tipo: "fornecedor", categoria: "fornecedores" } },
  { id: "comissoes", nome: "Comissões", dica: "Comissões de venda pagas pela conta pessoal (pelas suas regras)", sentido: "saida",
    aviso: "Comissão de venda da MF paga pela sua conta: lance na MF como comissão (é despesa da empresa) e guarde o comprovante. Confirmar com o contador.",
    naMF: { tipo: "pessoal", categoria: "comissoes" } },
  { id: "impostos", nome: "Impostos", dica: "DARF, DAS, IPVA e Detran, IPTU, INSS, FGTS, GNRE, prefeitura: separados por tipo", sentido: "saida",
    aviso: "Imposto da MF pago daqui: lance na empresa (Contas a pagar, já pago) e anote como dinheiro do sócio. Confirmar com o contador.",
    naMF: { tipo: "imposto", categoria: "impostos" },
    testa: (d) => /darf|\bdas (mei|simples|sn)\b|pgdas|simples nac|ipva|iptu|irpf|imposto|receita fed|\bgps\b|inss|fgts|\bdae\b|\bdare\b|gnre|icms|tributo|licenciamento|detran|departamento estadual|transito|sefaz|secretaria|prefeitura|instituto de planejamento|alvara/.test(d),
    sub: tipoImposto },
  { id: "protestos", nome: "Protestos e cartório", dica: "Tabelionato de notas, protesto, cartório", sentido: "saida",
    aviso: "Se o protesto for de conta da MF, lance na MF (custas de cartório) e peça a carta de anuência ao credor para baixar o protesto. Confirmar com o contador.",
    naMF: { tipo: "outros", categoria: "outros" },
    testa: (d) => /tab (de )?notas|tabelionato|tabeliao|cartorio|protesto/.test(d) },
  { id: "saude", nome: "Plano de saúde", dica: "Unimed e outros planos", sentido: "saida",
    nota: "Plano de saúde abate no IR da pessoa física, sem limite (no modelo completo). Guarde o informe anual. Confirmar com o contador.",
    testa: (d) => /unimed|\bamil\b|sulamerica saude|bradesco saude|hapvida|notredame|plano de saude|odontoprev/.test(d) },
  { id: "seguros", nome: "Seguros e proteção", dica: "Seguro de vida, do carro, da casa, proteção familiar", sentido: "saida",
    testa: (d) => /seguro|\bseg\b|protecao|premio aces|allianz|porto seguro|mapfre|tokio marine|sulamerica|\bhdi\b/.test(d) },
  { id: "cartoes", nome: "Cartões de crédito", dica: "Faturas e boletos dos cartões (Itaú, Midway, BV, Pan, Nubank…), separados por banco", sentido: "saida",
    nota: "O que foi comprado no cartão entra nos outros cards quando o extrato do cartão está aqui; este card mostra só o pagamento das faturas.",
    testa: (d, l) => l.categoria === "Cartão (fatura)" || /fatura|pagamento cartao|pgto cartao|pag cartao|pgto min|pagamento minimo|itaucard|(pag|pagto|pgto|pagamento) (de )?boleto (itau|banco|midway|nu pagamento|nubank|santander|bradesco|caixa|c6|bv|pan)/.test(d),
    sub: bancoDoCartao },
  { id: "pedagio", nome: "Pedágio", dica: "Tag de pedágio (ConectCar, Sem Parar, Veloe)", sentido: "saida",
    aviso: "Pedágio de viagem a trabalho: dá para lançar na empresa com o extrato da tag (reembolso de despesa). Confirmar com o contador.",
    naMF: { tipo: "outros", categoria: "outros" },
    testa: (d) => /conectcar|sem parar|veloe|move mais|taggy|autopass|pedagio/.test(d) },
  { id: "postos", nome: "Postos de combustível", dica: "Gasolina, etanol, diesel no posto", sentido: "saida",
    testa: (d) => /\bposto|combust|gasolina|etanol|\bshell\b|ipiranga|petrobras|br mania/.test(d) },
  { id: "redes", nome: "Redes, anúncios e cursos", dica: "Facebook e Instagram, TikTok, Google, Hotmart, Kiwify, Eduzz", sentido: "saida",
    aviso: "Anúncio ou curso para a MF: peça a nota no CNPJ da empresa e lance lá (é despesa da empresa). Confirmar com o contador.",
    naMF: { tipo: "servico", categoria: "marketing" },
    testa: (d) => /facebook|instagram|\bmeta (ads|platforms)|bytedance|tiktok|google ads|hotmart|kiwify|eduzz|udemy|monetizze|braip/.test(d) },
  { id: "mercadolivre", nome: "Mercado Livre", dica: "Compras no Mercado Livre (PIX MARKETPLACE)", sentido: "saida",
    aviso: "Se foi peça ou material para a MF, peça a nota no CNPJ da empresa e lance lá. Confirmar com o contador.",
    testa: (d) => /mercado ?livre|pix marketp|marketplace|\bmeli\b/.test(d) },
  { id: "delivery", nome: "iFood e delivery", dica: "iFood, Rappi, Zé Delivery…", sentido: "saida",
    testa: (d) => /ifood|i food|rappi|ze delivery|uber ?eats|aiqfome|99 ?food/.test(d) },
  { id: "farmacia", nome: "Farmácia", dica: "Remédios e drogarias", sentido: "saida",
    testa: (d) => /farmacia|\bfarm\b|drogaria|drogas|\braia\b|rd saude|panvel|pague menos|drogasil|nissei|clamed/.test(d) },
  { id: "mercado", nome: "Supermercado e padaria", dica: "Supermercado, atacado, padaria, açougue", sentido: "saida",
    testa: (d, l) => l.categoria === "Mercado" || /superm|atacad|komprao|giassi|bistek|angeloni|assai|carrefour|hortifrut|sacolao|padaria|acougue|mercado\b(?! ?(livre|pago))/.test(d) },
  { id: "online", nome: "Compras pela internet", dica: "Shopee, Amazon, Shein, AliExpress e outras lojas online", sentido: "saida",
    aviso: "Se foi peça ou material para a MF, peça a nota no CNPJ da empresa e lance lá. Confirmar com o contador.",
    testa: (d) => /shopee|shpp|amazon|magalu|magazine luiza|shein|aliexpress|temu|ebanx|americanas|casas bahia|decolar|dlocal|mercado ?pago/.test(d) },
  { id: "assinaturas", nome: "Assinaturas", dica: "Streaming, nuvem, apps", sentido: "saida",
    testa: (d, l) => l.categoria === "Assinaturas" || /netflix|spotify|disney|prime video|youtube|\bhbo\b|globoplay|icloud|google one|apple com|deezer|paramount/.test(d) },
  { id: "casa", nome: "Contas da casa", dica: "Luz, água, internet, celular, aluguel, condomínio", sentido: "saida",
    testa: (d, l) => l.categoria === "Casa" || /\bclaro\b|unifique|\bvivo\b|\btim\b|telecom|celesc|\benel\b|cemig|copel|casan|sabesp|brk ambiental|aluguel|condominio/.test(d) },
  { id: "doacoes", nome: "Doações", dica: "LBV, igreja, campanhas", sentido: "saida",
    nota: "No IR da pessoa física, a doação à LBV não abate o imposto; a doação aos Fundos da Criança e do Adolescente e do Idoso abate até 6% do imposto devido (modelo completo). Confirmar com o contador.",
    testa: (d) => /lbv\b|doacao|dizimo|teleton|graacc|unicef/.test(d) },
  { id: "tarifas", nome: "Tarifas e IOF", dica: "IOF, tarifas e anuidade do banco", sentido: "saida",
    nota: "IOF e tarifas: dá para negociar o pacote de serviços com o banco ou usar uma conta digital sem tarifa.",
    testa: (d) => /tarifa|anuidade|\biof\b|cesta de servico|pacote de servico|encargo|\bmora\b|juros/.test(d),
    sub: (d) => (/\biof\b/.test(d) ? "IOF" : /anuidade/.test(d) ? "Anuidade" : /juros|encargo|mora/.test(d) ? "Outros juros e encargos" : "Tarifas") },
  { id: "entre_contas", nome: "Entre as suas contas", dica: "Dinheiro que só passou de uma conta sua para outra", sentido: "ambos", fora: true,
    nota: "Não é gasto nem entrada: fica fora dos totais do painel. Entra aqui sozinho quando sai de uma conta e entra na outra em até 2 dias, ou pelas suas regras." },
  { id: "rendimentos", nome: "Rendimentos", dica: "Rendimento da aplicação automática e outras aplicações", sentido: "entrada",
    testa: (d) => /rend pago|rendimento|rend aplic|juros (sobre|de) (poupanca|aplic)|remuneracao (da )?aplic|dividendo/.test(d) },
];
export const IDS_PRONTOS = new Set<string>(CARDS_PRONTOS.map((c) => c.id));
export const NOME_CARD_PRONTO = Object.fromEntries(CARDS_PRONTOS.map((c) => [c.id, c.nome])) as Record<GrupoPessoalId, string>;

/** Id do card da regra: o card pronto, se for um deles, ou "meu:<nome>" para um card criado pela pessoa. */
export const idDoCard = (card: string) => (IDS_PRONTOS.has(card.trim()) ? card.trim() : `meu:${sem(card).replace(/[^a-z0-9]+/g, " ").trim()}`);

/** Os cards criados pelas regras (os que não são prontos), com o nome que a pessoa deu. */
export function cardsDasRegras(regras: RegraPessoal[]): CardPessoal[] {
  const vistos = new Map<string, CardPessoal>();
  for (const r of regras) {
    if (!r.ativa || IDS_PRONTOS.has(r.card.trim())) continue;
    const id = idDoCard(r.card);
    const atual = vistos.get(id);
    const daEmpresa = r.da_empresa || !!atual?.aviso;
    vistos.set(id, {
      id, nome: r.card.trim(), dica: "Card criado por você (Regras dos cards)", sentido: "ambos", proprio: true,
      aviso: daEmpresa ? NA_MF_AVISO : undefined, naMF: daEmpresa ? naMFpeloTexto(`${r.card} ${r.texto}`) : undefined,
    });
  }
  return [...vistos.values()];
}

/** Conta a pagar da MF para o card próprio "da empresa", pelo nome e pelo texto da regra. */
export function naMFpeloTexto(t: string): NaMF {
  const d = sem(t);
  if (/telefon|celular|internet|claro|vivo|\btim\b|unifique|energia|luz|agua/.test(d)) return { tipo: "casa", categoria: "energia/água/internet" };
  if (/comiss/.test(d)) return { tipo: "pessoal", categoria: "comissoes" };
  if (/imposto|darf|\bdas\b|icms/.test(d)) return { tipo: "imposto", categoria: "impostos" };
  if (/acai|materia|insumo|peca|mercadoria|compra/.test(d)) return { tipo: "fornecedor", categoria: "fornecedores" };
  return { tipo: "outros", categoria: "outros" };
}

/** As partes do texto da regra: "ITAU GOLD / ITAU PLATINU; MIDWAY" → três textos. */
export const textosDaRegra = (texto: string) => texto.split(/\s\/\s|;|\n/).map((t) => limpo(t).trim()).filter((t) => t.length >= 2);

/** Saída que volta (estorno, devolução): desconta do card do gasto, em vez de virar entrada. */
const ehEstorno = (d: string) => /^ (est|dev|estorno|devol)\b| estorno | devolucao /.test(d);

/** `bancos`: o banco de cada conta do painel (o "PAGAMENTO DE FATURA" sem nome é do cartão do banco da própria conta). */
export type Contexto = { empresas: Empresa; regras: RegraPessoal[]; pares?: Set<string>; bancos?: Record<string, string | null | undefined> };
export type Classificacao = { card: string; regra: RegraPessoal | null; sub: string | null; estorno: boolean };

/**
 * A regra da pessoa que pega o lançamento (a primeira, pela ordem), se houver. O texto vale do começo de uma palavra
 * em diante: "transf fulan" pega "PIX TRANSF FULANO R" (o banco corta os nomes).
 */
export function regraDo(l: Pick<LancPessoal, "descricao" | "valor">, regras: RegraPessoal[]): RegraPessoal | null {
  const d = limpo(l.descricao);
  for (const r of [...regras].sort((a, b) => a.ordem - b.ordem)) {
    if (!r.ativa) continue;
    if (r.sentido === "saida" && l.valor > 0) continue;
    if (r.sentido === "entrada" && l.valor < 0) continue;
    if (textosDaRegra(r.texto).some((t) => d.includes(` ${t}`))) return r;
  }
  return null;
}

/** Em qual card o lançamento entra (ou null). */
export function classificar(l: LancPessoal, ctx: Contexto): Classificacao | null {
  if (ctx.pares?.has(l.id)) return { card: "entre_contas", regra: null, sub: null, estorno: false };
  const d = limpo(l.descricao);
  // estorno de um gasto (EST…, DEV PIX…) volta para o card do gasto, descontando
  const estorno = l.valor > 0 && ehEstorno(d);
  const regra = regraDo(estorno ? { ...l, valor: -l.valor } : l, ctx.regras);
  if (regra) {
    const card = idDoCard(regra.card);
    const pronto = CARDS_PRONTOS.find((c) => c.id === card);
    return { card, regra, sub: regra.rotulo?.trim() || pronto?.sub?.(d) || null, estorno };
  }
  for (const c of CARDS_PRONTOS) {
    if (!c.testa) continue;
    const vale = c.sentido === "ambos" || (c.sentido === "saida" ? l.valor < 0 || estorno : l.valor > 0 && !estorno);
    if (!vale || !c.testa(d, l, ctx.empresas)) continue;
    let sub = c.sub?.(d) ?? null;
    if (c.id === "cartoes" && sub === "Outros cartões" && ctx.bancos?.[l.conta_id]) sub = bancoDoCartao(limpo(ctx.bancos[l.conta_id])) === "Outros cartões" ? String(ctx.bancos[l.conta_id]).trim() : bancoDoCartao(limpo(ctx.bancos[l.conta_id]));
    return { card: c.id, regra: null, sub, estorno: estorno && c.sentido === "saida" };
  }
  return null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const vale = (l: LancPessoal) => !l.anulado && l.situacao === "realizado";
const dentro = (d: string, f: Faixa) => d >= f.de && d <= f.ate;

export type ResultadoCard = CardPessoal & {
  saiu: number; entrou: number; qtd: number; anteriorSaiu: number; anteriorEntrou: number;
  /** soma do que importa no card (o que saiu, o que entrou ou os dois) */
  total: number; anterior: number;
  /** 12 meses até o fim do período (só no card em destaque) */
  doze: number | null;
  /** multa e juros de atraso (financiamento do carro) */
  atraso: number;
  partes: { nome: string; total: number; qtd: number }[];
  observacoes: string[];
};

/** Os cards com movimento no período ou no anterior, na ordem: o destaque primeiro, depois os prontos e os próprios. */
export function cardsDoPeriodo(lancs: LancPessoal[], f: Faixa, ant: Faixa, ctx: Contexto, doze?: Faixa): ResultadoCard[] {
  const lista: CardPessoal[] = [...CARDS_PRONTOS, ...cardsDasRegras(ctx.regras)];
  const soma = new Map<string, { saiu: number; entrou: number; qtd: number; aS: number; aE: number; doze: number; atraso: number; partes: Map<string, { total: number; qtd: number }> }>();
  for (const l of lancs) {
    if (!vale(l)) continue;
    const agora = dentro(l.data, f), antes = dentro(l.data, ant), noAno = !!doze && dentro(l.data, doze);
    if (!agora && !antes && !noAno) continue;
    const c = classificar(l, ctx);
    if (!c) continue;
    const s = soma.get(c.card) ?? { saiu: 0, entrou: 0, qtd: 0, aS: 0, aE: 0, doze: 0, atraso: 0, partes: new Map() };
    const v = Number(l.valor);
    // estorno: desconta do que saiu
    const saida = v < 0 ? -v : c.estorno ? -v : 0;
    const entrada = v > 0 && !c.estorno ? v : 0;
    if (agora) {
      s.saiu += saida; s.entrou += entrada; s.qtd += 1;
      if (c.sub) {
        const p = s.partes.get(c.sub) ?? { total: 0, qtd: 0 };
        p.total += saida + entrada; p.qtd += 1;
        s.partes.set(c.sub, p);
      }
      if (c.card === "veiculo" && ATRASO.test(limpo(l.descricao))) s.atraso += saida;
    }
    if (antes) { s.aS += saida; s.aE += entrada; }
    if (noAno) s.doze += saida;
    soma.set(c.card, s);
  }
  const res: ResultadoCard[] = [];
  for (const card of lista) {
    const s = soma.get(card.id);
    if (!s) continue;
    const principal = (a: number, b: number) => (card.sentido === "saida" ? a : card.sentido === "entrada" ? b : a + b);
    res.push({
      ...card, saiu: r2(s.saiu), entrou: r2(s.entrou), qtd: s.qtd, anteriorSaiu: r2(s.aS), anteriorEntrou: r2(s.aE),
      total: r2(principal(s.saiu, s.entrou)), anterior: r2(principal(s.aS, s.aE)),
      doze: card.destaque && doze ? r2(s.doze) : null, atraso: r2(s.atraso),
      partes: [...s.partes].map(([nome, p]) => ({ nome, total: r2(p.total), qtd: p.qtd })).sort((a, b) => b.total - a.total),
      observacoes: [...new Set(ctx.regras.filter((r) => r.ativa && idDoCard(r.card) === card.id && r.observacao?.trim()).map((r) => r.observacao!.trim()))],
    });
  }
  return res.sort((a, b) => Number(!!b.destaque) - Number(!!a.destaque));
}

/** Progresso das regras com meta (ex.: empréstimo de 3 x R$ 7 mil): quanto já saiu, em quantas vezes, desde sempre. */
export function metasDasRegras(lancs: LancPessoal[], regras: RegraPessoal[]) {
  return regras.filter((r) => r.ativa && r.meta_total).map((r) => {
    const pagos = lancs.filter((l) => vale(l) && l.valor < 0 && regraDo(l, [r]) === r);
    const pago = r2(-pagos.reduce((t, l) => t + Number(l.valor), 0));
    const meta = Number(r.meta_total);
    return { regra: r, card: idDoCard(r.card), pago, vezes: pagos.length, falta: r2(Math.max(0, meta - pago)), pct: Math.min(100, Math.round((pago / meta) * 100)) };
  });
}

/* --------------------------- lançamentos repetidos e entre as próprias contas --------------------------- */

const PRIORIDADE: Record<string, number> = { arquivo: 3, pluggy: 2, pdf: 1, digitado: 0 };

/**
 * O mesmo extrato importado por dois caminhos (ex.: PDF e OFX): cada par vira uma cópia para anular, ficando o de
 * melhor origem (OFX, depois Meu Pluggy, depois PDF). Duas linhas iguais do mesmo arquivo não são repetidas.
 */
export function repetidosDeArquivo(lancs: LancPessoal[]): LancPessoal[] {
  const grupos = new Map<string, LancPessoal[]>();
  for (const l of lancs) {
    if (l.anulado || origemDo(l) === "digitado") continue;
    const k = chaveDoLanc(l);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const copias: LancPessoal[] = [];
  for (const g of grupos.values()) {
    const porOrigem = new Map<string, LancPessoal[]>();
    for (const l of g) porOrigem.set(origemDo(l), [...(porOrigem.get(origemDo(l)) ?? []), l]);
    if (porOrigem.size < 2) continue;
    // fica a origem melhor com todas as suas linhas; das outras, sai uma cópia para cada linha que ficou
    const ordem = [...porOrigem.keys()].sort((a, b) => PRIORIDADE[b] - PRIORIDADE[a]);
    const ficam = porOrigem.get(ordem[0])!.length;
    for (const o of ordem.slice(1)) copias.push(...porOrigem.get(o)!.slice(0, ficam));
  }
  return copias;
}

/**
 * Dinheiro que só passou de uma conta da pessoa para outra: saída numa conta e entrada do mesmo valor noutra em até
 * 2 dias (um Pix ou transferência, sem cartão no meio). Devolve os ids dos dois lados.
 */
export function paresEntreContas(lancs: LancPessoal[], contas: ContaPessoal[], pula?: (l: LancPessoal) => boolean): Set<string> {
  const cartao = new Set(contas.filter((c) => c.tipo === "cartao").map((c) => c.id));
  const transf = (l: LancPessoal) => /pix|transf|\bted\b|\bdoc\b/.test(sem(l.descricao));
  const ok = lancs.filter((l) => vale(l) && !cartao.has(l.conta_id) && !pula?.(l));
  const entradas = ok.filter((l) => l.valor > 0).sort((a, b) => a.data.localeCompare(b.data));
  const usados = new Set<string>();
  const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
  for (const s of ok.filter((l) => l.valor < 0).sort((a, b) => a.data.localeCompare(b.data))) {
    const e = entradas.find((x) => !usados.has(x.id) && x.conta_id !== s.conta_id && Math.abs(Number(x.valor) + Number(s.valor)) < 0.005
      && dias(s.data, x.data) >= 0 && dias(s.data, x.data) <= 2 && (transf(s) || transf(x)));
    if (e) { usados.add(e.id); usados.add(s.id); }
  }
  return usados;
}

/** Texto sugerido para uma regra nova a partir do lançamento: sem datas, números soltos e o fim cortado. */
export function textoSugerido(descricao: string): string {
  return sem(descricao).replace(/\d{1,2}[/ ]\d{1,2}(?:[/ ]\d{2,4})?/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter((w) => w.length > 1).slice(0, 4).join(" ");
}
