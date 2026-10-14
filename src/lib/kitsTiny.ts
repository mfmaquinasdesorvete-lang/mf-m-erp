// Kits do Tiny: lê as planilhas "composição de fabricados e kits" (Produtos → Kits/Fabricados → Exportar) e monta
// a composição de cada kit do ERP. O componente é achado pelo código do Tiny (id_externo ou "Tiny 123" nos códigos
// alternativos de um cadastro unificado), depois pelo SKU e por último pela descrição (só se der um único produto).
// Fabricado (máquina) não entra: a ficha técnica dele fica em Produção.
import * as XLSX from "xlsx";
import type { KitComponente } from "./types";

export type LinhaComposicao = { pai: string; paiSku: string; paiDesc: string; comp: string; compSku: string; compDesc: string; qtd: number };
export type ProdutoKitTiny = {
  id: string; descricao: string; sku?: string | null; id_externo?: string | null; codigos_alternativos?: string | null;
  kit?: boolean | null; ativo?: boolean | null;
};
export type ComoAchou = "codigo" | "sku" | "descricao";
export type ItemPlano = { componente_id: string; descricao: string; quantidade: number; como: ComoAchou };
export type SituacaoKit = "pronto" | "faltam_itens" | "proprio_item" | "ja_tem" | "fabricado" | "fora_do_erp";
export type KitPlano = {
  tinyId: string; descricaoTiny: string; produto: ProdutoKitTiny | null; situacao: SituacaoKit;
  itens: ItemPlano[]; faltando: { descricao: string; sku: string; quantidade: number }[]; proprio: number;
};

const COLUNAS = { pai: "ID kit/fabricado", paiSku: "SKU kit/fabricado", paiDesc: "Descrição kit/fabricado", comp: "ID componente", compSku: "SKU componente", compDesc: "Descrição componente", qtd: "Quantidade componente" };

/** "0,5" ou "0.5" → 0.5 */
export function quantidadeTiny(v: unknown): number {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}

/** Linhas de uma planilha (já em objetos com o cabeçalho do Tiny). */
export function montarComposicao(linhas: Record<string, unknown>[]): LinhaComposicao[] {
  if (!linhas.length) return [];
  const faltam = [COLUNAS.pai, COLUNAS.comp, COLUNAS.qtd].filter((c) => !(c in linhas[0]));
  if (faltam.length) throw new Error(`não é a planilha de composição do Tiny: faltam as colunas ${faltam.join(", ")}`);
  const txt = (r: Record<string, unknown>, c: string) => String(r[c] ?? "").trim();
  return linhas.filter((r) => txt(r, COLUNAS.pai) && txt(r, COLUNAS.comp)).map((r) => ({
    pai: txt(r, COLUNAS.pai), paiSku: txt(r, COLUNAS.paiSku), paiDesc: txt(r, COLUNAS.paiDesc),
    comp: txt(r, COLUNAS.comp), compSku: txt(r, COLUNAS.compSku), compDesc: txt(r, COLUNAS.compDesc), qtd: quantidadeTiny(r[COLUNAS.qtd]),
  }));
}

/** Lê as planilhas exportadas do Tiny (.xls, .xlsx ou .csv). */
export async function lerComposicaoTiny(arquivos: File[]): Promise<LinhaComposicao[]> {
  const todas: LinhaComposicao[] = [];
  for (const f of arquivos) {
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: "" });
    try { todas.push(...montarComposicao(linhas)); } catch (e) { throw new Error(`${f.name}: ${(e as Error).message}`); }
  }
  return todas;
}

/** Descrição comparável: sem acento, sem "compatível com máquinas…", "TB" = tubo, só letras e números. */
export function descricaoComparavel(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\s*-\s*compativel com maquinas.*$/, "").replace(/\bmy\s*frost\b/g, "").replace(/\btb\b/g, "tubo")
    .replace(/[^a-z0-9]/g, "");
}

/** Índice para achar o produto do ERP pelo código do Tiny, SKU ou descrição. */
export function indiceProdutos(produtos: ProdutoKitTiny[]) {
  // código do Tiny → produto; o cadastro ativo ganha do inativo (repetido que foi unificado guarda o código antigo)
  const porCodigo = new Map<string, { p: ProdutoKitTiny; prio: number }>();
  const porSku = new Map<string, ProdutoKitTiny[]>();
  const porDesc = new Map<string, ProdutoKitTiny[]>();
  const add = <T,>(m: Map<string, T[]>, k: string, v: T) => { if (k) m.set(k, [...(m.get(k) ?? []), v]); };
  const codigo = (k: string, p: ProdutoKitTiny, prio: number) => { if (k && prio > (porCodigo.get(k)?.prio ?? -1)) porCodigo.set(k, { p, prio }); };
  for (const p of produtos) {
    const ativo = p.ativo !== false;
    if (p.id_externo) codigo(String(p.id_externo).trim(), p, ativo ? 3 : 1);
    for (const m of String(p.codigos_alternativos ?? "").matchAll(/Tiny\s*(\d+)/gi)) codigo(m[1], p, ativo ? 2 : 0);
    if (ativo) {
      add(porSku, String(p.sku ?? "").trim().toUpperCase(), p);
      add(porDesc, descricaoComparavel(p.descricao), p);
    }
  }
  return {
    /** Produto do ERP com este código do Tiny (sem tentar SKU nem descrição). */
    codigo: (id: string) => porCodigo.get(id)?.p ?? null,
    achar(id: string, sku: string, desc: string): { p: ProdutoKitTiny; como: ComoAchou } | null {
      const c = porCodigo.get(id);
      if (c) return { p: c.p, como: "codigo" };
      const s = porSku.get(sku.trim().toUpperCase());
      if (sku.trim() && s?.length === 1) return { p: s[0], como: "sku" };
      const d = porDesc.get(descricaoComparavel(desc));
      if (desc.trim() && d?.length === 1) return { p: d[0], como: "descricao" };
      return null;
    },
  };
}

