import { digitos } from "./format";

export type InscricaoEstadual = { numero: string; uf: string; ativa: boolean };
export type DadosCnpj = {
  nome: string; nome_fantasia: string | null; email: string | null; telefone: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; municipio: string | null; uf: string | null; situacao: string | null;
  inscricoes?: InscricaoEstadual[];
};

const cache = new Map<string, DadosCnpj | null>();

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())
  .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
const fone = (ddd: unknown, n?: unknown) => digitos(`${ddd ?? ""}${n ?? ""}`) || null;
const ou = (v: unknown) => (v == null || v === "" ? null : String(v));

async function json(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// 1) BrasilAPI: dados da Receita (sem inscrição estadual)
async function brasilApi(d: string): Promise<DadosCnpj | null> {
  const j = await json(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  if (!j?.razao_social) return null;
  return {
    nome: j.razao_social, nome_fantasia: j.nome_fantasia ? titulo(j.nome_fantasia) : null, email: j.email ? String(j.email).toLowerCase() : null,
    telefone: fone(j.ddd_telefone_1), cep: digitos(j.cep) || null,
    logradouro: titulo([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" ")) || null,
    numero: ou(j.numero), complemento: ou(j.complemento), bairro: j.bairro ? titulo(j.bairro) : null,
    municipio: j.municipio ? titulo(j.municipio) : null, uf: ou(j.uf), situacao: ou(j.descricao_situacao_cadastral),
  };
}

// 2) CNPJ.ws (público): Receita + inscrições estaduais (SINTEGRA)
async function cnpjWs(d: string): Promise<DadosCnpj | null> {
  const j = await json(`https://publica.cnpj.ws/cnpj/${d}`);
  const e = j?.estabelecimento;
  if (!j?.razao_social || !e) return null;
  return {
    nome: j.razao_social, nome_fantasia: e.nome_fantasia ? titulo(e.nome_fantasia) : null, email: e.email ? String(e.email).toLowerCase() : null,
    telefone: fone(e.ddd1, e.telefone1), cep: digitos(e.cep) || null,
    logradouro: titulo([e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ")) || null,
    numero: ou(e.numero), complemento: ou(e.complemento), bairro: e.bairro ? titulo(e.bairro) : null,
    municipio: e.cidade?.nome ? titulo(e.cidade.nome) : null, uf: ou(e.estado?.sigla), situacao: ou(e.situacao_cadastral)?.toUpperCase() ?? null,
    inscricoes: (e.inscricoes_estaduais ?? []).map((i: any) => ({ numero: digitos(i.inscricao_estadual), uf: i.estado?.sigla ?? "", ativa: i.ativo !== false })),
  };
}

// 3) CNPJá (público): Receita + inscrições estaduais
async function cnpja(d: string): Promise<DadosCnpj | null> {
  const j = await json(`https://open.cnpja.com/office/${d}`);
  if (!j?.company?.name) return null;
  const a = j.address ?? {};
  return {
    nome: j.company.name, nome_fantasia: ou(j.alias), email: j.emails?.[0]?.address ? String(j.emails[0].address).toLowerCase() : null,
    telefone: j.phones?.[0] ? fone(j.phones[0].area, j.phones[0].number) : null, cep: digitos(a.zip) || null,
    logradouro: ou(a.street), numero: ou(a.number), complemento: ou(a.details), bairro: ou(a.district),
    municipio: ou(a.city), uf: ou(a.state), situacao: ou(j.status?.text)?.toUpperCase() ?? null,
    inscricoes: (j.registrations ?? []).map((i: any) => ({ numero: digitos(i.number), uf: i.state ?? "", ativa: i.enabled !== false })),
  };
}

/** Dados públicos da Receita pelo CNPJ, com a inscrição estadual quando a fonte informa. Retorna null se não achar. */
export async function buscarCnpj(cnpj: string | null | undefined): Promise<DadosCnpj | null> {
  const d = digitos(cnpj);
  if (d.length !== 14) return null;
  if (cache.has(d)) return cache.get(d)!;
  const [base, ws] = await Promise.all([brasilApi(d), cnpjWs(d)]);
  let dados = base ?? ws;
  let inscricoes = ws?.inscricoes;
  if (!dados || !inscricoes?.length) {
    const ja = await cnpja(d);
    dados = dados ?? ja;
    if (!inscricoes?.length) inscricoes = ja?.inscricoes;
  }
  const res = dados ? { ...dados, inscricoes: inscricoes ?? [] } : null;
  cache.set(d, res);
  return res;
}

/** Inscrição estadual ativa no estado do endereço (ou a primeira ativa). */
export function inscricaoDoEstado(d: DadosCnpj, uf?: string | null) {
  const ativas = (d.inscricoes ?? []).filter((i) => i.ativa && i.numero);
  return (ativas.find((i) => i.uf === (uf ?? d.uf)) ?? ativas[0])?.numero ?? null;
}

/** Preenche só o que está vazio no cadastro (não apaga o que a pessoa já digitou). */
export function preencherVazios(row: Record<string, any>, dados: Partial<Record<string, unknown>>, mapa: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [campo, origem] of Object.entries(mapa)) {
    const v = dados[origem];
    if (v && !row[campo]) out[campo] = v;
  }
  return out;
}
