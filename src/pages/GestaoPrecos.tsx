// Gestão de preços (pedido de 23/10): os preços para revisar, as regras de formação e as tabelas de preço saíram das
// abas de Produtos e ganharam o espaço próprio em Vendas, onde o preço é usado.
import { PageHeader, Tabs } from "@/components/ui";
import { FormacaoPreco, usePrecosPendentes } from "@/components/produtos/FormacaoPreco";
import { TabelasPreco } from "@/components/produtos/TabelasPreco";
import { useCategoriasProduto } from "@/components/CategoriasProdutos";
import { useAbaUrl } from "@/lib/abaUrl";
import { useRows } from "@/lib/data";
import { SELECT_LISTA_PRODUTOS } from "@/lib/produtosLista";
import { usePerfil } from "@/lib/auth";
import type { Produto } from "@/lib/types";

type Aba = "precos" | "tabelas";

export default function GestaoPrecos() {
  const { pode, tem } = usePerfil();
  // as regras e a revisão mexem em margem e custo: só quem vê o financeiro (como era na aba de Produtos)
  const veRegras = tem("financeiro");
  const podeMover = pode("editar_produtos") && tem("financeiro");
  const [aba, setAba] = useAbaUrl<Aba>(veRegras ? "precos" : "tabelas", veRegras ? ["precos", "tabelas"] : ["tabelas"]);
  const { data: pendentes = 0 } = usePrecosPendentes();
  const { data: categorias = [] } = useCategoriasProduto();
  const { data: produtos = [] } = useRows<Produto>("produtos", { select: SELECT_LISTA_PRODUTOS, order: "descricao", ascending: true });
  const abas = [
    ...(veRegras ? [{ value: "precos" as const, label: pendentes ? `Revisar e regras (${pendentes})` : "Revisar e regras" }] : []),
    { value: "tabelas" as const, label: "Tabelas de preço" },
  ];
  return (
    <div>
      <PageHeader title="Gestão de preços"
        subtitle="Quando o custo muda, o ERP sugere o novo preço pela margem desejada e espera a sua aprovação. Aqui também ficam as regras do preço e as tabelas por cliente ou canal." />
      {abas.length > 1 && <Tabs value={aba} onChange={setAba} options={abas} />}
      {aba === "precos" && veRegras
        ? <FormacaoPreco categorias={categorias} podeAprovar={podeMover} />
        : <TabelasPreco produtos={produtos} podeEditar={podeMover} />}
    </div>
  );
}
