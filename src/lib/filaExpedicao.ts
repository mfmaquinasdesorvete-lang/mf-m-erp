// Fila da expedição (separar → conferir → embalar → despachar): em que etapa está cada pedido, desde quando e o que
// ainda falta. Usada pelo painel de separação (ERP) e pelo app da expedição no celular.
import { pl } from "@/lib/format";
import type { Exp, PedidoFluxo as P } from "@/lib/fluxo";

export type EtapaFila = "separar" | "conferir" | "embalar" | "despachar";
/** Status da expedição que cada etapa da fila mostra. */
export const STATUS_DA_ETAPA: Record<EtapaFila, string> = { separar: "separar", conferir: "separando", embalar: "conferido", despachar: "embalado" };

export type LinhaFila = { p: P; e: Exp; desde: string; horas: number; nota: P["notas"][number] | undefined; processando: boolean };

/** Desde quando o pedido está na etapa atual. */
export function desdeDe(e: Pick<Exp, "status" | "separando_em" | "conferido_em" | "embalado_em" | "created_at">, p: { aprovado_em?: string | null }) {
  if (e.status === "separando") return e.separando_em ?? e.created_at;
  if (e.status === "conferido") return e.conferido_em ?? e.created_at;
  if (e.status === "embalado") return e.embalado_em ?? e.created_at;
  return p.aprovado_em ?? e.created_at;
}
export const tempo = (horas: number) => (horas < 1 ? "agora há pouco" : horas < 24 ? `há ${Math.floor(horas)} h` : `há ${Math.floor(horas / 24)} ${pl(Math.floor(horas / 24), "dia", "dias")}`);

/** Linhas da fila por etapa, da mais antiga para a mais nova (NF-e de teste não conta como nota para despachar). */
export function filaPorEtapa(pedidos: P[], exps: Exp[], agora = Date.now()) {
  const porPedido = new Map(pedidos.map((p) => [p.id, p]));
  const status = new Set(Object.values(STATUS_DA_ETAPA));
  const linhas: LinhaFila[] = [];
  for (const e of exps) {
    const p = porPedido.get(e.pedido_id);
    if (!p || !status.has(e.status)) continue;
    const desde = desdeDe(e, p);
    const nota = p.notas?.find((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
    linhas.push({ p, e, desde, horas: (agora - Date.parse(desde)) / 36e5, nota, processando: !!p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) });
  }
  linhas.sort((a, b) => a.desde.localeCompare(b.desde));
  const porEtapa = Object.fromEntries((Object.keys(STATUS_DA_ETAPA) as EtapaFila[]).map((k) => [k, linhas.filter((l) => l.e.status === STATUS_DA_ETAPA[k])])) as Record<EtapaFila, LinhaFila[]>;
  return { porEtapa, linhas };
}
