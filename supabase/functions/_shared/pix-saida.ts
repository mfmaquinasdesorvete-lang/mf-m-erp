// Pix de saída pelo Banco Inter (pagar uma conta a pagar): reconhece a chave Pix, monta o pedido e lê a resposta.
// Arquivo puro, usado pela função inter e pelas telas (testado em src/lib/__tests__/pixSaida.test.ts).

export const ESCOPO_PIX = "pagamento-pix.write pagamento-pix.read";
export type TipoChave = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
export const NOME_TIPO_CHAVE: Record<TipoChave, string> = { cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Celular", aleatoria: "Chave aleatória" };

const digitos = (v: string) => v.replace(/\D/g, "");

function cpfOk(c: string) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function cnpjOk(c: string) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/** Chave Pix limpa e o tipo (CPF, CNPJ, e-mail, celular com +55 ou aleatória). null = não é uma chave válida. */
export function lerChavePix(texto: string | null | undefined): { chave: string; tipo: TipoChave } | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { chave: t.toLowerCase(), tipo: "aleatoria" };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return { chave: t.toLowerCase(), tipo: "email" };
  const d = digitos(t);
  if (t.startsWith("+")) return d.length >= 12 && d.length <= 13 ? { chave: `+${d}`, tipo: "telefone" } : null;
  if (/[a-z]/i.test(t)) return null;
  if (d.length === 14 && cnpjOk(d)) return { chave: d, tipo: "cnpj" };
  if (d.length === 11 && cpfOk(d)) return { chave: d, tipo: "cpf" };
  // celular com DDD (11 dígitos começando pelo 9 depois do DDD e que não é CPF válido) ou já com 55
  if (d.length === 11 && d[2] === "9") return { chave: `+55${d}`, tipo: "telefone" };
  if (d.length === 13 && d.startsWith("55")) return { chave: `+${d}`, tipo: "telefone" };
  return null;
}

/** Acha a chave Pix escrita num texto livre (ex.: "Pix 123.456.789-09" na descrição da conta). */
export function chaveNoTexto(texto: string | null | undefined) {
  const t = String(texto ?? "");
  const m = t.match(/pix[:\s-]*([^\s·,;]+(?:\s?[^\s·,;]+)?)/i);
  return (m && lerChavePix(m[1].trim())) ?? lerChavePix(t.match(/[^\s@]+@[^\s@]+\.[a-z.]+/i)?.[0]) ?? null;
}

/** Corpo do Pix para o Inter (POST /banking/v2/pix). */
export const corpoPix = (p: { chave: string; valor: number; descricao: string }) => ({
  valor: p.valor.toFixed(2),
  descricao: p.descricao.replace(/[^\p{L}\p{N} .,\-/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 140),
  destinatario: { tipo: "CHAVE", chave: p.chave },
});

export type SituacaoPix = "pago" | "aguardando_aprovacao" | "agendado" | "falhou" | "enviando";

/** O que o Inter respondeu ao pedido: pago na hora, esperando aprovação no app do Inter ou agendado. */
export function situacaoDoEnvio(tipoRetorno: unknown): SituacaoPix {
  const t = String(tipoRetorno ?? "").toUpperCase();
  if (t === "PROCESSADO") return "pago";
  if (t === "APROVACAO") return "aguardando_aprovacao";
  if (t === "AGENDADO") return "agendado";
  return "enviando";
}

/** Situação lida na consulta do Pix (o Inter usa vários nomes): pago, falhou ou segue esperando. */
export function situacaoDaConsulta(resposta: unknown): SituacaoPix {
  const r = (resposta ?? {}) as Record<string, any>;
  const s = String(r.transacaoPix?.status ?? r.status ?? r.situacao ?? "").toUpperCase();
  if (/CANCEL|REPROV|NEGAD|ERRO|FALHA|EXPIR|DEVOLV|REJEIT/.test(s)) return "falhou";
  if (/EFETIVAD|CONCLU|REALIZAD|ENVIAD|PAGO|LIQUID|DEBITAD/.test(s)) return "pago";
  if (/AGEND/.test(s)) return "agendado";
  if (/APROVA|PENDENTE|AGUARD/.test(s)) return "aguardando_aprovacao";
  return "enviando";
}
