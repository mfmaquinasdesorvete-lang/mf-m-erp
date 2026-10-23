// Base dos geradores de docs/: lê o menu, as telas, as permissões e os processos do código do ERP
// e dá as ferramentas para montar o Markdown. Usado por scripts/gerar-docs.mjs.
//
// O menu.ts usa React e ícones, então é lido como texto (só os endereços, nomes e telas de cada item).
// O repositório é público: os documentos explicam o ERP e não levam dados da empresa.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOBRE_AREAS, SOBRE_TELAS, ONDE_ABRE, PAGINAS_POR_LINK } from "../../src/lib/modulos.ts";
import { DETALHE_TELAS } from "../../src/lib/modulosDetalhe.ts";
import { PROCESSOS, AREAS_ESQUEMA, ROTULO_QUEM } from "../../src/lib/esquemas.ts";
import { PAPEIS, PAPEIS_INTERNOS, PAPEIS_ADICIONAIS, ACOES_ROTULO, acoesDoPapel, itemVisivel } from "../../src/lib/permissoes.ts";

export { SOBRE_AREAS, SOBRE_TELAS, ONDE_ABRE, PAGINAS_POR_LINK, DETALHE_TELAS, AREAS_ESQUEMA, ROTULO_QUEM };
export { PAPEIS, PAPEIS_INTERNOS, PAPEIS_ADICIONAIS, ACOES_ROTULO, acoesDoPapel };

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (arq) => readFileSync(join(RAIZ, arq), "utf8");
export const COMANDO = "npx tsx scripts/gerar-docs.mjs";

// ---------- menu (lido como texto) ----------
const menuTs = ler("src/lib/menu.ts");
const inicioFora = menuTs.indexOf("export const itensForaDoMenu");
const fimFora = menuTs.indexOf("];", inicioFora);
const reItem = /\{ to: "([^"]+)", tela: "(\w+)", label: "([^"]+)"/g;
const reGrupo = /id: "(\w+)", titulo: "([^"]*)"/g;

/** Grupos do menu na ordem, cada um com os seus itens. */
export const grupos = [];
const marcas = [...menuTs.slice(0, inicioFora).matchAll(reGrupo)].map((m) => ({ pos: m.index, id: m[1], titulo: m[2] }));
for (const m of menuTs.slice(0, inicioFora).matchAll(reItem)) {
  const g = marcas.filter((x) => x.pos < m.index).at(-1);
  let grupo = grupos.find((x) => x.id === g.id);
  if (!grupo) grupos.push((grupo = { id: g.id, titulo: g.titulo, itens: [] }));
  grupo.itens.push({ to: m[1], tela: m[2], label: m[3] });
}
export const itensForaDoMenu = [...menuTs.slice(inicioFora, fimFora).matchAll(reItem)].map((m) => ({ to: m[1], tela: m[2], label: m[3] }));
export const todosItens = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];

const blocoAreaFora = menuTs.slice(menuTs.indexOf("const AREA_FORA"), menuTs.indexOf("];", menuTs.indexOf("const AREA_FORA")));
const AREA_FORA = [...blocoAreaFora.matchAll(/\["([^"]+)", "(\w+)"\]/g)].map((m) => [m[1], m[2]]);
const LIVRES = [...(menuTs.match(/LIVRES_FORA_DA_RETAGUARDA = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const blocoAtalhos = menuTs.slice(menuTs.indexOf("export const ATALHOS_CELULAR"), menuTs.indexOf("};", menuTs.indexOf("export const ATALHOS_CELULAR")));
/** Atalhos da barra de baixo do celular, por papel. */
export const ATALHOS_CELULAR = Object.fromEntries([...blocoAtalhos.matchAll(/^\s+(\w+): \[([^\]]*)\]/gm)]
  .map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]));

if (!grupos.length || !itensForaDoMenu.length || !ATALHOS_CELULAR.admin) throw new Error("não consegui ler o menu em src/lib/menu.ts");

// mesmas regras de grupoDaRota e soDaMaster (src/lib/menu.ts)
export const grupoDaRota = (path) =>
  grupos.find((g) => g.id !== "inicio" && g.itens.some((i) => i.to !== "/" && (path === i.to || path.startsWith(i.to + "/"))))?.id
  ?? AREA_FORA.find(([r]) => path === r || path.startsWith(r.endsWith("/") ? r : r + "/"))?.[1] ?? null;
export const soDaMaster = (tela, to) => tela === "usuarios" || (tela === "configuracoes" && !LIVRES.includes(to));

/** Áreas na ordem da tela Módulos: as do menu e, no fim, Configurações (a engrenagem). */
export const AREAS = [
  ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início", texto: SOBRE_AREAS[g.id] ?? "", itens: [...g.itens, ...itensForaDoMenu.filter((i) => (grupoDaRota(i.to) ?? "admin") === g.id)] })),
  { id: "admin", titulo: "Configurações", texto: "Pela engrenagem no fim do menu: empresa e marca, usuários e permissões, importação de dados e categorias.",
    itens: itensForaDoMenu.filter((i) => (grupoDaRota(i.to) ?? "admin") === "admin") },
];
const areaDoItem = (to) => AREAS.find((a) => a.itens.some((i) => i.to === to));

// ---------- telas ----------
export const lista = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);
const PERFIS = PAPEIS_INTERNOS.filter((p) => p.value !== "admin");

