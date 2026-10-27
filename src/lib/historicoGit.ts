// Histórico do git lido na hora de montar o site (vite.config.ts grava em __ERP_HISTORICO__). Fica num lugar só:
// cada tela que escrevia `__ERP_HISTORICO__` levava uma cópia inteira do histórico para o pacote do Sobre.
import type { DiaHistorico } from "./atualizacoes";

export const HISTORICO: DiaHistorico[] = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];
