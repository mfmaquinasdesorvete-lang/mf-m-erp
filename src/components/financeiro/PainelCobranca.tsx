// Painel da cobrança (topo de Financeiro → Cobrança): quanto está atrasado e há quanto tempo, quem deve mais, o que vence
// na semana, o que entrou no mês e nos últimos 6 meses e a inadimplência. Os números saem de resumoCobranca (lib).
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, Percent, Wallet } from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import { CartaoPainel, type Cartao } from "@/components/painel/Painel";
import { brl, hoje, pl } from "@/lib/format";
import { resumoCobranca, type ContaCobranca } from "@/lib/cobranca";
import type { Cliente } from "@/lib/types";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
// do amarelo (acabou de vencer) ao vermelho escuro (mais de 90 dias)
const CORES_FAIXA = ["var(--kpi-amarelo, #eab308)", "var(--kpi-laranja)", "#ea580c", "#dc2626", "#7f1d1d"];

export function PainelCobranca({ contas, sit }: {
  contas: (ContaCobranca & { cliente?: Cliente | null })[];
  sit: { em_dia: number; a_vencer: number; atrasado: number };
}) {
  const dia = hoje();
  const r = useMemo(() => resumoCobranca(contas, dia), [contas, dia]);
  const nomes = useMemo(() => new Map(contas.filter((c) => c.cliente_id && c.cliente).map((c) => [c.cliente_id!, c.cliente!.nome_fantasia?.trim() || c.cliente!.nome])), [contas]);
  const cartoes: Cartao[] = [
    { id: "atrasado", rotulo: "Em atraso", valor: brl(r.atrasado), sub: `${sit.atrasado} ${pl(sit.atrasado, "cliente", "clientes")}`, icone: AlertTriangle, cor: "#dc2626" },
    { id: "semana", rotulo: "Vence em 7 dias", valor: brl(r.aVencer), sub: `${sit.a_vencer} ${pl(sit.a_vencer, "cliente", "clientes")}`, icone: CalendarClock, cor: "var(--kpi-laranja)" },
    { id: "mes", rotulo: "Recebido no mês", valor: brl(r.recebidoMes), sub: `${sit.em_dia} ${pl(sit.em_dia, "cliente em dia", "clientes em dia")}`, icone: Wallet, cor: "var(--serie-1)", tendencia: r.meses.map((m) => m.recebido) },
    { id: "inad", rotulo: "Inadimplência", valor: `${r.inadimplencia.toLocaleString("pt-BR")}%`, sub: "atrasado ÷ vencido em 12 meses", icone: Percent, cor: r.inadimplencia > 10 ? "#dc2626" : "var(--kpi-roxo)" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Há quanto tempo está atrasado">
          {r.atrasado > 0
            ? <Rosca total="em atraso" fatias={r.faixas.map((f, i) => ({ rotulo: `${f.rotulo} (${f.qtd})`, valor: f.valor, cor: CORES_FAIXA[i] }))} />
            : <p className="py-6 text-center text-sm text-slate-500">Nenhuma conta atrasada. 🎉</p>}
        </Section>
        <Section title="Quem mais deve">
          <Ranking cor="#dc2626" vazio="Ninguém devendo."
            itens={r.devedores.slice(0, 8).map((d) => ({ rotulo: nomes.get(d.cliente_id) ?? "Cliente", valor: d.valor, detalhe: `${d.contas} ${pl(d.contas, "conta", "contas")} · até ${d.dias} ${pl(d.dias, "dia", "dias")} de atraso` }))} />
        </Section>
        <Section title="Recebido nos últimos 6 meses">
          <Colunas altura={220} vazio="Nada recebido nesses meses." dados={r.meses.map((m) => ({ rotulo: mesCurto(m.mes), valores: [m.recebido] }))}
            series={[{ nome: "Recebido", cor: "var(--serie-1)" }]} />
        </Section>
      </div>
    </div>
  );
}
