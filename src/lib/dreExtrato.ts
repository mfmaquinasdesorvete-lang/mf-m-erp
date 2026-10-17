// Extratos dos bancos no DRE: o que entrou e saiu das contas e não está lançado como conta a pagar ou a receber.
// Fica de fora: o mesmo extrato importado duas vezes, transferência entre as contas da MF, dinheiro com sócios e
// empresas ligadas (painel próprio), linha já ligada a uma conta e a que bate com uma conta paga (mesmo valor,
// até 5 dias de diferença): essas já entram pela conta. Cada linha cai numa linha do DRE pelo tipo do lançamento.
// Puro (sem banco e sem tela). Testes em __tests__/dreExtrato.test.ts.
import type { GrupoDre, LancDre } from "./dre";
import { esferaImposto, semRepetidos, tipoLancamento, transferenciasInternas, type TipoLanc } from "./extratoTipos";
import { classificar, type Parte, type Propria } from "./partesRelacionadas";

export type LancExtratoDre = {
  id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; identificador?: string | null;
  status?: string | null; conta_receber_id?: string | null; conta_pagar_id?: string | null; par_transferencia_id?: string | null;
};
export type ContaBancariaDre = { id: string; ativo?: boolean | null; unidade_id?: string | null; nome?: string | null };
/** Conta paga ou recebida (para não contar a mesma linha duas vezes). */
export type ContaPagaDre = { tipo: "receber" | "pagar"; valor: number; valor_pago?: number | null; status: string; data_pagamento?: string | null };

/** Linha do DRE (grupo) e nome da categoria de cada tipo do extrato. */
const DESTINO: Record<TipoLanc, { grupo: GrupoDre; categoria: string }> = {
  pix_recebido: { grupo: "receita", categoria: "Recebido no banco: Pix" },
  vendas_cartao: { grupo: "receita", categoria: "Recebido no banco: cartão e maquininha" },
  outra_entrada: { grupo: "outros", categoria: "Outras entradas no banco" },
  pix_enviado: { grupo: "despesa_operacional", categoria: "Pix enviados sem conta lançada" },
  funcionario: { grupo: "despesa_operacional", categoria: "Funcionários (Pix)" },
  imposto: { grupo: "deducao", categoria: "Impostos e guias pagos" },
  combustivel: { grupo: "despesa_operacional", categoria: "Combustível" },
  veiculo: { grupo: "despesa_operacional", categoria: "Manutenção de veículos" },
  marketplace: { grupo: "custo", categoria: "Compras em marketplaces" },
  pedagio: { grupo: "despesa_operacional", categoria: "Pedágio" },
  tarifa: { grupo: "despesa_financeira", categoria: "Tarifas (cartão, OLIST, banco) e juros" },
  outra_saida: { grupo: "despesa_operacional", categoria: "Compras e outras saídas sem conta lançada" },
};

const dia = (s: string) => Math.round(Date.parse(`${s.slice(0, 10)}T12:00:00Z`) / 864e5);
const centavos = (v: number) => Math.round(Math.abs(Number(v)) * 100);

export type ResultadoExtratoDre = {
  lancamentos: (LancDre & { unidade_id: string | null })[];
  /** Quantas linhas ficaram de fora e por quê (para a explicação na tela). */
  fora: { repetidas: number; transferencias: number; partes: number; ja_em_conta: number; conta_inativa: number };
};

export function extratoParaDre(
  lancs: LancExtratoDre[], contasBancarias: ContaBancariaDre[], contasPagas: ContaPagaDre[],
  opc: { funcionarios?: { nome: string }[]; partes?: Parte[]; propria?: Propria } = {},
): ResultadoExtratoDre {
  const fora = { repetidas: 0, transferencias: 0, partes: 0, ja_em_conta: 0, conta_inativa: 0 };
  const ativas = new Map(contasBancarias.filter((c) => c.ativo !== false).map((c) => [c.id, c]));
  const dasAtivas = lancs.filter((l) => ativas.has(l.conta_bancaria_id));
  fora.conta_inativa = lancs.length - dasAtivas.length;
  const unicas = semRepetidos(dasAtivas);
  fora.repetidas = dasAtivas.length - unicas.length;
  const pares = transferenciasInternas(unicas);

  // contas pagas/recebidas ainda sem linha do extrato: cada uma "consome" uma linha de mesmo valor e data próxima
  const sobra = new Map<string, number[]>();
  for (const c of contasPagas) {
    if (c.status !== "pago" || !c.data_pagamento) continue;
    const k = `${c.tipo === "receber" ? "+" : "-"}${centavos(Number(c.valor_pago ?? c.valor))}`;
    sobra.set(k, [...(sobra.get(k) ?? []), dia(c.data_pagamento)]);
  }

  const out: ResultadoExtratoDre["lancamentos"] = [];
  for (const l of [...unicas].sort((a, b) => a.data.localeCompare(b.data))) {
    const v = Number(l.valor);
    if (!v) continue;
    if (l.conta_receber_id || l.conta_pagar_id) { fora.ja_em_conta++; continue; }
    if (l.status === "transferencia" || l.par_transferencia_id || pares.has(l.id)) { fora.transferencias++; continue; }
    const achado = opc.partes || opc.propria ? classificar(l, opc.partes ?? [], opc.propria ?? { nomes: [], documentos: [] }) : null;
    if (achado) { if (achado.grupo === "parte") fora.partes++; else fora.transferencias++; continue; }
    const k = `${v > 0 ? "+" : "-"}${centavos(v)}`;
    const dias = sobra.get(k);
    const j = dias?.findIndex((d) => Math.abs(d - dia(l.data)) <= 5) ?? -1;
    if (dias && j >= 0) { dias.splice(j, 1); fora.ja_em_conta++; continue; }

    const tipo = tipoLancamento(l.descricao, v, opc.funcionarios ?? []);
    let { grupo, categoria } = DESTINO[tipo];
    // IPVA, licenciamento e multa não são imposto sobre a venda
    if (tipo === "imposto" && esferaImposto(l.descricao) === "Veículos (Detran)") { grupo = "despesa_operacional"; categoria = "Veículos (IPVA, licenciamento, multas)"; }
    out.push({
      tipo: v > 0 ? "receber" : "pagar", categoria, grupo, valor: Math.abs(v), valor_pago: Math.abs(v), status: "pago",
      vencimento: l.data.slice(0, 10), data_pagamento: l.data.slice(0, 10), origem: "extrato",
      unidade_id: ativas.get(l.conta_bancaria_id)?.unidade_id ?? null, canal: ativas.get(l.conta_bancaria_id)?.nome ?? null, descricao: l.descricao,
    });
  }
  return { lancamentos: out, fora };
}
