// Ambiente da emissão (produção ou homologação), lido do servidor: a tela avisa e pede confirmação antes de
// emitir uma nota de teste, que é autorizada mas não tem valor fiscal.
import { callFunction } from "./supabase";

let cache: { valor: string; em: number } | null = null;

export async function ambienteNfe(): Promise<string> {
  if (cache && Date.now() - cache.em < 60_000) return cache.valor;
  const valor = (await callFunction<{ ambiente: string }>("nfe-consultar", { acao: "ambiente" })).ambiente;
  cache = { valor, em: Date.now() };
  return valor;
}

export const AVISO_TESTE = "O ERP está emitindo em HOMOLOGAÇÃO (teste): a nota é autorizada, mas não tem valor fiscal e não vale para o cliente. " +
  "Para emitir de verdade, o secret FOCUS_NFE_ENV no Supabase precisa ser producao (veja Notas fiscais → Configurações da NF-e → Diagnóstico).";

/** true = pode emitir (produção, ou a pessoa confirmou que quer uma nota de teste). */
export async function confirmarSeTeste(): Promise<boolean> {
  const amb = await ambienteNfe().catch(() => "producao");
  return amb === "producao" || confirm(`${AVISO_TESTE}\n\nEmitir como TESTE mesmo assim?`);
}
