import { describe, expect, it } from "vitest";
import {
  anunciosDoItem, caminhoAnuncio, centavos, comPlano, configDaConta, estoqueDisponivel, linkAnuncio, planejarEnvio, precoAEnviar,
  reais, situacaoAnuncio, textoResumoEnvio, travaPreco, type AnuncioCalculo, type ConfigEnvio, type LinhaAnuncio,
} from "../mlAnuncios";
import { erroPassageiro, esperaMinutos } from "../../../supabase/functions/_shared/ml-anuncios";

// tudo inventado: produtos, anúncios e valores de exemplo
const cfg: ConfigEnvio = { enviar_estoque: true, enviar_preco: true, preco_ajuste: 10, estoque_seguranca: 2, estoque_maximo: null, trava_preco: 20 };
const peca: AnuncioCalculo = { produto_id: "p1", produto_ativo: true, kit: false, saldo: 12, preco_base: 100, custo: 40 };

describe("estoque que vai para o anúncio", () => {
  it("estoque da unidade menos o de segurança", () => {
    expect(estoqueDisponivel({ saldo: 12, seguranca: 2 })).toBe(10);
  });
  it("nunca negativo", () => {
    expect(estoqueDisponivel({ saldo: 1, seguranca: 5 })).toBe(0);
    expect(estoqueDisponivel({ saldo: -3 })).toBe(0);
  });
  it("respeita o limite máximo (vazio ou zero = sem limite)", () => {
    expect(estoqueDisponivel({ saldo: 100, seguranca: 0, maximo: 20 })).toBe(20);
    expect(estoqueDisponivel({ saldo: 100, maximo: null })).toBe(100);
    expect(estoqueDisponivel({ saldo: 100, maximo: 0 })).toBe(100);
  });
  it("só unidades inteiras (3,7 vira 3)", () => {
    expect(estoqueDisponivel({ saldo: 3.7 })).toBe(3);
    expect(estoqueDisponivel({ saldo: "8.000" })).toBe(8);
  });
  it("kit: o menor número de kits que dá para montar com as peças", () => {
    // peça B: 7 em estoque, 2 por kit → 3 kits; peça C: 5 em estoque, 1 por kit → 5 kits
    expect(estoqueDisponivel({ kit: true, componentes: [{ quantidade: 2, saldo: 7 }, { quantidade: 1, saldo: 5 }] })).toBe(3);
    expect(estoqueDisponivel({ kit: true, componentes: [{ quantidade: 2, saldo: 7 }, { quantidade: 1, saldo: 5 }], seguranca: 1 })).toBe(2);
    expect(estoqueDisponivel({ kit: true, componentes: [{ quantidade: 0.1, saldo: 6 }] })).toBe(60);
    expect(estoqueDisponivel({ kit: true, componentes: [{ quantidade: 1, saldo: -2 }, { quantidade: 1, saldo: 9 }] })).toBe(0);
    expect(estoqueDisponivel({ kit: true, componentes: [] })).toBe(0);
  });
  it("produto inativo: zero", () => {
    expect(estoqueDisponivel({ saldo: 50, ativo: false })).toBe(0);
  });
});

describe("preço que vai para o anúncio", () => {
  it("preço base mais o ajuste, em centavos", () => {
    expect(precoAEnviar({ base: 100, ajuste: 10, custo: 40 })).toEqual({ preco: 110, erro: null });
    expect(precoAEnviar({ base: 19.99, ajuste: 15 }).preco).toBe(22.99); // 22,9885
    expect(precoAEnviar({ base: 18.795, ajuste: 0 }).preco).toBe(18.8);
    expect(precoAEnviar({ base: 200, ajuste: -5 }).preco).toBe(190);
  });
  it("nunca abaixo do custo", () => {
    const r = precoAEnviar({ base: 50, ajuste: 0, custo: 60 });
    expect(r.erro).toMatch(/^preço abaixo do custo/);
    expect(r.erro).toContain("R$ 50,00");
  });
  it("nunca zero", () => {
    expect(precoAEnviar({ base: 0 }).erro).toMatch(/sem preço/);
    expect(precoAEnviar({ base: null }).erro).toMatch(/sem preço/);
    expect(precoAEnviar({ base: 10, ajuste: -100 }).erro).toMatch(/zerado/);
  });
  it("tabela de preço desativada não manda preço", () => {
    expect(precoAEnviar({ base: 10, tabelaOk: false }).erro).toMatch(/desativada/);
  });
  it("centavos e reais", () => {
    expect(centavos(1879.4999999)).toBe(1879.5);
    expect(reais(1234.5)).toBe("R$ 1.234,50");
    expect(reais(0.5)).toBe("R$ 0,50");
    expect(reais(1234567.891)).toBe("R$ 1.234.567,89");
  });
});

