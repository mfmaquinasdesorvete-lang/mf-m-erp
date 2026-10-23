// Gera os documentos em Markdown da pasta docs/ a partir do código do ERP (a fonte da verdade).
// Rodar na raiz do repositório:  npx tsx scripts/gerar-docs.mjs
//
// docs/modulos.md: todas as áreas e telas, na ordem do menu (src/lib/menu.ts), com o que cada uma faz
// (src/lib/modulos.ts e src/lib/modulosDetalhe.ts), quem pode abrir (src/lib/permissoes.ts) e, no fim,
// os processos passo a passo (src/lib/esquemas.ts).
//
// O menu.ts usa React e ícones, então é lido como texto (só os endereços, nomes e telas de cada item).
// O repositório é público: o documento explica o ERP e não leva dados da empresa.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOBRE_AREAS, SOBRE_TELAS, ONDE_ABRE, PAGINAS_POR_LINK } from "../src/lib/modulos.ts";
import { DETALHE_TELAS } from "../src/lib/modulosDetalhe.ts";
import { PROCESSOS, AREAS_ESQUEMA, ROTULO_QUEM } from "../src/lib/esquemas.ts";
import { PAPEIS_INTERNOS, itemVisivel } from "../src/lib/permissoes.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (arq) => readFileSync(join(RAIZ, arq), "utf8");
const COMANDO = "npx tsx scripts/gerar-docs.mjs";

// ---------- menu (lido como texto) ----------
const menuTs = ler("src/lib/menu.ts");
const inicioFora = menuTs.indexOf("export const itensForaDoMenu");
const fimFora = menuTs.indexOf("];", inicioFora);
const reItem = /\{ to: "([^"]+)", tela: "(\w+)", label: "([^"]+)"/g;
const reGrupo = /id: "(\w+)", titulo: "([^"]*)"/g;

/** Grupos do menu na ordem, cada um com os seus itens. */
const grupos = [];
const marcas = [...menuTs.slice(0, inicioFora).matchAll(reGrupo)].map((m) => ({ pos: m.index, id: m[1], titulo: m[2] }));
for (const m of menuTs.slice(0, inicioFora).matchAll(reItem)) {
  const g = marcas.filter((x) => x.pos < m.index).at(-1);
  let grupo = grupos.find((x) => x.id === g.id);
  if (!grupo) grupos.push((grupo = { id: g.id, titulo: g.titulo, itens: [] }));
  grupo.itens.push({ to: m[1], tela: m[2], label: m[3] });
}
const itensForaDoMenu = [...menuTs.slice(inicioFora, fimFora).matchAll(reItem)].map((m) => ({ to: m[1], tela: m[2], label: m[3] }));
const todosItens = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];

