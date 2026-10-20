// Painel gerencial → Pedido x Nota x Banco: para cada venda, o valor do pedido, o da nota fiscal e o que entrou no
// banco, apontando onde não bate. Arquivo puro (testado).

export type VendaConferir = {
  id: string; numero: number | null; data: string; cliente: string;
  total: number; frete: number;
  /** notas autorizadas da venda (devolução não conta) */
  notas: number[];
  /** NF emitida por outra empresa (registrada no pedido) */
  notaOutra: { numero: string; valor: number | null } | null;
  /** contas a receber da venda (sem as canceladas) e quanto delas já foi baixado */
  contas: number; baixado: number;
  /** lançamentos do extrato ligados às contas da venda */
  banco: number;
};

export type SituacaoNota = "bate" | "sem_frete" | "menor" | "maior" | "sem_nota" | "outra_empresa";
export type SituacaoBanco = "entrou" | "parcial" | "baixado_sem_extrato" | "a_receber" | "sem_conta";

export const ROTULO_NOTA: Record<SituacaoNota, string> = {
  bate: "Nota bate", sem_frete: "Nota sem o frete", menor: "Nota menor", maior: "Nota maior",
  sem_nota: "Sem nota", outra_empresa: "Nota de outra empresa",
};
export const ROTULO_BANCO: Record<SituacaoBanco, string> = {
  entrou: "Entrou no banco", parcial: "Entrou em parte", baixado_sem_extrato: "Baixado sem extrato",
  a_receber: "A receber", sem_conta: "Sem conta a receber",
};

const TOL = 1; // centavos de arredondamento
const soma = (l: number[]) => l.reduce((s, v) => s + Number(v || 0), 0);

export function conferirVenda(v: VendaConferir) {
  const nota = v.notaOutra ? Number(v.notaOutra.valor ?? 0) : soma(v.notas);
  let sNota: SituacaoNota;
  if (v.notaOutra) sNota = "outra_empresa";
  else if (!v.notas.length) sNota = "sem_nota";
  else if (Math.abs(nota - v.total) <= TOL) sNota = "bate";
  // frete cobrado no pedido e fora da nota
  else if (v.frete > 0 && Math.abs(nota - (v.total - v.frete)) <= TOL) sNota = "sem_frete";
  else sNota = nota < v.total ? "menor" : "maior";

  let sBanco: SituacaoBanco;
  if (v.banco > 0) sBanco = v.banco >= v.total - TOL ? "entrou" : "parcial";
  else if (v.baixado > 0) sBanco = "baixado_sem_extrato";
  else if (v.contas > 0) sBanco = "a_receber";
  else sBanco = "sem_conta";

  return {
    nota, sNota, difNota: sNota === "sem_nota" ? -v.total : Math.round((nota - v.total) * 100) / 100,
    sBanco, difBanco: Math.round((v.banco - v.total) * 100) / 100,
    ok: (sNota === "bate" || sNota === "outra_empresa") && sBanco === "entrou",
  };
}

export type VendaConferida = VendaConferir & ReturnType<typeof conferirVenda>;

export function resumoConferencia(vendas: VendaConferir[]) {
  const linhas: VendaConferida[] = vendas.map((v) => ({ ...v, ...conferirVenda(v) }));
  const conta = <K extends string>(f: (l: VendaConferida) => K) => linhas.reduce((m, l) => { m[f(l)] = (m[f(l)] ?? 0) + 1; return m; }, {} as Record<K, number>);
  return {
    linhas,
    vendido: soma(linhas.map((l) => l.total)),
    notas: soma(linhas.map((l) => l.nota)),
    banco: soma(linhas.map((l) => l.banco)),
    porNota: conta((l) => l.sNota),
    porBanco: conta((l) => l.sBanco),
    tudoBate: linhas.filter((l) => l.ok).length,
    // nota bem menor que o pedido sem ser só o frete: o que mais pede atenção
    notaMenor: soma(linhas.filter((l) => l.sNota === "menor").map((l) => l.total - l.nota)),
    freteFora: soma(linhas.filter((l) => l.sNota === "sem_frete").map((l) => l.frete)),
  };
}
