// Gasto rápido pelo celular: a pessoa fala ("gastei 80 reais de gasolina ontem") ou digita, e o ERP tira daí
// o valor, a data e a categoria. Tudo é sugestão: a tela mostra os campos preenchidos para conferir antes de gravar.

export type GastoInterpretado = { valor: number | null; data: string; categoria: string | null; descricao: string };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// palavra → categoria do plano de contas (nomes iguais aos de categorias_financeiras)
const PALAVRAS: [RegExp, string][] = [
  [/\b(gasolina|etanol|alcool|diesel|combustivel|abasteci\w*|posto)\b/, "combustível"],
  [/\b(pedagio|estacionamento|uber|taxi|onibus|passagem|oficina|pneu|borracharia|lavacao|lava jato)\b/, "veículos e pedágio"],
  [/\b(almoco|almocei|janta[rr]?|lanche|cafe|restaurante|marmita|padaria|mercado|agua mineral|refeicao)\b/, "alimentação e copa"],
  [/\b(correio|correios|sedex|pac)\b/, "correios"],
  [/\b(frete|transportadora|motoboy|entrega)\b/, "frete"],
  [/\b(parafuso|ferramenta|material|limpeza|papelaria|fita|cola|lixa|tinta|escritorio)\b/, "material de consumo"],
  [/\b(conserto|manutencao|reparo|eletricista|encanador)\b/, "manutenção"],
  [/\b(energia|luz|agua|internet|telefone|celular)\b/, "energia/água/internet"],
  [/\b(anuncio|propaganda|marketing|impulsionamento|panfleto)\b/, "marketing"],
  [/\b(assinatura|sistema|software|aplicativo)\b/, "sistemas e assinaturas"],
  [/\b(tarifa|taxa bancaria)\b/, "tarifas bancárias"],
];

/** Categoria pelo texto (ou null quando nenhuma palavra bate). */
export function categoriaDoGasto(texto: string): string | null {
  const t = semAcento(texto);
  for (const [re, cat] of PALAVRAS) if (re.test(t)) return cat;
  return null;
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};

/** Valor em reais: "R$ 1.234,50", "80 reais", "80,90", "oitenta reais" ou "cento e vinte". */
export function valorDoTexto(texto: string): number | null {
  const t = semAcento(texto);
  // número escrito com algarismos (o maior que aparecer junto de "r$"/"reais", senão o primeiro)
  const comMoeda = t.match(/r\$\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*(?:reais|real|conto|pila)/);
  const solto = t.match(/(?<![\d/])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?![\d/])/);
  const bruto = comMoeda?.[1] ?? comMoeda?.[2] ?? solto?.[1];
  if (bruto) {
    const n = Number(bruto.replace(/\./g, "").replace(",", "."));
    // 10 milhões ou mais é telefone, documento ou código lido como valor: não sugere nada
    return Number.isFinite(n) && n > 0 && n < 1e7 ? n : null;
  }
  // por extenso: soma as palavras de número ("cento e vinte e cinco" = 125; "dois mil" = 2000)
  let total = 0, parcial = 0, achou = false;
  for (const p of t.split(/[^a-z]+/)) {
    const v = NUMEROS[p];
    if (v === undefined) continue;
    achou = true;
    if (v === 1000) { parcial = (parcial || 1) * 1000; total += parcial; parcial = 0; }
    else parcial += v;
  }
  total += parcial;
  return achou && total > 0 ? total : null;
}

/** Data do gasto: "hoje", "ontem", "anteontem" ou "dia 12" (do mês corrente); sem nada, hoje. */
export function dataDoTexto(texto: string, hoje: string): string {
  const t = semAcento(texto);
  const d = new Date(`${hoje}T12:00:00`);
  const menos = (n: number) => { const x = new Date(d); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  if (/\banteontem\b/.test(t)) return menos(2);
  if (/\bontem\b/.test(t)) return menos(1);
  const dia = t.match(/\bdia\s+(\d{1,2})\b/);
  if (dia) {
    const n = Number(dia[1]);
    if (n >= 1 && n <= 31) {
      const x = new Date(d); x.setDate(n);
      if (x > d) x.setMonth(x.getMonth() - 1); // "dia 28" falado no dia 3 é do mês passado
      return x.toISOString().slice(0, 10);
    }
  }
  return hoje;
}

/** Junta tudo: valor, data, categoria e uma descrição limpa (o texto falado, com a primeira letra maiúscula). */
export function interpretarGasto(texto: string, hoje: string): GastoInterpretado {
  const limpo = texto.trim().replace(/\s+/g, " ");
  return {
    valor: valorDoTexto(limpo),
    data: dataDoTexto(limpo, hoje),
    categoria: categoriaDoGasto(limpo),
    descricao: limpo ? limpo[0].toUpperCase() + limpo.slice(1) : "",
  };
}

/** Chave de acesso de NFC-e/NF-e lida no QR Code do cupom (44 dígitos), se houver. */
export function chaveDoQrCode(conteudo: string): string | null {
  const m = conteudo.replace(/\s/g, "").match(/(?:p=|chNFe=)?(\d{44})/);
  return m ? m[1] : null;
}
