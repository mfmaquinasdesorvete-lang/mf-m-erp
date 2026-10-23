import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { escolherConflito } from "@/components/Dialogos";
import { gravarSincronizado, sincronizada } from "./sincronizacao";
import { supabase } from "./supabase";

/** Lista registros de uma tabela (com select opcional de relacionamentos). */
export function useRows<T = any>(
  table: string,
  opts: { select?: string; order?: string; ascending?: boolean; key?: unknown[]; filtro?: Filtro } = {},
) {
  const { select = "*", order = "created_at", ascending = false, key = [], filtro } = opts;
  return useQuery({
    queryKey: [table, select, order, ascending, ...key],
    // O Supabase devolve no máximo 1000 linhas por consulta: lista maior vem em páginas (a 1ª já é a página 1)
    queryFn: async () => (await todasAsPaginas(table, select, order, ascending, filtro)) as T[],
  });
}

/** Filtro feito no servidor (ex.: só um mês, só algumas tabelas): a tela baixa só o que usa. Use junto uma `key`. */
type Filtro = (q: any) => any;
const aplicar = (q: any, filtro?: Filtro) => (filtro ? filtro(q) : q);

const PAGINA = 1000;
/** Depois da 1ª página, as próximas são pedidas de 3 em 3 ao mesmo tempo (lista de 3 mil linhas: 2 esperas em vez de 3). */
const LOTE = 3;

/** Resultado de uma consulta do Supabase; se deu erro, lança (a tela mostra o aviso em vez de "lista vazia"). */
export async function ler<T>(consulta: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

/** Tabelas e visões sem coluna id (icms_uf, clientes_desde…): depois da 1ª vez, nem tenta o desempate pelo id. */
const SEM_ID = new Set<string>(["icms_uf", "nfe_validacoes", "tiny_documentos", "necessidade_producao", "tipos_contato", "usuarios_erp",
  "adiantamento_prestacoes", "avisos_tipos", "estoque_unidade", "clientes_desde"]);

/** Lê a tabela inteira de 1000 em 1000 (desempate pelo id para nenhuma linha repetir ou faltar entre as páginas). */
async function todasAsPaginas(table: string, select: string, order: string, ascending: boolean, filtro?: Filtro) {
  const pagina = (de: number, desempate: boolean) => {
    let q = aplicar(supabase.from(table).select(select), filtro).order(order, { ascending });
    if (desempate) q = q.order("id", { ascending: true });
    return q.range(de, de + PAGINA - 1) as PromiseLike<{ data: unknown[] | null; error: unknown }>;
  };
  let desempate = !SEM_ID.has(table);
  let primeira = await pagina(0, desempate);
  if (primeira.error && desempate) {
    // tabela sem coluna id: tenta sem o desempate e, se era isso mesmo, lembra (erro de rede não entra na lista)
    desempate = false;
    primeira = await pagina(0, false);
    if (!primeira.error) SEM_ID.add(table);
  }
  if (primeira.error) throw primeira.error;
  const todas: unknown[] = [...(primeira.data ?? [])];
  if (todas.length < PAGINA) return todas;
  for (let de = PAGINA; ; de += PAGINA * LOTE) {
    const lote = await Promise.all(Array.from({ length: LOTE }, (_, i) => pagina(de + i * PAGINA, desempate)));
    for (const { data, error } of lote) {
      if (error) throw error;
      todas.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGINA) return todas;
    }
  }
}

/** Insere (sem id) ou atualiza (com id) um registro e invalida o cache da tabela. */
export function useSave(table: string, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Record<string, any>) => {
      const { id, __antes, ...rest } = row;
      // pedidos e contas abertos para editar levam "__antes" (o registro como a pessoa viu): grava só o que ela mudou,
      // com versão, sem repetir e sem apagar o que outra pessoa mudou nos outros campos
      if (id && __antes && sincronizada(table)) {
        await gravarSincronizado({ tabela: table, id, versaoBase: __antes.versao, antes: __antes, depois: rest, escolher: escolherConflito });
        const { data, error } = await supabase.from(table).select().eq("id", id).single();
        if (error) throw error;
        return data;
      }
      const q = id
        ? supabase.from(table).update(rest).eq("id", id).select().single()
        : supabase.from(table).insert(rest).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: () => [table, ...invalidate].forEach((t) => qc.invalidateQueries({ queryKey: [t] })),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...tables: string[]) => tables.forEach((t) => qc.invalidateQueries({ queryKey: [t] }));
}

/** Converte strings vazias em null antes de gravar. */
export const limpar = <T extends Record<string, any>>(row: T): T =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === "" ? null : v])) as T;

/** Tira os cadastros repetidos já unificados (fornecedores e transportadoras arquivados). Mesma lista → mesmo resultado. */
const cacheSemUnificados = new WeakMap<object, unknown[]>();
export function semUnificados<T>(lista: T[]): T[] {
  const unificado = (x: T) => !!(x as { unificado_em?: string | null }).unificado_em;
  let r = cacheSemUnificados.get(lista) as T[] | undefined;
  if (!r) { r = lista.some(unificado) ? lista.filter((x) => !unificado(x)) : lista; cacheSemUnificados.set(lista, r); }
  return r;
}
