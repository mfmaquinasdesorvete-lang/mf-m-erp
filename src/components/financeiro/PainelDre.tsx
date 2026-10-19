// Topo do DRE em estilo painel: os números do mês em foco (receita, lucro líquido, margem líquida e bruta) com a
// variação contra o mês anterior e a linha dos meses, e para onde foi cada real da receita (impostos, custos,
// despesas, financeiro e o que sobrou de lucro).
import { BadgePercent, Landmark, PiggyBank, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui";
import { Rosca } from "@/components/Charts";
import { CartaoPainel, variacao, type Cartao } from "@/components/painel/Painel";
import { brl } from "@/lib/format";
import type { LinhaDre } from "@/lib/dre";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function PainelDre({ linhas, margem, margemBruta, i, rotuloMes }: {
  linhas: LinhaDre[]; margem: (number | null)[]; margemBruta: (number | null)[]; i: number; rotuloMes: string;
}) {
  const v = (chave: string) => linhas.find((l) => l.chave === chave)?.valores ?? [];
  const receita = v("receita"), liquido = v("liquido");
  const r = receita[i] ?? 0, l = liquido[i] ?? 0;
  const ant = i > 0 ? { r: receita[i - 1] ?? 0, l: liquido[i - 1] ?? 0 } : null;
  const cartoes: Cartao[] = [
    { id: "receita", rotulo: `Receita · ${rotuloMes}`, valor: brl(r), icone: TrendingUp, cor: "var(--serie-1)", tendencia: receita, delta: ant ? variacao(r, ant.r) : undefined },
    { id: "lucro", rotulo: "Lucro líquido", valor: brl(l), icone: PiggyBank, cor: l >= 0 ? "#16a34a" : "#dc2626", tendencia: liquido, delta: ant && ant.l > 0 ? variacao(l, ant.l) : undefined },
    { id: "margem", rotulo: "Margem líquida", valor: pct(margem[i]), sub: "lucro em % da receita bruta", icone: BadgePercent, cor: "var(--kpi-roxo)", tendencia: margem.map((m) => (m ?? 0) * 100) },
    { id: "bruta", rotulo: "Margem bruta", valor: pct(margemBruta[i]), sub: "lucro bruto em % da receita líquida", icone: Landmark, cor: "var(--kpi-laranja)", tendencia: margemBruta.map((m) => (m ?? 0) * 100) },
  ];
  // cada saída pela parte da receita do mês (positivo = saiu dinheiro)
  const saida = (chave: string) => Math.max(0, -(v(chave)[i] ?? 0));
  const fatias = [
    { rotulo: "Impostos e deduções", valor: saida("deducao"), cor: "#f59e0b" },
    { rotulo: "Custos", valor: saida("custo"), cor: "#ea580c" },
    { rotulo: "Despesas operacionais", valor: saida("despesas"), cor: "#dc2626" },
    { rotulo: "Financeiro e outros", valor: saida("financeiro") + saida("outros") + saida("tributos"), cor: "#7c3aed" },
    { rotulo: "Lucro", valor: Math.max(0, l), cor: "#16a34a" },
  ].filter((f) => f.valor > 0);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 gap-3">{cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}</div>
      <Card className="min-w-0 p-4">
        <b className="mb-2 block text-sm">{l >= 0 ? "Para onde foi a receita" : "Para onde foi o dinheiro"} · {rotuloMes}</b>
        {r > 0 && fatias.length ? <Rosca total={l >= 0 ? "receita" : "gastos"} fatias={fatias} /> : <p className="py-6 text-center text-sm text-slate-500">Sem receita neste mês.</p>}
      </Card>
    </div>
  );
}
