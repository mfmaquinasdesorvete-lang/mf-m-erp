// Auditoria financeira: busca no histórico de alterações e nas exceções, e os números do painel.
// Tudo aqui é função pura (sem banco e sem tela). Testes em __tests__/auditoriaBusca.test.ts.
//
// Como a busca acha:
// - sem acento e sem diferença entre maiúscula e minúscula;
// - várias palavras: todas precisam aparecer (em qualquer campo e em qualquer ordem); "entre aspas" vale como frase;
// - valor de qualquer jeito: "1.234,56", "1234,56", "1234.56" e "R$ 1.234,56" acham o mesmo número;
// - CPF, CNPJ, nota ou telefone com ou sem pontos, traços e barras (com 5 dígitos ou mais, acha também um pedaço);
// - data "15/10" ou "15/10/2026".
import type { Excecao, TipoExcecao } from "./auditoria";
import { normalizar } from "./buscaCliente";
import { CHECKLIST, ITENS_CHECKLIST } from "./checklistAuditoria";

export { normalizar };

/* ------------------------------------ nomes ------------------------------------ */

/** Nome de cada tabela do histórico, do jeito que aparece na tela. */
export const ROTULO_TABELA: Record<string, string> = {
  contas_receber: "Conta a receber", contas_pagar: "Conta a pagar", pedidos: "Pedido", clientes: "Cliente", fornecedores: "Fornecedor",
  transportadoras: "Transportadora", produtos: "Produto", usuarios_erp: "Usuário", configuracoes: "Configurações", unidades: "Unidade",
  vendedores: "Vendedor", comissoes: "Comissão", contas_bancarias: "Conta bancária", extrato_lancamentos: "Extrato",
  auditoria_excecoes: "Exceção", auditoria_checklist: "Checklist da auditoria", funcionarios: "Funcionário", clientes_pessoas: "Contato do cliente",
  regua_cobranca: "Régua de cobrança", notas_fiscais: "Nota fiscal", nfe_recebidas: "NF de fornecedor", comissao_regras: "Regra de comissão",
  openfinance_conexoes: "Conexão Open Finance", inter_conexoes: "Conexão do banco", ml_anuncios: "Anúncio do marketplace", ml_contas: "Conta do marketplace",
  tecnicos: "Técnico", categorias_financeiras: "Categoria financeira", centros_custo: "Centro de custo", contas_recorrentes: "Conta recorrente",
};
export const rotuloTabela = (t: string) => ROTULO_TABELA[t] ?? t.replace(/_/g, " ");
export const ROTULO_ACAO: Record<string, string> = { insert: "criou", update: "alterou", delete: "excluiu" };
/** Quem fez: sem usuário (rotina do banco) aparece como "sistema". */
export const quem = (l: { usuario_nome: string | null }) => l.usuario_nome ?? "sistema";

/* ------------------------------------ datas ------------------------------------ */

const p2 = (n: number) => String(n).padStart(2, "0");

