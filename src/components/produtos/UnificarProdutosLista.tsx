// Unificar produtos marcados na lista: escolhe o cadastro que fica; vendas, notas, OS, compras, kits, ficha técnica,
// fornecedores, anexos e o estoque dos outros passam para ele, e o que só os outros tinham completa o principal
// (a função unificar_produtos do banco). Os outros ficam arquivados com o aviso "unificado em", nunca apagados.
import { useState } from "react";
import { Merge } from "lucide-react";
import { Button, Field, Modal } from "../ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { brl, pl } from "@/lib/format";
import type { Produto } from "@/lib/types";

/** Sugestão de qual fica: ativo, com SKU, custo, preço, foto, NCM e código de barras. */
export function sugerirPrincipal(lista: Produto[]): string | undefined {
  const pontos = (p: Produto) => (p.ativo !== false && !p.unificado_em ? 100 : 0) + (p.sku ? 5 : 0) + (Number(p.preco_custo) > 0 ? 4 : 0)
    + (Number(p.preco_venda) > 0 ? 3 : 0) + (p.foto_caminho ? 2 : 0) + (p.ncm ? 1 : 0) + (p.codigo_barras ? 1 : 0);
  return [...lista].sort((a, b) => pontos(b) - pontos(a))[0]?.id;
}

export function UnificarProdutosLista({ produtos, onFim }: { produtos: Produto[]; onFim: (mensagem: string) => void }) {
  const invalidar = useInvalidate();
  const lista = produtos.filter((p) => !p.unificado_em);
  const [principal, setPrincipal] = useState(() => sugerirPrincipal(lista));
  const [motivo, setMotivo] = useState("Cadastro repetido");
  const [ocupado, setOcupado] = useState(false);
  const m = lista.find((p) => p.id === principal);
  const kitsMisturados = new Set(lista.map((p) => !!p.kit)).size > 1;

  async function unificar() {
    if (!principal) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("unificar_produtos", {
        p_principal: principal, p_outros: lista.filter((p) => p.id !== principal).map((p) => p.id), p_motivo: motivo.trim() || "Cadastro repetido",
      });
      if (error) throw error;
      invalidar("produtos", "estoque_unidade", "estoque_movimentos", "kit_componentes", "produto_componentes", "produto_fornecedor", "pedido_itens");
      const n = Number(data) || 0;
      onFim(`${n} ${pl(n, "cadastro", "cadastros")} ${pl(n, "unificado", "unificados")} em "${m?.descricao}": vendas, notas, estoque, kits e fornecedores estão agora nele`);
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <Modal open wide onClose={() => onFim("Nada mudou")} title={`Unificar ${lista.length} produtos`}>
      <p className="mb-3 text-sm text-slate-600">Escolha o cadastro que fica (tem que estar ativo).</p>
      <ul className="mb-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        <li><b className="text-fg">Nada se perde:</b> vendas, notas, OS, compras, kits, ficha técnica, fornecedores, anexos e o estoque (SC e SP) passam para ele.</li>
        <li><b className="text-fg">O que só os outros tinham completa o principal:</b> custo, preço, NCM, código de barras, foto, marca, peso e medidas.</li>
        <li><b className="text-fg">Códigos antigos continuam achando o produto:</b> SKU, código de barras e código do Tiny dos outros viram códigos alternativos.</li>
        <li><b className="text-fg">Os outros ficam arquivados</b> (inativos, com o aviso "unificado em"), nunca apagados.</li>
      </ul>
      {kitsMisturados && <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Há kit e produto comum juntos: não dá para unificar kit com produto que não é kit.</p>}
      <ul className="space-y-2">
        {lista.map((p) => {
          const inativo = p.ativo === false;
          return (
            <li key={p.id}>
              <label className={`flex gap-3 rounded-xl border p-3 text-sm ${inativo ? "cursor-not-allowed opacity-80" : "cursor-pointer"} ${principal === p.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                <input type="radio" name="principal-produto" className="mt-1 h-4 w-4" checked={principal === p.id} disabled={inativo} onChange={() => setPrincipal(p.id)} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-fg">{p.descricao}</span>
                  {inativo && <span className="ml-2 rounded-full bg-slate-200 px-1.5 py-0.5 text-2xs font-semibold text-slate-700">inativo</span>}
                  <span className="block text-xs text-slate-500">
                    {[p.sku ? `SKU ${p.sku}` : "sem SKU", Number(p.preco_custo) > 0 ? `custo ${brl(Number(p.preco_custo))}` : "sem custo",
                      Number(p.preco_venda) > 0 ? `venda ${brl(Number(p.preco_venda))}` : null, `estoque ${Number(p.estoque_atual ?? 0)}`,
                      p.ncm ? `NCM ${p.ncm}` : null, p.codigo_barras ? `EAN ${p.codigo_barras}` : null, p.foto_caminho ? "com foto" : "sem foto"].filter(Boolean).join(" · ")}
                  </span>
                  {principal === p.id && <span className="mt-1 block text-xs font-semibold text-brand">Este fica</span>}
                  {inativo && principal !== p.id && <span className="mt-1 block text-xs text-slate-500">Inativo: entra no que fica (para ele ficar, ative antes)</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Field label="Motivo (fica no histórico dos dois)" className="mt-3">
        <input className="input" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onFim("Nada mudou")}>Cancelar</Button>
        <Button type="button" disabled={ocupado || !principal || lista.length < 2 || kitsMisturados} onClick={unificar}>
          <Merge size={16} /> {ocupado ? "Unificando…" : "Unificar"}
        </Button>
      </div>
    </Modal>
  );
}
