// Equipamentos de medição (REG-005): quando vence a calibração de cada instrumento e em que situação ele está.
// O banco calcula a próxima data igual (última calibração + frequência); aqui serve à tela e aos testes.

export type Instrumento = {
  id: string; codigo: string; instrumento: string; marca: string | null; setor: string | null; frequencia_meses: number;
  certificado: string | null; calibrado_em: string | null; proxima_em: string | null; laboratorio: string | null;
  observacoes: string | null; ativo: boolean;
};
export type SituacaoCalibracao = "vencida" | "perto" | "ok" | "sem_data";

export const AVISO_DIAS = 45;
export const FREQUENCIAS = [{ meses: 6, rotulo: "Semestral" }, { meses: 12, rotulo: "Anual" }, { meses: 24, rotulo: "Bianual" }, { meses: 36, rotulo: "A cada 3 anos" }];
export const rotuloFrequencia = (meses: number) => FREQUENCIAS.find((f) => f.meses === meses)?.rotulo ?? `A cada ${meses} meses`;

/** Última calibração + frequência, em yyyy-mm-dd (fim de mês sem o dia: último dia do mês, como no banco). */
export function proximaCalibracao(calibradoEm: string, meses: number) {
  const [a, m, d] = calibradoEm.slice(0, 10).split("-").map(Number);
  const total = m - 1 + meses;
  const ano = a + Math.floor(total / 12), mes = total % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** Dias até a próxima calibração (negativo = vencida). */
export function diasParaCalibrar(i: Pick<Instrumento, "proxima_em">, hoje: string) {
  if (!i.proxima_em) return null;
  return Math.round((Date.parse(i.proxima_em.slice(0, 10)) - Date.parse(hoje.slice(0, 10))) / 86_400_000);
}

export function situacaoCalibracao(i: Pick<Instrumento, "proxima_em">, hoje: string): SituacaoCalibracao {
  const d = diasParaCalibrar(i, hoje);
  if (d == null) return "sem_data";
  return d < 0 ? "vencida" : d <= AVISO_DIAS ? "perto" : "ok";
}

/** Vencidas primeiro, depois pela data mais próxima; sem data no fim. */
export function ordenarInstrumentos<T extends Pick<Instrumento, "proxima_em" | "codigo">>(l: T[]) {
  return [...l].sort((a, b) => (a.proxima_em ?? "9999").localeCompare(b.proxima_em ?? "9999") || a.codigo.localeCompare(b.codigo));
}
