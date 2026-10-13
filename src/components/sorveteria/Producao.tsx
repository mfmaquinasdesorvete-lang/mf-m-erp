// Fila de produção (a tela da cozinha/balcão de preparo): novo → preparando → pronto → entregue.
// Pode ficar aberta em outra aba ou monitor: acompanha os pedidos do caixa ao vivo.
import { useEffect, useState } from "react";
import { Bike, Check, ChefHat, MessageCircle, Printer, Truck } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import { imprimirCozinha } from "@/lib/sorveteriaCupom";
import { brl, whatsappLink } from "@/lib/format";
import {
  qtdItens, rotuloCanal, totalPedido, type Estado, type Pedido, type Producao as Fase,
} from "@/lib/sorveteria";

const COLUNAS: { fase: Fase; titulo: string; tom: string }[] = [
  { fase: "novo", titulo: "Novos", tom: "border-t-amber-500" },
  { fase: "preparando", titulo: "Preparando", tom: "border-t-sky-500" },
  { fase: "pronto", titulo: "Prontos", tom: "border-t-emerald-500" },
];

function minutos(desde?: string) {
  if (!desde) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000));
}

export function Producao({ estado, mudar, onReceber }: {
  estado: Estado; mudar: (f: (e: Estado) => Estado) => void; onReceber: (p: Pedido) => void;
}) {
  const [, tic] = useState(0);
  const [escolhendo, setEscolhendo] = useState<Pedido | null>(null);
  useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 20_000); return () => clearInterval(t); }, []);

  const fila = estado.pedidos.filter((p) => p.situacao !== "cancelado" && p.producao && p.producao !== "entregue");
  const concluidos = estado.pedidos.filter((p) => p.producao === "entregue" && p.entregueEm && Date.now() - new Date(p.entregueEm).getTime() < 3 * 3600_000)
    .sort((a, b) => (b.entregueEm! > a.entregueEm! ? 1 : -1)).slice(0, 8);

  const avancar = (p: Pedido) => {
    const agora = new Date().toISOString();
    const prox: Fase = p.producao === "novo" ? "preparando" : p.producao === "preparando" ? "pronto" : "entregue";
    // delivery pronto: escolhe quem leva antes de sair
    if (p.producao === "pronto" && p.canal === "delivery" && !p.entregador && !p.semEntregador && estado.entregadores.some((x) => x.ativo)) return setEscolhendo(p);
    if (prox === "entregue" && p.situacao === "aberto" && p.pagarNaEntrega) return onReceber(p); // cobra na porta; a confirmação entrega
    mudar((e) => ({
      ...e, pedidos: e.pedidos.map((x) => x.id === p.id
        ? { ...x, producao: prox, prontoEm: prox === "pronto" ? agora : x.prontoEm, entregueEm: prox === "entregue" ? agora : x.entregueEm } : x),
    }));
  };
  const levar = (p: Pedido, entregador: string | null) => {
    setEscolhendo(null);
    mudar((e) => ({ ...e, pedidos: e.pedidos.map((x) => (x.id === p.id ? { ...x, entregador, semEntregador: !entregador } : x)) }));
    avancar({ ...p, entregador, semEntregador: !entregador });
  };
  const voltar = (p: Pedido) => mudar((e) => ({ ...e, pedidos: e.pedidos.map((x) => x.id === p.id ? { ...x, producao: "novo" as Fase, prontoEm: undefined, entregueEm: undefined } : x) }));

  const rotuloBotao = (p: Pedido) => p.producao === "novo" ? "Começar" : p.producao === "preparando" ? "Pronto" : p.canal === "delivery" ? "Saiu para entrega" : p.canal === "mesa" ? "Servido" : "Entregue";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((c) => {
          const lista = fila.filter((p) => p.producao === c.fase).sort((a, b) => ((a.enviadoEm ?? a.criadoEm) > (b.enviadoEm ?? b.criadoEm) ? 1 : -1));
          return (
            <section key={c.fase} aria-label={c.titulo} className="min-w-0">
              <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-slate-600">
                {c.titulo}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{lista.length}</span>
              </h2>
              <div className="space-y-3">
                {lista.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhum pedido</p>}
                {lista.map((p) => {
                  const min = minutos(c.fase === "pronto" ? p.prontoEm : p.enviadoEm ?? p.criadoEm);
                  return (
                    <Card key={p.id} className={`border-t-4 p-3 ${c.tom}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <b className="text-xl">#{p.numero}</b>
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{rotuloCanal(p.canal)}{p.mesa ? ` ${p.mesa}` : ""}</span>
                        </div>
                        <span className={`text-sm font-bold ${min >= 15 && c.fase !== "pronto" ? "text-red-600" : "text-slate-500"}`}>{min} min</span>
                      </div>
                      {p.cliente?.nome && <p className="mt-1 text-sm text-slate-600">{p.cliente.nome}{p.canal === "delivery" && p.cliente.bairro ? ` · ${p.cliente.bairro}` : ""}</p>}
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {p.itens.map((i) => (
                          <li key={i.id}>
                            <b>{i.pesoG != null ? `${i.nome} ${i.pesoG} g` : `${i.qtd}× ${i.nome}`}</b>
                            {i.sabores.length > 0 && <div className="text-slate-600">{i.sabores.join(", ")}</div>}
                            {i.complementos.length > 0 && <div className="text-slate-500">+ {i.complementos.map((x) => x.nome).join(", ")}</div>}
                            {i.obs && <div className="font-semibold text-amber-800">Obs: {i.obs}</div>}
                          </li>
                        ))}
                      </ul>
                      {p.obs && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900">{p.obs}</p>}
                      {p.situacao === "aberto" && p.pagarNaEntrega && <p className="mt-2 text-xs font-bold text-red-700">Receber {brl(totalPedido(p, estado.loja.gorjetaPct))} na entrega</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button type="button" className="flex-1" onClick={() => avancar(p)}>
                          {c.fase === "novo" ? <ChefHat size={16} aria-hidden /> : c.fase === "preparando" ? <Check size={16} aria-hidden /> : <Truck size={16} aria-hidden />} {rotuloBotao(p)}
                        </Button>
                        {c.fase === "pronto" && p.cliente?.telefone && (
                          <a className="inline-flex min-h-[42px] items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50" target="_blank" rel="noreferrer"
                            href={whatsappLink(p.cliente.telefone, p.canal === "delivery" ? `Olá, ${p.cliente.nome}! Seu pedido #${p.numero} saiu para entrega.` : `Olá, ${p.cliente.nome}! Seu pedido #${p.numero} está pronto para retirada.`)}>
                            <MessageCircle size={16} aria-hidden /> Avisar
                          </a>
                        )}
                        <Button type="button" variant="ghost" className="!px-2" aria-label={`Imprimir comanda da cozinha do pedido ${p.numero}`} title="Imprimir comanda da cozinha" onClick={() => imprimirCozinha(p)}><Printer size={15} aria-hidden /></Button>
                        {c.fase !== "novo" && <Button type="button" variant="ghost" className="!px-2 text-xs" onClick={() => voltar(p)}>Reabrir</Button>}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{qtdItens(p)} {qtdItens(p) === 1 ? "item" : "itens"}</p>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Modal open={!!escolhendo} onClose={() => setEscolhendo(null)} title="Quem leva a entrega?">
        <div className="space-y-2">
          {estado.entregadores.filter((x) => x.ativo).map((x) => <Button key={x.id} type="button" className="w-full !py-3 text-base" onClick={() => escolhendo && levar(escolhendo, x.id)}><Bike size={18} aria-hidden /> {x.nome}</Button>)}
          <Button type="button" variant="secondary" className="w-full" onClick={() => escolhendo && levar(escolhendo, null)}>Sem entregador</Button>
        </div>
      </Modal>

      {concluidos.length > 0 && (
        <section aria-label="Concluídos recentes">
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-500">Concluídos nas últimas 3 horas</h2>
          <div className="flex flex-wrap gap-2">
            {concluidos.map((p) => (
              <span key={p.id} className="rounded-full border border-slate-200 px-3 py-1 text-sm">#{p.numero} · {rotuloCanal(p.canal)} · {brl(totalPedido(p, estado.loja.gorjetaPct))}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
