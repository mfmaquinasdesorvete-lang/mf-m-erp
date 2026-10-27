// "Ver como" (conta master): escolher um papel ou uma pessoa da equipe e usar o ERP com o menu, as telas e os botões
// dela; a faixa no alto mostra quem está sendo simulado e volta para a conta de verdade. Regras em lib/verComo.ts.
import { useQuery } from "@tanstack/react-query";
import { Eye, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PAPEIS_INTERNOS, rotuloPapel, type Papel } from "@/lib/permissoes";
import { entrarVerComo, lerVerComo, sairVerComo } from "@/lib/verComo";

type Pessoa = { user_id: string; nome: string; papel: Papel; papeis_extras: Papel[] | null; unidade_id: string | null };

/** Botões de papel e lista da equipe; ao tocar, o ERP recarrega no início daquele papel. */
export function EscolherVerComo() {
  const { data: equipe = [], error } = useQuery({
    queryKey: ["ver-como-equipe"],
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios_erp").select("user_id, nome, papel, papeis_extras, unidade_id")
        .eq("ativo", true).neq("papel", "representante").order("nome");
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
  const papeis = PAPEIS_INTERNOS.filter((p) => p.value !== "admin");
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Use o ERP como outra pessoa vê: o menu, as telas e os botões mudam. Os dados continuam os da sua conta, e salvar
        fica travado enquanto você estiver vendo como outra pessoa.
      </p>
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Por papel</p>
        <div className="flex flex-wrap gap-2">
          {papeis.map((p) => (
            <button key={p.value} type="button" title={p.descricao}
              onClick={() => entrarVerComo({ papel: p.value, extras: [], nome: p.label })}
              className="inline-flex min-h-toque items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-fg hover:border-brand/60 sm:min-h-0">
              <Eye size={15} aria-hidden /> {p.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-700">Não deu para carregar a equipe ({(error as Error).message}); os papéis acima funcionam.</p>}
      {equipe.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Por pessoa (com os papéis somados e a unidade dela)</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {equipe.map((u) => (
              <li key={u.user_id}>
                <button type="button"
                  onClick={() => entrarVerComo({ papel: u.papel, extras: u.papeis_extras ?? [], nome: u.nome, user_id: u.user_id, unidade_id: u.unidade_id })}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                  <Eye size={15} className="shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{u.nome}</span>
                  <span className="shrink-0 text-xs text-slate-500">{[u.papel, ...(u.papeis_extras ?? [])].map(rotuloPapel).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Faixa fixa no alto enquanto simula (cores fixo-*: iguais no tema claro e no escuro). */
export function FaixaVerComo() {
  const v = lerVerComo();
  if (!v) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-fixo-amber-400 px-4 py-1.5 text-sm font-semibold text-fixo-slate-900">
      <span className="inline-flex items-center gap-1.5"><Eye size={16} aria-hidden /> Vendo como {v.nome}{v.user_id ? ` (${[v.papel, ...v.extras].map(rotuloPapel).join(" · ")})` : ""} · só para ver</span>
      <button type="button" onClick={() => sairVerComo()}
        className="inline-flex items-center gap-1 rounded-md bg-fixo-slate-900 px-2.5 py-1 text-xs font-bold text-fixo-slate-100 hover:opacity-90">
        <LogOut size={14} aria-hidden /> Voltar para a minha conta
      </button>
    </div>
  );
}
