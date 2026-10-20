// Plano de contas no Lucro Real: para cada categoria, se a despesa abate o IRPJ/CSLL (dedutível), se dá crédito de
// PIS/COFINS (não cumulativo) e a base legal, para o contador conferir. Também as categorias que costumam faltar.
// É orientação gerencial: quem decide o tratamento na apuração oficial é o contador. Arquivo puro (testado).
import type { GrupoDre } from "./dre";

export type Deducao = "sim" | "parcial" | "nao" | "fora";
export type Credito = "sim" | "talvez" | "nao";
export type TratamentoLR = { deducao: Deducao; credito: Credito; nota: string };

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// a primeira regra que bate no nome vale; a ordem importa (ex.: "multas fiscais" antes de "juros e multas")
const REGRAS: [RegExp, TratamentoLR][] = [
  [/\b(irpj|csll)\b/, { deducao: "fora", credito: "nao", nota: "Tributo sobre o lucro: não abate a própria base (Lei 9.316/96)." }],
  [/distribuicao de lucro|retirada|dividendo/, { deducao: "fora", credito: "nao", nota: "Distribuição de lucro não é despesa; isenta para o sócio (Lei 9.249/95, art. 10)." }],
  [/adiantamento|terceiros|transferencia/, { deducao: "fora", credito: "nao", nota: "Só controle: dinheiro que entra e sai sem ser receita nem despesa." }],
  [/investiment|imobilizado|maquinas e equipamentos/, { deducao: "fora", credito: "sim", nota: "Vai para o ativo; abate pela depreciação e dá crédito de PIS/COFINS sobre a depreciação de máquinas da produção (Lei 10.833/03, art. 3º, VI)." }],
  [/devoluc/, { deducao: "sim", credito: "sim", nota: "Dedução da receita; estorna o PIS/COFINS da venda devolvida (Lei 10.833/03, art. 3º, VIII)." }],
  [/^impostos?$|\bicms\b|\bipi\b|\bpis\b|\bcofins\b|\bdifal\b/, { deducao: "sim", credito: "nao", nota: "Impostos sobre a venda: saem da receita bruta antes do lucro." }],
  [/multas? fiscais|multa de transito|multa punitiva/, { deducao: "nao", credito: "nao", nota: "Multa punitiva não abate o IRPJ/CSLL (Lei 8.981/95, art. 41, §5º); a de mora abate." }],
  [/juros e multas|juros/, { deducao: "parcial", credito: "nao", nota: "Juros e multa de mora abatem; multa punitiva (fiscal, trânsito) não (Lei 8.981/95, art. 41, §5º)." }],
  [/brinde/, { deducao: "nao", credito: "nao", nota: "Brindes não abatem o IRPJ/CSLL (Lei 9.249/95, art. 13, VII)." }],
  [/doac/, { deducao: "parcial", credito: "nao", nota: "Doação só abate nos limites da lei (Lei 9.249/95, art. 13, §2º): a entidades com certificado, até 2% do lucro." }],
  [/tarifa|antecipac|encargos financeiros|iof/, { deducao: "sim", credito: "nao", nota: "Despesa financeira: abate o IRPJ/CSLL; não dá crédito de PIS/COFINS." }],
  [/fornecedor|materia.prima|insumo|mercadoria|componente/, { deducao: "sim", credito: "sim", nota: "Custo de insumos e mercadorias: abate pelo CMV e dá crédito de PIS/COFINS (Lei 10.833/03, art. 3º, I e II)." }],
  [/frete|correios|transport/, { deducao: "sim", credito: "sim", nota: "Frete na compra entra no custo; frete na venda pago pela MF dá crédito (Lei 10.833/03, art. 3º, IX)." }],
  [/energia/, { deducao: "sim", credito: "sim", nota: "Energia elétrica dá crédito de PIS/COFINS (Lei 10.833/03, art. 3º, III); água e internet não. Separe a energia em categoria própria." }],
  [/aluguel/, { deducao: "sim", credito: "sim", nota: "Aluguel pago a empresa (prédio, máquinas) dá crédito (Lei 10.833/03, art. 3º, IV); pago a pessoa física não." }],
  [/manutenc|conserto/, { deducao: "sim", credito: "talvez", nota: "Manutenção de máquinas da produção é insumo e dá crédito (STJ, REsp 1.221.170); a do escritório não." }],
  [/epi|uniforme/, { deducao: "sim", credito: "sim", nota: "EPI e uniforme da produção dão crédito (Lei 10.833/03, art. 3º, X)." }],
  [/material de consumo|embalag/, { deducao: "sim", credito: "talvez", nota: "Dá crédito quando é usado na produção (insumo, STJ REsp 1.221.170); material de escritório não." }],
  [/servicos profissionais|terceiriz/, { deducao: "sim", credito: "talvez", nota: "Serviço de empresa aplicado na produção dá crédito; contador, advogado e consultoria não." }],
  [/combustiv/, { deducao: "sim", credito: "talvez", nota: "Abate quando o veículo é da atividade; crédito só no transporte de produção/entrega (confirmar com o contador)." }],
  [/veicul|pedagio/, { deducao: "parcial", credito: "nao", nota: "Veículo usado na atividade abate; o de uso dos sócios/diretores não (Lei 9.249/95, art. 13, III)." }],
  [/alimentac|copa|refeic/, { deducao: "parcial", credito: "nao", nota: "Abate quando é fornecida a todos os empregados (Lei 9.249/95, art. 13, §1º); refeição de sócio não." }],
  [/folha|salari|ferias|decimo|13o|encargos sociais|\binss\b|\bfgts\b/, { deducao: "sim", credito: "nao", nota: "Salários e encargos abatem o IRPJ/CSLL; não dão crédito de PIS/COFINS." }],
  [/pro.labore/, { deducao: "sim", credito: "nao", nota: "Pró-labore abate o IRPJ/CSLL (com INSS de 20%); não dá crédito." }],
  [/comiss/, { deducao: "sim", credito: "nao", nota: "Comissão sobre vendas abate; não dá crédito de PIS/COFINS." }],
  [/marketing|publicidade|propaganda/, { deducao: "sim", credito: "nao", nota: "Propaganda ligada à atividade abate (Lei 4.506/64, art. 54); não dá crédito." }],
  [/sistema|assinatura|software|internet|telefon|agua/, { deducao: "sim", credito: "nao", nota: "Despesa operacional: abate o IRPJ/CSLL; não dá crédito de PIS/COFINS." }],
  [/seguro/, { deducao: "sim", credito: "nao", nota: "Seguro de bens da atividade abate; não dá crédito (só o de armazenagem na venda)." }],
];

