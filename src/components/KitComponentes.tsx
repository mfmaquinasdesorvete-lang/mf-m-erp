// Estoque → produto do tipo kit → Componentes: o que sai do estoque quando o kit é vendido.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Modal } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { estoqueKit } from "@/lib/kits";
import type { KitComponente, Produto } from "@/lib/types";

export function KitComponentesModal({ kit, podeEditar, onClose }: { kit: Produto; podeEditar: boolean; onClose: () => void }) {
  const { data: todos = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const comps = todos.filter((c) => c.kit_id === kit.id);
  const [novo, setNovo] = useState("");
  const invalidar = useInvalidate();
  const prod = (id: string) => produtos.find((p) => p.id === id);
  const saldo = (id: string) => Number(prod(id)?.estoque_atual ?? 0);
  const custo = comps.filter((c) => c.padrao).reduce((s, c) => s + Number(c.quantidade) * Number(prod(c.componente_id)?.preco_custo ?? 0), 0);

  async function gravar(acao: PromiseLike<{ error: unknown }>) {
    const { error } = await acao;
    if (error) notifyError(error);
    invalidar("kit_componentes");
  }
  const atualizar = (c: KitComponente, patch: Partial<KitComponente>) => gravar(supabase.from("kit_componentes").update(patch).eq("id", c.id));
  const adicionar = (id: string) => { if (id) gravar(supabase.from("kit_componentes").insert({ kit_id: kit.id, componente_id: id, quantidade: 1 })); setNovo(""); };
  const remover = (c: KitComponente) => gravar(supabase.from("kit_componentes").delete().eq("id", c.id));

  return (
    <Modal open onClose={onClose} title={`Componentes do kit: ${kit.descricao}`} wide>
      <p className="mb-3 text-sm text-slate-600">
        Ao aprovar a venda do kit, o ERP baixa o estoque destes componentes (o kit em si não tem estoque).
        <b> Opcional</b>: o vendedor pode tirar no pedido. <b>Grupo</b>: itens com o mesmo nome de grupo são alternativas (escolhe um; o marcado como padrão vem selecionado).
      </p>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span>Kits que dá para montar agora: <b className="num">{estoqueKit(kit.id, todos, saldo)}</b></span>
        <span>Custo dos componentes: <b className="num">{brl(custo)}</b> · preço do kit <b className="num">{brl(kit.preco_venda)}</b></span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y">
          <thead className="bg-slate-50"><tr><th className="th">Componente</th><th className="th w-24">Qtd</th><th className="th w-24">Opcional</th><th className="th w-40">Grupo (alternativas)</th><th className="th w-20">Padrão</th><th className="th w-10" /></tr></thead>
          <tbody className="divide-y">
            {comps.map((c) => (
              <tr key={c.id}>
                <td className="td">{prod(c.componente_id)?.descricao}<div className="text-xs text-slate-500">estoque {saldo(c.componente_id)}</div></td>
                <td className="td"><input className="input text-right" type="number" min={0.001} step="any" defaultValue={c.quantidade} disabled={!podeEditar}
                  onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(c.quantidade) && atualizar(c, { quantidade: Number(e.target.value) })} /></td>
                <td className="td text-center"><input type="checkbox" className="h-5 w-5" checked={c.opcional} disabled={!podeEditar} onChange={(e) => atualizar(c, { opcional: e.target.checked })} /></td>
                <td className="td"><input className="input" defaultValue={c.grupo ?? ""} disabled={!podeEditar} placeholder="—"
                  onBlur={(e) => (e.target.value.trim() || null) !== c.grupo && atualizar(c, { grupo: e.target.value.trim() || null })} /></td>
                <td className="td text-center"><input type="checkbox" className="h-5 w-5" checked={c.padrao} disabled={!podeEditar} onChange={(e) => atualizar(c, { padrao: e.target.checked })} /></td>
                <td className="td">{podeEditar && <Button type="button" variant="ghost" aria-label="Remover" onClick={() => remover(c)}><Trash2 size={16} /></Button>}</td>
              </tr>
            ))}
            {!comps.length && <tr><td colSpan={6} className="td py-4 text-center text-slate-500">Nenhum componente ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {podeEditar && (
        <div className="mt-3 flex items-center gap-2">
          <Plus size={16} className="text-slate-400" />
          <select className="input" value={novo} onChange={(e) => adicionar(e.target.value)}>
            <option value="">Adicionar componente…</option>
            {produtos.filter((p) => p.id !== kit.id && !p.kit && !comps.some((c) => c.componente_id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.descricao} (estoque {Number(p.estoque_atual)})</option>
            ))}
          </select>
        </div>
      )}
    </Modal>
  );
}
