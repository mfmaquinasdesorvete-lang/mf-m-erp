// Encontro de contas do painel pessoal: o que passou entre a pessoa (CPF) e cada empresa no período. Nos dois sentidos
// (Pix e TED pelo card "Entre você e as empresas") e as contas da empresa pagas com o dinheiro pessoal (cards "Contas da
// MF pagas por você", "Comissões" e os cards próprios marcados como da empresa). O saldo diz quanto a empresa deve à
// pessoa (ou o contrário); o pró-labore fica à parte, porque não abate o que a empresa deve. Quem dá o nome contábil
// (aporte, mútuo, reembolso, lucros) é o contador.
import { daEmpresa, type Empresa, type Faixa, type LancPessoal } from "@/lib/pessoal";
import type { CardPessoal, Classificacao } from "@/lib/pessoalCards";

export type EmpresaLigada = { id: string; nome: string; e: Empresa };
export type TipoEncontro = "enviou" | "pagou" | "recebeu" | "prolabore";
export type ItemEncontro = { lanc: LancPessoal; tipo: TipoEncontro; valor: number; card: string };
export type SaldoEmpresa = {
  id: string; nome: string;
  /** Pix e TED da pessoa para a empresa */
  enviou: number;
  /** contas da empresa pagas pela conta pessoal */
  pagou: number;
  /** da empresa para a pessoa, fora o pró-labore */
  recebeu: number;
  prolabore: number;
  /** enviou + pagou − recebeu: positivo, a empresa deve à pessoa */
  saldo: number;
  semComprovante: number;
  itens: ItemEncontro[];
};

/** Cards prontos que são sempre gasto da empresa pago pela pessoa. */
export const CARDS_DA_EMPRESA = new Set(["pagou_mf", "comissoes"]);
/** Cards que às vezes são da empresa: a pessoa olha um por um e decide (Lançar na MF). */
export const CARDS_TALVEZ_EMPRESA = new Set(["impostos", "protestos", "pedagio", "redes", "online", "mercadolivre"]);

export const ehDaEmpresa = (c: CardPessoal | undefined) => !!c && (CARDS_DA_EMPRESA.has(c.id) || (!!c.proprio && !!c.naMF));

const r2 = (v: number) => Math.round(v * 100) / 100;

/** De qual empresa é o texto: a primeira ligada que combina; sem nenhuma, a principal (a primeira da lista). */
function qualEmpresa(textos: (string | null | undefined)[], empresas: EmpresaLigada[]): EmpresaLigada | undefined {
  const [principal, ...ligadas] = empresas;
  for (const t of textos) {
    if (!t) continue;
    const achou = ligadas.find((x) => daEmpresa(` ${t} `, x.e)) ?? (principal && daEmpresa(` ${t} `, principal.e) ? principal : undefined);
    if (achou) return achou;
  }
  return principal;
}

export function encontroDeContas(lancs: LancPessoal[], f: Faixa, empresas: EmpresaLigada[], classe: Map<string, Classificacao | null>,
  cards: CardPessoal[], proLabore: string): SaldoEmpresa[] {
  if (!empresas.length) return [];
  const por = new Map<string, SaldoEmpresa>(empresas.map((x) => [x.id, {
    id: x.id, nome: x.nome, enviou: 0, pagou: 0, recebeu: 0, prolabore: 0, saldo: 0, semComprovante: 0, itens: [],
  }]));
  for (const l of lancs) {
    if (l.anulado || l.situacao !== "realizado" || l.data < f.de || l.data > f.ate) continue;
    const cl = classe.get(l.id);
    if (!cl) continue;
    const v = Number(l.valor);
    let tipo: TipoEncontro, valor: number, quem: EmpresaLigada | undefined;
    if (cl.card === "empresas") {
      quem = qualEmpresa([l.descricao], empresas);
      tipo = v < 0 ? "enviou" : l.categoria === proLabore ? "prolabore" : "recebeu";
      valor = Math.abs(v);
    } else {
      const card = cards.find((c) => c.id === cl.card);
      if (!ehDaEmpresa(card)) continue;
      // estorno desconta do que foi pago
      if (v > 0 && !cl.estorno) continue;
      quem = qualEmpresa([l.descricao, cl.regra?.rotulo, cl.regra?.card, card?.nome], empresas);
      tipo = "pagou";
      valor = -v;
    }
    const s = quem && por.get(quem.id);
    if (!s) continue;
    s[tipo] += valor;
    if (!l.comprovante && tipo !== "prolabore") s.semComprovante += 1;
    s.itens.push({ lanc: l, tipo, valor: r2(valor), card: cl.card });
  }
  return [...por.values()].filter((s) => s.itens.length).map((s) => ({
    ...s, enviou: r2(s.enviou), pagou: r2(s.pagou), recebeu: r2(s.recebeu), prolabore: r2(s.prolabore),
    saldo: r2(s.enviou + s.pagou - s.recebeu), itens: s.itens.sort((a, b) => b.lanc.data.localeCompare(a.lanc.data)),
  })).sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
}

export const NOME_TIPO_ENCONTRO: Record<TipoEncontro, string> = {
  enviou: "Você mandou para a empresa", pagou: "Conta da empresa paga por você", recebeu: "A empresa mandou para você", prolabore: "Pró-labore",
};
