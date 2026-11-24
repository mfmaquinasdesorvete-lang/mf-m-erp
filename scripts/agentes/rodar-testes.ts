// Roda os testes dos chats do ERP Line pela API do Claude e dá a nota com o carregador.
//
//   node scripts/agentes/rodar-testes.ts --seco                  só mostra o plano e a estimativa (não gasta nada)
//   node scripts/agentes/rodar-testes.ts --agente FIS --nivel 2  roda só um pedaço
//   node scripts/agentes/rodar-testes.ts --repeticoes 1          troca as 3 repetições do dataset por 1
//
// Cada chat recebe as mesmas instruções que usa no dia a dia (CLAUDE.md + a skill dele) e as ferramentas de sempre,
// mas SIMULADAS: nada é gravado no banco, nada vai para o GitHub, a Hostinger ou outro chat. Só a leitura de arquivos do
// próprio repositório é de verdade. A pergunta com botões é respondida com a primeira opção, como se a usuária aprovasse.
// O nível 1 ainda passa por uma IA juíza, que responde sim ou não para cada pergunta do caso.
// Precisa da chave da API (ANTHROPIC_API_KEY) e gasta créditos: rode primeiro com --seco.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  avaliar, carregarTestes, montarPromptJuiz, resumir,
  type CasoTeste, type ChamadaFerramenta, type Execucao, type NivelTeste, type PassoExecutado, type ResultadoAvaliacao, type SaidaChat,
} from "../../src/lib/agentes/testesAgentes.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODELO = process.env.MODELO_CHATS ?? "claude-opus-5-5";
const MODELO_JUIZ = process.env.MODELO_JUIZ ?? "claude-opus-5-5";
const PASSOS_MAXIMOS = 15;

/* ===================== argumentos ===================== */
const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const seco = args.includes("--seco");
const filtro = {
  agente: arg("--agente")?.toUpperCase(),
  nivel: arg("--nivel") ? (Number(arg("--nivel")) as NivelTeste) : undefined,
  ids: arg("--ids")?.split(","),
};
const repeticoesForcadas = arg("--repeticoes") ? Number(arg("--repeticoes")) : undefined;

/* ===================== dataset ===================== */
const dados = JSON.parse(readFileSync(join(RAIZ, "src/lib/agentes/test_dataset.json"), "utf8"));
if (repeticoesForcadas) dados.global_settings.repetitions_per_test = repeticoesForcadas;
const { config, execucoes } = carregarTestes(dados, filtro);

// sessões de mentira: o chat endereça "sessao-FIS" e o carregador confere a mesma coisa
const SIGLAS = ["ELO", "GER", "FIS", "FAZ", "REV", "ENT", "CAR", "DSG", "SEG", "CLI", "PRD", "FUN", "TEC", "TRA", "MKT", "IAD", "MYF", "SOR"];
const SESSOES = Object.fromEntries(SIGLAS.map((s) => [s, `sessao-${s}`]));

/* ===================== instruções de cada chat ===================== */
const ler = (p: string) => (existsSync(join(RAIZ, p)) ? readFileSync(join(RAIZ, p), "utf8") : "");
const CLAUDE_MD = ler("CLAUDE.md");
function sistemaDoChat(sigla: string): Anthropic.Beta.BetaTextBlockParam[] {
  const skill = ler(`.claude/skills/${sigla.toLowerCase()}/SKILL.md`);
  return [
    { type: "text", text: CLAUDE_MD },
    {
      type: "text",
      text: [
        `Você é o chat ${sigla}. A sua skill já está abaixo: não precisa abrir o SKILL.md de novo.`,
        `Sessões dos outros chats para send_message: ${SIGLAS.map((s) => `${s} = ${SESSOES[s]}`).join(", ")}.`,
        `O projeto do Supabase é antfofmwrmkadiavjycg. Hoje é ${new Date().toISOString().slice(0, 10)}.`,
        "", skill,
      ].join("\n"),
      cache_control: { type: "ephemeral" },
    },
  ];
}

