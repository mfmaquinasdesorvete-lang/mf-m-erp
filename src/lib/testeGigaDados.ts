// Teste do giga (REG-006): leitura e gravação no banco. Tudo grava pelas funções do banco (teste_giga_*),
// que checam o papel de quem lança e deixam a auditoria. A lista completa é lida por técnico, financeiro e
// administrador; o resumo por NS (teste_giga_situacao) também por vendas.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { avisoConclusaoOp, normalizarNs, nsDaOp, type ParametroCadastro, type SituacaoNs, type TesteGiga } from "./testeGiga";

export const MSG_SEM_BANCO = "O teste do giga ainda não está ativo no banco: falta aplicar a mudança do banco do teste do giga (teste_giga).";

/** Banco sem a mudança do teste do giga (tabela ou função que ainda não existe). */
export function semMudancaDoBanco(e: unknown) {
  const m = e as { code?: string; message?: string } | null;
  if (!m) return false;
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(m.code ?? "")) return true;
  return /teste(s)?_giga/.test(m.message ?? "") && /does not exist|could not find|schema cache|não existe/i.test(m.message ?? "");
}

export type Operador = { tipo: "funcionario" | "usuario"; id: string; nome: string; detalhe: string | null };
type ComBanco<T> = { linhas: T; semBanco: boolean };

/** Todos os testes (de 1000 em 1000). Sem a mudança do banco: lista vazia e o aviso, sem erro na tela. */
export function useTestesGiga(enabled = true) {
  return useQuery({
    queryKey: ["testes_giga", "todos"],
    enabled,
    queryFn: async (): Promise<ComBanco<TesteGiga[]>> => {
      const todas: TesteGiga[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("testes_giga").select("*")
          .order("testado_em", { ascending: false }).order("numero", { ascending: false }).range(de, de + 999);
        if (error) {
          if (semMudancaDoBanco(error)) return { linhas: [], semBanco: true };
          throw error;
        }
        todas.push(...((data ?? []) as TesteGiga[]).map(numerosDoTeste));
        if ((data?.length ?? 0) < 1000) return { linhas: todas, semBanco: false };
      }
    },
  });
}

// o PostgREST devolve numeric como número ou texto: tudo vira número
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
function numerosDoTeste(t: TesteGiga): TesteGiga {
  return {
    ...t, numero: Number(t.numero), tentativa: t.tentativa == null ? 1 : Number(t.tentativa),
    aterramento_resistencia_ohm: num(t.aterramento_resistencia_ohm), aterramento_corrente_a: num(t.aterramento_corrente_a),
    tensao_aplicada_v: num(t.tensao_aplicada_v), tensao_tempo_s: num(t.tensao_tempo_s), tensao_fuga_ma: num(t.tensao_fuga_ma),
  };
}

export function useParametrosGiga(enabled = true) {
  return useQuery({
    queryKey: ["teste_giga_parametros"],
    enabled,
    queryFn: async (): Promise<ParametroCadastro[]> => {
      const { data, error } = await supabase.from("teste_giga_parametros").select("*");
      if (error) {
        if (semMudancaDoBanco(error)) return [];
        throw error;
      }
      return ((data ?? []) as ParametroCadastro[]).map((p) => ({
        ...p, aterramento_resistencia_max_ohm: num(p.aterramento_resistencia_max_ohm), aterramento_corrente_a: num(p.aterramento_corrente_a),
        tensao_v: num(p.tensao_v), tensao_tempo_s: num(p.tensao_tempo_s), tensao_fuga_max_ma: num(p.tensao_fuga_max_ma),
      }));
    },
  });
}

