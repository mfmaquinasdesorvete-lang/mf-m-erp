// Sair do ERP: grava a hora da saída no registro dos acessos (Usuários → topo) e encerra a sessão.
import { supabase } from "./supabase";

export async function sairDoErp() {
  await Promise.race([supabase.rpc("registrar_saida").then(() => {}, () => {}), new Promise((r) => setTimeout(r, 2000))]);
  await supabase.auth.signOut();
}
