// Mercado Livre: anúncios novos para os produtos da loja que ainda não estão lá (tabela ml_propostas).
//  prepararAnuncios: para cada produto da loja sem anúncio acha a categoria (domain_discovery), preenche os atributos
//    que o ERP sabe, consulta a tarifa (listing_prices) e o frete grátis (shipping_options/free), calcula o preço que
//    deixa o mesmo valor da loja e pede ao Mercado Livre para conferir (items/validate). Não publica nada.
//  publicarAnuncios: publica só as propostas escolhidas na tela (POST /items e a descrição) e liga o anúncio ao
//    produto; dali em diante o estoque segue pelo envio de estoque e preço.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { chamarML, ErroML } from "../_shared/mercadolivre.ts";
import { anunciosDoItem, estoqueDisponivel } from "../_shared/ml-anuncios.ts";
import { atributosDoProduto, FRETE_GRATIS_DESDE, medidasFrete, precoParaReceber, tituloML, type AtributoCategoria, type ProdutoNovo } from "../_shared/ml-novos.ts";

type Conta = { id: string; ml_user_id: number; estoque_seguranca?: unknown; estoque_maximo?: unknown };
type Produto = ProdutoNovo & {
  id: string; preco_venda: number; preco_custo: number | null; foto_caminho: string; descricao_anuncio: string | null;
  descricao_catalogo: string | null; garantia_meses: number | null; tipo: string;
};

const TIPO_ANUNCIO = "gold_special"; // Clássico
const LIMITE_MS = 100_000;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Repete quando o Mercado Livre pede calma (429): 1, 2, 4 e 8 segundos. */
async function ml<T = any>(caminho: string, token: string, init: Parameters<typeof chamarML>[2] = {}): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await chamarML<T>(caminho, token, init); } catch (e) {
      if (e instanceof ErroML && (e.status === 429 || /rate_limit/i.test(e.message)) && i < 4) { await pausa(1000 * 2 ** i); continue; }
      throw e;
    }
  }
}

