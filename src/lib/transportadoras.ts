// Transportadoras por marca: a marca (cartão da lista) e as filiais/serviços dela, o que tem de API,
// o que falta conferir e as sugestões de agrupamento. Funções puras (sem React, sem Supabase).
import type { ApiTransportadora, TipoTransportadora, Transportadora, UnidadeRede } from "./types";

export const TIPOS: Record<TipoTransportadora, string> = {
  transportadora: "Transportadora", aerea: "Aérea", correios: "Correios", agencia: "Agência dos Correios", plataforma: "Plataforma de frete",
  aplicativo: "Aplicativo", autonomo: "Autônomo / motorista", proprio: "Veículo próprio", retira: "Cliente retira", outro: "Fornecedor que entrega",
};
export const API: Record<ApiTransportadora, { rotulo: string; dica: string }> = {
  sim: { rotulo: "Tem API", dica: "A transportadora tem API própria" },
  parcial: { rotulo: "API parcial", dica: "Tem API só para parte das funções" },
  plataforma: { rotulo: "API via plataforma", dica: "Só por plataforma de frete (Melhor Envio, Frenet…)" },
  nao: { rotulo: "Sem API", dica: "Não tem API" },
  desconhecido: { rotulo: "API: ?", dica: "Ainda não sabemos" },
};
export const RECURSOS: Record<string, string> = {
  cotacao: "cotação", rastreio: "rastreio", coleta: "coleta", etiqueta: "etiqueta", xml_cte: "XML do CT-e", comprovante: "comprovante",
  agendamento: "agendamento", fatura: "fatura", prazo: "prazo", cancelamento: "cancelamento", reversa: "reversa", webhook: "aviso automático", pedido: "pedido",
};
export const SERVICOS: Record<string, string> = {
  fracionado: "fracionado", lotacao: "lotação", expresso: "expresso", aereo: "aéreo", encomendas: "encomendas", dedicado: "dedicado",
  reversa: "reversa", armazenagem: "armazenagem", entrega_agendada: "entrega agendada", seguro: "seguro", coleta: "coleta",
  internacional: "internacional", entrega_domicilio: "entrega em domicílio",
};

const dig = (s?: string | null) => (s ?? "").replace(/\D/g, "");
export const raizCnpj = (s?: string | null) => (dig(s).length === 14 ? dig(s).slice(0, 8) : "");
export const nomeCurto = (t: Pick<Transportadora, "nome" | "nome_fantasia">) => t.nome_fantasia?.trim() || t.nome;
export const aConferir = (t: Pick<Transportadora, "pesquisa_em" | "conferido_em">) => !!t.pesquisa_em && !t.conferido_em;

export type Marca = { marca: Transportadora; filiais: Transportadora[] };

/** Marcas (sem matriz) com as filiais; filiais cuja marca está fora (inativa) aparecem como marca. */
export function porMarca(rows: Transportadora[], { inativas = false } = {}): Marca[] {
  const vivos = rows.filter((r) => !r.unificado_em && (inativas || r.ativo));
  const ids = new Set(vivos.map((r) => r.id));
  const filhos = new Map<string, Transportadora[]>();
  for (const r of vivos) if (r.matriz_id && ids.has(r.matriz_id)) filhos.set(r.matriz_id, [...(filhos.get(r.matriz_id) ?? []), r]);
  return vivos
    .filter((r) => !r.matriz_id || !ids.has(r.matriz_id))
    .map((m) => ({ marca: m, filiais: (filhos.get(m.id) ?? []).sort((a, b) => nomeCurto(a).localeCompare(nomeCurto(b), "pt-BR")) }))
    .sort((a, b) => b.filiais.length - a.filiais.length || nomeCurto(a.marca).localeCompare(nomeCurto(b.marca), "pt-BR"));
}

/** Estados onde a marca tem unidade (das filiais e da própria marca). */
export const ufsDa = ({ marca, filiais }: Marca) =>
  [...new Set([marca, ...filiais].map((t) => t.uf?.toUpperCase()).filter(Boolean) as string[])].sort();

