import { describe, expect, it } from "vitest";
import {
  adicionarItem, anosDoExtrato, calcularOrcamento, errosClienteNovo, erroPortal, etapaPedido, extratoPorMes, filtrarPedidos,
  lerQuantidade, metaDoMes, planilhaComissoes, situacaoEntrega, textoConvite, totaisComissoes, whatsappDe,
  type ComissaoPortal, type PedidoPortal,
} from "../portal";
import { ehRepresentante, PAPEIS_ADICIONAIS, PAPEIS_INTERNOS, pode, podeVer, temPapel } from "../permissoes";

// dados inventados
const pedido = (x: Partial<PedidoPortal>): PedidoPortal => ({
  id: "p", numero: 1, status: "orcamento", criado_em: "2026-10-01T10:00:00Z", aprovado_em: null, total: 100, via_portal: true,
  cliente: "Sorveteria Exemplo", municipio: "Cidade Teste", uf: "SC", itens: 1, nf_numero: null, nf_serie: null, nf_em: null,
  rastreio: null, transportadora: null, envio_status: null, entrega_prevista: null, entregue_em: null, ...x,
});
const comissao = (x: Partial<ComissaoPortal>): ComissaoPortal => ({
  dia: "2026-10-05", pedido_numero: 10, cliente: "Cliente Teste", descricao: "Parcela 1/2", base: 1000, percentual: 5, valor: 50,
  situacao: "liberada", pago_em: null, ...x,
});

describe("papel representante", () => {
  it("não vê nenhuma tela do ERP nem faz ação", () => {
    expect(ehRepresentante("representante")).toBe(true);
    expect(ehRepresentante("vendas")).toBe(false);
    for (const t of ["painel", "pedidos", "clientes", "financeiro", "comissoes", "metas", "estoque", "notas"] as const) {
      expect(podeVer("representante", t)).toBe(false);
    }
    expect(pode("representante", "editar_pedidos")).toBe(false);
    expect(temPapel("representante", [], "vendas")).toBe(false);
  });
  it("não é papel adicional nem aparece na tabela de perfis internos", () => {
    expect(PAPEIS_ADICIONAIS).not.toContain("representante");
    expect(PAPEIS_INTERNOS.map((p) => p.value)).not.toContain("representante");
  });
});

describe("pedidos do portal", () => {
  const lista = [
    pedido({ id: "a", numero: 101, status: "orcamento", cliente: "Açaí do Centro" }),
    pedido({ id: "b", numero: 102, status: "faturado", nf_numero: "555", municipio: "Vila Nova" }),
    pedido({ id: "c", numero: 103, status: "entregue" }),
    pedido({ id: "d", numero: 104, status: "cancelado" }),
  ];
  it("filtra por situação e abertos", () => {
    expect(filtrarPedidos(lista, "abertos").map((p) => p.id)).toEqual(["a", "b"]);
    expect(filtrarPedidos(lista, "cancelado").map((p) => p.id)).toEqual(["d"]);
    expect(filtrarPedidos(lista, "todos")).toHaveLength(4);
  });
  it("busca por número, cliente sem acento, cidade e nota", () => {
    expect(filtrarPedidos(lista, "todos", "acai").map((p) => p.id)).toEqual(["a"]);
    expect(filtrarPedidos(lista, "todos", "vila").map((p) => p.id)).toEqual(["b"]);
    expect(filtrarPedidos(lista, "todos", "555").map((p) => p.id)).toEqual(["b"]);
    expect(filtrarPedidos(lista, "todos", "104").map((p) => p.id)).toEqual(["d"]);
  });
  it("etapa e situação da entrega", () => {
    expect(etapaPedido("orcamento")).toBe(1);
    expect(etapaPedido("entregue")).toBe(4);
    expect(etapaPedido("cancelado")).toBe(0);
    expect(situacaoEntrega(pedido({ status: "faturado", nf_numero: "9" }))).toBe("Nota emitida");
    expect(situacaoEntrega(pedido({ status: "faturado", rastreio: "XX1" }))).toBe("Enviado");
    expect(situacaoEntrega(pedido({ status: "faturado", envio_status: "transito", rastreio: "XX1" }))).toBe("Em trânsito");
    expect(situacaoEntrega(pedido({ status: "entregue" }))).toBe("Entregue");
    expect(situacaoEntrega(pedido({ status: "cancelado", nf_numero: "9" }))).toBeNull();
    expect(situacaoEntrega(pedido({ status: "orcamento" }))).toBeNull();
  });
});

