// Painel da My Frost (empresa anterior): a primeira aba da Retaguarda → My Frost, para entender de relance o que a
// empresa vendeu, as máquinas, a diferença entre o negociado e o que saiu na nota, os fretes e os protestos.
// Os números vêm prontos da função painel_my_frost (só a conta master).
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Gavel, Handshake, Truck, Users, Wrench } from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { CartaoPainel, type Cartao } from "@/components/painel/Painel";
import { DEMO, supabase } from "@/lib/supabase";
import { brl } from "@/lib/format";

type Painel = {
  anos: { ano: number; vendas: number; qtd_vendas: number; devolucoes: number; remessas: number }[];
  clientes: number; maquinas: number; maquinas_ligadas: number;
  negociado: number; na_nota: number; comparadas: number; abaixo_80: number;
  modelos: { modelo: string; qtd: number }[];
  propostas: number; propostas_total: number;
  fretes: { transportadora: string; valor: number; n: number }[];
  protestos: { anuencias: number; quitacoes: number; avisos: number; urgentes: number };
};

/** Teto da receita do Simples para o ICMS e o ISS continuarem dentro do DAS (sublimite estadual). */
const SUBLIMITE = 3_600_000;
const mil = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : brl(v));

export function PainelMyFrost({ onAbrir }: { onAbrir: (aba: "notas" | "propostas" | "fretes") => void }) {
  const { data: p, isLoading, error } = useQuery({
    queryKey: ["painel_my_frost"],
    enabled: !DEMO,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("painel_my_frost");
      if (error) throw error;
      return data as Painel;
    },
  });
  if (isLoading) return <p className="py-8 text-center text-slate-500">Carregando o painel…</p>;
  if (error || !p) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar o painel{error ? `: ${(error as Error).message}` : "."}</p>;

  const vendas = p.anos.reduce((s, a) => s + Number(a.vendas), 0);
  const qtd = p.anos.reduce((s, a) => s + a.qtd_vendas, 0);
  const acimaSublimite = p.anos.filter((a) => Number(a.vendas) > SUBLIMITE);
  const diferenca = Number(p.negociado) - Number(p.na_nota);
  const comFrete = p.fretes.filter((f) => Number(f.valor) > 0);

  const cartoes: Cartao[] = [
    { id: "vendas", rotulo: "Vendas com nota", valor: mil(vendas), sub: `${qtd} notas de venda, 2020 a 2025`, icone: FileText, cor: "var(--kpi-verde)", onClick: () => onAbrir("notas") },
    { id: "clientes", rotulo: "Clientes que compraram", valor: p.clientes.toLocaleString("pt-BR"), sub: "com nota de venda", icone: Users, cor: "var(--kpi-azul)" },
    { id: "maquinas", rotulo: "Máquinas vendidas", valor: p.maquinas.toLocaleString("pt-BR"), sub: `${p.maquinas_ligadas} ligadas à proposta ou à nota`, icone: Wrench, cor: "var(--kpi-ciano)" },
    { id: "propostas", rotulo: "Propostas", valor: p.propostas.toLocaleString("pt-BR"), sub: mil(Number(p.propostas_total)), icone: Handshake, cor: "var(--kpi-roxo)", onClick: () => onAbrir("propostas") },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}</div>

      {(acimaSublimite.length > 0 || p.protestos.urgentes > 0) && (
        <div className="space-y-2">
          {acimaSublimite.map((a) => (
            <p key={a.ano} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{a.ano}: vendas de {mil(Number(a.vendas))}, acima de R$ 3,6 mi (sublimite do Simples). Passando disso, o ICMS e o ISS saem do DAS. Conferir na auditoria fiscal.</span>
            </p>
          ))}
          {p.protestos.urgentes > 0 && (
            <button type="button" onClick={() => onAbrir("fretes")} className="flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-900">
              <Gavel size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>Protestos ainda ativos no cartório de São José: as dívidas foram pagas, faltam as custas de cancelamento. Ver em Fretes e protestos.</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Vendas e devoluções por ano (notas válidas)" className="min-w-0 xl:col-span-3">
          <Colunas altura={240} vazio="Sem notas."
            dados={p.anos.map((a) => ({ rotulo: String(a.ano), valores: [Number(a.vendas), Number(a.devolucoes)] }))}
            series={[{ nome: "Vendas", cor: "var(--serie-1)" }, { nome: "Devoluções", cor: "var(--kpi-laranja)" }]} />
        </Section>
        <Section title="Modelos mais vendidos" className="min-w-0 xl:col-span-2">
          <Ranking cor="var(--kpi-ciano)" formatar={(v) => `${v} máquinas`} vazio="Sem máquinas."
            itens={p.modelos.map((m) => ({ rotulo: m.modelo, valor: m.qtd }))} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Negociado × valor na nota" className="min-w-0 xl:col-span-3">
          <p className="mb-2 text-sm text-slate-600">
            Nas {p.comparadas} máquinas com proposta e nota ligadas, o negociado soma <b className="text-fg">{mil(Number(p.negociado))}</b> e as notas
            somam <b className="text-fg">{mil(Number(p.na_nota))}</b>: diferença de <b className="text-fg">{mil(diferenca)}</b>.
            Em {p.abaixo_80} a nota saiu com menos de 80% do negociado.
          </p>
          <Ranking formatar={mil} vazio="Nenhuma máquina ligada à proposta e à nota."
            itens={[{ rotulo: "Negociado (propostas)", valor: Number(p.negociado) }, { rotulo: "Na nota fiscal", valor: Number(p.na_nota) }]} />
          <p className="mt-2 text-xs text-slate-500">A ligação foi feita pelo nome do cliente, o modelo e a data. Pode haver entrada paga à parte ou mais de uma máquina na mesma nota.</p>
        </Section>
        <Section title="Fretes e protestos" className="min-w-0 xl:col-span-2">
          <Ranking cor="var(--kpi-azul)" formatar={brl} vazio="Sem fretes com valor." onClicar={() => onAbrir("fretes")}
            itens={comFrete.map((f) => ({ rotulo: f.transportadora, valor: Number(f.valor), detalhe: `${f.n} registros` }))} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <button type="button" onClick={() => onAbrir("fretes")} className="rounded-lg bg-slate-50 p-2"><b className="block text-lg text-fg">{p.protestos.anuencias}</b>anuências</button>
            <button type="button" onClick={() => onAbrir("fretes")} className="rounded-lg bg-slate-50 p-2"><b className="block text-lg text-fg">{p.protestos.quitacoes}</b>quitações</button>
            <button type="button" onClick={() => onAbrir("fretes")} className="rounded-lg bg-slate-50 p-2"><b className="block text-lg text-fg">{p.protestos.avisos}</b>avisos do cartório</button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Truck size={13} aria-hidden /> Soma dos CT-e; a fatura entra só quando a transportadora não tem CT-e com valor.</p>
        </Section>
      </div>
    </div>
  );
}
