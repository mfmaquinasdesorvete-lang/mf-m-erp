// Cotar frete rápido: o que já cobramos de frete para o mesmo destino (mesma cidade; se não houver, mesmo estado),
// para o pedido sugerir o valor na hora, sem esperar a transportadora responder.
export type FretePassado = { frete: number; transportadora_id: string | null; data: string; cliente_id: string | null; uf: string | null; municipio: string | null };
export type RefFrete = {
  onde: "cliente" | "cidade" | "uf"; rotulo: string; quantas: number; mediana: number; menor: number; maior: number;
  ultimo: FretePassado; porTransportadora: { transportadora_id: string; quantas: number; ultimo: number }[];
};

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const r2 = (v: number) => Math.round(v * 100) / 100;
function mediana(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Referências do mais parecido para o mais geral: o próprio cliente, a mesma cidade e o mesmo estado (só as que têm frete). */
export function referenciasFrete(hist: FretePassado[], destino: { cliente_id?: string | null; uf?: string | null; municipio?: string | null }): RefFrete[] {
  const validos = hist.filter((h) => Number(h.frete) > 0).sort((a, b) => b.data.localeCompare(a.data));
  const uf = sem(destino.uf), cid = sem(destino.municipio);
  const grupos: [RefFrete["onde"], string, FretePassado[]][] = [
    ["cliente", "Este cliente", destino.cliente_id ? validos.filter((h) => h.cliente_id === destino.cliente_id) : []],
    ["cidade", `${destino.municipio ?? ""}/${(destino.uf ?? "").toUpperCase()}`, cid && uf ? validos.filter((h) => sem(h.municipio) === cid && sem(h.uf) === uf) : []],
    ["uf", `Estado ${(destino.uf ?? "").toUpperCase()}`, uf ? validos.filter((h) => sem(h.uf) === uf) : []],
  ];
  const out: RefFrete[] = [];
  let anterior = -1;
  for (const [onde, rotulo, lista] of grupos) {
    if (!lista.length || lista.length === anterior) continue; // cidade igual ao estado inteiro: não repete
    anterior = lista.length;
    const valores = lista.map((h) => Number(h.frete));
    const porT = new Map<string, { quantas: number; ultimo: number }>();
    for (const h of lista) if (h.transportadora_id) {
      const x = porT.get(h.transportadora_id);
      porT.set(h.transportadora_id, x ? { ...x, quantas: x.quantas + 1 } : { quantas: 1, ultimo: Number(h.frete) });
    }
    out.push({
      onde, rotulo, quantas: lista.length, mediana: r2(mediana(valores)), menor: Math.min(...valores), maior: Math.max(...valores), ultimo: lista[0],
      porTransportadora: [...porT].map(([transportadora_id, v]) => ({ transportadora_id, ...v })).sort((a, b) => b.quantas - a.quantas),
    });
  }
  return out;
}
