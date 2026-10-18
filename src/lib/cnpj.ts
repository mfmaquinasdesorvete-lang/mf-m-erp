import { digitos } from "./format";
import { atividades, cnaeFormatado, type Atividade } from "../../supabase/functions/_shared/receita";

export type InscricaoEstadual = { numero: string; uf: string; ativa: boolean };
export type DadosCnpj = {
  nome: string; nome_fantasia: string | null; email: string | null; telefone: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; municipio: string | null; uf: string | null; situacao: string | null;
  inscricoes?: InscricaoEstadual[];
  /** atividade principal e secundárias (CNAE), quando a fonte informa */
  cnae?: Atividade | null; cnaes_secundarios?: Atividade[];
};

const atividade = (codigo: unknown, descricao: unknown): Atividade | null =>
  /[1-9]/.test(digitos(String(codigo ?? ""))) ? { codigo: cnaeFormatado(codigo)!, descricao: String(descricao ?? "").trim() } : null;

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
    cnae: atividade(j.cnae_fiscal, j.cnae_fiscal_descricao), cnaes_secundarios: atividades(j.cnaes_secundarios, "codigo", "descricao"),
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
    cnae: atividade(e.atividade_principal?.id, e.atividade_principal?.descricao), cnaes_secundarios: atividades(e.atividades_secundarias, "id", "descricao"),
  };
}

// CNPJá (público, poucas consultas por minuto): Receita + inscrições estaduais
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
    cnae: atividade(j.mainActivity?.id, j.mainActivity?.text), cnaes_secundarios: atividades(j.sideActivities, "id", "text"),
  };
}

/** Dados públicos da Receita pelo CNPJ, com a inscrição estadual quando a fonte informa. Retorna null se não achar. */
export async function buscarCnpj(cnpj: string | null | undefined): Promise<DadosCnpj | null> {
  const d = digitos(cnpj);
  if (d.length !== 14) return null;
  if (cache.has(d)) return cache.get(d)!;
  // 1º o CNPJá (Receita e inscrições estaduais numa consulta); fora do ar ou no limite, BrasilAPI + CNPJ.ws
  const ja = await cnpja(d);
  if (ja) { cache.set(d, ja); return ja; }
  const [base, ws] = await Promise.all([brasilApi(d), cnpjWs(d)]);
  const dados = base ?? ws;
  const res = dados ? { ...dados, inscricoes: ws?.inscricoes ?? [] } : null;
  cache.set(d, res);
  return res;
}

/** Inscrição estadual ativa no estado do endereço (ou a primeira ativa). */
export function inscricaoDoEstado(d: DadosCnpj, uf?: string | null) {
  const ativas = (d.inscricoes ?? []).filter((i) => i.ativa && i.numero);
  return (ativas.find((i) => i.uf === (uf ?? d.uf)) ?? ativas[0])?.numero ?? null;
}

/** CNAEs secundários como texto, um por linha ("3314-7/12 Manutenção de máquinas"), para editar na tela. */
export function cnaesEmTexto(lista: Atividade[] | null | undefined) {
  return (lista ?? []).map((a) => `${a.codigo} ${a.descricao}`.trim()).join("\n");
}

