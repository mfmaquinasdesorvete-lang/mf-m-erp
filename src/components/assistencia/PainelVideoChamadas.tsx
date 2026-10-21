// Assistência → Vídeo chamadas: a agenda (hoje, próximas, atrasadas e as que faltam aceite/Pix/data), para quem cada
// uma foi direcionada (técnico da OS) e o financeiro de cada técnico (cobrado, recebido e a receber).
import { AlertTriangle, CalendarClock, CircleDollarSign, Clock, MessageCircle, Video, Wallet } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { brl, pl, whatsappLink } from "@/lib/format";
import { quandoAgendado } from "@/lib/osVideo";
import { ROTULO_SITUACAO, resumoVideo, situacaoVideo, type OsVideo } from "@/lib/videoChamadas";

const COR_SITUACAO = {
  aceite: "bg-slate-100 text-slate-700", pix: "bg-amber-100 text-amber-800", agendar: "bg-sky-100 text-sky-800",
  agendada: "bg-purple-100 text-purple-800", feita: "bg-emerald-100 text-emerald-800",
} as const;

export function PainelVideoChamadas<T extends OsVideo>({ ordens, onAbrir }: { ordens: T[]; onAbrir: (o: T) => void }) {
  const agora = new Date();
  const r = resumoVideo(ordens, agora);
  const horas = (h: number) => `${String(Math.round(h * 10) / 10).replace(".", ",")} h`;

  const linha = (o: T, destaque?: string) => {
    const s = situacaoVideo(o, agora);
    const zap = o.cliente?.whatsapp ? whatsappLink(o.cliente.whatsapp, `Olá ${(o.cliente.nome ?? "").split(" ")[0]}! Sobre a vídeo chamada da OS #${o.numero}${o.agendado_em ? `, marcada para ${quandoAgendado(o.agendado_em)}` : ""}.`) : null;
    return (
      <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
        <button type="button" onClick={() => onAbrir(o)} className="min-w-0 flex-1 basis-56 text-left hover:underline">
          <span className="font-semibold text-fg">#{o.numero} · {o.cliente?.nome ?? "—"}</span>
          <span className="block text-xs text-slate-600">
            {o.agendado_em ? <b className={destaque ?? "text-purple-800"}>{quandoAgendado(o.agendado_em)}</b> : "sem data"}
            {" · "}{(o.tecnico ?? "").trim() || <span className="font-semibold text-amber-700">sem técnico</span>}
            {o.horas_tecnicas ? ` · ${horas(Number(o.horas_tecnicas))}` : ""}
          </span>
        </button>
        <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR_SITUACAO[s]}`}>{ROTULO_SITUACAO[s]}</span>
        <span className="num w-24 text-right font-semibold text-fg">{o.em_garantia ? "garantia" : brl(Number(o.valor_mao_obra ?? 0))}</span>
        {zap && <a href={zap} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${o.cliente?.nome ?? "cliente"}`} className="rounded-lg border border-emerald-300 p-1.5 text-emerald-700 hover:bg-emerald-50"><MessageCircle size={15} /></a>}
      </li>
    );
  };

  if (!r.total) {
    return (
      <Card className="p-6 text-center">
        <Video className="mx-auto mb-2 text-purple-600" size={28} aria-hidden />
        <p className="font-semibold text-fg">Nenhuma vídeo chamada ainda</p>
        <p className="mt-1 text-sm text-slate-600">Abra uma OS e escolha <b>Vídeo chamada</b> no tipo de atendimento. Ela aparece aqui com a data, o técnico e o pagamento.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={Video} tom="info" label="Hoje" valor={r.hoje} sub={`${r.proximas.length} ${pl(r.proximas.length, "marcada", "marcadas")} daqui pra frente`} />
        <Stat icon={Clock} tom={r.pendentes.length ? "atencao" : "neutro"} label="Falta aceite, Pix ou data" valor={r.pendentes.length} />
        <Stat icon={AlertTriangle} tom={r.atrasadas.length ? "critico" : "bom"} label="Passou da hora" valor={r.atrasadas.length} sub="marcada e a OS não foi concluída" />
        <Stat icon={Wallet} tom="bom" label="Recebido" valor={brl(r.recebido)} sub="Pix confirmado" />
        <Stat icon={CircleDollarSign} tom={r.aReceber ? "atencao" : "neutro"} label="A receber" valor={brl(r.aReceber)} sub="ainda sem Pix" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <CalendarClock size={18} className="text-purple-700" aria-hidden />
          <h2 className="font-bold text-fg">Agenda das vídeo chamadas</h2>
        </div>
        {r.atrasadas.length > 0 && <><p className="bg-red-50 px-4 py-1.5 text-xs font-bold text-red-800">Passou da hora — concluir a OS ou remarcar</p><ul className="divide-y divide-slate-100">{(r.atrasadas as T[]).map((o) => linha(o, "text-red-700"))}</ul></>}
        <p className="bg-slate-50 px-4 py-1.5 text-xs font-bold text-slate-600">Próximas</p>
        {r.proximas.length ? <ul className="divide-y divide-slate-100">{(r.proximas as T[]).map((o) => linha(o))}</ul> : <p className="px-4 py-3 text-sm text-slate-500">Nenhuma marcada.</p>}
        {r.pendentes.length > 0 && <><p className="bg-slate-50 px-4 py-1.5 text-xs font-bold text-slate-600">Antes de marcar (aceite, Pix ou data)</p><ul className="divide-y divide-slate-100">{(r.pendentes as T[]).map((o) => linha(o))}</ul></>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-bold text-fg">Por técnico: para quem foi e o financeiro</h2>
          <p className="text-xs text-slate-600">Cobrado = mão de obra das vídeo chamadas (garantia não cobra). Recebido = Pix confirmado na OS.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="tabela w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th scope="col" className="th">Técnico</th><th scope="col" className="th text-right">Chamadas</th><th scope="col" className="th text-right">Horas</th>
              <th scope="col" className="th text-right">Cobrado</th><th scope="col" className="th text-right">Recebido</th><th scope="col" className="th text-right">A receber</th>
              <th scope="col" className="th">Próxima</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {r.porTecnico.map((t) => (
                <tr key={t.tecnico}>
                  <td className="td font-semibold" data-label="Técnico">{t.tecnico}</td>
                  <td className="td num text-right" data-label="Chamadas">{t.chamadas}</td>
                  <td className="td num text-right" data-label="Horas">{horas(t.horas)}</td>
                  <td className="td num text-right" data-label="Cobrado">{brl(t.cobrado)}</td>
                  <td className="td num text-right font-semibold text-emerald-700" data-label="Recebido">{brl(t.recebido)}</td>
                  <td className={`td num text-right ${t.aReceber ? "font-semibold text-amber-700" : "text-slate-500"}`} data-label="A receber">{brl(t.aReceber)}</td>
                  <td className="td text-xs" data-label="Próxima">{t.proxima ? quandoAgendado(t.proxima) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
