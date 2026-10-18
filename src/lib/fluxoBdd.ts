// Fluxo BDD do item do Scrum: as cinco peças do assistente encadeadas, nesta ordem —
//   1. Summarizer: lê a conversa da equipe e separa as regras combinadas (de onde a regra veio: quem e quando);
//   2. Smart-Acceptance: junta essas regras aos critérios de aceite (o que precisa ser aceito);
//   3. Smart-BDD: transforma os critérios em cenários Dado / Quando / Então, com a origem de cada regra anotada;
//   4. AI Suggest: compara cada cenário com os cenários dos outros itens, para não duplicar;
//   5. Test-Gen: monta os casos de teste e os arquivos executáveis (.feature e o teste automático do Playwright).
// Tudo por regras, sem serviço de fora: é rascunho para a equipe conferir antes de salvar.
import { gerarCenarios, gerarCriterios, gerarTestes, juntarLinhas, normalizar, similaridade, type CasoTeste, type Comentario, type Rascunho } from "./assistenteItem";

/** Regra combinada na conversa, com a origem */
export type Regra = { texto: string; nome: string; data: string };

const frases = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((f) => f.trim()).filter((f) => f.length > 2);
const DECISAO = /\b(decid|combinad|combinamos|ficou|fica assim|vamos (usar|fazer|seguir)|aprovad|fechado|definid|escolh|regra|tem que|deve|precisa|nao pode|so pode|sempre|nunca)/;

/**
 * Summarizer → regras: frases da conversa que fixam uma regra ("combinamos que…", "tem que…", "nunca…"), da mais
 * antiga à mais nova, sem perguntas e sem repetir. Cada uma guarda quem falou e quando.
 */
export function regrasDaConversa(comentarios: Comentario[]): Regra[] {
  const vistas = new Set<string>();
  const regras: Regra[] = [];
  for (const c of [...comentarios].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    for (const f of frases(c.texto)) {
      if (/\?$/.test(f) || !DECISAO.test(normalizar(f))) continue;
      const chave = normalizar(f).replace(/\W+/g, "");
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      regras.push({ texto: f.replace(/[.!;:]+$/, ""), nome: c.nome.split(" ")[0]!, data: c.created_at.slice(0, 10) });
    }
  }
  return regras;
}

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** Linha do critério com a origem: "Regra combinada: … (Ana, 14/10)" */
export const criterioDaRegra = (r: Regra) => `Regra combinada: ${r.texto} (${r.nome}, ${dataBr(r.data)})`;

/** Cenário separado: nome e linhas (Dado/Quando/Então/E) */
export type Cenario = { nome: string; linhas: string[] };

/** Separa os cenários do texto em Gherkin (o Contexto não entra) */
export function separarCenarios(texto: string): Cenario[] {
  const lista: Cenario[] = [];
  let atual: Cenario | null = null;
  for (const bruta of texto.split("\n")) {
    const l = bruta.trim();
    const m = l.match(/^(Contexto|Cen[áa]rio|Esquema do cen[áa]rio)\s*:\s*(.*)$/i);
    if (m) {
      atual = /^contexto/i.test(m[1]!) ? null : { nome: m[2]!.trim() || `Cenário ${lista.length + 1}`, linhas: [] };
      if (atual) lista.push(atual);
      continue;
    }
    if (atual && /^(Dado|Quando|Então|Entao|E|Mas)\s+/i.test(l)) atual.linhas.push(l);
  }
  return lista;
}

/** Cenários que o assistente põe em todo item: iguais de propósito, não contam como duplicidade */
const PADRAO = /^(no celular|falta uma informacao|o resto continua igual|sem permissao)$/;

export type Repetido = { cenario: string; itemId: string; itemTitulo: string; outroCenario: string; score: number };

/**
 * AI Suggest para cenários: compara cada cenário deste item com os cenários dos outros itens (nome + passos) e
 * devolve os parecidos (≥ 60%), do mais parecido ao menos. Os cenários padrão (celular, campo vazio…) ficam de fora.
 */
export function cenariosRepetidos(cenarios: string, outros: { id: string; titulo: string; cenarios?: string | null }[], ignorar?: string, minimo = 0.6): Repetido[] {
  const meus = separarCenarios(cenarios).filter((c) => !PADRAO.test(normalizar(c.nome)));
  const achados: Repetido[] = [];
  for (const o of outros) {
    if (o.id === ignorar || !o.cenarios?.trim()) continue;
    const deles = separarCenarios(o.cenarios).filter((c) => !PADRAO.test(normalizar(c.nome)));
    for (const c of meus) {
      // o caminho principal de todo item começa igual: compara pelos passos que vêm depois do "Quando"
      const texto = (x: Cenario) => `${x.nome} ${x.linhas.join(" ")}`.replace(/faço o que o item pede:/gi, "");
      let melhor: { nome: string; score: number } | null = null;
      for (const d of deles) {
        const s = similaridade(texto(c), texto(d));
        if (s >= minimo && (!melhor || s > melhor.score)) melhor = { nome: d.nome, score: s };
      }
      if (melhor) achados.push({ cenario: c.nome, itemId: o.id, itemTitulo: o.titulo, outroCenario: melhor.nome, score: melhor.score });
    }
  }
  return achados.sort((a, b) => b.score - a.score).slice(0, 6);
}

