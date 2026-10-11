// Área do sistema em uso (Vendas, Notas, Financeiro…): o Layout informa e as telas usam
// para o ícone e o nome da área no título. A cor vem do CSS (:root[data-modulo="…"] em index.css).
import { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react";

export type Modulo = { id: string; titulo: string; icone?: LucideIcon };

export const ModuloContext = createContext<Modulo | null>(null);
export const useModulo = () => useContext(ModuloContext);
