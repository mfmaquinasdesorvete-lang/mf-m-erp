// Setor da OP: máquinas, tornearia (peças usinadas: eixo, bucha, pá, flange…) ou mecânica (montagem de
// subconjuntos: redutor, cilindro, chave extratora…). A OP grava o setor; sem setor, vale o palpite pelo produto.
export type SetorOP = "maquinas" | "tornearia" | "mecanica";
export const SETORES: { v: SetorOP; rotulo: string }[] = [
  { v: "maquinas", rotulo: "Máquinas" }, { v: "tornearia", rotulo: "Tornearia" }, { v: "mecanica", rotulo: "Mecânica" },
];

const TORNEARIA = /(?<!\p{L})(eixos?|buchas?|usinad[oa]s?|usinagem|torne(ad[oa]|aria)|pinos?|flanges?|p[áa]s?|batedor(es)?|polias?|engrenagens?|tampas? usinad|luvas?|espa[çc]ador(es)?)(?!\p{L})/iu;

/** Palpite do setor pelo produto (máquina → máquinas; peça usinada → tornearia; o resto → mecânica). */
export function setorDoProduto(p: { tipo?: string | null; descricao?: string | null; categoria?: string | null } | null | undefined): SetorOP {
  if (p?.tipo === "maquina") return "maquinas";
  return TORNEARIA.test(`${p?.descricao ?? ""} ${p?.categoria ?? ""}`) ? "tornearia" : "mecanica";
}

/** Setor da OP: o gravado; sem ele, o do produto. */
export const setorDaOP = (o: { setor?: string | null; produto?: Parameters<typeof setorDoProduto>[0] }): SetorOP =>
  (["maquinas", "tornearia", "mecanica"].includes(o.setor ?? "") ? o.setor : setorDoProduto(o.produto)) as SetorOP;
