// Metas de vendas: % atingido, faixa de cor, dias úteis (feriados nacionais de data fixa), projeção do mês,
// quanto falta por dia útil e as regiões do IBGE a partir do estado. Funções puras: a apuração vem do banco
// (metas_apuracao) com as mesmas regras; aqui ficam as contas da tela, da planilha e dos testes.
import type { Aba } from "./exportar";

export type TipoMeta = "empresa" | "vendedor" | "regiao";
export type Regiao = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

/** Regiões do IBGE e os estados de cada uma. */
export const REGIOES: Record<Regiao, string[]> = {
  Norte: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
  Nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "Centro-Oeste": ["DF", "GO", "MT", "MS"],
  Sudeste: ["ES", "MG", "RJ", "SP"],
  Sul: ["PR", "RS", "SC"],
};
export const ORDEM_REGIOES: Regiao[] = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
export const UFS = ORDEM_REGIOES.flatMap((r) => REGIOES[r]);

export const NOME_UF: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso",
  PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

/** Região do IBGE do estado ("sc" → "Sul"); null se não for um estado. */
export function regiaoDaUf(uf: string | null | undefined): Regiao | null {
  const u = (uf ?? "").trim().toUpperCase();
  return ORDEM_REGIOES.find((r) => REGIOES[r].includes(u)) ?? null;
}

/** Chave gravada na meta: "UF:SC" (um estado) ou "REG:Sul" (uma região). */
export const chaveUf = (uf: string) => `UF:${uf.trim().toUpperCase()}`;
export const chaveRegiao = (r: Regiao) => `REG:${r}`;

export type AlvoRegiao = { nivel: "uf"; uf: string; regiao: Regiao } | { nivel: "regiao"; regiao: Regiao };
export function lerChaveRegiao(chave: string | null | undefined): AlvoRegiao | null {
  const [tipo, valor = ""] = String(chave ?? "").split(":");
  if (tipo === "UF") {
    const regiao = regiaoDaUf(valor);
    return regiao ? { nivel: "uf", uf: valor.toUpperCase(), regiao } : null;
  }
  if (tipo === "REG" && (ORDEM_REGIOES as string[]).includes(valor)) return { nivel: "regiao", regiao: valor as Regiao };
  return null;
}

/** "Santa Catarina (SC)", "Região Sul" ou "Sem estado". */
export function rotuloRegiao(chave: string) {
  const a = lerChaveRegiao(chave);
  if (!a) return chave === "UF:--" ? "Sem estado" : chave;
  return a.nivel === "uf" ? `${NOME_UF[a.uf]} (${a.uf})` : `Região ${a.regiao}`;
}

/* ------------------------------- Dias úteis ------------------------------- */

/** Feriados nacionais de data fixa (MM-DD). A Consciência Negra (20/11) é nacional a partir de 2024. */
export const FERIADOS_FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

const dataUTC = (dia: string) => new Date(`${dia.slice(0, 10)}T00:00:00Z`);
const isoUTC = (d: Date) => d.toISOString().slice(0, 10);

export function ehFeriado(dia: string) {
  const md = dia.slice(5, 10);
  return FERIADOS_FIXOS.includes(md) || (md === "11-20" && Number(dia.slice(0, 4)) >= 2024);
}

/** Segunda a sexta que não é feriado nacional fixo. */
export function ehDiaUtil(dia: string) {
  const s = dataUTC(dia).getUTCDay();
  return s !== 0 && s !== 6 && !ehFeriado(dia);
}

/** Dias úteis de `de` até `ate` (os dois inclusive); 0 se `ate` vem antes. */
export function diasUteis(de: string, ate: string) {
  let n = 0;
  for (let d = dataUTC(de), fim = dataUTC(ate); d <= fim; d = new Date(d.getTime() + 864e5)) if (ehDiaUtil(isoUTC(d))) n++;
  return n;
}

/** "2026-10" → "2026-10-31" */
export function fimDoMes(mes: string) {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  return isoUTC(new Date(Date.UTC(a, m, 0)));
}

/** Hoje no horário de Brasília (AAAA-MM-DD): à noite o dia em UTC já virou. */
export const hojeBrasil = (agora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);