/** Dia (AAAA-MM-DD) no fuso de quem usa: o que foi feito às 22h do dia 14 conta no dia 14 (no banco, em UTC, já é dia 15). */
export function diaLocal(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export const hojeLocal = () => diaLocal(new Date().toISOString());

/** Soma dias a uma data AAAA-MM-DD pelo calendário. */
export function somarDiasData(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** "2026-10" + 1 → "2026-11". */
export function somarMes(ym: string, n: number): string {
  const [a, m] = ym.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
}
/** Meia-noite (no fuso de quem usa) do dia, como instante ISO: o limite certo para filtrar created_at no banco. */
export const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString();
export const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 864e5);
/** "2026-10-15" → "15/10". */
export const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;
/** Data do banco do jeito que se digita: "15/10/2026" (com a hora, quando tem). */
function dataTexto(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/* ------------------------------------ valores ------------------------------------ */

const milharOk = (s: string, sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s);

/** Número digitado de qualquer jeito; `decimal` diz se veio com centavos (vírgula ou ponto decimal). */
function interpretar(bruto: string): { valor: number; decimal: boolean } | null {
  let s = bruto.replace(/r\$/gi, "").replace(/[\s ]/g, "");
  let sinal = 1;
  if (/^[-−]/.test(s)) { sinal = -1; s = s.slice(1); }
  s = s.replace(/[.,]$/, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const virgulas = s.split(",").length - 1, pontos = s.split(".").length - 1;
  let inteiro = s, frac = "";
  if (virgulas && pontos) {
    // os dois: o último é o decimal ("1.234,56" ou "1,234.56")
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const mil = dec === "," ? "." : ",";
    const i = s.lastIndexOf(dec);
    inteiro = s.slice(0, i); frac = s.slice(i + 1);
    if (frac.includes(mil) || !milharOk(inteiro, mil)) return null;
    inteiro = inteiro.split(mil).join("");
  } else if (virgulas || pontos) {
    const sep = virgulas ? "," : ".";
    if (virgulas + pontos > 1) {
      if (!milharOk(s, sep)) return null; // "1.234.567"
      inteiro = s.split(sep).join("");
    } else if (sep === "." && /^[1-9]\d{0,2}\.\d{3}$/.test(s)) {
      inteiro = s.replace(".", ""); // "1.234" no jeito brasileiro é mil duzentos e trinta e quatro
    } else {
      [inteiro, frac] = s.split(sep); // "1234,56", "1234.56", "1,5"
    }
  }
  const v = Number(`${inteiro || "0"}.${frac || "0"}`);
  return Number.isFinite(v) ? { valor: sinal * v, decimal: frac !== "" } : null;
}

/**
 * Valor digitado de qualquer jeito: "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "1.234" (mil duzentos…), "-50".
 * Devolve null quando não é um número.
 */
export function lerValor(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  return interpretar(String(texto ?? ""))?.valor ?? null;
}

/** Como lerValor, mas para gravar: valor que não é número para a gravação com o nome do campo. */
export function lerValorOuErro(texto: string | number, campo: string): number {
  const v = lerValor(texto);
  if (v == null) throw new Error(`${campo}: "${texto}" não é um número (digite como 1.500,00)`);
  return v;
}

/** 1234.5 → "1.234,50" (como o valor aparece na tela, sem o "R$"). */
export const valorBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Campos que guardam dinheiro (para a faixa de valor e as maiores mudanças). */
export const ehCampoDinheiro = (campo: string) =>
  /^(valor|preco|saldo|custo)(_|$)/.test(campo) || ["desconto", "frete", "juros", "multa", "limite_credito"].includes(campo);

const comoNumero = (v: unknown): number | null =>
  typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;

/* ------------------------------------ busca ------------------------------------ */

export type Termo = {
  /** como foi digitado, sem acento e em minúsculas */
  texto: string;
  /** texto: palavra · numero: só números (inteiro, documento, nota) · decimal: valor com centavos · data: dd/mm */
  tipo: "texto" | "numero" | "decimal" | "data";
  valor: number | null;
  /** só os dígitos (CPF, CNPJ, nota, pedido, telefone) */
  digitos: string;
  /** digitou o sinal ("-50"): compara com o sinal; sem sinal vale para entrada e saída */
  sinal: boolean;
};

function lerTermo(palavra: string): Termo | null {
  const bruto = palavra.replace(/^r\$/i, "").replace(/^[#("']+/, "").replace(/[)"',;:!?.]+$/, "");
  if (!bruto) return null;
  const texto = normalizar(bruto);
  const data = bruto.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?$/);
  if (data && +data[1] >= 1 && +data[1] <= 31 && +data[2] >= 1 && +data[2] <= 12) {
    const ano = data[3] ? (data[3].length === 2 ? `20${data[3]}` : data[3]) : "";
    return { texto: `${p2(+data[1])}/${p2(+data[2])}${ano ? `/${ano}` : ""}`, tipo: "data", valor: null, digitos: "", sinal: false };
  }
  if (/\d/.test(bruto) && /^[-−]?[\d.,/()\s-]+$/.test(bruto)) {
    const n = interpretar(bruto);
    const sinal = /^[-−]/.test(bruto);
    if (n?.decimal) return { texto, tipo: "decimal", valor: n.valor, digitos: "", sinal };
    return { texto, tipo: "numero", valor: n?.valor ?? null, digitos: bruto.replace(/\D/g, ""), sinal };
  }
  return { texto, tipo: "texto", valor: null, digitos: "", sinal: false };
}

/** Divide o que foi digitado em termos ("R$" sozinho some; "frase entre aspas" é um termo só). */
export function lerConsulta(consulta: string | null | undefined): Termo[] {
  const termos: Termo[] = [];
  const s = String(consulta ?? "").replace(/[“”]/g, '"');
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m[1] !== undefined) {
      const texto = normalizar(m[1]);
      if (texto) termos.push({ texto, tipo: "texto", valor: null, digitos: "", sinal: false });
      continue;
    }
    const t = lerTermo(m[2]);
    if (t) termos.push(t);
  }
  return termos;
}

/** O que dá para achar num registro: o texto (sem acento), os valores e os números de documento. */
export type Alvo = { texto: string; valores: number[]; numeros: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PEDACO_NUMERO = /\d[\d.\-/]*\d|\d/g;

/**
 * Junta os campos de um registro para a busca. Aceita texto, número, lista e objeto (o JSON de antes e depois):
 * código interno (uuid) não entra, data vira "15/10/2026", número vai para os valores.
 */
export function montarAlvo(campos: unknown[], valores: (number | null | undefined)[] = []): Alvo {
  const textos: string[] = [], vs: number[] = [], ns: string[] = [];
  const texto = (s: string) => {
    s = s.trim();
    if (!s || UUID.test(s)) return;
    if (DATA_ISO.test(s)) { textos.push(dataTexto(s)); return; }
    textos.push(s);
    // números que aparecem no texto (documento, nota, pedido): cada pedaço só com os dígitos
    for (const m of s.match(PEDACO_NUMERO) ?? []) ns.push(m.replace(/\D/g, ""));
    if (/^[\d\s.\-/()+]+$/.test(s)) ns.push(s.replace(/\D/g, ""));
    const n = comoNumero(s);
    if (n != null) vs.push(n);
  };
  const visitar = (v: unknown, nivel: number): void => {
    if (v == null || nivel > 5) return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return;
      vs.push(v);
      if (Number.isInteger(v)) ns.push(String(Math.abs(v)));
    } else if (typeof v === "string") texto(v);
    else if (Array.isArray(v)) v.forEach((x) => visitar(x, nivel + 1));
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => visitar(x, nivel + 1));
  };
  campos.forEach((c) => visitar(c, 0));
  for (const v of valores) if (v != null && Number.isFinite(Number(v))) vs.push(Number(v));
  return { texto: normalizar(textos.join(" · ")), valores: vs, numeros: [...new Set(ns.filter(Boolean))] };
}

const mesmoValor = (v: number, t: Termo) =>
  t.valor != null && (t.sinal ? Math.abs(v - t.valor) < 0.005 : Math.abs(Math.abs(v) - Math.abs(t.valor)) < 0.005);

/** Um termo aparece no registro? */
export function casaTermo(a: Alvo, t: Termo): boolean {
  if (t.tipo === "texto" || t.tipo === "data") return a.texto.includes(t.texto);
  if (a.valores.some((v) => mesmoValor(v, t))) return true;
  if (t.tipo === "decimal") return a.texto.includes(t.texto) || a.texto.includes(valorBR(Math.abs(t.valor ?? 0)));
  // número inteiro ou documento: o número igual ou, com 5 dígitos ou mais, um pedaço (CPF, CNPJ, chave da nota, telefone)
  const d = t.digitos;
  return !!d && a.numeros.some((n) => n === d || (d.length >= 5 && n.includes(d)));
}
/** Todos os termos aparecem? (busca vazia = tudo) */
export const casaBusca = (a: Alvo, termos: Termo[]) => termos.every((t) => casaTermo(a, t));

/* ------------------------------------ destaque ------------------------------------ */

export type Trecho = { texto: string; achou: boolean };
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Padrões para marcar na tela o que foi achado (o valor também no formato da tela: "1.234,56"). */
function padroes(termos: Termo[]): { re: RegExp; borda: boolean }[] {
  const out: { re: RegExp; borda: boolean }[] = [];
  const add = (p: string, borda = false) => p && out.push({ re: new RegExp(p, "g"), borda });
  for (const t of termos) {
    if (t.tipo === "texto" || t.tipo === "data") add(escapar(t.texto));
    else if (t.tipo === "decimal") { add(escapar(t.texto)); add(escapar(valorBR(Math.abs(t.valor ?? 0)))); }
    else if (t.digitos) add(t.digitos.split("").join("[.\\-/\\s]?"), t.digitos.length < 5); // "12345678000190" marca "12.345.678/0001-90"
  }
  return out;
}

/** Divide o texto em trechos, marcando o que a busca achou (sem acento e sem diferença de maiúscula). */
export function destacar(texto: string, termos: Termo[]): Trecho[] {
  if (!texto || !termos.length) return [{ texto, achou: false }];
  // versão sem acento, com o caminho de volta para a posição no texto original
  let norm = "";
  const mapa: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const c = /\s/.test(texto[i]) ? " " : texto[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (let k = 0; k < c.length; k++) { norm += c[k]; mapa.push(i); }
  }
  const faixas: [number, number][] = [];
  for (const { re, borda } of padroes(termos)) {
    for (let m = re.exec(norm); m; m = re.exec(norm)) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const fim = m.index + m[0].length;
      // número curto ("50") só inteiro: não marca o "50" de "150"
      if (borda && (/\d/.test(norm[m.index - 1] ?? "") || /\d/.test(norm[fim] ?? ""))) continue;
      faixas.push([mapa[m.index], mapa[fim - 1] + 1]);
    }
  }
  if (!faixas.length) return [{ texto, achou: false }];
  faixas.sort((a, b) => a[0] - b[0]);
  const juntas: [number, number][] = [];
  for (const f of faixas) {
    const u = juntas[juntas.length - 1];
    if (u && f[0] <= u[1]) u[1] = Math.max(u[1], f[1]); else juntas.push([...f]);
  }
  const out: Trecho[] = [];
  let pos = 0;
  for (const [a, b] of juntas) {
    if (a > pos) out.push({ texto: texto.slice(pos, a), achou: false });
    out.push({ texto: texto.slice(a, b), achou: true });
    pos = b;
  }
  if (pos < texto.length) out.push({ texto: texto.slice(pos), achou: false });
  return out;
}

