// NF-e de devolução: prévia (o que pode ser devolvido) e emissão, a partir de uma nota emitida
// (devolução de venda) ou de uma nota de fornecedor (devolução de compra).
// A montagem dos itens e dos impostos fica em nfe-devolucao.ts (sem dependências, testável).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError, onlyDigits } from "./supabase.ts";
import { focusProducao } from "./focusnfe.ts";
import { configIbsCbs, emitir, exigirEmitente } from "./nfe-emissao.ts";
import { baixarXml, vincularItens } from "./nfe-recebidas.ts";
import {
  camposDestinatario, cfopDevolucao, CFOPS_DEVOLUCAO_COMPRA, destinatarioDoPayload, faltasDestinatario, type ItemOriginal,
  itensDevolucao, itensDoPayload, lerNotaCompleta, type NotaOriginal, type Participante, type TipoDevolucao,
} from "./nfe-devolucao.ts";

export type Origem = { tipo: "emitida" | "recebida"; id: string };
export type Escolha = { numero: number; quantidade: number; cfop?: string | null; produto_id?: string | null };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const VALIDAS = ["autorizada", "processando", "contingencia"];

type Carregada = {
  tipo: TipoDevolucao; original: NotaOriginal; destinatario: Participante; unidade: any;
  ref: { nota_referenciada_id?: string; nfe_recebida_id?: string };
  cliente_id: string | null; fornecedor_id: string | null; ambienteOriginal: string;
  produtos: Map<number, { produto_id: string | null; nome: string | null; fator: number; tipo: string | null; kit: boolean }>;
};

/** Carrega a nota original (payload do ERP ou XML) e liga os itens aos produtos. */
async function carregar(db: SupabaseClient, origem: Origem): Promise<Carregada> {
  const { data: produtos } = await db.from("produtos").select("id, sku, descricao, tipo, kit");
  const porSku = new Map((produtos ?? []).filter((p: any) => p.sku).map((p: any) => [String(p.sku).trim().toUpperCase(), p]));
  const porId = (codigo: string) => (produtos ?? []).find((p: any) => codigo.length >= 8 && p.id.startsWith(codigo.toLowerCase()));

  if (origem.tipo === "emitida") {
    const { data: n } = await db.from("notas_fiscais").select("*, pedido:pedidos(cliente_id, itens:pedido_itens(produto_id, descricao))").eq("id", origem.id).maybeSingle();
    if (!n || n.excluida_em) throw new HttpError(404, "nota não encontrada");
    if (n.status !== "autorizada") throw new HttpError(400, "só nota autorizada tem devolução");
    if (n.finalidade !== "normal" || n.tipo_operacao !== "saida") throw new HttpError(400, "a devolução é feita sobre a nota de venda (saída) original");
    let original: NotaOriginal;
    let destinatario: Participante;
    if (n.origem === "importada") {
      const { data: x } = await db.from("notas_fiscais_xml").select("xml").eq("nota_id", n.id).maybeSingle();
      if (!x?.xml) throw new HttpError(422, "XML da nota importada não encontrado");
      original = lerNotaCompleta(x.xml);
      destinatario = original.destinatario;
    } else {
      if (!n.payload?.items?.length || !n.chave) throw new HttpError(422, "a nota não tem os itens enviados à SEFAZ");
      destinatario = destinatarioDoPayload(n.payload);
      original = {
        chave: n.chave, numero: String(n.numero ?? ""), serie: String(n.serie ?? ""), data: n.created_at,
        emitente: destinatario, destinatario, itens: itensDoPayload(n.payload),
      };
    }
    const { data: unidade } = await db.from("unidades").select("*").eq("id", n.unidade_id).single();
    const mapa = new Map<number, any>();
    for (const i of original.itens) {
      const p: any = porSku.get(i.codigo.trim().toUpperCase()) ?? porId(i.codigo)
        ?? (n.pedido?.itens ?? []).map((x: any) => (produtos ?? []).find((pp: any) => pp.id === x.produto_id && i.descricao.startsWith(x.descricao))).find(Boolean);
      mapa.set(i.numero, { produto_id: p?.id ?? null, nome: p?.descricao ?? null, fator: 1, tipo: p?.tipo ?? null, kit: !!p?.kit });
    }
    return {
      tipo: "venda", original, destinatario, unidade, ref: { nota_referenciada_id: n.id },
      cliente_id: n.cliente_id ?? n.pedido?.cliente_id ?? null, fornecedor_id: null, ambienteOriginal: n.ambiente ?? "producao", produtos: mapa,
    };
  }

  const { data: r } = await db.from("nfe_recebidas").select("*").eq("id", origem.id).maybeSingle();
  if (!r || r.excluida_em) throw new HttpError(404, "nota não encontrada");
  if (r.situacao === "cancelada") throw new HttpError(400, "nota cancelada pelo fornecedor não tem devolução");
  const xml = r.xml || await baixarXml(db, r.chave);
  if (!xml) throw new HttpError(422, "XML da nota ainda não disponível: dê ciência da operação ou importe o XML");
  const original = lerNotaCompleta(xml);
  const unidadeId = r.unidade_id ?? (await db.from("unidades").select("id").eq("codigo", "SC").maybeSingle()).data?.id;
  const { data: unidade } = await db.from("unidades").select("*").eq("id", unidadeId).single();
  const vinc = await vincularItens(db, r.fornecedor_id, original.itens.map((i) => ({
    numero: i.numero, codigo: i.codigo, ean: i.ean, descricao: i.descricao, ncm: i.ncm, cfop: i.cfop, unidade: i.unidade,
    quantidade: i.quantidade, valor_unitario: i.valor_unitario, valor_total: i.valor_bruto,
  })));
  const mapa = new Map<number, any>();
  for (const v of vinc) {
    const p: any = (produtos ?? []).find((x: any) => x.id === v.produto_id);
    mapa.set(v.numero, { produto_id: v.produto_id, nome: p?.descricao ?? null, fator: v.fator || 1, tipo: p?.tipo ?? null, kit: !!p?.kit });
  }
  return {
    tipo: "compra", original, destinatario: original.emitente, unidade, ref: { nfe_recebida_id: r.id },
    cliente_id: null, fornecedor_id: r.fornecedor_id, ambienteOriginal: "producao", produtos: mapa,
  };
}

