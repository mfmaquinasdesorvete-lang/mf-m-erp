import { describe, expect, it } from "vitest";
import {
  agruparRegioes, chaveRegiao, chaveUf, diasUteis, diasUteisDoMes, ehDiaUtil, ehFeriado, faixa, faltaPorDia, fimDoMes, hojeBrasil,
  lerChaveRegiao, lerNumero, mesesAte, normalizarLinhas, pctAtingido, planilhaMetas, projecao, rankingVendedores, regiaoDaUf,
  resumoMeta, rotuloRegiao, serieMetas, somarMeses, UFS, variacao, type LinhaApuracao,
} from "../metas";
import { podeVer } from "../permissoes";

// dados inventados
const linha = (x: Partial<LinhaApuracao>): LinhaApuracao => ({
  mes: "2026-10-01", tipo: "vendedor", chave: "v1", vendedor_id: "v1", regiao: null, nome: "Vendedor Exemplo",
  meta: null, meta_maquinas: null, meta_margem: null, meta_origem: null, observacao: null,
  realizado: 0, vendas: 0, devolucoes: 0, maquinas: 0, margem_pct: null, margem_base: 0,
  pct: null, dias_uteis: 21, dias_passados: 11, projecao: null, falta: null, falta_por_dia: null,
  ano_anterior: 0, ano_anterior_parcial: 0, variacao_ano: null, ...x,
});

describe("regiões do IBGE", () => {
  it("acha a região pelo estado, sem diferença de maiúsculas", () => {
    expect(regiaoDaUf("sc")).toBe("Sul");
    expect(regiaoDaUf(" SP ")).toBe("Sudeste");
    expect(regiaoDaUf("DF")).toBe("Centro-Oeste");
    expect(regiaoDaUf("AM")).toBe("Norte");
    expect(regiaoDaUf("BA")).toBe("Nordeste");
    expect(regiaoDaUf("XX")).toBeNull();
    expect(regiaoDaUf(null)).toBeNull();
  });
  it("tem os 27 estados, cada um numa região só", () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(UFS).size).toBe(27);
  });
  it("lê e escreve a chave gravada na meta", () => {
    expect(chaveUf("pr")).toBe("UF:PR");
    expect(chaveRegiao("Centro-Oeste")).toBe("REG:Centro-Oeste");
    expect(lerChaveRegiao("UF:PR")).toEqual({ nivel: "uf", uf: "PR", regiao: "Sul" });
    expect(lerChaveRegiao("REG:Nordeste")).toEqual({ nivel: "regiao", regiao: "Nordeste" });
    expect(lerChaveRegiao("REG:Leste")).toBeNull();
    expect(lerChaveRegiao("UF:--")).toBeNull();
    expect(rotuloRegiao("UF:SC")).toBe("Santa Catarina (SC)");
    expect(rotuloRegiao("REG:Sul")).toBe("Região Sul");
    expect(rotuloRegiao("UF:--")).toBe("Sem estado");
  });
});

