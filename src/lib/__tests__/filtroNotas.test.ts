import { describe, expect, it } from "vitest";
import { FILTRO_VAZIO, filtrosEmUso, passaFiltro, periodoDoAtalho, valorDigitado } from "../filtroNotas";

const nota = { data: "2026-10-08T10:00:00Z", numero: "431", valor: 30, uf: "SC" };

describe("passaFiltro", () => {
  it("sem filtro passa tudo", () => expect(passaFiltro(nota, FILTRO_VAZIO)).toBe(true));
  it("período", () => {
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, de: "2026-10-01", ate: "2026-10-08" })).toBe(true);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, de: "2026-10-09" })).toBe(false);
    expect(passaFiltro({ ...nota, data: null }, { ...FILTRO_VAZIO, ate: "2026-10-09" })).toBe(false);
  });
  it("número: um só ou faixa", () => {
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, numDe: "431" })).toBe(true);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, numDe: "43" })).toBe(false);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, numDe: "400", numAte: "432" })).toBe(true);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, numDe: "432", numAte: "400" })).toBe(true);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, numAte: "430" })).toBe(false);
  });
  it("valor e UF", () => {
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, valorMin: "29,90", valorMax: "1.000" })).toBe(true);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, valorMin: "R$ 31,00" })).toBe(false);
    expect(passaFiltro(nota, { ...FILTRO_VAZIO, uf: "sp" })).toBe(false);
  });
  it("conta os filtros em uso", () => expect(filtrosEmUso({ ...FILTRO_VAZIO, de: "2026-01-01", numDe: "1", uf: "SC" })).toBe(3));
});

describe("valorDigitado", () => {
  it("aceita os jeitos de escrever", () => {
    expect(valorDigitado("1.234,56")).toBe(1234.56);
    expect(valorDigitado("1234.56")).toBe(1234.56);
    expect(valorDigitado("1.234")).toBe(1234);
    expect(valorDigitado("")).toBeNull();
  });
});

describe("periodoDoAtalho", () => {
  it("monta o período", () => {
    expect(periodoDoAtalho("mes", "2026-10-15")).toEqual({ de: "2026-10-01", ate: "2026-10-15" });
    expect(periodoDoAtalho("mes_passado", "2026-01-15")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(periodoDoAtalho("7d", "2026-10-03")).toEqual({ de: "2026-09-27", ate: "2026-10-03" });
    expect(periodoDoAtalho("ano", "2026-10-15")).toEqual({ de: "2026-01-01", ate: "2026-10-15" });
  });
});