/** Smart-BDD com a origem: depois do cabeçalho, uma linha "# Regras combinadas na conversa" com quem e quando */
export function cenariosComOrigem(r: Pick<Rascunho, "titulo" | "tipo" | "descricao" | "criterio_aceite">, regras: Regra[]) {
  // as regras viram cenário próprio (abaixo); no caminho principal ficam só os outros critérios
  const criterio_aceite = r.criterio_aceite.split("\n").filter((l) => !/regra combinada:/i.test(l)).join("\n");
  const texto = gerarCenarios({ ...r, criterio_aceite });
  if (!regras.length) return texto;
  const [lingua, ...resto] = texto.split("\n");
  const origem = ["# Regras combinadas na conversa da equipe:", ...regras.map((g) => `#   - ${g.texto} (${g.nome}, ${dataBr(g.data)})`)];
  // cada regra também vira um cenário próprio, para ser testada
  const proprios = regras.slice(0, 5).flatMap((g, k) => ["", `  Cenário: Regra ${k + 1} — ${g.texto.slice(0, 60)}`, "    Dado que a regra combinada vale", "    Quando faço o caminho principal", `    Então ${g.texto.charAt(0).toLowerCase()}${g.texto.slice(1)}`]);
  return [lingua, ...origem, ...resto, ...proprios].join("\n");
}

export type ResultadoFluxo = {
  criterio_aceite: string; cenarios: string; testes: CasoTeste[];
  regras: Regra[]; repetidos: Repetido[]; novosCriterios: number; novosTestes: number;
};

/** Roda as cinco etapas em ordem sobre o rascunho do item */
export function rodarFluxo(r: Rascunho & { cenarios: string; testes: CasoTeste[] }, comentarios: Comentario[],
  outros: { id: string; titulo: string; cenarios?: string | null }[], itemId?: string): ResultadoFluxo {
  const regras = regrasDaConversa(comentarios);
  const linhasNovas = [...regras.map(criterioDaRegra), ...gerarCriterios(r)];
  const criterio_aceite = juntarLinhas(r.criterio_aceite, linhasNovas);
  const contar = (t: string) => t.split("\n").filter((l) => l.trim()).length;
  const cenarios = cenariosComOrigem({ ...r, criterio_aceite }, regras);
  const ja = new Set(r.testes.map((t) => normalizar(t.nome)));
  const novos = gerarTestes(cenarios).filter((c) => !ja.has(normalizar(c.nome)));
  return {
    criterio_aceite, cenarios, testes: [...r.testes, ...novos], regras,
    repetidos: cenariosRepetidos(cenarios, outros, itemId),
    novosCriterios: contar(criterio_aceite) - contar(r.criterio_aceite), novosTestes: novos.length,
  };
}

/** Nome de arquivo a partir do título ("Técnico anexa fotos" → "tecnico-anexa-fotos") */
export const nomeArquivo = (titulo: string) => normalizar(titulo).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";

/** Arquivo .feature (Gherkin em português), pronto para Cucumber ou playwright-bdd */
export function arquivoFeature(titulo: string, cenarios: string) {
  const t = cenarios.trim();
  if (/^\s*(#.*\n)*\s*Funcionalidade\s*:/im.test(t) || /\nFuncionalidade\s*:/i.test(t)) return `${t}\n`;
  return `# language: pt\nFuncionalidade: ${titulo}\n\n${t.replace(/^# language: pt\n?/, "")}\n`;
}

const aspas = (t: string) => JSON.stringify(t);

/**
 * Teste executável do Playwright: um test() por cenário e um test.step() por linha. Os passos ainda não
 * programados ficam marcados com test.fixme — o teste aparece como pendente no relatório (nunca passa sem testar).
 */
export function arquivoPlaywright(titulo: string, cenarios: string) {
  const lista = separarCenarios(cenarios);
  const L = [
    "// Gerado pelo Fluxo BDD do ERP Line a partir dos cenários do item. Programe cada passo e tire o test.fixme.",
    'import { test, expect } from "@playwright/test";',
    "",
    `test.describe(${aspas(titulo)}, () => {`,
  ];
  for (const c of lista) {
    L.push(`  test(${aspas(c.nome)}, async ({ page }) => {`);
    L.push("    test.fixme(true, \"passos ainda não programados\");");
    for (const l of c.linhas) L.push(`    await test.step(${aspas(l)}, async () => {`, "      // TODO: programar este passo", "    });");
    L.push("    await expect(page).toBeTruthy();", "  });", "");
  }
  if (L[L.length - 1] === "") L.pop();
  L.push("});", "");
  return L.join("\n");
}
