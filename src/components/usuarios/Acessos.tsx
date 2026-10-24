// Usuários → topo: quem está usando o ERP agora e o registro dos acessos (data e hora de entrada, até quando ficou,
// aparelho, navegador e endereço de internet), no mesmo jeito do "Rodada atual" e do registro das execuções do Monitor.
// Só o administrador vê os acessos de todos (regra do banco).
import { useMemo, useState } from "react";
import { Activity, CalendarClock, LogIn, Monitor, Smartphone, UserX, Wifi } from "lucide-react";
import { Card, Stat, chip } from "@/components/ui";
import { FotoUsuario } from "@/components/FotoUsuario";
import { useRows } from "@/lib/data";
import { pl } from "@/lib/format";
import { duracao, minutosParado, minutosTexto, online, quandoAcesso, type Acesso } from "@/lib/acessos";

type Pessoa = { user_id: string; nome: string; ativo: boolean; ultimo_acesso: string | null };
type Periodo = "hoje" | "7" | "30";
const PERIODOS: { v: Periodo; rotulo: string; dias: number }[] = [
  { v: "hoje", rotulo: "Hoje", dias: 0 }, { v: "7", rotulo: "7 dias", dias: 7 }, { v: "30", rotulo: "30 dias", dias: 30 },
];
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function PainelAcessos({ usuarios, fotos, ultimo }: { usuarios: Pessoa[]; fotos?: Map<string, string>; ultimo: Map<string, string> }) {
  const desde = useMemo(() => new Date(Date.now() - 31 * 864e5).toISOString(), []);
  const { data: acessos = [], isLoading } = useRows<Acesso>("acessos_usuarios", {
    order: "entrou_em", ascending: false, key: ["30dias"], filtro: (q) => q.gte("entrou_em", desde).limit(2000),
  });
  const [pessoa, setPessoa] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("7");
  const [mais, setMais] = useState(false);

  const agora = Date.now();
  const hoje0 = inicioDoDia();
  const agoraOnline = acessos.filter((a) => online(a, agora));
  const onlineIds = [...new Set(agoraOnline.map((a) => a.user_id))];
  const hojeIds = new Set(acessos.filter((a) => new Date(a.ultimo_sinal_em).getTime() >= hoje0).map((a) => a.user_id));
  const sete = acessos.filter((a) => new Date(a.entrou_em).getTime() >= agora - 7 * 864e5);
  const ativos = usuarios.filter((u) => u.ativo);
  const sumidos = ativos.filter((u) => { const v = ultimo.get(u.user_id) ?? u.ultimo_acesso; return !v || agora - new Date(v).getTime() > 30 * 864e5; });
  const nome = (id: string, a?: Acesso) => usuarios.find((u) => u.user_id === id)?.nome ?? a?.nome ?? "—";

  const dias = PERIODOS.find((p) => p.v === periodo)!.dias;
  const limite = dias ? agora - dias * 864e5 : hoje0;
  const doPeriodo = acessos.filter((a) => new Date(a.ultimo_sinal_em).getTime() >= limite);
  const lista = doPeriodo.filter((a) => !pessoa || a.user_id === pessoa);
  const pessoasNoPeriodo = [...new Set(doPeriodo.map((a) => a.user_id))];

  return (
    <div className="mb-4 space-y-3">
      <Card className="overflow-hidden">
        <div className="bg-fixo-teal-700 p-4 text-white sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Acessos · agora</div>
          <h2 className="text-xl font-bold [text-wrap:balance]">
            {isLoading ? "Carregando…" : onlineIds.length ? `${onlineIds.length} ${pl(onlineIds.length, "pessoa usando", "pessoas usando")} o ERP agora` : "Ninguém com o ERP aberto agora"}
          </h2>
          {onlineIds.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {onlineIds.map((id) => {
                const a = agoraOnline.find((x) => x.user_id === id)!;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-sm">
                    <span className="relative"><FotoUsuario nome={nome(id, a)} foto={fotos?.get(id)} tamanho={26} className="bg-white/30 text-white" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-fixo-teal-700" aria-hidden /></span>
                    <span className="font-semibold">{nome(id, a).split(" ")[0]}</span>
                    <span className="text-xs opacity-80">{a.dispositivo ?? ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
          <div className="bg-surface p-1"><Stat label="Agora" valor={onlineIds.length} icon={Wifi} tom={onlineIds.length ? "bom" : "neutro"} sub={`sinal nos últimos ${10} min`} /></div>
          <div className="bg-surface p-1"><Stat label="Entraram hoje" valor={hojeIds.size} icon={LogIn} sub={`de ${ativos.length} ${pl(ativos.length, "usuário ativo", "usuários ativos")}`} /></div>
          <div className="bg-surface p-1"><Stat label="Acessos em 7 dias" valor={sete.length} icon={Activity} sub={`${new Set(sete.map((a) => a.user_id)).size} ${pl(new Set(sete.map((a) => a.user_id)).size, "pessoa", "pessoas")}`} /></div>
          <div className="bg-surface p-1"><Stat label="Sem entrar há 30 dias" valor={sumidos.length} icon={UserX} tom={sumidos.length ? "atencao" : "bom"}
            sub={sumidos.length ? sumidos.slice(0, 3).map((u) => u.nome.split(" ")[0]).join(", ") + (sumidos.length > 3 ? "…" : "") : "todos ativos entraram"} /></div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <CalendarClock size={18} className="text-sky-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-fg">Registro dos acessos</h2>
            <p className="text-xs text-slate-600">Entrada, saída (Sair ou fechou a tela), tempo parado, aparelho e endereço de internet. Nada é apagado.</p>
          </div>
          <div className="inline-flex gap-1 rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.v} type="button" aria-pressed={periodo === p.v} onClick={() => setPeriodo(p.v)}
                className={chip(periodo === p.v, "border-transparent bg-modulo-escuro text-white")}>{p.rotulo}</button>
            ))}
          </div>
        </div>
        {pessoasNoPeriodo.length > 1 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3" role="group" aria-label="Pessoa">
            {["", ...pessoasNoPeriodo].map((id) => (
              <button key={id || "todos"} type="button" aria-pressed={pessoa === id} onClick={() => setPessoa(id)}
                className={chip(pessoa === id)}>
                {id ? nome(id).split(" ")[0] : "Todos"} <span className="opacity-70">{id ? doPeriodo.filter((a) => a.user_id === id).length : doPeriodo.length}</span>
              </button>
            ))}
          </div>
        )}
        {isLoading ? <p className="p-4 text-sm text-slate-500">Carregando…</p> : !lista.length ? (
          <p className="p-4 text-sm text-slate-600">Nenhum acesso {periodo === "hoje" ? "hoje" : `nos últimos ${dias} dias`}. O registro começa a contar a partir de agora.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(mais ? lista : lista.slice(0, 25)).map((a) => {
              const agoraAberto = online(a, agora);
              const Icone = /Celular|Tablet/.test(a.dispositivo ?? "") ? Smartphone : Monitor;
              const parado = minutosParado(a, agoraAberto ? new Date().toISOString() : a.ultimo_sinal_em);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <FotoUsuario nome={nome(a.user_id, a)} foto={fotos?.get(a.user_id)} tamanho={32} className="bg-slate-100 text-slate-700" />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="font-semibold text-fg">{nome(a.user_id, a)}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-600">
                      <Icone size={13} aria-hidden /> {[a.dispositivo, a.navegador].filter(Boolean).join(" · ") || "aparelho não informado"}
                      {a.ip && <span className="font-mono text-slate-500">· {a.ip}</span>}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold text-fg">entrou {quandoAcesso(a.entrou_em)}</div>
                    <div className={agoraAberto ? "font-semibold text-emerald-700" : a.saiu_em ? "text-slate-600" : "text-slate-500"}>
                      {agoraAberto ? `usando agora · ${duracao({ entrou_em: a.entrou_em, ultimo_sinal_em: new Date().toISOString() })}`
                        : `${a.saiu_em ? "saiu às" : "fechou às"} ${hora(a.saiu_em ?? a.ultimo_sinal_em)} · ${duracao(a)}`}
                    </div>
                    {parado > 0 && (
                      <div className={parado >= 15 ? "font-semibold text-amber-700" : "text-slate-500"} title="Tempo com o ERP aberto sem mexer no mouse, teclado ou tela (ou com a tela escondida)">
                        parado {minutosTexto(parado)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {lista.length > 25 && !mais && (
          <button type="button" onClick={() => setMais(true)} className="link-acao w-full border-t border-slate-100 p-3 text-sm hover:bg-slate-50">Ver todos os {lista.length} acessos</button>
        )}
      </Card>
    </div>
  );
}
