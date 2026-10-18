// Minhas empresas (painel pessoal): as empresas em que a pessoa é ou já foi sócia, com os dados públicos da Receita
// (situação, abertura, CNAE, capital e o quadro de sócios). A consulta é feita aqui no navegador (BrasilAPI e, se
// não responder, CNPJá); nada vai para outro lugar além de public.pessoal_empresas, que só o dono lê.
import { digitos } from "./format";

export type Socio = { nome: string; qualificacao: string | null; entrada: string | null };
export type EmpresaPessoal = {
  id: string; cnpj: string; razao_social: string | null; nome_fantasia: string | null; situacao: string | null; data_situacao: string | null;
  abertura: string | null; natureza: string | null; porte: string | null; cnae: string | null; municipio: string | null; uf: string | null;
  capital_social: number | null; qualificacao: string | null; entrada: string | null; saida: string | null; lembranca: string | null;
  fonte: string | null; conferido_em: string | null; ordem: number; socios?: Socio[] | null;
};
export type DadosReceita = Omit<EmpresaPessoal, "id" | "cnpj" | "qualificacao" | "entrada" | "saida" | "lembranca" | "fonte" | "conferido_em" | "ordem"> & { socios: Socio[] };

export const cnpjFormatado = (c: string) => {
  const d = digitos(c);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : c;
};
/** Os 8 primeiros números: matriz e filiais têm a mesma raiz. */
export const raizDo = (cnpj: string) => digitos(cnpj).slice(0, 8);
export const ehMatriz = (cnpj: string) => digitos(cnpj).slice(8, 12) === "0001";

