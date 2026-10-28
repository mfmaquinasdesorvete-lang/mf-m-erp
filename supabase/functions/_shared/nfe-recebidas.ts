// NF-e recebidas de fornecedores: gravação, XML, contas a pagar e processamento automático.
// Usado pela sincronização (nfe-recebidas-sync), pelo gatilho da Focus (focus-webhook)
// e pelo agendamento (nfe-processar).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError, onlyDigits } from "./supabase.ts";
import { ambienteParaMensagem, codigoUnidade, erroDeToken, focus, focusJson, recebidasDisponiveis } from "./focusnfe.ts";
import { type Duplicata, type ItemNota, lerCabecalho, lerNfe } from "./nfe-xml.ts";
import { custosAutomaticos, opcoesPadraoNota } from "./nota-custo.ts";
import { casarItensComOc, type ItemOcCasar } from "./nfe-itens-oc.ts";

export type RecebidaFocus = {
  chave_nfe: string;
  nome_emitente: string;
  documento_emitente: string;
  valor_total: string | number;
  data_emissao: string;
  situacao: string;
  manifestacao_destinatario: string | null;
  nfe_completa: boolean;
  versao?: number;
};

/** Cria o fornecedor pelo CNPJ (se não existir) e grava/atualiza a nota. */
export async function salvarRecebida(db: SupabaseClient, n: RecebidaFocus, unidadeId?: string | null) {
  const doc = onlyDigits(n.documento_emitente);
  let fornecedorId: string | null = null;
  if (doc) {
    const { data: f } = await db.from("fornecedores").select("id").eq("cnpj", doc).maybeSingle();
    fornecedorId = f?.id ?? null;
    if (!fornecedorId) {
      const { data: novo } = await db.from("fornecedores").insert({ nome: n.nome_emitente, cnpj: doc }).select("id").single();
      fornecedorId = novo?.id ?? null;
    }
  }
  const { error } = await db.from("nfe_recebidas").upsert({
    chave: n.chave_nfe,
    emitente_nome: n.nome_emitente,
    emitente_cnpj: doc,
    valor_total: Number(n.valor_total),
    data_emissao: n.data_emissao,
    situacao: n.situacao,
    manifestacao: n.manifestacao_destinatario,
    nfe_completa: n.nfe_completa,
    ...(n.versao ? { versao: n.versao } : {}),
    fornecedor_id: fornecedorId,
    ...(unidadeId ? { unidade_id: unidadeId } : {}),
  }, { onConflict: "chave" });
  return !error;
}

/** Código da unidade destinatária da nota (escolhe o token da Focus). */
async function codigoDaChave(db: SupabaseClient, chave: string) {
  const { data } = await db.from("nfe_recebidas").select("unidade_id").eq("chave", chave).maybeSingle();
  return await codigoUnidade(db, data?.unidade_id);
}

export async function manifestar(db: SupabaseClient, chave: string, tipo: string, justificativa?: string) {
  const res = await focusJson(`/v2/nfes_recebidas/${chave}/manifesto`, {
    method: "POST",
    body: JSON.stringify({ tipo, justificativa }),
  }, await codigoDaChave(db, chave), { recebidas: true });
  if (res.status && res.status !== "evento_registrado") {
    throw new HttpError(422, res.mensagem_sefaz || res.mensagem || "manifestação rejeitada");
  }
  await db.from("nfe_recebidas").update({ manifestacao: tipo }).eq("chave", chave);
  return res;
}

/** Baixa o XML da nota na Focus. Só existe depois da ciência da operação. */
export async function baixarXml(db: SupabaseClient, chave: string): Promise<string | null> {
  const res = await focus(`/v2/nfes_recebidas/${chave}.xml`, {}, await codigoDaChave(db, chave), { recebidas: true });
  if (!res.ok) return null;
  const xml = await res.text();
  return xml.includes("<infNFe") ? xml : null;
}

/** Lê itens e duplicatas do XML (o importado ou o da SEFAZ) e guarda os itens na nota. */
export async function carregarItens(db: SupabaseClient, nfe: { id: string; chave: string; xml?: string | null }) {
  const xml = nfe.xml || await baixarXml(db, nfe.chave);
  if (!xml) return null;
  const lido = lerNfe(xml);
  await db.from("nfe_recebidas").update({ itens: lido.itens, nfe_completa: true }).eq("id", nfe.id);
  return { ...lido, xml };
}

