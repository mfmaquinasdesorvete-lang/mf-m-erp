// Auto-Fill e Elaborator do cadastro de produto. Com a IA ligada (função ia-produto, o Claude lendo nome, foto e PDF)
// as sugestões vêm de lá; sem ela, as regras do próprio ERP fazem o mesmo trabalho com o que já sabem: título, palavras-
// chave e textos no padrão do anúncio e a categoria que os produtos de nome parecido já usam. Nada é gravado sozinho:
// a pessoa marca os campos que quer e salva o produto.
import { avaliarAnuncio, descricaoAnuncio, metaDescricao, palavrasChave, tituloAnuncio, type ProdutoAnuncio } from "./marketplace";
import type { SugestaoIA } from "../../supabase/functions/_shared/ia-produto";

export type { SugestaoIA };
export type CampoAuto = "titulo_anuncio" | "palavras_chave" | "meta_descricao" | "descricao_catalogo" | "descricao_anuncio" | "categoria" | "marca" | "modelo"
  | "especificacoes" | "no_catalogo" | "vendavel";
export type LinhaAuto = { campo: CampoAuto; nome: string; atual: unknown; sugerido: unknown; confianca?: "alta" | "media" | "baixa"; aviso?: string };

export const NOMES_CAMPO: Record<CampoAuto, string> = {
  titulo_anuncio: "Título do anúncio", palavras_chave: "Palavras-chave", meta_descricao: "Descrição para o Google", descricao_catalogo: "Texto de venda (WhatsApp)",
  descricao_anuncio: "Texto do anúncio", categoria: "Categoria", marca: "Marca", modelo: "Modelo", especificacoes: "Campos adicionais",
  no_catalogo: "Mostrar na loja e no WhatsApp", vendavel: "Pode vender (pedido e PDV)",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VAZIAS = new Set(["para", "com", "sem", "de", "da", "do", "das", "dos", "em", "kit", "peca", "pecas", "unidade", "maquina", "maquinas", "sorvete"]);
/** Palavras que contam para comparar nomes (sem acento, 3+ letras, sem as genéricas). */
export const termos = (s: string | null | undefined) =>
  new Set(semAcento(String(s ?? "")).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !VAZIAS.has(w)));

/** Categoria que os produtos de nome parecido já usam (voto pelos mais parecidos); null se nenhum chega perto. */
export function categoriaPorParecidos(nome: string, produtos: { id?: string; descricao: string; categoria?: string | null }[], ignorarId?: string) {
  const alvo = termos(nome);
  if (!alvo.size) return null;
  const votos = new Map<string, number>();
  for (const p of produtos) {
    if (!p.categoria?.trim() || p.id === ignorarId) continue;
    const t = termos(p.descricao);
    let comum = 0;
    for (const w of alvo) if (t.has(w)) comum++;
    const nota = comum / Math.max(alvo.size, 1);
    if (comum >= 1 && nota >= 0.34) votos.set(p.categoria.trim(), (votos.get(p.categoria.trim()) ?? 0) + nota);
  }
  const [melhor] = [...votos.entries()].sort((a, b) => b[1] - a[1]);
  if (!melhor) return null;
  return { categoria: melhor[0], confianca: (melhor[1] >= 1.5 ? "alta" : melhor[1] >= 0.6 ? "media" : "baixa") as "alta" | "media" | "baixa" };
}

/** Sugestões feitas pelas regras do ERP (quando a IA não está ligada ou falhou). */
export function sugestaoLocal(p: ProdutoAnuncio & { especificacoes?: { nome: string; valor: string }[] | null; vendavel?: boolean | null },
  produtos: { id?: string; descricao: string; categoria?: string | null }[], garantiaPadrao = 3): SugestaoIA {
  const titulo = tituloAnuncio(p);
  const base = { ...p, titulo_anuncio: titulo };
  const cat = p.categoria ? { categoria: p.categoria, confianca: "alta" as const } : categoriaPorParecidos(p.descricao, produtos, p.id);
  const interno = p.tipo === "componente" || p.tipo === "insumo";
  const conferir: string[] = [];
  if (!cat) conferir.push("escolha a categoria: nenhum produto de nome parecido tem uma");
  if (!p.marca) conferir.push("informe a marca (as regras não leem foto nem PDF)");
  if (!p.modelo) conferir.push("informe o modelo ou a compatibilidade");
  const nota = avaliarAnuncio({ ...base, categoria: cat?.categoria ?? null, palavras_chave: palavrasChave(base), meta_descricao: metaDescricao(base), slug: p.slug || "x" } as ProdutoAnuncio);
  return {
    titulo_anuncio: titulo,
    palavras_chave: palavrasChave(base),
    meta_descricao: metaDescricao(base),
    descricao_catalogo: p.descricao_catalogo || `${titulo}. ${p.tipo === "maquina" ? "Máquina" : "Peça"} com nota fiscal e envio para todo o Brasil. Antes de comprar, confirme o modelo da sua máquina com a gente.`,
    descricao_anuncio: descricaoAnuncio(base, garantiaPadrao),
    categoria: cat?.categoria ?? null, categoria_nova: false,
    marca: p.marca ?? null, modelo: p.modelo ?? null,
    especificacoes: p.especificacoes ?? [],
    canais: { loja_e_whatsapp: !interno, pedido_e_pdv: p.vendavel !== false && p.tipo !== "insumo" },
    status: nota.nota >= 90 && !conferir.length ? "pronto" : "rascunho",
    conferir: [...conferir, ...nota.pendencias.filter((x) => !x.automatica && !["categoria", "marca", "modelo"].includes(x.id)).map((x) => x.texto)].slice(0, 8),
    confianca: { categoria: cat?.confianca ?? "baixa", marca_modelo: "baixa", especificacoes: "baixa" },
  };
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);

