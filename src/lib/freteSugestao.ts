// Cotação rápida no pedido: das transportadoras ativas, as poucas que fazem sentido para o destino do cliente —
// as que atendem a UF/cidade (abrangência ou regiões no cadastro), depois as com WhatsApp, depois as já usadas.
import type { Transportadora } from "./types";

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A transportadora atende o destino? true / false / null (cadastro sem regiões: não dá para saber) */
export function atendeDestino(t: Pick<Transportadora, "regioes" | "abrangencia">, uf?: string | null, cidade?: string | null): boolean | null {
  const texto = sem([t.regioes ?? "", ...(t.abrangencia ?? [])].join(" "));
  if (!texto.trim()) return null;
  if (/\b(brasil|todo o pais|nacional|todos os estados)\b/.test(texto)) return true;
  const u = sem(uf ?? "").trim();
  if (u && new RegExp(`\\b${u}\\b`).test(texto)) return true;
  const c = sem(cidade ?? "").trim();
  if (c && texto.includes(c)) return true;
  return u || c ? false : null;
}

/** As transportadoras sugeridas para o destino (até `limite`), da mais indicada para a menos */
export function sugerirTransportadoras(ativas: Transportadora[], uf?: string | null, cidade?: string | null, usadas: string[] = [], limite = 4) {
  const nota = (t: Transportadora) => {
    const a = atendeDestino(t, uf, cidade);
    return (a === true ? 4 : a === null ? 1 : -5) + (t.whatsapp || t.telefone ? 2 : 0) + (usadas.includes(t.id) ? 2 : 0);
  };
  return [...ativas].map((t) => ({ t, n: nota(t) })).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.t.nome.localeCompare(b.t.nome)).slice(0, limite).map((x) => x.t);
}