/* ------------------------------ histórico de alterações ------------------------------ */

export type LinhaHistorico = {
  id: number; tabela: string; registro_id: string | null; acao: string; usuario_nome: string | null; campos: string[] | null;
  antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; motivo: string | null; origem: string; created_at: string;
};
export type OpcoesHistorico = {
  /** nome do campo na tela ("valor_pago" → "valor pago") */
  rotuloCampo?: (campo: string) => string;
  /** nome atual do registro (a alteração só guarda os campos que mudaram, sem a descrição) */
  nomeRegistro?: (tabela: string, id: string | null) => string | undefined;
};

/** Descrição ou nome gravado na linha; numa alteração sem esses campos, o nome atual do cadastro. */
export function descricaoLinha(l: LinhaHistorico, nomeRegistro?: OpcoesHistorico["nomeRegistro"]): string {
  const de = (o: Record<string, unknown> | null) =>
    o ? (o.descricao ?? o.nome ?? (l.tabela === "pedidos" && o.numero != null ? `Pedido #${o.numero}` : null)) : null;
  const s = de(l.depois) ?? de(l.antes) ?? nomeRegistro?.(l.tabela, l.registro_id);
  return s == null ? "" : String(s);
}

const PALAVRAS_ACAO: Record<string, string> = {
  insert: "criou criação incluiu", update: "alterou alteração mudou editou", delete: "excluiu exclusão apagou removeu",
};

