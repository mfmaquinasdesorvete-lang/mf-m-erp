// docs/acesso-novo.md: como dar acesso ao ERP para uma pessoa nova, qual perfil escolher, o primeiro acesso
// e o que fazer quando ela esquece a senha ou sai. Vem de permissoes.ts, do processo "acesso" (esquemas.ts)
// e das partes da tela Usuários e permissões (modulosDetalhe.ts).
import {
  AREAS, PAGINAS_POR_LINK, PAPEIS, PAPEIS_ADICIONAIS, PAPEIS_INTERNOS, acoesDoPapel, documento, item, lista, ondeFica,
  papelVe, parteDa, passo, processo, quemVe,
} from "./base.mjs";

const USUARIOS = "/usuarios";

export function gerarAcessoNovo({ ancoras }, { ancorasPerfil }) {
  const d = documento();
  const secoes = ["Quem dá o acesso", "Passo a passo", "Qual perfil escolher", "Mais de um perfil", "O primeiro acesso",
    "Ajustar o que a pessoa vê", "Representante externo", "Senha esquecida, saída e controle"];
  const anc = Object.fromEntries(secoes.map((s) => [s, d.ancora(s)]));
  const u = (nome) => `- **${nome}:** ${parteDa(USUARIOS, nome)}`;
  const nomePapel = (v) => PAPEIS.find((p) => p.value === v)?.label ?? v;
  const linkUsuarios = `[Usuários e permissões](modulos.md#${ancoras[USUARIOS]})`;
  const acesso = processo("acesso");

  d.cabecalho("Como dar acesso a alguém novo", "src/lib/permissoes.ts, o processo \"acesso\" de src/lib/esquemas.ts e a tela Usuários de src/lib/modulosDetalhe.ts",
    "", `${acesso.resumo} Este documento mostra quem cria o acesso, qual perfil escolher, como é o primeiro acesso `
    + "e o que fazer quando a pessoa esquece a senha ou sai da empresa.");

  d.push("## Índice", "");
  for (const s of secoes) d.push(`- [${s}](#${anc[s]})`);
  d.push("");

  d.push("## Quem dá o acesso", "");
  d.push(`Tudo é feito na tela ${linkUsuarios}.`, "");
  d.push(`- **Quem pode abrir:** ${quemVe(item(USUARIOS))}`, `- **Onde fica:** ${ondeFica(USUARIOS)}`, "");

  d.push("## Passo a passo", "");
  acesso.passos.forEach((s, k) => d.push(`${k + 1}. ${passo(s)}`));
  d.push("", "Na tela, cada passo é assim:", "");
  d.push(u("Novo usuário"), u("Com esse acesso, vê"), u("Senha provisória"), u("Ligações"), "");

  d.push("## Qual perfil escolher", "");
  d.push("Escolha o perfil pela função da pessoa. Quanto menos telas, mais simples fica o ERP para ela. "
    + "Toque no perfil para ver as telas e os processos dele no [Guia rápido por perfil](guia-por-perfil.md).", "");
  const nTelas = (v) => AREAS.reduce((s, a) => s + a.itens.filter((i) => papelVe(v, i)).length, 0);
  for (const p of PAPEIS_INTERNOS) {
    const n = nTelas(p.value), a = acoesDoPapel(p.value).length;
    const telas = p.value === "admin" ? "todas as telas" : `${n} ${n === 1 ? "tela" : "telas"}`;
    const acoes = p.value === "admin" ? "faz tudo" : a ? `${a} ${a === 1 ? "tipo de ação" : "tipos de ação"}` : "só consulta";
    d.push(`- **[${p.label}](guia-por-perfil.md#${ancorasPerfil[p.value]}):** ${p.descricao}. _(${telas}; ${acoes})_`);
  }
  d.push("");
  d.push("**Administrador** é para quem cuida da empresa: vê e faz tudo. Mesmo assim, Usuários e as Configurações da empresa "
    + "abrem só para a conta master.", "");

  d.push("## Mais de um perfil", "");
  const soPrincipal = PAPEIS.filter((p) => !PAPEIS_ADICIONAIS.includes(p.value)).map((p) => p.label);
  d.push(`Quem faz mais de uma função ganha perfis adicionais: ${lista(PAPEIS_ADICIONAIS.map(nomePapel))}. `
    + "A pessoa vê as telas e faz as ações de todos os seus perfis juntos.", "");
  d.push(`${lista(soPrincipal)} só podem ser o perfil principal: não se somam com outros.`, "");

  d.push("## O primeiro acesso", "");
  for (const s of acesso.passos.filter((x) => x.quem === "todos")) d.push(`- **${s.titulo}**${s.nota ? ` (${s.nota})` : ""}`);
  d.push(u("Senha provisória"), "");
  d.push("Depois disso a pessoa entra e o menu mostra só as telas do perfil dela.", "");

  d.push("## Ajustar o que a pessoa vê", "");
  d.push(u("Perfis, o que aparece no menu"), u("O que pode criar ou alterar"), u("Papéis"), "");

  d.push("## Representante externo", "");
  const portal = PAGINAS_POR_LINK.find((x) => x.caminho === "/portal");
  d.push(u("Representante externo"));
  if (portal) d.push(`- **O que ele vê:** ${portal.texto}`, `- **Onde criar o login dele:** ${portal.onde}`);
  d.push("");

  d.push("## Senha esquecida, saída e controle", "");
  d.push(u("Nova senha"), u("Bloquear acesso"), u("Proteções"), u("Avisos da lista"), u("Registro dos acessos"), u("Histórico"), "");
  return { arquivo: "acesso-novo.md", titulo: "Como dar acesso a alguém novo", sobre: "Quem cria o acesso, qual perfil escolher, o primeiro acesso, o representante externo e o que fazer quando a pessoa esquece a senha ou sai.", texto: d.texto() };
}