// receitas: o que paga imposto (a coluna "abate" não se aplica)
const RECEITAS: [RegExp, TratamentoLR][] = [
  [/financeir|rendiment|juros/, { deducao: "sim", credito: "nao", nota: "Receita financeira: entra no IRPJ/CSLL e paga PIS 0,65% e COFINS 4% (Decreto 8.426/15)." }],
  [/assistencia|servico/, { deducao: "sim", credito: "nao", nota: "Receita de serviço: ISS no município e PIS/COFINS 9,25%." }],
  [/./, { deducao: "sim", credito: "nao", nota: "Receita da venda: base do PIS/COFINS 9,25% (não cumulativo), ICMS e IPI." }],
];

const PADRAO: TratamentoLR = { deducao: "sim", credito: "nao", nota: "Despesa necessária à atividade abate o IRPJ/CSLL (RIR/2018, art. 311). Confirme com o contador." };

/** Tratamento da categoria no Lucro Real, pelo nome e pela linha do DRE. */
export function tratamentoLucroReal(nome: string, grupo?: GrupoDre | string | null): TratamentoLR {
  const n = sem(nome);
  if (grupo === "receita" || grupo === "receita_financeira") {
    for (const [re, t] of RECEITAS) if (re.test(grupo === "receita_financeira" ? `financeira ${n}` : n)) return t;
  }
  for (const [re, t] of REGRAS) if (re.test(n)) return t;
  if (grupo === "investimento" || grupo === "retirada" || grupo === "transferencia") return { deducao: "fora", credito: "nao", nota: "Fora do resultado: só controle." };
  if (grupo === "tributos") return REGRAS[0][1];
  return PADRAO;
}

export const ROTULO_DEDUCAO: Record<Deducao, string> = { sim: "abate IR/CSLL", parcial: "abate em parte", nao: "não abate", fora: "fora do resultado" };
export const ROTULO_CREDITO: Record<Credito, string> = { sim: "crédito PIS/COFINS", talvez: "crédito se for da produção", nao: "" };

/** Categorias que costumam faltar no Lucro Real e mudam o imposto (para criar com um toque). */
export const CATEGORIAS_SUGERIDAS: { nome: string; grupo: GrupoDre; porque: string }[] = [
  { nome: "energia elétrica", grupo: "despesa_operacional", porque: "separada de água e internet, dá crédito de PIS/COFINS" },
  { nome: "manutenção de máquinas da produção", grupo: "custo", porque: "insumo: dá crédito de PIS/COFINS" },
  { nome: "EPI e uniformes", grupo: "custo", porque: "dá crédito de PIS/COFINS" },
  { nome: "encargos sociais (INSS e FGTS)", grupo: "despesa_operacional", porque: "separa o custo real da folha" },
  { nome: "multas fiscais e de trânsito", grupo: "outros", porque: "não abatem o IRPJ/CSLL: o contador precisa somar de volta (LALUR)" },
  { nome: "brindes", grupo: "despesa_operacional", porque: "não abatem o IRPJ/CSLL: separar para o LALUR" },
  { nome: "seguros", grupo: "despesa_operacional", porque: "abatem; hoje caem em outras categorias" },
  { nome: "depreciação", grupo: "despesa_operacional", porque: "abate e dá crédito sobre máquinas da produção" },
];

/** Soma o movimento por tratamento (para o resumo do plano). `uso`: categoria → total do período. */
export function resumoLucroReal(cats: { nome: string; grupo: string; tipo: string; ativo: boolean }[], uso: (nome: string, tipo: string) => number) {
  const r = { abate: 0, parcial: 0, naoAbate: 0, credito: 0, creditoTalvez: 0 };
  for (const c of cats) {
    if (!c.ativo || c.tipo !== "despesa") continue;
    const v = uso(c.nome, c.tipo); if (!v) continue;
    const t = tratamentoLucroReal(c.nome, c.grupo);
    if (t.deducao === "sim") r.abate += v; else if (t.deducao === "parcial") r.parcial += v; else if (t.deducao === "nao") r.naoAbate += v;
    if (t.credito === "sim") r.credito += v; else if (t.credito === "talvez") r.creditoTalvez += v;
  }
  return r;
}