describe("dias úteis", () => {
  it("feriados nacionais fixos; Consciência Negra só a partir de 2024", () => {
    expect(ehFeriado("2026-12-25")).toBe(true);
    expect(ehFeriado("2026-04-21")).toBe(true);
    expect(ehFeriado("2026-11-20")).toBe(true);
    expect(ehFeriado("2023-11-20")).toBe(false);
    expect(ehFeriado("2026-11-19")).toBe(false);
  });
  it("sábado, domingo e feriado não são dias úteis", () => {
    expect(ehDiaUtil("2026-10-17")).toBe(false); // sábado
    expect(ehDiaUtil("2026-10-18")).toBe(false); // domingo
    expect(ehDiaUtil("2026-10-12")).toBe(false); // segunda, feriado
    expect(ehDiaUtil("2026-10-16")).toBe(true); // sexta
  });
  it("conta os dias úteis do período e do mês", () => {
    expect(diasUteis("2026-10-01", "2026-10-31")).toBe(21); // 22 dias de semana menos o dia 12
    expect(diasUteis("2026-11-01", "2026-11-30")).toBe(19); // 21 menos 02/11 e 20/11 (15/11 cai num domingo)
    expect(diasUteis("2026-10-10", "2026-10-01")).toBe(0);
    expect(fimDoMes("2026-02")).toBe("2026-02-28");
    expect(fimDoMes("2028-02-10")).toBe("2028-02-29");
  });
  it("separa os dias passados (até hoje, inclusive) dos que faltam", () => {
    expect(diasUteisDoMes("2026-10", "2026-10-16")).toEqual({ total: 21, passados: 11, restantes: 10 });
    expect(diasUteisDoMes("2026-10", "2026-10-18")).toEqual({ total: 21, passados: 11, restantes: 10 }); // fim de semana não conta
    expect(diasUteisDoMes("2026-09", "2026-10-16")).toEqual({ total: 21, passados: 21, restantes: 0 }); // mês que acabou
    expect(diasUteisDoMes("2026-12", "2026-10-16")).toEqual({ total: 22, passados: 0, restantes: 22 }); // mês futuro
  });
  it("hoje é o dia de Brasília, não o de UTC", () => {
    expect(hojeBrasil(new Date("2026-10-17T02:00:00Z"))).toBe("2026-10-16");
    expect(hojeBrasil(new Date("2026-10-17T12:00:00Z"))).toBe("2026-10-17");
  });
  it("soma meses e lista os últimos meses", () => {
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-11-01", 2)).toBe("2027-01");
    expect(mesesAte("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("% atingido, projeção e faixa de cor", () => {
  it("% da meta com 1 casa; sem meta é null", () => {
    expect(pctAtingido(4170, 5000)).toBe(83.4);
    expect(pctAtingido(100, 0)).toBeNull();
    expect(pctAtingido(100, null)).toBeNull();
  });
  it("faixas: vermelho abaixo de 70%, amarelo de 70% a 99%, verde a partir de 100%", () => {
    expect(faixa(69.9)).toBe("vermelho");
    expect(faixa(70)).toBe("amarelo");
    expect(faixa(99.9)).toBe("amarelo");
    expect(faixa(100)).toBe("verde");
    expect(faixa(150)).toBe("verde");
    expect(faixa(null)).toBe("sem_meta");
  });
  it("projeção pelo ritmo dos dias úteis passados", () => {
    expect(projecao(4170, 11, 21)).toBe(7960.91);
    expect(projecao(5000, 21, 21)).toBe(5000);
    expect(projecao(0, 0, 21)).toBeNull();
  });
  it("quanto falta por dia útil", () => {
    expect(faltaPorDia(5000, 0, 10)).toBe(500);
    expect(faltaPorDia(5000, 6000, 10)).toBe(0); // já bateu
    expect(faltaPorDia(5000, 1000, 0)).toBeNull(); // o mês acabou
    expect(faltaPorDia(null, 1000, 5)).toBeNull();
  });
  it("resumo do mês igual ao do banco", () => {
    expect(resumoMeta(5000, 4170, "2026-10", "2026-10-16")).toEqual({
      pct: 83.4, faixa: "amarelo", diasUteis: 21, diasPassados: 11, diasRestantes: 10,
      projecao: 7960.91, pctProjecao: 159.2, falta: 830, faltaPorDia: 83,
    });
  });
  it("variação sobre o ano anterior", () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(50, 0)).toBeNull();
  });
});

describe("campos e cópia de metas", () => {
  it("lê números digitados no jeito brasileiro", () => {
    expect(lerNumero("1.234,56")).toBe(1234.56);
    expect(lerNumero("R$ 20.000")).toBe(20000);
    expect(lerNumero("1500")).toBe(1500);
    expect(lerNumero("12,5%")).toBe(12.5);
    expect(lerNumero("1.5")).toBe(1.5);
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNaN();
  });
});

describe("linhas da apuração", () => {
  it("converte o que o banco manda como texto", () => {
    const [l] = normalizarLinhas([{ mes: "2026-10-01", tipo: "empresa", chave: "empresa", nome: "Empresa", meta: "5000.00", realizado: "4170.00", pct: "83.4", projecao: null, vendas: 2, dias_uteis: 21, dias_passados: 11 }]);
    expect(l.meta).toBe(5000);
    expect(l.realizado).toBe(4170);
    expect(l.projecao).toBeNull();
    expect(l.devolucoes).toBe(0);
    expect(normalizarLinhas(null)).toEqual([]);
  });

  it("ranking: com meta pelo %, depois sem meta, \"Sem vendedor\" por último", () => {
    const r = rankingVendedores([
      linha({ chave: "sem_vendedor", vendedor_id: null, nome: "Sem vendedor", realizado: 9000 }),
      linha({ chave: "a", nome: "Vendedor A", meta: 1000, realizado: 500, pct: 50 }),
      linha({ chave: "b", nome: "Vendedor B", realizado: 8000 }),
      linha({ chave: "c", nome: "Vendedor C", meta: 1000, realizado: 1200, pct: 120 }),
      linha({ chave: "d", nome: "Vendedor D", realizado: 0, ano_anterior: 5000 }), // só vendeu no ano anterior
      linha({ tipo: "empresa", chave: "empresa", nome: "Empresa", realizado: 99999 }),
    ]);
    expect(r.map((l) => l.chave)).toEqual(["c", "a", "b", "sem_vendedor"]);
  });

  it("agrupa os estados nas regiões; sem a linha da região soma os estados", () => {
    const linhas = [
      linha({ tipo: "regiao", chave: "UF:SC", regiao: "UF:SC", nome: "SC", meta: 1500, realizado: 1800, ano_anterior: 1000 }),
      linha({ tipo: "regiao", chave: "UF:PR", regiao: "UF:PR", nome: "PR", realizado: 300 }),
      linha({ tipo: "regiao", chave: "UF:SP", regiao: "UF:SP", nome: "SP", meta: 800, realizado: 100 }),
      linha({ tipo: "regiao", chave: "REG:Sudeste", regiao: "REG:Sudeste", nome: "Sudeste", meta: 4000, realizado: 100, pct: 2.5, meta_origem: "cadastrada", projecao: 190.91 }),
    ];
    const g = agruparRegioes(linhas, "2026-10", "2026-10-16");
    expect(g.map((x) => x.regiao)).toEqual(["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"]);
    const sul = g.find((x) => x.regiao === "Sul")!;
    expect(sul).toMatchObject({ meta: 1500, realizado: 2100, pct: 140, faixa: "verde", metaPelosEstados: true, anoAnterior: 1000, variacaoAno: 110 });
    expect(sul.ufs.map((u) => u.chave)).toEqual(["UF:SC", "UF:PR"]);
    const sudeste = g.find((x) => x.regiao === "Sudeste")!;
    expect(sudeste).toMatchObject({ meta: 4000, realizado: 100, pct: 2.5, faixa: "vermelho", metaPelosEstados: false, projecao: 190.91 });
    expect(g.find((x) => x.regiao === "Norte")).toMatchObject({ meta: null, realizado: 0, faixa: "sem_meta", ufs: [] });
  });

  it("série meta x realizado por mês e planilha com uma aba por quadro", () => {
    const linhas = [
      linha({ mes: "2026-09-01", tipo: "empresa", chave: "empresa", nome: "Empresa", meta: 10000, realizado: 6000, pct: 60, ano_anterior: 5000 }),
      linha({ mes: "2026-10-01", tipo: "empresa", chave: "empresa", nome: "Empresa", realizado: 4000 }),
      linha({ mes: "2026-10-01", chave: "a", nome: "Vendedor A", meta: 1000, realizado: 1100, pct: 110 }),
      linha({ mes: "2026-10-01", tipo: "regiao", chave: "REG:Sul", regiao: "REG:Sul", nome: "Sul", realizado: 4000 }),
    ];
    expect(serieMetas(linhas, ["2026-08", "2026-09", "2026-10"])).toEqual([
      { mes: "2026-08", meta: null, realizado: 0, anoAnterior: 0 },
      { mes: "2026-09", meta: 10000, realizado: 6000, anoAnterior: 5000 },
      { mes: "2026-10", meta: null, realizado: 4000, anoAnterior: 0 },
    ]);
    const abas = planilhaMetas(linhas, "2026-10", "Todas as unidades");
    expect(abas.map((a) => a.nome)).toEqual(["Empresa", "Vendedores", "Regiões e estados", "Evolução"]);
    expect(abas[1].linhas[0]).toMatchObject({ Posição: 1, Vendedor: "Vendedor A", Meta: 1000, Realizado: 1100, "% atingido": 110, Situação: "meta batida" });
    expect(abas[2].linhas[0]).toMatchObject({ "Região ou estado": "Região Sul", Realizado: 4000, Situação: "sem meta" });
    expect(abas[3].linhas).toHaveLength(2);
  });
});

describe("tela de metas por perfil", () => {
  it("vendas e financeiro abrem a tela; técnico e contador não", () => {
    expect(podeVer("vendas", "metas")).toBe(true);
    expect(podeVer("financeiro", "metas")).toBe(true);
    expect(podeVer("admin", "metas")).toBe(true);
    expect(podeVer("tecnico", "metas")).toBe(false);
    expect(podeVer("contador", "metas")).toBe(false);
  });
});