/** Quanto de cada item já foi devolvido (devoluções autorizadas ou em andamento). */
async function jaDevolvido(db: SupabaseClient, c: Carregada) {
  let q = db.from("notas_fiscais").select("devolucao_itens").eq("finalidade", "devolucao").in("status", VALIDAS).is("excluida_em", null);
  q = c.ref.nota_referenciada_id ? q.eq("nota_referenciada_id", c.ref.nota_referenciada_id) : q.eq("nfe_recebida_id", c.ref.nfe_recebida_id!);
  const { data } = await q;
  const soma = new Map<number, number>();
  for (const n of data ?? []) for (const i of (n.devolucao_itens ?? []) as any[]) soma.set(Number(i.numero), (soma.get(Number(i.numero)) ?? 0) + Number(i.quantidade));
  return soma;
}

const interestadual = (c: Carregada) => !!c.destinatario.uf && c.destinatario.uf !== String(c.unidade?.uf ?? "").toUpperCase();

function avisos(c: Carregada) {
  const a: string[] = [];
  if (c.tipo === "venda" && c.destinatario.doc.length === 14 && c.destinatario.indIEDest === 1) {
    a.push("O cliente é contribuinte do ICMS: normalmente é ele quem emite a NF de devolução (ela chega em NF-e recebidas). Emita esta só se ele não emitir a dele.");
  }
  if (c.ambienteOriginal === "homologacao" && focusProducao()) a.push("A nota original é de teste (homologação): ela não tem devolução em produção.");
  if (!focusProducao()) a.push("Emissão em homologação (teste): a devolução sai sem valor fiscal e não mexe no estoque.");
  const semProduto = [...c.produtos.values()].filter((p) => !p.produto_id).length;
  if (semProduto) a.push(`${semProduto} item(ns) sem produto ligado: a nota sai normalmente, mas o estoque desses itens não muda.`);
  if ([...c.produtos.values()].some((p) => p.kit)) a.push("Item de kit: o estoque dos componentes não é ajustado sozinho; lance à mão se voltaram.");
  return a;
}

