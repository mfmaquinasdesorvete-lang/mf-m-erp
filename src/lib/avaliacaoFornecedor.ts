// Avaliação de fornecedores (ISO 9001, item 8.4): nota de 0 a 10 em prazo, qualidade, preço e atendimento, com pesos;
// a classe (A, B ou C) diz se o fornecedor continua aprovado e quando ele é avaliado de novo.

export type Notas = { prazo: number; qualidade: number; preco: number; atendimento: number };
export type Classe = "A" | "B" | "C";

/** Qualidade e prazo pesam mais: peça errada ou atrasada para a produção das máquinas. */
export const PESOS: Notas = { prazo: 0.35, qualidade: 0.4, preco: 0.15, atendimento: 0.1 };

export const CLASSES: Record<Classe, { rotulo: string; texto: string; meses: number; cor: string }> = {
  A: { rotulo: "A · Aprovado", texto: "Continua fornecendo normalmente", meses: 12, cor: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  B: { rotulo: "B · Aprovado com ressalva", texto: "Continua, mas acompanhar de perto e pedir melhoria", meses: 6, cor: "bg-amber-100 text-amber-800 border-amber-300" },
  C: { rotulo: "C · Reprovado", texto: "Procurar outro fornecedor; comprar só com autorização", meses: 3, cor: "bg-red-100 text-red-800 border-red-300" },
};

export const TIPOS_OCORRENCIA: Record<string, string> = {
  atraso: "Atraso na entrega",
  qualidade: "Peça com defeito / fora da especificação",
  quantidade: "Quantidade ou item errado",
  documentacao: "Nota fiscal ou documento errado",
  atendimento: "Atendimento / comunicação",
  outro: "Outro",
};
export const GRAVIDADES: Record<string, { rotulo: string; pontos: number }> = {
  leve: { rotulo: "Leve", pontos: 1 },
  media: { rotulo: "Média", pontos: 2 },
  grave: { rotulo: "Grave", pontos: 4 },
};

const limitar = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

export function notaFinal(n: Notas): number {
  return limitar(n.prazo * PESOS.prazo + n.qualidade * PESOS.qualidade + n.preco * PESOS.preco + n.atendimento * PESOS.atendimento);
}

export function classe(nota: number): Classe {
  return nota >= 8 ? "A" : nota >= 6 ? "B" : "C";
}

/** Próxima avaliação: pela classe; fornecedor crítico (peça das máquinas certificadas) no máximo a cada 6 meses. */
export function proximaAvaliacao(data: string, c: Classe, critico = false): string {
  const meses = critico ? Math.min(6, CLASSES[c].meses) : CLASSES[c].meses;
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(d, ultimo));
  return x.toISOString().slice(0, 10);
}

export type Indicadores = {
  entregues: number; no_prazo: number; atraso_medio: number | null;
  ocorrencias: { tipo: string; gravidade: string; aberta?: boolean }[];
  devolucoes: number; defeitos: number;
};

/**
 * Notas sugeridas pelo que o ERP registrou no período: prazo pelas ordens de compra recebidas no prazo; qualidade
 * começa em 10 e perde pontos por não conformidade (leve 1, média 2, grave 4), devolução ao fornecedor e baixa
 * de estoque por defeito do fornecedor (2 cada); atendimento perde pelas ocorrências de atendimento. Sem dado, 8.
 */
export function notasSugeridas(i: Indicadores): Notas & { base: string[] } {
  const base: string[] = [];
  let prazo = 8;
  const atrasos = i.ocorrencias.filter((o) => o.tipo === "atraso");
  if (i.entregues > 0) {
    prazo = (10 * i.no_prazo) / i.entregues;
    base.push(`${i.no_prazo} de ${i.entregues} ${i.entregues === 1 ? "entrega" : "entregas"} no prazo`);
  }
  for (const o of atrasos) prazo -= GRAVIDADES[o.gravidade]?.pontos ?? 1;
  if (atrasos.length) base.push(`${atrasos.length} atraso(s) registrado(s)`);

  let qualidade = 10;
  for (const o of i.ocorrencias) if (["qualidade", "quantidade", "documentacao"].includes(o.tipo)) qualidade -= GRAVIDADES[o.gravidade]?.pontos ?? 1;
  qualidade -= 2 * (i.devolucoes + i.defeitos);
  const nq = i.ocorrencias.filter((o) => ["qualidade", "quantidade", "documentacao"].includes(o.tipo)).length;
  if (nq) base.push(`${nq} não conformidade(s) de qualidade`);
  if (i.devolucoes) base.push(`${i.devolucoes} devolução(ões) ao fornecedor`);
  if (i.defeitos) base.push(`${i.defeitos} baixa(s) por defeito do fornecedor`);

  let atendimento = 9;
  for (const o of i.ocorrencias) if (o.tipo === "atendimento") atendimento -= GRAVIDADES[o.gravidade]?.pontos ?? 1;

  if (!base.length) base.push("Sem registro de problemas no período");
  return { prazo: limitar(prazo), qualidade: limitar(qualidade), preco: 8, atendimento: limitar(atendimento), base };
}

/** Situação da reavaliação para a lista. */
export function situacaoAvaliacao(proxima: string | null | undefined, hoje: string): "sem" | "vencida" | "em_breve" | "em_dia" {
  if (!proxima) return "sem";
  if (proxima < hoje) return "vencida";
  const [a, m, d] = hoje.split("-").map(Number);
  const limite = new Date(Date.UTC(a, m - 1, d + 30)).toISOString().slice(0, 10);
  return proxima <= limite ? "em_breve" : "em_dia";
}
