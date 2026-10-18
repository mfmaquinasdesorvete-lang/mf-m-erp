// Busca geral no campo "Buscar" do menu: além das telas, acha clientes, vendas, notas, produtos, OS e fornecedores
// (função busca_geral no banco, com as permissões de quem busca). Tocar no resultado abre o registro na tela dele.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Boxes, FileText, ShoppingCart, Store, Users, Wrench, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useVisivel } from "@/lib/menu";
import { brl } from "@/lib/format";
import type { Tela } from "@/lib/permissoes";

export type Achado = { tipo: "cliente" | "venda" | "nota" | "produto" | "os" | "fornecedor"; id: string; titulo: string; sub?: string | null; valor?: number | null };

// para onde cada tipo leva (a tela abre só com ele em destaque e já mostra o cadastro ou o documento)
const DESTINO: Record<Achado["tipo"], { to: string; tela: Tela; icone: LucideIcon; rotulo: string; abrir?: boolean }> = {
  cliente: { to: "/clientes", tela: "clientes", icone: Users, rotulo: "Cliente" },
  venda: { to: "/pedidos", tela: "pedidos", icone: ShoppingCart, rotulo: "Venda", abrir: true },
  nota: { to: "/notas", tela: "notas", icone: FileText, rotulo: "Nota fiscal" },
  produto: { to: "/estoque", tela: "estoque", icone: Boxes, rotulo: "Produto" },
  os: { to: "/assistencia", tela: "assistencia", icone: Wrench, rotulo: "OS", abrir: true },
  fornecedor: { to: "/fornecedores", tela: "fornecedores", icone: Store, rotulo: "Fornecedor" },
};

// situações e tipos como aparecem no banco → como a pessoa lê
const PALAVRA: Record<string, string> = {
  orcamento: "orçamento", aprovado: "aprovado", faturado: "faturado", entregue: "entregue", cancelado: "cancelado", separando: "separando",
  peca: "peça", insumo: "componente", maquina: "máquina", servico: "serviço", acessorio: "acessório",
  aberta: "aberta", em_andamento: "em andamento", aguardando_peca: "aguardando peça", concluida: "pronta", cancelada: "cancelada",
  autorizada: "autorizada", rejeitada: "rejeitada", processando: "processando", erro: "com erro", contingencia: "contingência",
};
const legivel = (sub?: string | null) => (sub ?? "").split(" · ").map((p) => PALAVRA[p] ?? p.replace(/_/g, " ")).join(" · ");

/** Espera a pessoa parar de digitar (não consulta a cada letra). */
function useAtrasado(valor: string, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

export function ResultadosBusca({ termo, onIr }: { termo: string; onIr: () => void }) {
  const navigate = useNavigate();
  const vis = useVisivel();
  const t = useAtrasado(termo.trim());
  const { data = [], isFetching } = useQuery({
    queryKey: ["busca_geral", t],
    enabled: t.length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("busca_geral", { p_termo: t, p_limite: 5 });
      if (error) throw error;
      return (data ?? []) as Achado[];
    },
  });
  const achados = data.filter((a) => DESTINO[a.tipo] && vis.ve(DESTINO[a.tipo].tela, DESTINO[a.tipo].to));
  if (t.length < 2) return null;

  const ir = (a: Achado) => {
    const d = DESTINO[a.tipo];
    onIr();
    navigate(d.to, { state: d.abrir ? { abrir: a.id } : { destaque: { ids: [a.id], titulo: `${d.rotulo}: ${a.titulo}`, origem: "Busca" } } });
  };

  return (
    <section className="mb-2 rounded-xl border border-white/15 bg-white/[0.04] px-1.5 pb-2 pt-1" aria-live="polite">
      <h2 className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-nav-fraco">
        Cadastros e documentos{isFetching ? " · buscando…" : ""}
      </h2>
      {!achados.length && !isFetching && <p className="px-2 pb-1 text-sm text-nav-fraco">Nenhum cliente, venda, nota, produto, OS ou fornecedor com "{t}".</p>}
      {achados.map((a) => {
        const d = DESTINO[a.tipo];
        const Icone = d.icone;
        return (
          <button key={`${a.tipo}-${a.id}`} type="button" onClick={() => ir(a)}
            className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5">
            <Icone size={18} className="mt-0.5 shrink-0 text-nav-fraco" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{a.titulo}</span>
              <span className="block truncate text-xs text-nav-fraco">
                {d.rotulo}{a.sub ? ` · ${legivel(a.sub)}` : ""}{a.valor != null ? ` · ${brl(a.valor)}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