/** Lança as duplicatas da nota em contas a pagar (ou parcela única no vencimento informado). */
export async function lancarContaPagar(db: SupabaseClient, nfe: any, duplicatas: Duplicata[], vencimentoPadrao?: string, manual = false) {
  if (nfe.conta_pagar_id) return 0;
  // a OC já lançou as contas (OC → Lançar no contas a pagar): a nota usa as dela em vez de lançar de novo
  const { data: vinculos } = await db.from("nfe_oc_vinculos").select("pedido_compra_id").eq("nfe_id", nfe.id).eq("ativo", true);
  const ocs = (vinculos ?? []).map((v: any) => v.pedido_compra_id);
  if (ocs.length) {
    const { data: daOc } = await db.from("contas_pagar").select("id").in("pedido_compra_id", ocs).neq("status", "cancelado").order("vencimento");
    if (daOc?.length) {
      await db.from("contas_pagar").update({ nfe_recebida_id: nfe.id }).in("id", daOc.map((c: any) => c.id)).is("nfe_recebida_id", null);
      await db.from("nfe_recebidas").update({ conta_pagar_id: daOc[0].id }).eq("id", nfe.id);
      nfe.conta_pagar_id = daOc[0].id;
      return 0;
    }
  } else if (nfe.fornecedor_id) {
    // nota ainda sem OC ligada, mas o fornecedor tem OC com contas lançadas esperando a nota: não lança (duplicaria)
    const { data: esperando } = await db.from("contas_pagar").select("pedido_compra:pedidos_compra(numero)")
      .eq("fornecedor_id", nfe.fornecedor_id).not("pedido_compra_id", "is", null).is("nfe_recebida_id", null).neq("status", "cancelado").limit(1);
    if (esperando?.length) {
      const n = (esperando[0] as any).pedido_compra?.numero;
      if (manual) throw new HttpError(409, `A OC #${n} deste fornecedor já lançou as contas a pagar: ligue a nota à OC (Notas fiscais → Recebidas → Ordem de compra) em vez de lançar de novo.`);
      return 0;
    }
  }
  let parcelas = duplicatas;
  if (!parcelas.length) {
    if (!vencimentoPadrao) return 0;
    parcelas = [{ numero: null, vencimento: vencimentoPadrao, valor: Number(nfe.valor_total) }];
  }
  const numeroNota = nfe.chave.slice(25, 34).replace(/^0+/, "");
  const { data: contas, error } = await db.from("contas_pagar").insert(parcelas.map((d, i) => ({
    descricao: `NF ${numeroNota} - ${nfe.emitente_nome}` + (parcelas.length > 1 ? ` (${i + 1}/${parcelas.length})` : ""),
    fornecedor_id: nfe.fornecedor_id,
    categoria: "fornecedores",
    documento: d.numero ? `NF ${numeroNota} dup ${d.numero}` : `NF ${numeroNota}`,
    valor: d.valor,
    vencimento: d.vencimento,
    nfe_recebida_id: nfe.id,
  }))).select("id");
  if (error) throw new HttpError(500, error.message);
  await db.from("nfe_recebidas").update({ conta_pagar_id: contas![0].id }).eq("id", nfe.id);
  nfe.conta_pagar_id = contas![0].id;
  return contas!.length;
}

/**
 * Vincula os itens da nota a produtos: 1º pelo de-para do fornecedor, 2º pelo código de barras (EAN), 3º pelo item da
 * OC ligada à nota (`nfeId`; ver nfe-itens-oc.ts), marcado com `pela_oc`.
 */
