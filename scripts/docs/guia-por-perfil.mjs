// docs/guia-por-perfil.md: uma seção para cada perfil, com as telas que abre, o que pode criar ou alterar,
// os atalhos do celular e os processos em que entra.
import {
  ACOES_ROTULO, AREAS, ATALHOS_CELULAR, DETALHE_TELAS, PAGINAS_POR_LINK, PAPEIS, PAPEIS_ADICIONAIS, PAPEIS_INTERNOS, PROCESSOS_ABERTOS,
  ROTULO_QUEM, SOBRE_TELAS, acoesDoPapel, documento, item, nomeTela, papelVe, todosItens,
} from "./base.mjs";

/**
 * Quem, nos esquemas (src/lib/esquemas.ts), é o trabalho de cada perfil. Os esquemas falam de funções
 * (Fiscal, Logística, Estoque, Diretoria…) e os perfis do ERP somam algumas delas.
 */
const FUNCOES_DO_PERFIL = {
  admin: ["diretoria"],
  vendas: ["vendas"],
  financeiro: ["financeiro", "fiscal"],
  tecnico: ["tecnico", "assistencia"],
  contador: ["contador"],
  expedicao: ["expedicao", "logistica"],
  compras: ["compras", "estoque"],
  marketplace: [],
  giga: [],
};

/** O perfil abre a tela do passo? (passo sem tela, ou fora do menu como o Sobre, conta como sim) */
const abre = (papel, to) => papel === "admin" || !to || !todosItens.some((i) => i.to === to) || papelVe(papel, item(to));

export function gerarGuiaPorPerfil({ ancoras }) {
  const d = documento();
  const perfis = PAPEIS_INTERNOS.map((p) => ({ ...p, ancora: d.ancora(p.label) }));
  const repr = PAPEIS.find((p) => p.value === "representante");
  const ancRepr = repr && d.ancora(repr.label);
  const linkTela = (to) => `[${nomeTela(to)}](modulos.md#${ancoras[to]})`;

  d.cabecalho("Guia rápido por perfil", "src/lib/permissoes.ts, src/lib/menu.ts, src/lib/modulosDetalhe.ts e src/lib/esquemas.ts",
    `**${perfis.length} perfis**`,
    "Um guia curto para cada função da empresa: as telas que a pessoa abre, o que ela pode criar ou alterar, os atalhos do celular "
    + "e os processos em que ela entra. Para saber tudo o que uma tela faz, toque no nome dela: abre o documento [Módulos do ERP Line](modulos.md).");

  d.push("## Índice", "");
  for (const p of perfis) d.push(`- [${p.label}](#${p.ancora})`);
  if (repr) d.push(`- [${repr.label}](#${ancRepr})`);
  d.push("");

  d.push("**Mais de um perfil:** a pessoa pode ter um perfil principal e somar os adicionais "
    + `(${PAPEIS_ADICIONAIS.map((v) => PAPEIS.find((p) => p.value === v)?.label ?? v).join(", ")}). `
    + "Aí ela vê as telas e faz as ações de todos eles juntos. O administrador ainda pode esconder telas de um perfil em Usuários → Perfis, "
    + "então o menu de alguém pode ter menos telas do que a lista abaixo.", "");

  for (const p of perfis) {
    d.push(`## ${p.label}`, "", `_${p.descricao}._`, "");
    const atalhos = ATALHOS_CELULAR[p.value] ?? ATALHOS_CELULAR.admin;
    d.push(`- **Atalhos na barra do celular:** ${atalhos.map(nomeTela).join(" · ")}`);
    if (p.value === "admin") {
      d.push("- **Telas:** todas, menos as que são só da conta master (Configurações da empresa e Usuários).");
      d.push("- **O que pode criar ou alterar:** tudo.", "");
    } else {
      const acoes = acoesDoPapel(p.value);
      d.push(acoes.length ? "- **O que pode criar ou alterar:**" : "- **O que pode criar ou alterar:** nada; só consulta.");
      for (const a of acoes) d.push(`  - ${ACOES_ROTULO[a]}`);
      d.push("");
      const porArea = AREAS.map((a) => ({ ...a, itens: a.itens.filter((i) => papelVe(p.value, i)) })).filter((a) => a.itens.length);
      const n = porArea.reduce((s, a) => s + a.itens.length, 0);
      d.push(`### Telas que abre (${n})`, "");
      d.ancora("Telas que abre");
      for (const a of porArea) {
        d.push(`**${a.titulo}**`, "");
        for (const i of a.itens) d.push(`- ${linkTela(i.to)}: ${DETALHE_TELAS[i.to]?.destaque ?? SOBRE_TELAS[i.to] ?? ""}`);
        d.push("");
      }
    }
    const funcoes = FUNCOES_DO_PERFIL[p.value] ?? [];
    const processos = PROCESSOS_ABERTOS
      .map((pr) => ({ pr, meus: pr.passos.map((s, k) => ({ s, k })).filter(({ s }) => funcoes.includes(s.quem) && abre(p.value, s.tela)) }))
      .filter((x) => x.meus.length);
    d.push("### Processos em que entra", "");
    d.ancora("Processos em que entra");
    if (!processos.length) {
      d.push("Nenhum processo dos esquemas é deste perfil: ele cuida só das telas acima.", "");
    } else {
      d.push(`Nos esquemas, este perfil é ${funcoes.map((f) => `**${ROTULO_QUEM[f]}**`).join(" e ")}. Os passos dele em cada processo (só os que acontecem numa tela que ele abre):`, "");
      for (const { pr, meus } of processos) {
        d.push(`- **${pr.nome}:** ${meus.map(({ s, k }) => `${k + 1}. ${s.titulo}${s.tela ? ` · ${nomeTela(s.tela)}` : ""}`).join("; ")}`);
      }
      d.push("");
    }
  }

  if (repr) {
    const portal = PAGINAS_POR_LINK.find((x) => x.caminho === "/portal");
    d.push(`## ${repr.label}`, "", `_${repr.descricao}._`, "");
    d.push("Não entra no ERP: tem um login próprio só para o portal.", "");
    if (portal) d.push(`- **O que vê:** ${portal.texto}`, `- **Como ganha o acesso:** ${portal.onde}`, "");
  }
  const ancorasPerfil = Object.fromEntries([...perfis.map((p) => [p.value, p.ancora]), ...(repr ? [[repr.value, ancRepr]] : [])]);
  return { ancorasPerfil, arquivo: "guia-por-perfil.md", titulo: "Guia rápido por perfil", sobre: "Para cada função: as telas que abre, o que pode criar ou alterar, os atalhos do celular e os processos em que entra.", texto: d.texto() };
}
