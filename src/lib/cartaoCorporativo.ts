// Cartão corporativo de uma pessoa (ex.: "Cartão Fabiano", conta InfinitePay da filial SP): cada débito do extrato vira
// um gasto do cartão com a categoria (pela loja), se precisa de nota para entrar na empresa (Lucro Real) e a situação da
// nota. Casa a compra com a NF-e recebida do mesmo valor. Funções puras (testadas).
import { COMBUSTIVEL, esferaImposto, funcionarioDoLancamento } from "./extratoTipos";
import { marketplaceDoExtrato } from "./marketplaces";

export type CategoriaCartao =
  | "alimentacao" | "mercado" | "combustivel" | "veiculo" | "material" | "online" | "farmacia" | "contas" | "imposto"
  | "pedagio" | "pix" | "funcionario" | "transferencia" | "tarifa" | "outros";

/** Categorias que dá para escolher à mão (as aceitas em cartao_gastos.categoria). */
export const CATEGORIAS_ESCOLHA = ["alimentacao", "mercado", "combustivel", "veiculo", "material", "online", "pedagio", "pix", "tarifa", "outros"] as const;

type InfoCategoria = { rotulo: string; chip: string; barra: string; precisaNota: boolean; dica: string };
export const CATEGORIAS: Record<CategoriaCartao, InfoCategoria> = {
  alimentacao: { rotulo: "Alimentação", chip: "bg-orange-100 text-orange-900", barra: "bg-orange-500", precisaNota: true,
    dica: "Refeição em serviço (viagem, instalação, atendimento): peça o cupom com o CNPJ da MF. Lanche do dia a dia de sócio ou diretor tende a ser indedutível — confirmar com o contador." },
  mercado: { rotulo: "Mercado", chip: "bg-lime-100 text-lime-900", barra: "bg-lime-500", precisaNota: true,
    dica: "Copa, café, limpeza e descartáveis da empresa: cupom com o CNPJ da MF. Compra para casa é pessoal." },
  combustivel: { rotulo: "Combustível", chip: "bg-red-100 text-red-900", barra: "bg-red-500", precisaNota: true,
    dica: "Peça a nota com o CNPJ da MF e a placa. Veículo usado em vendas, entregas e assistência entra; carro de uso pessoal, não (Lei 9.249/95, art. 13)." },
  veiculo: { rotulo: "Veículo e transporte", chip: "bg-slate-200 text-slate-900", barra: "bg-slate-500", precisaNota: true,
    dica: "Oficina, peças, pneus, estacionamento e corrida a serviço: nota ou recibo com o CNPJ da MF (e a placa, se for veículo)." },
  material: { rotulo: "Material e ferramentas", chip: "bg-amber-100 text-amber-900", barra: "bg-amber-500", precisaNota: true,
    dica: "Material, ferramenta e manutenção: nota com o CNPJ da MF. Item acima de R$ 1.200 ou que dure mais de 1 ano pode ir para o imobilizado (RIR/2018, art. 313) — confirmar com o contador." },
  online: { rotulo: "Compras online e apps", chip: "bg-violet-100 text-violet-900", barra: "bg-violet-500", precisaNota: true,
    dica: "Compra em site, marketplace ou app: emita a nota no site/app com o CNPJ da MF. Assinatura pessoal não entra." },
  farmacia: { rotulo: "Farmácia", chip: "bg-pink-100 text-pink-900", barra: "bg-pink-500", precisaNota: true,
    dica: "Remédio é gasto pessoal. Só entra o kit de primeiros socorros da empresa, com cupom no CNPJ da MF." },
  contas: { rotulo: "Contas e boletos", chip: "bg-sky-100 text-sky-900", barra: "bg-sky-500", precisaNota: true,
    dica: "Conta ou boleto pago: guarde a fatura ou a NF no nome da MF. Conta pessoal (casa, financiamento) não entra." },
  imposto: { rotulo: "Impostos e taxas", chip: "bg-indigo-100 text-indigo-900", barra: "bg-indigo-500", precisaNota: false,
    dica: "A própria guia (DARE, DARF, taxa) é o documento. IPVA e multa de veículo pessoal não entram." },
  pedagio: { rotulo: "Pedágio", chip: "bg-teal-100 text-teal-900", barra: "bg-teal-500", precisaNota: false,
    dica: "Guarde o recibo ou o extrato da tag. Entra quando a viagem é a serviço." },
  pix: { rotulo: "Pix enviados", chip: "bg-cyan-100 text-cyan-900", barra: "bg-cyan-500", precisaNota: true,
    dica: "Pix para empresa: peça a NF. Para pessoa (serviço): NF do MEI ou recibo de autônomo (RPA) — sem documento, o gasto não entra e pode ter IRRF." },
  funcionario: { rotulo: "Funcionários", chip: "bg-emerald-100 text-emerald-900", barra: "bg-emerald-500", precisaNota: false,
    dica: "Pagamento a funcionário: o documento é a folha ou o recibo assinado." },
  transferencia: { rotulo: "Entre contas da MF", chip: "bg-slate-100 text-slate-600", barra: "bg-slate-300", precisaNota: false,
    dica: "Transferência entre contas da própria empresa: não é gasto." },
  tarifa: { rotulo: "Tarifas", chip: "bg-slate-100 text-slate-700", barra: "bg-slate-400", precisaNota: false,
    dica: "Tarifa do banco ou da maquininha: o extrato é o documento." },
  outros: { rotulo: "Outros", chip: "bg-slate-100 text-slate-800", barra: "bg-slate-400", precisaNota: true,
    dica: "Peça a nota com o CNPJ da MF. Se a compra foi pessoal, marque como pessoal." },
};

