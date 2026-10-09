import { useState } from "react";
import { Boxes, Trash2 } from "lucide-react";
import { brl } from "@/lib/format";
import { useRows } from "@/lib/data";
import type { EscolhaKit, Item, KitComponente, Produto } from "@/lib/types";
import { composicao, estoqueKit } from "@/lib/kits";
import { Button, Modal } from "./ui";
import { ProdutoBusca } from "./ProdutoBusca";

type Props = {
  itens: Item[];
  onChange: (itens: Item[]) => void;
  disabled?: boolean;
  /** Filtra os produtos exibidos (ex.: só peças na OS). */
  filtro?: (p: Produto) => boolean;
  comSerie?: boolean;
};

export function ItensEditor({ itens, onChange, disabled, filtro, comSerie }: Props) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const disponiveis = produtos.filter((p) => p.ativo && (!filtro || filtro(p)));
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const [kitIdx, setKitIdx] = useState<number | null>(null);
  const saldo = (id: string) => Number(produtos.find((p) => p.id === id)?.estoque_atual ?? 0);
  const ehKit = (id: string) => !!produtos.find((p) => p.id === id)?.kit;
  const nomeProd = (id: string) => produtos.find((p) => p.id === id)?.descricao ?? "?";
  const estoqueDe = (p: Produto) => (p.kit ? estoqueKit(p.id, comps, saldo) : Number(p.estoque_atual));

  const atualizar = (idx: number, patch: Partial<Item>) =>
    onChange(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  function adicionar(produtoId: string) {
    const p = produtos.find((x) => x.id === produtoId);
    if (!p) return;
    onChange([...itens, { produto_id: p.id, descricao: p.descricao, quantidade: 1, valor_unitario: Number(p.preco_venda) }]);
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-md border">
        <table className="itens min-w-full divide-y">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Item</th>
              {comSerie && <th className="th w-36">Nº série</th>}
              <th className="th w-24 text-right">Qtd</th>
              <th className="th w-32 text-right">Unitário</th>
              <th className="th w-28 text-right">Total</th>
              <th className="th w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {itens.map((it, idx) => {
              const prod = produtos.find((p) => p.id === it.produto_id);
              const estoque = prod ? (prod.kit ? estoqueKit(prod.id, comps, saldo, it.kit_escolha) : prod.estoque_atual) : undefined;
              return (
                <tr key={idx}>
                  <td className="td it-largo" data-label="Item">
                    <input className="input" value={it.descricao} disabled={disabled} onChange={(e) => atualizar(idx, { descricao: e.target.value })} />
                    {estoque !== undefined && Number(estoque) < it.quantidade && !disabled && (
                      <p className="mt-1 text-xs text-red-600">{prod?.kit ? "Kits que dá para montar" : "Estoque disponível"}: {Number(estoque)}</p>
                    )}
                    {ehKit(it.produto_id) && (
                      <div className="mt-1 text-xs text-slate-500">
                        Kit: {composicao(it.produto_id, comps, it.kit_escolha).map((c) => `${c.quantidade}× ${nomeProd(c.componente_id)}`).join(", ") || "sem componentes cadastrados"}
                        {!disabled && comps.some((c) => c.kit_id === it.produto_id && (c.opcional || c.grupo)) && (
                          <button type="button" className="ml-1 font-semibold text-brand" onClick={() => setKitIdx(idx)}>Escolher componentes</button>
                        )}
                      </div>
                    )}
                  </td>
                  {comSerie && (
                    <td className="td it-largo" data-label="Nº série">
                      <input className="input" value={it.numero_serie ?? ""} disabled={disabled} onChange={(e) => atualizar(idx, { numero_serie: e.target.value })} />
                    </td>
                  )}
                  <td className="td" data-label="Qtd">
                    <input className="input text-right" type="number" min={0.001} step="any" value={it.quantidade} disabled={disabled}
                      onChange={(e) => atualizar(idx, { quantidade: Number(e.target.value) })} />
                  </td>
                  <td className="td" data-label="Unitário">
                    <input className="input text-right" type="number" min={0} step="0.01" value={it.valor_unitario} disabled={disabled}
                      onChange={(e) => atualizar(idx, { valor_unitario: Number(e.target.value) })} />
                  </td>
                  <td className="td it-total pt-4 text-right" data-label="Total">{brl(it.quantidade * it.valor_unitario)}</td>
                  <td className="td it-acao">
                    {!disabled && (
                      <Button type="button" variant="ghost" onClick={() => onChange(itens.filter((_, i) => i !== idx))} aria-label="Remover">
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr><td colSpan={6} className="td py-4 text-center text-slate-500">Nenhum item adicionado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <ProdutoBusca className="mt-2" produtos={disponiveis} onEscolher={(p) => adicionar(p.id)}
          detalhe={(p) => {
            const est = estoqueDe(p);
            return (
              <>
                {[p.sku, p.modelo, p.marca].filter(Boolean).map((x) => `${x} · `).join("")}
                <b className="text-fg">{brl(p.preco_venda)}</b> · <span className={est > 0 ? "" : "font-semibold text-red-600"}>{p.kit ? "dá para montar" : "estoque"} {est}</span>
              </>
            );
          }} />
      )}
      {kitIdx !== null && itens[kitIdx] && (
        <EscolhaKitModal kitId={itens[kitIdx].produto_id} comps={comps} nome={nomeProd} saldo={saldo}
          escolha={itens[kitIdx].kit_escolha ?? null} onClose={() => setKitIdx(null)}
          onSalvar={(e) => { atualizar(kitIdx, { kit_escolha: e }); setKitIdx(null); }} />
      )}
    </div>
  );
}

/** Opcionais (marcar/desmarcar) e alternativas (uma por grupo) de um kit. */
function EscolhaKitModal({ kitId, comps, escolha, nome, saldo, onClose, onSalvar }: {
  kitId: string; comps: KitComponente[]; escolha: EscolhaKit | null; nome: (id: string) => string; saldo: (id: string) => number;
  onClose: () => void; onSalvar: (e: EscolhaKit | null) => void;
}) {
  const doKit = comps.filter((c) => c.kit_id === kitId);
  const inicial = composicao(kitId, comps, escolha);
  const [sel, setSel] = useState<Set<string>>(new Set(inicial.map((c) => c.componente_id)));
  const fixos = doKit.filter((c) => !c.opcional && !c.grupo);
  const opcionais = doKit.filter((c) => c.opcional && !c.grupo);
  const grupos = [...new Set(doKit.filter((c) => c.grupo).map((c) => c.grupo!))];
  const linha = (c: KitComponente) => <span>{Number(c.quantidade)}× {nome(c.componente_id)} <span className="text-xs text-slate-400">(estoque {saldo(c.componente_id)})</span></span>;
  const alternar = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const escolherGrupo = (g: string, id: string) => setSel((s) => {
    const n = new Set(s); doKit.filter((c) => c.grupo === g).forEach((c) => n.delete(c.componente_id)); n.add(id); return n;
  });
  function salvar() {
    const e = doKit.filter((c) => !c.opcional && !c.grupo || sel.has(c.componente_id)).map((c) => ({ componente_id: c.componente_id, quantidade: Number(c.quantidade) }));
    onSalvar(e);
  }
  return (
    <Modal open onClose={onClose} title={`Componentes do kit: ${nome(kitId)}`}>
      <div className="space-y-4 text-sm">
        {fixos.length > 0 && <div><h4 className="mb-1 font-semibold">Sempre vem</h4><ul className="space-y-1 pl-1">{fixos.map((c) => <li key={c.id}>• {linha(c)}</li>)}</ul></div>}
        {grupos.map((g) => (
          <div key={g}><h4 className="mb-1 font-semibold">Escolha um: {g}</h4>
            {doKit.filter((c) => c.grupo === g).map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5"><input type="radio" className="h-4 w-4" name={`g-${g}`} checked={sel.has(c.componente_id)} onChange={() => escolherGrupo(g, c.componente_id)} /> {linha(c)}</label>
            ))}
          </div>
        ))}
        {opcionais.length > 0 && (
          <div><h4 className="mb-1 font-semibold">Opcionais</h4>
            {opcionais.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5"><input type="checkbox" className="h-4 w-4" checked={sel.has(c.componente_id)} onChange={(e) => alternar(c.componente_id, e.target.checked)} /> {linha(c)}</label>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><Boxes size={14} /> Ao aprovar a venda, o estoque baixado é o destes componentes. O preço do kit não muda.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onSalvar(null)}>Voltar ao padrão</Button>
          <Button type="button" onClick={salvar}>Usar estes componentes</Button>
        </div>
      </div>
    </Modal>
  );
}

export const totalItens = (itens: Item[]) =>
  itens.reduce((s, i) => s + Math.round(i.quantidade * i.valor_unitario * 100) / 100, 0);
