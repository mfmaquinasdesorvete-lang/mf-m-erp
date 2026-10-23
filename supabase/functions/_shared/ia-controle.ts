// Controle das IAs do ERP: o interruptor "IA desligada" (Configurações → Inteligência artificial) e o registro de
// cada uso (tabela ia_registros: quem, quando, qual IA, o que pediu em resumo, modelo e se deu certo).
// Usado pelas funções ia-produto e ia-voz antes e depois de chamar a IA.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { HttpError } from "./supabase.ts";

/** Para a função com erro se um administrador desligou a IA. */
export async function conferirIaLigada(db: SupabaseClient) {
  const { data } = await db.from("configuracoes").select("ia_ligada, ia_desligada_motivo").eq("id", 1).maybeSingle();
  if (data && data.ia_ligada === false) {
    throw new HttpError(503, `A IA do ERP está desligada (Configurações → Inteligência artificial)${data.ia_desligada_motivo ? `: ${data.ia_desligada_motivo}` : ""}.`);
  }
}

export type RegistroIa = { funcao: string; acao: string; resumo?: string | null; modelo?: string | null; ok: boolean; erro?: string | null };

/** Grava o uso da IA; falha ao gravar não atrapalha quem usou. */
export async function registrarIa(db: SupabaseClient, userId: string | null, r: RegistroIa) {
  try {
    const { data: u } = userId ? await db.from("usuarios_erp").select("nome").eq("user_id", userId).maybeSingle() : { data: null };
    await db.from("ia_registros").insert({
      user_id: userId, user_nome: u?.nome ?? null, funcao: r.funcao, acao: r.acao,
      resumo: r.resumo ? r.resumo.replace(/\s+/g, " ").trim().slice(0, 300) : null,
      modelo: r.modelo ?? null, ok: r.ok, erro: r.erro ? r.erro.slice(0, 300) : null,
    });
  } catch { /* o registro nunca derruba a resposta */ }
}
