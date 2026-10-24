// Meus pedidos: lista com situação, NF-e e rastreio; detalhe com os itens (sem custo).
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Copy, FileText, Truck } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { brl, dataBR, pl } from "@/lib/format";
import {
  etapaPedido, filtrarPedidos, ROTULO_SITUACAO, situacaoEntrega,
  type DetalhePedidoPortal, type FiltroPedidos, type PedidoPortal,
} from "@/lib/portal";
import { notifyError } from "@/lib/notify";
import { usePortal } from "./dados";

const FILTROS: { value: FiltroPedidos; label: string }[] = [
  { value: "abertos", label: "Em aberto" }, { value: "todos", label: "Todos" }, { value: "orcamento", label: "Orçamentos" },
  { value: "aprovado", label: "Aprovados" }, { value: "faturado", label: "Faturados" }, { value: "entregue", label: "Entregues" },
  { value: "cancelado", label: "Cancelados" },
];

export const SeloPortal = () => <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700" title="Enviado por você no portal">PORTAL</span>;

export function PortalPedidos() {
  const { data: lista = [], isLoading, error } = usePortal<PedidoPortal[]>("portal_pedidos");
  const [filtro, setFiltro] = useState<FiltroPedidos>("abertos");
  const [busca, setBusca] = useState("");
  const vistos = filtrarPedidos(lista, filtro, busca);
  const conta = (f: FiltroPedidos) => filtrarPedidos(lista, f).length;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-fg">Meus pedidos</h1>
      {/* barra padrão; as situações continuam nos botões logo abaixo */}
      <div>
        <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Nº, cliente, cidade ou nota" onLimpar={() => setBusca("")} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Situação">
          {FILTROS.map((f) => {
            const n = conta(f.value);
            if (!n && f.value !== filtro && !["abertos", "todos"].includes(f.value)) return null;
            return (
              <button key={f.value} type="button" aria-pressed={filtro === f.value} onClick={() => setFiltro(f.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${filtro === f.value ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600"}`}>
                {f.label} <span className="num opacity-90">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      {isLoading && <p className="py-8 text-center text-slate-500">Carregando…</p>}
      {error && <p className="py-8 text-center text-red-700" role="alert">{(error as Error).message}</p>}
      {!isLoading && !error && !vistos.length && <p className="py-8 text-center text-sm text-slate-500">Nenhum pedido aqui.</p>}
      <ul className="space-y-2">
        {vistos.map((p) => {
          const entrega = situacaoEntrega(p);
          return (
            <li key={p.id}>
              <Link to={`/portal/pedidos/${p.id}`} className="cartao block p-4 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 font-bold text-fg">#{p.numero} {p.via_portal && <SeloPortal />}</span>
                    <span className="block truncate text-sm text-slate-700">{p.cliente}</span>
                    <span className="block text-xs text-slate-500">{[p.municipio, p.uf].filter(Boolean).join("/")} · {dataBR(p.criado_em)} · {p.itens} {pl(p.itens, "item", "itens")}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-base font-bold text-fg">{brl(p.total)}</span>
                    <Badge value={p.status} />
                  </span>
                </div>
                {(p.nf_numero || entrega || p.rastreio) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    {p.nf_numero && <span className="inline-flex items-center gap-1"><FileText size={13} aria-hidden /> NF {p.nf_numero}</span>}
                    {entrega && <span className="inline-flex items-center gap-1"><Truck size={13} aria-hidden /> {entrega}</span>}
                    {p.rastreio && <span className="font-mono">{p.rastreio}</span>}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-slate-100"
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500); } catch (e) { notifyError(e); } }}>
      {ok ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

const ETAPAS: DetalhePedidoPortal["status"][] = ["orcamento", "aprovado", "faturado", "entregue"];

export function PortalPedido() {
  const { id = "" } = useParams();
  const { data: p, isLoading, error } = usePortal<DetalhePedidoPortal>("portal_pedido", { p_id: id }, !!id);
  if (isLoading) return <p className="py-10 text-center text-slate-500">Carregando…</p>;
  if (error || !p) return (
    <div className="space-y-3 py-6 text-center">
      <p className="text-red-700" role="alert">{(error as Error)?.message ?? "Pedido não encontrado."}</p>
      <Link to="/portal/pedidos" className="font-semibold text-brand">Voltar aos pedidos</Link>
    </div>
  );
  const etapa = etapaPedido(p.status);
  const rastreio = p.envio?.rastreio ?? p.rastreio;
  const transportadora = p.envio?.transportadora ?? p.transportadora;
  const entrega = situacaoEntrega({ status: p.status, envio_status: p.envio?.status ?? null, rastreio, nf_numero: p.nf?.numero ?? null, entregue_em: p.envio?.entregue_em ?? null });

  return (
    <div className="space-y-4">
      <Link to="/portal/pedidos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft size={16} aria-hidden /> Meus pedidos</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-fg">Pedido #{p.numero} {p.via_portal && <SeloPortal />}</h1>
          <p className="text-sm text-slate-600">{p.cliente} · {[p.municipio, p.uf].filter(Boolean).join("/")}</p>
          <p className="text-xs text-slate-500">Criado em {dataBR(p.criado_em)}{p.aprovado_em ? ` · aprovado em ${dataBR(p.aprovado_em)}` : ""}</p>
        </div>
        <Badge value={p.status} />
      </div>

      {p.status === "cancelado" ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Pedido cancelado.</p>
      ) : (
        <ol className="grid grid-cols-4 gap-1" aria-label="Andamento do pedido">
          {ETAPAS.map((s, i) => (
            <li key={s} className="text-center">
              <span className={`mx-auto block h-1.5 rounded-full ${i < etapa ? "bg-brand" : "bg-slate-200"}`} aria-hidden />
              <span className={`mt-1 block text-2xs font-semibold ${i < etapa ? "text-fg" : "text-slate-400"}`}>{ROTULO_SITUACAO[s]}{i === etapa - 1 ? " ✓" : ""}</span>
            </li>
          ))}
        </ol>
      )}
      {p.status === "orcamento" && <p className="text-sm text-slate-600">A empresa confere e aprova o orçamento. Você acompanha por aqui.</p>}

      <Card>
        <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-fg">Itens</h2>
        <ul className="divide-y divide-slate-100">
          {p.itens.map((i, k) => (
            <li key={k} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0"><span className="block text-fg">{i.descricao}</span>
                <span className="num block text-xs text-slate-500">{Number(i.quantidade).toLocaleString("pt-BR")} × {brl(i.valor_unitario)}</span></span>
              <span className="num shrink-0 font-semibold">{brl(i.valor_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-600">Produtos</dt><dd className="num">{brl(p.valor_produtos)}</dd></div>
          {Number(p.desconto) > 0 && <div className="flex justify-between"><dt className="text-slate-600">Desconto</dt><dd className="num">− {brl(p.desconto)}</dd></div>}
          {Number(p.frete) > 0 && <div className="flex justify-between"><dt className="text-slate-600">Frete</dt><dd className="num">{brl(p.frete)}</dd></div>}
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd className="num">{brl(p.total)}</dd></div>
          <div className="pt-1 text-xs text-slate-500">Pagamento: {p.forma_pagamento}{p.parcelas > 1 ? ` em ${p.parcelas}x` : ""}</div>
        </dl>
      </Card>

      {(p.nf || entrega || rastreio) && (
        <Card className="space-y-2 p-4 text-sm">
          <h2 className="text-sm font-bold text-fg">Nota e entrega</h2>
          {p.nf && <p className="flex items-center gap-1.5"><FileText size={15} aria-hidden /> NF-e {p.nf.numero}{p.nf.serie ? ` série ${p.nf.serie}` : ""} · {dataBR(p.nf.em)}</p>}
          {entrega && <p className="flex items-center gap-1.5"><Truck size={15} aria-hidden /> {entrega}{transportadora ? ` · ${transportadora}` : ""}</p>}
          {rastreio && <p className="flex flex-wrap items-center gap-2">Rastreio: <span className="font-mono">{rastreio}</span><Copiar texto={rastreio} /></p>}
          {p.envio?.entrega_prevista && !p.envio.entregue_em && <p className="text-slate-600">Previsão de entrega: {dataBR(p.envio.entrega_prevista)}</p>}
          {p.envio?.entregue_em && <p className="text-slate-600">Entregue em {dataBR(p.envio.entregue_em)}</p>}
        </Card>
      )}

      {p.observacoes && (
        <Card className="p-4 text-sm"><h2 className="mb-1 text-sm font-bold text-fg">Observações</h2><p className="whitespace-pre-wrap text-slate-700">{p.observacoes}</p></Card>
      )}
      <Link to="/portal/pedidos" className="flex items-center justify-center gap-1 py-2 text-sm font-semibold text-brand">Ver todos os pedidos <ChevronRight size={16} aria-hidden /></Link>
    </div>
  );
}
