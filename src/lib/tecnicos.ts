// Regras dos técnicos que mais de uma tela usa.
import { ehDoTecnico } from "./appCelular";

/** Link do Instagram: aceita o endereço completo, "@perfil" ou só o perfil; outro site não vira link. */
export function linkInstagram(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return /^https?:\/\/(www\.)?instagram\.com\/[^/?#]+/i.test(v) ? v : null;
  const perfil = v.replace(/^@/, "").replace(/^(www\.)?instagram\.com\//i, "").split(/[/?#\s]/)[0];
  return /^[\w.]{1,30}$/.test(perfil) ? `https://instagram.com/${perfil}` : null;
}

/** Imagem do anúncio no site Dr. Frost (o banner do cartão, com a foto ou o logo no círculo do meio). */
export const ehBannerDrFrost = (url: string | null | undefined) => /^https:\/\/drfrost\.com\.br\/wp-content\/uploads\//.test(url ?? "");

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** O cadastro de técnico deste usuário: o nome completo igual vale mais; senão, um da equipe com o mesmo primeiro nome. */
export function acharCadastro<T extends { nome: string; tipo: string }>(lista: T[], nomeUsuario: string | null | undefined): T | null {
  const n = semAcento(nomeUsuario ?? "");
  if (!n) return null;
  return lista.find((t) => semAcento(t.nome) === n) ?? lista.find((t) => t.tipo === "interno" && ehDoTecnico(t.nome, nomeUsuario)) ?? null;
}
