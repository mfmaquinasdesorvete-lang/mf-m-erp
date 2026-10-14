// Aba da tela no endereço (?aba=recebidas): o link abre direto na aba certa, dá para mandar para alguém
// e o "voltar" do navegador não se perde. A aba padrão não aparece no endereço.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useAbaUrl<T extends string>(padrao: T, validas?: readonly T[], nome = "aba"): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const v = params.get(nome) as T | null;
  const atual = v && (!validas || validas.includes(v)) ? v : padrao;
  const mudar = useCallback((novo: T) => {
    setParams((p) => {
      const q = new URLSearchParams(p);
      if (novo === padrao) q.delete(nome); else q.set(nome, novo);
      return q;
    }, { replace: true, preventScrollReset: true });
  }, [setParams, padrao, nome]);
  return [atual, mudar];
}

/** "?aba=pagar" para navegar já na aba (vazio quando é a aba padrão). */
export const buscaDaAba = (aba: string, padrao: string, nome = "aba") => (aba && aba !== padrao ? `?${nome}=${encodeURIComponent(aba)}` : "");