describe("comissões", () => {
  const linhas = [
    comissao({ dia: "2026-09-10", situacao: "paga", valor: 30, pago_em: "2026-10-02" }),
    comissao({ dia: "2026-10-05", situacao: "liberada", valor: 50 }),
    comissao({ dia: "2026-11-15", situacao: "prevista", valor: 20.1 }),
    comissao({ dia: "2026-11-20", situacao: "prevista", valor: 0.2 }),
    comissao({ dia: "2025-12-01", situacao: "paga", valor: 10, pago_em: "2025-12-20" }),
  ];
  it("soma por situação sem erro de centavos", () => {
    expect(totaisComissoes(linhas)).toEqual({ prevista: 20.3, liberada: 50, paga: 40 });
  });
  it("agrupa por mês (paga no mês do pagamento), mais recente primeiro", () => {
    const meses = extratoPorMes(linhas);
    expect(meses.map((m) => m.mes)).toEqual(["2026-11", "2026-10", "2025-12"]);
    expect(meses[1]).toMatchObject({ mes: "2026-10", paga: 30, liberada: 50, prevista: 0 });
    expect(meses[0].linhas.map((l) => l.dia)).toEqual(["2026-11-20", "2026-11-15"]);
    expect(extratoPorMes(linhas, "2025").map((m) => m.mes)).toEqual(["2025-12"]);
    expect(anosDoExtrato(linhas)).toEqual(["2026", "2025"]);
  });
  it("planilha com as colunas do extrato", () => {
    const p = planilhaComissoes(linhas);
    expect(p).toHaveLength(5);
    expect(p[0]).toMatchObject({ Mês: "11/2026", Situação: "Prevista" });
    expect(Object.keys(p[0])).toEqual(["Mês", "Data", "Pedido", "Cliente", "Referência", "Base", "%", "Comissão", "Situação", "Paga em"]);
  });
});

describe("meta do mês", () => {
  it("% atingido, projeção e quanto falta", () => {
    const m = metaDoMes({ meta_mes: 10000, vendas: { mes: 5000, ano: 20000, pedidos_mes: 3 }, mes: "2026-10-01", hoje: "2026-10-16" });
    expect(m.meta).toBe(10000);
    expect(m.pct).toBe(50);
    expect(m.falta).toBe(5000);
    expect(m.faixa).toBe("vermelho");
    expect(m.projecao).toBeGreaterThan(5000);
  });
  it("sem meta cadastrada", () => {
    const m = metaDoMes({ meta_mes: null, vendas: { mes: 800, ano: 800, pedidos_mes: 1 }, mes: "2026-10-01", hoje: "2026-10-16" });
    expect(m.meta).toBeNull();
    expect(m.pct).toBeNull();
    expect(m.faixa).toBe("sem_meta");
  });
});