/* ===================== ferramentas (simuladas) ===================== */
const obj = (props: Record<string, unknown>, required: string[]) => ({ type: "object" as const, properties: props, required });
const txt = { type: "string" };
const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  { name: "Read", description: "Lê um arquivo do repositório.", input_schema: obj({ file_path: txt }, ["file_path"]) },
  { name: "Edit", description: "Troca um trecho exato de um arquivo.", input_schema: obj({ file_path: txt, old_string: txt, new_string: txt }, ["file_path", "old_string", "new_string"]) },
  { name: "Write", description: "Escreve um arquivo inteiro.", input_schema: obj({ file_path: txt, content: txt }, ["file_path", "content"]) },
  { name: "Bash", description: "Roda um comando no terminal (git, npm, scripts).", input_schema: obj({ command: txt, description: txt }, ["command"]) },
  { name: "Grep", description: "Procura um texto nos arquivos do repositório.", input_schema: obj({ pattern: txt, path: txt }, ["pattern"]) },
  { name: "Glob", description: "Lista arquivos por padrão de nome.", input_schema: obj({ pattern: txt }, ["pattern"]) },
  { name: "execute_sql", description: "Roda SQL no banco do ERP (Supabase). Gravações pedem aprovação da usuária.", input_schema: obj({ project_id: txt, query: txt }, ["project_id", "query"]) },
  { name: "apply_migration", description: "Aplica uma migração no banco (DDL).", input_schema: obj({ project_id: txt, name: txt, query: txt }, ["project_id", "name", "query"]) },
  { name: "get_advisors", description: "Avisos de segurança ou de desempenho do Supabase.", input_schema: obj({ project_id: txt, type: { type: "string", enum: ["security", "performance"] } }, ["project_id", "type"]) },
  { name: "list_tables", description: "Lista as tabelas do banco.", input_schema: obj({ project_id: txt }, ["project_id"]) },
  { name: "query_logs", description: "Lê os registros (logs) de um serviço do Supabase.", input_schema: obj({ project_id: txt, service: txt }, ["project_id", "service"]) },
  {
    name: "AskUserQuestion", description: "Pergunta à usuária com botões.",
    input_schema: obj({
      questions: { type: "array", items: obj({ question: txt, header: txt, multiSelect: { type: "boolean" }, options: { type: "array", items: obj({ label: txt, description: txt }, ["label", "description"]) } }, ["question", "header", "options", "multiSelect"]) },
    }, ["questions"]),
  },
  { name: "PushNotification", description: "Manda uma notificação para o celular da usuária.", input_schema: obj({ message: txt }, ["message"]) },
  { name: "send_message", description: "Manda uma mensagem para outro chat (sessão).", input_schema: obj({ session_id: txt, message: txt }, ["session_id", "message"]) },
  { name: "Artifact", description: "Publica uma página (artifact) no claude.ai.", input_schema: obj({ file_path: txt, action: txt }, []) },
  { name: "ArtifactData", description: "Lê ou grava o banco de uma página publicada.", input_schema: obj({ action: txt, url: txt, collection: txt, doc_id: txt }, ["action", "url"]) },
];

/** O texto que resume a chamada, usado como "target" na trajetória do nível 3. */
function alvo(nome: string, inp: Record<string, unknown>): string {
  if (nome === "AskUserQuestion") {
    const qs = (inp.questions as { question?: string; options?: { label?: string }[] }[] | undefined) ?? [];
    return qs.map((q) => `${q.question ?? ""} ${(q.options ?? []).map((o) => o.label).join(" / ")}`).join(" | ");
  }
  const v = inp.file_path ?? inp.command ?? inp.query ?? inp.pattern ?? inp.session_id ?? inp.message ?? inp.type ?? inp.action ?? "";
  return String(v);
}

