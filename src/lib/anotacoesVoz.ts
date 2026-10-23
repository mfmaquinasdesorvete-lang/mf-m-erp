// Anotar por voz (botão do microfone): os tipos de anotação, a tela que a pessoa precisa ver para anotar cada tipo
// e o reconhecimento de fala do navegador (Chrome no Android, Safari no iPhone/iPad), em português.
import type { Tela } from "./permissoes";

export type TipoVoz = "pagamento_video" | "coleta" | "etapa_montagem" | "material_recebido" | "conserto" | "lembrete" | "giga_ok" | "outro";
export type SituacaoVoz = "pendente" | "conferido" | "nao_achei";

export type AnotacaoVoz = {
  id: number; criado_em: string; criado_por: string; criado_por_nome: string | null; fala: string; tipo: TipoVoz; resumo: string;
  ref_tabela: string | null; ref_id: string | null; ref_rotulo: string | null; link: string | null; valor: number | null;
  para_user_id: string | null; situacao: SituacaoVoz; conferido_por: string | null; conferido_por_nome: string | null;
  conferido_em: string | null; resposta: string | null; escalada_em: string | null;
};

/** O que a IA entendeu (função ia-voz) e os registros do ERP que combinam com a fala. */
export type EntendidoVoz = {
  tipo: TipoVoz; resumo: string; cliente: string | null; numero_os: number | null; numero_pedido: number | null; numero_op: number | null;
  numero_serie: string | null; transportadora: string | null; fornecedor: string | null; pessoa: string | null; valor: number | null; falta: string | null;
};
export type CandidatoVoz = { tabela: string; id: string; rotulo: string; detalhe: string | null; link: string; valor: number | null };
export type RespostaVoz = { entendido: EntendidoVoz; candidatos: CandidatoVoz[]; pessoas: { id: string; nome: string }[] };

export const TIPOS: Record<TipoVoz, { rotulo: string; emoji: string; tela: Tela | null; link: string | null }> = {
  pagamento_video: { rotulo: "Pagamento de vídeo chamada", emoji: "💰", tela: "assistencia", link: "/assistencia" },
  coleta: { rotulo: "Coleta da transportadora", emoji: "🚚", tela: "fretes", link: "/fretes" },
  etapa_montagem: { rotulo: "Etapa da montagem", emoji: "🔧", tela: "producao", link: "/producao" },
  material_recebido: { rotulo: "Material recebido", emoji: "📦", tela: "producao", link: "/compras" },
  conserto: { rotulo: "Máquina para conserto", emoji: "🛠️", tela: "assistencia", link: "/assistencia" },
  lembrete: { rotulo: "Lembrete", emoji: "📝", tela: null, link: null },
  giga_ok: { rotulo: "Ok do teste do giga", emoji: "✅", tela: "testegiga", link: "/teste-giga" },
  outro: { rotulo: "Anotação", emoji: "🎤", tela: null, link: null },
};
export const ORDEM_TIPOS = Object.keys(TIPOS) as TipoVoz[];

export const ROTULO_SITUACAO: Record<SituacaoVoz, string> = { pendente: "Para conferir", conferido: "Conferido", nao_achei: "Não achei" };

/** Tipos que a pessoa pode anotar: os das telas que ela vê (lembrete e "outro" todo mundo anota). */
export const tiposPermitidos = (ve: (t: Tela) => boolean) => ORDEM_TIPOS.filter((t) => !TIPOS[t].tela || ve(TIPOS[t].tela!));

/** Pessoa citada no lembrete: o nome falado contra a equipe, sem acento e sem maiúsculas (primeiro nome basta). */
export function acharPessoa(falado: string | null | undefined, equipe: { id: string; nome: string }[]) {
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const alvo = sem(falado ?? "");
  if (alvo.length < 3) return null;
  return equipe.find((p) => sem(p.nome) === alvo)
    ?? equipe.find((p) => sem(p.nome).split(/\s+/)[0] === alvo.split(/\s+/)[0])
    ?? equipe.find((p) => sem(p.nome).includes(alvo))
    ?? null;
}

/** Anotação parada: mais de 2 dias para conferir. */
export const parada = (a: Pick<AnotacaoVoz, "situacao" | "criado_em">, agora = Date.now()) =>
  a.situacao === "pendente" && agora - new Date(a.criado_em).getTime() > 2 * 864e5;

// --- reconhecimento de fala do navegador -------------------------------------------------------------------------
type Reconhecedor = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
};

export function suportaVoz() {
  return typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Abre o microfone em português; devolve o texto parcial enquanto fala e o final ao parar. */
export function ouvir(cb: { parcial: (t: string) => void; fim: (t: string) => void; erro: (msg: string) => void }) {
  const Classe = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const r: Reconhecedor = new Classe();
  r.lang = "pt-BR"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
  let final = "";
  let parcial = "";
  r.onresult = (e: any) => {
    parcial = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += `${t} `; else parcial += t;
    }
    cb.parcial(`${final}${parcial}`.trim());
  };
  r.onerror = (e: any) => {
    const msg = e?.error === "not-allowed" || e?.error === "service-not-allowed"
      ? "O microfone está bloqueado: libere o microfone para este site nas configurações do navegador."
      : e?.error === "no-speech" ? "Não ouvi nada: aperte e fale de novo." : e?.error === "network" ? "Sem internet para entender a fala: tente de novo." : "";
    if (msg) cb.erro(msg);
  };
  r.onend = () => cb.fim(`${final}${parcial}`.trim());
  r.start();
  return { parar: () => r.stop(), cancelar: () => { r.onend = null; r.abort(); } };
}
