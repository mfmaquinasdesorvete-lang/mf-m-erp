// Aparência do ERP escolhida pela empresa (Sobre → Design): cor da marca, cor de cada área, fontes, logo do menu,
// imagens no lugar dos ícones das áreas e os logos das marcas. Fica em configuracoes.aparencia (vale para todos) e
// numa cópia no aparelho, para a tela de entrada e o primeiro desenho já saírem com ela.
// De cada cor escolhida saem os tons que o ERP usa, com a letra sempre legível no tema claro e no escuro.
import { useSyncExternalStore } from "react";
import { RAIO } from "@/design/tokens.js";

export type LogoMarca = { id: string; nome: string; url: string | null };
export type Aparencia = {
  /** cor da marca (botões, links, destaques); vira a opção "Cor da empresa" e o padrão de quem não escolheu outra */
  cor_marca?: string | null;
  /** cor de cada área do menu (id do grupo → #rrggbb) */
  cores_areas?: Record<string, string>;
  fonte_titulos?: string | null;
  fonte_texto?: string | null;
  /** logo quadrado do topo do menu e da tela de entrada */
  logo_erp?: string | null;
  /** imagem no lugar do desenho de cada área do menu (id do grupo → endereço) */
  icones_areas?: Record<string, string>;
  /** logos das marcas e das sorveterias My Frost */
  marcas?: LogoMarca[];
  /** cantos de botões, cartões e painéis (os tokens de raio de src/design/tokens.js) */
  cantos?: Cantos | null;
};

// ---- cantos: multiplica a escala de raio dos tokens (retos = metade, redondos = uma vez e meia)
export type Cantos = "retos" | "padrao" | "redondos";
export const CANTOS: { id: Cantos; nome: string; fator: number }[] = [
  { id: "retos", nome: "Mais retos", fator: 0.5 },
  { id: "padrao", nome: "Padrão", fator: 1 },
  { id: "redondos", nome: "Mais redondos", fator: 1.5 },
];
/** Variáveis de raio para os cantos escolhidos (vazio = padrão). */
export function raiosDosCantos(cantos: Cantos | null | undefined): Record<string, string> {
  const fator = CANTOS.find((c) => c.id === cantos)?.fator ?? 1;
  if (fator === 1) return {};
  const vars: Record<string, string> = {};
  for (const [k, x] of Object.entries(RAIO.escala)) {
    if (k === "none" || k === "full") continue;
    const m = /^([\d.]+)(rem|px)$/.exec(x);
    if (m) vars[`raio-${k === "DEFAULT" ? "padrao" : k}`] = `${+(Number(m[1]) * fator).toFixed(4)}${m[2]}`;
  }
  vars["raio-linha-celular"] = `${Math.round(parseFloat(RAIO.linhaCelular) * fator)}px`;
  return vars;
}

// ---- fontes (lista pronta; cada uma só é baixada quando escolhida)
export type Fonte = { id: string; nome: string; familia: string; carregar?: () => Promise<unknown> };
export const FONTES: Fonte[] = [
  { id: "poppins", nome: "Poppins", familia: "Poppins" },
  { id: "dm-sans", nome: "DM Sans", familia: '"DM Sans Variable"' },
  { id: "montserrat", nome: "Montserrat", familia: '"Montserrat Variable"', carregar: () => import("@fontsource-variable/montserrat") },
  { id: "inter", nome: "Inter", familia: '"Inter Variable"', carregar: () => import("@fontsource-variable/inter") },
  { id: "nunito", nome: "Nunito", familia: '"Nunito Variable"', carregar: () => import("@fontsource-variable/nunito") },
  { id: "raleway", nome: "Raleway", familia: '"Raleway Variable"', carregar: () => import("@fontsource-variable/raleway") },
  { id: "quicksand", nome: "Quicksand", familia: '"Quicksand Variable"', carregar: () => import("@fontsource-variable/quicksand") },
  { id: "fredoka", nome: "Fredoka", familia: '"Fredoka Variable"', carregar: () => import("@fontsource-variable/fredoka") },
  { id: "open-sans", nome: "Open Sans", familia: '"Open Sans Variable"', carregar: () => import("@fontsource-variable/open-sans") },
];
export const FONTE_TITULOS_PADRAO = "poppins";
export const FONTE_TEXTO_PADRAO = "dm-sans";

/** Cor de cada área como vem no ERP (o --modulo de index.css). */
export const CORES_AREAS_PADRAO: Record<string, string> = {
  inicio: "#06b6d4", vendas: "#10b981", notas: "#3b82f6", financeiro: "#f59e0b", cadastros: "#a855f7",
  logistica: "#65a30d", posvenda: "#14b8a6", producao: "#f97316", analises: "#6366f1", admin: "#64748b",
};

/** Marcas com lugar para o logo (dá para acrescentar outras). */
export const MARCAS_PADRAO: LogoMarca[] = [
  { id: "mf", nome: "MF Máquinas", url: null },
  { id: "myfrost", nome: "My Frost Sorveterias", url: null },
  { id: "yozzy", nome: "Yozzy", url: null },
  { id: "soft", nome: "Soft Premium", url: null },
];