/** O papel (sem somar adicionais) abre a tela? Administrador abre tudo, menos o que é só da conta master. */
export function papelVe(papel, item) {
  if (soDaMaster(item.tela, item.to)) return false;
  const to = todosItens.some((i) => i.to === item.to) ? item.to : undefined;
  return itemVisivel(papel, [], item.tela, to, {});
}
/** Quem pode abrir a tela, em texto. */
export function quemVe(item) {
  if (soDaMaster(item.tela, item.to)) return "Só a conta master";
  const perfis = PERFIS.filter((p) => papelVe(p.value, item)).map((p) => p.label);
  return perfis.length ? lista(["Administrador", ...perfis]) : "Só administrador";
}
export const item = (to) => {
  const i = todosItens.find((x) => x.to === to);
  if (!i) throw new Error(`a tela ${to} não está mais no menu (src/lib/menu.ts)`);
  return i;
};
/** Caminho para chegar na tela: "Vendas → Venda de Peças" ou o botão que a abre. */
export function ondeFica(to) {
  const i = item(to);
  if (ONDE_ABRE[to]) return `${ONDE_ABRE[to]} (ou pela busca do menu)`;
  const a = areaDoItem(to);
  return a && a.id !== "inicio" ? `menu ${a.titulo} → ${i.label}` : `menu → ${i.label}`;
}
/** Uma parte da tela (DETALHE_TELAS) pelo nome dela, sem o nome. */
export function parteDa(to, nome) {
  const p = DETALHE_TELAS[to]?.partes.find((x) => x.startsWith(`${nome}: `));
  if (!p) throw new Error(`a tela ${to} não tem mais a parte "${nome}" (src/lib/modulosDetalhe.ts)`);
  return p.slice(nome.length + 2);
}
const ABAS_SOBRE = { ideias: "Ideias", handoff: "Handoff", atualizacoes: "Atualizações", pedidos: "Pedidos", esquema: "Esquema", modulos: "Módulos" };
export const nomeTela = (rota) => {
  const aba = rota.match(/^\/sobre\?aba=(\w+)/)?.[1];
  if (aba) return `Sobre o ERP Line → ${ABAS_SOBRE[aba] ?? aba}`;
  return todosItens.find((i) => i.to === rota)?.label ?? rota;
};

// ---------- processos (sem os restritos à conta master) ----------
export const PROCESSOS_ABERTOS = PROCESSOS.filter((p) => p.area !== "retaguarda" && !p.restrito);
export const processo = (id) => {
  const p = PROCESSOS_ABERTOS.find((x) => x.id === id);
  if (!p) throw new Error(`o processo ${id} não existe mais (src/lib/esquemas.ts)`);
  return p;
};
/** Passo em uma linha: "**Orçamento** (nota) — Vendas · tela Venda de Peças". */
export const passo = (s) =>
  `**${s.titulo}**${s.nota ? ` (${s.nota})` : ""} — ${ROTULO_QUEM[s.quem] ?? s.quem}${s.tela ? ` · tela ${nomeTela(s.tela)}` : ""}`;

// ---------- Markdown ----------
/** "Nome: o que faz" vira "**Nome:** o que faz". */
export const parte = (t) => {
  const i = t.indexOf(": ");
  return i > 0 && i < 60 ? `**${t.slice(0, i)}:** ${t.slice(i + 2)}` : t;
};
export const hoje = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Montador de um documento: guarda as linhas e cria as âncoras no jeito do GitHub. */
export function documento() {
  const L = [];
  const usados = new Map();
  return {
    L,
    /** Âncora de um título (minúsculas, sem pontuação, espaço vira hífen; repetida ganha -1, -2…). */
    ancora(titulo) {
      const base = titulo.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
      const n = usados.get(base) ?? 0;
      usados.set(base, n + 1);
      return n ? `${base}-${n}` : base;
    },
    /** Cabeçalho padrão: título, aviso de que é gerado, data e a frase de abertura. */
    cabecalho(titulo, fontes, resumo, intro) {
      L.push(`# ${titulo}`, "");
      L.push(`> Documento gerado a partir do código do ERP com o comando \`${COMANDO}\`. Não edite à mão: mude o texto`);
      L.push(`> na fonte (${fontes}) e gere de novo.`, "");
      L.push(`**Atualizado em:** ${hoje()}${resumo ? ` · ${resumo}` : ""}.`, "");
      if (intro) L.push(intro, "");
    },
    push(...linhas) { L.push(...linhas); },
    texto: () => L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
  };
}