/** Une os campos técnicos: os que já existem ficam; os novos (por nome) entram no fim. */
export function unirEspecificacoes(atuais: { nome: string; valor: string }[] | null | undefined, novas: { nome: string; valor: string }[]) {
  const lista = [...(atuais ?? [])];
  const nomes = new Set(lista.map((e) => semAcento(e.nome)));
  for (const e of novas) if (!nomes.has(semAcento(e.nome))) { lista.push(e); nomes.add(semAcento(e.nome)); }
  return lista;
}

/** Linhas para a pessoa conferir: só o que muda; marcadas de saída as que preenchem campo vazio. */
export function linhasDaSugestao(row: Record<string, any>, s: SugestaoIA): (LinhaAuto & { marcada: boolean })[] {
  const palavrasAtuais = Array.isArray(row.palavras_chave) ? row.palavras_chave : String(row.palavras_chave ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const especs = unirEspecificacoes(row.especificacoes, s.especificacoes);
  const candidatas: LinhaAuto[] = [
    { campo: "titulo_anuncio", nome: NOMES_CAMPO.titulo_anuncio, atual: row.titulo_anuncio, sugerido: s.titulo_anuncio },
    { campo: "palavras_chave", nome: NOMES_CAMPO.palavras_chave, atual: palavrasAtuais, sugerido: s.palavras_chave },
    { campo: "meta_descricao", nome: NOMES_CAMPO.meta_descricao, atual: row.meta_descricao, sugerido: s.meta_descricao },
    { campo: "descricao_catalogo", nome: NOMES_CAMPO.descricao_catalogo, atual: row.descricao_catalogo, sugerido: s.descricao_catalogo },
    { campo: "descricao_anuncio", nome: NOMES_CAMPO.descricao_anuncio, atual: row.descricao_anuncio, sugerido: s.descricao_anuncio },
    { campo: "categoria", nome: NOMES_CAMPO.categoria, atual: row.categoria, sugerido: s.categoria, confianca: s.confianca.categoria,
      aviso: s.categoria_nova ? "categoria nova: ainda não está na lista de categorias" : undefined },
    { campo: "marca", nome: NOMES_CAMPO.marca, atual: row.marca, sugerido: s.marca, confianca: s.confianca.marca_modelo },
    { campo: "modelo", nome: NOMES_CAMPO.modelo, atual: row.modelo, sugerido: s.modelo, confianca: s.confianca.marca_modelo },
    { campo: "especificacoes", nome: NOMES_CAMPO.especificacoes, atual: row.especificacoes ?? [], sugerido: especs, confianca: s.confianca.especificacoes },
    { campo: "no_catalogo", nome: NOMES_CAMPO.no_catalogo, atual: !!row.no_catalogo, sugerido: s.canais.loja_e_whatsapp },
    { campo: "vendavel", nome: NOMES_CAMPO.vendavel, atual: row.vendavel !== false, sugerido: s.canais.pedido_e_pdv },
  ];
  return candidatas
    .filter((l) => !vazio(l.sugerido) || typeof l.sugerido === "boolean")
    .filter((l) => !igual(l.atual, l.sugerido))
    // campo vazio: já vem marcado; o que alguém escreveu só muda se a pessoa marcar (e nunca com confiança baixa)
    .map((l) => ({ ...l, marcada: (vazio(l.atual) && l.confianca !== "baixa") || (typeof l.sugerido === "boolean" && !row.id) }));
}

/** Valor a gravar no formulário para cada campo marcado. */
export const valorParaForm = (l: LinhaAuto) => (l.campo === "palavras_chave" && Array.isArray(l.sugerido) ? (l.sugerido as string[]).join(", ") : l.sugerido);
