// Animações com GSAP (30/10, pedido da usuária). Regras do design system (README, 2.4): animação só para mostrar
// uma mudança, curta, e nenhuma para quem pede menos movimento no aparelho.
// O GSAP não entra no arquivo principal do site: carrega à parte depois que a tela abre (carregarGsap), e as peças só
// animam quando ele já está pronto, para nada piscar enquanto baixa.
// - Contagem: o número de um cartão sobe até o valor (e vai do valor antigo ao novo quando muda o período).
// - useEntrada: os blocos de uma página entram em sequência na primeira vez que ela abre.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type Gsap = typeof import("gsap").gsap;
let gsapPronto: Gsap | null = null;
let carregando: Promise<Gsap | null> | null = null;

/** Baixa o GSAP uma vez (o Layout chama quando a tela fica livre). */
export function carregarGsap(): Promise<Gsap | null> {
  if (gsapPronto) return Promise.resolve(gsapPronto);
  carregando ??= import("gsap").then((m) => (gsapPronto = m.gsap)).catch(() => null);
  return carregando;
}

/** A pessoa pediu menos movimento no aparelho (ou o navegador não sabe dizer): não anima. */
export function menosMovimento() {
  try { return !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
}

/** "R$ 11.461,00" → antes "R$ ", 11461, 2 casas, com milhar. Data, hora e fração ("27/10", "3/5", "10:30") não animam. */
export function separarNumero(texto: string) {
  if (/[/:]/.test(texto)) return null;
  const m = texto.match(/^(\D*?)(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?)(.*)$/s);
  if (!m) return null;
  const [, antes, bruto, depois] = m;
  const casas = bruto.includes(",") ? bruto.split(",")[1].length : 0;
  const numero = Number(bruto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? { antes, numero, casas, milhar: bruto.includes("."), depois } : null;
}

export function formatarComo(v: number, p: NonNullable<ReturnType<typeof separarNumero>>) {
  const n = v.toLocaleString("pt-BR", { minimumFractionDigits: p.casas, maximumFractionDigits: p.casas, useGrouping: p.milhar });
  return `${p.antes}${n}${p.depois}`;
}

/** Número que sobe até o valor. Só anima texto simples com um número ("R$ 1.234,00", "61%", "17 UN"); o resto aparece como veio.
 *  O texto final é sempre o que veio de fora (a animação só preenche o meio do caminho). */
export function Contagem({ children }: { children: ReactNode }) {
  const texto = typeof children === "string" || typeof children === "number" ? String(children) : null;
  const [meio, setMeio] = useState<string | null>(null);
  const anterior = useRef(0);
  useEffect(() => {
    const p = texto ? separarNumero(texto) : null;
    if (!p) return;
    const de = anterior.current;
    anterior.current = p.numero;
    if (!gsapPronto || menosMovimento() || de === p.numero) return;
    const obj = { v: de };
    const tween = gsapPronto.to(obj, {
      v: p.numero, duration: 0.7, ease: "power2.out",
      onUpdate: () => setMeio(formatarComo(obj.v, p)),
      onComplete: () => setMeio(null),
    });
    // desmontou no meio (ou o React montou duas vezes): a próxima montagem recomeça do mesmo ponto
    return () => { if (tween.progress() < 1) anterior.current = de; tween.kill(); setMeio(null); };
  }, [texto]);
  return <>{meio ?? children}</>;
}

/** Os filhos diretos do bloco entram em sequência (sobem 12 px e aparecem) na primeira vez que ele aparece. */
export function useEntrada(ref: RefObject<HTMLElement | null>, ativo = true) {
  const feito = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!ativo || feito.current || !el || !gsapPronto || menosMovimento()) return;
    feito.current = true;
    const filhos = Array.from(el.children);
    const tween = gsapPronto.fromTo(filhos, { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out", stagger: 0.05, clearProps: "opacity,visibility,transform" });
    // desmontou no meio (ou o React montou duas vezes): tudo visível de novo e a próxima montagem anima
    return () => {
      const fim = tween.progress() >= 1;
      tween.kill();
      if (!fim) { gsapPronto?.set(filhos, { clearProps: "opacity,visibility,transform" }); feito.current = false; }
    };
  }, [ref, ativo]);
}
