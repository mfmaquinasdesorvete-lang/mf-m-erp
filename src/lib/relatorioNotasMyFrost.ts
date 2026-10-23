// Relatório das notas fiscais da My Frost (empresa anterior) para o contador: por ano e por grupo (vendas, remessas,
// devoluções, estornos e canceladas). Vem do backup de XML (notas_legado). A cancelada conta à parte: aparece com o
// valor, mas não entra no total das válidas. Puro (sem banco e sem tela). Testes em __tests__/relatorioNotasMyFrost.test.ts.
import { tipoDaNota } from "./notasMyFrost";

export type NotaMyFrostRelatorio = {
  id: string; numero: string; data: string | null; valor: number | null; natureza: string | null;
  situacao: string | null; tipo: string | null; chave: string | null; dest_doc: string | null; dest_nome: string | null;
  cartas_correcao: number | null; cliente_nome?: string | null;
};

export const GRUPOS = ["Vendas", "Remessas", "Devoluções", "Estornos", "Canceladas"] as const;
export type Grupo = (typeof GRUPOS)[number];

/** Grupo da nota para o contador. Remessas = conserto, retorno, garantia, industrialização, exposição, amostra e outras saídas. */
export function grupoDaNota(n: Pick<NotaMyFrostRelatorio, "natureza" | "situacao">): Grupo {
  if (n.situacao === "cancelada") return "Canceladas";
  const t = tipoDaNota(n.natureza);
  if (t === "Estorno") return "Estornos";
  if (t === "Devolução") return "Devoluções";
  if (t === "Venda") return "Vendas";
  return "Remessas";
}

export type Celula = { qtd: number; valor: number };
export type LinhaAno = { ano: string; grupos: Record<Grupo, Celula>; validas: Celula };

const vazio = (): Celula => ({ qtd: 0, valor: 0 });
const somar = (c: Celula, v: number | null) => { c.qtd += 1; c.valor = Math.round((c.valor + Number(v ?? 0)) * 100) / 100; };
const novaLinha = (ano: string): LinhaAno => ({ ano, grupos: Object.fromEntries(GRUPOS.map((g) => [g, vazio()])) as Record<Grupo, Celula>, validas: vazio() });

/** Uma linha por ano (do mais antigo ao mais novo) e a linha do total. */
export function resumoPorAno(notas: NotaMyFrostRelatorio[]): { anos: LinhaAno[]; total: LinhaAno } {
  const porAno = new Map<string, LinhaAno>();
  const total = novaLinha("Total");
  for (const n of notas) {
    const ano = n.data ? n.data.slice(0, 4) : "sem data";
    const l = porAno.get(ano) ?? novaLinha(ano);
    porAno.set(ano, l);
    const g = grupoDaNota(n);
    somar(l.grupos[g], n.valor); somar(total.grupos[g], n.valor);
    if (g !== "Canceladas") { somar(l.validas, n.valor); somar(total.validas, n.valor); }
  }
  return { anos: [...porAno.values()].sort((a, b) => a.ano.localeCompare(b.ano)), total };
}

const docFormatado = (d: string | null) => {
  const s = (d ?? "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return s;
};

/** Linhas da planilha do contador: uma por nota, na ordem da data. */
export function linhasParaPlanilha(notas: NotaMyFrostRelatorio[]): Record<string, unknown>[] {
  return [...notas].sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")) || Number(a.numero) - Number(b.numero))
    .map((n) => ({
      Ano: n.data?.slice(0, 4) ?? "",
      Data: n.data ?? "",
      "NF nº": Number(n.numero),
      Grupo: grupoDaNota(n),
      "Entrada/Saída": n.tipo === "entrada" ? "Entrada" : n.tipo === "saida" ? "Saída" : "",
      Natureza: n.natureza ?? "",
      Situação: n.situacao === "cancelada" ? "Cancelada" : "Autorizada",
      Destinatário: n.dest_nome || n.cliente_nome || "",
      "CPF/CNPJ": docFormatado(n.dest_doc),
      Valor: Number(n.valor ?? 0),
      "Cartas de correção": n.cartas_correcao ?? 0,
      Chave: n.chave ?? "",
    }));
}

/** Resumo por ano em linhas de planilha (quantidade e valor de cada grupo e o total das válidas). */
export function resumoParaPlanilha(r: ReturnType<typeof resumoPorAno>): Record<string, unknown>[] {
  return [...r.anos, r.total].map((l) => ({
    Ano: l.ano,
    ...Object.fromEntries(GRUPOS.flatMap((g) => [[`${g} (qtd)`, l.grupos[g].qtd], [`${g} (R$)`, l.grupos[g].valor]])),
    "Válidas (qtd)": l.validas.qtd,
    "Válidas (R$)": l.validas.valor,
  }));
}