/** Categoria sugerida pelo Mercado Livre: primeiro pelo nome da peça + "máquina de sorvete", depois pelo título. */
async function categoria(token: string, p: Produto, titulo: string) {
  const nome = String(p.descricao ?? "").split(/\s+[-–]\s+|\(|,/)[0].trim();
  const tentativas = [...new Set([/sorvete/i.test(nome) ? nome : `${nome} máquina de sorvete`, titulo, nome].filter((q) => q.length >= 3))];
  for (const q of tentativas) {
    const r = await ml<any[]>(`/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(q)}`, token).catch(() => []);
    if (Array.isArray(r) && r[0]?.category_id) return r[0];
  }
  return null;
}

const urlFoto = (caminho: string) =>
  /^https?:\/\//.test(caminho) ? caminho : `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/produtos-fotos/${caminho}`;

/** Produtos da loja (ativos, no catálogo, com foto e preço) que não têm anúncio no Mercado Livre, direto ou por kit. */
async function produtosSemAnuncio(db: SupabaseClient, ids?: string[]) {
  let q = db.from("produtos").select("id, sku, descricao, tipo, titulo_anuncio, marca, modelo, codigo_fabricante, codigo_barras, gtin_isento, peso_kg, altura_cm, largura_cm, profundidade_cm, preco_venda, preco_custo, foto_caminho, descricao_anuncio, descricao_catalogo, garantia_meses")
    .eq("ativo", true).eq("no_catalogo", true).not("foto_caminho", "is", null).gt("preco_venda", 0);
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const { data: anuncios } = await db.from("ml_anuncios").select("produto_id").not("produto_id", "is", null);
  const ligados = new Set((anuncios ?? []).map((a: { produto_id: string }) => a.produto_id));
  const { data: kits } = ligados.size ? await db.from("kit_componentes").select("kit_id, componente_id").in("kit_id", [...ligados]) : { data: [] };
  for (const k of (kits ?? []) as { kit_id: string; componente_id: string }[]) ligados.add(k.componente_id);
  const { data: feitas } = await db.from("ml_propostas").select("produto_id").in("situacao", ["publicada", "publicando"]);
  for (const f of (feitas ?? []) as { produto_id: string }[]) ligados.add(f.produto_id);
  return ((data ?? []) as Produto[]).filter((p) => !ligados.has(p.id));
}

/** Estoque que o anúncio pode mostrar (o mesmo cálculo do envio: saldo da unidade − segurança, até o máximo). */
async function estoques(db: SupabaseClient, conta: Conta, ids: string[]) {
  const { data: u } = await db.from("ml_contas").select("unidade_id").eq("id", conta.id).maybeSingle();
  const { data } = ids.length && u?.unidade_id
    ? await db.from("estoque_unidade").select("produto_id, quantidade").eq("unidade_id", u.unidade_id).in("produto_id", ids)
    : { data: [] };
  const saldo = new Map(((data ?? []) as { produto_id: string; quantidade: number }[]).map((e) => [e.produto_id, num(e.quantidade)]));
  return (id: string) => estoqueDisponivel({ saldo: saldo.get(id) ?? 0, seguranca: conta.estoque_seguranca as number, maximo: conta.estoque_maximo as number });
}

function textoDescricao(p: Produto) {
  const base = (p.descricao_anuncio || p.descricao_catalogo || p.descricao || "").trim();
  const garantia = p.garantia_meses ? `\n\nGarantia de ${p.garantia_meses} ${p.garantia_meses === 1 ? "mês" : "meses"}.` : "";
  return `${base}${garantia}`.replace(/<[^>]+>/g, "").slice(0, 49_000);
}

async function prepararUm(db: SupabaseClient, conta: Conta, token: string, p: Produto, estoque: number) {
  const avisos: string[] = [];
  const faltando: string[] = [];
  const titulo = tituloML(p.titulo_anuncio || p.descricao);
  const cat = await categoria(token, p, titulo);
  if (!cat?.category_id) throw new Error("o Mercado Livre não sugeriu uma categoria para o título");
  const attrsCat = await ml<AtributoCategoria[]>(`/categories/${cat.category_id}/attributes`, token).catch(() => [] as AtributoCategoria[]);
  const { atributos, faltando: obrigatorios } = atributosDoProduto(p, Array.isArray(attrsCat) ? attrsCat : []);
  faltando.push(...obrigatorios);
  if (!p.marca && !faltando.includes("Marca")) faltando.push("Marca");

  const alvo = num(p.preco_venda);
  // tarifa da categoria (% do Clássico)
  const lp = await ml<any>(`/sites/MLB/listing_prices?price=${Math.max(alvo * 1.15, 1).toFixed(2)}&listing_type_id=${TIPO_ANUNCIO}&category_id=${cat.category_id}`, token).catch(() => null);
  const det = (Array.isArray(lp) ? lp[0] : lp)?.sale_fee_details ?? {};
  let pct = num(det.percentage_fee ?? det.meli_percentage_fee);
  if (!(pct > 0)) { pct = 14; avisos.push("tarifa do Mercado Livre estimada em 14%"); }
  // frete grátis que a MF paga (a partir de R$ 79)
  const med = medidasFrete(p);
  if (med.estimado) avisos.push("sem peso ou medidas no cadastro: frete estimado com uma caixa média");
  const fr = await ml<any>(`/users/${conta.ml_user_id}/shipping_options/free?dimensions=${med.texto}&verbose=true&item_price=${Math.max(alvo * 1.3, FRETE_GRATIS_DESDE).toFixed(2)}&listing_type_id=${TIPO_ANUNCIO}&mode=me2&condition=new&logistic_type=drop_off`, token).catch((e) => { avisos.push(`frete não consultado (${msg(e).slice(0, 80)})`); return null; });
  const frete = num(fr?.coverage?.all_country?.list_cost);
  const preco = precoParaReceber(alvo, pct, frete);
  if (num(p.preco_custo) > 0 && alvo < num(p.preco_custo)) avisos.push("preço da loja abaixo do custo");
  if (estoque < 1) faltando.push("Estoque disponível para o anúncio (saldo menos a segurança)");

  const item: Record<string, unknown> = {
    title: titulo, family_name: titulo, category_id: cat.category_id, price: preco, currency_id: "BRL", available_quantity: Math.max(1, estoque),
    buying_mode: "buy_it_now", listing_type_id: TIPO_ANUNCIO, condition: "new",
    pictures: [{ source: urlFoto(p.foto_caminho) }], attributes: atributos,
    shipping: { mode: "me2", free_shipping: preco >= FRETE_GRATIS_DESDE, local_pick_up: false },
    sale_terms: p.garantia_meses
      ? [{ id: "WARRANTY_TYPE", value_name: "Garantia do vendedor" }, { id: "WARRANTY_TIME", value_name: `${p.garantia_meses} meses` }]
      : [],
  };
  // o Mercado Livre confere tudo sem publicar. Conta no modelo novo (family_name) pode recusar o "title": tira e confere de novo
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      await ml("/items/validate", token, { method: "POST", body: JSON.stringify(item), cabecalhos: { "Content-Type": "application/json" } });
      break;
    } catch (e) {
      // campo que a conta não aceita ("The fields [title] are invalid"): tira e confere de novo
      const recusados = e instanceof ErroML ? (/fields?\s*\[([^\]]+)\]\s*(are|is) invalid/i.exec(e.message)?.[1] ?? "").split(/\s*,\s*/) : [];
      const tirar = recusados.filter((c) => (c === "title" || c === "family_name") && c in item);
      if (tirar.length && tentativa < 2) { for (const c of tirar) delete item[c]; continue; }
      if (e instanceof ErroML && e.status >= 400 && e.status < 500) faltando.push(`Mercado Livre: ${msg(e)}`);
      else avisos.push(`conferência do Mercado Livre não respondeu (${msg(e).slice(0, 80)})`);
      break;
    }
  }
  const linha = {
    produto_id: p.id, categoria_id: cat.category_id, categoria_nome: cat.category_name ?? cat.domain_name ?? null, tipo_anuncio: TIPO_ANUNCIO,
    titulo, preco_loja: alvo, custo: num(p.preco_custo) || null, preco_sugerido: preco, preco, tarifa_pct: pct,
    tarifa_fixa: null, frete_gratis: frete || null, estoque, corpo: { item, descricao: textoDescricao(p) },
    faltando: [...new Set(faltando)], avisos, situacao: "proposta", erro: null, preparado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
  };
  const { error } = await db.from("ml_propostas").upsert(linha, { onConflict: "produto_id" });
  if (error) throw new Error(error.message);
  return linha;
}