export async function previaDevolucao(db: SupabaseClient, origem: Origem) {
  const c = await carregar(db, origem);
  const devolvido = await jaDevolvido(db, c);
  const inter = interestadual(c);
  return {
    tipo: c.tipo,
    original: { numero: c.original.numero, serie: c.original.serie, chave: c.original.chave, data: c.original.data },
    destinatario: c.destinatario,
    faltas: faltasDestinatario(c.destinatario),
    avisos: avisos(c),
    interestadual: inter,
    cfops: c.tipo === "compra" ? CFOPS_DEVOLUCAO_COMPRA.map(([s, d]) => ({ cfop: (inter ? "6" : "5") + s, descricao: d })) : [],
    itens: c.original.itens.map((i: ItemOriginal) => {
      const p = c.produtos.get(i.numero);
      const ja = devolvido.get(i.numero) ?? 0;
      return {
        numero: i.numero, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, devolvida: ja,
        disponivel: Math.max(0, r2(i.quantidade - ja)), valor_unitario: i.valor_unitario, cfop_original: i.cfop,
        cfop: cfopDevolucao(i.cfop, c.tipo, inter, p?.tipo), produto_id: p?.produto_id ?? null, produto_nome: p?.nome ?? null,
        fator: p?.fator ?? 1, kit: !!p?.kit,
      };
    }),
  };
}

