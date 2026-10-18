// O mesmo lançamento do painel pessoal visto por dois caminhos (PDF, OFX, Meu Pluggy): mesma conta, dia, valor e as
// mesmas letras e números no texto. Usado na tela (importar extrato, anular cópias) e na função pessoal-pluggy.
// Funções puras, sem Deno.

export type LancChave = { conta_id: string; data: string; valor: number; descricao: string; identificador?: string | null; anulado?: boolean };

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** De onde veio o lançamento: PDF, Meu Pluggy, arquivo do banco (OFX/CSV) ou digitado (boleto e lançamento à mão). */
export const origemDo = (l: { identificador?: string | null }) => {
  const i = l.identificador ?? "";
  return !i ? "digitado" : i.startsWith("pdf:") ? "pdf" : i.startsWith("pluggy:") ? "pluggy" : i.startsWith("boleto-") ? "digitado" : "arquivo";
};

export const chaveDoLanc = (l: Pick<LancChave, "conta_id" | "data" | "valor" | "descricao">) =>
  `${l.conta_id}|${l.data}|${Number(l.valor).toFixed(2)}|${sem(l.descricao).replace(/[^a-z0-9]/g, "")}`;

/**
 * Na importação: separa as linhas novas que já estão no painel por outro caminho (cada linha que já existe tira uma
 * nova igual). A mesma linha do mesmo arquivo (mesmo identificador) fica para o banco ignorar.
 */
export function semRepetidos<T extends LancChave>(novas: T[], existentes: LancChave[]) {
  const ja = new Map<string, Map<string, number>>();
  for (const l of existentes) {
    if (l.anulado || origemDo(l) === "digitado") continue;
    const k = chaveDoLanc(l);
    const m = ja.get(k) ?? new Map<string, number>();
    m.set(origemDo(l), (m.get(origemDo(l)) ?? 0) + 1);
    ja.set(k, m);
  }
  const idsJa = new Set(existentes.map((l) => `${l.conta_id}|${l.identificador}`));
  const usados = new Map<string, number>();
  const ficam: T[] = [], fora: T[] = [];
  for (const n of novas) {
    const k = chaveDoLanc(n);
    if (!idsJa.has(`${n.conta_id}|${n.identificador}`)) {
      const outras = [...(ja.get(k) ?? new Map<string, number>())].filter(([o]) => o !== origemDo(n)).reduce((t, [, q]) => t + q, 0);
      const usado = usados.get(k) ?? 0;
      if (usado < outras) { usados.set(k, usado + 1); fora.push(n); continue; }
    }
    ficam.push(n);
  }
  return { ficam, fora };
}