/** Mês "AAAA-MM" somado de `n` meses. */
export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.slice(0, 7).split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Os `n` meses que terminam em `mes`, do mais antigo ao mais novo. */
export const mesesAte = (mes: string, n: number) => Array.from({ length: n }, (_, i) => somarMeses(mes, i - n + 1));

/**
 * Dias úteis do mês: total, passados (do dia 1 até hoje, inclusive) e os que ainda faltam (depois de hoje).
 * Mês que já acabou: todos passados. Mês futuro: nenhum.
 */
export function diasUteisDoMes(mes: string, hoje: string) {
  const ini = `${mes.slice(0, 7)}-01`, fim = fimDoMes(mes);
  const total = diasUteis(ini, fim);
  const passados = hoje < ini ? 0 : diasUteis(ini, hoje < fim ? hoje : fim);
  return { total, passados, restantes: total - passados };
}

/* ------------------------- % atingido e projeção ------------------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** % da meta (1 casa); null sem meta. */
export const pctAtingido = (realizado: number, meta: number | null | undefined) => (meta && meta > 0 ? r1((realizado / meta) * 100) : null);

/** Projeção do mês: o ritmo dos dias úteis passados levado ao mês inteiro. Sem dia útil passado: null. */
export function projecao(realizado: number, passados: number, total: number) {
  if (passados >= total) return r2(realizado);
  return passados > 0 ? r2((realizado / passados) * total) : null;
}

/** Quanto vender em cada dia útil que falta para bater a meta. Já bateu: 0. Mês acabou ou sem meta: null. */
export function faltaPorDia(meta: number | null | undefined, realizado: number, restantes: number) {
  if (meta == null) return null;
  if (meta - realizado <= 0) return 0;
  return restantes > 0 ? r2((meta - realizado) / restantes) : null;
}

export type Faixa = "vermelho" | "amarelo" | "verde" | "sem_meta";

/** Vermelho: menos de 70%. Amarelo: 70% a 99%. Verde: 100% ou mais. */
export function faixa(pct: number | null | undefined): Faixa {
  if (pct == null) return "sem_meta";
  return pct >= 100 ? "verde" : pct >= 70 ? "amarelo" : "vermelho";
}

/** Cores (do tema: mudam no escuro) e texto de cada faixa, para não depender só da cor. */
export const COR_FAIXA: Record<Faixa, { barra: string; selo: string; texto: string; rotulo: string }> = {
  vermelho: { barra: "bg-red-500", selo: "bg-red-50 text-red-700", texto: "text-red-700", rotulo: "abaixo de 70%" },
  amarelo: { barra: "bg-amber-500", selo: "bg-amber-50 text-amber-800", texto: "text-amber-700", rotulo: "de 70% a 99%" },
  verde: { barra: "bg-emerald-500", selo: "bg-emerald-50 text-emerald-700", texto: "text-emerald-700", rotulo: "meta batida" },
  sem_meta: { barra: "bg-slate-400", selo: "bg-slate-100 text-slate-600", texto: "text-slate-600", rotulo: "sem meta" },
};

/** Variação em % (1 casa) entre dois valores; null sem base. */
export const variacao = (atual: number, anterior: number) => (anterior > 0 ? r1(((atual - anterior) / anterior) * 100) : null);

/** Tudo de um mês a partir da meta e do realizado (o mesmo que o banco devolve em metas_apuracao). */
export function resumoMeta(meta: number | null | undefined, realizado: number, mes: string, hoje: string) {
  const d = diasUteisDoMes(mes, hoje);
  const pct = pctAtingido(realizado, meta);
  const proj = projecao(realizado, d.passados, d.total);
  return {
    pct, faixa: faixa(pct), diasUteis: d.total, diasPassados: d.passados, diasRestantes: d.restantes,
    projecao: proj, pctProjecao: proj == null ? null : pctAtingido(proj, meta),
    falta: meta == null ? null : r2(Math.max(meta - realizado, 0)), faltaPorDia: faltaPorDia(meta, realizado, d.restantes),
  };
}

/* ------------------------- Campos e cópia de metas ------------------------- */

/** "1.234,56", "1234.5", "R$ 2.000" → número; vazio → null; texto inválido → NaN. */
export function lerNumero(txt: string | number | null | undefined): number | null {
  if (typeof txt === "number") return Number.isFinite(txt) ? txt : NaN;
  const s = String(txt ?? "").replace(/R\$|%|\s/g, "");
  if (!s) return null;
  const limpo = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  return /^-?\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : NaN;
}

