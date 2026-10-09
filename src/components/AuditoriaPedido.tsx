// Pedido → Auditoria: as conferências (total, desconto, preço, vendedor, parcelas, estoque, NF-e, comissão)
// e a linha do tempo de tudo o que aconteceu com o pedido (alterações com usuário e motivo, itens, parcelas,
// estoque, notas e comissões).
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { brl } from "@/lib/format";
import { conferirVenda, type NivelConferencia, type PedidoAuditado } from "@/lib/auditoriaPedido";
import { DescricaoMudanca, type LinhaAuditoria } from "./Historico";

const ICONE: Record<NivelConferencia, { Icon: typeof Info; cor: string }> = {
  ok: { Icon: CheckCircle2, cor: "text-emerald-600" }, info: { Icon: Info, cor: "text-sky-600" },
  alerta: { Icon: AlertTriangle, cor: "text-amber-600" }, erro: { Icon: XCircle, cor: "text-red-600" },
};
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

type Evento = { data: string; quem?: string | null; texto: ReactNode; motivo?: string | null; tipo: string };

function useDadosPedido(id: string) {
  return useQuery({
    queryKey: ["auditoria", "pedido", id],
    queryFn: async () => {
      const [parcelas, notas, movimentos, comissoes, hist] = await Promise.all([
        supabase.from("contas_receber").select("id, descricao, parcela, total_parcelas, valor, valor_pago, status, vencimento, data_pagamento, created_at").eq("pedido_id", id).order("created_at"),
        supabase.from("notas_fiscais").select("id, numero, serie, status, ambiente, valor_total, mensagem, created_at").eq("pedido_id", id).order("created_at"),
        supabase.from("estoque_movimentos").select("produto_id, tipo, quantidade, motivo, numero_serie, created_at, produto:produtos(descricao)").eq("referencia_tipo", "pedido").eq("referencia_id", id).order("created_at"),
        supabase.from("comissoes").select("id, status, valor, percentual, base, descricao, created_at, vendedor:vendedores(nome)").eq("pedido_id", id).order("created_at"),
        supabase.from("auditoria").select("*").eq("tabela", "pedidos").eq("registro_id", id).order("created_at"),
      ]);
      const contas = (parcelas.data ?? []).map((c) => c.id);
      const histContas = contas.length
        ? (await supabase.from("auditoria").select("*").eq("tabela", "contas_receber").in("registro_id", contas).order("created_at")).data ?? []
        : [];
      return {
        parcelas: parcelas.data ?? [], notas: notas.data ?? [], movimentos: movimentos.data ?? [], comissoes: comissoes.data ?? [],
        historico: (hist.data ?? []) as LinhaAuditoria[], historicoContas: histContas as LinhaAuditoria[],
        // a auditoria (histórico) só aparece para financeiro, administrador e contador
        semHistorico: !!hist.error,
      };
    },
  });
}

export function AuditoriaPedido({ pedido, produtos, baseComissao }: {
  pedido: PedidoAuditado & { id: string; numero?: number };
  produtos: { id: string; descricao: string; preco_venda?: number | null; preco_custo?: number | null; kit?: boolean | null }[];
  baseComissao?: "recebimento" | "faturamento" | null;
}) {
  const { data, isLoading } = useDadosPedido(pedido.id);
  const conferencias = useMemo(() => data ? conferirVenda(pedido, { produtos, baseComissao, ...data }) : [], [data, pedido, produtos, baseComissao]);

  const eventos = useMemo<Evento[]>(() => {
    if (!data) return [];
    const ev: Evento[] = [];
    for (const l of data.historico) ev.push({ data: l.created_at, quem: l.usuario_nome, motivo: l.motivo, tipo: "Pedido", texto: <DescricaoMudanca l={l} /> });
    const parcela = (id: string | null) => data.parcelas.find((c: any) => c.id === id);
    for (const l of data.historicoContas) {
      const c: any = parcela(l.registro_id);
      ev.push({ data: l.created_at, quem: l.usuario_nome, motivo: l.motivo, tipo: `Parcela ${c?.parcela ?? ""}/${c?.total_parcelas ?? ""}`,
        texto: l.acao === "insert" ? <span>lançada: {brl(c?.valor)} com vencimento em {c?.vencimento?.split("-").reverse().join("/")}</span> : <DescricaoMudanca l={l} /> });
    }
    for (const n of data.notas as any[]) {
      ev.push({ data: n.created_at, tipo: "NF-e", texto: <span>{n.numero ? `NF ${n.numero}/${n.serie}` : "NF-e"} de {brl(n.valor_total)}: <b>{n.status}</b>{n.ambiente === "homologacao" && " (teste, sem valor fiscal)"}{n.mensagem && n.status === "erro" ? ` · ${n.mensagem}` : ""}</span> });
    }
    for (const m of data.movimentos as any[]) {
      ev.push({ data: m.created_at, tipo: "Estoque", texto: <span>{m.tipo === "saida" ? "saída" : "entrada"} de {Number(m.quantidade)} × {m.produto?.descricao ?? "produto"}{m.numero_serie ? ` (série ${m.numero_serie})` : ""} · {m.motivo}</span> });
    }
    for (const c of data.comissoes as any[]) {
      ev.push({ data: c.created_at, tipo: "Comissão", texto: <span>{c.vendedor?.nome ? `${c.vendedor.nome}: ` : ""}{brl(c.valor)} ({Number(c.percentual)}% de {brl(c.base)}) · <b>{c.status.replace("_", " ")}</b></span> });
    }
    return ev.sort((a, b) => b.data.localeCompare(a.data));
  }, [data]);

  if (isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  const problemas = conferencias.filter((c) => c.nivel === "erro" || c.nivel === "alerta").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 text-sm font-semibold text-fg">
          Conferência do pedido {problemas ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{problemas} ponto(s) de atenção</span> : <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">tudo confere</span>}
        </div>
        <ul className="space-y-2">
          {conferencias.map((c) => {
            const { Icon, cor } = ICONE[c.nivel];
            return (
              <li key={c.id} className="flex gap-2 text-sm">
                <Icon size={17} className={`mt-0.5 shrink-0 ${cor}`} aria-label={c.nivel} />
                <span><b className="text-fg">{c.titulo}:</b> <span className="text-slate-600">{c.detalhe}</span></span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-2 text-sm font-semibold text-fg">Linha do tempo</div>
        {data?.semHistorico && <p className="mb-2 text-xs text-slate-500">As alterações com usuário e motivo aparecem para financeiro, administrador e contador.</p>}
        {!eventos.length && <p className="text-sm text-slate-500">Nada registrado ainda.</p>}
        <ul className="space-y-2.5">
          {eventos.map((e, i) => (
            <li key={i} className="border-l-2 border-slate-200 pl-3 text-sm">
              <div className="text-xs text-slate-500">{quando(e.data)} · <span className="font-semibold">{e.tipo}</span>{e.quem ? ` · ${e.quem}` : ""}</div>
              <div className="text-slate-700">{e.texto}</div>
              {e.motivo && <div className="text-xs text-amber-700">Motivo: {e.motivo}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
