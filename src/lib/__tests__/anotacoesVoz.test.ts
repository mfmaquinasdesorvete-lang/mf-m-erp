import { describe, expect, it } from "vitest";
import { normalizarVoz, termosBusca } from "../../../supabase/functions/_shared/ia-voz";
import { acharPessoa, parada, tiposPermitidos, vozBloqueadaEm } from "../anotacoesVoz";

describe("normalizarVoz", () => {
  it("aceita o que a IA entendeu e limpa o nº de série", () => {
    const e = normalizarVoz({ tipo: "giga_ok", resumo: "  Giga da série AB-1234 conferido ", numero_serie: "ab 12-34", numero_os: 0, valor: -5 }, "giga ab 1234 ok");
    expect(e.tipo).toBe("giga_ok");
    expect(e.resumo).toBe("Giga da série AB-1234 conferido");
    expect(e.numero_serie).toBe("AB1234");
    expect(e.numero_os).toBeNull();
    expect(e.valor).toBeNull();
  });
  it("tipo desconhecido vira 'outro' e sem resumo usa a própria fala", () => {
    const e = normalizarVoz({ tipo: "apagar_tudo", resumo: "" }, "anota que a máquina chegou");
    expect(e.tipo).toBe("outro");
    expect(e.resumo).toBe("anota que a máquina chegou");
  });
  it("arredonda o valor falado", () => {
    expect(normalizarVoz({ tipo: "pagamento_video", resumo: "pagou", valor: 150.456 }, "x").valor).toBe(150.46);
  });
});

describe("termosBusca", () => {
  it("nome inteiro primeiro e depois as palavras fortes, sem 'sorveteria'", () => {
    expect(termosBusca("Sorveteria Gelato da Maria")).toEqual(["Sorveteria Gelato da Maria", "Gelato", "Maria"]);
  });
  it("tira caracteres que quebram a busca", () => {
    expect(termosBusca("50% (teste)")[0]).toBe("50 teste");
    expect(termosBusca(null)).toEqual([]);
  });
});

describe("acharPessoa", () => {
  const equipe = [{ id: "1", nome: "Ana Souza" }, { id: "2", nome: "Bruno Lima" }, { id: "3", nome: "Técnico" }];
  it("acha pelo primeiro nome sem acento", () => {
    expect(acharPessoa("ana", equipe)?.id).toBe("1");
    expect(acharPessoa("Bruno", equipe)?.id).toBe("2");
    expect(acharPessoa("tecnico", equipe)?.id).toBe("3");
  });
  it("nome curto ou desconhecido não acha ninguém", () => {
    expect(acharPessoa("Jo", equipe)).toBeNull();
    expect(acharPessoa("Mariana", equipe)).toBeNull();
  });
});

describe("tiposPermitidos e parada", () => {
  it("quem só vê o giga anota o giga, lembrete e outro", () => {
    expect(tiposPermitidos((t) => t === "testegiga")).toEqual(["lembrete", "giga_ok", "outro"]);
  });
  it("parada depois de 2 dias para conferir", () => {
    const agora = new Date("2026-10-23T12:00:00Z").getTime();
    expect(parada({ situacao: "pendente", criado_em: "2026-10-20T12:00:00Z" }, agora)).toBe(true);
    expect(parada({ situacao: "pendente", criado_em: "2026-10-22T12:00:00Z" }, agora)).toBe(false);
    expect(parada({ situacao: "conferido", criado_em: "2026-10-01T12:00:00Z" }, agora)).toBe(false);
  });
});

describe("vozBloqueadaEm", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
  it("iPhone pelo ícone da tela inicial: a Apple bloqueia o reconhecimento de fala", () => {
    expect(vozBloqueadaEm({ ua: iphone, standalone: true, toque: 5 })).toBe(true);
    expect(vozBloqueadaEm({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", standalone: true, toque: 5 })).toBe(true); // iPad
  });
  it("iPhone no Safari, Android e computador continuam ouvindo", () => {
    expect(vozBloqueadaEm({ ua: iphone, standalone: false, toque: 5 })).toBe(false);
    expect(vozBloqueadaEm({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", standalone: true, toque: 5 })).toBe(false);
    expect(vozBloqueadaEm({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130", standalone: true, toque: 0 })).toBe(false);
  });
});