/** Resposta simulada de cada ferramenta: nada sai deste computador além da chamada à API. */
function simular(nome: string, inp: Record<string, unknown>): string {
  if (nome === "Read") {
    const p = resolve(RAIZ, String(inp.file_path ?? ""));
    if (!p.startsWith(RAIZ + "/") || relative(RAIZ, p).startsWith("node_modules") || !existsSync(p)) return "Arquivo não encontrado.";
    try { return readFileSync(p, "utf8").slice(0, 20000); } catch { return "Não foi possível ler (é uma pasta?)."; }
  }
  if (nome === "AskUserQuestion") {
    const qs = (inp.questions as { question?: string; options?: { label?: string }[] }[] | undefined) ?? [];
    return qs.map((q) => `"${q.question}"="${q.options?.[0]?.label ?? ""}"`).join(", ") + " (a usuária escolheu a primeira opção)";
  }
  if (nome === "execute_sql") {
    const q = String(inp.query ?? "").toLowerCase();
    if (/publicacao_comecar/.test(q)) return '[{"publicacao_comecar":"pub-simulada-1"}]';
    if (/^\s*(insert|update|delete|alter|create|drop)/.test(q)) return "(simulado) gravação feita: 1 linha.";
    return "(simulado) consulta feita: 0 linhas. Este é um ambiente de teste sem dados reais.";
  }
  if (nome === "Bash") return "(simulado) comando executado sem erro.";
  if (nome === "get_advisors") return "(simulado) 2 avisos: tabela sem índice na chave estrangeira; função sem search_path fixo.";
  if (nome === "Grep" || nome === "Glob") return "(simulado) 3 resultados em supabase/functions e src/lib.";
  return "ok (simulado).";
}

/* ===================== chamada ao modelo ===================== */
const cliente = seco ? null : new Anthropic();
let tokens = { entrada: 0, saida: 0, cache: 0 };

async function pedir(sistema: Anthropic.Beta.BetaTextBlockParam[], mensagens: Anthropic.Beta.BetaMessageParam[], comFerramentas: boolean, modelo = MODELO, formato?: Anthropic.Beta.BetaJSONOutputFormat) {
  const r = await cliente!.beta.messages.create({
    model: modelo,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: sistema,
    messages: mensagens,
    ...(comFerramentas ? { tools: FERRAMENTAS } : {}),
    output_config: { effort: "medium", ...(formato ? { format: formato } : {}) },
  });
  tokens.entrada += r.usage.input_tokens; tokens.saida += r.usage.output_tokens; tokens.cache += r.usage.cache_read_input_tokens ?? 0;
  if (r.stop_reason === "refusal") throw new Error(`recusa (${r.stop_details?.category ?? "sem categoria"})`);
  return r;
}

function pedidoDoCaso(caso: CasoTeste): string {
  if (caso.test_level === 2) return `${caso.input.previous_context}\n\n${caso.input.current_prompt}`;
  return caso.input.user_prompt;
}

/** Conversa do chat com as ferramentas simuladas; para no fim do turno ou no limite de passos. */
async function rodarChat(caso: CasoTeste, pararNoPrimeiroPasso: boolean) {
  const sistema = sistemaDoChat(caso.target_agent);
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: pedidoDoCaso(caso) }];
  const trajetoria: PassoExecutado[] = [];
  let primeira: ChamadaFerramenta | null = null;
  let texto = "";
  for (let i = 0; i < PASSOS_MAXIMOS; i++) {
    const r = await pedir(sistema, mensagens, true);
    mensagens.push({ role: "assistant", content: r.content });
    const textos = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (textos) texto = textos;
    const usos = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!usos.length) break;
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of usos) {
      const inp = (u.input ?? {}) as Record<string, unknown>;
      primeira ??= { tool_name: u.name, arguments: inp };
      trajetoria.push({ tool: u.name, target: alvo(u.name, inp) });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: simular(u.name, inp) });
    }
    if (pararNoPrimeiroPasso) break;
    mensagens.push({ role: "user", content: resultados });
  }
  return { texto, trajetoria, primeira };
}

const FORMATO_JUIZ: Anthropic.Beta.BetaJSONOutputFormat = {
  type: "json_schema",
  schema: { type: "object", properties: { respostas: { type: "array", items: { type: "boolean" } } }, required: ["respostas"], additionalProperties: false },
};
async function julgar(caso: Extract<CasoTeste, { test_level: 1 }>, resposta: string): Promise<boolean[] | undefined> {
  const r = await pedir([{ type: "text", text: "Você é uma juíza rigorosa e justa de testes de assistentes." }],
    [{ role: "user", content: montarPromptJuiz(caso, resposta) }], false, MODELO_JUIZ, FORMATO_JUIZ);
  const t = r.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  try { return (JSON.parse(t) as { respostas: boolean[] }).respostas; } catch { return undefined; }
}

