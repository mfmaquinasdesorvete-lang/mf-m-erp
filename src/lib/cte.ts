// CT-e (conhecimentos de transporte) e faturas de frete: lê a planilha que a transportadora deixa baixar (a da
// Expresso São Miguel: Documento;Tipo;Nota Fiscal;CNPJ Dest;…;Ocorrência;Data;Hora), e faz as contas do painel —
// frete que a MF paga (compras, vendas, transferências), % do frete sobre a nota, entrega no prazo e o que ainda não
// entrou em fatura. Arquivo puro (testado).

export type LinhaCte = {
  numero: string; tipo: string; nf_numero: string | null; nf_serie: string | null; nf_valor: number | null;
  destinatario_cnpj: string | null; destinatario_nome: string | null; remetente_cnpj: string | null; remetente_nome: string | null;
  ag_origem: string | null; ag_destino: string | null; frete: "pago" | "a_pagar" | null; peso_tipo: string | null; peso: number | null;
  volumes: number | null; valor: number; emissao: string; prev_entrega: string | null; ocorrencia: string | null; ocorrencia_em: string | null;
};
export type Sentido = "entrada" | "saida" | "transferencia" | "outro";
export type Cte = Omit<LinhaCte, "ocorrencia_em"> & {
  id: string; ocorrencia_em: string | null; sentido: Sentido; mf_paga: boolean; unidade_id: string | null; transportadora_id: string | null;
  nfe_recebida_id: string | null; nota_fiscal_id: string | null; fatura_id: string | null; origem: string;
};
export type FaturaCte = {
  id: string; transportadora_id: string | null; numero: string; emissao: string | null; vencimento: string; valor: number;
  situacao: "aberta" | "paga" | "cancelada"; conta_pagar_id: string | null; unidade_id: string | null; observacao: string | null;
};

export const SENTIDOS: Record<Sentido, { rotulo: string; dica: string }> = {
  entrada: { rotulo: "Compra chegando", dica: "a MF é a destinatária" },
  saida: { rotulo: "Venda saindo", dica: "a MF é a remetente" },
  transferencia: { rotulo: "Transferência SC↔SP", dica: "da MF para a MF" },
  outro: { rotulo: "Outros", dica: "a MF não aparece como remetente nem destinatária" },
};

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "") || null;
const texto = (s: string | undefined) => (s ?? "").trim() || null;

