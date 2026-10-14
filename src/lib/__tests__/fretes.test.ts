import { describe, expect, it } from "vitest";
import {
  analisarAprovacao, calcularMetricas, custoFrete, diferencaFrete, faltandoParaCotar, freteDivergente, maisBarataValida, somarMes,
  totaisCarga, totalCotacao, volumesIncompletos, type CotacaoEnvio, type Envio, type PedidoValores, type Volume,
} from "../fretes";

const HOJE = "2026-10-14";
const cot = (id: string, valor: number, extra: Partial<CotacaoEnvio> = {}): CotacaoEnvio => ({
  id, envio_id: "E1", transportadora_id: `T-${id}`, transportadora_nome: `Transp ${id}`, valor, prazo_dias: 5, validade: "2026-10-20",
  observacoes: null, escolhida: false, ativa: true, created_at: "2026-10-10T10:00:00Z", ...extra,
});
const engradado: Volume = { descricao: "Máquina Q050 em engradado", quantidade: 1, largura_cm: 80, altura_cm: 120, comprimento_cm: 100, peso_kg: 180 };
const caixa: Volume = { descricao: "Caixa de peças", quantidade: 2, largura_cm: 40, altura_cm: 30, comprimento_cm: 30, peso_kg: 5 };

describe("freteDivergente (R$ 1,00 ou 2% entre aprovado e faturado)", () => {
  it("sem os dois valores não há divergência", () => {
    expect(freteDivergente(null, 100)).toBe(false);
    expect(freteDivergente(100, undefined)).toBe(false);
  });

  it("até R$ 1,00 e até 2% está dentro", () => {
    expect(freteDivergente(500, 501)).toBe(false);
    expect(freteDivergente(45, 45.9)).toBe(false); // 2% exato
    expect(freteDivergente(30, 30.6)).toBe(false); // 2% exato
  });

  it("passa de R$ 1,00 ou de 2% (para mais ou para menos)", () => {
    expect(freteDivergente(500, 501.01)).toBe(true);
    expect(freteDivergente(30, 30.61)).toBe(true); // R$ 0,61 mas 2,03%
    expect(freteDivergente(49.99, 50.99)).toBe(true); // R$ 1,00 mas 2,0004%
    expect(freteDivergente(500, 498)).toBe(true); // faturado abaixo também diverge
  });

  it("aprovado zero: só a regra dos R$ 1,00", () => {
    expect(freteDivergente(0, 0.5)).toBe(false);
    expect(freteDivergente(0, 1.5)).toBe(true);
  });

  it("diferencaFrete devolve R$ e % com 2 casas", () => {
    expect(diferencaFrete({ valor_aprovado: 1250, valor_final: 1312.5 })).toEqual({ reais: 62.5, pct: 0.05, divergente: true });
    expect(diferencaFrete({ valor_aprovado: 0, valor_final: 0.3 })).toEqual({ reais: 0.3, pct: null, divergente: false });
    expect(diferencaFrete({ valor_aprovado: 100, valor_final: null })).toBeNull();
  });
});

describe("cotações", () => {
  it("total = frete + adicionais, em centavos; valor_total gravado vence", () => {
    expect(totalCotacao({ valor: 850, adicionais: [{ tipo: "tde", valor: 85.5 }, { tipo: "pedagio", valor: 12.3 }] })).toBe(947.8);
    expect(totalCotacao({ valor: 0.1, adicionais: [{ tipo: "gris", valor: 0.2 }] })).toBe(0.3);
    expect(totalCotacao({ valor: 850, valor_total: 900, adicionais: [{ tipo: "tde", valor: 85.5 }] })).toBe(900);
  });

  it("a mais barata considera só ativas e na validade; empate vai para a mais antiga", () => {
    const lista = [
      cot("vencida", 300, { validade: "2026-10-13" }), cot("inativa", 350, { ativa: false }),
      cot("cara", 600), cot("nova", 480, { created_at: "2026-10-12T10:00:00Z" }), cot("antiga", 480, { created_at: "2026-10-11T10:00:00Z" }),
    ];
    expect(maisBarataValida(lista, HOJE)?.id).toBe("antiga");
    expect(maisBarataValida([cot("v", 100, { validade: "2026-01-01" })], HOJE)).toBeNull();
  });

  it("aprovar a mais cara exige justificativa; vencida ou carga incompleta bloqueia", () => {
    const barata = cot("barata", 480), cara = cot("cara", 600);
    const envio: Partial<Envio> = { volumes: [engradado] };
    const a = analisarAprovacao(cara, [barata, cara], envio, HOJE);
    expect(a).toMatchObject({ bloqueio: null, maisCara: true, troca: false, precisaJustificativa: true });
    expect(analisarAprovacao(barata, [barata, cara], envio, HOJE).precisaJustificativa).toBe(false);
    // diferença abaixo de meio centavo não conta como mais cara
    expect(analisarAprovacao(cot("quase", 480, { valor_total: 480.004 }), [barata], envio, HOJE).maisCara).toBe(false);
    expect(analisarAprovacao(cot("centavo", 480.01), [barata], envio, HOJE).maisCara).toBe(true);
    expect(analisarAprovacao(cot("v", 400, { validade: "2026-10-01" }), [barata], envio, HOJE).bloqueio).toBe("cotação vencida em 01/10/2026: peça a cotação de novo");
    expect(analisarAprovacao(barata, [barata], { volumes: [{ ...engradado, peso_kg: null }] }, HOJE).bloqueio).toMatch(/falta medida ou peso/);
  });

  it("trocar a transportadora depois de aprovado exige justificativa", () => {
    const envio: Partial<Envio> = { volumes: [engradado], aprovado_em: "2026-10-12", transportadora_id: "T-barata" };
    const r = analisarAprovacao(cot("outra", 470), [cot("barata", 480), cot("outra", 470)], envio, HOJE);
    expect(r.troca).toBe(true);
    expect(r.precisaJustificativa).toBe(true);
  });
});