// ---- contas de cor
type Rgb = [number, number, number];
const HEX = /^#?([0-9a-f]{6})$/i;
export const corValida = (hex: string | null | undefined): hex is string => !!hex && HEX.test(hex.trim());
function rgb(hex: string): Rgb {
  const m = HEX.exec(hex.trim())![1];
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)) as Rgb;
}
const misturar = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
const BRANCO: Rgb = [255, 255, 255], PRETO: Rgb = [0, 0, 0], NOITE: Rgb = [11, 18, 32];
/** Luminância relativa (WCAG). */
export function luminancia([r, g, b]: Rgb) {
  const c = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export const contraste = (a: Rgb, b: Rgb) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Escurece até a letra dessa cor ser legível sobre o branco (e o branco sobre ela): contraste 4,5:1. */
function legivelNoClaro(c: Rgb): Rgb {
  let x = c;
  for (let i = 0; i < 40 && contraste(x, BRANCO) < 4.5; i++) x = misturar(x, PRETO, 0.06);
  return x;
}
/** Clareia até a cor aparecer bem sobre o fundo escuro do tema escuro (contraste 4,5:1 com o azul-noite). */
function legivelNoEscuro(c: Rgb): Rgb {
  let x = c;
  for (let i = 0; i < 40 && contraste(x, NOITE) < 4.5; i++) x = misturar(x, BRANCO, 0.06);
  return x;
}
const v = (c: Rgb) => c.join(" ");

/** Variáveis da cor da marca (as mesmas de index.css: --brand, --brand-dark…) para o tema claro e o escuro. */
export function tonsMarca(hex: string) {
  const base = rgb(hex), claro = legivelNoClaro(base), escuro = legivelNoEscuro(base);
  return {
    claro: { brand: v(claro), "brand-dark": v(misturar(claro, PRETO, 0.18)), "brand-light": v(misturar(base, BRANCO, 0.88)), "brand-fg": "255 255 255", "brand-nav": v(escuro) },
    escuro: { brand: v(escuro), "brand-dark": v(misturar(escuro, BRANCO, 0.25)), "brand-light": v(misturar(base, NOITE, 0.78)), "brand-fg": v(misturar(base, NOITE, 0.9)) },
  };
}

/** Variáveis da cor de uma área (--modulo, --modulo-2 e --modulo-texto) nos dois temas. */
export function tonsArea(hex: string) {
  const base = rgb(hex);
  return {
    modulo: v(base), "modulo-2": v(legivelNoClaro(misturar(base, PRETO, 0.3))),
    "modulo-texto": v(legivelNoClaro(base)), "modulo-texto-escuro": v(legivelNoEscuro(base)),
  };
}

const bloco = (sel: string, vars: Record<string, string>) => `${sel} { ${Object.entries(vars).map(([k, x]) => `--${k}: ${x};`).join(" ")} }`;
const familia = (id: string | null | undefined, padrao: string) => (FONTES.find((f) => f.id === id) ?? FONTES.find((f) => f.id === padrao)!).familia;

/** O CSS da aparência (entra depois do index.css, então vale por cima das cores e fontes de lá). */
export function cssDaAparencia(a: Aparencia): string {
  const css: string[] = [];
  if (corValida(a.cor_marca)) {
    const t = tonsMarca(a.cor_marca);
    css.push(bloco(':root[data-accent="marca"]', t.claro), bloco(':root[data-theme="dark"][data-accent="marca"]', t.escuro));
  }
  for (const [id, hex] of Object.entries(a.cores_areas ?? {})) {
    if (!corValida(hex) || !/^[a-z]+$/.test(id)) continue;
    const t = tonsArea(hex);
    const sel = id === "inicio" ? ':root, :root[data-modulo="inicio"]' : `:root[data-modulo="${id}"]`;
    css.push(bloco(sel, { modulo: t.modulo, "modulo-2": t["modulo-2"], "modulo-texto": t["modulo-texto"] }));
    css.push(bloco(id === "inicio" ? ':root[data-theme="dark"], :root[data-theme="dark"][data-modulo="inicio"]' : `:root[data-theme="dark"][data-modulo="${id}"]`, { "modulo-texto": t["modulo-texto-escuro"] }));
  }
  // :root repetido para valer por cima dos cantos do fundo "App" (index.css), que têm mais peso que :root
  const raios = raiosDosCantos(a.cantos);
  if (Object.keys(raios).length) css.push(bloco(":root:root:root:root:root", raios));
  css.push(bloco(":root", { "fonte-titulos": familia(a.fonte_titulos, FONTE_TITULOS_PADRAO), "fonte-texto": familia(a.fonte_texto, FONTE_TEXTO_PADRAO) }));
  return css.join("\n");
}

// ---- aplicar na tela e avisar quem desenha logo e ícones
const CHAVE = "mf-erp-aparencia";
let atual: Aparencia = lerGuardada();
const ouvintes = new Set<() => void>();

function lerGuardada(): Aparencia {
  try { return JSON.parse(localStorage.getItem(CHAVE) || "{}") as Aparencia; } catch { return {}; }
}

export function aplicarAparencia(a: Aparencia | null | undefined) {
  atual = a ?? {};
  if (typeof document === "undefined") return;
  let el = document.getElementById("aparencia-empresa") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "aparencia-empresa"; document.head.appendChild(el); }
  el.textContent = cssDaAparencia(atual);
  for (const id of [atual.fonte_titulos, atual.fonte_texto]) void FONTES.find((f) => f.id === id)?.carregar?.();
  try { localStorage.setItem(CHAVE, JSON.stringify(atual)); } catch { /* sem armazenamento: vale só nesta visita */ }
  ouvintes.forEach((f) => f());
}

/** Aparência em uso (os componentes redesenham quando ela muda). */
export function useAparencia(): Aparencia {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual, () => atual);
}
export const aparenciaAtual = () => atual;