describe("trava de preço", () => {
  it("mudança maior que a trava espera aprovação", () => {
    expect(travaPreco({ novo: 125, referencia: 100, trava: 20 })).toEqual({ travado: true, variacao: 25 });
    expect(travaPreco({ novo: 75, referencia: 100, trava: 20 }).travado).toBe(true);
  });
  it("até a trava passa", () => {
    expect(travaPreco({ novo: 120, referencia: 100, trava: 20 }).travado).toBe(false);
    expect(travaPreco({ novo: 110, referencia: 100, trava: 20 })).toEqual({ travado: false, variacao: 10 });
  });
  it("preço aprovado igual ao novo passa; diferente trava de novo", () => {
    expect(travaPreco({ novo: 125, referencia: 100, trava: 20, aprovado: 125 }).travado).toBe(false);
    expect(travaPreco({ novo: 130, referencia: 100, trava: 20, aprovado: 125 }).travado).toBe(true);
  });
  it("sem trava ou sem referência passa", () => {
    expect(travaPreco({ novo: 500, referencia: 100, trava: 0 }).travado).toBe(false);
    expect(travaPreco({ novo: 500, referencia: null, trava: 20 }).travado).toBe(false);
  });
});

describe("plano de envio", () => {
  it("primeiro envio: manda estoque e preço", () => {
    const p = planejarEnvio(cfg, peca);
    expect(p).toMatchObject({ estoque: 10, preco: 110, enviarEstoque: true, enviarPreco: true, travado: null, erro: null });
  });
  it("igual ao último enviado: nada muda", () => {
    const p = planejarEnvio(cfg, { ...peca, ultimo_estoque: 10, ultimo_preco: 110 });
    expect(p.enviarEstoque).toBe(false);
    expect(p.enviarPreco).toBe(false);
  });
  it("forçado (Sincronizar agora): manda mesmo igual", () => {
    const p = planejarEnvio(cfg, { ...peca, ultimo_estoque: 10, ultimo_preco: 110 }, { forcar: true });
    expect(p.enviarEstoque && p.enviarPreco).toBe(true);
  });
  it("antes do primeiro envio, o preço do anúncio vale de referência para a trava", () => {
    const p = planejarEnvio(cfg, { ...peca, preco_ml: 80 });
    expect(p.travado).toEqual({ de: 80, para: 110, variacao: 37.5 });
    expect(p.enviarPreco).toBe(false);
    expect(p.enviarEstoque).toBe(true); // o estoque vai mesmo com o preço travado
    expect(planejarEnvio(cfg, { ...peca, preco_ml: 110 }).enviarPreco).toBe(false); // já está certo lá
  });
  it("preço aprovado destrava", () => {
    expect(planejarEnvio(cfg, { ...peca, ultimo_preco: 80, preco_aprovado: 110 }).enviarPreco).toBe(true);
  });
  it("preço abaixo do custo: erro e o preço não vai; o estoque vai", () => {
    const p = planejarEnvio({ ...cfg, preco_ajuste: -70 }, peca);
    expect(p.erro).toMatch(/abaixo do custo/);
    expect(p.enviarPreco).toBe(false);
    expect(p.enviarEstoque).toBe(true);
  });
  it("exceções do anúncio e envio desligado", () => {
    expect(planejarEnvio(cfg, { ...peca, enviar_preco: false })).toMatchObject({ preco: null, enviarPreco: false, enviarEstoque: true });
    expect(planejarEnvio(cfg, { ...peca, enviar_estoque: false })).toMatchObject({ estoque: null, enviarEstoque: false, enviarPreco: true });
    expect(planejarEnvio({ ...cfg, enviar_estoque: false, enviar_preco: false }, peca)).toMatchObject({ estoque: null, preco: null });
  });
  it("Full: o estoque fica com o Mercado Livre", () => {
    const p = planejarEnvio(cfg, { ...peca, logistica: "fulfillment" });
    expect(p.estoque).toBeNull();
    expect(p.aviso).toMatch(/Full/);
    expect(p.enviarPreco).toBe(true);
  });
  it("sem produto ligado: nada", () => {
    expect(planejarEnvio(cfg, { produto_id: null })).toMatchObject({ enviarEstoque: false, enviarPreco: false, aviso: expect.stringMatching(/ligue/) });
  });
});

