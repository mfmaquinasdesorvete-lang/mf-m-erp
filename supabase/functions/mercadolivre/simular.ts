// Simulador de canais: as tarifas do Mercado Livre para um produto (Clássico e Premium, pela categoria) e o frete
// grátis que a MF pagaria, consultados na hora na API. Não muda nada no Mercado Livre nem no ERP; as contas de lucro,
// preço mínimo e publicidade ficam na tela (src/lib/simuladorCanais.ts), com a fonte de cada número.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { FRETE_GRATIS_DESDE, medidasFrete, semMyFrost, tarifaFixa, tituloML } from "../_shared/ml-novos.ts";
import { categoria, ml } from "./novos.ts";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const TIPOS = [{ id: "gold_special", nome: "Clássico" }, { id: "gold_pro", nome: "Premium" }] as const;

export async function tarifasDoProduto(db: SupabaseClient, conta: { ml_user_id: number }, token: string, produtoId: unknown, preco: unknown) {
  const id = String(produtoId ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("escolha o produto");
  const { data: p } = await db.from("produtos").select("id, sku, descricao, titulo_anuncio, peso_kg, altura_cm, largura_cm, profundidade_cm, preco_venda").eq("id", id).maybeSingle();
  if (!p) throw new Error("produto não encontrado");
  const valor = num(preco) > 0 ? num(preco) : num(p.preco_venda);
  const avisos: string[] = [];

  // categoria: a do anúncio ligado, senão a da proposta, senão a que o Mercado Livre sugere pelo nome
  let cat: { id: string; nome: string | null; fonte: string } | null = null;
  const { data: anuncio } = await db.from("ml_anuncios").select("ml_item_id").eq("produto_id", id).limit(1).maybeSingle();
  if (anuncio?.ml_item_id) {
    const it = await ml<any>(`/items/${anuncio.ml_item_id}?attributes=category_id`, token).catch(() => null);
    if (it?.category_id) cat = { id: it.category_id, nome: null, fonte: `categoria do anúncio ${anuncio.ml_item_id}` };
  }
  if (!cat) {
    const { data: pr } = await db.from("ml_propostas").select("categoria_id, categoria_nome").eq("produto_id", id).maybeSingle();
    if (pr?.categoria_id) cat = { id: pr.categoria_id, nome: pr.categoria_nome, fonte: "categoria da proposta de anúncio" };
  }
  if (!cat) {
    const s = await categoria(token, p, tituloML(semMyFrost(p.titulo_anuncio || p.descricao)));
    if (s?.category_id) cat = { id: s.category_id, nome: s.category_name ?? s.domain_name ?? null, fonte: "categoria sugerida pelo Mercado Livre pelo nome" };
  }
  if (!cat) throw new Error("o Mercado Livre não sugeriu uma categoria para este produto");
  if (!cat.nome) cat.nome = (await ml<any>(`/categories/${cat.id}`, token).catch(() => null))?.name ?? null;

  const tipos = [];
  for (const t of TIPOS) {
    const lp = await ml<any>(`/sites/MLB/listing_prices?price=${valor.toFixed(2)}&listing_type_id=${t.id}&category_id=${cat.id}`, token).catch(() => null);
    const det = (Array.isArray(lp) ? lp[0] : lp)?.sale_fee_details ?? {};
    const pct = num(det.percentage_fee ?? det.meli_percentage_fee);
    const fixa = det.fixed_fee != null ? num(det.fixed_fee) : tarifaFixa(valor);
    if (!(pct > 0)) avisos.push(`tarifa do ${t.nome} não respondeu`);
    tipos.push({ id: t.id, nome: t.nome, pct: pct > 0 ? pct : null, fixa, fonte: `Mercado Livre (listing_prices, categoria ${cat.id}, preço ${valor.toFixed(2)})` });
  }

  // frete grátis (obrigatório a partir de R$ 79): o custo que fica para a MF
  const med = medidasFrete(p);
  if (med.estimado) avisos.push("sem peso ou medidas no cadastro: frete calculado com uma caixa média");
  const fr = await ml<any>(`/users/${conta.ml_user_id}/shipping_options/free?dimensions=${med.texto}&verbose=true&item_price=${Math.max(valor, FRETE_GRATIS_DESDE).toFixed(2)}&listing_type_id=gold_special&mode=me2&condition=new&logistic_type=drop_off`, token)
    .catch(() => { avisos.push("frete grátis não respondeu"); return null; });
  const frete = num(fr?.coverage?.all_country?.list_cost);

  return {
    produto_id: id, preco: valor, categoria: cat, tipos,
    frete: { valor: frete || null, desde: FRETE_GRATIS_DESDE, medidas: med.texto, estimado: med.estimado, fonte: "Mercado Livre (shipping_options/free, envio pela agência)" },
    consultado_em: new Date().toISOString(), avisos,
  };
}
