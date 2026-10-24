// Equipe online (24/10, pedido da usuária): no alto do Início, só na conta master, uma fila de bolinhas pequenas com a
// equipe — ponto verde para quem está com o ERP aberto agora e há quanto tempo; cinza para quem saiu e há quanto tempo.
// Usa o mesmo registro de acessos de Usuários → Acessos (sinal a cada 5 minutos; sem sinal há 10 minutos = saiu).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FotoUsuario } from "@/components/FotoUsuario";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { minutosTexto, online, type Acesso } from "@/lib/acessos";

type Pessoa = { user_id: string; nome: string; foto: string | null; ativo: boolean };

/** "1h20", "5 min", "2 dias" */
function tempo(min: number) {
  if (min >= 48 * 60) return `${Math.floor(min / (24 * 60))} dias`;
  if (min >= 24 * 60) return "1 dia";
  return minutosTexto(min);
}

export function EquipeOnline() {
  const { user_id } = usePerfil();
  const navigate = useNavigate();
  const { data: pessoas = [] } = useQuery({
    queryKey: ["usuarios_erp", "equipe-online"],
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios_erp").select("user_id, nome, foto, ativo").eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
  const desde = useMemo(() => new Date(Date.now() - 7 * 864e5).toISOString(), []);
  // a cada minuto busca de novo: quem entrou ou saiu aparece sem recarregar a tela
  const { data: acessos = [] } = useQuery({
    queryKey: ["acessos_usuarios", "equipe-online", desde],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("acessos_usuarios").select("user_id, entrou_em, ultimo_sinal_em, saiu_em, dispositivo")
        .gte("ultimo_sinal_em", desde).order("entrou_em", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Acesso[];
    },
  });

  const agora = Date.now();
  const lista = pessoas.filter((p) => p.user_id !== user_id).map((p) => {
    const meus = acessos.filter((a) => a.user_id === p.user_id);
    const aberto = meus.find((a) => online(a, agora));
    const ultimo = meus.reduce<string | null>((m, a) => { const fim = a.saiu_em ?? a.ultimo_sinal_em; return !m || fim > m ? fim : m; }, null);
    const min = aberto ? Math.round((agora - new Date(aberto.entrou_em).getTime()) / 60_000)
      : ultimo ? Math.round((agora - new Date(ultimo).getTime()) / 60_000) : null;
    return { ...p, on: !!aberto, min, dispositivo: aberto?.dispositivo ?? null };
  }).sort((a, b) => Number(b.on) - Number(a.on) || (a.min ?? 1e9) - (b.min ?? 1e9));
  if (!lista.length) return null;
  const qtd = lista.filter((p) => p.on).length;

  return (
    <section aria-label="Equipe online" className="mb-3 flex items-center gap-2">
      <span className="shrink-0 text-2xs font-semibold text-slate-500"><span className="num text-fixo-emerald-500">{qtd}</span> online</span>
      <ul className="-my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lista.map((p) => {
          const primeiro = p.nome.split(" ")[0];
          const quando = p.min == null ? "sem acesso" : p.on ? `on há ${tempo(p.min)}` : `saiu há ${tempo(p.min)}`;
          return (
            <li key={p.user_id} className="shrink-0">
              <button type="button" onClick={() => navigate("/usuarios")}
                title={`${p.nome}: ${p.on ? `online há ${p.min != null ? tempo(p.min) : "—"}${p.dispositivo ? ` · ${p.dispositivo}` : ""}` : p.min == null ? "nunca entrou" : `saiu há ${tempo(p.min)}`}`}
                aria-label={`${p.nome}, ${p.on ? "online" : "offline"}, ${quando}`}
                className={`botao-toque flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 transition hover:bg-slate-50 ${p.on ? "border-emerald-200 bg-surface" : "border-slate-200 bg-surface opacity-70"}`}>
                <span className="relative">
                  <FotoUsuario nome={p.nome} foto={p.foto} tamanho={22} className="bg-slate-200 text-slate-600" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${p.on ? "bg-fixo-emerald-500" : "bg-fixo-slate-400"}`} aria-hidden />
                </span>
                <span className="text-2xs font-semibold leading-tight text-slate-700">{primeiro}</span>
                <span className={`num text-2xs leading-tight ${p.on ? "text-emerald-700" : "text-slate-500"}`}>{p.min == null ? "—" : tempo(p.min)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
