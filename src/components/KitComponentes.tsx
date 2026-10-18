// Estoque → produto do tipo kit → Componentes: o que sai do estoque quando o kit é vendido.
// Um componente pode ser outro kit (ex.: Mecânica Dupla leva 2 Mecânicas Q 050): sai pelas peças dele.
import { Trash2 } from "lucide-react";
import { confirmar } from "@/components/Dialogos";
import { Button, Modal } from "./ui";
import { ProdutoBusca } from "./ProdutoBusca";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { custoKit, ehKitAberto, estoqueKit } from "@/lib/kits";
import type { KitComponente, Produto } from "@/lib/types";

export function KitComponentesModal({ kit, podeEditar, onClose }: { kit: Produto; podeEditar: boolean; onClose: () => void }) {
  const { data: todos = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const comps = todos.filter((c) => c.kit_id === kit.id);
  const invalidar = useInvalidate();
  const prod = (id: string) => produtos.find((p) => p.id === id);
  const saldo = (id: string) => Number(prod(id)?.estoque_atual ?? 0);
  const custo = custoKit(kit.id, todos, (id) => Number(prod(id)?.preco_custo ?? 0));

  async function gravar(acao: PromiseLike<{ error: unknown }>) {
    const { error } = await acao;
    if (error) notifyError(error);
    invalidar("kit_componentes");
  }
  const atualizar = (c: KitComponente, patch: Partial<KitComponente>) => gravar(supabase.from("kit_componentes").update(patch).eq("id", c.id));
  const adicionar = (id: string) => gravar(supabase.from("kit_componentes").insert({ kit_id: kit.id, componente_id: id, quantidade: 1 }));
  const remover = async (c: KitComponente) => {
    // a baixa de estoque do kit muda na hora: pergunta antes
    if (!(await confirmar("Tirar este componente do kit? A quantidade e o grupo dele se perdem.", { perigo: true }))) return;
    return gravar(supabase.from("kit_componentes").delete().eq("id", c.id));
  };

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
        <table className="w-full min-w-[640px] divide-y">
          <thead className="bg-slate-50"><tr><th className="th">Componente</th><th className="th w-24">Qtd</th><th className="th w-24">Opcional</th><th className="th w-40">Grupo (alternativas)</th><th className="th w-20">Padrão</th><th className="th w-10" /></tr></thead>
          <tbody className="divide-y">
            {comps.map((c) => (
              <tr key={c.id}>
                <td className="td">{prod(c.componente_id)?.descricao}
                  <div className="text-xs text-slate-500">{ehKitAberto(c.componente_id, todos)
                    ? <><span className="mr-1 rounded bg-violet-100 px-1.5 py-0.5 text-2xs font-bold text-violet-700">KIT</span>sai pelas peças dele · dá para montar {estoqueKit(c.componente_id, todos, saldo)}</>
                    : `estoque ${saldo(c.componente_id)}`}</div></td>
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
        <ProdutoBusca className="mt-3" placeholder="Adicionar componente: nome ou SKU"
          produtos={produtos.filter((p) => p.id !== kit.id && !comps.some((c) => c.componente_id === p.id))}
          onEscolher={(p) => adicionar(p.id)}
          detalhe={(p) => [p.sku, p.kit ? "kit: sai pelas peças dele" : `custo ${brl(p.preco_custo)}`, p.kit ? null : `estoque ${Number(p.estoque_atual)}`, p.ativo ? null : "inativo"].filter(Boolean).join(" · ")} />
      )}
    </Modal>
  );
}
