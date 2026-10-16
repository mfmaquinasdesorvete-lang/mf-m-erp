// Ordem de compra → notas fiscais do fornecedor: as ligadas (com a baixa feita ou a fazer) e as do mesmo fornecedor
// para ligar. Daqui o financeiro, o Compras e o técnico (que compra peças) ligam a nota e dão baixa na OC pela nota.
// O técnico não vê o valor das notas. O estoque entra pela nota (Notas fiscais); a baixa só soma o recebido na OC.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Link2, PackageCheck, Unlink } from "lucide-react";
import { Button } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { compararNotaOc, quantidadeErp, valorPorUnidadeErp, type ItemOc } from "@/lib/notaFornecedor";
import type { ItemCompra } from "@/lib/types";
import { ComparacaoOc } from "./ComparacaoOc";

type NotaOc = {
  id: string; numero: string; emitente: string | null; data_emissao: string | null; valor_total: number | null; estoque_lancado: boolean;
  ligada: boolean; baixado_em: string | null;
  itens: { numero: number; codigo: string | null; descricao: string | null; unidade: string | null; quantidade: number; valor_unitario: number | null;
    produto_id: string | null; fator: number }[];
};

export function NotasDaOc({ pedido, onBaixa }: { pedido: { id: string; numero: number; status: string; itens: ItemCompra[] }; onBaixa?: () => void }) {
  const { tem } = usePerfil();
  const podeMexer = tem("financeiro", "compras", "tecnico");
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const { data = [], error } = useQuery({
    queryKey: ["notas_para_oc", pedido.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notas_para_oc", { p_pedido: pedido.id });
      if (error) throw error;
      return (data ?? []) as NotaOc[];
    },
  });
  if (error || !data.length) return null;   // sem acesso, sem nota do fornecedor ou migração ainda não aplicada

  const produtosOc = new Set(pedido.itens.map((i) => i.produto_id));
  const ligadas = data.filter((n) => n.ligada);
  const outras = data.filter((n) => !n.ligada && pedido.status !== "recebido");
  const itensOc: ItemOc[] = pedido.itens.filter((i) => i.id).map((i) => ({
    id: i.id!, pedido_compra_id: pedido.id, numero: pedido.numero, produto_id: i.produto_id, descricao: i.descricao,
    quantidade: Number(i.quantidade), quantidade_recebida: Number(i.quantidade_recebida ?? 0), custo_unitario: Number(i.custo_unitario),
  }));
  const comparar = (n: NotaOc) => compararNotaOc(n.itens.filter((i) => i.produto_id).map((i) => ({
    produto_id: i.produto_id!, descricao: i.descricao ?? "", quantidade: quantidadeErp(i.quantidade, i.fator),
    preco_unitario: i.valor_unitario == null ? null : valorPorUnidadeErp(i.valor_unitario, i.fator),
  })), itensOc);

  async function executar(acao: () => PromiseLike<{ error: unknown }>, ok: string, depois?: () => void) {
    setOcupado(true);
    try {
      const { error } = await acao();
      if (error) throw error;
      notify(ok);
      invalidate("notas_para_oc", "ocs_para_nota", "pedidos_compra", "necessidade_producao", "auditoria");
      depois?.();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function ligar(n: NotaOc, sim: boolean) {
    const texto = sim ? `Ligar a NF ${n.numero} à ordem de compra #${pedido.numero}? A baixa das quantidades é um passo à parte.`
      : `Desligar a NF ${n.numero} da ordem de compra #${pedido.numero}?`;
    if (!(await confirmar(texto, { ok: sim ? "Ligar" : "Desligar" }))) return;
    await executar(() => supabase.rpc("ligar_nota_oc", { p_nfe: n.id, p_pedido: pedido.id, p_ligar: sim }),
      sim ? `NF ${n.numero} ligada à OC #${pedido.numero}` : `NF ${n.numero} desligada`);
  }

  async function baixar(n: NotaOc) {
    const { linhas, baixas } = comparar(n);
    const avisos = linhas.filter((l) => l.situacao !== "confere" || l.alerta_preco).length;
    const texto = `Dar baixa de ${baixas.length} ${pl(baixas.length, "item", "itens")} na OC #${pedido.numero} pela NF ${n.numero}? `
      + "O estoque não muda (já entrou pela nota). A mesma nota não baixa duas vezes esta OC."
      + (avisos ? ` Atenção: ${avisos} ${pl(avisos, "diferença", "diferenças")} entre a nota e a OC.` : "");
    if (!(await confirmar(texto, { titulo: "Baixa na ordem de compra", ok: "Dar baixa" }))) return;
    await executar(() => supabase.rpc("baixar_oc_pela_nota", { p_nfe: n.id, p_baixas: baixas.map((b) => ({ item_id: b.item_id, quantidade: b.quantidade })) }),
      `Baixa feita na OC #${pedido.numero} pela NF ${n.numero}`, onBaixa);
  }

  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><FileText size={15} className="text-modulo-texto" aria-hidden /> Notas fiscais do fornecedor</h3>
      {!ligadas.length && <p className="text-sm text-slate-500">Nenhuma nota ligada a esta OC.</p>}
      <ul className="space-y-2">
        {ligadas.map((n) => {
          const c = !n.baixado_em && n.estoque_lancado ? comparar(n) : null;
          return (
            <li key={n.id} className="rounded-lg border border-modulo/40 bg-modulo/5 p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <b className="text-fg">NF {n.numero}</b>
                <span className="min-w-0 flex-1 text-slate-600 [overflow-wrap:anywhere]">{[n.emitente, dataBR(n.data_emissao), n.valor_total != null ? brl(n.valor_total) : null].filter(Boolean).join(" · ")}</span>
                {podeMexer && !n.baixado_em && <Button type="button" variant="ghost" className="!px-2" disabled={ocupado} onClick={() => ligar(n, false)}><Unlink size={14} /> Desligar</Button>}
              </div>
              {n.baixado_em
                ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} aria-hidden /> baixa na OC feita em {dataBR(n.baixado_em)}: o estoque entrou pela nota</p>
                : !n.estoque_lancado
                  ? <p className="mt-1 text-xs text-amber-800">A entrada no estoque desta nota ainda não foi feita (Notas fiscais → a nota → Itens e custos). A baixa da OC vai junto.</p>
                  : c && (
                    <div className="mt-2">
                      <ComparacaoOc linhas={c.linhas} />
                      {podeMexer && c.baixas.length > 0 && (
                        <div className="mt-2 flex justify-end">
                          <Button type="button" disabled={ocupado} onClick={() => baixar(n)}><PackageCheck size={15} /> Dar baixa pela nota</Button>
                        </div>
                      )}
                    </div>
                  )}
            </li>
          );
        })}
      </ul>
      {outras.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-modulo-texto">Notas deste fornecedor para ligar ({outras.length})</summary>
          <ul className="mt-1 divide-y divide-slate-100">
            {outras.map((n) => {
              const comuns = new Set(n.itens.filter((i) => i.produto_id && produtosOc.has(i.produto_id)).map((i) => i.produto_id)).size;
              return (
                <li key={n.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <b className="text-fg">NF {n.numero}</b> · {dataBR(n.data_emissao)}{n.valor_total != null && ` · ${brl(n.valor_total)}`}
                    <span className="block text-xs text-slate-500">{comuns} {pl(comuns, "produto", "produtos")} desta OC{!n.estoque_lancado && " · estoque ainda não lançado"}</span>
                  </span>
                  {podeMexer && <Button type="button" variant="secondary" className="!px-2" disabled={ocupado} onClick={() => ligar(n, true)}><Link2 size={14} /> Ligar</Button>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