async function executar(e: Execucao): Promise<{ saida: SaidaChat; registro: unknown }> {
  const c = e.caso;
  if (c.test_level === 2) {
    const { primeira } = await rodarChat(c, true);
    const chamada = primeira ?? { tool_name: "(nenhuma ferramenta)", arguments: {} };
    return { saida: { nivel: 2, chamada }, registro: chamada };
  }
  const { texto, trajetoria } = await rodarChat(c, false);
  if (c.test_level === 3) return { saida: { nivel: 3, trajetoria }, registro: { trajetoria, texto } };
  const vereditoJuiz = await julgar(c, texto);
  return { saida: { nivel: 1, texto, vereditoJuiz }, registro: { texto, trajetoria, vereditoJuiz } };
}

/* ===================== principal ===================== */
const porNivel = [1, 2, 3].map((n) => execucoes.filter((e) => e.caso.test_level === n).length);
console.log(`Plano: ${execucoes.length} execuções (${porNivel[0]} do nível 1, ${porNivel[1]} do nível 2, ${porNivel[2]} do nível 3), ` +
  `${config.repetitions_per_test} repetição(ões) por caso, modelo ${MODELO}, juíza ${MODELO_JUIZ}.`);
// estimativa grosseira: nível 1 ≈ 5 pedidos + 1 da juíza, nível 2 ≈ 1, nível 3 ≈ 6; ~14 mil tokens de entrada (quase todos em cache) e ~1,2 mil de saída por pedido
const pedidos = porNivel[0] * 6 + porNivel[1] + porNivel[2] * 6;
const custo = pedidos * (2000 * 4 + 12000 * 0.2 + 1200 * 20) / 1e6;
console.log(`Estimativa: cerca de ${pedidos} pedidos à API, perto de US$ ${custo.toFixed(2)} (preço de tabela do ${MODELO}; o real pode variar).`);
if (seco) process.exit(0);

const resultados: ResultadoAvaliacao[] = [];
const registros: unknown[] = [];
for (const [i, e] of execucoes.entries()) {
  let r: ResultadoAvaliacao;
  try {
    const { saida, registro } = await executar(e);
    r = avaliar(e.caso, saida, { autoFix: config.enable_runtime_auto_fix, sessoes: SESSOES });
    registros.push({ chave: e.chave, saida: registro, resultado: r });
  } catch (erro) {
    const msg = erro instanceof Anthropic.APIError ? `erro da API ${erro.status}: ${erro.message}` : String(erro);
    r = { test_id: e.caso.test_id, pontuacao: 0, passou: false, motivos: [msg], correcoes: [] };
    registros.push({ chave: e.chave, erro: msg });
    if (erro instanceof Anthropic.AuthenticationError) { console.error("Chave da API inválida ou ausente. Parei."); break; }
  }
  resultados.push(r);
  console.log(`[${i + 1}/${execucoes.length}] ${e.chave}: ${r.pontuacao ? "passou" : "não passou"}${r.motivos.length ? " · " + r.motivos.join("; ") : ""}`);
}

const feitas = execucoes.slice(0, resultados.length);
const resumo = resumir(feitas, resultados);
console.log("\nPor chat (casos que passaram nas repetições todas):");
for (const [ag, v] of Object.entries(resumo.porAgente)) console.log(`  ${ag}: ${v.passaram} de ${v.casos}`);
console.log(`Geral: ${(resumo.taxaGeral * 100).toFixed(0)}% dos casos. Tokens: ${tokens.entrada} de entrada, ${tokens.cache} lidos do cache, ${tokens.saida} de saída.`);

const pasta = join(RAIZ, "scripts/agentes/resultados");
mkdirSync(pasta, { recursive: true });
const arquivo = join(pasta, `testes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(arquivo, JSON.stringify({ modelo: MODELO, juiz: MODELO_JUIZ, config, resumo, tokens, registros }, null, 2));
console.log(`Detalhes em ${relative(RAIZ, arquivo)}`);