/** Tem algum jeito de falar com ela (telefone, WhatsApp, e-mail ou contato dos e-mails)? */
export const temContato = ({ marca, filiais }: Marca) =>
  [marca, ...filiais].some((t) => t.whatsapp || t.telefone || t.email) || (marca.contatos?.length ?? 0) > 0;

/** Unidades da rede que ainda não estão cadastradas (pelo CNPJ ou, sem CNPJ, pela cidade). */
export function redeNova({ marca, filiais }: Marca): (UnidadeRede & { cadastrada: boolean })[] {
  const unidades = [marca, ...filiais];
  const cnpjs = new Set(unidades.map((t) => dig(t.cnpj)).filter(Boolean));
  const cidades = new Set(unidades.map((t) => (t.municipio ?? "").trim().toLowerCase()).filter(Boolean));
  return (marca.rede ?? []).map((u) => ({
    ...u,
    cadastrada: dig(u.cnpj) ? cnpjs.has(dig(u.cnpj)) : cidades.has((u.municipio ?? "").trim().toLowerCase()),
  }));
}

/** Cadastros soltos com o mesmo CNPJ (8 primeiros números) de outros: sugestão de agrupar numa marca. */
export function sugestoesAgrupar(lista: Marca[]): { raiz: string; marca: Transportadora | null; soltas: Transportadora[] }[] {
  const porRaiz = new Map<string, Marca[]>();
  for (const m of lista) {
    const raizes = new Set([m.marca, ...m.filiais].map((t) => raizCnpj(t.cnpj)).filter(Boolean));
    for (const r of raizes) porRaiz.set(r, [...(porRaiz.get(r) ?? []), m]);
  }
  const out: { raiz: string; marca: Transportadora | null; soltas: Transportadora[] }[] = [];
  for (const [raiz, ms] of porRaiz) {
    if (ms.length < 2) continue;
    const comFiliais = ms.filter((m) => m.filiais.length).sort((a, b) => b.filiais.length - a.filiais.length)[0];
    const soltas = ms.filter((m) => m !== comFiliais && !m.filiais.length).map((m) => m.marca);
    if (soltas.length >= (comFiliais ? 1 : 2)) out.push({ raiz, marca: comFiliais?.marca ?? null, soltas });
  }
  return out;
}

/** Link do rastreio com os dados do envio no lugar de {nf}, {cnpj} e {codigo}. */
export function linkRastreio(url: string | null | undefined, dados: { nf?: string | null; cnpj?: string | null; codigo?: string | null } = {}) {
  if (!url) return null;
  return url.replace(/\{nf\}/g, encodeURIComponent(dados.nf ?? "")).replace(/\{cnpj\}/g, encodeURIComponent(dig(dados.cnpj)))
    .replace(/\{codigo\}/g, encodeURIComponent(dados.codigo ?? ""));
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Busca na marca e nas filiais: nome, fantasia, CNPJ, cidade, UF, contatos. */
export function combina({ marca, filiais }: Marca, texto: string) {
  const t = sem(texto.trim());
  if (!t) return true;
  const d = dig(texto);
  return [marca, ...filiais].some((x) =>
    [x.nome, x.nome_fantasia, x.municipio, x.uf, x.email, x.codigo?.toString()].some((v) => v && sem(String(v)).includes(t))
    || (d.length >= 4 && dig(x.cnpj).includes(d)))
    || (marca.contatos ?? []).some((c) => [c.nome, c.email].some((v) => v && sem(v).includes(t)));
}

export type FiltroMarca = "todas" | "api" | "plataforma" | "conferir" | "sem_contato" | "alerta";
export function filtrar(lista: Marca[], f: FiltroMarca) {
  if (f === "api") return lista.filter((m) => m.marca.api === "sim" || m.marca.api === "parcial");
  if (f === "plataforma") return lista.filter((m) => m.marca.api === "plataforma" || m.marca.tipo === "plataforma");
  if (f === "conferir") return lista.filter((m) => aConferir(m.marca));
  if (f === "sem_contato") return lista.filter((m) => !temContato(m));
  if (f === "alerta") return lista.filter((m) => !!m.marca.alerta);
  return lista;
}
