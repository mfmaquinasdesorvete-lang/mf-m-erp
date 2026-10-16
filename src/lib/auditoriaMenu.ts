// Auditoria do menu (Sobre o ERP Line → Esquemas → Fluxograma do menu): confere a estrutura do menu e aponta o
// que confunde quem usa (endereço repetido, nomes iguais ou parecidos, áreas da mesma cor ou grandes demais,
// telas sem explicação, permissões emprestadas de outra área). Funções puras: recebem o menu como dado.

export type ItemAud = { to: string; tela: string; label: string; busca?: string };
export type GrupoAud = { id: string; titulo: string; cor?: string; itens: ItemAud[] };
export type Gravidade = "alta" | "media" | "info";
export type Achado = { id: string; gravidade: Gravidade; titulo: string; detalhe: string; rotas: string[]; sugestao?: string };

export const ROTULO_GRAVIDADE: Record<Gravidade, string> = { alta: "Corrigir", media: "Melhorar", info: "Observar" };
const PESO: Record<Gravidade, number> = { alta: 0, media: 1, info: 2 };
/** Acima disso a área fica difícil de ler de uma vez. */
export const MAX_TELAS_AREA = 8;
/** Acima disso o nome é cortado no menu estreito. */
export const MAX_ROTULO = 26;

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

