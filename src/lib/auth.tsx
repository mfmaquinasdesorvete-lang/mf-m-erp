import { createContext, useContext, type ReactNode } from "react";
import { pode, podeVer, temPapel, type Acao, type Papel, type Tela } from "./permissoes";

export type Perfil = {
  user_id: string; nome: string; papel: Papel; email: string; unidade_id?: string | null;
  /** papéis somados ao principal (vendas, financeiro, técnico) */
  papeis_extras?: Papel[] | null;
  trocar_senha?: boolean;
};

const PerfilContext = createContext<Perfil | null>(null);

export function PerfilProvider({ perfil, children }: { perfil: Perfil; children: ReactNode }) {
  return <PerfilContext.Provider value={perfil}>{children}</PerfilContext.Provider>;
}

/** Usuário logado + helpers de permissão (papel principal + adicionais). */
export function usePerfil() {
  const perfil = useContext(PerfilContext);
  if (!perfil) throw new Error("usePerfil fora do PerfilProvider");
  const extras = perfil.papeis_extras ?? [];
  return {
    ...perfil,
    pode: (acao: Acao) => pode(perfil.papel, acao, extras),
    podeVer: (tela: Tela) => podeVer(perfil.papel, tela, extras),
    /** tem algum destes papéis (principal ou adicional); admin sempre tem */
    tem: (...papeis: Papel[]) => temPapel(perfil.papel, extras, ...papeis),
  };
}