const blocoAreaFora = menuTs.slice(menuTs.indexOf("const AREA_FORA"), menuTs.indexOf("];", menuTs.indexOf("const AREA_FORA")));
const AREA_FORA = [...blocoAreaFora.matchAll(/\["([^"]+)", "(\w+)"\]/g)].map((m) => [m[1], m[2]]);
const LIVRES = [...(menuTs.match(/LIVRES_FORA_DA_RETAGUARDA = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

// mesmas regras de grupoDaRota e soDaMaster (src/lib/menu.ts)
const grupoDaRota = (path) =>
  grupos.find((g) => g.id !== "inicio" && g.itens.some((i) => i.to !== "/" && (path === i.to || path.startsWith(i.to + "/"))))?.id
  ?? AREA_FORA.find(([r]) => path === r || path.startsWith(r.endsWith("/") ? r : r + "/"))?.[1] ?? null;
const soDaMaster = (tela, to) => tela === "usuarios" || (tela === "configuracoes" && !LIVRES.includes(to));

if (!grupos.length || !itensForaDoMenu.length) throw new Error("não consegui ler o menu em src/lib/menu.ts");

// ---------- quem pode abrir ----------
const PERFIS = PAPEIS_INTERNOS.filter((p) => p.value !== "admin");
function quemVe(item) {
  if (soDaMaster(item.tela, item.to)) return { rotulo: "Só a conta master", perfis: [] };
  const to = todosItens.some((i) => i.to === item.to) ? item.to : undefined;
  const perfis = PERFIS.filter((p) => itemVisivel(p.value, [], item.tela, to, {})).map((p) => p.label);
  return perfis.length ? { rotulo: lista(["Administrador", ...perfis]), perfis } : { rotulo: "Só administrador", perfis };
}
const lista = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);

// ---------- Markdown ----------
const usados = new Map();
/** Âncora no jeito do GitHub (minúsculas, sem pontuação, espaço vira hífen; repetida ganha -1, -2…). */
function ancora(titulo) {
  const base = titulo.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
  const n = usados.get(base) ?? 0;
  usados.set(base, n + 1);
  return n ? `${base}-${n}` : base;
}
/** "Nome: o que faz" vira "**Nome:** o que faz". */
const parte = (t) => {
  const i = t.indexOf(": ");
  return i > 0 && i < 60 ? `**${t.slice(0, i)}:** ${t.slice(i + 2)}` : t;
};
const ABAS_SOBRE = { ideias: "Ideias", handoff: "Handoff", atualizacoes: "Atualizações", pedidos: "Pedidos", esquema: "Esquema", modulos: "Módulos" };
const nomeTela = (rota) => {
  const aba = rota.match(/^\/sobre\?aba=(\w+)/)?.[1];
  if (aba) return `Sobre o ERP Line → ${ABAS_SOBRE[aba] ?? aba}`;
  return todosItens.find((i) => i.to === rota)?.label;
};

const AREA_CONFIG = {
  id: "admin", titulo: "Configurações",
  texto: "Pela engrenagem no fim do menu: empresa e marca, usuários e permissões, importação de dados e categorias.",
};
const areas = [
  ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", texto: SOBRE_AREAS[g.id] ?? "", itens: [...g.itens, ...itensForaDoMenu.filter((i) => (grupoDaRota(i.to) ?? "admin") === g.id)] })),
  { ...AREA_CONFIG, itens: itensForaDoMenu.filter((i) => (grupoDaRota(i.to) ?? "admin") === "admin") },
].map((a) => ({ ...a, ancora: ancora(a.titulo), itens: a.itens.map((i) => ({ ...i, ancora: ancora(i.label) })) }));

const outras = {
  perfis: ancora("Perfis de acesso"),
  links: ancora("Páginas abertas por link"),
  processos: ancora("Processos passo a passo"),
};
const areasProc = AREAS_ESQUEMA.map((a) => ({ ...a, processos: PROCESSOS.filter((p) => p.area === a.id && p.area !== "retaguarda" && !p.restrito) }))
  .filter((a) => a.processos.length)
  .map((a) => ({ ...a, ancora: ancora(`${a.nome} (processos)`), processos: a.processos.map((p) => ({ ...p, ancora: ancora(p.nome) })) }));

const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const nTelas = areas.reduce((s, a) => s + a.itens.length, 0);
const nProc = areasProc.reduce((s, a) => s + a.processos.length, 0);

const L = [];
L.push("# Módulos do ERP Line");
L.push("");
L.push(`> Documento gerado a partir do código do ERP com o comando \`${COMANDO}\`. Não edite à mão: mude os textos no código`);
L.push("> (src/lib/modulos.ts, src/lib/modulosDetalhe.ts e src/lib/esquemas.ts) e gere de novo.");
L.push("");
L.push(`**Atualizado em:** ${hoje} · **${areas.length} áreas**, **${nTelas} telas** e **${nProc} processos**.`);
L.push("");
L.push("Este documento explica, em português simples, o que cada tela do ERP Line faz, na mesma ordem do menu, e quem pode abrir cada uma. "
  + "No fim estão os principais processos da empresa, passo a passo, com quem faz cada passo e em qual tela.");
L.push("");
L.push("## Índice");
L.push("");
L.push(`- [Perfis de acesso](#${outras.perfis})`);
L.push("- Áreas e telas");
for (const a of areas) L.push(`  - [${a.titulo}](#${a.ancora}) (${a.itens.length} ${a.itens.length === 1 ? "tela" : "telas"})`);
L.push(`- [Páginas abertas por link](#${outras.links})`);
L.push(`- [Processos passo a passo](#${outras.processos})`);
for (const a of areasProc) L.push(`  - [${a.nome}](#${a.ancora})`);
L.push("");

L.push("## Perfis de acesso");
L.push("");
L.push("Cada pessoa entra no ERP com um perfil principal e pode somar perfis adicionais. Ela vê só as telas dos seus perfis. "
  + "O administrador vê tudo e pode esconder telas de um perfil em Usuários → Perfis.");
L.push("");
for (const p of PAPEIS_INTERNOS) L.push(`- **${p.label}:** ${p.descricao}.`);
L.push("");
L.push("Nas telas abaixo, **Quem pode abrir** segue esses perfis. **Só administrador** quer dizer que nenhum outro perfil abre a tela; "
  + "**Só a conta master** quer dizer que, entre os administradores, só a conta principal da empresa abre.");
L.push("");
L.push("Algumas telas pessoais da conta master (que ficam na Retaguarda) não entram neste documento.");
L.push("");

for (const a of areas) {
  L.push(`## ${a.titulo}`);
  L.push("");
  if (a.texto) { L.push(a.texto); L.push(""); }
  L.push(`Telas: ${a.itens.map((i) => `[${i.label}](#${i.ancora})`).join(" · ")}`);
  L.push("");
  for (const i of a.itens) {
    const d = DETALHE_TELAS[i.to];
    const q = quemVe(i);
    L.push(`### ${i.label}`);
    L.push("");
    if (d?.destaque) { L.push(`**${d.destaque}**`); L.push(""); }
    if (SOBRE_TELAS[i.to]) { L.push(SOBRE_TELAS[i.to]); L.push(""); }
    if (d?.tags?.length) L.push(`- **Tags:** ${d.tags.join(" · ")}`);
    L.push(`- **Quem pode abrir:** ${q.rotulo}`);
    if (ONDE_ABRE[i.to]) L.push(`- **Onde fica:** fora da lista do menu; abre por ${ONDE_ABRE[i.to]} (ou pela busca do menu)`);
    L.push("");
    if (d?.partes?.length) {
      L.push("O que a tela faz:");
      L.push("");
      for (const p of d.partes) L.push(`- ${parte(p)}`);
      L.push("");
    }
  }
}

L.push("## Páginas abertas por link");
L.push("");
L.push("Páginas que clientes, fornecedores e representantes abrem por um link, sem entrar no ERP.");
L.push("");
for (const p of PAGINAS_POR_LINK) {
  L.push(`### ${p.nome}`);
  L.push("");
  L.push(p.texto);
  L.push("");
  L.push(`- **Quem recebe:** ${p.quem}`);
  L.push(`- **Onde a equipe gera o link:** ${p.onde}`);
  L.push("");
}

L.push("## Processos passo a passo");
L.push("");
L.push("Os mesmos esquemas da tela Sobre o ERP Line → Esquema: cada processo em poucos passos, quem faz e a tela onde acontece.");
L.push("");
for (const a of areasProc) {
  L.push(`### ${a.nome} (processos)`);
  L.push("");
  for (const p of a.processos) {
    L.push(`#### ${p.nome}`);
    L.push("");
    L.push(p.resumo);
    L.push("");
    p.passos.forEach((s, n) => {
      const tela = s.tela ? ` · tela ${nomeTela(s.tela) ?? s.tela}` : "";
      const nota = s.nota ? ` (${s.nota})` : "";
      L.push(`${n + 1}. **${s.titulo}**${nota} — ${ROTULO_QUEM[s.quem] ?? s.quem}${tela}`);
    });
    L.push("");
  }
}

const destino = join(RAIZ, "docs/modulos.md");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
console.log(`docs/modulos.md: ${areas.length} áreas, ${nTelas} telas, ${nProc} processos`);
