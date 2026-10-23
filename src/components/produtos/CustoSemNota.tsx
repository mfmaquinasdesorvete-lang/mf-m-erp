// Produtos → Qualidade → "Sem custo": cada produto ativo sem custo, com o item de nota de fornecedor que mais parece
// ser ele. "Usar" liga o item ao produto (as próximas notas já entram sozinhas) e grava o custo da última compra;
// quem nunca veio por nota (peça fabricada, catálogo) recebe o custo digitado.
import { useMemo, useRef, useState } from "react";
import { lerValor } from "@/lib/auditoriaBusca";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Receipt } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, pl } from "@/lib/format";
import { sugestaoCusto, type ItemNota } from "@/lib/itensNotas";
import type { Produto } from "@/lib/types";

type Linha = { produto: Produto; sug: ReturnType<typeof sugestaoCusto> };

export function CustoSemNota({ produtos, podeEditar }: { produtos: Produto[]; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const emLote = useRef(false);
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const semCusto = useMemo(() => produtos.filter((p) => p.ativo !== false && !p.unificado_em && !p.kit && p.tipo !== "servico" && !Number(p.preco_custo)), [produtos]);
  const { data: itens = [] } = useQuery({
    queryKey: ["itens_notas_fornecedor", "custo", semCusto.length],
    enabled: aberto && semCusto.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("itens_notas_fornecedor", { p_unidade: null, p_desde: null });
      if (error) throw error;
      return (data ?? []) as ItemNota[];
    },
  });
  const linhas: Linha[] = useMemo(() => semCusto.map((p) => ({ produto: p, sug: itens.length ? sugestaoCusto(p, itens) : null }))
    .sort((a, b) => Number(!!b.sug) - Number(!!a.sug) || Number(b.produto.estoque_atual ?? 0) - Number(a.produto.estoque_atual ?? 0) || a.produto.descricao.localeCompare(b.produto.descricao, "pt-BR")),
  [semCusto, itens]);
  const comSugestao = linhas.filter((l) => l.sug).length;

  async function gravarCusto(p: Produto, custo: number, motivo: string) {
    const { error } = await supabase.from("produtos").update({ preco_custo: custo, motivo_alteracao: motivo }).eq("id", p.id);
    if (error) throw error;
  }
  async function usar(l: Linha, silencioso = false) {
    if (!l.sug) return;
    const { item, custo } = l.sug;
    setOcupado(l.produto.id);
    try {
      const { error } = await supabase.rpc("ligar_itens_fornecedor", { p_itens: [{ fornecedor_id: item.fornecedor_id, codigo: item.codigo, descricao: item.descricao, acao: "produto", produto_id: l.produto.id, fator: item.fator ?? 1 }] });
      if (error) throw error;
      await gravarCusto(l.produto, custo, `Custo da última nota de ${item.fornecedor ?? "fornecedor"} (${dataBR(item.ultima_data)})`);
      if (!silencioso) { notify(`Custo de ${brl(custo)} gravado`); fim(); }
    } catch (e) { notifyError(e); throw e; } finally { setOcupado(null); }
  }
  async function usarFortes() {
    const fortes = linhas.filter((l) => l.sug && l.sug.nota >= 0.8);
    if (!fortes.length || !(await confirmar(`Gravar o custo da nota em ${fortes.length} ${pl(fortes.length, "produto", "produtos")} com sugestão forte?`))) return;
    if (emLote.current) return;
    emLote.current = true;
    setOcupado("lote");
    let n = 0;
    try {
      for (const l of fortes) { try { await usar(l, true); n++; } catch { break; } }
    } finally { emLote.current = false; setOcupado(null); }
    notify(`${n} ${pl(n, "custo gravado", "custos gravados")}`);
    fim();
  }
  async function digitar(p: Produto) {
    const v = lerValor(digitado[p.id] ?? "") ?? NaN;
    if (!(v > 0)) return notifyError(new Error("Digite um custo maior que zero"));
    setOcupado(p.id);
    try { await gravarCusto(p, v, "Custo informado na revisão de produtos sem custo"); notify(`Custo de ${brl(v)} gravado`); fim(); }
    catch (e) { notifyError(e); } finally { setOcupado(null); }
  }
  function fim() {
    invalidate("produtos", "produto_fornecedor");
    qc.invalidateQueries({ queryKey: ["itens_notas_fornecedor"] });
  }

  if (!semCusto.length) return null;
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="linha-clicavel flex items-center gap-3 p-4">
        <Receipt size={20} className="shrink-0 text-amber-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-fg">Sem custo: {semCusto.length} {pl(semCusto.length, "produto", "produtos")}</span>
          <span className="block text-sm text-slate-500">O ERP procura o item nas notas de fornecedor. Achou: um toque grava o custo da última compra. Não achou (peça fabricada, catálogo): digite o custo.</span>
        </span>
        {aberto ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
      </button>
      {aberto && (
        <div className="border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
            <span className="text-slate-600">{itens.length ? <><b>{comSugestao}</b> com sugestão das notas · {semCusto.length - comSugestao} para digitar</> : "Procurando nas notas…"}</span>
            {podeEditar && linhas.some((l) => l.sug && l.sug.nota >= 0.8) && <Button className="ml-auto" disabled={ocupado === "lote"} onClick={usarFortes}><Check size={16} /> Usar as sugestões fortes</Button>}
          </div>
          <ul className="max-h-[32rem] overflow-auto">
            {linhas.map((l) => (
              <li key={l.produto.id} className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2.5">
                <div className="min-w-56 flex-1">
                  <div className="text-sm font-medium text-fg">{l.produto.descricao}</div>
                  <div className="text-xs text-slate-500">{[l.produto.sku || "sem SKU", l.produto.categoria, Number(l.produto.estoque_atual) > 0 && `${l.produto.estoque_atual} em estoque`].filter(Boolean).join(" · ")}</div>
                  {l.sug && (
                    <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      Nota: <b>{l.sug.item.descricao}</b> · {l.sug.item.fornecedor ?? "fornecedor"} · {dataBR(l.sug.item.ultima_data)} · <b>{brl(l.sug.custo)}</b>/{l.sug.item.unidade ?? "un"}
                      <span className="ml-1 text-amber-700">({l.sug.nota >= 0.8 ? "parecido" : "confira"})</span>
                    </div>
                  )}
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-1.5">
                    {l.sug && <Button variant="secondary" disabled={ocupado === l.produto.id} onClick={() => usar(l).catch(() => undefined)}>Usar {brl(l.sug.custo)}</Button>}
                    <input inputMode="decimal" placeholder="R$" aria-label={`Custo de ${l.produto.descricao}`} value={digitado[l.produto.id] ?? ""}
                      onChange={(e) => setDigitado({ ...digitado, [l.produto.id]: e.target.value })}
                      className="h-9 w-24 rounded-lg border border-slate-300 bg-surface px-2 text-right text-sm" />
                    <Button variant="ghost" disabled={ocupado === l.produto.id || !digitado[l.produto.id]} onClick={() => digitar(l.produto)}>Gravar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
