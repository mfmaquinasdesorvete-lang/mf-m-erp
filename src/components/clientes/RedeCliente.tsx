// Rede do cliente na lista e na ficha: o selo com o nome da rede (na cor da família) e, na ficha, os outros clientes
// da mesma rede, para ligar a loja que vendeu aos licenciados dela. A regra está em src/lib/redesClientes.ts.
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { useMarcadores } from "@/components/nfe/Marcadores";
import { DEMO, supabase } from "@/lib/supabase";
import { pl } from "@/lib/format";
import { COR_REDE, redesDoCliente, type RedeCliente } from "@/lib/redesClientes";
import { TAG_LICENCIADO } from "@/components/clientes/Licenciado";
import { BlocoFicha } from "@/components/clientes/BlocoFicha";

type ComRede = { marcadores?: string[] | null; tags?: string[] | null };

/** Função que diz as redes de um cliente (usa a lista de marcadores, já em cache). */
export function useRedes() {
  const { data: marcadores = [] } = useMarcadores();
  const porId = useMemo(() => new Map(marcadores.map((m) => [m.id, m])), [marcadores]);
  return useCallback((c: ComRede): RedeCliente[] =>
    redesDoCliente((c.marcadores ?? []).flatMap((id) => (porId.has(id) ? [porId.get(id)!] : [])), c.tags), [porId]);
}

export function SeloRede({ rede }: { rede: RedeCliente }) {
  const c = COR_REDE[rede.familia];
  return (
    <span title={`Rede ${rede.nome}`} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 40%, transparent)` }}>
      <Network size={12} aria-hidden /> {rede.nome}
    </span>
  );
}

export function SelosRede({ redes }: { redes: RedeCliente[] }) {
  if (!redes.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{redes.map((r) => <SeloRede key={r.nome} rede={r} />)}</div>;
}

type Vizinho = { id: string; nome: string; nome_fantasia: string | null; municipio: string | null; uf: string | null };

/** Na ficha: os outros clientes de cada rede do cliente (quem tem o mesmo marcador, ou os licenciados My Frost). */
export function ClientesDaRede({ clienteId, redes }: { clienteId: string; redes: RedeCliente[] }) {
  const { data = {} } = useQuery({
    queryKey: ["clientes_da_rede", clienteId, redes.map((r) => r.nome).join("|")],
    enabled: !DEMO && redes.length > 0,
    queryFn: async () => {
      const out: Record<string, Vizinho[]> = {};
      for (const r of redes) {
        let q = supabase.from("clientes").select("id, nome, nome_fantasia, municipio, uf").is("arquivado_em", null).neq("id", clienteId).order("nome").limit(200);
        q = r.marcadorId ? q.contains("marcadores", [r.marcadorId]) : q.contains("tags", [TAG_LICENCIADO]);
        const { data, error } = await q;
        if (error) throw error;
        out[r.nome] = (data ?? []) as Vizinho[];
      }
      return out;
    },
  });
  if (!redes.length) return null;
  return (
    <>
      {redes.map((r) => {
        const lista = data[r.nome] ?? [];
        return (
          <BlocoFicha key={r.nome} titulo={`Rede ${r.nome}`} icone={Network} cor={r.familia === "milkshake" ? "laranja" : r.familia === "acai" ? "roxo" : r.familia === "myfrost" ? "rosa" : "ciano"} n={lista.length}>
            <p className="mb-1.5 text-xs text-slate-500">
              {lista.length ? `Outros ${lista.length} ${pl(lista.length, "cliente", "clientes")} da mesma rede (pelo marcador do cadastro).` : "Nenhum outro cliente com esta rede no cadastro."}
            </p>
            {lista.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 text-sm">
                {lista.map((v) => (
                  <li key={v.id} className="rounded-lg border border-slate-200 bg-surface px-2 py-1">
                    <span className="font-semibold">{v.nome_fantasia?.trim() || v.nome}</span>
                    {(v.municipio || v.uf) && <span className="ml-1 text-xs text-slate-500">{[v.municipio, v.uf].filter(Boolean).join("/")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </BlocoFicha>
        );
      })}
    </>
  );
}