/** Tudo o que a busca olha numa linha do histórico: quem, área, ação, campos, motivo, quando, nome do registro e o antes/depois. */
export function alvoDaLinha(l: LinhaHistorico, o: OpcoesHistorico = {}): Alvo {
  const campos = l.campos ?? [];
  return montarAlvo([
    quem(l), l.origem === "sistema" ? "automático" : "", l.tabela, rotuloTabela(l.tabela), PALAVRAS_ACAO[l.acao] ?? l.acao,
    campos.join(" "), o.rotuloCampo ? campos.map(o.rotuloCampo).join(" ") : "", l.motivo, l.created_at,
    o.nomeRegistro?.(l.tabela, l.registro_id), l.antes, l.depois,
  ]);
}

/** Valores em dinheiro da linha (na alteração, só os campos que mudaram; na criação e exclusão, os do registro). */
export function valoresDinheiro(l: Pick<LinhaHistorico, "antes" | "depois">): number[] {
  const out: number[] = [];
  for (const o of [l.antes, l.depois]) for (const [k, v] of Object.entries(o ?? {})) {
    const n = ehCampoDinheiro(k) ? comoNumero(v) : null;
    if (n != null) out.push(n);
  }
  return out;
}

/** Campos do registro onde a busca achou algo (para mostrar "achou em CNPJ: …" na criação e na exclusão). */
export function camposAchados(reg: Record<string, unknown> | null | undefined, termos: Termo[]): string[] {
  if (!reg || !termos.length) return [];
  return Object.keys(reg).filter((k) => termos.some((t) => casaTermo(montarAlvo([reg[k]]), t)));
}

export type ItemHistorico<L extends LinhaHistorico = LinhaHistorico> = { l: L; dia: string; alvo: Alvo; dinheiro: number[] };

/** Prepara as linhas uma vez (a cada carga): digitar na busca só compara, não remonta tudo. */
export function indexarHistorico<L extends LinhaHistorico>(linhas: L[], o: OpcoesHistorico = {}): ItemHistorico<L>[] {
  return linhas.map((l) => ({ l, dia: diaLocal(l.created_at), alvo: alvoDaLinha(l, o), dinheiro: valoresDinheiro(l) }));
}

export type PeriodoAtalho = "hoje" | "7d" | "30d" | "mes" | "mes_passado" | "livre";
/** mudancas = alterações e exclusões (o padrão: criação de registro é o dia a dia, não alteração) */
export type AcaoFiltro = "" | "mudancas" | "insert" | "update" | "delete";
export type FiltrosHistorico = {
  busca: string; periodo: PeriodoAtalho; de: string; ate: string; pessoa: string; tabela: string; acao: AcaoFiltro;
  valorMin: string; valorMax: string;
  /** linhas escolhidas no painel ou na exceção (passa por cima dos outros filtros) */
  ids?: number[];
};
export const FILTROS_HISTORICO: FiltrosHistorico = { busca: "", periodo: "mes", de: "", ate: "", pessoa: "", tabela: "", acao: "mudancas", valorMin: "", valorMax: "" };