export async function prepararAnuncios(db: SupabaseClient, conta: Conta, token: string, ids?: string[]) {
  const comeco = Date.now();
  const produtos = await produtosSemAnuncio(db, ids);
  const estoque = await estoques(db, conta, produtos.map((p) => p.id));
  const resumo = { produtos: produtos.length, preparados: 0, prontos: 0, com_pendencia: 0, erros: 0, faltam: 0 };
  let i = 0;
  for (; i < produtos.length && Date.now() - comeco < LIMITE_MS; i += 3) {
    await Promise.all(produtos.slice(i, i + 3).map(async (p) => {
      try {
        const l = await prepararUm(db, conta, token, p, estoque(p.id));
        resumo.preparados++;
        if (l.faltando.length) resumo.com_pendencia++; else resumo.prontos++;
      } catch (e) {
        resumo.erros++;
        await db.from("ml_propostas").upsert({ produto_id: p.id, titulo: tituloML(p.titulo_anuncio || p.descricao), preco_loja: p.preco_venda, situacao: "erro", erro: msg(e), faltando: [], avisos: [], atualizado_em: new Date().toISOString() }, { onConflict: "produto_id" });
      }
    }));
  }
  resumo.faltam = Math.max(0, produtos.length - i);
  return resumo;
}

export async function publicarAnuncios(db: SupabaseClient, conta: Conta, token: string, ids: unknown, userId: string) {
  const lista = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 60);
  if (!lista.length) throw new Error("escolha os anúncios para publicar");
  const { data } = await db.from("ml_propostas").select("*").in("id", lista).in("situacao", ["proposta", "erro"]);
  const resumo = { publicados: 0, erros: 0, pulados: 0, itens: [] as string[] };
  const comeco = Date.now();
  for (const pr of (data ?? []) as any[]) {
    if (Date.now() - comeco > LIMITE_MS) break;
    if ((pr.faltando ?? []).length || !pr.corpo?.item || !(num(pr.preco) > 0)) { resumo.pulados++; continue; }
    await db.from("ml_propostas").update({ situacao: "publicando", atualizado_em: new Date().toISOString() }).eq("id", pr.id);
    try {
      const corpo = { ...pr.corpo.item, price: num(pr.preco), shipping: { ...(pr.corpo.item.shipping ?? {}), free_shipping: num(pr.preco) >= FRETE_GRATIS_DESDE } };
      const item = await ml<any>("/items", token, { method: "POST", body: JSON.stringify(corpo), cabecalhos: { "Content-Type": "application/json" } });
      const avisos = [...(pr.avisos ?? [])];
      if (pr.corpo.descricao) {
        await chamarML(`/items/${item.id}/description`, token, { method: "POST", body: JSON.stringify({ plain_text: pr.corpo.descricao }), cabecalhos: { "Content-Type": "application/json" } })
          .catch((e) => avisos.push(`descrição não foi: ${msg(e).slice(0, 120)}`));
      }
      await db.rpc("ml_registrar_anuncios", { p: anunciosDoItem(item) });
      // sem SKU igual no cadastro: liga direto ao produto da proposta
      await db.from("ml_anuncios").update({ produto_id: pr.produto_id, ligado_em: new Date().toISOString() }).eq("ml_item_id", item.id).is("produto_id", null);
      await db.from("ml_propostas").update({
        situacao: "publicada", ml_item_id: item.id, erro: null, avisos, publicado_em: new Date().toISOString(), publicado_por: userId, atualizado_em: new Date().toISOString(),
      }).eq("id", pr.id);
      resumo.publicados++;
      resumo.itens.push(String(item.id));
    } catch (e) {
      resumo.erros++;
      await db.from("ml_propostas").update({ situacao: "erro", erro: msg(e), atualizado_em: new Date().toISOString() }).eq("id", pr.id);
    }
  }
  return resumo;
}
