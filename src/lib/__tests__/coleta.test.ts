import { describe, expect, it } from "vitest";
import {
  conferirAgendamento, enderecoColeta, frequenciaDe, mensagemColeta, proximosDiasColeta, resumoFrequencia, rotuloColeta, type FrequenciaColeta,
} from "../coleta";
import {
  corpoSimulacao, corpoToken, faltaParaCotarRte, lerCidade, lerSimulacao, mensagemRte,
} from "../../../supabase/functions/_shared/rodonaves";

const freq = (x: Partial<FrequenciaColeta> = {}): FrequenciaColeta => ({
  transportadora_id: "rte", unidade_id: "sc", dias: [1, 2, 3, 4, 5], manha: true, tarde: true, antecedencia_dias: 1, ...x,
});

describe("dias de coleta (como no portal da Rodonaves)", () => {
  it("sábado 17/10: de segunda 19/10 a sexta 23/10", () => {
    const d = proximosDiasColeta("2026-10-17");
    expect(d.map((x) => `${x.sigla} ${x.dia}`)).toEqual(["SEG 19/10", "TER 20/10", "QUA 21/10", "QUI 22/10", "SEX 23/10"]);
    expect(d.every((x) => x.disponivel)).toBe(true);
  });

  it("feriado nacional aparece apagado e não conta entre os 5", () => {
    const d = proximosDiasColeta("2026-10-30");
    expect(d[0]).toMatchObject({ data: "2026-11-02", disponivel: false, motivo: "Finados" });
    expect(d.filter((x) => x.disponivel).map((x) => x.dia)).toEqual(["03/11", "04/11", "05/11", "06/11", "09/11"]);
  });

  it("segue a frequência da transportadora e a antecedência", () => {
    const d = proximosDiasColeta("2026-10-17", freq({ dias: [2, 4], antecedencia_dias: 2 }), 2);
    expect(d.map((x) => `${x.sigla}${x.disponivel ? "" : "-"}`)).toEqual(["SEG-", "TER", "QUA-", "QUI"]);
    const sab = proximosDiasColeta("2026-10-17", freq({ dias: [1, 2, 3, 4, 5, 6], antecedencia_dias: 0 }), 1);
    expect(sab[0]).toMatchObject({ sigla: "SAB", disponivel: true });
  });

  it("confere a escolha com a mesma regra do banco", () => {
    expect(conferirAgendamento("2026-10-16", "manha", "2026-10-17")).toMatch(/hoje em diante/);
    expect(conferirAgendamento("2026-10-19", null, "2026-10-17")).toMatch(/período/);
    expect(conferirAgendamento("2026-10-24", "manha", "2026-10-17", freq())).toMatch(/no sábado/);
    expect(conferirAgendamento("2026-10-24", "manha", "2026-10-17", freq(), true)).toBeNull();
    expect(conferirAgendamento("2026-10-19", "tarde", "2026-10-17", freq({ tarde: false }))).toMatch(/de tarde/);
    expect(conferirAgendamento("2026-10-19", "manha", "2026-10-17", freq({ tarde: false }))).toBeNull();
  });

  it("frequência da filial ou, sem ela, da marca", () => {
    const lista = [freq({ transportadora_id: "marca" }), freq({ transportadora_id: "outra", unidade_id: "sp" })];
    expect(frequenciaDe(lista, { id: "filial", matriz_id: "marca" }, "sc")?.transportadora_id).toBe("marca");
    expect(frequenciaDe(lista, { id: "filial", matriz_id: "marca" }, "sp")).toBeNull();
    expect(frequenciaDe(lista, null, "sc")).toBeNull();
  });

  it("textos: resumo, rótulo, endereço e mensagem", () => {
    expect(resumoFrequencia(freq())).toBe("SEG a SEX · manhã e tarde");
    expect(resumoFrequencia(freq({ dias: [1, 3, 5], tarde: false }))).toBe("SEG, QUA e SEX · só manhã");
    expect(rotuloColeta("2026-10-19", "manha")).toBe("SEG 19/10 · Manhã (08h às 12h)");
    expect(enderecoColeta({ logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "São José", uf: "SC", cep: "88100000" }))
      .toBe("Rua A, 10 · Centro · São José/SC · CEP 88100-000");
    const m = mensagemColeta({ numero: 7, cep_destino: "01001000", volumes: [{ quantidade: 2, peso_kg: 40, largura_cm: 50, altura_cm: 100, comprimento_cm: 60 }], valor_mercadoria: 1000 },
      { data: "2026-10-19", periodo: "tarde", urgente: true, endereco: "Rua A, 10" });
    expect(m).toContain("coleta *de urgência* (envio #7)");
    expect(m).toContain("*Data:* SEG 19/10 · Tarde (13h às 18h)");
    expect(m).toContain("2 volumes, 80 kg, 0,6 m³");
  });
});

describe("Rodonaves: simulação de cotação", () => {
  const envio = {
    cep_origem: "88100-000", cep_destino: "01001-000", valor_mercadoria: "12500,50", peso_total_kg: 0,
    volumes: [{ quantidade: 1, peso_kg: 95, largura_cm: 60, altura_cm: 150, comprimento_cm: 70 }, { quantidade: 2, peso_kg: "2,5", largura_cm: 20, altura_cm: 20, comprimento_cm: 20 }],
  };

  it("monta o corpo como o simula-cotacao pede", () => {
    expect(corpoSimulacao(envio, "11.222.333/0001-81", 4500, 3550)).toEqual({
      CustomerTaxIdRegistration: "11222333000181", OriginZipCode: "88100000", OriginCityId: 4500, DestinationZipCode: "01001000", DestinationCityId: 3550,
      EletronicInvoiceValue: 12500.5, TotalWeight: 100,
      Packs: [{ AmountPackages: 1, Weight: 95, Length: 70, Height: 150, Width: 60 }, { AmountPackages: 2, Weight: 2.5, Length: 20, Height: 20, Width: 20 }],
    });
    expect(corpoToken("mf", "s&nh@")).toBe("auth_type=DEV&grant_type=password&username=mf&password=s%26nh%40");
  });

  it("diz o que falta para cotar", () => {
    expect(faltaParaCotarRte(envio, "11222333000181")).toEqual([]);
    expect(faltaParaCotarRte({ cep_destino: "123" }, null)).toEqual(["CNPJ da unidade", "CEP de origem", "CEP de destino", "valor da mercadoria", "peso"]);
  });

  it("lê cidade, valor, prazo e as mensagens de erro", () => {
    expect(lerCidade({ CityId: 4500, CityDescription: "SAO JOSE", UnitFederation: { Description: "SC" } })).toEqual({ id: 4500, nome: "SAO JOSE", uf: "SC" });
    expect(lerCidade([{ Message: "CEP não encontrado" }])).toEqual({ erro: "CEP não encontrado" });
    expect(lerSimulacao({ Value: 432.109, DeliveryTime: 5 })).toEqual({ valor: 432.11, prazo: 5 });
    expect(lerSimulacao({ Message: "Cliente remetente não encontrado" })).toEqual({ erro: "Cliente remetente não encontrado" });
    expect(mensagemRte({ error_description: "usuário ou senha inválidos" })).toBe("usuário ou senha inválidos");
  });
});
