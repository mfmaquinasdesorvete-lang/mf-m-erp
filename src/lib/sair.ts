// Sair do ERP: grava a hora da saída no registro dos acessos (Usuários → topo) e encerra a sessão. E sair quando o
// administrador derruba as sessões.
import { useEffect } from "react";
import { notify } from "./notify";
import { supabase } from "./supabase";

export async function sairDoErp() {
  await Promise.race([supabase.rpc("registrar_saida").then(() => {}, () => {}), new Promise((r) => setTimeout(r, 2000))]);
  await supabase.auth.signOut();
}

/**
 * Se o administrador derrubar as sessões (Usuários → Derrubar sessões), quem estava dentro sai sozinho: confere ao
 * voltar para a aba e a cada 2 minutos. Só sai quando o banco diz que a sessão não existe mais (erro de internet não
 * derruba ninguém).
 */
export function useSessaoDerrubada(logado: boolean) {
  useEffect(() => {
    if (!logado) return;
    let saindo = false;
    const conferir = async () => {
      if (saindo || document.visibilityState === "hidden") return;
      const { data, error } = await supabase.rpc("minha_sessao_viva");
      if (error || data !== false) return;
      saindo = true;
      notify("A sua entrada foi encerrada pelo administrador. Entre de novo com a sua senha.");
      await supabase.auth.signOut({ scope: "local" });
    };
    const relogio = window.setInterval(conferir, 120_000);
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, [logado]);
}
