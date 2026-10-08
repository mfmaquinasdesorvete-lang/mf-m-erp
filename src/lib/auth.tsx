import { createContext, useContext, type ReactNode } from "react";
import { pode, podeVer, type Acao, type Papel, type Tela } from "./permissoes";

export type Perfil = { user_id: string; nome: string; papel: Papel; email: string; unidade_id?: string | null };

const PerfilContext = createContext<Perfil | null>(null);

export function PerfilProvider({ perfil, children }: { perfil: Perfil; children: ReactNode }) {
  return <PerfilContext.Provider value={perfil}>{children}</PerfilContext.Provider>;
}

/** Usuário logado + helpers de permissão. */
export function usePerfil() {
  const perfil = useContext(PerfilContext);
  if (!perfil) throw new Error("usePerfil fora do PerfilProvider");
  return {
    ...perfil,
    pode: (acao: Acao) => pode(perfil.papel, acao),
    podeVer: (tela: Tela) => podeVer(perfil.papel, tela),
  };
}
