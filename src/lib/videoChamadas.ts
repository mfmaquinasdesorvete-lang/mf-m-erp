// Painel das vídeo chamadas (Assistência → Vídeo chamadas): a agenda (hoje, próximas, sem data), para quem cada uma foi
// direcionada (técnico da OS) e o financeiro de cada técnico: valor cobrado, já recebido (Pix confirmado) e a receber.
// A garantia não cobra. OS cancelada ou excluída fica de fora.

export type OsVideo = {
  id: string; numero: number | null; status: string; atendimento?: string | null; tecnico?: string | null;
  agendado_em?: string | null; video_pago_em?: string | null; orcamento_aprovado_em?: string | null;
  em_garantia?: boolean | null; valor_mao_obra?: number | string | null; horas_tecnicas?: number | string | null;
  excluida_em?: string | null; cliente?: { nome?: string | null; whatsapp?: string | null } | null;
};

export type SituacaoVideo = "aceite" | "pix" | "agendar" | "agendada" | "feita";
export const ROTULO_SITUACAO: Record<SituacaoVideo, string> = {
  aceite: "Esperando o aceite", pix: "Esperando o Pix", agendar: "Falta marcar", agendada: "Agendada", feita: "Feita",
};

export const SEM_TECNICO = "Sem técnico";
const valor = (o: OsVideo) => (o.em_garantia ? 0 : Number(o.valor_mao_obra ?? 0) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function situacaoVideo(o: OsVideo, agora = new Date()): SituacaoVideo {
  if (["concluida", "entregue"].includes(o.status)) return "feita";
  if (!o.orcamento_aprovado_em) return "aceite";
  if (!o.video_pago_em && !o.em_garantia) return "pix";
  if (!o.agendado_em) return "agendar";
  // passou mais de 2 horas da hora marcada e a OS não foi concluída: ainda conta como agendada (o técnico conclui)
  void agora;
  return "agendada";
}

export type PorTecnico = { tecnico: string; chamadas: number; horas: number; cobrado: number; recebido: number; aReceber: number; proxima: string | null };

export function resumoVideo(os: OsVideo[], agora = new Date()) {
  const lista = os.filter((o) => o.atendimento === "video" && !o.excluida_em && o.status !== "cancelada");
  const hoje = diaLocal(agora);
  const comData = lista.filter((o) => o.agendado_em && situacaoVideo(o, agora) === "agendada");
  const deHoje = comData.filter((o) => diaLocal(new Date(o.agendado_em!)) === hoje);
  const proximas = comData.filter((o) => new Date(o.agendado_em!).getTime() >= agora.getTime() - 2 * 3600_000)
    .sort((a, b) => a.agendado_em!.localeCompare(b.agendado_em!));
  const atrasadas = comData.filter((o) => new Date(o.agendado_em!).getTime() < agora.getTime() - 2 * 3600_000);
  const pendentes = lista.filter((o) => ["aceite", "pix", "agendar"].includes(situacaoVideo(o, agora)));

  const mapa = new Map<string, PorTecnico>();
  for (const o of lista) {
    const t = (o.tecnico ?? "").trim() || SEM_TECNICO;
    const p = mapa.get(t) ?? { tecnico: t, chamadas: 0, horas: 0, cobrado: 0, recebido: 0, aReceber: 0, proxima: null };
    p.chamadas += 1;
    p.horas += Number(o.horas_tecnicas ?? 0) || 0;
    p.cobrado = r2(p.cobrado + valor(o));
    if (o.video_pago_em) p.recebido = r2(p.recebido + valor(o)); else p.aReceber = r2(p.aReceber + valor(o));
    if (o.agendado_em && situacaoVideo(o, agora) === "agendada" && new Date(o.agendado_em).getTime() >= agora.getTime() - 2 * 3600_000
      && (!p.proxima || o.agendado_em < p.proxima)) p.proxima = o.agendado_em;
    mapa.set(t, p);
  }
  const porTecnico = [...mapa.values()].sort((a, b) => (a.tecnico === SEM_TECNICO ? 1 : b.tecnico === SEM_TECNICO ? -1 : b.cobrado - a.cobrado || a.tecnico.localeCompare(b.tecnico)));

  return {
    total: lista.length, hoje: deHoje.length, proximas, atrasadas, pendentes,
    recebido: r2(lista.reduce((s, o) => s + (o.video_pago_em ? valor(o) : 0), 0)),
    aReceber: r2(lista.reduce((s, o) => s + (o.video_pago_em ? 0 : valor(o)), 0)),
    porTecnico,
  };
}
