// Nota de fornecedor completa: dados (XML, produtos, vínculos do fornecedor, regras de preço, tabelas de preço,
// custos já aplicados e ordens de compra) e o estado da tela (produto e fator de cada item, opções do custo,
// margem e preço escolhidos). A conta fica em lib/notaFornecedor.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { useCategoriasProduto } from "@/components/CategoriasProdutos";
import { configPreco, margemAlvo } from "@/lib/precificacao";
import type { PrecoFixo, TabelaPreco } from "@/lib/tabelasPreco";
import type { Produto } from "@/lib/types";
import {
  compararNotaOc, custosDaNota, fatorDaDescricao, itemSemImpostos, lerXmlNota, linhaCusto, numeroBR, opcoesPadraoNota, precoDoItem, sugerirVinculo,
  valorPorUnidadeErp,
  type ContaCusto, type Finalidade, type ItemOc, type ItemXmlNota, type OrigemVinculo, type PrecoItem, type TotaisNota, type VinculoFornecedor,
} from "@/lib/notaFornecedor";

export type NotaBase = {
  id: string; chave: string; emitente_nome: string; emitente_cnpj: string; valor_total: number; situacao: string;
  estoque_lancado: boolean; fornecedor_id?: string | null;
};
export type ProdutoNota = Produto & { unificado_em?: string | null };

export type LinhaItem = {
  item: ItemXmlNota;
  produto_id: string | null; origem: OrigemVinculo | null;
  fator: number;
  /** fator lido da descrição (ex.: "CX C/12"), para sugerir */
  fatorSugerido: number | null;
  /** produto ou fator mudou na tela (falta gravar o vínculo) */
  mudou: boolean;
};

export type CustoSalvo = {
  numero: number; produto_id: string | null; fator: number; custo_unitario: number; custo_anterior: number | null; custo_aplicado: boolean;
  preco_novo: number | null; margem: number | null; preco_modo: string | null; aplicado_nome: string | null; aplicado_em: string;
  finalidade: Finalidade; descontar_creditos: boolean; extra: number;
};

export type OcNota = {
  id: string; numero: number; status: string; created_at: string; previsao_entrega: string | null; valor_total: number;
  ligada: boolean; baixado_em: string | null; mesmo_fornecedor: boolean; fornecedor: string | null;
  itens: { id: string; produto_id: string; descricao: string; quantidade: number; quantidade_recebida: number; custo_unitario: number }[];
};

/** Margem e preço digitados (texto, como a pessoa escreveu) e o que fazer com o item. */
export type EscolhaItem = { margem?: string; preco?: string; custo: boolean; precoMarcado?: boolean };

export type OpcoesNota = { finalidade: Finalidade; descontarCreditos: boolean; despesaExtra: string };

export type ModoPreco = "aprovacao" | "direto" | "nenhum";

