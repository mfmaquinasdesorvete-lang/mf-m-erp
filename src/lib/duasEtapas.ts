// Login em duas etapas: senha + código de 6 números do app autenticador do celular (TOTP do Supabase Auth).
// O banco só libera os dados para quem tem o código cadastrado depois que ele é digitado (sessão "aal2");
// os papéis marcados em Usuários (configuracoes.mfa_papeis) são obrigados a cadastrar.
import { DEMO, supabase } from "./supabase";

export type EstadoDuasEtapas = "ok" | "verificar" | "cadastrar";

/** O que falta para entrar: digitar o código, cadastrar o código ou nada. */
export async function estadoDuasEtapas(): Promise<EstadoDuasEtapas> {
  if (DEMO) return "ok";
  const [{ data: nivel, error }, { data: exigido }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("mfa_exigido"),
  ]);
  // sem resposta do Auth: segue (o banco continua barrando quem precisa do código)
  if (error || !nivel) return "ok";
  if (nivel.currentLevel === "aal2") return "ok";
  if (nivel.nextLevel === "aal2") return "verificar";
  return exigido ? "cadastrar" : "ok";
}

export type Fator = { id: string; friendly_name?: string | null; created_at: string; status: string };

/** Códigos já cadastrados (confirmados) desta pessoa. */
export async function fatoresCadastrados(): Promise<Fator[]> {
  if (DEMO) return demoFatores;
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []) as Fator[];
}

export type NovoCodigo = { factorId: string; qr: string; chave: string; uri: string };

/** Começa o cadastro: gera o QR code e a chave (o código só vale depois de confirmado). */
export async function iniciarCadastro(): Promise<NovoCodigo> {
  if (DEMO) return { factorId: "demo", qr: QR_DEMO, chave: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/ERP%20Line?secret=JBSWY3DPEHPK3PXP" };
  // tentativa anterior que não foi confirmada: apaga para não acumular
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of (data?.all ?? []) as { id: string; status: string; factor_type: string }[]) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const quando = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const { data: novo, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `ERP Line ${quando}`, issuer: "ERP Line MF" });
  if (error) throw error;
  return { factorId: novo.id, qr: novo.totp.qr_code, chave: novo.totp.secret, uri: novo.totp.uri };
}

/** Confere o código de 6 números; certo, a sessão passa a valer com as duas etapas. */
export async function confirmarCodigo(factorId: string, codigo: string) {
  const code = codigo.replace(/\D/g, "");
  if (code.length !== 6) throw new Error("Digite os 6 números que aparecem no app.");
  if (DEMO) {
    if (code !== "123456") throw new Error("Na prévia o código é 123456.");
    if (factorId === "demo" && !demoFatores.length) demoFatores = [{ id: "demo", friendly_name: "ERP Line (prévia)", created_at: new Date().toISOString(), status: "verified" }];
    return;
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new Error(mensagemErro(error.message));
}

/** Remove códigos (trocar de celular ou desligar quando o papel não obriga). */
export async function removerCodigos(ids: string[]) {
  if (DEMO) { demoFatores = demoFatores.filter((f) => !ids.includes(f.id)); return; }
  for (const factorId of ids) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(mensagemErro(error.message));
  }
}

export function mensagemErro(msg: string) {
  if (/invalid|incorrect|expired/i.test(msg) && /code|totp|challenge/i.test(msg)) {
    return "Código errado ou vencido. Use o código que está aparecendo agora no app (ele muda a cada 30 segundos) e confira se a hora do celular está certa.";
  }
  if (/aal2|assurance/i.test(msg)) return "Para fazer isso, entre de novo com o código do app.";
  if (/rate|too many/i.test(msg)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  return msg;
}

/** Chave em blocos de 4 letras, para digitar no app sem errar. */
export const chaveEmBlocos = (chave: string) => chave.replace(/(.{4})/g, "$1 ").trim();

// prévia (sem Supabase): o código é sempre 123456
let demoFatores: Fator[] = [];
const QR_DEMO = "data:image/svg+xml;utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/>` +
  [[0, 0], [14, 0], [0, 14]].map(([x, y]) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`).join("") +
  `<rect x="9" y="9" width="3" height="3"/><rect x="16" y="16" width="2" height="2"/><rect x="9" y="2" width="2" height="2"/></svg>`);
