// Produção e compras → Reposição: o que está acabando, quanto comprar e de quem, agrupado por fornecedor.
// "Gerar pedido de compra" cria a cotação com os itens marcados (e as quantidades ajustadas).
import { useMemo, useState } from "react";
import { AlertTriangle, PackageX, ShoppingCart, Truck } from "lucide-react";
import { Button, Card, Stat } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { porFornecedor, sugerirReposicao, type AbertoCompra, type MovimentoRep, type VinculoFornecedor } from "@/lib/reposicao";
import type { Fornecedor, Produto } from "@/lib/types";

const MOTIVO = { zerado: "sem estoque", abaixo_minimo: "abaixo do mínimo", ponto_reposicao: "no ponto de reposição" };
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function Reposicao({ podeComprar, aoGerar }: { podeComprar: boolean; aoGerar: () => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: movimentos = [] } = useRows<MovimentoRep>("estoque_movimentos", { select: "produto_id, tipo, quantidade, created_at, referencia_tipo" });
  const { data: abertos = [] } = useRows<AbertoCompra & { pedido: { status: string } | null }>("pedido_compra_itens", { select: "produto_id, quantidade, quantidade_recebida, pedido:pedidos_compra(status)", order: "produto_id" });
  const { data: vinculos = [] } = useRows<VinculoFornecedor>("produto_fornecedor", { select: "produto_id, fornecedor_id", order: "produto_id" });
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const invalidate = useInvalidate();
  const sugestoes = useMemo(() => sugerirReposicao(produtos, {
    movimentos, vinculos, hoje: hoje(),
    abertos: abertos.filter((a) => ["cotacao", "enviado", "parcial"].includes(a.pedido?.status ?? "")),
  }), [produtos, movimentos, abertos, vinculos]);
  const grupos = useMemo(() => porFornecedor(sugestoes), [sugestoes]);
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const nomeForn = (id: string | null) => (id ? fornecedores.find((f) => f.id === id)?.nome ?? "Fornecedor" : "Sem fornecedor definido");
  const quant = (id: string, padrao: number) => Number(String(qtd[id] ?? padrao).replace(",", ".")) || 0;

  async function gerar(fornecedorId: string | null, itens: typeof sugestoes) {
    const escolhidos = itens.filter((s) => !fora.has(s.produto.id) && quant(s.produto.id, s.sugerido) > 0);
    if (!escolhidos.length) return notify("Marque ao menos um item", "erro");
    setOcupado(fornecedorId ?? "");
    try {
      const prazo = Math.max(...escolhidos.map((s) => s.prazo));
      const { data: pc, error } = await supabase.from("pedidos_compra").insert({
        fornecedor_id: fornecedorId, status: "cotacao", previsao_entrega: new Date(Date.now() + prazo * 864e5).toISOString().slice(0, 10),
        observacoes: `Reposição de estoque sugerida pelo ERP (${escolhidos.length} item(ns), consumo dos últimos 90 dias)`,
      }).select("id, numero").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("pedido_compra_itens").insert(escolhidos.map((s) => ({
        pedido_compra_id: pc.id, produto_id: s.produto.id, descricao: s.produto.descricao, quantidade: quant(s.produto.id, s.sugerido), custo_unitario: s.custo,
      })));
      if (e2) throw e2;
      notify(`Pedido de compra #${pc.numero} criado em cotação`);
      invalidate("pedidos_compra", "pedido_compra_itens");
      aoGerar();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(null);
    }
  }

  const zerados = sugestoes.filter((s) => s.motivo === "zerado").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ShoppingCart} tom={sugestoes.length ? "atencao" : "neutro"} label="Itens para repor" valor={sugestoes.length} />
        <Stat icon={PackageX} tom={zerados ? "critico" : "neutro"} label="Sem estoque" valor={zerados} />
        <Stat icon={AlertTriangle} tom="atencao" label="Acabam antes de chegar" valor={sugestoes.filter((s) => s.critico).length} sub="cobertura menor que o prazo" />
        <Stat icon={Truck} label="Compra sugerida" valor={brl(sugestoes.reduce((t, s) => t + s.valor, 0))} />
      </div>
      <p className="text-sm text-slate-600">
        Pelo consumo dos últimos 90 dias, o prazo do fornecedor (padrão 15 dias) e o estoque mínimo/máximo do cadastro, descontando o que já está a caminho.
        Ajuste as quantidades e gere uma cotação por fornecedor. Máquinas entram pelas ordens de produção.
      </p>
      {!grupos.length && <Card className="p-5 text-sm text-slate-600">Nada para repor agora pelas regras atuais.</Card>}
      {grupos.map((g) => (
        <Card key={g.fornecedor_id ?? "sem"} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-fg">{nomeForn(g.fornecedor_id)}</div>
              <div className="text-xs text-slate-500">{g.itens.length} item(ns) · {brl(g.valor)}{!g.fornecedor_id && " · defina o fornecedor no pedido ou no cadastro do produto"}</div>
            </div>
            {podeComprar && <Button disabled={ocupado !== null} onClick={() => gerar(g.fornecedor_id, g.itens)}><ShoppingCart size={16} /> Gerar pedido de compra</Button>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="w-8 px-3 py-2" /><th className="px-3 py-2">Produto</th><th className="px-3 py-2 text-right">Estoque</th><th className="px-3 py-2 text-right">A caminho</th><th className="px-3 py-2 text-right">Consumo/mês</th><th className="px-3 py-2 text-right">Cobertura</th><th className="px-3 py-2 text-right">Comprar</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {g.itens.map((s) => (
                  <tr key={s.produto.id} className={fora.has(s.produto.id) ? "opacity-50" : ""}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label={`Incluir ${s.produto.descricao}`} checked={!fora.has(s.produto.id)}
                      onChange={() => setFora((f) => { const n = new Set(f); n.has(s.produto.id) ? n.delete(s.produto.id) : n.add(s.produto.id); return n; })} /></td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-fg">{s.produto.descricao}</div>
                      <div className="text-xs text-slate-500">{[s.produto.sku, `mínimo ${fmt(s.ponto)}`, `prazo ${s.prazo} dias`].filter(Boolean).join(" · ")}</div>
                      <span className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold ${s.motivo === "zerado" ? "text-red-600" : s.critico ? "text-amber-700" : "text-slate-500"}`}>
                        {s.critico && <AlertTriangle size={12} aria-hidden />}{MOTIVO[s.motivo]}{s.critico && s.motivo !== "zerado" ? " · acaba antes de chegar" : ""}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right ${Number(s.produto.estoque_atual) <= 0 ? "font-semibold text-red-600" : ""}`}>{fmt(Number(s.produto.estoque_atual))} {s.produto.unidade}</td>
                    <td className="px-3 py-2 text-right">{s.aCaminho ? fmt(s.aCaminho) : "—"}</td>
                    <td className="px-3 py-2 text-right">{fmt(s.consumoDia * 30)}</td>
                    <td className="px-3 py-2 text-right">{s.coberturaDias === null ? "—" : `${s.coberturaDias} dias`}</td>
                    <td className="px-3 py-2 text-right">
                      <input className="input w-20 py-1 text-right" inputMode="decimal" aria-label={`Quantidade de ${s.produto.descricao}`} value={qtd[s.produto.id] ?? String(s.sugerido)}
                        onChange={(e) => setQtd({ ...qtd, [s.produto.id]: e.target.value })} disabled={!podeComprar} />
                      <div className="text-xs text-slate-500">{brl(quant(s.produto.id, s.sugerido) * s.custo)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
