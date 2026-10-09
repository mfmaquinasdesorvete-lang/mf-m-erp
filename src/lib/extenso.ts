// Valor e data por extenso, em português (recibos).

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze",
  "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const ESCALAS: [string, string][] = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];

/** 0 a 999 por extenso ("cento e vinte e três"). */
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) partes.push(r < 20 ? UNIDADES[r] : [DEZENAS[Math.floor(r / 10)], UNIDADES[r % 10]].filter(Boolean).join(" e "));
  return partes.join(" e ");
}

/** Número inteiro por extenso ("mil e quinhentos", "dois milhões e trezentos mil"). */
export function inteiroPorExtenso(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const grupos: number[] = [];
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const [sing, plural] = ESCALAS[i];
    // "mil" e não "um mil"
    const texto = i === 1 && g === 1 ? "mil" : [ate999(g), i ? (g === 1 ? sing : plural) : ""].filter(Boolean).join(" ");
    partes.push({ texto, valor: g });
  }
  // o "e" entra antes do último grupo quando ele é menor que cem ou é centena redonda ("mil e quinhentos", "mil e cem")
  return partes.reduce((s, p, k) => {
    if (!k) return p.texto;
    const usaE = k === partes.length - 1 && (p.valor < 100 || p.valor % 100 === 0);
    return `${s}${usaE ? " e " : " "}${p.texto}`;
  }, "");
}

/** R$ por extenso: "mil e quinhentos reais", "um real e cinco centavos", "dois milhões de reais". */
export function valorPorExtenso(valor: number): string {
  const centavosTotal = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotal / 100), centavos = centavosTotal % 100;
  const partes: string[] = [];
  if (reais) {
    const txt = inteiroPorExtenso(reais);
    // "de reais" depois de milhão/bilhão redondo
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${txt}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "31 de outubro de 2026" (data no formato AAAA-MM-DD). */
export function dataPorExtenso(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d === 1 ? "1º" : d} de ${MESES[m - 1]} de ${a}`;
}
