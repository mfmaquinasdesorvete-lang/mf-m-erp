// O que é cada lançamento do extrato, pela descrição do banco: Pix recebido, vendas no cartão, combustível, impostos…
// Serve para o resumo da conta ("quantos Pix entraram?") e para as telas de combustível, compras em marketplaces e
// impostos, tarifas e funcionários. Arquivo puro (testado).
import { marketplaceDoExtrato } from "./marketplaces";

export type TipoLanc =
  | "pix_recebido" | "vendas_cartao" | "outra_entrada"
  | "pix_enviado" | "funcionario" | "imposto" | "combustivel" | "veiculo" | "marketplace" | "pedagio" | "tarifa" | "outra_saida";

export const TIPOS_LANC: { id: TipoLanc; rotulo: string; entrada: boolean }[] = [
  { id: "pix_recebido", rotulo: "Pix recebidos", entrada: true },
  { id: "vendas_cartao", rotulo: "Vendas no cartão / maquininha", entrada: true },
  { id: "outra_entrada", rotulo: "Outras entradas", entrada: true },
  { id: "pix_enviado", rotulo: "Pix enviados", entrada: false },
  { id: "funcionario", rotulo: "Funcionários", entrada: false },
  { id: "imposto", rotulo: "Impostos e guias", entrada: false },
  { id: "combustivel", rotulo: "Combustível (postos)", entrada: false },
  { id: "veiculo", rotulo: "Manutenção de veículos (oficina, peças, pneus)", entrada: false },
  { id: "marketplace", rotulo: "Mercado Livre, TikTok e outros", entrada: false },
  { id: "pedagio", rotulo: "Pedágio", entrada: false },
  { id: "tarifa", rotulo: "Tarifas (cartão, OLIST, banco) e juros", entrada: false },
  { id: "outra_saida", rotulo: "Compras e outras saídas", entrada: false },
];
export const ROTULO_TIPO = Object.fromEntries(TIPOS_LANC.map((t) => [t.id, t.rotulo])) as Record<TipoLanc, string>;

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Posto de combustível pelo nome (no extrato, no fornecedor ou no emitente da nota). "Imposto" não conta, e "diesel"
 * sozinho também não: "MJ Diesel" é a oficina dos veículos (posto que vende diesel tem "posto" ou "combustíveis" no nome).
 */
// nomes colados das maquininhas também contam: "FininhoAutoPosto", "PostoAtlantica", "RODOPOSTO", "COMERCIO DE COMBUST"
export const COMBUSTIVEL = /\b(auto\s*posto|rodo\s*posto\w*|posto[a-z]*|combust\w*|petrobras|ipiranga|shell|br\s*mania|raizen|gasolina|etanol|abastec\w*|graal)\b|autoposto/;
/** Oficina, peças e pneus dos veículos da empresa ("diesel" sem "posto" é mecânica diesel). */
const VEICULO = /\b(diesel|oficina|auto\s*center|autocenter|centro automotivo|auto\s*pecas|autopecas|pneus?|pneumaticos|borracharia|funilaria|retifica|guincho|mecanica (diesel|automotiva|de veiculos))\b/;
const PEDAGIO = /\b(auto\s*ban|autoban|sem\s*parar|conectcar|veloe|move\s*mais|pedagio|arteris|ecovias|ecopistas|rodoanel|via\s*oeste|viaoeste|concessionaria|rodovia\w*)\b/;
const TARIFA = /\b(tarifa|taxa|iof|juros|encargos?|anuidade|mensalidade|multa)\b/;
// tarifa com o nome escrito ("OLIST · Tarifa Pix recebido"): vem antes do Pix, senão contava como Pix enviado
const TARIFA_ESCRITA = /\b(tarifas?|mdr|anuidade|cesta de servicos|pacote de servicos|debito por divida)\b/;
const VENDAS = /\b(vendas?|deposito infinitepay|antecipacao|recebiveis|maquininha|liquidacao|credito de vendas)\b/;

// guias de imposto pelo nome de quem recebe ("restaurante da fazenda" não conta: precisa ser a secretaria)
const IMPOSTO_FEDERAL = /\b(darf|receita federal|rfb|pgfn|fazenda nacional|simples nacional|pgdas\w*|documento de arrecadacao|previdencia social|inss|fgts|esocial|tesouro nacional)\b/;
const IMPOSTO_ESTADUAL = /\b(sefaz|secretaria (de estado )?da fazenda|secretaria (de estado )?de fazenda|fazenda (publica|estadual|do estado)|dare|gnre|icms|difal|dar-[a-z]{2})\b/;
const IMPOSTO_MUNICIPAL = /\b(prefeitura|municipio de|issqn|iss|iptu|itbi)\b/;
const IMPOSTO_VEICULO = /\b(detran|departamento estadual de transito|ipva|licenciamento|dpvat)\b/;

export type EsferaImposto = "Federal" | "Estadual" | "Municipal" | "Veículos (Detran)";
export const ESFERAS: { id: EsferaImposto; dica: string }[] = [
  { id: "Federal", dica: "DARF, Simples (DAS), INSS, FGTS, PGFN" },
  { id: "Estadual", dica: "ICMS, DIFAL, DARE, GNRE (Secretaria da Fazenda)" },
  { id: "Municipal", dica: "ISS, IPTU, taxas da prefeitura" },
  { id: "Veículos (Detran)", dica: "IPVA, licenciamento, multas" },
];

