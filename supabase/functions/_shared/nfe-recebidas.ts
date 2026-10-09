// NF-e recebidas de fornecedores: gravação, XML, contas a pagar e processamento automático.
// Usado pela sincronização (nfe-recebidas-sync), pelo gatilho da Focus (focus-webhook)
// e pelo agendamento (nfe-processar).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError, onlyDigits } from "./supabase.ts";
import { codigoUnidade, erroDeToken, focus, focusJson, recebidasDisponiveis } from "./focusnfe.ts";
import { type Duplicata, type ItemNota, lerCabecalho, lerNfe } from "./nfe-xml.ts";

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
  return lido;
}

/** Lança as duplicatas da nota em contas a pagar (ou parcela única no vencimento informado). */
export async function lancarContaPagar(db: SupabaseClient, nfe: any, duplicatas: Duplicata[], vencimentoPadrao?: string) {
  if (nfe.conta_pagar_id) return 0;
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

/** Vincula os itens da nota a produtos: 1º pelo de-para do fornecedor, 2º pelo código de barras (EAN). */
export async function vincularItens(db: SupabaseClient, fornecedorId: string | null, itens: ItemNota[]) {
  const { data: vinculos } = fornecedorId
    ? await db.from("produto_fornecedor").select("codigo_fornecedor, produto_id, fator_conversao").eq("fornecedor_id", fornecedorId)
    : { data: [] as any[] };
  const porCodigo = new Map((vinculos ?? []).map((v: any) => [v.codigo_fornecedor, v]));

  const eans = itens.map((i) => i.ean).filter(Boolean) as string[];
  const { data: porEan } = eans.length
    ? await db.from("produtos").select("id, codigo_barras").in("codigo_barras", eans).eq("ativo", true)
    : { data: [] as any[] };
  const mapaEan = new Map((porEan ?? []).map((p: any) => [p.codigo_barras, p.id]));

  return itens.map((i) => {
    const v = porCodigo.get(i.codigo);
    return {
      ...i,
      produto_id: (v?.produto_id ?? (i.ean ? mapaEan.get(i.ean) : null) ?? null) as string | null,
      fator: Number(v?.fator_conversao ?? 1),
    };
  });
}

// Compra para revenda/industrialização/uso (vendas do fornecedor: 51xx, 54xx, 61xx, 64xx, 71xx).
// Outras operações (remessa p/ conserto, demonstração, comodato, devolução…) vão para revisão manual.
const CFOP_COMPRA = /^(51|54|61|64|71)/;

type Config = {
  entrada_automatica_estoque: boolean; conta_pagar_automatica: boolean;
  /** Notas de fornecedor emitidas antes desta data já foram lançadas no sistema anterior: não entram sozinhas. */
  recebidas_processar_desde?: string | null;
};
/** Campos de configuracoes usados no processamento automático. */
export const CONFIG_RECEBIDAS = "entrada_automatica_estoque, conta_pagar_automatica, recebidas_processar_desde";

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

    // A ciência libera o XML. Se já foi dada por fora (ex.: painel da Focus), a SEFAZ recusa a repetição: segue assim mesmo.
    if (!nfe.manifestacao && nfe.origem !== "xml") await manifestar(db, nfe.chave, "ciencia").catch(() => null);

    const lido = await carregarItens(db, nfe);
    if (!lido) return await marcar("aguardando_xml", "A SEFAZ ainda não liberou o XML. Nova tentativa automática em alguns minutos.");

    const naoCompra = [...new Set(lido.itens.map((i) => i.cfop ?? "").filter((c) => !CFOP_COMPRA.test(c)))];
    if (naoCompra.length) {
      return await marcar("revisao", `Não parece compra (CFOP ${naoCompra.join(", ")}). Ex.: remessa para conserto. Confira e lance manualmente se for o caso.`);
    }

    if (cfg.conta_pagar_automatica) await lancarContaPagar(db, nfe, lido.duplicatas);
    if (!cfg.entrada_automatica_estoque) return await marcar("aguardando_vinculo", "Entrada automática desligada em Configurações.");

    const itens = await vincularItens(db, nfe.fornecedor_id, lido.itens);
    const semVinculo = itens.filter((i) => !i.produto_id);
    if (semVinculo.length) {
      return await marcar("aguardando_vinculo",
        `${semVinculo.length} item(ns) sem produto vinculado: ${semVinculo.slice(0, 3).map((i) => i.descricao).join(", ")}` +
        (semVinculo.length > 3 ? "…" : "") + ". Vincule uma vez; nas próximas notas será automático.");
    }

    const { error } = await db.rpc("lancar_estoque_nfe_core", {
      p_nfe: nfe.id,
      p_itens: itens.map((i) => ({
        codigo: i.codigo, descricao: i.descricao, produto_id: i.produto_id,
        quantidade: i.quantidade, valor_unitario: i.valor_unitario, fator: i.fator, atualizar_custo: true,
      })),
    });
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
    // mostra o valor lido (não é segredo) para achar erro de digitação no secret
    const env = Deno.env.get("FOCUS_NFE_ENV");
    throw new HttpError(400, "As notas de fornecedores só existem no ambiente de produção da SEFAZ (a homologação não tem notas reais). " +
      `O ERP leu FOCUS_NFE_ENV = ${env === undefined ? "(não cadastrado)" : `"${env}"`}: para buscar, ele precisa ser "producao" ` +
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
      if (res.status === 401 || res.status === 403) throw erroDeToken(err, codigo, { recebidas: true });
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
  const { data: nfe } = await db.from("nfe_recebidas")
    .update({ xml, ...(existente ? {} : { origem: "xml" }), processamento: "pendente", tentativas: 0 })
    .eq("chave", cab.chave).select("*").single();
  const { data: cfg } = await db.from("configuracoes").select(CONFIG_RECEBIDAS).eq("id", 1).single();
  if (nfe && cfg) await processarNota(db, nfe, cfg);
  return { id: nfe?.id as string, ja_existia: !!existente, numero: cab.numero, emitente: cab.emitente_nome };
}
