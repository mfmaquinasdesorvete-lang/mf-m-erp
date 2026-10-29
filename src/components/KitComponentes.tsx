// Estoque → produto do tipo kit → Componentes: o que sai do estoque quando o kit é vendido.
// Um componente pode ser outro kit (ex.: Mecânica Dupla leva 2 Mecânicas Q 050): sai pelas peças dele.
// Como a aba "kits" do Tiny: cada peça com o preço e o custo (unidade e total) e, no fim, a soma dos preços avulsos
// e o custo do kit. O custo do kit é a soma das peças e o banco refaz sozinho quando o custo de uma peça muda
// (gatilho zz_custo_kit_peca) ou quando uma peça entra, sai ou muda de quantidade (zz_custo_kit_composicao).
import { Trash2 } from "lucide-react";
import { confirmar } from "@/components/Dialogos";
import { Button, Modal } from "./ui";
import { ProdutoBusca } from "./ProdutoBusca";
import { useInvalidate, useRows } from "@/lib/data";
import { SELECT_LISTA_PRODUTOS } from "@/lib/produtosLista";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { custoKit, ehKitAberto, estoqueKit } from "@/lib/kits";
import type { KitComponente, Produto } from "@/lib/types";

const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function KitComponentesModal({ kit, podeEditar, onClose }: { kit: Produto; podeEditar: boolean; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Componentes do kit: ${kit.descricao}`} wide>
      <KitComponentes kit={kit} podeEditar={podeEditar} />
    </Modal>
  );
}

/** As peças do kit (na janela da lista e na aba "Peças do kit" do cadastro). */
/** `explicar`: o texto do alto (no cadastro, a aba já explica). */
export function KitComponentes({ kit, podeEditar, explicar = true }: { kit: Pick<Produto, "id" | "preco_venda">; podeEditar: boolean; explicar?: boolean }) {
  const { data: todos = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: produtos = [] } = useRows<Produto>("produtos", { select: SELECT_LISTA_PRODUTOS, order: "descricao", ascending: true });
  const comps = todos.filter((c) => c.kit_id === kit.id);
  const invalidar = useInvalidate();
  const prod = (id: string) => produtos.find((p) => p.id === id);
  const saldo = (id: string) => Number(prod(id)?.estoque_atual ?? 0);
  const custoDe = (id: string) => Number(prod(id)?.preco_custo ?? 0);
  // kit dentro de kit: o custo dele é o das peças de dentro
  const custoUn = (id: string) => (ehKitAberto(id, todos) ? custoKit(id, todos, custoDe) : custoDe(id));
  const custo = custoKit(kit.id, todos, custoDe);
  const padrao = comps.filter((c) => c.padrao);
  const somaPrecos = padrao.reduce((s, c) => s + Number(c.quantidade) * Number(prod(c.componente_id)?.preco_venda ?? 0), 0);
  const somaQtd = padrao.reduce((s, c) => s + Number(c.quantidade), 0);
  const precoKit = Number(kit.preco_venda ?? 0);

  async function gravar(acao: PromiseLike<{ error: unknown }>) {
    const { error } = await acao;
    if (error) notifyError(error);
    // o banco refaz o custo do kit: a lista de produtos também muda
    invalidar("kit_componentes", "produtos");
  }
  const atualizar = (c: KitComponente, patch: Partial<KitComponente>) => gravar(supabase.from("kit_componentes").update(patch).eq("id", c.id));
  const adicionar = (id: string) => gravar(supabase.from("kit_componentes").insert({ kit_id: kit.id, componente_id: id, quantidade: 1 }));
  const remover = async (c: KitComponente) => {
    // a baixa de estoque do kit muda na hora: pergunta antes
    if (!(await confirmar("Tirar este componente do kit? A quantidade e o grupo dele se perdem.", { perigo: true }))) return;
    return gravar(supabase.from("kit_componentes").delete().eq("id", c.id));
  };
  const nota = (c: KitComponente) => ehKitAberto(c.componente_id, todos)
    ? <><span className="mr-1 rounded bg-violet-100 px-1.5 py-0.5 text-2xs font-bold text-violet-700">KIT</span>sai pelas peças dele · dá para montar {estoqueKit(c.componente_id, todos, saldo)}</>
    : `${prod(c.componente_id)?.sku ?? ""} · estoque ${qtd(saldo(c.componente_id))}`;
  const campoQtd = (c: KitComponente) => (
    <input aria-label={`Quantidade de ${prod(c.componente_id)?.descricao ?? "componente"}`} className="input text-right" type="number" min={0.001} step="any"
      defaultValue={c.quantidade} disabled={!podeEditar}
      onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(c.quantidade) && atualizar(c, { quantidade: Number(e.target.value) })} />
  );

  return (
    <div>
      {explicar && <p className="mb-3 text-sm text-slate-600">
        Ao vender o kit, o ERP baixa o estoque destas peças (o kit em si não tem estoque). O custo do kit é a soma das peças e
        muda sozinho quando o custo de uma peça muda. <b>Opcional</b>: o vendedor pode tirar no pedido. <b>Grupo</b>: itens com o
        mesmo nome de grupo são alternativas (escolhe um; o marcado como padrão vem selecionado).
      </p>}

      {/* celular: um cartão por peça */}
      <ul className="space-y-2 sm:hidden">
        {comps.map((c) => {
          const p = prod(c.componente_id);
          return (
            <li key={c.id} className="cartao p-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg">{p?.descricao}</span>
                  <span className="block text-xs text-slate-500">{nota(c)}</span>
                </span>
                {podeEditar && <button type="button" className="botao-icone-perigo" aria-label={`Tirar ${p?.descricao ?? "componente"}`} onClick={() => remover(c)}><Trash2 size={16} aria-hidden /></button>}
              </div>
              <div className="mt-2 grid grid-cols-3 items-end gap-2">
                <label className="text-xs text-slate-500">Qtd{campoQtd(c)}</label>
                <span className="text-right text-xs text-slate-500">preço <b className="num block text-sm text-fg">{brl(Number(c.quantidade) * Number(p?.preco_venda ?? 0))}</b></span>
                <span className="text-right text-xs text-slate-500">custo <b className="num block text-sm text-fg">{brl(Number(c.quantidade) * custoUn(c.componente_id))}</b></span>
              </div>
            </li>
          );
        })}
        {!comps.length && <li className="py-4 text-center text-sm text-slate-500">Nenhuma peça ainda. Procure abaixo pelo nome ou SKU.</li>}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block">
        <table className="w-full min-w-[760px] divide-y">
          <thead className="bg-slate-50"><tr>
            <th className="th">Produto / código</th><th className="th w-24">Qtd</th>
            <th className="th w-32 text-right">Preço un. / custo</th><th className="th w-32 text-right">Total / custo</th>
            <th className="th w-20">Opcional</th><th className="th w-36">Grupo</th><th className="th w-16">Padrão</th><th className="th w-10" />
          </tr></thead>
          <tbody className="divide-y">
            {comps.map((c) => {
              const p = prod(c.componente_id);
              const q = Number(c.quantidade);
              return (
                <tr key={c.id}>
                  <td className="td">{p?.descricao}<div className="text-xs text-slate-500">{nota(c)}</div></td>
                  <td className="td">{campoQtd(c)}</td>
                  <td className="td num text-right">{brl(Number(p?.preco_venda ?? 0))}<div className="text-xs text-slate-500">{brl(custoUn(c.componente_id))}</div></td>
                  <td className="td num text-right">{brl(q * Number(p?.preco_venda ?? 0))}<div className="text-xs text-slate-500">{brl(q * custoUn(c.componente_id))}</div></td>
                  <td className="td text-center"><input type="checkbox" className="h-5 w-5" aria-label="Opcional" checked={c.opcional} disabled={!podeEditar} onChange={(e) => atualizar(c, { opcional: e.target.checked })} /></td>
                  <td className="td"><input aria-label="Grupo" className="input" defaultValue={c.grupo ?? ""} disabled={!podeEditar} placeholder="—"
                    onBlur={(e) => (e.target.value.trim() || null) !== c.grupo && atualizar(c, { grupo: e.target.value.trim() || null })} /></td>
                  <td className="td text-center"><input type="checkbox" className="h-5 w-5" aria-label="Padrão" checked={c.padrao} disabled={!podeEditar} onChange={(e) => atualizar(c, { padrao: e.target.checked })} /></td>
                  <td className="td">{podeEditar && <Button type="button" variant="ghost" aria-label={`Tirar ${p?.descricao ?? "componente"}`} onClick={() => remover(c)}><Trash2 size={16} /></Button>}</td>
                </tr>
              );
            })}
            {!comps.length && <tr><td colSpan={8} className="td py-4 text-center text-slate-500">Nenhuma peça ainda. Procure abaixo pelo nome ou SKU.</td></tr>}
          </tbody>
          {comps.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold"><tr>
              <td className="td">Total <span className="block text-xs font-normal text-slate-500">custo total</span></td>
              <td className="td num text-right">{qtd(somaQtd)}</td>
              <td className="td" />
              <td className="td num text-right">{brl(somaPrecos)}<div className="text-xs font-normal text-slate-500">{brl(custo)}</div></td>
              <td className="td" colSpan={4} />
            </tr></tfoot>
          )}
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-2 text-sm">
        <span>Custo do kit: <b className="num">{brl(custo)}</b></span>
        <span>Peças avulsas: <b className="num">{brl(somaPrecos)}</b></span>
        <span>Preço do kit: <b className="num">{brl(precoKit)}</b>
          {precoKit > 0 && somaPrecos > precoKit && <span className="text-slate-600"> · o cliente economiza {brl(somaPrecos - precoKit)} ({Math.round((1 - precoKit / somaPrecos) * 100)}%)</span>}</span>
        <span>Dá para montar agora: <b className="num">{estoqueKit(kit.id, todos, saldo)}</b></span>
      </div>

      {podeEditar && (
        <ProdutoBusca className="mt-3" placeholder="Adicionar peça ao kit: nome ou SKU"
          produtos={produtos.filter((p) => p.id !== kit.id && p.ativo !== false && !comps.some((c) => c.componente_id === p.id))}
          onEscolher={(p) => adicionar(p.id)}
          detalhe={(p) => [p.sku, p.kit ? "kit: sai pelas peças dele" : `custo ${brl(p.preco_custo)} · preço ${brl(p.preco_venda)}`, p.kit ? null : `estoque ${qtd(p.estoque_atual)}`].filter(Boolean).join(" · ")} />
      )}
    </div>
  );
}
