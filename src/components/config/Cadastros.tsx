// Configurações → Categorias e marcadores: as categorias dos produtos (as mesmas da aba Categorias do Estoque) e os
// marcadores coloridos que aparecem em clientes, fornecedores, produtos, vendas, OS, compras, produção, contas e notas.
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { CategoriasProdutos } from "@/components/CategoriasProdutos";
import { ChipMarcador, GerenciarMarcadores, useMarcadores } from "@/components/nfe/Marcadores";
import type { Produto } from "@/lib/types";
import { Bloco, CabecalhoSecao, secaoPorId } from "./comum";

export function ConfigCadastros() {
  const s = secaoPorId("cadastros")!;
  const { pode } = usePerfil();
  const { data: produtos = [] } = useRows<Produto>("produtos", { select: "id, categoria", order: "descricao", ascending: true });
  const { data: marcadores = [] } = useMarcadores();
  const [gerenciar, setGerenciar] = useState(false);
  return (
    <div className="max-w-4xl">
      <CabecalhoSecao s={s} />
      <div className="space-y-5">
        <Bloco titulo="Marcadores" descricao="Etiquetas coloridas para organizar: aparecem em clientes, fornecedores, produtos, vendas, OS, ordens de compra e de produção, contas e notas fiscais. Em cada lista: botão de etiqueta na linha, filtro por marcador e marcar vários de uma vez.">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {marcadores.filter((m) => m.ativo).map((m) => <ChipMarcador key={m.id} m={m} />)}
            {!marcadores.some((m) => m.ativo) && <span className="text-sm text-slate-500">Nenhum marcador ainda.</span>}
          </div>
          <Button type="button" variant="secondary" onClick={() => setGerenciar(true)}><Settings2 size={16} aria-hidden /> Criar ou editar marcadores</Button>
        </Bloco>
        <Bloco titulo="Categorias dos produtos" descricao="Renomear troca a categoria em todos os produtos dela. Também fica em Estoque → aba Categorias e no botão ao lado do campo Categoria do produto.">
          <CategoriasProdutos produtos={produtos} podeEditar={pode("editar_produtos")} />
        </Bloco>
      </div>
      {gerenciar && <GerenciarMarcadores onClose={() => setGerenciar(false)} />}
    </div>
  );
}