/** Funcionários ativos e usuários do ERP para escolher o operador (só nome e cargo). */
export function useOperadoresGiga(enabled = true) {
  return useQuery({
    queryKey: ["teste_giga_operadores"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Operador[]> => {
      const { data, error } = await supabase.rpc("teste_giga_operadores");
      if (error) {
        if (semMudancaDoBanco(error)) return [];
        throw error;
      }
      return (data ?? []) as Operador[];
    },
  });
}

/**
 * Resumo do teste de cada NS (ficha da máquina, Ficha 360, OP). null = indisponível (banco sem a mudança ou sem
 * permissão): quem chama simplesmente não mostra nada.
 */
export function useSituacaoGiga(lista: (string | null | undefined)[], enabled = true) {
  const ns = [...new Set(lista.map(normalizarNs).filter(Boolean))].sort();
  return useQuery({
    queryKey: ["teste_giga_situacao", ns.join("|")],
    enabled: enabled && ns.length > 0,
    queryFn: () => situacaoGiga(ns),
  });
}

export async function situacaoGiga(ns: string[]): Promise<Map<string, SituacaoNs> | null> {
  if (!ns.length) return new Map();
  const { data, error } = await supabase.rpc("teste_giga_situacao", { p_ns: ns });
  if (error) {
    if (semMudancaDoBanco(error)) return null;
    throw error;
  }
  return new Map(((data ?? []) as SituacaoNs[]).map((s) => [normalizarNs(s.numero_serie), {
    ...s, testes: Number(s.testes), ultimo_numero: s.ultimo_numero == null ? null : Number(s.ultimo_numero),
    aprovado_numero: s.aprovado_numero == null ? null : Number(s.aprovado_numero),
  }]));
}

/**
 * Aviso ao concluir a OP de máquina (não bloqueia): máquinas sem teste do giga aprovado ou OP sem NS.
 * null = nada a avisar, ou o banco ainda sem o teste do giga (aí não avisa nada).
 */
export async function avisoGigaDaOp(numerosSerie: string | null | undefined): Promise<string | null> {
  try {
    const ns = nsDaOp(numerosSerie);
    // OP sem NS: consulta um NS qualquer só para saber se o teste do giga já está no banco
    const sit = await situacaoGiga(ns.length ? ns : ["-"]);
    return sit === null ? null : avisoConclusaoOp(numerosSerie, [...sit.values()]);
  } catch {
    return null;
  }
}

export type LancamentoGiga = {
  produto_id: string; numero_serie: string; testado_em?: string | null; unidade_id?: string | null; ordem_producao_id?: string | null;
  operador_funcionario_id?: string | null; operador_user_id?: string | null; operador_nome?: string | null;
  funcional: string; aterramento: string; tensao: string;
  aterramento_resistencia_ohm?: number | null; aterramento_corrente_a?: number | null;
  tensao_aplicada_v?: number | null; tensao_tempo_s?: number | null; tensao_fuga_ma?: number | null;
  giga?: string | null; observacoes?: string | null;
};
export type RespostaLancamento = { id: string; numero: number; numero_serie: string; tentativa: number; resultado: "aprovada" | "reprovada"; reteste_de_numero: number | null; divergencias: string[] };

export async function lancarTesteGiga(p: LancamentoGiga): Promise<RespostaLancamento> {
  const { data, error } = await supabase.rpc("teste_giga_lancar", { p });
  if (error) throw semMudancaDoBanco(error) ? new Error(MSG_SEM_BANCO) : error;
  return data as RespostaLancamento;
}

export async function anularTesteGiga(id: string, motivo: string): Promise<number> {
  const { data, error } = await supabase.rpc("teste_giga_anular", { p_id: id, p_motivo: motivo });
  if (error) throw semMudancaDoBanco(error) ? new Error(MSG_SEM_BANCO) : error;
  return Number(data);
}

export async function salvarParametrosGiga(produtoId: string | null, p: Record<string, number | string | null>) {
  const { error } = await supabase.rpc("teste_giga_salvar_parametros", { p_produto: produtoId, p });
  if (error) throw semMudancaDoBanco(error) ? new Error(MSG_SEM_BANCO) : error;
}

/** O que recarregar depois de gravar. */
export const CHAVES_GIGA = ["testes_giga", "teste_giga_situacao", "teste_giga_parametros"];
