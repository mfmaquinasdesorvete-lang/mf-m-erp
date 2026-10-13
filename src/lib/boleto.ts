// Boleto: lê a linha digitável ou o código de barras (bancário ou de arrecadação/concessionária), confere os
// dígitos verificadores e tira banco, valor e vencimento; calcula multa e juros de atraso. Funções puras.
import { digitos } from "./format";

export type Boleto = {
  tipo: "bancario" | "arrecadacao";
  /** linha digitável só com números (47 bancário, 48 arrecadação) */
  linha: string;
  /** código de barras (44 números) */
  barras: string;
  banco: string | null; bancoNome: string | null;
  /** null = boleto sem valor impresso (o valor é informado na hora de pagar) */
  valor: number | null;
  /** null = sem vencimento no código (arrecadação ou fator 0000) */
  vencimento: string | null;
  /** todos os dígitos verificadores conferem */
  valido: boolean;
  erros: string[];
};

const BANCOS: Record<string, string> = {
  "001": "Banco do Brasil", "004": "Banco do Nordeste", "021": "Banestes", "033": "Santander", "037": "Banpará", "041": "Banrisul",
  "047": "Banese", "070": "BRB", "077": "Inter", "085": "Ailos", "097": "Credisis", "104": "Caixa", "133": "Cresol", "136": "Unicred",
  "197": "Stone", "208": "BTG Pactual", "212": "Banco Original", "237": "Bradesco", "260": "Nubank", "274": "Grafeno", "290": "PagBank",
  "323": "Mercado Pago", "336": "C6 Bank", "341": "Itaú", "380": "PicPay", "389": "Mercantil", "403": "Cora", "422": "Safra",
  "461": "Asaas", "536": "Neon", "633": "Rendimento", "634": "Triângulo", "655": "Votorantim", "707": "Daycoval", "745": "Citibank",
  "746": "Modal", "748": "Sicredi", "756": "Sicoob",
};
export const nomeBanco = (codigo: string | null | undefined) => (codigo ? BANCOS[codigo] ?? `Banco ${codigo}` : null);

const SEGMENTO: Record<string, string> = {
  "1": "Prefeitura", "2": "Saneamento", "3": "Energia elétrica e gás", "4": "Telecomunicações", "5": "Órgão do governo", "6": "Carnê/convênio", "7": "Multa de trânsito", "9": "Uso exclusivo do banco",
};

