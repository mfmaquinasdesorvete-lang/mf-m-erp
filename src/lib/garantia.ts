import { dataBR, hoje, somarDias } from "./format";

export type SituacaoGarantia = "em_garantia" | "vence_logo" | "fora_garantia";

/** Em garantia, vencendo nos próximos 30 dias, ou fora da garantia. */
export function situacaoGarantia(garantiaAte: string | null | undefined): SituacaoGarantia {
  if (!garantiaAte || garantiaAte < hoje()) return "fora_garantia";
  return garantiaAte <= somarDias(30) ? "vence_logo" : "em_garantia";
}

export type SituacaoPreventiva = "atrasada" | "proxima" | "em_dia" | "sem_data";

/** Preventiva atrasada, nos próximos 30 dias, ou em dia. */
export function situacaoPreventiva(data: string | null | undefined): SituacaoPreventiva {
  if (!data) return "sem_data";
  if (data < hoje()) return "atrasada";
  return data <= somarDias(30) ? "proxima" : "em_dia";
}

export const diasAte = (data: string) =>
  Math.round((new Date(data + "T12:00:00").getTime() - new Date(hoje() + "T12:00:00").getTime()) / 864e5);

/** "vendida em 10/05/2023" ou, para a base da My Frost (empresa anterior), "vendida pela My Frost em …". */
export function textoVenda(e: { data_venda: string | null; origem?: string | null }) {
  if (e.origem) return `vendida pela ${e.origem}${e.data_venda ? ` em ${dataBR(e.data_venda)}` : " (data não informada)"}`;
  return `vendida em ${dataBR(e.data_venda)}`;
}