/** Número para o campo de digitação: 1234.5 → "1234,5". */
export const numeroCampo = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

/* ------------------------- Linhas da apuração ------------------------- */

/** Uma linha de metas_apuracao (empresa, vendedor, estado "UF:XX" ou região "REG:Nome"). */
export type LinhaApuracao = {
  mes: string; tipo: TipoMeta; chave: string; vendedor_id: string | null; regiao: string | null; nome: string;
  meta: number | null; meta_maquinas: number | null; meta_margem: number | null;
  meta_origem: "cadastrada" | "soma_estados" | "soma_vendedores" | "soma_regioes" | null; observacao: string | null;
  realizado: number; vendas: number; devolucoes: number; maquinas: number; margem_pct: number | null; margem_base: number;
  pct: number | null; dias_uteis: number; dias_passados: number; projecao: number | null; falta: number | null; falta_por_dia: number | null;
  ano_anterior: number; ano_anterior_parcial: number; variacao_ano: number | null;
};

// números que vêm sempre (vazio = 0) e os que podem faltar (vazio = null)
const SEMPRE = ["realizado", "vendas", "devolucoes", "maquinas", "margem_base", "ano_anterior", "ano_anterior_parcial", "dias_uteis", "dias_passados"] as const;
const OPCIONAIS = ["meta", "meta_maquinas", "meta_margem", "margem_pct", "pct", "projecao", "falta", "falta_por_dia", "variacao_ano"] as const;

/** O banco devolve numeric como texto: aqui vira número. */
export function normalizarLinhas(dados: unknown): LinhaApuracao[] {
  if (!Array.isArray(dados)) return [];
  return dados.map((d) => {
    const l: Record<string, unknown> = { ...(d as Record<string, unknown>) };
    for (const k of SEMPRE) l[k] = Number(l[k] ?? 0) || 0;
    for (const k of OPCIONAIS) l[k] = l[k] == null || l[k] === "" ? null : Number(l[k]);
    l.mes = String(l.mes ?? "").slice(0, 10);
    return l as unknown as LinhaApuracao;
  });
}

/**
 * Ranking: quem tem meta pelo % (maior primeiro, empate pelo valor); depois quem vendeu sem meta; "Sem vendedor" no fim.
 * Vendedor sem meta e sem venda no mês (só vendeu no ano anterior) fica de fora.
 */