/** Plano de importação: um item por kit do Tiny, com o produto do ERP, os componentes achados e o que falta. */
export function planejarKits(linhas: LinhaComposicao[], produtos: ProdutoKitTiny[], existentes: Pick<KitComponente, "kit_id">[]): KitPlano[] {
  const idx = indiceProdutos(produtos);
  const comComponentes = new Set(existentes.map((c) => c.kit_id));
  const grupos = new Map<string, LinhaComposicao[]>();
  for (const l of linhas) grupos.set(l.pai, [...(grupos.get(l.pai) ?? []), l]);
  const planos: KitPlano[] = [];
  for (const [tinyId, ls] of grupos) {
    const produto = idx.codigo(tinyId);
    const base = { tinyId, descricaoTiny: ls[0].paiDesc, produto, itens: [] as ItemPlano[], faltando: [] as KitPlano["faltando"], proprio: 0 };
    if (!produto) { planos.push({ ...base, situacao: "fora_do_erp" }); continue; }
    if (!produto.kit) { planos.push({ ...base, situacao: "fabricado" }); continue; }
    const itens = new Map<string, ItemPlano>();
    for (const l of ls) {
      if (!(l.qtd > 0)) continue;
      const a = idx.achar(l.comp, l.compSku, l.compDesc);
      if (!a) { base.faltando.push({ descricao: l.compDesc, sku: l.compSku, quantidade: l.qtd }); continue; }
      if (a.p.id === produto.id) { base.proprio = l.qtd; continue; }
      // o mesmo componente em duas linhas (cadastros repetidos no Tiny que viraram um só no ERP): soma
      const ja = itens.get(a.p.id);
      itens.set(a.p.id, ja ? { ...ja, quantidade: Math.round((ja.quantidade + l.qtd) * 1000) / 1000 } : { componente_id: a.p.id, descricao: a.p.descricao, quantidade: l.qtd, como: a.como });
    }
    base.itens = [...itens.values()];
    const situacao: SituacaoKit = comComponentes.has(produto.id) ? "ja_tem" : base.proprio ? "proprio_item" : base.faltando.length ? "faltam_itens" : "pronto";
    planos.push({ ...base, situacao });
  }
  const ordem: SituacaoKit[] = ["pronto", "faltam_itens", "proprio_item", "ja_tem", "fabricado", "fora_do_erp"];
  return planos.sort((a, b) => ordem.indexOf(a.situacao) - ordem.indexOf(b.situacao) || (a.produto?.descricao ?? a.descricaoTiny).localeCompare(b.produto?.descricao ?? b.descricaoTiny, "pt-BR"));
}

export const SITUACAO_KIT: Record<SituacaoKit, { rotulo: string; ajuda: string; cor: string }> = {
  pronto: { rotulo: "Pronto", ajuda: "todos os componentes achados no cadastro", cor: "bg-emerald-100 text-emerald-800" },
  faltam_itens: { rotulo: "Falta item no cadastro", ajuda: "entra sem os itens que não estão no ERP; cadastre-os e complete no botão Componentes", cor: "bg-amber-100 text-amber-800" },
  proprio_item: { rotulo: "Conferir", ajuda: "no Tiny o kit tem ele mesmo como componente (parece um lote de produção): confira antes", cor: "bg-red-100 text-red-800" },
  ja_tem: { rotulo: "Já tem componentes", ajuda: "o ERP mantém o que já está cadastrado", cor: "bg-slate-200 text-slate-700" },
  fabricado: { rotulo: "Máquina (ficha técnica)", ajuda: "fabricado: a ficha técnica fica em Produção", cor: "bg-sky-100 text-sky-800" },
  fora_do_erp: { rotulo: "Não está no ERP", ajuda: "versão antiga ou inativa no Tiny", cor: "bg-slate-100 text-slate-600" },
};

/** O que vai para o banco (public.importar_kits_tiny). */
export const paraGravar = (planos: KitPlano[]) =>
  planos.filter((k) => k.produto && k.itens.length).map((k) => ({ kit_id: k.produto!.id, itens: k.itens.map(({ componente_id, quantidade }) => ({ componente_id, quantidade })) }));
