// Aba "Marcadores" da nota de fornecedor: põe ou tira marcadores (tags) nos produtos da nota, um a um ou em lote,
// com o mesmo cadastro de marcadores do ERP.
import { useState } from "react";
import { Tags } from "lucide-react";
import { Button } from "@/components/ui";
import { pl } from "@/lib/format";
import { AplicarMarcadores, BotaoMarcadores, ChipsMarcadores, useMarcadores } from "../Marcadores";
import type { DadosNota } from "./useNotaFornecedor";

export function MarcadoresNota({ d, podeEditar }: { d: DadosNota; podeEditar: boolean }) {
  const { data: todos = [] } = useMarcadores();
  const ids = [...new Set(d.linhas.map((l) => l.produto_id).filter(Boolean) as string[])];
  const produtos = ids.map((id) => d.porId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(ids));
  const [aberto, setAberto] = useState(false);
  const escolhidos = produtos.filter((p) => marcados.has(p.id));
  const todosMarcados = produtos.length > 0 && produtos.every((p) => marcados.has(p.id));

  if (!produtos.length) return <p className="text-sm text-slate-500">Ligue os itens aos produtos (aba Itens e custos) para pôr marcadores.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Marcadores nos produtos da nota (ex.: "reposição rápida", "importado"). São os mesmos do cadastro de produtos.</p>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(produtos.map((p) => p.id)))} /> Marcar todos
          </label>
          <span className="flex-1" />
          <Button type="button" disabled={!escolhidos.length} onClick={() => setAberto(true)}>
            <Tags size={15} /> Marcadores de {escolhidos.length} {pl(escolhidos.length, "produto", "produtos")}
          </Button>
        </div>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {produtos.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-2">
            {podeEditar && <input type="checkbox" aria-label={`Marcar ${p.descricao}`} checked={marcados.has(p.id)}
              onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">{p.descricao}</span>
              <ChipsMarcadores ids={p.marcadores} todos={todos} pequeno />
            </span>
            {podeEditar && <BotaoMarcadores tabela="produtos" registro={p} nome={["produto", "produtos"]} />}
          </li>
        ))}
      </ul>
      {aberto && <AplicarMarcadores tabela="produtos" notas={escolhidos} nome={["produto", "produtos"]} onClose={() => setAberto(false)} />}
    </div>
  );
}