describe("carga", () => {
  it("peso taxado = maior entre o real e o cubado (300 kg/m³)", () => {
    const t = totaisCarga([engradado, caixa]);
    expect(t.qtd).toBe(3);
    expect(t.peso).toBe(190);
    expect(t.cubagem).toBeCloseTo(1.032, 6);
    expect(t.pesoCubado).toBeCloseTo(309.6, 6);
    expect(t.pesoTaxado).toBeCloseTo(309.6, 6);
    expect(totaisCarga([{ quantidade: 1, peso_kg: 50, largura_cm: 10, altura_cm: 10, comprimento_cm: 10 }]).pesoTaxado).toBe(50);
  });

  it("quantidade negativa não conta; volume sem medida/peso aparece", () => {
    const t = totaisCarga([{ ...caixa, quantidade: -3 }, { quantidade: 1 }]);
    expect(t.qtd).toBe(1);
    expect(t.peso).toBe(0);
    expect(t.semMedida).toBe(1);
    expect(t.semPeso).toBe(1);
    expect(volumesIncompletos([engradado, { quantidade: 1, largura_cm: 40, peso_kg: "2,5" as unknown as number }]))
      .toEqual(["volume 2: altura, comprimento"]);
    expect(volumesIncompletos([])).toEqual(["nenhum volume"]);
  });

  it("o que falta para pedir cotação", () => {
    expect(faltandoParaCotar({ cep_origem: "88.330-000", cep_destino: "01310-100", volumes: [engradado], valor_mercadoria: 18900, tipo_equipamento: "Máquina" })).toEqual([]);
    expect(faltandoParaCotar({ cep_origem: "8833", volumes: [], valor_mercadoria: 0 }))
      .toEqual(["CEP de origem", "CEP de destino", "volumes", "valor da mercadoria", "tipo de equipamento"]);
  });
});

describe("custo do frete e indicadores", () => {
  const envio = (id: string, e: Partial<Envio>): Envio => ({
    id, pedido_id: null, cliente_id: null, unidade_id: null, vendedor_id: null, status: "entregue",
    cep_origem: null, cidade_origem: null, uf_origem: "SC", cep_destino: null, cidade_destino: null, uf_destino: "SP", endereco_destino: null,
    volumes: [], qtd_volumes: 1, peso_total_kg: 0, cubagem_m3: 0, valor_mercadoria: 0, seguro: false, tipo_equipamento: null, restricoes: [],
    restricoes_obs: null, prazo_desejado: null, modalidade: "cif", pagador: "empresa", centro_custo_id: null, transportadora_id: null,
    transportadora_nome: null, prazo_dias: null, valor_aprovado: null, aprovado_em: null, coleta_prevista: null, coletado_em: null,
    codigo_rastreio: null, entrega_prevista: null, entregue_em: null, comprovante_em: null, valor_final: null, cte_numero: null,
    observacoes: null, created_at: "2026-10-01T12:00:00Z", atualizado_em: "2026-10-01T12:00:00Z", ...e,
  });

  it("custo = faturado (CT-e), senão o aprovado", () => {
    expect(custoFrete({ valor_final: 310, valor_aprovado: 300 })).toBe(310);
    expect(custoFrete({ valor_final: null, valor_aprovado: 300 })).toBe(300);
    expect(custoFrete({ valor_final: 0, valor_aprovado: 300 })).toBe(0);
    expect(custoFrete({ valor_final: null, valor_aprovado: null })).toBeNull();
  });

  it("venda conta o pedido uma vez; frete da MF só quando ela paga", () => {
    const envios = [
      envio("E1", { pedido_id: "P1", valor_aprovado: 300, valor_final: 300 }),
      envio("E2", { pedido_id: "P1", valor_aprovado: 190, valor_final: 200 }),
      envio("E3", { pedido_id: "P2", pagador: "cliente", modalidade: "fob", valor_aprovado: 450, valor_final: 470 }),
    ];
    const pedidos = new Map<string, PedidoValores>([["P1", { valor_total: 10000, custo_itens: 6000 }], ["P2", { valor_total: 5000, custo_itens: null }]]);
    const m = calcularMetricas(envios, { cotacoes: [], ocorrencias: [], pedidos });
    expect(m.pedidos).toBe(2);
    expect(m.venda).toBe(15000);
    expect(m.freteEmpresa).toBe(500);
    expect(m.freteSobreVenda).toBeCloseTo(500 / 15000, 10);
    expect(m.pedidosComCusto).toBe(1);
    expect(m.margemAposFrete).toBeCloseTo(0.35, 10); // (10.000 − 6.000 − 500) / 10.000
    expect(m.custoTotal).toBe(970);
    expect(m.variacaoReais).toBe(30);
    expect(m.divergentes).toBe(2); // E2: R$ 10 (5,3%) · E3: R$ 20
  });

  it("mês anterior e seguinte atravessando o ano", () => {
    expect(somarMes("2026-01", -1)).toBe("2025-12");
    expect(somarMes("2026-12", 1)).toBe("2027-01");
  });
});