export async function emitirDevolucao(db: SupabaseClient, origem: Origem, escolhas: Escolha[], motivo: string) {
  const texto = String(motivo ?? "").trim();
  if (texto.length < 15) throw new HttpError(400, "descreva o motivo da devolução (mínimo 15 caracteres): ele vai na nota");
  const sel = (escolhas ?? []).filter((e) => Number(e.quantidade) > 0);
  if (!sel.length) throw new HttpError(400, "escolha ao menos um item e a quantidade devolvida");
  const c = await carregar(db, origem);
  if (c.ambienteOriginal === "homologacao" && focusProducao()) throw new HttpError(400, "nota de teste (homologação) não tem devolução em produção");
  exigirEmitente(c.unidade);
  const faltas = faltasDestinatario(c.destinatario);
  if (faltas.length) throw new HttpError(400, `dados do ${c.tipo === "venda" ? "cliente" : "fornecedor"} na nota original incompletos: ${faltas.join(", ")}`);

  const devolvido = await jaDevolvido(db, c);
  for (const e of sel) {
    const o = c.original.itens.find((i) => i.numero === Number(e.numero));
    if (!o) throw new HttpError(400, `item ${e.numero} não existe na nota original`);
    const resta = r2(o.quantidade - (devolvido.get(o.numero) ?? 0));
    if (Number(e.quantidade) > resta + 1e-9) throw new HttpError(400, `${o.descricao}: só restam ${resta} para devolver`);
  }

  const inter = interestadual(c);
  const { data: cfg } = await db.from("configuracoes").select("*").eq("id", 1).single();
  const tiposProduto = Object.fromEntries([...c.produtos].map(([k, v]) => [k, v.tipo]));
  let items;
  try {
    items = itensDevolucao(c.original.itens, sel.map((e) => ({ numero: Number(e.numero), quantidade: Number(e.quantidade), cfop: e.cfop })),
      { tipo: c.tipo, interestadual: inter, unidade: c.unidade, ibsCbs: configIbsCbs(cfg), tiposProduto });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }

  const total = c.original.itens.every((i) => sel.some((e) => Number(e.numero) === i.numero && Math.abs(Number(e.quantidade) - (i.quantidade - (devolvido.get(i.numero) ?? 0))) < 1e-9));
  const data = c.original.data ? c.original.data.slice(0, 10).split("-").reverse().join("/") : "";
  const payload = {
    natureza_operacao: c.tipo === "venda" ? "Devolução de venda" : "Devolução de compra",
    data_emissao: new Date().toISOString(),
    tipo_documento: c.tipo === "venda" ? 0 : 1,
    finalidade_emissao: 4,
    local_destino: inter ? 2 : 1,
    consumidor_final: c.tipo === "venda" && c.destinatario.indIEDest !== 1 ? 1 : 0,
    presenca_comprador: 9,
    cnpj_emitente: onlyDigits(c.unidade.cnpj),
    ...camposDestinatario(c.destinatario),
    modalidade_frete: 9,
    notas_referenciadas: [{ chave_nfe: c.original.chave }],
    informacoes_adicionais_contribuinte:
      `Devolução ${total ? "total" : "parcial"} referente à NF-e ${c.original.numero}${c.original.serie ? `/${c.original.serie}` : ""}${data ? ` de ${data}` : ""}, chave ${c.original.chave}. Motivo: ${texto}`.slice(0, 2000),
    items,
  };

  // referência nova a cada tentativa
  const { count } = await db.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("finalidade", "devolucao")
    .eq(c.ref.nota_referenciada_id ? "nota_referenciada_id" : "nfe_recebida_id", (c.ref.nota_referenciada_id ?? c.ref.nfe_recebida_id)!);
  const base = `devolucao-${c.tipo}-${c.original.numero || c.original.chave.slice(25, 34)}`;
  let referencia = `${base}-${(count ?? 0) + 1}`;
  for (let k = (count ?? 0) + 2; (await db.from("notas_fiscais").select("id").eq("referencia", referencia).maybeSingle()).data; k++) referencia = `${base}-${k}`;

  const valor = r2(items.reduce((s: number, i: any) => s + Number(i.valor_bruto) - Number(i.valor_desconto ?? 0) + Number(i.valor_frete ?? 0)
    + Number(i.valor_seguro ?? 0) + Number(i.valor_outras_despesas ?? 0) + Number(i.valor_ipi_devolvido ?? 0) + Number(i.icms_valor_st ?? 0), 0));
  const { data: marc } = await db.from("marcadores").select("id").ilike("nome", "devolução").maybeSingle();
  const res = await emitir(db, referencia, payload, {
    unidade_id: c.unidade.id, valor_total: valor, finalidade: "devolucao", tipo_operacao: c.tipo === "venda" ? "entrada" : "saida",
    ...c.ref, chave_referenciada: c.original.chave, cliente_id: c.cliente_id, fornecedor_id: c.fornecedor_id,
    destinatario_nome: c.destinatario.nome, destinatario_doc: c.destinatario.doc,
    devolucao_itens: sel.map((e) => {
      const p = c.produtos.get(Number(e.numero));
      const produto = e.produto_id !== undefined ? e.produto_id : p?.produto_id ?? null;
      return { numero: Number(e.numero), produto_id: p?.kit && e.produto_id === undefined ? null : produto, quantidade: Number(e.quantidade),
        quantidade_estoque: r2(Number(e.quantidade) * (produto === p?.produto_id ? p?.fator ?? 1 : 1)) };
    }),
    marcadores: marc?.id ? [marc.id] : [],
  });
  // a nota original também fica marcada como "Devolução"
  if (marc?.id) {
    const tabela = c.ref.nota_referenciada_id ? "notas_fiscais" : "nfe_recebidas";
    const id = (c.ref.nota_referenciada_id ?? c.ref.nfe_recebida_id)!;
    const { data: o } = await db.from(tabela).select("marcadores").eq("id", id).single();
    if (o && !(o.marcadores ?? []).includes(marc.id)) await db.from(tabela).update({ marcadores: [...(o.marcadores ?? []), marc.id] }).eq("id", id);
  }
  return res;
}
