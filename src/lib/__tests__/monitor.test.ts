import { describe, expect, it } from "vitest";
import {
  AUTOMACOES, ETAPAS, agendaEmPortugues, diagnosticoMonitor, etapasPreenchidas, intervaloCron, resumoSaude, situacaoAutomacao, situacaoBackup,
  type Automacao, type Saude,
} from "../monitor";

const agora = "2026-10-17T03:00:00Z";
const ha = (min: number) => new Date(new Date(agora).getTime() - min * 60000).toISOString();
const auto = (agenda: string, minAtras: number | null, x: Partial<Automacao> = {}): Automacao => ({
  nome: "erp-teste", agenda, ativo: true, ultima: minAtras == null ? null : ha(minAtras), ultima_situacao: minAtras == null ? null : "succeeded",
  ultima_seg: 0.1, rodadas_24h: 10, falhas_24h: 0, falhas_7d: 0, ultimo_erro: null, ultimo_erro_em: null, ...x,
});

describe("monitor das automações", () => {
  it("intervalo da agenda nos formatos usados no ERP (o maior espaço entre duas rodadas)", () => {
    expect(intervaloCron("* * * * *")).toBe(1);
    expect(intervaloCron("*/5 * * * *")).toBe(5);
    expect(intervaloCron("11,41 * * * *")).toBe(30);
    expect(intervaloCron("13 * * * *")).toBe(60);
    expect(intervaloCron("23 */4 * * *")).toBe(240);
    expect(intervaloCron("7 11 * * *")).toBe(1440);
    expect(intervaloCron("0 9 1 * *")).toBe(7 * 1440);
  });

  it("agenda em português no horário de Brasília (UTC−3)", () => {
    expect(agendaEmPortugues("* * * * *")).toBe("a cada minuto");
    expect(agendaEmPortugues("*/15 * * * *")).toBe("a cada 15 minutos");
    expect(agendaEmPortugues("11,41 * * * *")).toBe("a cada 30 minutos");
    expect(agendaEmPortugues("13 * * * *")).toBe("de hora em hora");
    expect(agendaEmPortugues("17 */4 * * *")).toBe("a cada 4 horas");
    expect(agendaEmPortugues("7 11 * * *")).toBe("todo dia às 08h07");
    expect(agendaEmPortugues("15 2 * * *")).toBe("todo dia às 23h15");
  });

  it("situação: falhou, atrasada (mais de 2 intervalos), falhou e voltou, ainda não rodou, desligada, em dia", () => {
    expect(situacaoAutomacao(auto("*/5 * * * *", 3), agora)).toBe("ok");
    expect(situacaoAutomacao(auto("*/5 * * * *", 3, { ultima_situacao: "failed" }), agora)).toBe("falhou");
    // a rodada em andamento não é falha (o vigia chegou a avisar que ele mesmo falhava)
    expect(situacaoAutomacao(auto("13 * * * *", 0, { ultima_situacao: "running" }), agora)).toBe("ok");
    expect(situacaoAutomacao(auto("*/5 * * * *", 16), agora)).toBe("atrasada");
    expect(situacaoAutomacao(auto("7 11 * * *", 16 * 60), agora)).toBe("ok");
    expect(situacaoAutomacao(auto("7 11 * * *", 50 * 60), agora)).toBe("atrasada");
    expect(situacaoAutomacao(auto("*/5 * * * *", 3, { falhas_24h: 2 }), agora)).toBe("instavel");
    expect(situacaoAutomacao(auto("7 11 * * *", null), agora)).toBe("aguardando");
    expect(situacaoAutomacao(auto("* * * * *", 0, { ativo: false }), agora)).toBe("desligada");
  });

  it("backup: em dia até 30 horas; parado com os dias e se nem avisou o ERP", () => {
    expect(situacaoBackup({ ultimo_ok: ha(20 * 60), falhas_seguidas: 0, ultimo: null }, agora).ok).toBe(true);
    const nunca = situacaoBackup({ ultimo_ok: null, falhas_seguidas: 5, ultimo: { em: ha(45 * 60), status: "erro", detalhe: null, hostinger_em: null } }, agora);
    expect(nunca.ok).toBe(false);
    expect(nunca.texto).toBe("Nenhuma cópia guardada até hoje; o backup de hoje nem avisou o ERP");
    const tres = situacaoBackup({ ultimo_ok: ha(3 * 1440), falhas_seguidas: 2, ultimo: { em: ha(60), status: "erro", detalhe: null, hostinger_em: null } }, agora);
    expect([tres.dias, tres.texto]).toEqual([3, "3 dias sem cópia guardada; 2 tentativa(s) com erro seguidas"]);
  });

  it("resumo: o grave primeiro (backup, automação parada, fila grave), depois o leve; e vira o diagnóstico do registro", () => {
    const s: Saude = {
      agora, historico_linhas: 100,
      automacoes: [auto("*/5 * * * *", 3, { nome: "erp-nfe-processar" }), auto("*/5 * * * *", 30, { nome: "erp-email-caixa" }), auto("* * * * *", 0, { nome: "x", falhas_24h: 1 })],
      filas: [{ chave: "nfe_erro", qtd: 2, desde: ha(2000) }, { chave: "extrato", qtd: 50, total: 200, desde: ha(100) }, { chave: "avisos", qtd: 0, desde: null }],
      backup: { ultimo_ok: null, falhas_seguidas: 1, ultimo: { em: ha(60), status: "erro", detalhe: null, hostinger_em: null } },
      chamadas: { ok: 90, erro: 1, tempo_esgotado: 0, desde: ha(360), ultimo_erro: "500" },
    };
    const r = resumoSaude(s, agora);
    expect(r.nivel).toBe("critico");
    expect(r.contagem).toMatchObject({ ok: 1, atrasada: 1, instavel: 1 });
    expect(r.problemas[0]).toMatch(/^Backup: Nenhuma cópia/);
    expect(r.problemas[1]).toMatch(/^Automação Caixa de e-mail: não roda desde/);
    expect(r.problemas).toContain("NF-e com erro: 2");
    expect(r.problemas).toContain("Extrato a conciliar: 50 de 200 (25%)");
    expect(r.problemas.indexOf("NF-e com erro: 2")).toBeLessThan(r.problemas.indexOf("Extrato a conciliar: 50 de 200 (25%)"));
    expect(diagnosticoMonitor(s, agora).split("\n")[0]).toBe("1 de 3 automações em dia ou esperando a 1ª rodada.");
    const tudoBem: Saude = { ...s, automacoes: [s.automacoes[0]], filas: [], chamadas: { ...s.chamadas!, erro: 0 }, backup: { ultimo_ok: ha(60), falhas_seguidas: 0, ultimo: null } };
    expect(resumoSaude(tudoBem, agora)).toMatchObject({ nivel: "ok", problemas: [] });
  });

  it("registro em 6 etapas na ordem pedida e todas as automações do banco com nome em português", () => {
    expect(ETAPAS.map((e) => e.id)).toEqual(["entrada", "diagnostico", "decisao", "entrega", "validacao", "proxima_acao"]);
    expect(etapasPreenchidas({ entrada: "AUDIT", diagnostico: "  ", decisao: "x" })).toBe(2);
    for (const k of ["erp-nfe-processar", "erp-vigiar-sistema", "erp-clientes-receita", "erp-parcelamentos-avisos"]) expect(AUTOMACOES[k]?.nome).toBeTruthy();
  });
});
