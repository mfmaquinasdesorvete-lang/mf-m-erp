// Login com o rosto (pedido #103): administrador e financeiro confirmam a entrada com o rosto ou a digital do celular
// ou do computador — a segunda etapa WebAuthn do Supabase, que deixa a sessão em "aal2". O banco confere a mesma coisa
// (rosto_ok em is_erp_user e tem_papel) a partir de configuracoes.rosto_obrigatorio_em.
import { DEMO, supabase } from "./supabase";

export type FatorRosto = { id: string; nome: string; criado: string };
export type SituacaoRosto = {
  /** este usuário usa o rosto (administrador ou financeiro) */
  exige: boolean;
  /** a partir de quando sem o rosto não entra (null: ainda só convite) */
  obrigatorioEm: string | null;
  fatores: FatorRosto[];
  /** a entrada de agora já foi confirmada com o rosto */
  confirmado: boolean;
};

export const usaRosto = (papel: string, extras?: string[] | null) =>
  papel === "admin" || papel === "financeiro" || (extras ?? []).includes("financeiro");

export const rostoObrigatorio = (s: Pick<SituacaoRosto, "obrigatorioEm">, agora = new Date()) =>
  !!s.obrigatorioEm && new Date(s.obrigatorioEm) <= agora;

/** Os rostos (aparelhos) cadastrados e se a entrada de agora já passou por um deles. */
export async function situacaoRosto(): Promise<SituacaoRosto> {
  if (DEMO) return { exige: false, obrigatorioEm: null, fatores: [], confirmado: true };
  const [{ data: meu }, { data: lista }, { data: nivel }] = await Promise.all([
    supabase.rpc("meu_rosto"),
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const fatores = (lista?.all ?? [])
    .filter((f) => f.factor_type === "webauthn" && f.status === "verified")
    .map((f) => ({ id: f.id, nome: f.friendly_name || "Aparelho", criado: f.created_at }));
  return {
    exige: !!meu?.exige,
    obrigatorioEm: meu?.obrigatorio_em ?? null,
    fatores,
    confirmado: nivel?.currentLevel === "aal2",
  };
}

/** Mensagem que a pessoa entende para os erros do navegador e do Supabase. */
export function erroRosto(e: unknown): string {
  const err = e as { name?: string; code?: string; message?: string } | null;
  const texto = `${err?.code ?? ""} ${err?.name ?? ""} ${err?.message ?? ""}`;
  if (/NotAllowed|cancel|abort/i.test(texto)) return "A confirmação foi cancelada ou o tempo acabou. Tente de novo.";
  if (/not.?enabled|disabled|webauthn.*(enroll|verification)/i.test(texto))
    return "A opção do rosto ainda não foi ligada no Supabase (Authentication → Multi-Factor → WebAuthn).";
  if (/InvalidState|credential_exists|already/i.test(texto)) return "Este aparelho já está cadastrado.";
  if (/NotSupported|SecurityError|PublicKeyCredential/i.test(texto))
    return "Este navegador não consegue usar o rosto. Use o celular ou um navegador atualizado (Chrome, Safari ou Edge).";
  return err?.message || "Não deu certo. Tente de novo.";
}

/** Cadastra o rosto deste aparelho (o celular ou o computador pede o rosto ou a digital). */
export async function cadastrarRosto(nome: string) {
  const { error } = await supabase.auth.mfa.webauthn._register({ friendlyName: nome.slice(0, 60) || "Aparelho", webauthn: {} });
  if (error) throw error;
}

/** Confirma a entrada com um rosto já cadastrado. */
export async function confirmarRosto(fatorId: string) {
  const { error } = await supabase.auth.mfa.webauthn._authenticate({ factorId: fatorId, webauthn: {} });
  if (error) throw error;
  await supabase.auth.refreshSession();
}

/** Apaga um aparelho da própria conta (o Supabase só deixa depois de confirmar com o rosto). */
export async function apagarRosto(fatorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId });
  if (error) throw error;
}

/** Nome sugerido para o aparelho, para a pessoa reconhecer depois na lista. */
export function nomeDoAparelho() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Celular Android";
  if (/Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Computador Windows";
  return "Aparelho";
}
