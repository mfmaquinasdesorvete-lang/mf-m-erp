import { describe, expect, it } from "vitest";
import { ABAS_RECEBIDAS, aConferir, situacaoRecebida } from "../notas";

const aba = (v: string) => ABAS_RECEBIDAS.find((a) => a.valor === v)!.filtro;

describe("compra a caminho e conferência da chegada", () => {
  it("a caminho fica na aba própria e não em 'a resolver'", () => {
    const n = { situacao: "autorizada", processamento: "a_caminho" };
    expect(situacaoRecebida(n).rotulo).toBe("A caminho");
    expect(aba("a_caminho")(n)).toBe(true);
    expect(aba("pendentes")(n)).toBe(false);
  });

  it("depois da entrada pela chegada, pede a conferência até alguém responder", () => {
    const chegou = { situacao: "autorizada", processamento: "concluido", chegou_em: "2026-10-23T10:00:00Z", conferencia: null };
    expect(aConferir(chegou)).toBe(true);
    expect(aba("conferir")(chegou)).toBe(true);
    expect(aConferir({ ...chegou, conferencia: "ok" })).toBe(false);
    expect(situacaoRecebida({ ...chegou, conferencia: "ok" }).chave).toBe("concluido");
    // com problema continua à vista
    expect(situacaoRecebida({ ...chegou, conferencia: "divergencia" }).chave).toBe("divergencia");
    expect(aba("conferir")({ ...chegou, conferencia: "divergencia" })).toBe(true);
  });

  it("notas lançadas antes (sem data de chegada) não pedem conferência", () => {
    expect(aConferir({ processamento: "concluido", chegou_em: null })).toBe(false);
  });
});