export async function vincularItens(db: SupabaseClient, fornecedorId: string | null, itens: ItemNota[], nfeId?: string) {
  const { data: vinculos } = fornecedorId
    ? await db.from("produto_fornecedor").select("codigo_fornecedor, produto_id, fator_conversao").eq("fornecedor_id", fornecedorId)
    : { data: [] as any[] };
  const porCodigo = new Map((vinculos ?? []).map((v: any) => [v.codigo_fornecedor, v]));
  // itens marcados em "Conferir itens das notas" como uso e consumo, bem da empresa ou serviço: não pedem vínculo
  const { data: semEstoque } = fornecedorId
    ? await db.from("fornecedor_itens_sem_estoque").select("codigo_fornecedor").eq("fornecedor_id", fornecedorId).eq("ativo", true)
    : { data: [] as any[] };
  const foraDoEstoque = new Set((semEstoque ?? []).map((v: any) => v.codigo_fornecedor));

  const eans = itens.map((i) => i.ean).filter(Boolean) as string[];
  const { data: porEan } = eans.length
    ? await db.from("produtos").select("id, codigo_barras").in("codigo_barras", eans).eq("ativo", true)
    : { data: [] as any[] };
  const mapaEan = new Map((porEan ?? []).map((p: any) => [p.codigo_barras, p.id]));

  const vinculados = itens.map((i) => {
    const v = porCodigo.get(i.codigo);
    const semEstoque = !v && foraDoEstoque.has(i.codigo);
    return {
      ...i,
      produto_id: (v?.produto_id ?? (i.ean && !semEstoque ? mapaEan.get(i.ean) : null) ?? null) as string | null,
      fator: Number(v?.fator_conversao ?? 1),
      sem_estoque: semEstoque,
      pela_oc: false,
    };
  });
  if (!nfeId || !vinculados.some((i) => !i.produto_id && !i.sem_estoque)) return vinculados;
  const { data: ligacoes } = await db.from("nfe_oc_vinculos").select("pedido_compra_id").eq("nfe_id", nfeId).eq("ativo", true);
  const ocs = (ligacoes ?? []).map((l: any) => l.pedido_compra_id);
  if (!ocs.length) return vinculados;
  const { data: itensOc } = await db.from("pedido_compra_itens")
    .select("produto_id, quantidade, quantidade_recebida, codigo_fornecedor").in("pedido_compra_id", ocs).not("produto_id", "is", null);
  const casados = casarItensComOc(
    vinculados.map((i) => (i.produto_id || i.sem_estoque ? null : { codigo: i.codigo, quantidade: Number(i.quantidade) })),
    (itensOc ?? []) as ItemOcCasar[],
    vinculados.flatMap((i) => (i.produto_id ? [i.produto_id] : [])),
  );
  return vinculados.map((i, k) => (casados.has(k) ? { ...i, produto_id: casados.get(k)!, fator: 1, pela_oc: true } : i));
}

// Compra para revenda/industrialização/uso (vendas do fornecedor: 51xx, 54xx, 61xx, 64xx, 71xx).
// Outras operações (remessa p/ conserto, demonstração, comodato, devolução…) vão para revisão manual.
const CFOP_COMPRA = /^(51|54|61|64|71)/;
// Devolução de mercadoria (o cliente devolvendo o que a MF vendeu): 5201/5202, com ST 5410/5411, ativo 5553, uso 5556
const CFOP_DEVOLUCAO = /^[567](201|202|410|411|553|556)$/;

/** Põe o marcador "Devolução" na nota recebida. */
async function marcarDevolucao(db: SupabaseClient, id: string) {
  const { data: m } = await db.from("marcadores").select("id").ilike("nome", "devolução").maybeSingle();
  const { data: n } = await db.from("nfe_recebidas").select("marcadores").eq("id", id).single();
  const lista: string[] = n?.marcadores ?? [];
  await db.from("nfe_recebidas").update({ finalidade: "devolucao", ...(m?.id && !lista.includes(m.id) ? { marcadores: [...lista, m.id] } : {}) }).eq("id", id);
}

type Config = {
  entrada_automatica_estoque: boolean; conta_pagar_automatica: boolean;
  /** a compra só entra no estoque quando chega (CT-e entregue ou "Chegou" na nota); até lá fica "a caminho" */
  entrada_so_na_entrega?: boolean;
  /** regras de preço (configuracoes.precificacao): custo_nota e finalidade_nota dizem como calcular o custo pela nota */
  precificacao?: unknown;
  /** Notas de fornecedor emitidas antes desta data já foram lançadas no sistema anterior: não entram sozinhas. */
  recebidas_processar_desde?: string | null;
};
/** Campos de configuracoes usados no processamento automático. */
export const CONFIG_RECEBIDAS = "entrada_automatica_estoque, conta_pagar_automatica, entrada_so_na_entrega, recebidas_processar_desde, precificacao";

/**
 * Processa uma NF-e recebida: ciência -> XML -> contas a pagar -> entrada no estoque.
 * Nunca lança exceção: grava o andamento em nfe_recebidas.processamento.
 */
