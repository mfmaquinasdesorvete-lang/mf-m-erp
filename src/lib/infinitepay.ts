// Taxas da InfinitePay (pagas pela MF) cadastradas por unidade: Pix, débito e crédito de 1x a 12x, em %.
// Mesma regra do banco (taxa_infinitepay): sem número cadastrado = taxa desconhecida (null).
export type TaxasInfinitePay = { pix?: number | null; debito?: number | null; credito?: (number | null)[] };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace("%", "").replace(",", ".");
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

/** Taxa (%) para o meio e as parcelas; null = não cadastrada. */
export function taxaDe(t: TaxasInfinitePay | null | undefined, metodo: string | null | undefined, parcelas?: number | null): number | null {
  if (!t) return null;
  const m = (metodo ?? "").toLowerCase();
  if (m === "pix") return num(t.pix);
  if (m.includes("debit")) return num(t.debito);
  const n = Math.max(1, Math.min(12, parcelas || 1));
  return num(t.credito?.[n - 1]);
}

/** O que foi digitado na tela (com vírgula, vazio…) no formato gravado no banco. */
export function normalizarTaxas(t: Record<string, unknown> | null | undefined): TaxasInfinitePay {
  const out: TaxasInfinitePay = {};
  const pix = num(t?.pix), debito = num(t?.debito);
  if (pix !== null) out.pix = pix;
  if (debito !== null) out.debito = debito;
  const cred = Array.from({ length: 12 }, (_, i) => num((t?.credito as unknown[] | undefined)?.[i]));
  if (cred.some((c) => c !== null)) out.credito = cred;
  return out;
}

/** "Pix 0% · crédito à vista 4,2% · 12x 16,66%" (o que estiver cadastrado). */
export function resumoTaxas(t: TaxasInfinitePay | null | undefined) {
  const f = (v: number | null) => (v === null ? null : `${String(v).replace(".", ",")}%`);
  return [
    f(taxaDe(t, "pix")) && `Pix ${f(taxaDe(t, "pix"))}`,
    f(taxaDe(t, "credit_card", 1)) && `crédito à vista ${f(taxaDe(t, "credit_card", 1))}`,
    f(taxaDe(t, "credit_card", 12)) && `12x ${f(taxaDe(t, "credit_card", 12))}`,
  ].filter(Boolean).join(" · ");
}