/** De que esfera é a guia paga, pela descrição do extrato ou da conta; null se não parece imposto. */
export function esferaImposto(descricao: string | null | undefined): EsferaImposto | null {
  const d = sem(descricao);
  if (IMPOSTO_VEICULO.test(d)) return "Veículos (Detran)";
  if (IMPOSTO_ESTADUAL.test(d)) return "Estadual";
  if (IMPOSTO_FEDERAL.test(d)) return "Federal";
  if (IMPOSTO_MUNICIPAL.test(d)) return "Municipal";
  return null;
}

export type OrigemTarifa = "OLIST" | "InfinitePay" | "Cartão" | "Banco";
/** Quem cobrou a tarifa: a OLIST (link, Pix, boleto, cartão pela Zoop), a InfinitePay, outra maquininha ou o banco. */
export function origemTarifa(descricao: string | null | undefined): OrigemTarifa {
  const d = sem(descricao);
  if (/\b(olist|zoop)\b/.test(d)) return "OLIST";
  if (/\b(infinite\s*pay|infinitepay|cloudwalk)\b/.test(d)) return "InfinitePay";
  if (/\b(cartao|maquininha|mdr|antecipacao|stone|cielo|getnet|pagseguro|sumup)\b/.test(d)) return "Cartão";
  return "Banco";
}

/** Nome do funcionário (do cadastro) que aparece na descrição do extrato: "Pix EDSON LINDOLFO DA SILVA · Enviado". */
export function funcionarioDoLancamento<T extends { nome: string }>(descricao: string | null | undefined, funcionarios: T[]): T | null {
  const d = ` ${sem(descricao).replace(/[^a-z0-9]+/g, " ")} `;
  return funcionarios.find((f) => {
    const n = sem(f.nome).replace(/[^a-z0-9]+/g, " ").trim();
    return n.split(" ").length >= 2 && d.includes(` ${n} `);
  }) ?? null;
}

export const ehCombustivel = (nome: string | null | undefined) => COMBUSTIVEL.test(sem(nome));
/** Fornecedor que é posto: pelo nome ou pela atividade na Receita (CNAE 4731-8, comércio varejista de combustíveis). */
export const ehPosto = (f: { nome?: string | null; nome_fantasia?: string | null; receita?: unknown }) =>
  ehCombustivel(f.nome) || ehCombustivel(f.nome_fantasia) || /\b4731/.test(JSON.stringify(f.receita ?? ""));

/** funcionarios: nomes do cadastro de funcionários (o Pix para eles vira "Funcionários"). */
export function tipoLancamento(descricao: string | null | undefined, valor: number, funcionarios: { nome: string }[] = []): TipoLanc {
  const d = sem(descricao);
  if (valor > 0) {
    if (/\bpix\b/.test(d)) return "pix_recebido";
    if (VENDAS.test(d)) return "vendas_cartao";
    return "outra_entrada";
  }
  if (esferaImposto(descricao)) return "imposto";
  if (funcionarios.length && funcionarioDoLancamento(descricao, funcionarios)) return "funcionario";
  if (TARIFA_ESCRITA.test(d)) return "tarifa";
  if (COMBUSTIVEL.test(d)) return "combustivel";
  if (VEICULO.test(d)) return "veiculo";
  if (marketplaceDoExtrato(descricao, valor)) return "marketplace";
  if (PEDAGIO.test(d)) return "pedagio";
  if (/\bpix\b/.test(d)) return "pix_enviado";
  if (TARIFA.test(d)) return "tarifa";
  return "outra_saida";
}

export type ResumoTipo = { n: number; total: number };
export type LancResumo = { data: string; valor: number; descricao: string | null; identificador?: string | null };

/** Soma por tipo; o mesmo lançamento importado em duas contas (mesmo identificador) conta uma vez. */
export function resumoPorTipo(lancs: LancResumo[], funcionarios: { nome: string }[] = []): Record<TipoLanc, ResumoTipo> {
  const r = Object.fromEntries(TIPOS_LANC.map((t) => [t.id, { n: 0, total: 0 }])) as Record<TipoLanc, ResumoTipo>;
  for (const l of semRepetidos(lancs)) {
    const t = r[tipoLancamento(l.descricao, Number(l.valor), funcionarios)];
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

/**
 * Transferências entre as próprias contas que ainda não foram marcadas: o mesmo valor sai de uma conta e entra em outra
 * no mesmo dia (ou no seguinte). Devolve os ids dos dois lados, para não contarem como entrada nem saída.
 */
export function transferenciasInternas<T extends { id: string; conta_bancaria_id: string; data: string; valor: number }>(lancs: T[]): Set<string> {
  const dia = (s: string) => Math.round(Date.parse(`${s.slice(0, 10)}T12:00:00Z`) / 864e5);
  const entradas = new Map<string, T[]>();
  for (const l of lancs) if (Number(l.valor) > 0) {
    const k = Math.round(Number(l.valor) * 100).toString();
    entradas.set(k, [...(entradas.get(k) ?? []), l]);
  }
  const usadas = new Set<string>();
  for (const s of lancs) {
    if (!(Number(s.valor) < 0)) continue;
    const par = (entradas.get(Math.round(-Number(s.valor) * 100).toString()) ?? [])
      .find((e) => !usadas.has(e.id) && e.conta_bancaria_id !== s.conta_bancaria_id && Math.abs(dia(e.data) - dia(s.data)) <= 1);
    if (par) { usadas.add(par.id); usadas.add(s.id); }
  }
  return usadas;
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
