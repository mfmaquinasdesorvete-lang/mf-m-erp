// Conselheiro da margem: lê a margem de contribuição do período (total e por produto, canal, vendedor e cliente)
// e diz, em português simples, o que está comendo a margem e o que fazer. Regras fixas, sem IA: o mesmo número
// dá sempre o mesmo conselho, e cada conselho mostra a conta que o gerou.
import { pctMc, type Valores } from "./margem";

export type GrupoMargem = Valores & { chave: string; nome: string; qtd: number };
export type Conselho = {
  id: string; tom: "alerta" | "atencao" | "oportunidade" | "ok";
  titulo: string; porque: string; fazer: string;
  /** tela para resolver (rota do ERP) */
  ir?: { rotulo: string; para: string };
};

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const parte = (v: number, total: number) => (total > 0 ? v / total : 0);
const nomes = (l: GrupoMargem[]) => l.map((x) => x.nome).join(", ");
const PESO: Record<Conselho["tom"], number> = { alerta: 0, atencao: 1, oportunidade: 2, ok: 3 };

/** Os conselhos do período, do mais grave ao bom; no máximo `max`. */
export function conselhosMargem(d: {
  total: Valores; produtos: GrupoMargem[]; canais: GrupoMargem[]; vendedores: GrupoMargem[]; clientes: GrupoMargem[];
  semCusto?: number; estimadas?: number; vendas?: number;
}, max = 7): Conselho[] {
  const { total } = d;
  const out: Conselho[] = [];
  if (!total.receita) return [{ id: "sem-vendas", tom: "ok", titulo: "Sem vendas no período", porque: "Não há venda aprovada entre as datas escolhidas.", fazer: "Mude o período no alto da tela." }];
  const m = pctMc(total);

  // 1. a margem do período
  if (total.mc < 0) out.push({ id: "mc-negativa", tom: "alerta", titulo: "O período fechou no prejuízo",
    porque: `Os custos variáveis passaram a receita: margem de ${brl(total.mc)} (${pct(m)}).`,
    fazer: "Comece pelos produtos no prejuízo abaixo e reveja os preços antes de novas vendas.", ir: { rotulo: "Formação de preço", para: "/estoque?aba=precos" } });
  else if (m < 0.15) out.push({ id: "mc-baixa", tom: "atencao", titulo: `Margem apertada: ${pct(m)} da receita`,
    porque: `De cada R$ 100 vendidos sobram ${brl(m * 100)} para pagar as despesas fixas (aluguel, salários).`,
    fazer: "Abaixo de 15% o fixo costuma não fechar. Veja o que mais pesa nos conselhos seguintes." });
  else if (m >= 0.3) out.push({ id: "mc-boa", tom: "ok", titulo: `Boa margem: ${pct(m)} da receita`, porque: `Sobraram ${brl(total.mc)} para cobrir o fixo.`, fazer: "Mantenha os preços e acompanhe mês a mês." });

  // 2. produtos no prejuízo e apertados (só os que pesam)
  const prejuizo = d.produtos.filter((p) => p.mc < 0).sort((a, b) => a.mc - b.mc);
  if (prejuizo.length) out.push({ id: "produtos-prejuizo", tom: "alerta",
    titulo: `${prejuizo.length === 1 ? "1 produto vendido" : `${prejuizo.length} produtos vendidos`} no prejuízo`,
    porque: `${nomes(prejuizo.slice(0, 3))}${prejuizo.length > 3 ? "…" : ""}: juntos tiraram ${brl(-prejuizo.reduce((s, p) => s + p.mc, 0))} da margem.`,
    fazer: "Confira o custo no cadastro (pode estar errado) e o preço de venda; se estiver certo, suba o preço ou pare de dar desconto nele.",
    ir: { rotulo: "Formação de preço", para: "/estoque?aba=precos" } });
  const apertados = d.produtos.filter((p) => p.mc >= 0 && pctMc(p) < 0.1 && parte(p.receita, total.receita) >= 0.05).sort((a, b) => b.receita - a.receita);
  if (apertados.length) out.push({ id: "produtos-apertados", tom: "atencao", titulo: "Produtos que vendem muito e quase não deixam margem",
    porque: `${nomes(apertados.slice(0, 3))}: menos de 10% de margem e pelo menos 5% da receita cada.`,
    fazer: "São os primeiros a reajustar: 1 ou 2 pontos no preço deles mexem no resultado do mês todo.", ir: { rotulo: "Formação de preço", para: "/estoque?aba=precos" } });

  // 3. custos que pesam no total
  const custos: [keyof Valores, string, number, string, Conselho["ir"]?][] = [
    ["frete", "O frete pago pela MF", 0.05, "Cobre o frete do cliente (ou embuta no preço) e compare transportadoras na cotação.", { rotulo: "Fretes", para: "/fretes" }],
    ["taxa", "As taxas de cartão e link", 0.03, "Ofereça desconto no Pix ou repasse a taxa do parcelamento ao cliente.", { rotulo: "Formas de pagamento", para: "/formas-pagamento" }],
    ["comissao", "As comissões", 0.08, "Reveja a regra de comissão por desconto: comissão cheia só na venda sem desconto.", { rotulo: "Comissões", para: "/comissoes" }],
  ];
  for (const [k, nome, limite, fazer, ir] of custos) {
    const p = parte(total[k], total.receita);
    if (p > limite) out.push({ id: `custo-${k}`, tom: "atencao", titulo: `${nome} levam ${pct(p)} da receita`,
      porque: `${brl(total[k])} no período (o normal fica abaixo de ${pct(limite)}).`, fazer, ir });
  }

  // 4. canal e vendedor bem abaixo da média
  const abaixo = (l: GrupoMargem[]) => l.filter((g) => parte(g.receita, total.receita) >= 0.05 && pctMc(g) < m - 0.1).sort((a, b) => pctMc(a) - pctMc(b));
  const canal = abaixo(d.canais)[0];
  if (canal) {
    const pior = (["impostos", "taxa", "frete", "comissao"] as const).map((k) => [k, parte(canal[k], canal.receita)] as const).sort((a, b) => b[1] - a[1])[0];
    const rot = { impostos: "impostos", taxa: "taxas", frete: "frete", comissao: "comissão" }[pior[0]];
    out.push({ id: "canal-baixo", tom: "atencao", titulo: `${canal.nome}: margem bem abaixo da média`,
      porque: `${pct(pctMc(canal))} no canal contra ${pct(m)} no total; o que mais pesa é ${rot} (${pct(pior[1])} da receita do canal).`,
      fazer: canal.chave === "marketplace" ? "Use a tabela de preço do marketplace (com a comissão e o frete do canal embutidos)." : "Tenha uma tabela de preço própria para este canal.",
      ir: { rotulo: "Tabelas de preço", para: "/estoque?aba=tabelas" } });
  }
  const vend = abaixo(d.vendedores)[0];
  if (vend) out.push({ id: "vendedor-baixo", tom: "atencao", titulo: `${vend.nome}: vende com margem menor`,
    porque: `${pct(pctMc(vend))} contra ${pct(m)} da média, em ${vend.qtd} ${vend.qtd === 1 ? "venda" : "vendas"}.`,
    fazer: "Converse sobre os descontos dados; o limite de desconto por senha ajuda a segurar." });

  // 5. dependência de um cliente
  const top = [...d.clientes].sort((a, b) => b.receita - a.receita)[0];
  if (top && d.clientes.length > 2 && parte(top.receita, total.receita) > 0.3) out.push({ id: "cliente-concentrado", tom: "atencao",
    titulo: `${pct(parte(top.receita, total.receita))} da receita veio de um cliente só`, porque: `${top.nome} sozinho somou ${brl(top.receita)}.`,
    fazer: "Bom cliente, mas risco alto: se ele parar, o mês cai junto. Trabalhe a lista de clientes sem comprar.", ir: { rotulo: "Clientes", para: "/clientes" } });

  // 6. oportunidade: o produto que mais deixa margem
  const campeao = d.produtos.filter((p) => p.mc > 0 && pctMc(p) >= Math.max(m, 0.2)).sort((a, b) => b.mc - a.mc)[0];
  if (campeao) out.push({ id: "campeao", tom: "oportunidade", titulo: `Empurre o ${campeao.nome}`,
    porque: `Deixou ${brl(campeao.mc)} de margem (${pct(pctMc(campeao))}): o melhor do período.`,
    fazer: "Destaque nas propostas, no site e nas redes; ofereça junto dos produtos de margem apertada." });

  // 7. qualidade dos números
  if (d.semCusto) out.push({ id: "sem-custo", tom: "atencao", titulo: `${d.semCusto} ${d.semCusto === 1 ? "item vendido sem custo" : "itens vendidos sem custo"}`,
    porque: "Sem custo, a margem desses itens aparece maior do que é.", fazer: "Ligue os itens das notas ao cadastro e preencha o custo.", ir: { rotulo: "Qualidade do cadastro", para: "/estoque?aba=qualidade" } });
  if (d.estimadas && d.vendas && parte(d.estimadas, d.vendas) > 0.5) out.push({ id: "impostos-estimados", tom: "oportunidade",
    titulo: "Impostos estimados na maior parte das vendas", porque: `${d.estimadas} de ${d.vendas} vendas ainda sem NF-e autorizada no ERP.`,
    fazer: "Com a nota emitida pelo ERP, os impostos entram exatos e a margem fica real." });

  return out.sort((a, b) => PESO[a.tom] - PESO[b.tom]).slice(0, max);
}
