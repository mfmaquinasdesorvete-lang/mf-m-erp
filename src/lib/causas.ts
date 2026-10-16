// Cadeias de causas (Sobre o ERP Line → Esquemas): um efeito explicado por eventos em sequência, cada um FATO
// (com a evidência) ou HIPÓTESE, e cada ligação causa COMPROVADA, PROVÁVEL ou só CORRELAÇÃO. A regra que impede
// vender correlação como causa é a mesma do banco (public.problema_cadeia). Funções puras.

export type TipoElo = "fato" | "hipotese";
export type Ligacao = "comprovada" | "provavel" | "correlacao";
export type Elo = { texto: string; tipo: TipoElo; evidencia?: string | null; ligacao: Ligacao };
export type SituacaoCadeia = "em_revisao" | "revisada" | "descartada";
export type Cadeia = {
  id: string; titulo: string; efeito: string; area: string; elos: Elo[]; conclusao: string | null; situacao: SituacaoCadeia;
  motivo: string | null; criado_por: string | null; criado_nome: string | null; revisado_nome: string | null; revisado_em: string | null;
  atualizado_em: string; created_at: string;
};

export const ROTULO_TIPO: Record<TipoElo, string> = { fato: "Fato", hipotese: "Hipótese" };
export const ROTULO_LIGACAO: Record<Ligacao, string> = { comprovada: "causa comprovada", provavel: "causa provável", correlacao: "só correlação" };
export const DICA_LIGACAO: Record<Ligacao, string> = {
  comprovada: "Um levou ao outro, e dá para mostrar como (os dois são fatos com evidência).",
  provavel: "Faz sentido e há indícios, mas ainda falta prova.",
  correlacao: "Acontecem juntos, mas não está provado que um causa o outro.",
};
export const ROTULO_SITUACAO_CADEIA: Record<SituacaoCadeia, string> = { em_revisao: "Em revisão", revisada: "Revisada", descartada: "Descartada" };

const tem = (s: string | null | undefined, n: number) => (s ?? "").trim().length >= n;

/** Primeiro problema que impede salvar (ou null). Mesma regra de public.problema_cadeia. */
export function problemaCadeia(elos: Elo[]): string | null {
  if (!elos.length) return "ponha pelo menos um elo (a primeira causa)";
  if (elos.length > 20) return "no máximo 20 elos";
  for (let k = 0; k < elos.length; k++) {
    const e = elos[k];
    const n = k + 1;
    if (!tem(e.texto, 3)) return `elo ${n}: escreva o que aconteceu`;
    if (e.texto.length > 300 || (e.evidencia ?? "").length > 500) return `elo ${n}: texto longo demais`;
    if (e.tipo === "fato" && !tem(e.evidencia, 5)) return `elo ${n}: fato precisa da evidência (onde se vê); sem ela, marque como hipótese`;
    // o seguinte é o próximo elo, ou o efeito (que é o fato observado)
    const proxFato = k === elos.length - 1 || elos[k + 1].tipo === "fato";
    if (e.ligacao === "comprovada" && (e.tipo !== "fato" || !proxFato)) {
      return `elo ${n}: só dá para dizer "comprovada" entre dois fatos com evidência; use "provável" ou "correlação"`;
    }
  }
  return null;
}

/** Quão forte é a explicação inteira: vale o elo mais fraco. */
export function forcaCadeia(elos: Elo[]): Ligacao {
  if (elos.some((e) => e.ligacao === "correlacao")) return "correlacao";
  if (elos.some((e) => e.ligacao === "provavel" || e.tipo === "hipotese")) return "provavel";
  return "comprovada";
}

/** Avisos que não impedem salvar, mas o revisor deve ler. */
export function avisosCadeia(c: Pick<Cadeia, "elos" | "conclusao">): string[] {
  const av: string[] = [];
  const hip = c.elos.filter((e) => e.tipo === "hipotese").length;
  if (c.elos.length && !c.elos.some((e) => e.tipo === "fato")) av.push("Nenhum elo é fato: a cadeia inteira ainda é suposição.");
  if (hip) av.push(`${hip} ${hip === 1 ? "hipótese precisa" : "hipóteses precisam"} ser conferida${hip === 1 ? "" : "s"} antes de agir como se fosse${hip === 1 ? "" : "m"} certa${hip === 1 ? "" : "s"}.`);
  if (c.elos.some((e) => e.ligacao === "correlacao")) av.push("Há ligação que é só correlação: não diga que uma coisa causou a outra.");
  if (!tem(c.conclusao, 10)) av.push("Escreva a conclusão: o que está provado, o que não está e o que fazer.");
  return av;
}

export const elosVazios = (): Elo[] => [{ texto: "", tipo: "fato", evidencia: "", ligacao: "provavel" }];

/** A cadeia em texto, para mandar à equipe. */
export function textoCadeia(c: Pick<Cadeia, "titulo" | "efeito" | "elos" | "conclusao" | "situacao">) {
  const linhas = [`${c.titulo} (${ROTULO_SITUACAO_CADEIA[c.situacao].toLowerCase()})`, ""];
  c.elos.forEach((e, k) => {
    linhas.push(`${k + 1}. [${ROTULO_TIPO[e.tipo]}] ${e.texto}${e.evidencia?.trim() ? ` — evidência: ${e.evidencia.trim()}` : ""}`);
    linhas.push(`   ↓ ${ROTULO_LIGACAO[e.ligacao]}`);
  });
  linhas.push(`Efeito: ${c.efeito}`, "", `Força da explicação: ${ROTULO_LIGACAO[forcaCadeia(c.elos)]}.`);
  if (c.conclusao?.trim()) linhas.push(`Conclusão: ${c.conclusao.trim()}`);
  return linhas.join("\n");
}