/** A área que mais usa uma permissão (para saber de quem ela é). */
function donoDaPermissao(grupos: GrupoAud[]) {
  const conta = new Map<string, Map<string, number>>();
  for (const g of grupos) for (const i of g.itens) {
    const m = conta.get(i.tela) ?? new Map<string, number>();
    m.set(g.id, (m.get(g.id) ?? 0) + 1);
    conta.set(i.tela, m);
  }
  return (tela: string) => [...(conta.get(tela) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function auditarMenu(grupos: GrupoAud[], fora: ItemAud[], textos: Record<string, string>, areaDaRota: (rota: string) => string | null): Achado[] {
  const areas = grupos.filter((g) => g.titulo);
  const nomeArea = (id: string | null) => grupos.find((g) => g.id === id)?.titulo || "Início";
  const noMenu = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, area: g.id })));
  const todos = [...noMenu, ...fora.map((i) => ({ ...i, area: areaDaRota(i.to) ?? "fora" }))];
  const out: Achado[] = [];

  // 1. o mesmo endereço em dois lugares
  const porRota = new Map<string, typeof todos>();
  for (const i of todos) porRota.set(i.to, [...(porRota.get(i.to) ?? []), i]);
  for (const [rota, xs] of porRota) if (xs.length > 1) {
    out.push({ id: `rota:${rota}`, gravidade: "alta", titulo: `"${xs[0].label}" está em ${xs.length} lugares`, rotas: [rota],
      detalhe: `O endereço ${rota} aparece como ${lista(xs.map((x) => `"${x.label}"`))}.`, sugestao: "Deixar a tela num lugar só." });
  }

  // 2. nomes iguais (confunde na busca e no menu)
  const porNome = new Map<string, typeof todos>();
  for (const i of todos) porNome.set(norm(i.label), [...(porNome.get(norm(i.label)) ?? []), i]);
  for (const xs of porNome.values()) if (new Set(xs.map((x) => x.to)).size > 1) {
    out.push({ id: `nome:${norm(xs[0].label)}`, gravidade: "media", titulo: `Nome repetido: "${xs[0].label}"`, rotas: xs.map((x) => x.to),
      detalhe: `Telas diferentes com o mesmo nome (${lista(xs.map((x) => nomeArea(x.area)))}).`, sugestao: "Dar um nome que diga a diferença." });
  }

  // 3. nomes parecidos: um começa com o outro ("Compras" e "Compras em marketplaces")
  for (const a of todos) for (const b of todos) {
    const na = norm(a.label), nb = norm(b.label);
    if (a.to < b.to && na.length >= 5 && nb !== na && (nb.startsWith(`${na} `) || na.startsWith(`${nb} `))) {
      const [curto, longo] = na.length < nb.length ? [a, b] : [b, a];
      out.push({ id: `parecido:${curto.to}:${longo.to}`, gravidade: "info", titulo: `Nomes parecidos: "${curto.label}" e "${longo.label}"`, rotas: [curto.to, longo.to],
        detalhe: `Ficam em ${nomeArea(curto.area) === nomeArea(longo.area) ? `${nomeArea(curto.area)}` : `${nomeArea(curto.area)} e ${nomeArea(longo.area)}`}; quem busca "${curto.label}" vê as duas.`,
        sugestao: `Deixar mais claro o nome de "${curto.label}" (dizer de quê).` });
    }
  }

  // 4. tela sem explicação na página Módulos
  for (const i of todos) if (!textos[i.to]) {
    out.push({ id: `texto:${i.to}`, gravidade: "media", titulo: `"${i.label}" sem explicação em Módulos`, rotas: [i.to], detalhe: "Quem procura a tela não sabe para que serve.", sugestao: "Escrever uma linha em Módulos." });
  }

  // 5. áreas com a mesma cor
  const porCor = new Map<string, GrupoAud[]>();
  for (const g of areas) if (g.cor) porCor.set(g.cor, [...(porCor.get(g.cor) ?? []), g]);
  for (const gs of porCor.values()) if (gs.length > 1) {
    out.push({ id: `cor:${gs.map((g) => g.id).join("+")}`, gravidade: "media", titulo: `${lista(gs.map((g) => g.titulo))} têm a mesma cor`, rotas: gs.flatMap((g) => g.itens.map((i) => i.to)),
      detalhe: "A cor ajuda a saber em que área a pessoa está; com a mesma cor, as duas parecem uma só.", sugestao: "Dar uma cor própria a cada área." });
  }

  // 6. área grande demais
  for (const g of areas) if (g.itens.length > MAX_TELAS_AREA) {
    out.push({ id: `grande:${g.id}`, gravidade: "media", titulo: `${g.titulo} tem ${g.itens.length} telas`, rotas: g.itens.map((i) => i.to),
      detalhe: `Mais de ${MAX_TELAS_AREA} telas numa área ficam difíceis de achar de uma olhada.`, sugestao: "Separar em duas áreas ou levar as menos usadas para dentro de outra tela." });
  }

  // 7. tela fora do menu que abre na cor de uma área diferente da dona da permissão
  const dono = donoDaPermissao(grupos);
  for (const i of fora) {
    const abre = areaDaRota(i.to), deQuem = dono(i.tela);
    if (abre && deQuem && grupos.some((g) => g.id === abre) && abre !== deQuem) {
      out.push({ id: `fora:${i.to}`, gravidade: "media", titulo: `"${i.label}" abre como ${nomeArea(abre)}`, rotas: [i.to, ...noMenu.filter((x) => x.tela === i.tela && x.area === deQuem).map((x) => x.to)],
        detalhe: `A tela fica fora do menu e abre com a cor e o menu de ${nomeArea(abre)}, mas as telas da mesma permissão estão em ${nomeArea(deQuem)}.`,
        sugestao: `Abrir em ${nomeArea(deQuem)}.` });
    }
  }

  // 8. tela que usa a permissão de outra área (o perfil precisa da outra área para ver esta)
  for (const i of noMenu) {
    const deQuem = dono(i.tela);
    if (deQuem && deQuem !== i.area && i.area !== "inicio") {
      out.push({ id: `perm:${i.to}`, gravidade: "info", titulo: `"${i.label}" usa a permissão de ${nomeArea(deQuem)}`, rotas: [i.to],
        detalhe: `Está em ${nomeArea(i.area)}, mas quem não tem ${nomeArea(deQuem)} no perfil não vê esta tela (dá para esconder só ela em Usuários → Perfis).` });
    }
  }

  // 9. nome comprido
  for (const i of todos) if (i.label.length > MAX_ROTULO) {
    out.push({ id: `longo:${i.to}`, gravidade: "info", titulo: `Nome comprido: "${i.label}"`, rotas: [i.to], detalhe: `${i.label.length} letras; no menu estreito é cortado.`, sugestao: "Encurtar o nome." });
  }

  // 10. tela sem outros nomes para a busca
  for (const i of todos) if (!i.busca?.trim()) {
    out.push({ id: `busca:${i.to}`, gravidade: "info", titulo: `"${i.label}" sem palavras de busca`, rotas: [i.to], detalhe: "Só é achada pelo nome exato.", sugestao: "Pôr os outros nomes que a equipe usa." });
  }

  return out.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade] || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** Os achados em texto, para mandar à equipe. */
export function textoAuditoria(achados: Achado[], resumo: { areas: number; telas: number; fora: number }) {
  const linhas = [`Auditoria do menu do ERP Line`, `${resumo.areas} áreas · ${resumo.telas} telas no menu · ${resumo.fora} fora do menu`, ""];
  for (const g of ["alta", "media", "info"] as Gravidade[]) {
    const xs = achados.filter((a) => a.gravidade === g);
    if (!xs.length) continue;
    linhas.push(`${ROTULO_GRAVIDADE[g]} (${xs.length})`, ...xs.map((a) => `- ${a.titulo}: ${a.detalhe}${a.sugestao ? ` → ${a.sugestao}` : ""}`), "");
  }
  if (!achados.length) linhas.push("Nada a apontar.");
  return linhas.join("\n").trim();
}