describe("orçamento", () => {
  it("lê quantidade com vírgula ou ponto", () => {
    expect(lerQuantidade("2")).toBe(2);
    expect(lerQuantidade("1,5")).toBe(1.5);
    expect(lerQuantidade("1.5")).toBe(1.5);
    expect(lerQuantidade("1.000,25")).toBe(1000.25);
    expect(lerQuantidade("0")).toBeNull();
    expect(lerQuantidade("abc")).toBeNull();
    expect(lerQuantidade("")).toBeNull();
  });
  it("soma o mesmo produto em vez de repetir", () => {
    const prod = { id: "x", descricao: "Peça exemplo", preco: 10, disponibilidade: "disponivel" as const };
    let itens = adicionarItem([], prod, 2);
    itens = adicionarItem(itens, prod, 1);
    itens = adicionarItem(itens, { ...prod, id: "y" });
    expect(itens).toHaveLength(2);
    expect(itens[0].quantidade).toBe(3);
  });
  it("totais como o banco: centavos por item e desconto sobre o subtotal", () => {
    const itens = [
      { produto_id: "a", descricao: "A", preco: 33.33, quantidade: 3 },
      { produto_id: "b", descricao: "B", preco: 0.1, quantidade: 0.333 },
    ];
    const r = calcularOrcamento(itens, 5, 10);
    expect(r.subtotal).toBe(100.02);
    expect(r.desconto).toBe(5);
    expect(r.total).toBe(95.02);
    expect(r.erro).toBeNull();
  });
  it("desconto acima do máximo não passa", () => {
    const itens = [{ produto_id: "a", descricao: "A", preco: 100, quantidade: 1 }];
    expect(calcularOrcamento(itens, 5.5, 5).erro).toMatch(/máximo de 5%/);
    expect(calcularOrcamento(itens, 5, 5).erro).toBeNull();
    expect(calcularOrcamento(itens, 1, 0).erro).toMatch(/Sem desconto liberado/);
    expect(calcularOrcamento(itens, -1, 5).erro).toMatch(/inválido/);
    expect(calcularOrcamento([], 0, 5).erro).toMatch(/ao menos um produto/);
  });
});

describe("cliente novo", () => {
  const ok = { nome: "Sorveteria Exemplo", cpf_cnpj: "529.982.247-25", municipio: "Cidade Teste", uf: "sc", whatsapp: "(48) 99999-0000", email: "" };
  it("aceita o mínimo certo (e-mail opcional)", () => {
    expect(errosClienteNovo(ok)).toEqual({});
    expect(errosClienteNovo({ ...ok, cpf_cnpj: "11.444.777/0001-61", email: "contato@exemplo.test" })).toEqual({});
  });
  it("aponta cada campo errado", () => {
    const e = errosClienteNovo({ nome: "A", cpf_cnpj: "52998224724", municipio: "", uf: "XX", whatsapp: "9999", email: "sem-arroba" });
    expect(Object.keys(e).sort()).toEqual(["cpf_cnpj", "email", "municipio", "nome", "uf", "whatsapp"]);
    expect(e.cpf_cnpj).toBe("CPF inválido");
    expect(errosClienteNovo({ ...ok, cpf_cnpj: "123" }).cpf_cnpj).toMatch(/11 números/);
  });
  it("WhatsApp obrigatório: só celular com DDD (a regra do banco)", () => {
    expect(errosClienteNovo({ ...ok, whatsapp: "(48) 3333-4444" }).whatsapp).toMatch(/celular/);
    expect(whatsappDe("+55 (48) 99999-0000")).toBe("48999990000");
    expect(whatsappDe("48 8888-7777")).toBe("48988887777");
    expect(whatsappDe("(48) 3333-4444")).toBeNull();
    expect(whatsappDe("")).toBeNull();
  });
});

describe("convite e mensagens", () => {
  it("texto do convite com o endereço do portal", () => {
    const t = textoConvite({ nome: "Fulano de Teste", email: " Rep@Exemplo.Test ", senha: "abcd-2345-efgh", site: "https://erp.exemplo.test/" });
    expect(t).toContain("Olá, Fulano!");
    expect(t).toContain("https://erp.exemplo.test/portal");
    expect(t).toContain("rep@exemplo.test");
    expect(t).toContain("abcd-2345-efgh");
  });
  it("traduz o erro da regra antiga do papel", () => {
    expect(erroPortal('new row for relation "usuarios_erp" violates check constraint "usuarios_erp_papel_check"')).toMatch(/aplique a migração/);
    expect(erroPortal("outro erro")).toBe("outro erro");
  });
});
