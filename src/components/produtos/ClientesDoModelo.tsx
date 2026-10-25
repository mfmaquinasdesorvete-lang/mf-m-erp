// Máquinas → "N clientes" do modelo (pedido de 25/10): a lista de quem tem aquele modelo, com cidade, nº de série e
// garantia. Tocar no cliente abre a ficha dele. Serve aos modelos do cadastro (produto_id) e aos antigos da My Frost
// (sem produto: pela descrição da máquina).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui";
import { FichaCliente } from "@/components/FichaCliente";
import { supabase } from "@/lib/supabase";
import { dataBR, hoje, pl } from "@/lib/format";
import { normalizar } from "@/lib/buscaCliente";
import { notifyError } from "@/lib/notify";
import type { Cliente } from "@/lib/types";

type Linha = {
  id: string; numero_serie: string | null; garantia_ate: string | null; data_venda: string | null; origem: string | null;
  cliente: { id: string; nome: string; nome_fantasia: string | null; municipio: string | null; uf: string | null } | null;
};

export function ClientesDoModelo({ modelo, onClose }: { modelo: { titulo: string; produtoId?: string; descricao?: string }; onClose: () => void }) {
  const dia = hoje();
  const [busca, setBusca] = useState("");
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["equipamentos", "clientes_do_modelo", modelo.produtoId ?? modelo.descricao],
    queryFn: async () => {
      const linhas: Linha[] = [];
      for (let de = 0; ; de += 1000) {
        let q = supabase.from("equipamentos")
          .select("id, numero_serie, garantia_ate, data_venda, origem, cliente:clientes(id, nome, nome_fantasia, municipio, uf)").range(de, de + 999);
        q = modelo.produtoId ? q.eq("produto_id", modelo.produtoId) : q.is("produto_id", null).eq("descricao", modelo.descricao ?? "");
        const { data, error } = await q;
        if (error) throw error;
        linhas.push(...((data ?? []) as unknown as Linha[]));
        if (!data || data.length < 1000) break;
      }
      return linhas;
    },
  });
  // um cliente com várias máquinas do modelo aparece uma vez, com todas as séries
  const clientes = useMemo(() => {
    const m = new Map<string, { cliente: NonNullable<Linha["cliente"]>; maquinas: Linha[] }>();
    for (const l of data) {
      if (!l.cliente) continue;
      const g = m.get(l.cliente.id) ?? { cliente: l.cliente, maquinas: [] };
      g.maquinas.push(l);
      m.set(l.cliente.id, g);
    }
    return [...m.values()].sort((a, b) => (a.cliente.nome_fantasia || a.cliente.nome).localeCompare(b.cliente.nome_fantasia || b.cliente.nome, "pt-BR"));
  }, [data]);
  const termo = normalizar(busca);
  const lista = termo ? clientes.filter((g) => normalizar([g.cliente.nome, g.cliente.nome_fantasia, g.cliente.municipio, g.cliente.uf, ...g.maquinas.map((x) => x.numero_serie)].join(" ")).includes(termo)) : clientes;

  async function abrir(id: string) {
    const { data, error } = await supabase.from("clientes").select("*").eq("id", id).single();
    if (error) return notifyError(error);
    setFicha(data as Cliente);
  }

  return (
    <>
      <Modal open wide onClose={onClose} title={`Clientes com ${modelo.titulo}`}>
        <p className="mb-3 text-sm text-slate-600">
          {isLoading ? "Carregando…" : `${clientes.length} ${pl(clientes.length, "cliente", "clientes")} · ${data.length} ${pl(data.length, "máquina", "máquinas")}`}
        </p>
        {clientes.length > 8 && (
          <div className="relative mb-3">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input h-10 pl-9" type="search" placeholder="Buscar cliente, cidade ou nº de série…" aria-label="Buscar cliente, cidade ou nº de série"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        )}
        {error ? <p className="text-sm text-red-700">Não deu para carregar: {(error as Error).message}</p> : (
          <ul className="divide-y divide-slate-100">
            {lista.map(({ cliente: c, maquinas }) => {
              const garantia = maquinas.filter((x) => x.garantia_ate && x.garantia_ate >= dia).length;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => abrir(c.id)} className="flex w-full items-start gap-2 rounded-lg px-1 py-2.5 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <b className="block text-fg [overflow-wrap:anywhere]">{c.nome_fantasia?.trim() || c.nome}</b>
                      <span className="block text-xs text-slate-500">
                        {[[c.municipio, c.uf].filter(Boolean).join("/"), maquinas.length > 1 ? `${maquinas.length} máquinas` : null,
                          maquinas.map((x) => x.numero_serie).filter(Boolean).join(", ") && `série ${maquinas.map((x) => x.numero_serie).filter(Boolean).join(", ")}`,
                          maquinas[0]?.data_venda ? `desde ${dataBR(maquinas[0].data_venda)}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {garantia > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-2xs font-semibold text-violet-800"><ShieldCheck size={10} aria-hidden /> em garantia</span>}
                  </button>
                </li>
              );
            })}
            {!isLoading && !lista.length && <li className="py-4 text-center text-sm text-slate-500">Nenhum cliente encontrado.</li>}
          </ul>
        )}
      </Modal>
      {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
    </>
  );
}