export function useNotaFornecedor(nota: NotaBase) {
  const invalidate = useInvalidate();
  const { data: produtos = [], isLoading: carregandoProdutos } = useRows<ProdutoNota>("produtos", { order: "descricao", ascending: true });
  const { data: cfgBruta } = useConfig();
  const cfg = useMemo(() => configPreco(cfgBruta?.precificacao), [cfgBruta]);
  const { data: categorias = [] } = useCategoriasProduto();
  const { data: tabelas = [] } = useRows<TabelaPreco>("tabelas_preco", { order: "nome", ascending: true });

  const xml = useQuery({
    queryKey: ["nfe_recebidas", "xml", nota.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("nfe_recebidas").select("xml, itens").eq("id", nota.id).single();
      if (error) throw error;
      const lido = lerXmlNota(data?.xml as string | null);
      if (lido) return { completo: true, itens: lido.itens, totais: lido.totais };
      const lista = (data?.itens ?? []) as Parameters<typeof itemSemImpostos>[0][];
      return { completo: false, itens: lista.map(itemSemImpostos), totais: null as TotaisNota | null };
    },
  });

  const vinculos = useQuery({
    queryKey: ["produto_fornecedor", nota.fornecedor_id],
    enabled: !!nota.fornecedor_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("produto_fornecedor").select("codigo_fornecedor, produto_id, fator_conversao").eq("fornecedor_id", nota.fornecedor_id!);
      if (error) throw error;
      return (data ?? []) as VinculoFornecedor[];
    },
  });

  const custosSalvos = useQuery({
    queryKey: ["nfe_custos_itens", nota.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("nfe_custos_itens").select("*").eq("nfe_id", nota.id);
      if (error) return [] as CustoSalvo[];   // migração ainda não aplicada: a tela segue sem o que já foi gravado
      return (data ?? []) as CustoSalvo[];
    },
  });

  const ocs = useQuery({
    queryKey: ["ocs_para_nota", nota.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ocs_para_nota", { p_nfe: nota.id });
      if (error) throw error;
      return (data ?? []) as OcNota[];
    },
  });

  // ---- estado da tela ----
  const [linhas, setLinhas] = useState<LinhaItem[] | null>(null);
  const [opcoes, setOpcoes] = useState<OpcoesNota | null>(null);
  const [escolhas, setEscolhas] = useState<Record<number, EscolhaItem>>({});
  const [modo, setModo] = useState<ModoPreco>("aprovacao");

  const prontos = xml.data && !carregandoProdutos && (!nota.fornecedor_id || vinculos.data) && custosSalvos.data;
  useEffect(() => {
    if (!prontos || linhas) return;
    const salvos = new Map(custosSalvos.data!.map((c) => [c.numero, c]));
    setLinhas(xml.data!.itens.map((item) => {
      const s = salvos.get(item.numero);
      const sug = sugerirVinculo(item, vinculos.data ?? [], produtos);
      const fatorSugerido = fatorDaDescricao(item.descricao, item.unidade);
      if (s?.produto_id) return { item, produto_id: s.produto_id, origem: sug?.produto_id === s.produto_id ? sug.origem : "manual", fator: Number(s.fator) || 1, fatorSugerido, mudou: false };
      return { item, produto_id: sug?.produto_id ?? null, origem: sug?.origem ?? null, fator: sug?.fator ?? 1, fatorSugerido,
        // ligado pelo EAN/SKU (ainda não está no cadastro do fornecedor): vale gravar
        mudou: !!sug && sug.origem !== "fornecedor" };
    }));
    // opções da última vez que o custo desta nota foi gravado; sem nada gravado, o padrão (o mesmo da entrada automática)
    const primeiro = custosSalvos.data![0];
    const padrao = opcoesPadraoNota(cfgBruta?.precificacao);
    const extra = custosSalvos.data!.reduce((s, c) => s + Number(c.extra ?? 0), 0);
    setOpcoes({
      finalidade: primeiro?.finalidade ?? padrao.finalidade,
      descontarCreditos: primeiro ? primeiro.descontar_creditos : padrao.descontarCreditos,
      despesaExtra: extra > 0 ? extra.toFixed(2).replace(".", ",") : "",
    });
    setEscolhas(Object.fromEntries(xml.data!.itens.map((i) => [i.numero, { custo: true } as EscolhaItem])));
  }, [prontos]); // eslint-disable-line react-hooks/exhaustive-deps

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const contas: ContaCusto[] = useMemo(() => {
    if (!linhas || !opcoes) return [];
    return custosDaNota(linhas.map((l) => l.item), xml.data?.totais ?? null, linhas.map((l) => l.fator), {
      finalidade: opcoes.finalidade, descontarCreditos: opcoes.descontarCreditos, despesaExtra: numeroBR(opcoes.despesaExtra) ?? 0,
    });
  }, [linhas, opcoes, xml.data]);

  /** Preço novo de cada item ligado (regra de margem, margem digitada ou preço digitado). */
  const precos: Record<number, PrecoItem & { margemAlvo: number; origemMargem: string }> = useMemo(() => {
    const r: Record<number, PrecoItem & { margemAlvo: number; origemMargem: string }> = {};
    (linhas ?? []).forEach((l, k) => {
      const p = l.produto_id ? porId.get(l.produto_id) : undefined;
      const c = contas[k];
      if (!p || !c || !(c.custo_unitario > 0)) return;
      const alvo = margemAlvo(p, cfg, categorias);
      const e = escolhas[l.item.numero];
      r[l.item.numero] = {
        // custo com 2 casas, como fica gravado no produto (a regra do banco calcula sobre ele)
        ...precoDoItem({ custo: Math.round(c.custo_unitario * 100) / 100, precoAtual: Number(p.preco_venda), margemAlvo: alvo.margem,
          margem: numeroBR(e?.margem ?? ""), preco: numeroBR(e?.preco ?? "") }, cfg),
        margemAlvo: alvo.margem, origemMargem: alvo.origem,
      };
    });
    return r;
  }, [linhas, contas, escolhas, porId, cfg, categorias]);

  // preços fixos das tabelas para os produtos da nota
  const idsProdutos = useMemo(() => [...new Set((linhas ?? []).map((l) => l.produto_id).filter(Boolean) as string[])].sort(), [linhas]);
  const fixos = useQuery({
    queryKey: ["tabela_preco_itens", "nota", idsProdutos.join(",")],
    enabled: idsProdutos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("tabela_preco_itens").select("id, tabela_id, produto_id, preco").in("produto_id", idsProdutos);
      if (error) throw error;
      return (data ?? []) as PrecoFixo[];
    },
  });

  // nota × OC (só as ligadas que ainda não deram baixa por esta nota)
  const comparacao = useMemo(() => {
    const itensOc: ItemOc[] = (ocs.data ?? []).filter((o) => o.ligada && !o.baixado_em).flatMap((o) => o.itens.map((i) => ({
      id: i.id, pedido_compra_id: o.id, numero: o.numero, produto_id: i.produto_id, descricao: i.descricao,
      quantidade: Number(i.quantidade), quantidade_recebida: Number(i.quantidade_recebida), custo_unitario: Number(i.custo_unitario),
    })));
    // preço do produto na nota (sem impostos), por unidade do ERP, como a OC
    const itensNota = (linhas ?? []).flatMap((l, k) => (!l.produto_id ? [] : [{
      produto_id: l.produto_id, descricao: porId.get(l.produto_id)?.descricao ?? l.item.descricao,
      quantidade: contas[k]?.quantidade_erp ?? l.item.quantidade * l.fator,
      preco_unitario: valorPorUnidadeErp(l.item.valor_unitario, l.fator),
    }]));
    return compararNotaOc(itensNota, itensOc);
  }, [ocs.data, linhas, contas, porId]);

  function mudarLinha(numero: number, patch: Partial<LinhaItem>) {
    setLinhas((ls) => ls?.map((l) => (l.item.numero === numero ? { ...l, ...patch, mudou: true } : l)) ?? null);
  }
  function mudarEscolha(numero: number, patch: Partial<EscolhaItem>) {
    setEscolhas((e) => ({ ...e, [numero]: { ...(e[numero] ?? { custo: true }), ...patch } }));
  }

  function recarregar() {
    invalidate("nfe_recebidas", "produtos", "estoque_movimentos", "pedidos_compra", "preco_sugestoes", "nfe_custos_itens", "ocs_para_nota",
      "produto_fornecedor", "notas_da_oc", "auditoria", "fornecimentos");
  }

  return {
    carregando: xml.isLoading || carregandoProdutos || (!!nota.fornecedor_id && vinculos.isLoading) || custosSalvos.isLoading,
    erro: xml.error ?? vinculos.error ?? null,
    completo: xml.data?.completo ?? false,
    totais: xml.data?.totais ?? null,
    linhas: linhas ?? [], mudarLinha, marcarGravado: () => setLinhas((ls) => ls?.map((l) => ({ ...l, mudou: false })) ?? null),
    opcoes, setOpcoes, escolhas, mudarEscolha, modo, setModo,
    contas, precos, produtos, porId, cfg, categorias, tabelas: tabelas.filter((t) => t.ativo), fixos: fixos.data ?? [],
    custosSalvos: new Map((custosSalvos.data ?? []).map((c) => [c.numero, c])),
    ocs: ocs.data ?? [], ocsErro: ocs.error, ocsCarregando: ocs.isLoading, comparacao,
    recarregar,
  };
}

