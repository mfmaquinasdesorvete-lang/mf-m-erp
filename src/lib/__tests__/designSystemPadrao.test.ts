// Padrão do design system (Sobre → Design): as telas usam as peças únicas e as cores com nome, não cor solta.
// Os limites abaixo só podem descer: se um teste daqui falhar, use a peça ou a cor da paleta (tailwind.config.js:
// fixo-*, noite-*, publico-*) em vez de escrever de novo; se ficou menor, baixe o número.
import { describe, expect, it } from "vitest";

const TELAS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob(["../../**/*.tsx", "!../../**/__tests__/**", "!../../**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>)
    .map(([caminho, txt]) => [caminho.replace(/^(\.\.\/)+/, "src/"), txt]),
);

/** Cor escrita direto na classe do Tailwind, como bg-[#10b981] ou text-[#8b93a7]/80 */
const COR_SOLTA = /(?<![\w-])(?:[a-z]+:)*[a-z]+(?:-[a-z]+)?-\[#[0-9a-fA-F]{3,8}\]/g;

function contar(rx: RegExp) {
  const por: Record<string, number> = {};
  for (const [arq, txt] of Object.entries(TELAS)) {
    const n = txt.match(rx)?.length ?? 0;
    if (n) por[arq] = n;
  }
  return { total: Object.values(por).reduce((s, n) => s + n, 0), por };
}

/** Cada `<button …>` das telas (anda até o ">" que fecha a tag, pulando o que está dentro de {…}, como `() => …`) */
function botoes(txt: string) {
  const achados: string[] = [];
  for (let i = txt.indexOf("<button"); i >= 0; i = txt.indexOf("<button", i + 1)) {
    if (/\w/.test(txt[i + 7] ?? "")) continue;
    let j = i + 7, chaves = 0, aspas = "";
    for (; j < txt.length; j++) {
      const c = txt[j];
      if (aspas) { if (c === aspas) aspas = ""; }
      else if (c === '"' || (chaves > 0 && (c === "'" || c === "`"))) aspas = c;
      else if (c === "{") chaves++;
      else if (c === "}") chaves--;
      else if (c === ">" && chaves === 0) break;
    }
    achados.push(txt.slice(i, j + 1));
  }
  return achados;
}
/** As peças únicas de botão (src/index.css e ui.tsx) */
const PECA = /\b(botao-icone|botao-icone-perigo|link-acao|link-modulo|link-discreto|botao-mini|chip|linha-clicavel|cartao|btn)\b|chip\(|classeChip\(|CLASSE_BOTAO/;

describe("design system", () => {
  it("lê as telas", () => {
    expect(Object.keys(TELAS).length).toBeGreaterThan(200);
  });

  it("cor solta nas classes não volta a crescer (antes da padronização eram 608)", () => {
    const { total, por } = contar(COR_SOLTA);
    expect(total, JSON.stringify(por, null, 1)).toBeLessThanOrEqual(36);
  });

  it("botão feito à mão não volta a crescer (antes da padronização eram 697 de 801)", () => {
    const por: Record<string, number> = {};
    for (const [arq, txt] of Object.entries(TELAS)) {
      const n = botoes(txt).filter((b) => !PECA.test(b)).length;
      if (n) por[arq] = n;
    }
    const total = Object.values(por).reduce((s, n) => s + n, 0);
    expect(total, JSON.stringify(por, null, 1)).toBeLessThanOrEqual(356);
  });
});
