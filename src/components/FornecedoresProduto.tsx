// Cadastro do produto → todos os fornecedores que vendem o item: último preço (de nota, pedido, cotação ou
// informado à mão), prazo e código no fornecedor; marca o preferido (vira o fornecedor padrão do produto).
import { useState } from "react";
import { Plus, Star } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import type { Fornecedor } from "@/lib/types";

type Fornecimento = { id: string; produto_id: string; fornecedor_id: string; codigo_fornecedor: string | null; preco: number | null; preco_em: string | null;
  preco_origem: string | null; prazo_dias: number | null; preferido: boolean; ativo: boolean; ultima_compra_em: string | null };
const ORIGEM: Record<string, string> = { nota: "NF-e", pedido: "pedido de compra", cotacao: "cotação", manual: "informado" };

export function FornecedoresProduto({ produtoId, podeEditar, aoMudarPreferido }: { produtoId?: string | null; podeEditar: boolean; aoMudarPreferido?: (fornecedorId: string) => void }) {
  const { data: todos = [] } = useRows<Fornecimento>("fornecimentos");
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const invalidate = useInvalidate();
  const [novo, setNovo] = useState({ fornecedor_id: "", preco: "", prazo: "" });
  if (!produtoId) return <span className="text-xs text-slate-500">Salve o produto para incluir os fornecedores.</span>;
  const lista = todos.filter((f) => f.produto_id === produtoId && f.ativo).sort((a, b) => Number(b.preferido) - Number(a.preferido) || Number(a.preco ?? 9e9) - Number(b.preco ?? 9e9));
  const menor = Math.min(...lista.filter((f) => f.preco != null).map((f) => Number(f.preco)));
  const nome = (id: string) => { const f = fornecedores.find((x) => x.id === id); return f ? (f.nome_fantasia?.trim() || f.nome) : "fornecedor"; };

  async function preferido(f: Fornecimento) {
    const { error } = await supabase.from("fornecimentos").update({ preferido: true, updated_at: new Date().toISOString() }).eq("id", f.id);
    if (error) return notifyError(error);
    aoMudarPreferido?.(f.fornecedor_id); // o formulário aberto acompanha (senão, ao salvar, voltaria o antigo)
    notify("Fornecedor preferido alterado"); invalidate("fornecimentos", "produtos");
  }
  async function incluir() {
    if (!novo.fornecedor_id) return;
    const preco = Number(novo.preco.replace(/\./g, "").replace(",", "."));
    const { error } = await supabase.from("fornecimentos").insert({
      produto_id: produtoId, fornecedor_id: novo.fornecedor_id, preco: novo.preco && preco >= 0 ? preco : null, preco_em: novo.preco ? new Date().toISOString().slice(0, 10) : null,
      preco_origem: novo.preco ? "manual" : null, prazo_dias: novo.prazo ? Number(novo.prazo) : null,
    });
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("este fornecedor já está na lista") : error);
    setNovo({ fornecedor_id: "", preco: "", prazo: "" }); invalidate("fornecimentos");
  }

  return (
    <div className="space-y-2">
      {!lista.length ? <p className="text-xs text-slate-500">Nenhum fornecedor ainda: entram sozinhos com as NF-e de compra, os pedidos de compra e as cotações, ou inclua abaixo.</p> : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {lista.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <b>{nome(f.fornecedor_id)}</b>{f.preferido && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">preferido</span>}
                <span className="block text-xs text-slate-500">
                  {[f.codigo_fornecedor && `código ${f.codigo_fornecedor}`, f.prazo_dias != null && `${f.prazo_dias} dias`, f.ultima_compra_em && `última compra ${dataBR(f.ultima_compra_em)}`].filter(Boolean).join(" · ") || "sem detalhes"}
                </span>
              </span>
              <span className="text-right">
                {f.preco != null ? <span className={`num block font-semibold ${Number(f.preco) === menor && lista.length > 1 ? "text-emerald-700" : ""}`}>{brl(f.preco)}</span> : <span className="text-xs text-slate-500">sem preço</span>}
                {f.preco_em && <span className="block text-[11px] text-slate-500">{ORIGEM[f.preco_origem ?? ""] ?? ""} {dataBR(f.preco_em)}</span>}
              </span>
              {podeEditar && !f.preferido && (
                <Button type="button" variant="ghost" className="!min-h-0 !px-2" title="Tornar o fornecedor preferido" aria-label={`Tornar ${nome(f.fornecedor_id)} o preferido`} onClick={() => preferido(f)}><Star size={15} aria-hidden /></Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <select className="input w-full sm:w-auto sm:min-w-0 sm:flex-1" value={novo.fornecedor_id} onChange={(e) => setNovo({ ...novo, fornecedor_id: e.target.value })} aria-label="Fornecedor a incluir">
            <option value="">Incluir fornecedor…</option>
            {fornecedores.filter((f) => !lista.some((x) => x.fornecedor_id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.nome_fantasia?.trim() || f.nome}</option>)}
          </select>
          <input className="input w-28 text-right" inputMode="decimal" placeholder="preço" aria-label="Preço do fornecedor" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} />
          <input className="input w-28" inputMode="numeric" placeholder="prazo (dias)" aria-label="Prazo do fornecedor em dias" value={novo.prazo} onChange={(e) => setNovo({ ...novo, prazo: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
          <Button type="button" variant="secondary" disabled={!novo.fornecedor_id} onClick={incluir}><Plus size={15} aria-hidden /> Incluir</Button>
        </div>
      )}
    </div>
  );
}