/** Módulo 10 (campos da linha digitável e arrecadação com identificador 6 ou 7). */
export function mod10(num: string): number {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    const p = Number(num[i]) * peso;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/** Soma do módulo 11 com pesos 2 a 9 da direita para a esquerda. */
const soma11 = (num: string) => {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) { soma += Number(num[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  return soma;
};
/** DV geral do código de barras bancário (posição 5): 0, 10 e 11 viram 1. */
export const dvBancario = (barrasSemDv: string) => { const dv = 11 - (soma11(barrasSemDv) % 11); return dv === 0 || dv > 9 ? 1 : dv; };
/** Módulo 11 da arrecadação: resto 0 ou 1 vira 0. */
export const mod11Arrecadacao = (num: string) => { const r = soma11(num) % 11; return r === 0 || r === 1 ? 0 : 11 - r; };

const BASE_FATOR = Date.UTC(1997, 9, 7);
const DIA = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Vencimento pelo fator (4 números). O fator chegou a 9999 em 21/02/2025 e recomeçou em 1000 no dia 22/02/2025 (ciclos de 9000
 * dias): fica a data do ciclo mais perto de hoje. Fator 0000 = sem vencimento.
 */
export function vencimentoDoFator(fator: string | number, hoje = new Date()): string | null {
  const f = Number(fator);
  if (!f || f < 1000) return null;
  const ref = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let melhor = BASE_FATOR + f * DIA;
  for (let k = 1; k <= 3; k++) {
    const d = BASE_FATOR + (f + 9000 * k) * DIA;
    if (Math.abs(d - ref) < Math.abs(melhor - ref)) melhor = d;
  }
  return iso(melhor);
}

/** Linha digitável bancária (47) → código de barras (44). */
export const barrasDaLinha = (l: string) => l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);

/** Código de barras bancário (44) → linha digitável (47). */
export function linhaDasBarras(b: string): string {
  const c1 = b.slice(0, 4) + b.slice(19, 24), c2 = b.slice(24, 34), c3 = b.slice(34, 44);
  return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${b[4]}${b.slice(5, 19)}`;
}

/** Linha de arrecadação (48) ↔ código de barras (44): 4 blocos de 11 números, cada um com o seu DV. */
const barrasDaArrecadacao = (l: string) => [0, 12, 24, 36].map((i) => l.slice(i, i + 11)).join("");
function linhaDaArrecadacao(b: string): string {
  const dv = b[2] === "6" || b[2] === "7" ? mod10 : mod11Arrecadacao;
  return [0, 11, 22, 33].map((i) => { const bl = b.slice(i, i + 11); return bl + dv(bl); }).join("");
}

/** Fator de vencimento de uma data (ciclo atual, a partir de 22/02/2025 = 1000). */
export const fatorDaData = (data: string) => {
  const dias = Math.round((Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10))) - BASE_FATOR) / DIA);
  return ((dias - 1000) % 9000 + 9000) % 9000 + 1000;
};

/** Monta uma linha digitável bancária válida (para a prévia e para testes). `livre` = 25 números do banco. */
export function gerarLinhaBancaria(banco: string, vencimento: string, valor: number, livre: string): string {
  const semDv = banco + "9" + String(fatorDaData(vencimento)).padStart(4, "0") + String(Math.round(valor * 100)).padStart(10, "0") + livre.padEnd(25, "0").slice(0, 25);
  return linhaDasBarras(semDv.slice(0, 4) + dvBancario(semDv) + semDv.slice(4));
}

/** Linha digitável formatada como no papel. */
export function formatarLinha(linha: string): string {
  const l = digitos(linha);
  if (l.length === 47) return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
  if (l.length === 48) return [0, 12, 24, 36].map((i) => `${l.slice(i, i + 11)}-${l[i + 11]}`).join(" ");
  return l;
}

/**
 * Lê o que foi digitado, colado ou bipado (com ou sem pontos e espaços). Devolve null se não tiver 44, 47 ou 48 números.
 * `valido` = false quando algum dígito verificador não confere (número digitado errado).
 */
export function lerBoleto(texto: string, hoje = new Date()): Boleto | null {
  const n = digitos(texto);
  const erros: string[] = [];
  // arrecadação (contas de consumo, tributos): começa com 8
  if ((n.length === 48 || n.length === 44) && n[0] === "8") {
    const barras = n.length === 48 ? barrasDaArrecadacao(n) : n;
    const linha = n.length === 48 ? n : linhaDaArrecadacao(n);
    const id = barras[2];
    const dv = id === "6" || id === "7" ? mod10 : id === "8" || id === "9" ? mod11Arrecadacao : null;
    if (!dv) erros.push("Identificador de valor inválido (3º número)");
    else {
      if (n.length === 48) [0, 12, 24, 36].forEach((i, k) => { if (dv(n.slice(i, i + 11)) !== Number(n[i + 11])) erros.push(`Dígito do bloco ${k + 1} não confere`); });
      if (dv(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) erros.push("Dígito verificador geral não confere");
    }
    const valorReal = id === "6" || id === "8";
    const v = Number(barras.slice(4, 15)) / 100;
    return {
      tipo: "arrecadacao", linha, barras, banco: null, bancoNome: SEGMENTO[barras[1]] ?? "Arrecadação",
      valor: valorReal && v > 0 ? v : null, vencimento: null, valido: !erros.length, erros,
    };
  }
  if (n.length !== 47 && n.length !== 44) return null;
  const barras = n.length === 47 ? barrasDaLinha(n) : n;
  const linha = n.length === 47 ? n : linhaDasBarras(n);
  if (n.length === 47) {
    const campos: [string, string, string][] = [["1º campo", n.slice(0, 9), n[9]], ["2º campo", n.slice(10, 20), n[20]], ["3º campo", n.slice(21, 31), n[31]]];
    for (const [nome, c, d] of campos) if (mod10(c) !== Number(d)) erros.push(`Dígito do ${nome} não confere`);
  }
  if (dvBancario(barras.slice(0, 4) + barras.slice(5)) !== Number(barras[4])) erros.push("Dígito verificador geral não confere");
  if (barras[3] !== "9") erros.push("Moeda diferente de real");
  const banco = barras.slice(0, 3);
  const v = Number(barras.slice(9, 19)) / 100;
  return {
    tipo: "bancario", linha, barras, banco, bancoNome: nomeBanco(banco),
    valor: v > 0 ? v : null, vencimento: vencimentoDoFator(barras.slice(5, 9), hoje), valido: !erros.length, erros,
  };
}

export type Encargos = {
  /** dias de atraso contados do vencimento (0 = em dia) */
  dias: number; multa: number; juros: number; total: number;
  /** venceu em fim de semana e foi pago no 1º dia útil: sem encargos */
  prorrogado: boolean;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const diaUTC = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/**
 * Multa e juros de atraso (padrão: multa de 2% e juros de 1% ao mês, pro rata por dia; o boleto pode trazer outros,
 * e juros em R$ por dia substituem o percentual). Vencimento no sábado ou domingo pode ser pago na segunda sem encargos
 * (feriados não entram na conta: confira no boleto).
 */
export function calcularEncargos(valor: number, vencimento: string, pagamento: string,
  { multaPct = 2, jurosMesPct = 1, jurosDia }: { multaPct?: number; jurosMesPct?: number; jurosDia?: number | null } = {}): Encargos {
  const venc = diaUTC(vencimento), pag = diaUTC(pagamento);
  let util = venc;
  while ([0, 6].includes(new Date(util).getUTCDay())) util += DIA;
  if (pag <= util) return { dias: 0, multa: 0, juros: 0, total: r2(valor), prorrogado: pag > venc };
  const dias = Math.round((pag - venc) / DIA);
  const multa = r2(valor * (multaPct || 0) / 100);
  const juros = r2(jurosDia != null && jurosDia > 0 ? jurosDia * dias : valor * (jurosMesPct || 0) / 100 / 30 * dias);
  return { dias, multa, juros, total: r2(valor + multa + juros), prorrogado: false };
}
