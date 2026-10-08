// Produtos e estoque → Qualidade do cadastro: revisão da base (duplicados, unidades, custo/preço, fornecedor,
// localização, estoque negativo, itens parados e estoque mínimo). Corrigir abre o cadastro, que valida ao gravar.
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button, Card } from "./ui";
import { useRows } from "@/lib/data";
import { hoje } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { avaliarCadastro, type Movimento } from "@/lib/qualidadeProdutos";
import type { Produto } from "@/lib/types";

const COR = { alta: "bg-red-500", media: "bg-amber-500", baixa: "bg-slate-400" };

export function QualidadeProdutos({ produtos, onCorrigir, podeEditar }: { produtos: Produto[]; onCorrigir: (p: Produto) => void; podeEditar: boolean }) {
  const { data: vinculos = [] } = useRows<{ produto_id: string }>("produto_fornecedor", { select: "produto_id", order: "produto_id" });
  const { data: movimentos = [] } = useRows<Movimento>("estoque_movimentos", { select: "produto_id, tipo, quantidade, created_at" });
  const problemas = useMemo(() => avaliarCadastro(produtos, {
    comFornecedor: new Set(vinculos.map((v) => v.produto_id)), movimentos, hoje: hoje(),
  }), [produtos, vinculos, movimentos]);
  const comItens = problemas.filter((p) => p.itens.length);
  const [aberto, setAberto] = useState<string | null>(null);
  const abertoAgora = aberto ?? comItens[0]?.id ?? null;
  const total = new Set(comItens.flatMap((p) => p.itens.map((i) => i.produto.id))).size;
  const ativos = produtos.filter((p) => p.ativo !== false).length;

  function exportar() {
    baixarPlanilha("qualidade-cadastro-produtos", [{ nome: "Pendências", linhas: comItens.flatMap((p) => p.itens.map((i) => ({
      Problema: p.titulo, Gravidade: p.gravidade, SKU: i.produto.sku ?? "", Descrição: i.produto.descricao, Tipo: i.produto.tipo,
      Unidade: i.produto.unidade, Categoria: i.produto.categoria ?? "", Detalhe: i.detalhe ?? "", "Por que importa": p.porque,
    }))) }]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-[14rem] flex-1">
          <div className="text-sm font-semibold">Revisão da base de produtos</div>
          <p className="text-sm text-slate-600">
            {total ? <><b>{total}</b> de {ativos} produtos ativos têm alguma pendência.</> : "Nenhuma pendência encontrada."} O cadastro novo já é
            validado ao gravar (código único, unidade, NCM, motivo nas alterações de custo e preço), então o que for corrigido aqui não volta.
          </p>
        </div>
        <Button variant="secondary" onClick={exportar} disabled={!comItens.length}><Download size={16} /> Exportar pendências</Button>
      </Card>

      {!comItens.length && (
        <Card className="flex items-center gap-3 p-5 text-sm text-slate-600"><CheckCircle2 className="text-emerald-600" /> Cadastro sem pendências pelas regras atuais.</Card>
      )}

      {comItens.map((p) => {
        const expandido = abertoAgora === p.id;
        return (
          <Card key={p.id} className="overflow-hidden">
            <button type="button" onClick={() => setAberto(expandido ? "" : p.id)} aria-expanded={expandido}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR[p.gravidade]}`} aria-label={`gravidade ${p.gravidade}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{p.titulo} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p.itens.length}</span></span>
                <span className="block text-sm text-slate-500">{p.porque}</span>
              </span>
              {expandido ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
            </button>
            {expandido && (
              <ul className="max-h-[28rem] overflow-auto border-t border-slate-100">
                {p.itens.map((i) => (
                  <li key={i.produto.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 last:border-b-0">
                    <div className="min-w-[14rem] flex-1">
                      <div className="text-sm font-medium text-fg">{i.produto.descricao}{i.produto.ativo === false && <span className="ml-1 text-xs text-slate-500">(inativo)</span>}</div>
                      <div className="text-xs text-slate-500">{[i.produto.sku || "sem SKU", i.produto.categoria, i.detalhe].filter(Boolean).join(" · ")}</div>
                    </div>
                    {podeEditar && <Button variant="secondary" onClick={() => onCorrigir(i.produto)}>Corrigir</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