export const PERIODOS: { valor: PeriodoAtalho; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" }, { valor: "7d", rotulo: "7 dias" }, { valor: "30d", rotulo: "30 dias" },
  { valor: "mes", rotulo: "Este mês" }, { valor: "mes_passado", rotulo: "Mês passado" }, { valor: "livre", rotulo: "De / até" },
];
export const ACOES: { valor: AcaoFiltro; rotulo: string }[] = [
  { valor: "mudancas", rotulo: "Alterações e exclusões" }, { valor: "update", rotulo: "Só alterações" }, { valor: "delete", rotulo: "Só exclusões" },
  { valor: "insert", rotulo: "Só criações" }, { valor: "", rotulo: "Tudo (com criações)" },
];

/** Datas do período (AAAA-MM-DD, as duas pontas valem). "" = sem limite. */
export function intervalo(f: Pick<FiltrosHistorico, "periodo" | "de" | "ate">, hoje: string): { de: string; ate: string } {
  switch (f.periodo) {
    case "hoje": return { de: hoje, ate: hoje };
    case "7d": return { de: somarDiasData(hoje, -6), ate: hoje };
    case "30d": return { de: somarDiasData(hoje, -29), ate: hoje };
    case "mes": return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case "mes_passado": {
      const fim = somarDiasData(`${hoje.slice(0, 7)}-01`, -1);
      return { de: `${fim.slice(0, 7)}-01`, ate: fim };
    }
    default: return f.de && f.ate && f.de > f.ate ? { de: f.ate, ate: f.de } : { de: f.de, ate: f.ate };
  }
}

/** Dias que o painel olha (o histórico desse período fica carregado e serve também à busca). */
export const DIAS_PAINEL = 30;
export type ConsultaHistorico = { de: string; ate: string; acoes: string[] | null };

/**
 * O que pedir ao banco. Dentro dos últimos 30 dias (alterações e exclusões) usa a mesma consulta do painel, que já está
 * carregada; fora disso, só o período e as ações escolhidas (o histórico cresce cerca de mil linhas por dia).
 */
export function consultaHistorico(f: FiltrosHistorico, hoje: string): ConsultaHistorico {
  const painel: ConsultaHistorico = { de: somarDiasData(hoje, -(DIAS_PAINEL - 1)), ate: "", acoes: ["update", "delete"] };
  const { de, ate } = intervalo(f, hoje);
  const soMudancas = f.acao === "mudancas" || f.acao === "update" || f.acao === "delete";
  if (soMudancas && de && de >= painel.de) return painel;
  return { de, ate, acoes: f.acao === "mudancas" ? ["update", "delete"] : f.acao ? [f.acao] : null };
}

const casaAcao = (acao: string, f: AcaoFiltro) => !f || (f === "mudancas" ? acao !== "insert" : acao === f);

/** Faixa de valor digitada (vale com ou sem sinal; "de" maior que "até" é invertido). */
export function faixaValor(min: string, max: string): { min: number; max: number } | null {
  const a = lerValor(min), b = lerValor(max);
  if (a == null && b == null) return null;
  const lo = a == null ? 0 : Math.abs(a), hi = b == null ? Infinity : Math.abs(b);
  return lo <= hi ? { min: lo, max: hi } : { min: hi, max: lo };
}

/** Aplica período, ação, pessoa, área, faixa de valor e busca. */
export function filtrarHistorico<L extends LinhaHistorico>(itens: ItemHistorico<L>[], f: FiltrosHistorico, hoje: string): ItemHistorico<L>[] {
  if (f.ids?.length) { const ids = new Set(f.ids); return itens.filter((x) => ids.has(x.l.id)); }
  const { de, ate } = intervalo(f, hoje);
  const termos = lerConsulta(f.busca);
  const faixa = faixaValor(f.valorMin, f.valorMax);
  return itens.filter((x) =>
    (!de || x.dia >= de) && (!ate || x.dia <= ate)
    && casaAcao(x.l.acao, f.acao)
    && (!f.pessoa || quem(x.l) === f.pessoa)
    && (!f.tabela || x.l.tabela === f.tabela)
    && (!faixa || x.dinheiro.some((v) => Math.abs(v) >= faixa.min - 0.005 && Math.abs(v) <= faixa.max + 0.005))
    && casaBusca(x.alvo, termos));
}

/** Quantos filtros estão diferentes do padrão (sem contar a busca e o período). */
export const filtrosAtivos = (f: FiltrosHistorico) =>
  [f.pessoa, f.tabela, f.acao !== FILTROS_HISTORICO.acao, f.valorMin || f.valorMax].filter(Boolean).length;