export type DadosNota = ReturnType<typeof useNotaFornecedor>;

/** Itens no formato das funções do banco. */
export function itensParaEstoque(d: DadosNota) {
  return d.linhas.filter((l) => l.produto_id).map((l) => ({
    codigo: l.item.codigo, descricao: l.item.descricao, produto_id: l.produto_id, quantidade: l.item.quantidade,
    valor_unitario: l.item.valor_unitario, fator: l.fator,
  }));
}

/** Custos (e preço, quando marcado) dos itens escolhidos, no formato de aplicar_custos_nota. */
export function itensParaCusto(d: DadosNota, numeros?: number[]) {
  return d.linhas.flatMap((l, k) => {
    if (!l.produto_id || (numeros && !numeros.includes(l.item.numero))) return [];
    const c = d.contas[k];
    const e = d.escolhas[l.item.numero] ?? { custo: true };
    const pr = d.precos[l.item.numero];
    if (!c || !(c.custo_unitario > 0)) return [];
    const comPreco = !!pr?.preco && precoMarcado(e, pr);
    if (!e.custo && !comPreco) return [];
    return [{
      ...linhaCusto({ numero: l.item.numero, codigo: l.item.codigo, descricao: l.item.descricao, produto_id: l.produto_id, quantidade: l.item.quantidade }, c),
      atualizar_custo: e.custo, preco_novo: comPreco ? pr!.preco : null, margem: comPreco ? pr!.margem : null,
    }];
  });
}

/** Opções no formato das funções do banco. */
export const opcoesParaBanco = (d: DadosNota) => ({
  finalidade: d.opcoes?.finalidade ?? "revenda", descontar_creditos: d.opcoes?.descontarCreditos ?? true, modo_preco: d.modo,
});

/** O preço vai junto? O que a pessoa marcou; sem marcar, quando digitou margem/preço ou o preço de hoje saiu da faixa. */
export function precoMarcado(e: EscolhaItem | undefined, pr: PrecoItem | undefined) {
  if (!pr?.preco) return false;
  if (e?.precoMarcado != null) return e.precoMarcado;
  return pr.fonte !== "regra" || pr.fora_da_faixa;
}
