// Data de compra da máquina escrita no campo "Código" do contato no Tiny (ex.: 10/2020).
// Usado na importação pela API do Tiny (servidor) e na importação de planilha (tela): sem nada do Deno nem do navegador.

const valida = (ano: number, mes: number, dia: number) => {
  if (ano < 2010 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return "";
  const fim = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia > fim ? "" : `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
};

/**
 * "10/2020", "10/20", "10-2020", "10.2020" -> 2020-10-01; "29/09/2022" -> 2022-09-29;
 * "05/2021-11/2021" (duas máquinas) -> a mais recente. Qualquer outra coisa (código numérico, texto) -> "".
 */
export function dataDoCodigo(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const datas: string[] = [];
  const dia = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dia) return valida(+dia[3], +dia[2], +dia[1]);
  for (const parte of s.split(/\s*(?:-|a|e|,|;)\s*(?=\d{1,2}\s*[/.-]\s*\d)/i)) {
    const m = /^(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})$/.exec(parte.trim());
    if (!m) return "";
    const ano = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    const d = valida(ano, +m[1], 1);
    if (!d) return "";
    datas.push(d);
  }
  return datas.sort()[datas.length - 1] ?? "";
}

/** 2020-10-01 -> "10/2020"; com o dia (2022-09-29) -> "29/09/2022". */
export function mesAnoCompra(d: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  if (!m) return "";
  return m[3] === "01" ? `${m[2]}/${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
}