export const filtrosLimpos = (f: FiltrosHistorico) =>
  !f.busca && f.periodo === FILTROS_HISTORICO.periodo && !filtrosAtivos(f) && !f.ids?.length;

export type MudancaValor<L> = { l: L; campo: string; antes: number; depois: number; diferenca: number };

/**
 * Números do painel sobre as alterações e exclusões dos últimos 30 dias (criações não entram). Cada número bate com a
 * lista do histórico aberta pelo painel (mesmo período, mesma ação).
 */
export function painelHistorico<L extends LinhaHistorico>(linhas: L[], hoje: string, limite = 5) {
  const ini = somarDiasData(hoje, -(DIAS_PAINEL - 1)), ini7 = somarDiasData(hoje, -6);
  const doPeriodo = linhas.filter((l) => l.acao !== "insert").map((l) => ({ l, dia: diaLocal(l.created_at) })).filter((x) => x.dia >= ini && x.dia <= hoje);
  const porDia = new Map<string, { total: number; exclusoes: number }>();
  for (let i = 0; i < DIAS_PAINEL; i++) porDia.set(somarDiasData(ini, i), { total: 0, exclusoes: 0 });
  const pessoas = new Map<string, number>(), tabelas = new Map<string, number>();
  const mudancas: MudancaValor<L>[] = [];
  for (const { l, dia } of doPeriodo) {
    const d = porDia.get(dia)!;
    d.total++;
    if (l.acao === "delete") d.exclusoes++;
    pessoas.set(quem(l), (pessoas.get(quem(l)) ?? 0) + 1);
    tabelas.set(l.tabela, (tabelas.get(l.tabela) ?? 0) + 1);
    // maior mudança de valor da linha (só quando havia valor antes e depois: baixa e estorno ficam nas exceções)
    if (l.acao === "update") {
      let maior: MudancaValor<L> | null = null;
      for (const campo of l.campos ?? Object.keys(l.depois ?? {})) {
        if (!ehCampoDinheiro(campo)) continue;
        const a = comoNumero(l.antes?.[campo]), b = comoNumero(l.depois?.[campo]);
        if (a == null || b == null || Math.abs(b - a) < 0.005) continue;
        if (!maior || Math.abs(b - a) > Math.abs(maior.diferenca)) maior = { l, campo, antes: a, depois: b, diferenca: Math.round((b - a) * 100) / 100 };
      }
      if (maior) mudancas.push(maior);
    }
  }
  const ranking = (m: Map<string, number>) => [...m].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
  const exclusoes = doPeriodo.filter((x) => x.l.acao === "delete").map((x) => x.l).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    hoje: doPeriodo.filter((x) => x.dia === hoje).length,
    ultimos7: doPeriodo.filter((x) => x.dia >= ini7).length,
    ultimos30: doPeriodo.length,
    exclusoes30: exclusoes.length,
    porDia: [...porDia].map(([dia, v]) => ({ dia, ...v })),
    pessoas: ranking(pessoas).slice(0, limite),
    tabelas: ranking(tabelas).slice(0, limite).map((t) => ({ tabela: t.nome, rotulo: rotuloTabela(t.nome), n: t.n })),
    exclusoesRecentes: exclusoes.slice(0, limite),
    maioresMudancas: mudancas.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)).slice(0, limite),
  };
}

/** O que o banco devolve em auditoria_painel: as contas do período e só as linhas que o painel mostra inteiras. */
export type ResumoHistorico<L> = {
  por_dia: { dia: string; total: number; exclusoes: number }[]; pessoas: { nome: string; n: number }[];
  tabelas: { tabela: string; n: number }[]; linhas: L[];
};
export const RESUMO_VAZIO: ResumoHistorico<never> = { por_dia: [], pessoas: [], tabelas: [], linhas: [] };

/**
 * O mesmo painel de painelHistorico, a partir do resumo feito no banco: as contas (por dia, pessoa e área) já vêm
 * prontas e só as exclusões e as mudanças de valor vêm inteiras, em vez das ~40 mil linhas do período.
 */