/** Lê o texto da tela de volta: cada linha começa pelo código (com ou sem máscara) e o resto é a descrição. */
export function cnaesDoTexto(texto: string | null | undefined): Atividade[] {
  return String(texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).flatMap((l) => {
    const m = l.match(/^(\d{4}-?\d\/?\d{2})\s*[-–:]?\s*(.*)$/);
    return m ? [{ codigo: cnaeFormatado(m[1])!, descricao: m[2].trim() }] : [];
  });
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

/** Um campo do cadastro da empresa comparado com a Receita. */
export type ConferenciaCampo = {
  campo: string; rotulo: string; erp: string; receita: string; igual: boolean;
  /** já vem marcado para trocar: dado que vai na NF-e (endereço, IE, CNAE) ou campo vazio no ERP */
  sugerir: boolean;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Texto para comparar: sem acento, minúsculo, só letras e números (e "Rua" = "R."). */
const textoComparavel = (v: unknown) => semAcento(String(v ?? "")).toLowerCase()
  .replace(/\b(r|av|rod|al|trav|tv|est)\.?\s/g, (m) => ({ r: "rua ", av: "avenida ", rod: "rodovia ", al: "alameda ", trav: "travessa ", tv: "travessa ", est: "estrada " } as Record<string, string>)[m.replace(/\W/g, "")] ?? m)
  .replace(/[^a-z0-9]/g, "");

/**
 * Compara o cadastro da unidade (Configurações → Unidades) com os dados públicos da Receita, campo a campo.
 * Telefone, e-mail e complemento não vêm marcados para trocar (a empresa pode usar outro de propósito).
 */
export function conferirComReceita(row: Record<string, any>, d: DadosCnpj): ConferenciaCampo[] {
  const ie = inscricaoDoEstado(d, row.uf);
  const secErp = new Set(((row.cnaes_secundarios ?? []) as Atividade[]).map((a) => digitos(a.codigo)));
  const secRec = d.cnaes_secundarios ?? [];
  const faltam = secRec.filter((a) => !secErp.has(digitos(a.codigo)));
  const sobram = [...secErp].filter((c) => !secRec.some((a) => digitos(a.codigo) === c));
  const linhas: { campo: string; rotulo: string; erp: unknown; receita: unknown; como: "texto" | "numeros" | "email"; fiscal: boolean }[] = [
    { campo: "razao_social", rotulo: "Razão social", erp: row.razao_social, receita: d.nome, como: "texto", fiscal: true },
    { campo: "inscricao_estadual", rotulo: "Inscrição estadual", erp: row.inscricao_estadual, receita: ie, como: "numeros", fiscal: true },
    { campo: "cep", rotulo: "CEP", erp: row.cep, receita: d.cep, como: "numeros", fiscal: true },
    { campo: "logradouro", rotulo: "Logradouro", erp: row.logradouro, receita: d.logradouro, como: "texto", fiscal: true },
    { campo: "numero", rotulo: "Número", erp: row.numero, receita: d.numero, como: "texto", fiscal: true },
    { campo: "complemento", rotulo: "Complemento", erp: row.complemento, receita: d.complemento, como: "texto", fiscal: false },
    { campo: "bairro", rotulo: "Bairro", erp: row.bairro, receita: d.bairro, como: "texto", fiscal: true },
    { campo: "municipio", rotulo: "Município", erp: row.municipio, receita: d.municipio, como: "texto", fiscal: true },
    { campo: "uf", rotulo: "UF", erp: row.uf, receita: d.uf, como: "texto", fiscal: true },
    { campo: "telefone", rotulo: "Telefone", erp: row.telefone, receita: d.telefone, como: "numeros", fiscal: false },
    { campo: "email", rotulo: "E-mail", erp: row.email, receita: d.email, como: "email", fiscal: false },
    { campo: "cnae_principal", rotulo: "CNAE principal", erp: row.cnae_principal, receita: d.cnae ? `${d.cnae.codigo} ${d.cnae.descricao}`.trim() : null, como: "numeros", fiscal: true },
  ];
  const norm = (v: unknown, como: string) => como === "numeros" ? digitos(String(v ?? ""))
    : como === "email" ? String(v ?? "").trim().toLowerCase() : textoComparavel(v);
  const out: ConferenciaCampo[] = linhas
    .filter((l) => l.receita != null && String(l.receita).trim() !== "")
    .map((l) => {
      const erp = String(l.erp ?? "").trim(), receita = String(l.receita ?? "").trim();
      // CNAE: compara só os 7 números do código (a Receita manda o código e a descrição)
      const a = l.campo === "cnae_principal" ? digitos(erp).slice(0, 7) : norm(erp, l.como);
      const b = l.campo === "cnae_principal" ? digitos(d.cnae?.codigo).slice(0, 7) : norm(receita, l.como);
      const igual = a === b;
      return { campo: l.campo, rotulo: l.rotulo, erp, receita, igual, sugerir: !igual && (l.fiscal || !erp) };
    });
  if (secRec.length || secErp.size) {
    out.push({
      campo: "cnaes_secundarios", rotulo: "CNAEs secundários",
      erp: `${secErp.size} no ERP${sobram.length ? ` (${sobram.length} que a Receita não tem)` : ""}`,
      receita: `${secRec.length} na Receita${faltam.length ? `; faltam no ERP: ${faltam.map((a) => a.codigo).join(", ")}` : ""}`,
      igual: !faltam.length && !sobram.length, sugerir: !!(faltam.length || sobram.length),
    });
  }
  return out;
}