/** CNPJ válido pelos dois dígitos verificadores. */
export function cnpjValido(c: string) {
  const d = digitos(c);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = [...base].reduce((t, n, i) => t + Number(n) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

/** Cor da situação: ativa verde, baixada cinza, inapta/suspensa/nula vermelho ou âmbar. */
export function tomSituacao(s: string | null | undefined): "ativa" | "baixada" | "problema" | "atencao" | "sem" {
  const t = (s ?? "").toUpperCase();
  if (!t) return "sem";
  if (t.includes("ATIVA")) return "ativa";
  if (t.includes("BAIXADA")) return "baixada";
  if (t.includes("SUSPENSA")) return "atencao";
  return "problema";
}

/** Anos completos entre a data e hoje (ou até a data da baixa). */
export function anosEntre(de: string | null | undefined, ate: string) {
  if (!de) return null;
  const [a1, m1, d1] = de.split("-").map(Number), [a2, m2, d2] = ate.split("-").map(Number);
  return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/** Matriz e filiais juntas, as matrizes pela abertura (a mais antiga primeiro). */
export function agruparEmpresas(lista: EmpresaPessoal[]) {
  const grupos = new Map<string, EmpresaPessoal[]>();
  for (const e of lista) grupos.set(raizDo(e.cnpj), [...(grupos.get(raizDo(e.cnpj)) ?? []), e]);
  return [...grupos.values()].map((g) => {
    const ord = [...g].sort((a, b) => a.cnpj.localeCompare(b.cnpj));
    return { matriz: ord.find((e) => ehMatriz(e.cnpj)) ?? ord[0], filiais: ord.filter((e) => e !== (ord.find((x) => ehMatriz(x.cnpj)) ?? ord[0])) };
  }).sort((a, b) => (a.matriz.abertura ?? "9999").localeCompare(b.matriz.abertura ?? "9999") || a.matriz.cnpj.localeCompare(b.matriz.cnpj));
}

/** Números do alto da aba: quantas, ativas, baixadas, capital das ativas (só a matriz) e desde quando empreende. */
export function resumoEmpresas(lista: EmpresaPessoal[]) {
  const matrizes = agruparEmpresas(lista).map((g) => g.matriz);
  const ativas = matrizes.filter((e) => tomSituacao(e.situacao) === "ativa");
  const aberturas = lista.map((e) => e.abertura).filter(Boolean).sort() as string[];
  return {
    empresas: matrizes.length, filiais: lista.length - matrizes.length, ativas: ativas.length,
    baixadas: matrizes.filter((e) => tomSituacao(e.situacao) === "baixada").length,
    capitalAtivas: ativas.reduce((t, e) => t + Number(e.capital_social ?? 0), 0),
    desde: aberturas[0] ?? null, semConferir: lista.filter((e) => !e.conferido_em).length,
  };
}

const PORTE: Record<string, string> = { "01": "Microempresa (ME)", "03": "Empresa de pequeno porte (EPP)", "05": "Demais" };
const ou = (v: unknown) => (v == null || v === "" ? null : String(v));
const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

async function json(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Lê a resposta da BrasilAPI (Receita). */
export function daBrasilApi(j: any): DadosReceita | null {
  if (!j?.razao_social) return null;
  return {
    razao_social: j.razao_social, nome_fantasia: ou(j.nome_fantasia), situacao: ou(j.descricao_situacao_cadastral),
    data_situacao: data(j.data_situacao_cadastral), abertura: data(j.data_inicio_atividade), natureza: ou(j.natureza_juridica),
    porte: ou(j.porte) ?? PORTE[String(j.codigo_porte ?? "").padStart(2, "0")] ?? null,
    cnae: j.cnae_fiscal ? `${String(j.cnae_fiscal).replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")} ${j.cnae_fiscal_descricao ?? ""}`.trim() : null,
    municipio: ou(j.municipio), uf: ou(j.uf), capital_social: j.capital_social != null ? Number(j.capital_social) : null,
    socios: (j.qsa ?? []).map((s: any) => ({ nome: String(s.nome_socio ?? "").trim(), qualificacao: ou(s.qualificacao_socio), entrada: data(s.data_entrada_sociedade) })).filter((s: Socio) => s.nome),
  };
}

/** Lê a resposta do CNPJá (Receita). */
export function doCnpja(j: any): DadosReceita | null {
  if (!j?.company?.name) return null;
  return {
    razao_social: j.company.name, nome_fantasia: ou(j.alias), situacao: ou(j.status?.text)?.toUpperCase() ?? null, data_situacao: data(j.statusDate),
    abertura: data(j.founded), natureza: ou(j.company.nature?.text), porte: ou(j.company.size?.text),
    cnae: j.mainActivity ? `${String(j.mainActivity.id).replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")} ${j.mainActivity.text ?? ""}`.trim() : null,
    municipio: ou(j.address?.city), uf: ou(j.address?.state), capital_social: j.company.equity != null ? Number(j.company.equity) : null,
    socios: (j.company.members ?? []).map((m: any) => ({ nome: String(m.person?.name ?? "").trim(), qualificacao: ou(m.role?.text), entrada: data(m.since) })).filter((s: Socio) => s.nome),
  };
}

/** Dados públicos do CNPJ na Receita; null se nenhuma fonte responder. */
export async function consultarReceita(cnpj: string): Promise<DadosReceita | null> {
  const d = digitos(cnpj);
  if (d.length !== 14) return null;
  return daBrasilApi(await json(`https://brasilapi.com.br/api/cnpj/v1/${d}`)) ?? doCnpja(await json(`https://open.cnpja.com/office/${d}`));
}

/** A pessoa no quadro de sócios: pelo nome (sem acento, maiúsculo), comparando com os nomes dela. */
export function euNoQuadro(socios: Socio[] | null | undefined, meusNomes: string[]): Socio | null {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const meus = meusNomes.map(n).filter((x) => x.length >= 5);
  return (socios ?? []).find((s) => meus.some((m) => n(s.nome) === m || n(s.nome).startsWith(`${m} `) || m.startsWith(`${n(s.nome)} `))) ?? null;
}