export function painelHistoricoResumo<L extends LinhaHistorico>(r: ResumoHistorico<L>, hoje: string, limite = 5) {
  const ini = somarDiasData(hoje, -(DIAS_PAINEL - 1)), ini7 = somarDiasData(hoje, -6);
  const dias = new Map(r.por_dia.map((d) => [d.dia, d]));
  const porDia = Array.from({ length: DIAS_PAINEL }, (_, i) => {
    const dia = somarDiasData(ini, i), d = dias.get(dia);
    return { dia, total: Number(d?.total ?? 0), exclusoes: Number(d?.exclusoes ?? 0) };
  });
  const soma = (de: string) => porDia.filter((d) => d.dia >= de).reduce((s, d) => s + d.total, 0);
  const ranking = (itens: { nome: string; n: number }[]) =>
    itens.map((i) => ({ nome: i.nome, n: Number(i.n) })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, "pt-BR"));
  const { exclusoesRecentes, maioresMudancas } = painelHistorico(r.linhas, hoje, limite);
  return {
    hoje: porDia[porDia.length - 1].total,
    ultimos7: soma(ini7),
    ultimos30: soma(ini),
    exclusoes30: porDia.reduce((s, d) => s + d.exclusoes, 0),
    porDia,
    pessoas: ranking(r.pessoas).slice(0, limite),
    tabelas: ranking(r.tabelas.map((t) => ({ nome: t.tabela, n: t.n }))).slice(0, limite).map((t) => ({ tabela: t.nome, rotulo: rotuloTabela(t.nome), n: t.n })),
    exclusoesRecentes,
    maioresMudancas,
  };
}

/* ------------------------------------ exceções ------------------------------------ */

export type TratativaBusca = { situacao: string; prazo: string | null; responsavel?: string | null; observacao?: string | null; impacto?: string | null };
export const tratativaFechada = (t: { situacao: string }) => t.situacao === "resolvido" || t.situacao === "descartado";

export type VerExcecoes = "abertas" | "prazo_vencido" | "confirmadas" | "fechadas" | "todas";
export type FiltrosExcecoes = { busca: string; tipo: "" | TipoExcecao; gravidade: "" | Excecao["gravidade"]; ver: VerExcecoes; chave: string };
export const FILTROS_EXCECOES: FiltrosExcecoes = { busca: "", tipo: "", gravidade: "", ver: "abertas", chave: "" };
export const VER_EXCECOES: { valor: VerExcecoes; rotulo: string }[] = [
  { valor: "abertas", rotulo: "Em aberto (indício ou confirmado)" }, { valor: "prazo_vencido", rotulo: "Com prazo vencido" },
  { valor: "confirmadas", rotulo: "Erro confirmado (em aberto)" }, { valor: "fechadas", rotulo: "Resolvidas ou descartadas" }, { valor: "todas", rotulo: "Todas" },
];

const SITUACAO: Record<string, string> = { indicio: "indício a conferir", confirmado: "erro confirmado", resolvido: "resolvido", descartado: "descartado" };
const GRAVIDADE: Record<string, string> = { alta: "gravidade alta", media: "gravidade média", baixa: "gravidade baixa" };

export function alvoDaExcecao(e: Excecao, t: TratativaBusca, rotuloTipo = ""): Alvo {
  return montarAlvo([
    rotuloTipo, e.titulo, e.detalhe, GRAVIDADE[e.gravidade], e.data, SITUACAO[t.situacao] ?? t.situacao,
    t.responsavel, t.observacao, t.impacto ? `impacto ${t.impacto}` : "", t.prazo,
  ], [e.valor]);
}

export function verExcecao(ver: VerExcecoes, t: TratativaBusca, hoje: string): boolean {
  switch (ver) {
    case "abertas": return !tratativaFechada(t);
    case "fechadas": return tratativaFechada(t);
    case "prazo_vencido": return !tratativaFechada(t) && !!t.prazo && t.prazo < hoje;
    case "confirmadas": return !tratativaFechada(t) && t.situacao === "confirmado";
    default: return true;
  }
}

export function filtrarExcecoes(excecoes: Excecao[], f: FiltrosExcecoes, trat: (e: Excecao) => TratativaBusca, hoje: string,
  rotuloTipo: (t: TipoExcecao) => string = (t) => t): Excecao[] {
  if (f.chave) return excecoes.filter((e) => e.chave === f.chave);
  const termos = lerConsulta(f.busca);
  return excecoes.filter((e) => {
    const t = trat(e);
    return (!f.tipo || e.tipo === f.tipo) && (!f.gravidade || e.gravidade === f.gravidade) && verExcecao(f.ver, t, hoje)
      && (!termos.length || casaBusca(alvoDaExcecao(e, t, rotuloTipo(e.tipo)), termos));
  });
}

/** Números do painel sobre as exceções em aberto. */
export function painelExcecoes(excecoes: Excecao[], trat: (e: Excecao) => TratativaBusca, hoje: string, limite = 5) {
  const abertas = excecoes.filter((e) => !tratativaFechada(trat(e)));
  const porGravidade = { alta: 0, media: 0, baixa: 0 };
  const tipos = new Map<TipoExcecao, number>();
  for (const e of abertas) { porGravidade[e.gravidade]++; tipos.set(e.tipo, (tipos.get(e.tipo) ?? 0) + 1); }
  return {
    abertas: abertas.length, porGravidade,
    porTipo: [...tipos].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    prazoVencido: abertas.filter((e) => verExcecao("prazo_vencido", trat(e), hoje)).length,
    confirmadas: abertas.filter((e) => trat(e).situacao === "confirmado").length,
    maisAntigas: abertas.filter((e) => e.data).sort((a, b) => a.data!.localeCompare(b.data!)).slice(0, limite)
      .map((e) => ({ e, dias: Math.max(0, diasEntre(e.data!, hoje)) })),
  };
}

