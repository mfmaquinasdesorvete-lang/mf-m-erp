// Acessos ao ERP (Usuários → topo): de que aparelho e navegador a pessoa entrou, quem está usando agora e quanto tempo
// cada entrada durou. O banco grava a entrada e o último sinal (registrar_acesso, a cada 5 minutos com a tela aberta).

export type Acesso = {
  id: number; user_id: string; nome: string | null; entrou_em: string; ultimo_sinal_em: string;
  dispositivo: string | null; navegador: string | null; ip: string | null;
  /** Hora em que apertou Sair (vazio: fechou a tela sem sair ou ainda está usando). */
  saiu_em?: string | null;
  /** Minutos com o ERP aberto sem mexer (ou com a tela escondida). */
  minutos_inativo?: number | null;
};

/** Sem sinal há mais que isto: a pessoa já saiu (o sinal vem a cada 5 minutos). */
export const MINUTOS_ONLINE = 10;

/** "Celular · iPhone" / "Computador · Windows" e "Safari" / "Chrome", a partir do navegador. */
export function descreverAparelho(ua: string): { dispositivo: string; navegador: string } {
  const u = ua || "";
  const sistema = /iPhone/i.test(u) ? "iPhone" : /iPad/i.test(u) ? "iPad" : /Android/i.test(u) ? "Android"
    : /Windows/i.test(u) ? "Windows" : /Mac OS X|Macintosh/i.test(u) ? "Mac" : /Linux/i.test(u) ? "Linux" : "outro";
  const tipo = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u)) ? "Tablet"
    : /iPhone|Mobile|Android/i.test(u) ? "Celular" : "Computador";
  const navegador = /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera" : /SamsungBrowser/.test(u) ? "Samsung Internet"
    : /CriOS|Chrome\//.test(u) ? "Chrome" : /FxiOS|Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "outro";
  return { dispositivo: `${tipo} · ${sistema}`, navegador };
}

/** Está com o ERP aberto agora (sinal nos últimos minutos). */
export const online = (a: Pick<Acesso, "ultimo_sinal_em" | "saiu_em">, agora = Date.now()) =>
  !a.saiu_em && agora - new Date(a.ultimo_sinal_em).getTime() <= MINUTOS_ONLINE * 60_000;

/** Minutos em texto: "5 min", "1h28", "menos de 1 min". */
export function minutosTexto(min: number) {
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

/** Quanto tempo a entrada durou: "5 min", "1h28", "menos de 1 min". */
export function duracao(a: Pick<Acesso, "entrou_em" | "ultimo_sinal_em">) {
  return minutosTexto(Math.round((new Date(a.ultimo_sinal_em).getTime() - new Date(a.entrou_em).getTime()) / 60_000));
}

/** Tempo parado da entrada (nunca mais que a duração): 0 quando não ficou parado. */
export function minutosParado(a: Pick<Acesso, "entrou_em" | "ultimo_sinal_em" | "minutos_inativo">, ate = a.ultimo_sinal_em) {
  const total = Math.round((new Date(ate).getTime() - new Date(a.entrou_em).getTime()) / 60_000);
  return Math.max(0, Math.min(Number(a.minutos_inativo ?? 0), total));
}

const BRASILIA = { timeZone: "America/Sao_Paulo" } as const;
const diaBr = (d: Date) => d.toLocaleDateString("pt-BR", BRASILIA);

/** "hoje às 08:12", "ontem às 17:40", "12/10 às 09:05" (horário de Brasília). */
export function quandoAcesso(iso: string, agora = new Date()) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { ...BRASILIA, hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(agora.getTime() - 864e5);
  if (diaBr(d) === diaBr(agora)) return `hoje às ${hora}`;
  if (diaBr(d) === diaBr(ontem)) return `ontem às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { ...BRASILIA, day: "2-digit", month: "2-digit" })} às ${hora}`;
}

/** Último sinal de cada pessoa (para a lista de usuários). */
export function ultimoPorPessoa(acessos: Acesso[]) {
  const m = new Map<string, string>();
  for (const a of acessos) if (!m.has(a.user_id) || a.ultimo_sinal_em > m.get(a.user_id)!) m.set(a.user_id, a.ultimo_sinal_em);
  return m;
}
