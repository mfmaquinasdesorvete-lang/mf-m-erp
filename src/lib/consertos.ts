// Máquinas que vieram para conserto, pelas notas do cliente: a NF-e de entrada que a MF emite ao receber a máquina
// (CFOP 1915/2915, ou natureza com "conserto") e a NF-e de retorno quando a máquina volta (CFOP 5916/6916).
// O retorno é ligado à entrada pela nota referenciada; sem ela, pelo primeiro retorno depois da entrada.

export type NotaConserto = {
  id: string; numero: string | null; status: string; ambiente?: string | null; tipo_operacao?: string | null; finalidade?: string | null;
  created_at: string; valor_total: number | string | null; chave?: string | null; chave_referenciada?: string | null;
  payload?: { items?: { cfop?: string | number | null; descricao?: string | null }[]; natureza_operacao?: string | null } | null;
};
export type Conserto = { entrada: NotaConserto | null; retorno: NotaConserto | null; dias: number | null; itens: string[] };

const cfops = (n: NotaConserto) => (n.payload?.items ?? []).map((i) => String(i.cfop ?? "").replace(/\D/g, ""));
const natureza = (n: NotaConserto) => (n.payload?.natureza_operacao ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const valida = (n: NotaConserto) => n.status === "autorizada" && n.ambiente !== "homologacao";

export const ehEntradaConserto = (n: NotaConserto) =>
  n.tipo_operacao === "entrada" && (cfops(n).some((c) => /^[12]915$/.test(c)) || (/conserto|reparo/.test(natureza(n)) && !/retorno/.test(natureza(n))));
export const ehRetornoConserto = (n: NotaConserto) =>
  (n.tipo_operacao ?? "saida") === "saida" && (cfops(n).some((c) => /^[56]916$/.test(c)) || /retorno.*(conserto|reparo)/.test(natureza(n)));

const dia = (s: string) => s.slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${dia(b)}T12:00:00Z`) - Date.parse(`${dia(a)}T12:00:00Z`)) / 86_400_000);

/** Pares entrada → retorno, do mais recente para o mais antigo; retorno sem entrada no ERP também aparece. */
export function consertosDasNotas(notas: NotaConserto[], hoje: string): Conserto[] {
  const ok = notas.filter(valida).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const entradas = ok.filter(ehEntradaConserto);
  const retornos = ok.filter(ehRetornoConserto);
  const usados = new Set<string>();
  const itensDe = (n: NotaConserto) => [...new Set((n.payload?.items ?? []).map((i) => (i.descricao ?? "").trim()).filter(Boolean))];
  const out: Conserto[] = entradas.map((e) => {
    const r = retornos.find((x) => !usados.has(x.id) && !!e.chave && x.chave_referenciada === e.chave)
      ?? retornos.find((x) => !usados.has(x.id) && !x.chave_referenciada && dia(x.created_at) >= dia(e.created_at));
    if (r) usados.add(r.id);
    return { entrada: e, retorno: r ?? null, dias: diasEntre(e.created_at, r ? r.created_at : hoje), itens: itensDe(e) };
  });
  for (const r of retornos) if (!usados.has(r.id)) out.push({ entrada: null, retorno: r, dias: null, itens: itensDe(r) });
  const quando = (c: Conserto) => (c.entrada ?? c.retorno)!.created_at;
  return out.sort((a, b) => quando(b).localeCompare(quando(a)));
}
