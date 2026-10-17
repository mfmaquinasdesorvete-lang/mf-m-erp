// Mercado Livre na tela: a conta conectada, a lista dos anúncios com o que vai ser enviado e as ações
// (ajustes do envio, exceções, aprovar preço, sincronizar, buscar e ligar anúncios). O cálculo fica em mlAnuncios.ts.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { callFunction, supabase } from "./supabase";
import { comPlano, textoResumoEnvio, type ContaML, type LinhaAnuncio } from "./mlAnuncios";

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------
/** A conta do Mercado Livre conectada (uma só; null = nenhuma). */
export function useContaML() {
  return useQuery({
    queryKey: ["ml_contas", "ligada"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ml_contas").select("*").neq("status", "desligada").order("created_at").limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ContaML | null;
    },
  });
}

/** Anúncios (todos ou só os de um produto) com o que vai ser enviado para cada um. */
export function useAnunciosML(produtoId?: string | null) {
  const conta = useContaML();
  const lista = useQuery({
    queryKey: ["ml_anuncios", "lista", produtoId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ml_anuncios_lista", produtoId ? { p_produto: produtoId } : {});
      if (!error) return (Array.isArray(data) ? data : []) as LinhaAnuncio[];
      // banco ainda sem o envio de estoque e preço: mostra só os anúncios ligados, sem o cálculo
      if (/ml_anuncios_lista|schema cache|could not find/i.test(error.message)) {
        let q = supabase.from("ml_anuncios").select("id, ml_item_id, variation_id, titulo, sku, produto_id");
        if (produtoId) q = q.eq("produto_id", produtoId);
        const r = await q;
        if (!r.error) return (r.data ?? []).map((x) => ({ ...x, anuncio_id: x.id, na_fila: false }) as unknown as LinhaAnuncio);
      }
      throw error;
    },
  });
  const anuncios = useMemo(() => comPlano(lista.data ?? [], conta.data ?? null), [lista.data, conta.data]);
  return {
    conta: conta.data ?? null,
    anuncios,
    carregando: conta.isLoading || lista.isLoading,
    erro: (lista.error ?? conta.error) as Error | null,
  };
}

// ---------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------
async function rpc<T = unknown>(nome: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type AjustesEnvio = {
  enviar_estoque: boolean; enviar_preco: boolean; preco_tabela_id: string | null; preco_ajuste: number;
  estoque_seguranca: number; estoque_maximo: number | null; trava_preco: number;
};
export const configurarEnvio = (contaId: string, ajustes: Partial<AjustesEnvio>) => rpc("ml_configurar_envio", { p_conta: contaId, p: ajustes });

export const mudarExcecao = (anuncioId: string, campo: "estoque" | "preco", enviar: boolean) =>
  rpc("ml_anuncio_excecoes", { p_anuncio: anuncioId, p_enviar_estoque: campo === "estoque" ? enviar : null, p_enviar_preco: campo === "preco" ? enviar : null });

export const aprovarPreco = (anuncioId: string, preco: number) => rpc("ml_aprovar_preco", { p_anuncio: anuncioId, p_preco: preco });

export const ligarAnuncio = (anuncioId: string, produtoId: string) => rpc<number>("ml_ligar_anuncio", { p_anuncio: anuncioId, p_produto: produtoId });

/** "Sincronizar agora": põe os anúncios na fila (forçado) e já pede o envio. Se a função não responder, o agendamento manda. */
export async function sincronizarAgora(anuncios?: string[]) {
  const n = await rpc<number>("ml_sincronizar_agora", anuncios?.length ? { p_anuncios: anuncios } : {});
  try {
    const r = await callFunction<{ resultado?: Parameters<typeof textoResumoEnvio>[0] }>("mercadolivre", { acao: "anuncios" });
    return { naFila: Number(n ?? 0), resultado: r?.resultado ?? null, erro: null as string | null };
  } catch (e) {
    // já está na fila: o agendamento de 5 minutos manda
    return { naFila: Number(n ?? 0), resultado: null, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Traz os anúncios da conta (ativos e pausados) e liga pelo SKU igual ao do cadastro. */
/** Pausa ou reativa vários anúncios no Mercado Livre (até 200 por vez). */
export const mudarSituacaoAnuncios = (itens: string[], status: "paused" | "active") =>
  callFunction<{ resultado: { mudados: number; erros: { id: string; erro: string }[] } }>("mercadolivre", { acao: "situacao_anuncios", itens, status });

export const buscarAnunciosML = () =>
  callFunction<{ resultado: { anuncios: number; total: number; novos: number; ligados: number; sem_produto: number; mais: boolean } }>("mercadolivre", { acao: "buscar_anuncios" });

// ---------------------------------------------------------------------
// Conexão da conta (administrador): as chaves e os tokens vão direto para o cofre pela função mercadolivre
// ---------------------------------------------------------------------
/** As chaves do app já foram informadas? Vendas pendentes e anúncios sem produto. */
export function useSituacaoML(ligado = true) {
  return useQuery({
    queryKey: ["ml_contas", "situacao"],
    enabled: ligado,
    retry: false,
    queryFn: async () => rpc<{ chaves: boolean; pendentes: number; avisos: number; sem_produto: number } | null>("ml_situacao", {}),
  });
}

export const guardarChavesML = (clientId: string, clientSecret: string) =>
  callFunction<{ ok: boolean; retorno: string }>("mercadolivre", { acao: "credenciais", client_id: clientId, client_secret: clientSecret });

/** Abre a página do Mercado Livre para autorizar; ele volta para /mercado-livre/retorno. */
export async function conectarML() {
  const r = await callFunction<{ url: string }>("mercadolivre", { acao: "autorizar" });
  if (!r?.url) throw new Error("o Mercado Livre não devolveu o link de autorização");
  window.location.assign(r.url);
}

export const concluirConexaoML = (code: string, state: string) =>
  callFunction<{ ok: boolean; apelido: string; resultado: unknown }>("mercadolivre", { acao: "conectar", code, state });

export const desconectarML = () => callFunction("mercadolivre", { acao: "desconectar" });
