// Etiquetas de envio/volume: monta a partir do pedido (e da expedição) e manda direto para a impressora.
import { useState } from "react";
import { useConfig } from "./useConfig";
import { useUnidade } from "./unidade";
import { useRows } from "./data";
import { notify, notifyError } from "./notify";
import { pdfEtiquetasEnvio, type EnvioEtiqueta } from "./pdf";
import { imprimirPdf } from "./imprimir";
import type { Cliente, Transportadora } from "./types";

type PedidoEtiqueta = {
  numero: number; unidade_id?: string | null; cliente?: Cliente; volumes?: number | null; peso_total_kg?: number | null;
  transportadora_id?: string | null; codigo_rastreio?: string | null;
  notas?: { status: string; numero: string | null; serie?: string | null; chave?: string | null }[];
};
type ExpEtiqueta = { volumes: number | null; peso_kg: number | null; transportadora_id: string | null; codigo_rastreio: string | null };

/** Imprime as etiquetas de envio/volume de vários pedidos de uma vez (um clique). */
export function useEtiquetas() {
  const { data: cfg } = useConfig();
  const { unidades } = useUnidade();
  const { data: transp = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const [ocupado, setOcupado] = useState(false);
  async function imprimir(lista: { p: PedidoEtiqueta; e?: ExpEtiqueta; volumes?: number; transportadora_id?: string | null; rastreio?: string | null }[]) {
    if (!cfg || !lista.length) return;
    setOcupado(true);
    try {
      const envios: EnvioEtiqueta[] = lista.map(({ p, e, volumes, transportadora_id, rastreio }) => {
        const u = unidades.find((x) => x.id === p.unidade_id) ?? unidades.find((x) => x.matriz);
        const nota = p.notas?.find((n) => n.status === "autorizada");
        const tid = transportadora_id ?? e?.transportadora_id ?? p.transportadora_id;
        return {
          numero: p.numero, cliente: p.cliente!, volumes: volumes ?? e?.volumes ?? p.volumes ?? 1, peso: e?.peso_kg ?? p.peso_total_kg,
          nota: nota ? { numero: nota.numero, serie: nota.serie ?? null, chave: nota.chave ?? null } : null,
          transportadora: transp.find((t) => t.id === tid)?.nome ?? null, rastreio: rastreio ?? e?.codigo_rastreio ?? p.codigo_rastreio ?? null,
          remetente: u ? { nome: u.razao_social ?? u.nome, logradouro: u.logradouro, numero: u.numero, bairro: u.bairro, municipio: u.municipio, uf: u.uf, cep: u.cep, cnpj: u.cnpj } : null,
        };
      });
      imprimirPdf(await pdfEtiquetasEnvio(envios, cfg, cfg.etiqueta_formato ?? "10x15"));
      const total = envios.reduce((s, x) => s + Math.max(1, Number(x.volumes) || 1), 0);
      notify(`${total} etiqueta(s) enviada(s) para a impressora`);
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }
  return { imprimir, ocupado };
}