export type SituacaoNota = "pendente" | "pedida" | "recebida" | "sem_nota" | "pessoal";
export const SITUACOES: Record<SituacaoNota, { rotulo: string; chip: string }> = {
  pendente: { rotulo: "Pedir nota", chip: "bg-red-100 text-red-800" },
  pedida: { rotulo: "Nota pedida", chip: "bg-amber-100 text-amber-900" },
  recebida: { rotulo: "Nota ok", chip: "bg-emerald-100 text-emerald-800" },
  sem_nota: { rotulo: "Sem nota", chip: "bg-slate-200 text-slate-700" },
  pessoal: { rotulo: "Pessoal", chip: "bg-purple-100 text-purple-800" },
};

export type GastoCartao = {
  id: string; data: string; valor: number; descricao: string | null; identificador?: string | null; status?: string | null;
  conta_pagar_id?: string | null; situacao: SituacaoNota; categoria?: string | null; nota_numero?: string | null;
  nfe_recebida_id?: string | null; observacao?: string | null; atualizado_em?: string | null;
};
export type NotaCartao = { id: string; chave?: string | null; emitente_nome: string | null; valor_total: number; data_emissao: string };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PREFIXO_MAQUININHA = /^(mp|jim\.?com|pdv|cappta|fly|fundopa|pag|sumup|ton|stone)\s*\*\s*/i;