/** "102.5", "2.732,56", "0,3792" → número; vazio → null. */
export function numeroBR(s: string | undefined): number | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
/** "01/04/2026" → "2026-04-01". */
export function dataIso(s: string | undefined): string | null {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** "À pagar"/"FOB" → a_pagar; "Pago"/"CIF" → pago. */
export function tipoFrete(s: string | undefined): "pago" | "a_pagar" | null {
  const t = sem(String(s ?? ""));
  if (/a pagar|fob/.test(t)) return "a_pagar";
  if (/pago|cif/.test(t)) return "pago";
  return null;
}

const COLUNAS: Record<string, keyof LinhaCte | "data" | "hora"> = {
  documento: "numero", tipo: "tipo", "nota fiscal": "nf_numero", "cnpj dest": "destinatario_cnpj", "cliente dest": "destinatario_nome",
  "cnpj rem": "remetente_cnpj", "cliente rem": "remetente_nome", "ag rem": "ag_origem", "ag dest": "ag_destino", frete: "frete",
  "peso/m3": "peso_tipo", peso: "peso", volumes: "volumes", "valor documento": "valor", "serie nf": "nf_serie", "valor nf": "nf_valor",
  emissao: "emissao", "prev entrega": "prev_entrega", ocorrencia: "ocorrencia", data: "data", hora: "hora",
};

/** Lê a planilha (CSV com ";" ou ","); devolve as linhas e o que impediu de ler. */
export function lerPlanilhaCtes(conteudo: string): { linhas: LinhaCte[]; erros: string[] } {
  const linhasTexto = conteudo.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!linhasTexto.length) return { linhas: [], erros: ["arquivo vazio"] };
  const sep = linhasTexto[0].includes(";") ? ";" : ",";
  const cab = linhasTexto[0].split(sep).map((c) => COLUNAS[sem(c)]);
  const faltam = (["numero", "emissao", "valor"] as const).filter((k) => !cab.includes(k));
  if (faltam.length) return { linhas: [], erros: [`a planilha não tem as colunas: ${faltam.join(", ")} (é o relatório de CT-e da transportadora?)`] };
  const linhas: LinhaCte[] = [];
  const erros: string[] = [];
  linhasTexto.slice(1).forEach((l, i) => {
    const v: Record<string, string> = {};
    l.split(sep).forEach((x, j) => { if (cab[j]) v[cab[j]!] = x; });
    const emissao = dataIso(v.emissao);
    if (!texto(v.numero) || !emissao) { erros.push(`linha ${i + 2}: sem número ou data de emissão`); return; }
    const dataOc = dataIso(v.data);
    linhas.push({
      numero: texto(v.numero)!, tipo: texto(v.tipo) ?? "CT-e", nf_numero: texto(v.nf_numero), nf_serie: texto(v.nf_serie), nf_valor: numeroBR(v.nf_valor),
      destinatario_cnpj: digitos(v.destinatario_cnpj), destinatario_nome: texto(v.destinatario_nome),
      remetente_cnpj: digitos(v.remetente_cnpj), remetente_nome: texto(v.remetente_nome),
      ag_origem: texto(v.ag_origem), ag_destino: texto(v.ag_destino), frete: tipoFrete(v.frete),
      peso_tipo: texto(v.peso_tipo), peso: numeroBR(v.peso), volumes: numeroBR(v.volumes), valor: numeroBR(v.valor) ?? 0,
      emissao, prev_entrega: dataIso(v.prev_entrega), ocorrencia: texto(v.ocorrencia),
      ocorrencia_em: dataOc ? `${dataOc}T${/^\d{2}:\d{2}$/.test(String(v.hora ?? "").trim()) ? String(v.hora).trim() : "12:00"}:00-03:00` : null,
    });
  });
  return { linhas, erros };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const entregue = (c: Pick<Cte, "ocorrencia" | "ocorrencia_em">) => !!c.ocorrencia_em && /entregue/i.test(c.ocorrencia ?? "");
/** Dias de atraso da entrega (0 = no prazo); null se ainda não entregou ou não tem previsão. */
export function atrasoDias(c: Pick<Cte, "ocorrencia" | "ocorrencia_em" | "prev_entrega">) {
  if (!entregue(c) || !c.prev_entrega) return null;
  const real = c.ocorrencia_em!.slice(0, 10);
  return Math.max(0, Math.round((Date.parse(real) - Date.parse(c.prev_entrega)) / 864e5));
}
/** Frete sobre o valor da nota (0,05 = 5%); null sem o valor da nota. */
export const pesoDoFrete = (c: Pick<Cte, "valor" | "nf_valor">) => (c.nf_valor && c.nf_valor > 0 ? Number(c.valor) / Number(c.nf_valor) : null);

export type ResumoCtes = {
  qtd: number; fretePagoMF: number; qtdPagoMF: number; compras: number; vendas: number; transferencias: number;
  nfCompras: number; nfVendas: number; semFatura: number; qtdSemFatura: number; entregues: number; noPrazo: number; atrasoMedio: number | null;
};
/** Números do painel para a lista dada (já filtrada pelo período). */
export function resumoCtes(ctes: Cte[]): ResumoCtes {
  const pagos = ctes.filter((c) => c.mf_paga);
  const soma = (l: Cte[], f: (c: Cte) => number) => r2(l.reduce((s, c) => s + (Number(f(c)) || 0), 0));
  const comEntrega = ctes.filter((c) => atrasoDias(c) != null);
  const atrasados = comEntrega.filter((c) => (atrasoDias(c) ?? 0) > 0);
  return {
    qtd: ctes.length, fretePagoMF: soma(pagos, (c) => c.valor), qtdPagoMF: pagos.length,
    compras: soma(pagos.filter((c) => c.sentido === "entrada"), (c) => c.valor), vendas: soma(pagos.filter((c) => c.sentido === "saida"), (c) => c.valor),
    transferencias: soma(pagos.filter((c) => c.sentido === "transferencia"), (c) => c.valor),
    nfCompras: soma(pagos.filter((c) => c.sentido === "entrada"), (c) => c.nf_valor ?? 0), nfVendas: soma(pagos.filter((c) => c.sentido === "saida"), (c) => c.nf_valor ?? 0),
    semFatura: soma(pagos.filter((c) => !c.fatura_id), (c) => c.valor), qtdSemFatura: pagos.filter((c) => !c.fatura_id).length,
    entregues: comEntrega.length, noPrazo: comEntrega.length - atrasados.length,
    atrasoMedio: atrasados.length ? r2(atrasados.reduce((s, c) => s + (atrasoDias(c) ?? 0), 0) / atrasados.length) : null,
  };
}

/** Mês a mês (AAAA-MM), do mais novo para o mais antigo. */
export function porMes(ctes: Cte[]) {
  const m = new Map<string, Cte[]>();
  for (const c of ctes) m.set(c.emissao.slice(0, 7), [...(m.get(c.emissao.slice(0, 7)) ?? []), c]);
  return [...m].sort(([a], [b]) => b.localeCompare(a)).map(([mes, l]) => ({ mes, ...resumoCtes(l) }));
}

/** Quem mais gera frete pago pela MF nas compras (remetente) — onde negociar frete ou CIF com o fornecedor. */
export function porRemetente(ctes: Cte[], limite = 8) {
  const m = new Map<string, { nome: string; qtd: number; frete: number; nf: number }>();
  for (const c of ctes.filter((x) => x.mf_paga && x.sentido === "entrada")) {
    const k = c.remetente_cnpj ?? c.remetente_nome ?? "?";
    const g = m.get(k) ?? { nome: c.remetente_nome ?? k, qtd: 0, frete: 0, nf: 0 };
    g.qtd += 1; g.frete = r2(g.frete + Number(c.valor)); g.nf = r2(g.nf + Number(c.nf_valor ?? 0));
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.frete - a.frete).slice(0, limite);
}

/** CT-e que podem entrar numa fatura: a MF paga, sem fatura, da mesma transportadora. */
export const faturavel = (c: Pick<Cte, "mf_paga" | "fatura_id">) => c.mf_paga && !c.fatura_id;

const SUFIXOS = new Set(["s", "a", "sa", "ltda", "me", "eireli", "epp", "cia"]);
/**
 * Saída do extrato que é pagamento à transportadora: as 3 primeiras palavras do nome (sem acento e sem "S/A", "Ltda"
 * no fim) aparecem na descrição, ou o CNPJ mascarado do banco ("***283070001**") começa com a raiz dela sem os 3
 * primeiros dígitos.
 */
export function pagamentoDaTransportadora(descricao: string, nome: string, raiz?: string | null) {
  const d = ` ${sem(descricao).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  const palavras = sem(nome).replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
  while (palavras.length && SUFIXOS.has(palavras[palavras.length - 1])) palavras.pop();
  if (palavras.length && d.includes(` ${palavras.slice(0, 3).join(" ")} `)) return true;
  const mascara = descricao.match(/\*{3}(\d{6,9})\*{2}/)?.[1];
  return !!(raiz && raiz.length === 8 && mascara && mascara.startsWith(raiz.slice(3)));
}

/**
 * Mês a mês: o frete dos CT-e que a MF paga (pela emissão) x o que saiu do banco para a transportadora. A fatura do mês
 * costuma ser paga no mês seguinte, por isso a conta que vale é a acumulada ("em aberto" = CT-e até o mês − pago até o mês).
 */
export function conferenciaMensal(ctes: Pick<Cte, "emissao" | "valor" | "mf_paga">[], pagamentos: { data: string; valor: number }[]) {
  const meses = new Map<string, { frete: number; pago: number }>();
  const m = (k: string) => meses.get(k) ?? meses.set(k, { frete: 0, pago: 0 }).get(k)!;
  for (const c of ctes) if (c.mf_paga) m(c.emissao.slice(0, 7)).frete += Number(c.valor) || 0;
  const primeiro = [...meses.keys()].sort()[0];
  // pagamento antes do 1º CT-e da lista é de fatura antiga: fica fora da conta
  for (const p of pagamentos) if (primeiro && p.data.slice(0, 7) >= primeiro) m(p.data.slice(0, 7)).pago += Math.abs(Number(p.valor) || 0);
  let fretes = 0; let pagos = 0;
  return [...meses].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => {
    fretes += v.frete; pagos += v.pago;
    return { mes, frete: r2(v.frete), pago: r2(v.pago), emAberto: r2(fretes - pagos) };
  }).reverse();
}