export async function processarNota(db: SupabaseClient, nfe: any, cfg: Config) {
  const marcar = (processamento: string, msg: string | null) =>
    db.from("nfe_recebidas").update({
      processamento, processamento_msg: msg, tentativas: (nfe.tentativas ?? 0) + 1,
      ...(processamento === "concluido" ? { processado_em: new Date().toISOString() } : {}),
    }).eq("id", nfe.id);

  try {
    if (nfe.situacao === "cancelada" || ["desconhecimento", "nao_realizada"].includes(nfe.manifestacao)) {
      return await marcar("ignorada", "Nota cancelada ou não reconhecida");
    }
    if (nfe.estoque_lancado) return await marcar("concluido", null);
    if (cfg.recebidas_processar_desde && nfe.data_emissao && String(nfe.data_emissao).slice(0, 10) < cfg.recebidas_processar_desde) {
      return await marcar("ignorada", "Histórico: já lançada no sistema anterior.");
    }
    // NF-e de transferência entre as unidades da MF: a entrada é dada pela tela Transferências (estoque uma vez só)
    const { data: transf } = await db.rpc("transferencia_da_chave", { p_chave: nfe.chave });
    if (transf) {
      return await marcar("revisao", "NF-e de transferência entre as unidades da MF: dê a entrada em Estoque → Transferências (o estoque entra uma vez só).");
    }

    // A ciência libera o XML. Se já foi dada por fora (ex.: painel da Focus), a SEFAZ recusa a repetição: segue assim mesmo.
    if (!nfe.manifestacao && nfe.origem !== "xml") await manifestar(db, nfe.chave, "ciencia").catch(() => null);

    const lido = await carregarItens(db, nfe);
    if (!lido) return await marcar("aguardando_xml", "A SEFAZ ainda não liberou o XML. Nova tentativa automática em alguns minutos.");
    // guarda o XML baixado: o banco lê dele "à vista / a prazo" (condicao_compra) e não precisa baixar de novo
    if (!nfe.xml) await db.from("nfe_recebidas").update({ xml: lido.xml }).eq("id", nfe.id).is("xml", null);

    const naoCompra = [...new Set(lido.itens.map((i) => i.cfop ?? "").filter((c) => !CFOP_COMPRA.test(c)))];
    if (naoCompra.length && lido.itens.length && lido.itens.every((i) => CFOP_DEVOLUCAO.test(i.cfop ?? ""))) {
      await marcarDevolucao(db, nfe.id);
      return await marcar("revisao", `NF de devolução (CFOP ${naoCompra.join(", ")}): mercadoria voltando para a MF. Confira o que chegou e use ` +
        "\"Entrada no estoque\"; a devolução do dinheiro ou o crédito ao cliente é feito no financeiro.");
    }
    if (naoCompra.length) {
      return await marcar("revisao", `Não parece compra (CFOP ${naoCompra.join(", ")}). Ex.: remessa para conserto. Confira e lance manualmente se for o caso.`);
    }

    if (cfg.conta_pagar_automatica) await lancarContaPagar(db, nfe, lido.duplicatas);
    if (!cfg.entrada_automatica_estoque) return await marcar("aguardando_vinculo", "Entrada automática desligada em Configurações.");

    const itens = await vincularItens(db, nfe.fornecedor_id, lido.itens, nfe.id);
    // o que casou pela OC vira de-para do fornecedor: a próxima nota dele já vem com o produto
    const pelaOc = itens.filter((i) => i.pela_oc && i.codigo);
    if (pelaOc.length && nfe.fornecedor_id) {
      await db.from("produto_fornecedor").upsert(pelaOc.map((i) => ({
        fornecedor_id: nfe.fornecedor_id, codigo_fornecedor: i.codigo, descricao_fornecedor: i.descricao, produto_id: i.produto_id, fator_conversao: 1,
      })), { onConflict: "fornecedor_id,codigo_fornecedor", ignoreDuplicates: true });
    }
    const semVinculo = itens.filter((i) => !i.produto_id && !i.sem_estoque);
    if (semVinculo.length) {
      return await marcar("aguardando_vinculo",
        `${semVinculo.length} item(ns) sem produto vinculado: ${semVinculo.slice(0, 3).map((i) => i.descricao).join(", ")}` +
        (semVinculo.length > 3 ? "…" : "") + ". Vincule uma vez; nas próximas notas será automático.");
    }

    if (!itens.some((i) => i.produto_id)) {
      return await marcar("concluido", "Só itens de uso e consumo, bens da empresa ou serviço: a nota não entra no estoque.");
    }
    if (cfg.entrada_so_na_entrega && !nfe.chegou_em) {
      return await marcar("a_caminho", "A caminho: entra no estoque quando a transportadora marcar entregue ou quando quem recebeu apertar \"Chegou\".");
    }
    // Custo completo pela nota (a mesma conta da tela, em nota-custo.ts): frete, seguro e outras despesas rateados,
    // desconto, IPI, ICMS-ST e os créditos do custo líquido, dividido pelo fator. A conta fica em nfe_custos_itens.
    const opcoes = opcoesPadraoNota(cfg.precificacao);
    const itensEstoque = itens.map((i) => ({
      codigo: i.codigo, descricao: i.descricao, produto_id: i.produto_id,
      quantidade: i.quantidade, valor_unitario: i.valor_unitario, fator: i.fator,
    }));
    const custos = custosAutomaticos(lido.xml, itens, opcoes);
    let { error } = await db.rpc("entrada_automatica_nota", {
      p_nfe: nfe.id, p_itens: itensEstoque, p_custos: custos,
      p_opcoes: { finalidade: opcoes.finalidade, descontar_creditos: opcoes.descontarCreditos },
    });
    // banco ainda sem a função nova (migração não aplicada): a entrada de antes, com o custo pelo valor unitário
    if (error && (error.code === "PGRST202" || /entrada_automatica_nota/.test(error.message))) {
      ({ error } = await db.rpc("lancar_estoque_nfe_core", {
        p_nfe: nfe.id, p_itens: itensEstoque.map((i) => ({ ...i, atualizar_custo: true })),
      }));
    }
    if (error) return await marcar("aguardando_vinculo", `Erro ao lançar estoque: ${error.message}`);
    // o gatilho do banco marca a nota como "concluido"
  } catch (e) {
    await marcar(nfe.processamento === "pendente" ? "aguardando_xml" : nfe.processamento, `Falha temporária: ${(e as Error).message}`);
  }
}