describe("situação do anúncio", () => {
  const sit = (a: Parameters<typeof situacaoAnuncio>[1], c: ConfigEnvio | null = cfg) => situacaoAnuncio(c, a, planejarEnvio(c ?? { enviar_estoque: false, enviar_preco: false }, a));
  it("cada situação", () => {
    expect(sit({ produto_id: null })).toBe("sem_produto");
    expect(sit(peca, null)).toBe("desligado");
    expect(sit({ ...peca, ultimo_preco: 50 })).toBe("aguardando");
    expect(sit({ ...peca, preco_base: 10 })).toBe("erro");
    expect(sit({ ...peca, na_fila: true })).toBe("na_fila");
    expect(sit(peca)).toBe("a_enviar");
    expect(sit({ ...peca, ultimo_estoque: 10, ultimo_preco: 110 })).toBe("em_dia");
    expect(sit({ ...peca, ultimo_estoque: 10, ultimo_preco: 110, erro: "Mercado Livre fora do ar" })).toBe("erro");
    expect(sit({ ...peca, ultimo_estoque: 10, ultimo_preco: 110, erro: "x", na_fila: true })).toBe("na_fila");
  });
  it("comPlano junta plano e situação de cada linha", () => {
    const linha = { ...peca, anuncio_id: "a1", ml_item_id: "MLB1", ultimo_estoque: 10, ultimo_preco: 110 } as LinhaAnuncio;
    const conta = { id: "c1", enviar_estoque: true, enviar_preco: true, preco_ajuste: 10, estoque_seguranca: 2, trava_preco: 20 } as never;
    const [r] = comPlano([linha], conta);
    expect(r.situacao).toBe("em_dia");
    expect(r.plano.estoque).toBe(10);
    expect(comPlano([linha], null)[0].situacao).toBe("desligado");
  });
  it("ajustes da conta com valores vazios", () => {
    expect(configDaConta({ enviar_estoque: true, preco_ajuste: "5.5", estoque_maximo: null, trava_preco: null }))
      .toEqual({ enviar_estoque: true, enviar_preco: false, preco_ajuste: 5.5, estoque_seguranca: 0, estoque_maximo: null, trava_preco: 0 });
  });
});

describe("anúncios lidos do Mercado Livre", () => {
  it("anúncio sem variação", () => {
    const item = { id: "MLB111", title: "Peça de exemplo", price: 59.9, available_quantity: 4, status: "active", shipping: { logistic_type: "cross_docking" },
      attributes: [{ id: "SELLER_SKU", value_name: "EX-01" }] };
    expect(anunciosDoItem(item)).toEqual([
      { item_id: "MLB111", variation_id: "", titulo: "Peça de exemplo", sku: "EX-01", preco: 59.9, estoque: 4, status: "active", logistica: "cross_docking" },
    ]);
  });
  it("uma linha por variação, com o SKU de cada uma", () => {
    const item = { id: "MLB222", title: "Copo de exemplo", price: 20, status: "paused", variations: [
      { id: 9001, price: 20, available_quantity: 3, seller_custom_field: "CP-300", attribute_combinations: [{ value_name: "300 ml" }] },
      { id: 9002, available_quantity: 0, attributes: [{ id: "SELLER_SKU", value_name: "CP-500" }], attribute_combinations: [{ value_name: "500 ml" }, { value_name: "Azul" }] },
    ] };
    const r = anunciosDoItem(item);
    expect(r.map((x) => [x.variation_id, x.sku, x.titulo, x.preco, x.estoque])).toEqual([
      ["9001", "CP-300", "Copo de exemplo (300 ml)", 20, 3],
      ["9002", "CP-500", "Copo de exemplo (500 ml / Azul)", 20, 0],
    ]);
  });
  it("ignora o que não é anúncio", () => {
    expect(anunciosDoItem(null)).toEqual([]);
    expect(anunciosDoItem({ id: "abc" })).toEqual([]);
  });
  it("endereços da API e do anúncio", () => {
    expect(caminhoAnuncio("MLB111")).toBe("/items/MLB111");
    expect(caminhoAnuncio("MLB222", "9001")).toBe("/items/MLB222/variations/9001");
    expect(linkAnuncio("MLB111")).toBe("https://produto.mercadolivre.com.br/MLB-111");
  });
});

describe("tentativas e resumo", () => {
  it("erro passageiro tenta de novo com espera crescente", () => {
    expect(erroPassageiro(503)).toBe(true);
    expect(erroPassageiro(429)).toBe(true);
    expect(erroPassageiro(null)).toBe(true);
    expect(erroPassageiro(400)).toBe(false);
    expect([1, 2, 3, 4, 10].map(esperaMinutos)).toEqual([1, 2, 4, 8, 60]);
  });
  it("texto do resumo", () => {
    expect(textoResumoEnvio({ enviados: 3, em_dia: 1, aguardando: 1, erros: 0, restam: 0 })).toBe("3 anúncios atualizados · 1 já em dia · 1 esperando aprovação do preço");
    expect(textoResumoEnvio({ enviados: 0, erros: 0 })).toBe("Nada para enviar");
    expect(textoResumoEnvio({ aviso: "nenhuma conta conectada" })).toBe("Nenhuma conta conectada");
    expect(textoResumoEnvio({ enviados: 1, parou: "limite" })).toBe("1 anúncio atualizado. Parou: limite");
  });
});
