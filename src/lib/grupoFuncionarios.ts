// Cartões de abertura de Funcionários (24/10): cada cartão é um recorte da lista e tocar nele filtra.
// "Sem carteira" = autônomo na ativa; "Prestadores" = PJ/MEI na ativa; "No INSS" = afastado (pelo INSS).

type Pessoa = { situacao: string; vinculo: string; ativo: boolean };

export const GRUPOS_EQUIPE = [
  { id: "equipe", rotulo: "Funcionários", dica: "na ativa (inclui prestadores, sem carteira e afastados)" },
  { id: "ex", rotulo: "Ex-funcionários", dica: "desligados" },
  { id: "prestador", rotulo: "Prestadores de serviço", dica: "PJ / MEI na ativa" },
  { id: "sem_carteira", rotulo: "Sem carteira", dica: "autônomos na ativa" },
  { id: "inss", rotulo: "No INSS", dica: "afastados pelo INSS" },
] as const;
export type GrupoEquipe = (typeof GRUPOS_EQUIPE)[number]["id"];

const desligado = (f: Pessoa) => f.situacao === "desligado" || !f.ativo;

export function noGrupo(f: Pessoa, g: GrupoEquipe) {
  switch (g) {
    case "equipe": return !desligado(f);
    case "ex": return desligado(f);
    case "prestador": return !desligado(f) && f.vinculo === "pj";
    case "sem_carteira": return !desligado(f) && f.vinculo === "autonomo";
    case "inss": return !desligado(f) && f.situacao === "afastado";
  }
}

export function contarGrupos(lista: Pessoa[]) {
  return Object.fromEntries(GRUPOS_EQUIPE.map((g) => [g.id, lista.filter((f) => noGrupo(f, g.id)).length])) as Record<GrupoEquipe, number>;
}