/** Processa as notas pendentes (no máximo `limite` por execução). */
export async function processarPendentes(db: SupabaseClient, limite = 20) {
  const { data: cfg } = await db.from("configuracoes").select(CONFIG_RECEBIDAS).eq("id", 1).single();
  if (!cfg) return 0;
  const { data: notas } = await db.from("nfe_recebidas").select("*")
    .in("processamento", ["pendente", "aguardando_xml"])
    .is("excluida_em", null)
    .lt("tentativas", 60)
    .order("created_at")
    .limit(limite);
  for (const nfe of notas ?? []) await processarNota(db, nfe, cfg);
  return notas?.length ?? 0;
}

/** Unidade dona do CNPJ (destinatário da nota). */
export async function unidadePorCnpj(db: SupabaseClient, cnpj: string | null | undefined) {
  const doc = onlyDigits(cnpj);
  if (doc.length !== 14) return null;
  const { data } = await db.from("unidades").select("id, cnpj");
  return (data ?? []).find((u: any) => onlyDigits(u.cnpj) === doc)?.id ?? null;
}

/**
 * Busca na Focus as notas novas contra o CNPJ de cada unidade (matriz e filial).
 * Uma unidade que a Focus recusar (ex.: filial ainda não cadastrada lá) vai para `avisos`
 * sem impedir as outras; só dá erro se nenhuma unidade funcionar.
 */
export async function sincronizarRecebidas(db: SupabaseClient, avisos: string[] = []) {
  if (!recebidasDisponiveis()) {
    // diz o que foi lido para achar erro no secret, sem nunca mostrar um token colado nele por engano
    throw new HttpError(400, "As notas de fornecedores só existem no ambiente de produção da SEFAZ (a homologação não tem notas reais). " +
      `O ERP leu em FOCUS_NFE_ENV ${ambienteParaMensagem()}: para buscar, ele precisa ser producao ` +
      "ou é preciso cadastrar o secret FOCUS_NFE_TOKEN_PRODUCAO com o Token de Produção da Focus. Depois de mudar, busque de novo.");
  }
  const { data: unidades } = await db.from("unidades").select("id, codigo, nome, cnpj").eq("ativo", true);
  const comCnpj = (unidades ?? []).filter((u: any) => onlyDigits(u.cnpj).length === 14);
  if (!comCnpj.length) throw new HttpError(400, "preencha o CNPJ das unidades em Configurações → Unidades");
  let total = 0;
  const falhas: string[] = [];
  for (const u of comCnpj) {
    try {
      total += await sincronizarCnpj(db, onlyDigits(u.cnpj), u.id, u.codigo);
    } catch (e) {
      falhas.push(`${u.nome}: ${(e as Error).message}`);
    }
  }
  if (falhas.length === comCnpj.length) throw new HttpError(502, falhas.join(" | "));
  avisos.push(...falhas);
  return total;
}

