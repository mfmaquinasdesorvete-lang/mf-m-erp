import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CHATS_ATIVOS, avaliar, carregarTestes, coberturaPorAgente, montarPromptJuiz, normalizarFerramenta, resumir, validarDataset,
  type CasoNivel1, type CasoNivel2, type CasoNivel3, type CasoTeste, type DatasetTestes,
} from "../agentes/testesAgentes";

let dados: DatasetTestes;
const caso = <T extends CasoTeste>(id: string) => dados.test_cases.find((c) => c.test_id === id) as T;
const FIM = "\n\n📅 24/11/2026 · 10:00";

beforeAll(async () => {
  const txt = await readFile(fileURLToPath(new URL("../agentes/test_dataset.json", import.meta.url)), "utf8");
  dados = JSON.parse(txt);
});

describe("dataset dos testes dos chats", () => {
  it("segue o modelo e não tem erro", () => {
    const v = validarDataset(dados);
    expect(v.erros).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("cada um dos 18 chats tem um caso de cada nível (1, 2 e 3)", () => {
    const cob = coberturaPorAgente(dados);
    expect(Object.keys(cob).sort()).toEqual([...CHATS_ATIVOS].sort());
    for (const sig of CHATS_ATIVOS) expect(cob[sig]).toEqual({ 1: 1, 2: 1, 3: 1 });
  });
  it("aponta os erros de um dataset fora do modelo", () => {
    const ruim = JSON.parse(JSON.stringify(dados));
    ruim.test_cases[0].evaluation_config.deterministic_checks = ["inventada"];
    ruim.test_cases[1].evaluation_config.expected_tool_call.tool_name = "ferramenta_que_nao_existe";
    ruim.test_cases[2].evaluation_config.reference_trajectory[0].step = 9;
    ruim.test_cases[3].test_id = ruim.test_cases[0].test_id;
    const v = validarDataset(ruim);
    expect(v.ok).toBe(false);
    expect(v.erros.join("\n")).toMatch(/inventada/);
    expect(v.erros.join("\n")).toMatch(/ferramenta_que_nao_existe/);
    expect(v.erros.join("\n")).toMatch(/step precisa seguir a ordem/);
    expect(v.erros.join("\n")).toMatch(/test_id repetido/);
  });
  it("carrega as execuções com as 3 repetições e filtra por chat e nível", () => {
    const todas = carregarTestes(dados);
    expect(todas.execucoes).toHaveLength(54 * 3);
    const fis = carregarTestes(dados, { agente: "FIS", nivel: 2 });
    expect(fis.execucoes.map((e) => e.chave)).toEqual(["TC-FIS-STEP-01#1", "TC-FIS-STEP-01#2", "TC-FIS-STEP-01#3"]);
    expect(() => carregarTestes({ test_cases: [] })).toThrow(/inválido/);
  });
});

describe("nível 1: resposta final", () => {
  it("passa com as conferências fixas e a juíza dizendo sim a tudo", () => {
    const c = caso<CasoNivel1>("TC-FIS-E2E-01");
    const texto = "A nota foi recusada pela SEFAZ SC porque a inscrição da matriz não está habilitada. Não é erro do ERP; peça ao contador para olhar o SAT." + FIM;
    expect(avaliar(c, { nivel: 1, texto, vereditoJuiz: [true, true, true] }).pontuacao).toBe(1);
  });
  it("reprova sem a data e hora no fim, com CNPJ no texto ou com a juíza dizendo não", () => {
    const c = caso<CasoNivel1>("TC-FIS-E2E-01");
    const semData = avaliar(c, { nivel: 1, texto: "A nota foi recusada, não é erro do ERP.", vereditoJuiz: [true, true, true] });
    expect(semData.pontuacao).toBe(0);
    expect(semData.motivos.join()).toMatch(/termina_com_data_hora_brasilia/);
    const comCnpj = avaliar(c, { nivel: 1, texto: "A empresa 12.345.678/0001-90 não está habilitada para isso." + FIM, vereditoJuiz: [true, true, true] });
    expect(comCnpj.motivos.join()).toMatch(/sem_dados_sensiveis/);
    const juiza = avaliar(c, { nivel: 1, texto: "A nota foi recusada, não é erro do ERP." + FIM, vereditoJuiz: [true, false, true] });
    expect(juiza.pontuacao).toBe(0);
    expect(avaliar(c, { nivel: 1, texto: "Não é erro do ERP." + FIM }).motivos.join()).toMatch(/veredito/);
  });
  it("monta o pedido para a IA juíza com todas as perguntas", () => {
    const p = montarPromptJuiz(caso<CasoNivel1>("TC-GER-E2E-01"), "resposta");
    expect(p).toMatch(/1\. Consulta o banco/);
    expect(p).toMatch(/"respostas"/);
  });
});

describe("nível 2: escolha da ferramenta", () => {
  it("aceita a ferramenta certa com o argumento por 'contém' e corrige o prefixo do servidor", () => {
    const c = caso<CasoNivel2>("TC-FIS-STEP-01");
    const r = avaliar(c, { nivel: 2, chamada: { tool_name: "mcp__Supabase__execute_sql", arguments: { project_id: "x", query: "select * from notas_fiscais where status='erro'" } } });
    expect(r.pontuacao).toBe(1);
    expect(r.correcoes[0]).toMatch(/execute_sql/);
  });
  it("lê caminhos dentro dos argumentos (primeira opção dos botões)", () => {
    const c = caso<CasoNivel2>("TC-GER-STEP-01");
    const botoes = (label: string) => ({ questions: [{ question: "Publicar?", options: [{ label }, { label: "Ainda não" }] }] });
    expect(avaliar(c, { nivel: 2, chamada: { tool_name: "AskUserQuestion", arguments: botoes("Pode publicar") } }).pontuacao).toBe(1);
    expect(avaliar(c, { nivel: 2, chamada: { tool_name: "AskUserQuestion", arguments: botoes("Ainda não") } }).pontuacao).toBe(0);
    expect(avaliar(c, { nivel: 2, chamada: { tool_name: "Bash", arguments: { command: "scripts/publicar-site.sh" } } }).pontuacao).toBe(0);
  });
  it("confere a sessão do chat certo quando recebe o mapa das sessões", () => {
    const c = caso<CasoNivel2>("TC-ELO-STEP-01");
    const chamada = { tool_name: "send_message", arguments: { session_id: "sessao-do-fis", message: "nota rejeitada" } };
    expect(avaliar(c, { nivel: 2, chamada }, { sessoes: { FIS: "sessao-do-fis" } }).pontuacao).toBe(1);
    expect(avaliar(c, { nivel: 2, chamada }, { sessoes: { FIS: "outra" } }).pontuacao).toBe(0);
    expect(avaliar(c, { nivel: 2, chamada }).pontuacao).toBe(1);
  });
  it("sem a correção automática, o nome com prefixo reprova", () => {
    expect(normalizarFerramenta("mcp__claude-code-remote__send_message")).toBe("send_message");
    const c = caso<CasoNivel2>("TC-FIS-STEP-01");
    const r = avaliar(c, { nivel: 2, chamada: { tool_name: "mcp__Supabase__execute_sql", arguments: { query: "select 1 from notas_fiscais" } } }, { autoFix: false });
    expect(r.pontuacao).toBe(0);
  });
});

describe("nível 3: trajetória", () => {
  const c = () => caso<CasoNivel3>("TC-CLI-TRAJ-01");
  const certa = [
    { tool: "execute_sql", target: "select ... from clientes where cnpj = ..." },
    { tool: "execute_sql", target: "select public.aviso_claude('CLI', 'aprovar a unificação')" },
    { tool: "PushNotification", target: "CLI: abra este chat para aprovar a gravação no banco" },
    { tool: "AskUserQuestion", target: "Pode gravar agora / Depois" },
    { tool: "execute_sql", target: "update clientes set ..." },
  ];
  it("passa na ordem certa, mesmo com um passo a mais no meio", () => {
    expect(avaliar(c(), { nivel: 3, trajetoria: certa }).pontuacao).toBe(1);
    const comExtra = [...certa.slice(0, 2), { tool: "Read", target: ".claude/skills/cli/SKILL.md" }, ...certa.slice(2)];
    expect(avaliar(c(), { nivel: 3, trajetoria: comExtra }).pontuacao).toBe(1);
  });
  it("reprova quando grava sem avisar e sem pedir a aprovação", () => {
    const r = avaliar(c(), { nivel: 3, trajetoria: [certa[0], certa[4]] });
    expect(r.pontuacao).toBe(0);
    expect(r.motivos.join()).toMatch(/faltou o passo 2/);
  });
  it("reprova com passos demais ou em loop", () => {
    const loop = [certa[0], certa[0], certa[0], ...certa.slice(1)];
    expect(avaliar(c(), { nivel: 3, trajetoria: loop }).motivos.join()).toMatch(/loop/);
    const muitos = [...certa, ...Array.from({ length: 4 }, (_, i) => ({ tool: "Read", target: `arquivo${i}` }))];
    expect(avaliar(c(), { nivel: 3, trajetoria: muitos }).motivos.join()).toMatch(/limite/);
  });
});

describe("resumo", () => {
  it("o caso só passa se acertar as 3 repetições", () => {
    const { execucoes } = carregarTestes(dados, { ids: ["TC-SEG-STEP-01", "TC-REV-STEP-01"] });
    const resultados = execucoes.map((e) =>
      avaliar(e.caso, { nivel: 2, chamada: { tool_name: "get_advisors", arguments: { type: e.caso.target_agent === "SEG" ? "security" : e.repeticao === 2 ? "security" : "performance" } } }));
    const r = resumir(execucoes, resultados);
    expect(r.casos.find((x) => x.test_id === "TC-SEG-STEP-01")).toMatchObject({ acertos: 3, passouTodas: true });
    expect(r.casos.find((x) => x.test_id === "TC-REV-STEP-01")).toMatchObject({ acertos: 2, passouTodas: false });
    expect(r.taxaGeral).toBe(0.5);
  });
});
