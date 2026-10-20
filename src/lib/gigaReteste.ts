// Teste do giga: lista de reteste das máquinas vendidas antes do registro no ERP (desde 2023). Nada é inventado:
// a máquina fica "sem ensaio registrado" até um teste de verdade ser ligado a ela, ou ser dispensada com o motivo.
import type { TesteGiga } from "./testeGiga";

export type SituacaoReteste = "pendente" | "testado" | "dispensado";
export const ROTULO_RETESTE: Record<SituacaoReteste, string> = {
  pendente: "Sem ensaio registrado", testado: "Testada", dispensado: "Dispensada",
};

export type LinhaReteste = {
  id: string; situacao: SituacaoReteste; motivo: string | null; teste_id: string | null; atualizado_em: string;
  equipamento: {
    id: string; descricao: string | null; numero_serie: string | null; data_venda: string | null; origem: string | null; produto_id: string | null;
    cliente: { id: string; nome: string; nome_fantasia: string | null; municipio: string | null; uf: string | null } | null;
  } | null;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtra por situação e pela busca (máquina, cliente, cidade, UF ou nº de série), a mais antiga primeiro. */
export function filtrarRetestes(linhas: LinhaReteste[], situacao: SituacaoReteste | "todas", busca: string): LinhaReteste[] {
  const termos = semAcento(busca.trim()).split(/\s+/).filter(Boolean);
  return linhas
    .filter((l) => situacao === "todas" || l.situacao === situacao)
    .filter((l) => {
      if (!termos.length) return true;
      const e = l.equipamento;
      const texto = semAcento([e?.descricao, e?.numero_serie, e?.cliente?.nome, e?.cliente?.nome_fantasia, e?.cliente?.municipio, e?.cliente?.uf].filter(Boolean).join(" "));
      return termos.every((t) => texto.includes(t));
    })
    .sort((a, b) => (a.equipamento?.data_venda ?? "9999").localeCompare(b.equipamento?.data_venda ?? "9999"));
}

export function contarRetestes(linhas: LinhaReteste[]): Record<SituacaoReteste, number> {
  const c = { pendente: 0, testado: 0, dispensado: 0 };
  for (const l of linhas) c[l.situacao]++;
  return c;
}

/** Testes válidos que podem ser ligados à máquina: do mesmo modelo, ainda não ligados a outra máquina, o mais novo primeiro. */
export function testesParaLigar(testes: TesteGiga[], produtoId: string | null | undefined, jaLigados: Set<string>): TesteGiga[] {
  return testes
    .filter((t) => !t.anulado_em && !jaLigados.has(t.id) && (!produtoId || t.produto_id === produtoId))
    .sort((a, b) => b.testado_em.localeCompare(a.testado_em));
}
