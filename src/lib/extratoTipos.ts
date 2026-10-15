// O que é cada lançamento do extrato, pela descrição do banco: Pix recebido, vendas no cartão, combustível…
// Serve para o resumo da conta ("quantos Pix entraram?") e para as telas de combustível e de compras em marketplaces. Arquivo puro (testado).
import { marketplaceDoExtrato } from "./marketplaces";

export type TipoLanc =
  | "pix_recebido" | "vendas_cartao" | "outra_entrada"
  | "pix_enviado" | "combustivel" | "marketplace" | "pedagio" | "tarifa" | "outra_saida";

export const TIPOS_LANC: { id: TipoLanc; rotulo: string; entrada: boolean }[] = [
  { id: "pix_recebido", rotulo: "Pix recebidos", entrada: true },
  { id: "vendas_cartao", rotulo: "Vendas no cartão / maquininha", entrada: true },
  { id: "outra_entrada", rotulo: "Outras entradas", entrada: true },
  { id: "pix_enviado", rotulo: "Pix enviados", entrada: false },
  { id: "combustivel", rotulo: "Combustível (postos)", entrada: false },
  { id: "marketplace", rotulo: "Mercado Livre, TikTok e outros", entrada: false },
  { id: "pedagio", rotulo: "Pedágio", entrada: false },
  { id: "tarifa", rotulo: "Tarifas e juros", entrada: false },
  { id: "outra_saida", rotulo: "Compras e outras saídas", entrada: false },
];
export const ROTULO_TIPO = Object.fromEntries(TIPOS_LANC.map((t) => [t.id, t.rotulo])) as Record<TipoLanc, string>;

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Posto de combustível pelo nome (no extrato, no fornecedor ou no emitente da nota). "Imposto" não conta. */
export const COMBUSTIVEL = /\b(auto\s*posto|postos?|combustive(l|is)|petrobras|ipiranga|shell|br\s*mania|raizen|ale\s+combust|gasolina|diesel|etanol|abastec\w*|graal)\b/;
const PEDAGIO = /\b(auto\s*ban|autoban|sem\s*parar|conectcar|veloe|move\s*mais|pedagio|arteris|ecovias|ecopistas|rodoanel|via\s*oeste|viaoeste|concessionaria|rodovia\w*)\b/;
const TARIFA = /\b(tarifa|taxa|iof|juros|encargos?|anuidade|mensalidade|multa)\b/;
const VENDAS = /\b(vendas?|deposito infinitepay|antecipacao|recebiveis|maquininha|liquidacao|credito de vendas)\b/;

export const ehCombustivel = (nome: string | null | undefined) => COMBUSTIVEL.test(sem(nome));
/** Fornecedor que é posto: pelo nome ou pela atividade na Receita (CNAE 4731-8, comércio varejista de combustíveis). */
export const ehPosto = (f: { nome?: string | null; nome_fantasia?: string | null; receita?: unknown }) =>
  ehCombustivel(f.nome) || ehCombustivel(f.nome_fantasia) || /\b4731/.test(JSON.stringify(f.receita ?? ""));

export function tipoLancamento(descricao: string | null | undefined, valor: number): TipoLanc {
  const d = sem(descricao);
  if (valor > 0) {
    if (/\bpix\b/.test(d)) return "pix_recebido";
    if (VENDAS.test(d)) return "vendas_cartao";
    return "outra_entrada";
  }
  if (COMBUSTIVEL.test(d)) return "combustivel";
  if (marketplaceDoExtrato(descricao, valor)) return "marketplace";
  if (PEDAGIO.test(d)) return "pedagio";
  if (/\bpix\b/.test(d)) return "pix_enviado";
  if (TARIFA.test(d)) return "tarifa";
  return "outra_saida";
}

export type ResumoTipo = { n: number; total: number };
export type LancResumo = { data: string; valor: number; descricao: string | null; identificador?: string | null };

/** Soma por tipo; o mesmo lançamento importado em duas contas (mesmo identificador) conta uma vez. */
export function resumoPorTipo(lancs: LancResumo[]): Record<TipoLanc, ResumoTipo> {
  const r = Object.fromEntries(TIPOS_LANC.map((t) => [t.id, { n: 0, total: 0 }])) as Record<TipoLanc, ResumoTipo>;
  for (const l of semRepetidos(lancs)) {
    const t = r[tipoLancamento(l.descricao, Number(l.valor))];
    t.n += 1;
    t.total = Math.round((t.total + Number(l.valor)) * 100) / 100;
  }
  return r;
}

export function semRepetidos<T extends LancResumo>(lancs: T[]): T[] {
  const vistos = new Set<string>();
  return lancs.filter((l) => {
    if (!l.identificador) return true;
    if (vistos.has(l.identificador)) return false;
    vistos.add(l.identificador);
    return true;
  });
}

/** Mês a mês (mais novo primeiro): Pix recebidos, vendas no cartão, entradas e saídas. */
export function resumoPorMes(lancs: LancResumo[]) {
  const m = new Map<string, { mes: string; pix_n: number; pix: number; vendas: number; entradas: number; saidas: number }>();
  for (const l of semRepetidos(lancs)) {
    const k = l.data.slice(0, 7);
    const x = m.get(k) ?? { mes: k, pix_n: 0, pix: 0, vendas: 0, entradas: 0, saidas: 0 };
    const v = Number(l.valor);
    const t = tipoLancamento(l.descricao, v);
    if (t === "pix_recebido") { x.pix_n += 1; x.pix += v; }
    if (t === "vendas_cartao") x.vendas += v;
    if (v > 0) x.entradas += v; else x.saidas += -v;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

/** Contas com o mesmo extrato importado (mesmos identificadores): o mesmo arquivo entrou em duas contas. */
export function contasRepetidas(lancs: { conta_bancaria_id: string; identificador?: string | null }[], minimo = 5) {
  const porId = new Map<string, Set<string>>();
  for (const l of lancs) {
    if (!l.identificador) continue;
    const s = porId.get(l.identificador) ?? new Set<string>();
    s.add(l.conta_bancaria_id);
    porId.set(l.identificador, s);
  }
  const pares = new Map<string, number>();
  for (const contas of porId.values()) {
    if (contas.size < 2) continue;
    const lista = [...contas].sort();
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const k = `${lista[i]}|${lista[j]}`;
      pares.set(k, (pares.get(k) ?? 0) + 1);
    }
  }
  return [...pares].filter(([, n]) => n >= minimo).map(([k, iguais]) => { const [a, b] = k.split("|"); return { a, b, iguais }; });
}

/** Nome do estabelecimento na descrição do cartão: "POSTO ESTRELA DO SUL LTDA · cartao" -> "Posto Estrela Do Sul Ltda". */
export function estabelecimento(descricao: string | null | undefined) {
  const s = String(descricao ?? "").split(" · ")[0].replace(/\s{2,}/g, " ").trim();
  return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) || "—";
}
