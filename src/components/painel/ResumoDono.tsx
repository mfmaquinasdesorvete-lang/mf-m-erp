// Resumo do dono (24/10, pedido da usuária para a entrada do Fabiano): um cartão azul no alto do Início, diferente do
// painel financeiro, com o que importa de relance — vendi e recebi na semana, o que tem no caixa e o que vai entrar e
// sair nos próximos 30 dias. Tocar num número abre a tela dele. As contas são as mesmas do Início e do Financeiro:
// venda = pedido (sem orçamento e cancelado) + nota de venda sem pedido; caixa = saldo dos bancos; saída sem as
// marcadas "não pagar".
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Landmark, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { hoje, somarDias } from "@/lib/format";
import { diaDaVenda } from "@/lib/filtroLista";
import { vendasDasNotas, type NotaVenda } from "@/lib/vendasNotas";
import type { Pedido } from "@/lib/types";

/** Quem vê o resumo no Início (por enquanto só o Fabiano). */
export const veResumoDono = (nome: string) => /^fabiano\b/i.test(nome.trim());

const SELECT_NOTAS = "id, created_at, status, ambiente, pedido_id, unidade_id, tipo_operacao, finalidade, excluida_em, payload, valor_total, chave, chave_referenciada, nota_referenciada_id";
type Conta = { valor: number; valor_pago: number | null; status: string; vencimento: string; data_pagamento: string | null; decisao?: string | null; unidade_id?: string | null };
const curto = (v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** segunda-feira desta semana (AAAA-MM-DD) */
function inicioSemana() {
  const h = hoje();
  const dow = new Date(h + "T12:00:00Z").getUTCDay();
  return somarDias(-((dow + 6) % 7));
}

export function ResumoDono() {
  const navigate = useNavigate();
  const { filtrar } = useUnidade();
  const seg = inicioSemana(), h = hoje(), ate30 = somarDias(30);
  const { data: pedidos = [] } = useRows<Pedido>("pedidos", {
    select: "id, status, created_at, aprovado_em, valor_total, unidade_id", key: ["resumo-dono", seg],
    filtro: (q) => q.or(`created_at.gte.${seg},aprovado_em.gte.${seg}`) });
  const { data: notas = [] } = useRows<NotaVenda>("notas_fiscais", {
    select: SELECT_NOTAS, key: ["resumo-dono", seg], filtro: (q) => q.gte("created_at", seg) });
  const { data: recebidas = [] } = useRows<Conta>("contas_receber", {
    select: "valor, valor_pago, status, vencimento, data_pagamento, unidade_id", key: ["resumo-dono", "pagas", seg],
    filtro: (q) => q.eq("status", "pago").gte("data_pagamento", seg) });
  const { data: aReceber = [] } = useRows<Conta>("contas_receber", {
    select: "valor, valor_pago, status, vencimento, data_pagamento, unidade_id", key: ["resumo-dono", "abertas", ate30],
    filtro: (q) => q.eq("status", "aberto").gte("vencimento", h).lte("vencimento", ate30) });
  const { data: pagar = [] } = useRows<Conta>("contas_pagar", {
    select: "valor, valor_pago, status, vencimento, data_pagamento, decisao, unidade_id", key: ["resumo-dono", ate30],
    filtro: (q) => q.eq("status", "aberto").lte("vencimento", ate30) });
  const { data: saldos = [] } = useQuery({
    queryKey: ["saldos_bancarios"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saldos_bancarios"); if (error) throw error; return (data ?? []) as { unidade_id: string; saldo: number }[]; },
  });

  const n = useMemo(() => {
    const vendas = [...filtrar(pedidos).filter((p) => !["orcamento", "cancelado"].includes(p.status) && diaDaVenda(p) >= seg),
      ...(filtrar(vendasDasNotas(notas, []).pedidos) as unknown as Pedido[])];
    const pag = filtrar(pagar);
    return {
      vendi: vendas.reduce((s, p) => s + Number(p.valor_total), 0),
      recebi: filtrar(recebidas).filter((c) => c.status === "pago" && (c.data_pagamento ?? "") >= seg).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0),
      caixa: filtrar(saldos).reduce((s, x) => s + Number(x.saldo), 0),
      entra: filtrar(aReceber).filter((c) => c.status === "aberto" && c.vencimento >= h && c.vencimento <= ate30).reduce((s, c) => s + Number(c.valor), 0),
      sai: pag.filter((c) => c.decisao !== "nao_pagar").reduce((s, c) => s + Number(c.valor), 0),
      atrasado: pag.filter((c) => c.decisao !== "nao_pagar" && c.vencimento < h).reduce((s, c) => s + Number(c.valor), 0),
    };
  }, [pedidos, notas, recebidas, aReceber, pagar, saldos, filtrar, seg, h, ate30]);

  const itens: { rotulo: string; valor: number; icone: LucideIcon; to: string; state?: unknown; dica: string; tom?: string }[] = [
    { rotulo: "Vendi na semana", valor: n.vendi, icone: TrendingUp, to: "/pedidos", dica: "pedidos e notas de venda desde segunda" },
    { rotulo: "Recebi na semana", valor: n.recebi, icone: Wallet, to: "/financeiro", dica: "contas recebidas desde segunda" },
    { rotulo: "No caixa", valor: n.caixa, icone: Landmark, to: "/financeiro", dica: "saldo de todos os bancos" },
    { rotulo: "Vai entrar · 30 dias", valor: n.entra, icone: ArrowDownCircle, to: "/financeiro", dica: "contas a receber que vencem nos próximos 30 dias", tom: "text-fixo-emerald-200" },
    { rotulo: "Vai sair · 30 dias", valor: n.sai, icone: ArrowUpCircle, to: "/financeiro", dica: n.atrasado ? `contas a pagar dos próximos 30 dias, com ${brl(n.atrasado)} já vencidos` : "contas a pagar dos próximos 30 dias", tom: "text-fixo-rose-200" },
  ];
  return (
    <section aria-label="Resumo" className="mb-4 rounded-painel bg-fixo-blue-700 p-3 text-white shadow-card sm:p-4">
      <h2 className="mb-2 px-1 text-sm font-semibold">Resumo</h2>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-5 sm:gap-2">
        {itens.map((x, i) => (
          <button key={x.rotulo} type="button" onClick={() => navigate(x.to, { state: x.state })} title={`${x.rotulo}: ${brl(x.valor)} (${x.dica})`}
            className={`botao-toque flex min-w-0 flex-col items-center gap-1 rounded-cartao bg-white/10 px-1 py-2 text-center hover:bg-white/15 sm:col-span-1 ${i < 3 ? "col-span-2" : "col-span-3"}`}>
            <x.icone size={18} className={x.tom ?? "text-white/85"} aria-hidden />
            <span className="num max-w-full truncate text-base font-bold leading-tight sm:text-lg"><span className="mr-0.5 text-2xs font-semibold text-white/80">R$</span>{curto(x.valor)}</span>
            <span className="line-clamp-2 text-2xs leading-tight text-white/85 sm:text-xs">{x.rotulo}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
