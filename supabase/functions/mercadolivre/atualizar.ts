// Mercado Livre: atualiza os anúncios que já estão no ar com o cadastro do produto ligado: título (sem a marca
// My Frost), foto principal e descrição. Título só muda em anúncio sem venda (regra do Mercado Livre); se a conta
// não deixar mudar o título, vai só a foto e a descrição. Preço e estoque continuam pelo envio de estoque e preço.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { chamarML, ErroML } from "../_shared/mercadolivre.ts";
import { MARCA_PADRAO, semMyFrost, tituloML } from "../_shared/ml-novos.ts";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const urlFoto = (c: string) =>
  /^https?:\/\//.test(c) ? c : `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/produtos-fotos/${c}`;
const json = { "Content-Type": "application/json" };

type Linha = {
  ml_item_id: string;
  produtos: { descricao: string; titulo_anuncio: string | null; foto_caminho: string | null; descricao_anuncio: string | null;
    descricao_catalogo: string | null; garantia_meses: number | null } | null;
};

export async function atualizarAnuncios(db: SupabaseClient, token: string, itens?: unknown) {
  const filtro = (Array.isArray(itens) ? itens : []).map((x) => String(x ?? "").trim().toUpperCase()).filter((x) => /^[A-Z]{3}\d+$/.test(x));
  let q = db.from("ml_anuncios").select("ml_item_id, produtos:produtos(descricao, titulo_anuncio, foto_caminho, descricao_anuncio, descricao_catalogo, garantia_meses)")
    .not("produto_id", "is", null).eq("variation_id", "");
  if (filtro.length) q = q.in("ml_item_id", filtro);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const r = { atualizados: 0, sem_titulo: [] as string[], erros: [] as { id: string; erro: string }[] };
  const comeco = Date.now();
  for (const l of (data ?? []) as unknown as Linha[]) {
    if (Date.now() - comeco > 100_000) break;
    const p = l.produtos;
    if (!p) continue;
    try {
      const titulo = tituloML(semMyFrost(p.titulo_anuncio || p.descricao));
      const corpo: Record<string, unknown> = {};
      if (p.foto_caminho) corpo.pictures = [{ source: urlFoto(p.foto_caminho) }];
      const atual = await chamarML<any>(`/items/${l.ml_item_id}?attributes=title,sold_quantity`, token);
      const mudaTitulo = titulo && titulo !== atual?.title && !(Number(atual?.sold_quantity) > 0);
      try {
        await chamarML(`/items/${l.ml_item_id}`, token, { method: "PUT", body: JSON.stringify(mudaTitulo ? { ...corpo, title: titulo } : corpo), cabecalhos: json });
        if (!mudaTitulo && titulo !== atual?.title) r.sem_titulo.push(l.ml_item_id);
      } catch (e) {
        // conta no modelo novo (family_name) ou anúncio com venda: o título não muda; manda o resto
        if (!mudaTitulo || !(e instanceof ErroML) || !/title/i.test(e.message)) throw e;
        if (Object.keys(corpo).length) await chamarML(`/items/${l.ml_item_id}`, token, { method: "PUT", body: JSON.stringify(corpo), cabecalhos: json });
        r.sem_titulo.push(l.ml_item_id);
      }
      const base = semMyFrost(p.descricao_anuncio || p.descricao_catalogo || p.descricao);
      const garantia = p.garantia_meses ? `\n\nGarantia de ${p.garantia_meses} ${p.garantia_meses === 1 ? "mês" : "meses"}.` : "";
      if (base) {
        await chamarML(`/items/${l.ml_item_id}/description`, token, { method: "PUT", body: JSON.stringify({ plain_text: `${base}${garantia}`.replace(/<[^>]+>/g, "") }), cabecalhos: json })
          .catch((e) => r.erros.push({ id: l.ml_item_id, erro: `descrição: ${msg(e)}` }));
      }
      await db.from("ml_anuncios").update({ titulo: mudaTitulo ? titulo : atual?.title ?? undefined }).eq("ml_item_id", l.ml_item_id);
      r.atualizados++;
      await pausa(200);
    } catch (e) {
      if (e instanceof ErroML && e.status === 401) throw e;
      r.erros.push({ id: l.ml_item_id, erro: msg(e) });
    }
  }
  return r;
}

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Fotos de produto que ainda são link externo (ex.: exportadas do Canva para a loja e os anúncios): copia para o
 * ERP (bucket produtos-fotos) antes que o link vença. O mesmo que a função produtos-fotos faz pela tela.
 */
