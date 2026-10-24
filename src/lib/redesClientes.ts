// Redes de clientes: lojas que compram da MF e vendem as máquinas para os licenciados delas (Açaí Super, Milk Shake
// Up, Milk Shake Mix…). Vêm dos marcadores do Tiny que começam com "F -" ("F - Açaí Super - Lucas"). As licenciadas
// das My Frost Sorveterias também contam como rede (marcador "F - MY SORV" ou a categoria "Licenciado My Frost").
// Cada família de rede tem uma cor fraquinha no fundo do cartão do cliente, para diferenciar de relance.

export type FamiliaRede = "milkshake" | "acai" | "myfrost" | "outra";
export type RedeCliente = { nome: string; familia: FamiliaRede; marcadorId: string | null };

/** "F - Açaí Super - Lucas" -> "Açaí Super - Lucas"; marcador que não é de rede -> null. */
export function nomeRede(marcador: string): string | null {
  const m = /^\s*F\s*-\s*(.+)$/i.exec(marcador ?? "");
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export function familiaRede(nome: string): FamiliaRede {
  if (/milk\s*shake/i.test(nome)) return "milkshake";
  if (/a[cç]a[ií]/i.test(nome)) return "acai";
  if (/my\s*(frost|sorv)/i.test(nome)) return "myfrost";
  return "outra";
}

/**
 * As redes do cliente: uma por marcador "F -", mais a das My Frost Sorveterias quando ele é licenciado.
 * A primeira da lista dá a cor do cartão (as de açaí e milk shake vêm antes das outras).
 */
export function redesDoCliente(marcadores: { id: string; nome: string }[], tags: string[] | null | undefined): RedeCliente[] {
  const redes: RedeCliente[] = [];
  for (const m of marcadores) {
    const nome = nomeRede(m.nome);
    if (nome) redes.push({ nome: familiaRede(nome) === "myfrost" ? "My Frost Sorveterias" : nome, familia: familiaRede(nome), marcadorId: m.id });
  }
  if ((tags ?? []).includes("licenciado_my_frost") && !redes.some((r) => r.familia === "myfrost")) {
    redes.push({ nome: "My Frost Sorveterias", familia: "myfrost", marcadorId: null });
  }
  const ordem: FamiliaRede[] = ["acai", "milkshake", "myfrost", "outra"];
  return redes.sort((a, b) => ordem.indexOf(a.familia) - ordem.indexOf(b.familia));
}

/** Cor de cada família (a mesma nos dois temas; o fundo do cartão mistura um pouco dela com a cor do cartão). */
export const COR_REDE: Record<FamiliaRede, string> = {
  milkshake: "#f59e0b",
  acai: "var(--kpi-roxo)",
  myfrost: "var(--kpi-rosa)",
  outra: "var(--kpi-ciano)",
};

/** Fundo fraquinho do cartão do cliente de rede. */
export const fundoRede = (f: FamiliaRede) => `color-mix(in srgb, ${COR_REDE[f]} 9%, rgb(var(--surface)))`;
