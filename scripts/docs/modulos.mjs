// docs/modulos.md: todas as áreas e telas, na ordem do menu, com o que cada uma faz, quem pode abrir e,
// no fim, os processos passo a passo.
import {
  AREAS, AREAS_ESQUEMA, DETALHE_TELAS, ONDE_ABRE, PAGINAS_POR_LINK, PAPEIS_INTERNOS, PROCESSOS_ABERTOS, SOBRE_TELAS,
  documento, parte, passo, quemVe,
} from "./base.mjs";

export function gerarModulos() {
  const d = documento();
  const areas = AREAS.map((a) => ({ ...a, ancora: d.ancora(a.titulo), itens: a.itens.map((i) => ({ ...i, ancora: d.ancora(i.label) })) }));
  const outras = { perfis: d.ancora("Perfis de acesso"), links: d.ancora("Páginas abertas por link"), processos: d.ancora("Processos passo a passo") };
  const areasProc = AREAS_ESQUEMA.map((a) => ({ ...a, processos: PROCESSOS_ABERTOS.filter((p) => p.area === a.id) }))
    .filter((a) => a.processos.length)
    .map((a) => ({ ...a, ancora: d.ancora(`${a.nome} (processos)`) }));
  const nTelas = areas.reduce((s, a) => s + a.itens.length, 0);

  d.cabecalho("Módulos do ERP Line", "src/lib/modulos.ts, src/lib/modulosDetalhe.ts e src/lib/esquemas.ts",
    `**${areas.length} áreas**, **${nTelas} telas** e **${PROCESSOS_ABERTOS.length} processos**`,
    "Este documento explica, em português simples, o que cada tela do ERP Line faz, na mesma ordem do menu, e quem pode abrir cada uma. "
    + "No fim estão os principais processos da empresa, passo a passo, com quem faz cada passo e em qual tela.");

  d.push("## Índice", "");
  d.push(`- [Perfis de acesso](#${outras.perfis})`, "- Áreas e telas");
  for (const a of areas) d.push(`  - [${a.titulo}](#${a.ancora}) (${a.itens.length} ${a.itens.length === 1 ? "tela" : "telas"})`);
  d.push(`- [Páginas abertas por link](#${outras.links})`, `- [Processos passo a passo](#${outras.processos})`);
  for (const a of areasProc) d.push(`  - [${a.nome}](#${a.ancora})`);
  d.push("");

  d.push("## Perfis de acesso", "");
  d.push("Cada pessoa entra no ERP com um perfil principal e pode somar perfis adicionais. Ela vê só as telas dos seus perfis. "
    + "O administrador vê tudo e pode esconder telas de um perfil em Usuários → Perfis.", "");
  for (const p of PAPEIS_INTERNOS) d.push(`- **${p.label}:** ${p.descricao}.`);
  d.push("");
  d.push("Nas telas abaixo, **Quem pode abrir** segue esses perfis. **Só administrador** quer dizer que nenhum outro perfil abre a tela; "
    + "**Só a conta master** quer dizer que, entre os administradores, só a conta principal da empresa abre.", "");
  d.push("Algumas telas pessoais da conta master (que ficam na Retaguarda) não entram neste documento.", "");

  for (const a of areas) {
    d.push(`## ${a.titulo}`, "");
    if (a.texto) d.push(a.texto, "");
    d.push(`Telas: ${a.itens.map((i) => `[${i.label}](#${i.ancora})`).join(" · ")}`, "");
    for (const i of a.itens) {
      const det = DETALHE_TELAS[i.to];
      d.push(`### ${i.label}`, "");
      if (det?.destaque) d.push(`**${det.destaque}**`, "");
      if (SOBRE_TELAS[i.to]) d.push(SOBRE_TELAS[i.to], "");
      if (det?.tags?.length) d.push(`- **Tags:** ${det.tags.join(" · ")}`);
      d.push(`- **Quem pode abrir:** ${quemVe(i)}`);
      if (ONDE_ABRE[i.to]) d.push(`- **Onde fica:** fora da lista do menu; abre por ${ONDE_ABRE[i.to]} (ou pela busca do menu)`);
      d.push("");
      if (det?.partes?.length) {
        d.push("O que a tela faz:", "");
        for (const p of det.partes) d.push(`- ${parte(p)}`);
        d.push("");
      }
    }
  }

  d.push("## Páginas abertas por link", "");
  d.push("Páginas que clientes, fornecedores e representantes abrem por um link, sem entrar no ERP.", "");
  for (const p of PAGINAS_POR_LINK) {
    d.push(`### ${p.nome}`, "", p.texto, "");
    d.push(`- **Quem recebe:** ${p.quem}`, `- **Onde a equipe gera o link:** ${p.onde}`, "");
  }

  d.push("## Processos passo a passo", "");
  d.push("Os mesmos esquemas da tela Sobre o ERP Line → Esquema: cada processo em poucos passos, quem faz e a tela onde acontece.", "");
  for (const a of areasProc) {
    d.push(`### ${a.nome} (processos)`, "");
    for (const p of a.processos) {
      d.ancora(p.nome);
      d.push(`#### ${p.nome}`, "", p.resumo, "");
      p.passos.forEach((s, n) => d.push(`${n + 1}. ${passo(s)}`));
      d.push("");
    }
  }
  const ancoras = Object.fromEntries(areas.flatMap((a) => a.itens.map((i) => [i.to, i.ancora])));
  return { ancoras, arquivo: "modulos.md", titulo: "Módulos do ERP Line", sobre: "Todas as áreas e telas, na ordem do menu, com quem pode abrir e os processos passo a passo.", texto: d.texto() };
}
