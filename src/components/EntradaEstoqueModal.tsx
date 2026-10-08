import { useEffect, useState } from "react";
import { Button, Modal } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import type { Produto } from "@/lib/types";

type ItemXml = {
  numero: number; codigo: string; descricao: string; ncm: string | null; unidade: string;
  quantidade: number; valor_unitario: number; valor_total: number;
  produto_id: string | null; fator: number;
};
type Linha = ItemXml & { atualizar_custo: boolean };

const NOVO = "__novo__";

/** Entrada de estoque a partir do XML de uma NF-e recebida, com vínculo item do fornecedor → produto. */
export function EntradaEstoqueModal({ nota, onClose }: { nota: { id: string; emitente_nome: string; valor_total: number }; onClose: () => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const invalidate = useInvalidate();

  useEffect(() => {
    callFunction<{ itens: ItemXml[] }>("nfe-recebidas-sync", { acao: "itens", nfe_id: nota.id })
      .then((r) => setLinhas(r.itens.map((i) => ({ ...i, atualizar_custo: true }))))
      .catch((e) => setErro(e.message));
  }, [nota.id]);

  const atualizar = (idx: number, patch: Partial<Linha>) =>
    setLinhas((ls) => ls!.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  async function escolherProduto(idx: number, valor: string) {
    if (valor !== NOVO) return atualizar(idx, { produto_id: valor || null });
    const it = linhas![idx];
    try {
      // Cadastra o produto com os dados da nota; preço de venda fica para ajustar depois.
      const { data, error } = await supabase.from("produtos").insert({
        descricao: it.descricao, tipo: "peca", unidade: "UN", ncm: it.ncm,
        preco_custo: Math.round((it.valor_unitario / (it.fator || 1)) * 100) / 100,
      }).select("id").single();
      if (error) throw error;
      invalidate("produtos");
      atualizar(idx, { produto_id: data.id });
      notify("Produto cadastrado — lembre de definir o preço de venda");
    } catch (e) {
      notifyError(e);
    }
  }

  async function confirmar() {
    setSalvando(true);
    try {
      const itens = linhas!.map((l) => ({
        codigo: l.codigo, descricao: l.descricao, produto_id: l.produto_id,
        quantidade: l.quantidade, valor_unitario: l.valor_unitario, fator: l.fator, atualizar_custo: l.atualizar_custo,
      }));
      const { data, error } = await supabase.rpc("lancar_estoque_nfe", { p_nfe: nota.id, p_itens: itens });
      if (error) throw error;
      notify(`${data} item(ns) lançados no estoque`);
      invalidate("nfe_recebidas", "produtos", "estoque_movimentos");
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setSalvando(false);
    }
  }

  const vinculados = linhas?.filter((l) => l.produto_id).length ?? 0;

  return (
    <Modal open onClose={onClose} title={`Entrada no estoque — ${nota.emitente_nome}`} wide>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {!linhas && !erro && <p className="text-sm text-slate-500">Lendo o XML da nota na SEFAZ…</p>}

      {linhas && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Vincule cada item da nota a um produto da MF. O vínculo fica salvo: nas próximas notas deste fornecedor o item já vem preenchido.
            Itens sem produto (ex.: material de consumo) são ignorados. Use o <b>fator</b> quando o fornecedor vende em caixa/pacote
            (ex.: caixa com 10 → fator 10).
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full divide-y">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Item na nota</th>
                  <th className="th text-right">Qtd</th>
                  <th className="th text-right">Unitário</th>
                  <th className="th w-72">Produto MF</th>
                  <th className="th w-20 text-right">Fator</th>
                  <th className="th text-right">Entra</th>
                  <th className="th text-center">Atualizar custo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l, idx) => {
                  const fator = l.fator > 0 ? l.fator : 1;
                  return (
                    <tr key={idx} className={l.produto_id ? "" : "bg-slate-50/60"}>
                      <td className="td">
                        <div className="font-medium">{l.descricao}</div>
                        <div className="text-xs text-slate-500">Cód. {l.codigo}{l.ncm && ` · NCM ${l.ncm}`}</div>
                      </td>
                      <td className="td whitespace-nowrap text-right">{l.quantidade} {l.unidade}</td>
                      <td className="td text-right">{brl(l.valor_unitario)}</td>
                      <td className="td">
                        <select className="input" value={l.produto_id ?? ""} onChange={(e) => escolherProduto(idx, e.target.value)}>
                          <option value="">— ignorar este item —</option>
                          <option value={NOVO}>+ Cadastrar como novo produto</option>
                          {produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
                        </select>
                      </td>
                      <td className="td">
                        <input className="input text-right" type="number" min={0.0001} step="any" value={l.fator}
                          onChange={(e) => atualizar(idx, { fator: Number(e.target.value) })} />
                      </td>
                      <td className="td whitespace-nowrap text-right">
                        {l.produto_id ? (
                          <>
                            <div className="font-medium">{l.quantidade * fator} un</div>
                            <div className="text-xs text-slate-500">{brl(l.valor_unitario / fator)} cada</div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="td text-center">
                        <input type="checkbox" className="h-4 w-4" checked={l.atualizar_custo} disabled={!l.produto_id}
                          onChange={(e) => atualizar(idx, { atualizar_custo: e.target.checked })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-sm text-slate-600">{vinculados} de {linhas.length} item(ns) vinculados · Nota {brl(nota.valor_total)}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={confirmar} disabled={salvando || vinculados === 0}>
                {salvando ? "Lançando…" : "Confirmar entrada"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