export function rankingVendedores(linhas: LinhaApuracao[]) {
  const peso = (l: LinhaApuracao) => (l.chave === "sem_vendedor" ? 2 : l.pct == null ? 1 : 0);
  return linhas.filter((l) => l.tipo === "vendedor" && (l.meta != null || l.realizado !== 0))
    .sort((a, b) => peso(a) - peso(b) || (b.pct ?? 0) - (a.pct ?? 0) || b.realizado - a.realizado || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type GrupoRegiao = {
  regiao: Regiao; meta: number | null; realizado: number; pct: number | null; faixa: Faixa; projecao: number | null;
  anoAnterior: number; variacaoAno: number | null; metaPelosEstados: boolean; ufs: LinhaApuracao[];
};

/**
 * Agrupa os estados nas 5 regiões do IBGE. Vale a linha da região que veio do banco; sem ela, soma os estados
 * (meta: a soma das metas dos estados que têm meta). Estados de cada região: com meta ou venda, maior venda primeiro.
 */
export function agruparRegioes(linhas: LinhaApuracao[], mes: string, hoje: string): GrupoRegiao[] {
  return ORDEM_REGIOES.map((regiao) => {
    const ufs = linhas.filter((l) => l.tipo === "regiao" && lerChaveRegiao(l.chave)?.nivel === "uf" && regiaoDaUf(l.chave.slice(3)) === regiao)
      .sort((a, b) => b.realizado - a.realizado || a.chave.localeCompare(b.chave));
    const reg = linhas.find((l) => l.tipo === "regiao" && l.chave === chaveRegiao(regiao));
    const comMeta = ufs.filter((u) => u.meta != null);
    const meta = reg ? reg.meta : comMeta.length ? r2(comMeta.reduce((s, u) => s + (u.meta ?? 0), 0)) : null;
    const realizado = reg ? reg.realizado : r2(ufs.reduce((s, u) => s + u.realizado, 0));
    const anoAnterior = reg ? reg.ano_anterior : r2(ufs.reduce((s, u) => s + u.ano_anterior, 0));
    const r = resumoMeta(meta, realizado, mes, hoje);
    return {
      regiao, meta, realizado, pct: r.pct, faixa: r.faixa, projecao: reg ? reg.projecao : r.projecao,
      anoAnterior, variacaoAno: reg ? reg.variacao_ano : variacao(realizado, anoAnterior),
      metaPelosEstados: reg ? reg.meta_origem === "soma_estados" : comMeta.length > 0, ufs,
    };
  });
}

/** Série meta x realizado mês a mês de uma chave (empresa ou um vendedor). Mês sem linha: zero. */
export function serieMetas(linhas: LinhaApuracao[], meses: string[], chave = "empresa") {
  return meses.map((m) => {
    const l = linhas.filter((x) => x.mes.slice(0, 7) === m && x.chave === chave);
    return {
      mes: m,
      meta: l.some((x) => x.meta != null) ? r2(l.reduce((s, x) => s + (x.meta ?? 0), 0)) : null,
      realizado: r2(l.reduce((s, x) => s + x.realizado, 0)),
      anoAnterior: r2(l.reduce((s, x) => s + x.ano_anterior, 0)),
    };
  });
}

const ORIGEM: Record<string, string> = {
  cadastrada: "cadastrada", soma_estados: "soma dos estados", soma_vendedores: "soma dos vendedores", soma_regioes: "soma das regiões",
};
export const rotuloOrigem = (o: LinhaApuracao["meta_origem"]) => (o ? ORIGEM[o] ?? o : "");

/** Planilha (Exportar): uma aba por quadro da tela, com o mês e a unidade escolhidos. */
export function planilhaMetas(linhas: LinhaApuracao[], mes: string, unidade: string): Aba[] {
  const doMes = linhas.filter((l) => l.mes.slice(0, 7) === mes.slice(0, 7));
  const linha = (l: LinhaApuracao, rotulo: string) => ({
    Mês: mes.slice(0, 7), Unidade: unidade, [rotulo]: l.tipo === "regiao" ? rotuloRegiao(l.chave) : l.nome,
    Meta: l.meta, "De onde vem a meta": rotuloOrigem(l.meta_origem), Realizado: l.realizado, "% atingido": l.pct,
    Situação: COR_FAIXA[faixa(l.pct)].rotulo, Projeção: l.projecao, Falta: l.falta, "Falta por dia útil": l.falta_por_dia,
    Vendas: l.vendas, Devoluções: l.devolucoes, Máquinas: l.maquinas, "Meta de máquinas": l.meta_maquinas,
    "Margem %": l.margem_pct, "Meta de margem %": l.meta_margem, "Mesmo mês do ano anterior": l.ano_anterior,
    "Variação sobre o ano anterior %": l.variacao_ano, Observação: l.observacao ?? "",
  });
  const regioes = doMes.filter((l) => l.tipo === "regiao")
    .sort((a, b) => (a.chave.startsWith("REG") ? 0 : 1) - (b.chave.startsWith("REG") ? 0 : 1) || b.realizado - a.realizado);
  const meses = [...new Set(linhas.map((l) => l.mes.slice(0, 7)))].sort();
  return [
    { nome: "Empresa", linhas: doMes.filter((l) => l.tipo === "empresa").map((l) => linha(l, "Quem")) },
    { nome: "Vendedores", linhas: rankingVendedores(doMes).map((l, i) => ({ Posição: l.chave === "sem_vendedor" ? "" : i + 1, ...linha(l, "Vendedor") })) },
    { nome: "Regiões e estados", linhas: regioes.map((l) => linha(l, "Região ou estado")) },
    { nome: "Evolução", linhas: serieMetas(linhas, meses).map((s) => ({ Mês: s.mes, Meta: s.meta, Realizado: s.realizado, "% atingido": pctAtingido(s.realizado, s.meta), "Mesmo mês do ano anterior": s.anoAnterior })) },
  ];
}