export async function copiarFotos(db: SupabaseClient) {
  const { data } = await db.from("produtos").select("id, foto_caminho").like("foto_caminho", "https://%").limit(25);
  const r = { copiadas: 0, falharam: 0 };
  for (const p of (data ?? []) as { id: string; foto_caminho: string }[]) {
    try {
      const resp = await fetch(p.foto_caminho, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      const tipo = (resp.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!resp.ok || !TIPOS[tipo]) throw new Error(`resposta ${resp.status} ${tipo}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("foto maior que 5 MB");
      const caminho = `${crypto.randomUUID()}.${TIPOS[tipo]}`;
      const { error } = await db.storage.from("produtos-fotos").upload(caminho, bytes, { contentType: tipo });
      if (error) throw error;
      await db.from("produtos").update({ foto_caminho: caminho }).eq("id", p.id).eq("foto_caminho", p.foto_caminho);
      r.copiadas++;
    } catch (e) {
      console.warn("mercadolivre: foto", p.id, msg(e));
      r.falharam++;
    }
  }
  return r;
}

/**
 * Anúncio com título que não pode mais mudar (modelo novo do Mercado Livre): publica um igual (preço, estoque, fotos,
 * atributos, envio) com o título do cadastro sem a marca, liga ao mesmo produto e só depois fecha o antigo.
 */
export async function republicarAnuncios(db: SupabaseClient, token: string, itens: unknown) {
  const ids = [...new Set((Array.isArray(itens) ? itens : []).map((x) => String(x ?? "").trim().toUpperCase()).filter((x) => /^[A-Z]{3}\d+$/.test(x)))].slice(0, 20);
  if (!ids.length) throw new Error("escolha os anúncios para publicar de novo");
  const r = { republicados: [] as { antigo: string; novo: string; titulo: string }[], erros: [] as { id: string; erro: string }[] };
  for (const id of ids) {
    try {
      const { data: liga } = await db.from("ml_anuncios").select("id, produto_id, produtos:produtos(descricao, titulo_anuncio)").eq("ml_item_id", id).eq("variation_id", "").maybeSingle();
      const prod = (liga as any)?.produtos;
      if (!liga?.produto_id || !prod) throw new Error("anúncio sem produto ligado");
      const velho = await chamarML<any>(`/items/${id}`, token);
      if (Number(velho?.sold_quantity) > 0) throw new Error("anúncio com venda: não fecho");
      const titulo = tituloML(semMyFrost(prod.titulo_anuncio || prod.descricao));
      const attrs = (velho.attributes ?? []).filter((a: any) => a?.id && (a.value_id || a.value_name))
        .map((a: any) => (a.value_id && !/my\s*frost/i.test(String(a.value_name ?? "")) ? { id: a.id, value_id: a.value_id } : { id: a.id, value_name: semMyFrost(a.value_name) }))
        .filter((a: any) => a.value_id || a.value_name);
      // marca: a do anúncio sem "My Frost"; sem ela, a padrão
      const marca = attrs.find((a: any) => a.id === "BRAND");
      if (!marca) attrs.push({ id: "BRAND", value_name: MARCA_PADRAO });
      const corpo: Record<string, unknown> = {
        title: titulo, family_name: titulo, category_id: velho.category_id, price: velho.price, currency_id: velho.currency_id ?? "BRL",
        available_quantity: Math.max(1, Number(velho.available_quantity) || 1), buying_mode: velho.buying_mode ?? "buy_it_now",
        listing_type_id: velho.listing_type_id, condition: velho.condition ?? "new",
        pictures: (velho.pictures ?? []).map((p: any) => ({ source: p.secure_url || p.url })).filter((p: any) => p.source),
        attributes: attrs, sale_terms: velho.sale_terms ?? [],
        shipping: { mode: velho.shipping?.mode, free_shipping: !!velho.shipping?.free_shipping, local_pick_up: false },
      };
      let novo: any = null;
      for (let t = 0; t < 3 && !novo; t++) {
        try {
          novo = await chamarML<any>("/items", token, { method: "POST", body: JSON.stringify(corpo), cabecalhos: json });
        } catch (e) {
          const campos = e instanceof ErroML ? (/fields?\s*\[([^\]]+)\]\s*(are|is) invalid/i.exec(e.message)?.[1] ?? "").split(/\s*,\s*/) : [];
          const tirar = campos.filter((c) => c === "title" || c === "family_name");
          if (!tirar.length) throw e;
          for (const c of tirar) delete corpo[c];
        }
      }
      const desc = await chamarML<any>(`/items/${id}/description`, token).catch(() => null);
      if (desc?.plain_text) {
        await chamarML(`/items/${novo.id}/description`, token, { method: "POST", body: JSON.stringify({ plain_text: semMyFrost(desc.plain_text) }), cabecalhos: json })
          .catch((e) => r.erros.push({ id: novo.id, erro: `descrição: ${msg(e)}` }));
      }
      // o novo, ligado ao mesmo produto; o antigo sai do envio de estoque e preço e é fechado
      const { data: novoReg } = await db.from("ml_anuncios").insert({ ml_item_id: novo.id, variation_id: "", titulo: novo.title ?? titulo, produto_id: liga.produto_id, ligado_em: new Date().toISOString() }).select("id").single();
      if (novoReg?.id) await db.from("ml_anuncios_envio").insert({ anuncio_id: novoReg.id, preco_ml: novo.price, estoque_ml: novo.available_quantity, status_ml: novo.status, lido_em: new Date().toISOString() });
      await db.from("ml_propostas").update({ ml_item_id: novo.id, atualizado_em: new Date().toISOString() }).eq("ml_item_id", id);
      await chamarML(`/items/${id}`, token, { method: "PUT", body: JSON.stringify({ status: "closed" }), cabecalhos: json });
      await db.from("ml_anuncios").update({ produto_id: null }).eq("id", liga.id);
      await db.from("ml_anuncios_envio").update({ status_ml: "closed" }).eq("anuncio_id", liga.id);
      r.republicados.push({ antigo: id, novo: novo.id, titulo: novo.title ?? titulo });
      await pausa(300);
    } catch (e) {
      if (e instanceof ErroML && e.status === 401) throw e;
      r.erros.push({ id, erro: msg(e) });
    }
  }
  return r;
}
