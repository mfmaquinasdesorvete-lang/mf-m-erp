// Conciliação em lote: as linhas pendentes do extrato agrupadas pelo favorecido (quem recebeu ou quem pagou), para lançar
// ou ignorar o grupo inteiro de uma vez, e as regras ("este favorecido vai sempre para esta categoria") que viram sugestão
// pronta no extrato novo. O nome vem da descrição do banco: "NOME · Transferência enviada pelo Pix…" (OLIST),
// "LOJA · mfmaquinas" (InfinitePay), "Pix NOME · Enviado", "Transferência enviada por Boleto - NOME - 123 - Ref. CP-9".
// Arquivo puro (testado).

export type Direcao = "entrada" | "saida";
export type AcaoLote = "lancar" | "ignorar";
export type RegraConciliacao = {
  id: string; chave: string; direcao: Direcao; rotulo: string; acao: AcaoLote; categoria: string | null; motivo: string | null;
  fornecedor_id: string | null; cliente_id: string | null; ativo: boolean; usos: number; ultimo_uso?: string | null;
};
export type LinhaLote = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null };
export type GrupoFavorecido = {
  chave: string; direcao: Direcao; rotulo: string; ids: string[]; qtd: number; total: number;
  primeira: string; ultima: string; contas: string[]; exemplos: string[];
};

/** Banco ou intermediário que aparece antes do " · " em vez do favorecido: aí o nome está depois. */
const GENERICOS = new Set(["OLIST", "PIX", "INFINITEPAY", "INFINITE PAY", "NUBANK", "INTER", "BANCO INTER", "UNICRED"]);
/** Pedaço que é documento, CPF mascarado ou vazio ("123", "***456**", "•••.456.789-••"). */
const DOCUMENTO = /^[\d*•.\-/\s]*$/;
const SUFIXOS = new Set(["LTDA", "ME", "MEI", "EIRELI", "EPP", "SA", "S", "A", "CIA"]);

// "Pix FULANO DE TAL · Enviado" → "FULANO DE TAL"; "PIX Marketplace" (uma palavra depois) é o nome e fica
const semPrefixo = (s: string) => {
  const t = s.replace(/^(pix|ted|doc)\s+((enviado|recebido|enviada|recebida)\s+)?((para|de)\s+)?/i, "").trim();
  return t.split(" ").length >= 2 ? t : s.trim();
};

/** Nome de quem recebeu ou pagou, tirado da descrição do banco (sem documento, referência e prefixo "Pix"). */
export function contraparte(descricao: string | null | undefined): string {
  let d = String(descricao ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  if (!d) return "";
  if (d.includes(" · ")) {
    const [antes, ...resto] = d.split(" · ");
    if (!GENERICOS.has(chaveContraparte(antes)) || !resto.length) return semPrefixo(antes);
    d = resto.join(" · ");
  }
  const t = d.match(/^transfer[eê]ncia (?:enviada|recebida)(?: (?:pel[oa]|por) (?:pix|boleto|ted|doc))? - (.*)$/i);
  if (t) {
    const nome: string[] = [];
    for (const p of t[1].replace(/ - Ref\..*$/i, "").split(/ -(?: |$)/)) {
      if (DOCUMENTO.test(p)) break;
      nome.push(p.trim());
    }
    if (nome.length) return nome.join(" - ");
  }
  return semPrefixo(d.replace(/\s+-\s+ref\.?\s.*$/i, ""));
}

/** Chave para juntar o mesmo favorecido: maiúsculas, sem acento, número, pontuação nem "LTDA/ME/EIRELI" no fim. */
export function chaveContraparte(nome: string | null | undefined): string {
  const t = String(nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]+/g, " ").trim().split(" ").filter(Boolean);
  while (t.length > 1 && SUFIXOS.has(t[t.length - 1])) t.pop();
  return t.join(" ");
}

export const direcaoDe = (valor: number): Direcao => (Number(valor) > 0 ? "entrada" : "saida");
export const chaveRegra = (chave: string, direcao: Direcao) => `${direcao}|${chave}`;

