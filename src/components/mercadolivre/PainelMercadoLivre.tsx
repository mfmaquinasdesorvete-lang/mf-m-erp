// Painel do Mercado Livre (primeira aba): se tem pedido agora (hoje, a enviar, a caminho), os números do período
// (pedidos, faturamento, tarifas, ticket), quanto tempo leva para despachar e entregar, os mais vendidos e as últimas
// vendas. Lê o histórico de tudo o que já foi vendido (ml_historico, via ml_painel); "Puxar histórico" busca o que falta.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, DollarSign, History, Loader2, Package, Percent, ShoppingBag, Truck } from "lucide-react";
import { Button, Card, Section, Stat, Table, chip } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { useInvalidate } from "@/lib/data";
import { brl, dataBR, dataHoraBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { COR_TOM, textoEnvio } from "@/lib/mlPosVenda";
import type { ContaML } from "@/lib/mlAnuncios";

type Painel = {
  agora: { hoje: number; hoje_valor: number; ontem: number; sete_dias: number; a_enviar: number; em_transito: number; ultima_venda: string | null };
  periodo: { pedidos: number; cancelados: number; faturamento: number; tarifas: number; unidades: number; compradores: number };
  anterior: { pedidos: number; faturamento: number } | null;
  tempos: { despacho_horas: number | null; despacho_n: number; entrega_horas: number | null; entrega_n: number; total_horas: number | null };
  serie: { chave: string; pedidos: number; faturamento: number }[];
  mais_vendidos: { titulo: string; unidades: number; valor: number }[];
  ultimas: { order_id: number; data: string | null; status: string | null; total: number | null; comprador: string | null; titulo: string | null; itens: number; envio: string | null }[];
  historico: { vendas: number; primeira: string | null; completo: boolean | null; ate: string | null; atualizado_em: string | null };
};
type Resultado = { vendas: number; envios: number; completo: boolean; ate: string };

const PERIODOS = [[7, "7 dias"], [30, "30 dias"], [90, "90 dias"], [365, "12 meses"], [0, "Tudo"]] as const;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Horas em texto curto: "5 h", "1,5 dia", "3 dias". */
export function duracao(h: number | null | undefined) {
  if (h == null) return "—";
  if (h < 24) return `${h.toLocaleString("pt-BR", { maximumFractionDigits: h < 10 ? 1 : 0 })} h`;
  const d = h / 24;
  return `${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${d < 2 ? "dia" : "dias"}`;
}

const rotuloSerie = (chave: string) => {
  const [a, m, d] = chave.split("-");
  return d ? `${d}/${m}` : `${MESES[Number(m) - 1]}/${a.slice(2)}`;
};

/** Variação contra o período anterior, em texto ("+12% que os 30 dias antes"). */
function comparar(atual: number, antes: number | undefined, nome: string) {
  if (antes == null) return undefined;
  if (!antes) return atual ? `nenhum nos ${nome} antes` : undefined;
  const p = Math.round(((atual - antes) / antes) * 100);
  return `${p > 0 ? "+" : ""}${p}% que os ${nome} antes`;
}

export function PainelMercadoLivre({ conta, irConta }: { conta: ContaML | null; irConta: () => void }) {
  const [dias, setDias] = useState<number>(30);
  const [puxando, setPuxando] = useState<string | null>(null);
  const invalidar = useInvalidate();
  const painel = useQuery({
    queryKey: ["ml_historico", "painel", dias],
    enabled: !!conta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ml_painel", { p_dias: dias });
      if (error) throw error;
      return data as Painel;
    },
    refetchInterval: 120_000,
  });

  /** Busca o histórico em pedaços (cada chamada anda até ~90 s) até chegar à primeira venda. */
  async function puxarHistorico() {
    let total = 0, envios = 0;
    try {
      for (let volta = 1; volta <= 40; volta++) {
        setPuxando(total ? `${total} ${pl(total, "venda", "vendas")} até agora…` : "Buscando as vendas…");
        const r = await callFunction<{ resultado?: Resultado }>("mercadolivre", { acao: "historico" });
        const res = r?.resultado;
        total += res?.vendas ?? 0;
        envios += res?.envios ?? 0;
        invalidar("ml_historico");
        if (!res || (res.completo && !res.envios)) break;
      }
      notify(`Histórico em dia: ${total} ${pl(total, "venda lida", "vendas lidas")} e ${envios} ${pl(envios, "envio completado", "envios completados")}.`);
    } catch (e) { notifyError(e); } finally {
      setPuxando(null);
      invalidar("ml_historico");
    }
  }

  if (!conta) {
    return (
      <Card className="p-4 text-sm text-slate-600">
        Conecte a conta do Mercado Livre para ver os pedidos e o painel. <button type="button" className="link-modulo font-semibold" onClick={irConta}>Conectar a conta</button>
      </Card>
    );
  }
  if (painel.error) return <Card className="p-4 text-sm text-red-700">Não deu para ler o painel: {(painel.error as Error).message}</Card>;
  const p = painel.data;
  if (!p) return <Card className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Carregando o painel…</Card>;

  const nomePeriodo = PERIODOS.find(([d]) => d === dias)?.[1] ?? "";
  const ticket = p.periodo.pedidos ? p.periodo.faturamento / p.periodo.pedidos : 0;
  const pctTarifa = p.periodo.faturamento ? (p.periodo.tarifas / p.periodo.faturamento) * 100 : 0;
  const temPedido = p.agora.hoje > 0 || p.agora.a_enviar > 0;
  const h = p.historico;

  return (
    <div className="space-y-4">
      {/* tem pedido ou não: a primeira coisa a ver */}
      <Card className={`flex flex-wrap items-center gap-3 p-4 ${p.agora.a_enviar ? "border-amber-300" : ""}`}>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${temPedido ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><ShoppingBag size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-fg">
            {p.agora.hoje ? `${p.agora.hoje} ${pl(p.agora.hoje, "pedido hoje", "pedidos hoje")} (${brl(p.agora.hoje_valor)})` : "Nenhum pedido hoje até agora"}
            {p.agora.a_enviar ? ` · ${p.agora.a_enviar} para enviar` : ""}
          </div>
          <p className="text-sm text-slate-600">
            Ontem: {p.agora.ontem} · últimos 7 dias: {p.agora.sete_dias} · a caminho: {p.agora.em_transito}
            {p.agora.ultima_venda ? ` · última venda em ${dataHoraBR(p.agora.ultima_venda)}` : ""}
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODOS.map(([d, t]) => (
          <button key={d} type="button" onClick={() => setDias(d)} aria-pressed={dias === d} className={chip(dias === d, "border-brand bg-brand-light text-brand")}>{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos" valor={p.periodo.pedidos} icon={ShoppingBag} tom="info"
          sub={comparar(p.periodo.pedidos, p.anterior?.pedidos, nomePeriodo) ?? `${p.periodo.cancelados} ${pl(p.periodo.cancelados, "cancelado", "cancelados")}`} />
        <Stat label="Faturamento" valor={brl(p.periodo.faturamento)} icon={DollarSign} tom="bom"
          sub={comparar(p.periodo.faturamento, p.anterior?.faturamento, nomePeriodo) ?? `${p.periodo.unidades} ${pl(p.periodo.unidades, "unidade", "unidades")}`} />
        <Stat label="Ticket médio" valor={brl(ticket)} icon={Package} sub={`${p.periodo.unidades} ${pl(p.periodo.unidades, "unidade vendida", "unidades vendidas")}`} />
        <Stat label="Tarifas do Mercado Livre" valor={brl(p.periodo.tarifas)} icon={Percent} tom={pctTarifa > 18 ? "atencao" : "neutro"}
          sub={p.periodo.faturamento ? `${pctTarifa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do faturamento` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Da venda ao despacho" valor={duracao(p.tempos.despacho_horas)} icon={Clock} tom={(p.tempos.despacho_horas ?? 0) > 48 ? "atencao" : "neutro"}
          sub={p.tempos.despacho_n ? `média de ${p.tempos.despacho_n} ${pl(p.tempos.despacho_n, "envio", "envios")}` : "ainda sem datas de envio"} />
        <Stat label="Do despacho à entrega" valor={duracao(p.tempos.entrega_horas)} icon={Truck}
          sub={p.tempos.entrega_n ? `média de ${p.tempos.entrega_n} ${pl(p.tempos.entrega_n, "entrega", "entregas")}` : "ainda sem entregas"} />
        <Stat label="Da venda à entrega" valor={duracao(p.tempos.total_horas)} icon={CalendarDays} sub="tempo total que o cliente espera" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={dias === 0 || dias > 92 ? "Pedidos por mês" : "Pedidos por dia"}>
          <Colunas altura={220} inteiro formatar={(v) => String(v)} vazio="Sem pedidos no período."
            dados={p.serie.map((s) => ({ rotulo: rotuloSerie(s.chave), valores: [s.pedidos] }))}
            series={[{ nome: "Pedidos", cor: "var(--kpi-verde)" }]} />
        </Section>
        <Section title="Mais vendidos">
          <Ranking cor="var(--kpi-laranja)" formatar={(v) => `${v} un.`} vazio="Sem vendas no período."
            itens={p.mais_vendidos.map((m) => ({ rotulo: m.titulo, valor: Number(m.unidades), detalhe: brl(m.valor) }))} />
        </Section>
      </div>

      <Section title="Últimas vendas">
        <Table empty={!p.ultimas.length} head={<>
          <th className="th">Venda</th><th className="th">Produto</th><th className="th text-right">Valor</th><th className="th">Envio</th>
        </>}>
          {p.ultimas.map((u) => {
            const envio = u.status === "cancelled" ? { texto: "Cancelada", tom: "neutro" as const } : textoEnvio(u.envio);
            return (
              <tr key={u.order_id}>
                <td className="td">
                  <span className="block text-sm text-fg">{dataHoraBR(u.data)}</span>
                  <span className="num block text-xs text-slate-500">ML {u.order_id}{u.comprador ? ` · ${u.comprador}` : ""}</span>
                </td>
                <td className="td"><span className="block max-w-[22rem] truncate">{u.titulo ?? "—"}</span>{u.itens > 1 && <span className="text-xs text-slate-500">+ {u.itens - 1} {pl(u.itens - 1, "item", "itens")}</span>}</td>
                <td className="td num text-right">{brl(u.total)}</td>
                <td className="td"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${COR_TOM[envio.tom]}`}>{envio.texto}</span></td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <History size={18} className="shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1 text-slate-600">
          <span className="font-semibold text-fg">{h.vendas} {pl(h.vendas, "venda", "vendas")} no histórico</span>
          {h.primeira ? ` desde ${dataBR(h.primeira)}` : ""}.{" "}
          {h.completo ? "Já chegou à primeira venda da conta." : "Ainda falta buscar as vendas mais antigas (o ERP também avança sozinho a cada 30 minutos)."}
          {" "}Só para ver e medir: as vendas antigas não viram pedido no ERP nem mexem no estoque.
        </div>
        <Button type="button" variant="secondary" disabled={!!puxando || conta.status !== "ativa"} onClick={puxarHistorico}
          title={conta.status === "ativa" ? "Busca no Mercado Livre tudo o que já foi vendido e as datas de envio" : "A conta precisa estar ativa"}>
          {puxando ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />} {puxando ?? (h.completo ? "Atualizar envios" : "Puxar todo o histórico")}
        </Button>
      </Card>
    </div>
  );
}
