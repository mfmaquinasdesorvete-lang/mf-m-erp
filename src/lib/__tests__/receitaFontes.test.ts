import { describe, expect, it } from "vitest";
import { cnaeFormatado, conciliarCliente, daBrasilApi, doCnpja, doCnpjWs } from "../../../supabase/functions/_shared/receita";
import { cnaesDoTexto, cnaesEmTexto } from "../cnpj";

// respostas de exemplo (inventadas), no formato de cada fonte
const CNPJA = {
  taxId: "11222333000181", alias: "SORVETERIA EXEMPLO", founded: "2019-03-12",
  status: { id: 2, text: "Ativa" },
  company: { name: "SORVETERIA EXEMPLO LTDA", size: { id: 1, acronym: "ME", text: "Microempresa" }, simples: { optant: true, since: "2019-03-12" }, simei: { optant: false, since: null } },
  address: { street: "Rua das Flores", number: "100", details: "Sala 2", district: "Centro", city: "São José", state: "SC", zip: "88101000" },
  phones: [{ area: "48", number: "999998888" }], emails: [{ address: "Contato@Exemplo.com.br" }],
  mainActivity: { id: 5611203, text: "Lanchonetes, casas de chá, de sucos e similares" },
  registrations: [{ number: "255.555.555", state: "SC", enabled: true }, { number: "123456", state: "PR", enabled: false }],
};

describe("fontes da Receita", () => {
  it("CNPJá: Receita, inscrições estaduais, Simples/MEI, atividade, porte e abertura numa consulta", () => {
    const r = doCnpja(CNPJA)!;
    expect(r.fonte).toBe("CNPJá");
    expect(r.situacao).toBe("ATIVA");
    expect(r.fantasia).toBe("Sorveteria Exemplo"); // tudo maiúsculo vira título
    expect(r.endereco).toMatchObject({ logradouro: "Rua das Flores", municipio: "São José", uf: "SC", cep: "88101000" });
    expect(r.email).toBe("contato@exemplo.com.br");
    expect(r.telefones).toEqual(["48999998888"]);
    expect(r.inscricoes).toEqual([{ numero: "255555555", uf: "SC", ativa: true }, { numero: "123456", uf: "PR", ativa: false }]);
    expect(r.simples).toEqual({ optante: true, desde: "2019-03-12" });
    expect(r.mei).toEqual({ optante: false, desde: null });
    expect(r.cnae).toEqual({ codigo: "5611-2/03", descricao: "Lanchonetes, casas de chá, de sucos e similares" });
    expect([r.porte, r.abertura]).toEqual(["Microempresa", "2019-03-12"]);
    expect(doCnpja({ message: "limite" })).toBeNull();
  });

  it("CNPJá preenche a inscrição estadual ativa do estado e marca a baixada", () => {
    const r = doCnpja(CNPJA)!;
    const x = conciliarCliente({ nome: "Sorveteria Exemplo Ltda", uf: "SC" }, r);
    expect(x.atualizar).toMatchObject({ inscricao_estadual: "255555555", contribuinte_icms: 1 });
    expect(x.ie_situacao).toBe("ativa");
    const y = conciliarCliente({ nome: "Sorveteria Exemplo Ltda", uf: "PR", inscricao_estadual: "123456" }, r);
    expect(y.ie_situacao).toBe("baixada");
    expect(y.tags).toContain("ie_baixada");
  });

  it("BrasilAPI e CNPJ.ws também trazem Simples/MEI e atividade quando informam", () => {
    const b = daBrasilApi({ razao_social: "X LTDA", opcao_pelo_simples: false, opcao_pelo_mei: true, data_opcao_pelo_mei: "2020-01-01",
      cnae_fiscal: 4789099, cnae_fiscal_descricao: "Comércio varejista", data_inicio_atividade: "2018-05-02", porte: "MICRO EMPRESA" })!;
    expect([b.simples?.optante, b.mei, b.cnae?.codigo, b.abertura]).toEqual([false, { optante: true, desde: "2020-01-01" }, "4789-0/99", "2018-05-02"]);
    const w = doCnpjWs({ razao_social: "Y LTDA", porte: { descricao: "Demais" }, simples: { simples: "Não", mei: "Não" },
      estabelecimento: { atividade_principal: { id: "2829199", descricao: "Fabricação de outras máquinas" }, data_inicio_atividade: "2022-07-01", inscricoes_estaduais: [] } })!;
    expect([w.simples?.optante, w.mei?.optante, w.cnae?.codigo, w.porte]).toEqual([false, false, "2829-1/99", "Demais"]);
    expect(cnaeFormatado("5611203")).toBe("5611-2/03");
  });

  it("atividades secundárias (CNAE) das três fontes; código 0 (sem secundária) fica de fora", () => {
    const sec = [{ codigo: "3314-7/12", descricao: "Manutenção de máquinas" }, { codigo: "4661-3/00", descricao: "Comércio atacadista de máquinas" }];
    expect(daBrasilApi({ razao_social: "X", cnaes_secundarios: [{ codigo: 3314712, descricao: "Manutenção de máquinas" },
      { codigo: 4661300, descricao: "Comércio atacadista de máquinas" }] })!.cnaes_secundarios).toEqual(sec);
    expect(daBrasilApi({ razao_social: "X", cnaes_secundarios: [{ codigo: 0, descricao: "" }] })!.cnaes_secundarios).toEqual([]);
    expect(doCnpjWs({ razao_social: "Y", estabelecimento: { atividades_secundarias: [{ id: "3314712", descricao: "Manutenção de máquinas" },
      { id: "4661300", descricao: "Comércio atacadista de máquinas" }] } })!.cnaes_secundarios).toEqual(sec);
    expect(doCnpja({ ...CNPJA, sideActivities: [{ id: 3314712, text: "Manutenção de máquinas" }, { id: 4661300, text: "Comércio atacadista de máquinas" }] })!
      .cnaes_secundarios).toEqual(sec);
    expect(doCnpja(CNPJA)!.cnaes_secundarios).toEqual([]);
  });

  it("CNAEs secundários na tela da unidade: texto de uma linha por atividade e de volta", () => {
    const lista = [{ codigo: "3314-7/12", descricao: "Manutenção de máquinas" }, { codigo: "4661-3/00", descricao: "Comércio atacadista" }];
    expect(cnaesEmTexto(lista)).toBe("3314-7/12 Manutenção de máquinas\n4661-3/00 Comércio atacadista");
    expect(cnaesDoTexto(cnaesEmTexto(lista))).toEqual(lista);
    // sem máscara, com traço ou dois-pontos, linhas em branco
    expect(cnaesDoTexto("3314712 - Manutenção de máquinas\n\n4661-3/00: Comércio atacadista\n")).toEqual(lista);
    expect(cnaesDoTexto("Manutenção sem código")).toEqual([]);
    expect(cnaesEmTexto(null)).toBe("");
  });
});
