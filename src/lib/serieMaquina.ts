// Identificação das máquinas MF. Nº de série = nº de bicos (2 dígitos) + mês/ano da NF (MMAA) + os 3 últimos números da NF.
// Ex.: Top 300 (3 bicos), NF 72315 de outubro/2023 → 03 10 23 315 → "031023315".

/** Quantos bicos tem o modelo, pela descrição ("3 bicos", "3 sabores", "Top 300", "MF-150"); null se não der para saber */
export function bicosDoModelo(descricao: string | null | undefined): number | null {
  const d = (descricao ?? "").toLowerCase();
  const m = d.match(/(\d)\s*(bicos?|sabores?|torneiras?)/);
  if (m) return Number(m[1]);
  const modelo = d.match(/(?:top|mf|slim|prime|soft)[\s-]*([1-9])00\b/) ?? d.match(/\b([1-9])00\b/);
  if (modelo) return Number(modelo[1]);
  const mf150 = d.match(/(?:mf|top)[\s-]*([1-9])50\b/);
  return mf150 ? Number(mf150[1]) : null;
}

/** Nº de série pela regra da MF; null se faltar bicos, data ou nº da NF */
export function serieMF(bicos: number | null | undefined, dataNF: string | null | undefined, numeroNF: string | number | null | undefined): string | null {
  const n = String(numeroNF ?? "").replace(/\D/g, "");
  if (!bicos || !dataNF || n.length < 1) return null;
  const mes = dataNF.slice(5, 7), ano = dataNF.slice(2, 4);
  if (!/^\d{2}$/.test(mes) || !/^\d{2}$/.test(ano)) return null;
  return `${String(bicos).padStart(2, "0")}${mes}${ano}${n.slice(-3).padStart(3, "0")}`;
}

/** Preventiva de 6 em 6 meses a partir da compra (NF ou proposta): a próxima data que ainda não passou de 30 dias */
export function proximaPreventiva6m(base: string | null | undefined, hoje: string, meses = 6): string | null {
  if (!base) return null;
  const [a, m, d] = base.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  for (let k = 1; k < 200; k++) {
    const dt = new Date(Date.UTC(a, m - 1 + k * meses, Math.min(d, 28)));
    const iso = dt.toISOString().slice(0, 10);
    // passou há menos de 30 dias ainda conta como "a fazer agora"
    const limite = new Date(`${hoje}T12:00:00Z`); limite.setUTCDate(limite.getUTCDate() - 30);
    if (iso >= limite.toISOString().slice(0, 10)) return iso;
  }
  return null;
}