/* ------------------------------------ checklist ------------------------------------ */

export type RespostaChecklist = { competencia: string; item: string; situacao: string };

/**
 * Checklist do mês: quanto foi conferido, o que falta por área e os meses anteriores que ficaram com item a conferir
 * (a partir do primeiro mês respondido; o mais antigo primeiro).
 */
export function painelChecklist(respostas: RespostaChecklist[], comp: string) {
  const sit = new Map(respostas.map((r) => [`${r.competencia}:${r.item}`, r.situacao]));
  const situacao = (c: string, id: string) => sit.get(`${c}:${id}`) ?? "pendente";
  const pendentes = (c: string) => ITENS_CHECKLIST.filter((i) => situacao(c, i.id) === "pendente");
  const total = ITENS_CHECKLIST.length;
  const faltam = pendentes(comp);
  const conferidos = total - faltam.length;
  const atrasados: { competencia: string; faltam: number; item: (typeof ITENS_CHECKLIST)[number] }[] = [];
  const primeiro = respostas.map((r) => r.competencia).filter((c) => c < comp).sort()[0];
  if (primeiro) for (let m = primeiro, n = 0; m < comp && n < 120; m = somarMes(m, 1), n++) {
    const p = pendentes(m);
    if (p.length) atrasados.push({ competencia: m, faltam: p.length, item: p[0] });
  }
  return {
    total, conferidos, faltam: faltam.length, pct: Math.floor((conferidos / total) * 100),
    naoConformes: ITENS_CHECKLIST.filter((i) => situacao(comp, i.id) === "nao_conforme").length,
    areas: CHECKLIST.map((s) => ({ id: s.id, titulo: s.titulo, total: s.itens.length, faltam: s.itens.filter((i) => situacao(comp, i.id) === "pendente").length })),
    proximo: faltam[0] ?? null,
    atrasados,
  };
}

/* ------------------------------------ nomes dos registros ------------------------------------ */

export type FontesNomes = {
  receber?: { id: string; descricao?: string | null; cliente_id?: string | null }[];
  pagar?: { id: string; descricao?: string | null; fornecedor_id?: string | null }[];
  pedidos?: { id: string; numero?: number | null }[];
  produtos?: { id: string; sku?: string | null; descricao?: string | null }[];
  fornecedores?: { id: string; nome: string }[];
  clientes?: { id: string; nome: string; nome_fantasia?: string | null }[];
  usuarios?: { user_id: string; nome: string }[];
  bancos?: { id: string; nome: string }[];
};
export const chaveNome = (tabela: string, id: string | null | undefined) => `${tabela}:${id ?? ""}`;

/** Nome atual de cada registro ("contas_pagar:id" → "Aluguel · Imobiliária"): a alteração guarda só os campos que mudaram. */
export function mapaNomes(f: FontesNomes): Map<string, string> {
  const m = new Map<string, string>();
  const cli = new Map((f.clientes ?? []).map((c) => [c.id, c.nome_fantasia?.trim() || c.nome]));
  const forn = new Map((f.fornecedores ?? []).map((x) => [x.id, x.nome]));
  const juntar = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(" · ");
  for (const c of f.receber ?? []) m.set(chaveNome("contas_receber", c.id), juntar(c.descricao, c.cliente_id ? cli.get(c.cliente_id) : null));
  for (const c of f.pagar ?? []) m.set(chaveNome("contas_pagar", c.id), juntar(c.descricao, c.fornecedor_id ? forn.get(c.fornecedor_id) : null));
  for (const p of f.pedidos ?? []) if (p.numero != null) m.set(chaveNome("pedidos", p.id), `Pedido #${p.numero}`);
  for (const p of f.produtos ?? []) m.set(chaveNome("produtos", p.id), juntar(p.sku, p.descricao));
  for (const x of f.fornecedores ?? []) m.set(chaveNome("fornecedores", x.id), x.nome);
  for (const c of f.clientes ?? []) m.set(chaveNome("clientes", c.id), c.nome_fantasia?.trim() && c.nome_fantasia.trim() !== c.nome ? `${c.nome_fantasia.trim()} (${c.nome})` : c.nome);
  for (const u of f.usuarios ?? []) m.set(chaveNome("usuarios_erp", u.user_id), u.nome);
  for (const b of f.bancos ?? []) m.set(chaveNome("contas_bancarias", b.id), b.nome);
  return m;
}