/** Grupos por favorecido e sentido; os maiores primeiro. O rótulo é o nome mais comum como veio do banco. */
export function agrupar(linhas: LinhaLote[]): GrupoFavorecido[] {
  const m = new Map<string, GrupoFavorecido & { nomes: Map<string, number> }>();
  for (const l of linhas) {
    const nome = contraparte(l.descricao);
    const direcao = direcaoDe(l.valor);
    const chave = chaveContraparte(nome) || "SEM DESCRICAO";
    const k = chaveRegra(chave, direcao);
    let g = m.get(k);
    if (!g) m.set(k, (g = { chave, direcao, rotulo: nome, ids: [], qtd: 0, total: 0, primeira: l.data, ultima: l.data, contas: [], exemplos: [], nomes: new Map() }));
    g.ids.push(l.id);
    g.qtd += 1;
    g.total = Math.round((g.total + Number(l.valor)) * 100) / 100;
    if (l.data < g.primeira) g.primeira = l.data;
    if (l.data > g.ultima) g.ultima = l.data;
    if (!g.contas.includes(l.conta_bancaria_id)) g.contas.push(l.conta_bancaria_id);
    if (g.exemplos.length < 3 && l.descricao && !g.exemplos.includes(l.descricao)) g.exemplos.push(l.descricao);
    g.nomes.set(nome, (g.nomes.get(nome) ?? 0) + 1);
  }
  return [...m.values()]
    .map(({ nomes, ...g }) => ({ ...g, rotulo: [...nomes].sort((a, b) => b[1] - a[1])[0]?.[0] || "(sem descrição)" }))
    .sort((a, b) => b.qtd - a.qtd || Math.abs(b.total) - Math.abs(a.total) || a.rotulo.localeCompare(b.rotulo));
}

/** Regra ligada que vale para cada linha (pelo favorecido e o sentido). */
export function regrasDasLinhas(linhas: LinhaLote[], regras: RegraConciliacao[]): Map<string, RegraConciliacao> {
  const porChave = new Map(regras.filter((r) => r.ativo).map((r) => [chaveRegra(r.chave, r.direcao), r]));
  const out = new Map<string, RegraConciliacao>();
  if (!porChave.size) return out;
  for (const l of linhas) {
    const r = porChave.get(chaveRegra(chaveContraparte(contraparte(l.descricao)) || "SEM DESCRICAO", direcaoDe(l.valor)));
    if (r) out.set(l.id, r);
  }
  return out;
}

export const textoRegra = (r: Pick<RegraConciliacao, "acao" | "categoria" | "motivo">) =>
  r.acao === "lancar" ? `lançar em ${r.categoria}` : `ignorar (${r.motivo})`;

/** Fornecedor ou cliente do cadastro com o mesmo nome do favorecido (nome, fantasia ou o começo, no nome cortado da maquininha). */
export function cadastroDoFavorecido<T extends { id: string; nome: string; nome_fantasia?: string | null }>(chave: string, cadastro: T[]): T | null {
  if (!chave || chave === "SEM DESCRICAO") return null;
  const iguais = cadastro.filter((c) => [c.nome, c.nome_fantasia].some((n) => n && chaveContraparte(n) === chave));
  if (iguais.length === 1) return iguais[0];
  if (iguais.length > 1) return null; // dois cadastros com o mesmo nome: a pessoa escolhe
  // a InfinitePay corta o nome em ~22 letras: vale o começo, se for um só e o nome for comprido
  if (chave.length < 15) return null;
  const comeco = cadastro.filter((c) => [c.nome, c.nome_fantasia].some((n) => n && chaveContraparte(n).startsWith(chave)));
  return comeco.length === 1 ? comeco[0] : null;
}

/** Junta os erros iguais do lote: "mês fechado (3), fornecedor bloqueado (1)". */
export function resumoErros(erros: { erro: string }[]): { erro: string; qtd: number }[] {
  const m = new Map<string, number>();
  for (const e of erros) m.set(e.erro, (m.get(e.erro) ?? 0) + 1);
  return [...m].map(([erro, qtd]) => ({ erro, qtd })).sort((a, b) => b.qtd - a.qtd);
}

/** Pedaços de até n ids (o banco aceita 300 por chamada; 150 cabe folgado no tempo de uma chamada). */
export function emPedacos<T>(lista: T[], n = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}
