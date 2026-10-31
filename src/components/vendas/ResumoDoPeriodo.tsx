// Faixa no alto do quadro de Vendas (pedido de 31/10, para mostrar ao sócio): no período escolhido, pela data da venda,
// quantas vendas, quanto vendeu, quanto já entrou, quanto falta entrar e o que ficou em tarifas (Mercado Livre, cartão).
import { CircleDollarSign, Hourglass, Percent, ShoppingBag, Wallet } from "lucide-react";
import { Indicador } from "@/components/ui";
import { brl, pl } from "@/lib/format";
import type { ResumoVendas } from "@/lib/vendasLista";

export function ResumoDoPeriodo({ r, outra, area, periodo }: { r: ResumoVendas; outra: ResumoVendas; area: string; periodo: string }) {
  const nome = area === "maquinas" ? "máquinas" : "peças";
  return (
    <section aria-label="Resumo das vendas do período" className="space-y-2">
      <p className="text-sm text-slate-600">
        <b className="text-fg">Resumo: {periodo.toLowerCase()}</b> · vendas de {nome} pela data da venda, com os filtros da tela
        {outra.pedidos > 0 && <> · com as {area === "maquinas" ? "peças" : "máquinas"}: <b className="num text-fg">{outra.pedidos + r.pedidos}</b> {pl(outra.pedidos + r.pedidos, "venda", "vendas")}, <b className="num text-fg">{brl(outra.vendido + r.vendido)}</b></>}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Indicador rotulo="Vendas" valor={r.pedidos} icon={ShoppingBag} sub={pl(r.pedidos, "pedido fechado", "pedidos fechados")} />
        <Indicador rotulo="Vendido" valor={brl(r.vendido)} icon={CircleDollarSign} cor="indigo" sub={r.pedidos ? `ticket médio ${brl(r.vendido / r.pedidos)}` : undefined} />
        <Indicador rotulo="Recebido" valor={brl(r.recebido)} icon={Wallet} cor="verde" sub="já entrou" />
        <Indicador rotulo="A receber" valor={brl(r.aReceber)} icon={Hourglass} cor="azul" sub="parcelas em aberto" />
        <Indicador rotulo="Taxas e tarifas" valor={brl(r.diferenca)} icon={Percent} cor="ambar" sub="vendido − recebido − a receber" />
      </div>
      {(r.semConta.pedidos > 0 || r.foraDaSoma.length > 0) && (
        <p className="text-xs text-slate-500">
          {r.semConta.pedidos > 0 && <>{r.semConta.pedidos} {pl(r.semConta.pedidos, "venda", "vendas")} sem conta a receber ({brl(r.semConta.valor)}): entram no vendido, não no recebido. </>}
          {r.foraDaSoma.length > 0 && <>Fora da soma, com todas as parcelas canceladas: {r.foraDaSoma.map((n) => `#${n}`).join(", ")}.</>}
        </p>
      )}
    </section>
  );
}