/** Nome da loja como a pessoa reconhece: sem "· mfmaquinas", sem o prefixo da maquininha (MP *, JIM.COM*…) e com maiúsculas só no começo. */
export function lojaDoGasto(descricao: string | null | undefined) {
  const s = String(descricao ?? "").split(" · ")[0].replace(/^pix\s+/i, "").replace(PREFIXO_MAQUININHA, "").replace(/\s+/g, " ").trim();
  const t = s.toLowerCase().replace(/(^|[\s.\-/(])([a-zà-ú])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return t || "—";
}

const POSTO = /(^|[^a-z])(auto\s*)?postos?([^a-z]|$)|autoposto|combust|abastec/;
const PEDAGIO = /(sem\s*parar|conectcar|veloe|pedagio|autoban|ecovias|ecopistas|arteris|move\s*mais|rodoanel)/;
const VEICULO = /(oficina|auto\s*center|autocenter|pneu|borrachar|funilar|lava\s*-?\s*jato|lava\s*rapido|estaciona|parkin|\bpark\b|guincho|auto\s*pecas|autopecas|retifica|mecanica|\buber\b|99\s*(app|pop)|\btaxi\b)/;
const FARMACIA = /(drogari|farmac|drogasil|\braia\b|pharma|panvel|pague\s*menos|drogao)/;
const ONLINE = /(\bapps?\b|google|apple\.com|itunes|netflix|spotify|hotmart|kiwify|canva|microsoft)/;
const ALIMENTACAO = /(padaria|panific|confeit|espet|restaurant|lanch|pizz|burg|churras|cafeter|\bcafe\b|acai|sorvet|marmit|ifood|kiosk|pastel|food|grill|cozinha|feito pao|doceri|boteco|chopp|sushi|comida|refeic|rotisser|salgad|prensad|\bcoco\b|conveniencia|\bbar\b)/;
const MERCADO = /(supermerc|superm|\bsup\b|mercado|mercearia|atacad|assai|covabra|good\s*bom|hortifr|sacolao|carrefour|komprao|emporio|acougue|casa de carnes|hiper|minimerc|\bdia\b)/;
const MATERIAL = /(eletro|materia|constru|\bconst\b|ferrag|ferram|paraf|tinta|hidraul|leroy|madeir|vidra|eletric|solda|gases|refrigera|rolament|mangueir|utilidades|gmad|lumen|watts|metais|\binox\b|\bepi\b)/;

/** Categoria do gasto pela descrição do extrato (a escolhida à mão, se houver, vem antes: ver categoriaDe). */
export function categoriaCartao(descricao: string | null | undefined, valor: number, funcionarios: { nome: string }[] = []): CategoriaCartao {
  const d = sem(descricao);
  if (/pagamento efetuado/.test(d)) return esferaImposto(descricao) ? "imposto" : "contas";
  if (/^pix\b/.test(d)) {
    if (/\b(mf\s*maquinas|mf\s*maq\w*|my\s*frost)\b/.test(d)) return "transferencia";
    if (funcionarios.length && funcionarioDoLancamento(descricao, funcionarios)) return "funcionario";
    return "pix";
  }
  if (esferaImposto(descricao)) return "imposto";
  if (/\b(tarifa|anuidade|iof|juros|mensalidade infinitepay)\b/.test(d)) return "tarifa";
  const loja = sem(lojaDoGasto(descricao));
  if (POSTO.test(loja) || COMBUSTIVEL.test(loja)) return "combustivel";
  if (PEDAGIO.test(loja)) return "pedagio";
  if (VEICULO.test(loja)) return "veiculo";
  if (FARMACIA.test(loja)) return "farmacia";
  if (ALIMENTACAO.test(loja)) return "alimentacao";
  if (marketplaceDoExtrato(descricao, valor) || ONLINE.test(loja)) return "online";
  if (MERCADO.test(loja)) return "mercado";
  if (MATERIAL.test(loja)) return "material";
  return "outros";
}

export const categoriaDe = (g: GastoCartao, funcionarios: { nome: string }[] = []): CategoriaCartao =>
  (g.categoria && g.categoria in CATEGORIAS ? g.categoria as CategoriaCartao : categoriaCartao(g.descricao, Number(g.valor), funcionarios));

/**
 * Casa compra × NF-e recebida da unidade: mesmo valor (ao centavo) e até 5 dias de diferença; cada nota casa uma vez só,
 * com a compra de data mais próxima. Volta id do gasto → nota.
 */
export function casarNotas(gastos: GastoCartao[], notas: NotaCartao[]): Map<string, NotaCartao> {
  const dia = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;
  const pares: { g: string; n: NotaCartao; dif: number }[] = [];
  for (const g of gastos) {
    if (g.nfe_recebida_id) continue;
    const v = Math.round(-Number(g.valor) * 100);
    for (const n of notas) {
      const dif = Math.abs(dia(String(n.data_emissao).slice(0, 10)) - dia(g.data));
      if (Math.round(Number(n.valor_total) * 100) === v && dif <= 5) pares.push({ g: g.id, n, dif });
    }
  }
  pares.sort((a, b) => a.dif - b.dif);
  const out = new Map<string, NotaCartao>();
  const usadas = new Set<string>(gastos.map((g) => g.nfe_recebida_id).filter(Boolean) as string[]);
  for (const p of pares) {
    if (out.has(p.g) || usadas.has(p.n.id)) continue;
    out.set(p.g, p.n);
    usadas.add(p.n.id);
  }
  return out;
}

export type EstadoNota = "ok" | "falta" | "pedida" | "sem_nota" | "pessoal" | "nao_precisa";
/** Como está a nota do gasto: ok (recebida, ligada a conta a pagar ou NF-e casada), falta, pedida, sem nota, pessoal ou não precisa. */
export function estadoNota(g: GastoCartao, categoria: CategoriaCartao, casada?: NotaCartao | null): EstadoNota {
  if (g.situacao === "pessoal") return "pessoal";
  if (g.situacao === "sem_nota") return "sem_nota";
  if (g.situacao === "recebida" || g.nfe_recebida_id || g.conta_pagar_id || casada) return "ok";
  if (!CATEGORIAS[categoria].precisaNota) return "nao_precisa";
  return g.situacao === "pedida" ? "pedida" : "falta";
}

export type LinhaCategoria = { categoria: CategoriaCartao; n: number; total: number; falta: number; faltaValor: number };
export type ResumoCartao = {
  n: number; total: number; porCategoria: LinhaCategoria[];
  /** compras que precisam de nota: quantas, quantas já têm e quanto falta */
  precisam: number; comNota: number; falta: number; faltaValor: number; pedidas: number; semNota: number; pessoal: number; pessoalValor: number;
  pctComNota: number;
};

/** Resumo de um período: total gasto (sem transferências entre contas da MF), por categoria e a situação das notas. */
export function resumoCartao(gastos: GastoCartao[], casadas: Map<string, NotaCartao> = new Map(), funcionarios: { nome: string }[] = []): ResumoCartao {
  const porCat = new Map<CategoriaCartao, LinhaCategoria>();
  const r: ResumoCartao = { n: 0, total: 0, porCategoria: [], precisam: 0, comNota: 0, falta: 0, faltaValor: 0, pedidas: 0, semNota: 0, pessoal: 0, pessoalValor: 0, pctComNota: 100 };
  const vistos = new Set<string>();
  for (const g of gastos) {
    if (g.identificador) { if (vistos.has(g.identificador)) continue; vistos.add(g.identificador); }
    const cat = categoriaDe(g, funcionarios);
    if (cat === "transferencia") continue;
    const v = Math.round(-Number(g.valor) * 100) / 100;
    const est = estadoNota(g, cat, casadas.get(g.id));
    const l = porCat.get(cat) ?? { categoria: cat, n: 0, total: 0, falta: 0, faltaValor: 0 };
    l.n += 1; l.total = Math.round((l.total + v) * 100) / 100;
    r.n += 1; r.total = Math.round((r.total + v) * 100) / 100;
    if (est === "pessoal") { r.pessoal += 1; r.pessoalValor = Math.round((r.pessoalValor + v) * 100) / 100; }
    if (est === "sem_nota") r.semNota += 1;
    if (est !== "nao_precisa" && est !== "pessoal") r.precisam += 1;
    if (est === "ok") r.comNota += 1;
    if (est === "falta" || est === "pedida") {
      l.falta += 1; l.faltaValor = Math.round((l.faltaValor + v) * 100) / 100;
      r.falta += 1; r.faltaValor = Math.round((r.faltaValor + v) * 100) / 100;
      if (est === "pedida") r.pedidas += 1;
    }
    porCat.set(cat, l);
  }
  r.porCategoria = [...porCat.values()].sort((a, b) => b.total - a.total);
  r.pctComNota = r.precisam ? Math.round((r.comNota / r.precisam) * 100) : 100;
  return r;
}

export type Periodo = "hoje" | "ontem" | "7dias" | "mes" | "mes_passado";
export const PERIODOS_CARTAO: { id: Periodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" }, { id: "ontem", rotulo: "Ontem" }, { id: "7dias", rotulo: "7 dias" }, { id: "mes", rotulo: "Este mês" }, { id: "mes_passado", rotulo: "Mês passado" },
];

const somar = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Datas (de, até) do período a partir de hoje (AAAA-MM-DD). */
export function intervaloCartao(p: Periodo, hoje: string): { de: string; ate: string } {
  if (p === "hoje") return { de: hoje, ate: hoje };
  if (p === "ontem") return { de: somar(hoje, -1), ate: somar(hoje, -1) };
  if (p === "7dias") return { de: somar(hoje, -6), ate: hoje };
  const inicio = `${hoje.slice(0, 7)}-01`;
  if (p === "mes") return { de: inicio, ate: hoje };
  return { de: `${somar(inicio, -1).slice(0, 7)}-01`, ate: somar(inicio, -1) };
}
export const noPeriodo = (g: Pick<GastoCartao, "data">, i: { de: string; ate: string }) => g.data >= i.de && g.data <= i.ate;