async function sincronizarCnpj(db: SupabaseClient, cnpj: string, unidadeId: string, codigo: string) {
  // a matriz continua usando a chave antiga, para não buscar tudo de novo
  const chave = codigo === "SC" ? "nfe_recebidas_versao" : `nfe_recebidas_versao_${codigo}`;
  const { data: estado } = await db.from("sync_estado").select("valor").eq("chave", chave).maybeSingle();
  let versao = Number(estado?.valor ?? 0);
  let processadas = 0;

  for (let pagina = 0; pagina < 50; pagina++) {
    const res = await focus(`/v2/nfes_recebidas?cnpj=${cnpj}&versao=${versao}`, {}, codigo, { recebidas: true });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // a Focus às vezes responde 400/422 para token de outra empresa ("CNPJ do emitente não autorizado")
      if (res.status === 401 || res.status === 403 || /cnpj|token/i.test(String(err?.mensagem ?? ""))) throw erroDeToken(err, codigo, { recebidas: true });
      throw new HttpError(502, err.mensagem || `Focus NFe HTTP ${res.status}`);
    }
    const lista = (await res.json()) as RecebidaFocus[];
    if (!lista.length) break;

    for (const n of lista) if (await salvarRecebida(db, n, unidadeId)) processadas++;

    const maior = Math.max(...lista.map((n) => Number(n.versao)));
    const maxHeader = Number(res.headers.get("X-Max-Version") ?? 0);
    if (maior <= versao) break;
    versao = maior;
    if (maxHeader && versao >= maxHeader) break;
  }

  await db.from("sync_estado").upsert({
    chave, valor: String(versao), updated_at: new Date().toISOString(),
  });
  return processadas;
}

/**
 * Importa uma NF-e de compra pelo XML (arquivo enviado na tela ou anexo de e-mail).
 * A nota entra no mesmo fluxo das que vêm da SEFAZ: contas a pagar e entrada no estoque.
 * A emitida antes de configuracoes.recebidas_processar_desde fica só como histórico.
 */
export async function importarXml(db: SupabaseClient, xml: string) {
  if (!xml.includes("<infNFe")) throw new HttpError(400, "o arquivo não é o XML de uma NF-e");
  let cab;
  try { cab = lerCabecalho(xml); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const unidadeId = await unidadePorCnpj(db, cab.destinatario_cnpj);
  if (!unidadeId) {
    throw new HttpError(400, `esta nota não é para a MF (destinatário ${cab.destinatario_cnpj ?? "sem CNPJ"}). Confira o CNPJ das unidades.`);
  }
  const { data: existente } = await db.from("nfe_recebidas").select("id, estoque_lancado, xml").eq("chave", cab.chave).maybeSingle();
  if (existente?.estoque_lancado) return { id: existente.id, ja_existia: true };
  await salvarRecebida(db, {
    chave_nfe: cab.chave, nome_emitente: cab.emitente_nome, documento_emitente: cab.emitente_cnpj,
    valor_total: cab.valor_total, data_emissao: cab.data_emissao ?? new Date().toISOString(),
    situacao: cab.situacao === "cancelada" ? "cancelada" : "autorizada", manifestacao_destinatario: null, nfe_completa: true,
  }, unidadeId);
  // importar de novo uma nota excluída traz ela de volta
  const { data: nfe } = await db.from("nfe_recebidas")
    .update({ xml, ...(existente ? {} : { origem: "xml" }), processamento: "pendente", tentativas: 0, excluida_em: null, excluida_por: null, excluida_motivo: null })
    .eq("chave", cab.chave).select("*").single();
  const { data: cfg } = await db.from("configuracoes").select(CONFIG_RECEBIDAS).eq("id", 1).single();
  if (nfe && cfg) await processarNota(db, nfe, cfg);
  return { id: nfe?.id as string, ja_existia: !!existente, numero: cab.numero, emitente: cab.emitente_nome };
}
