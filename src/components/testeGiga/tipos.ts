// Dados que as abas do Teste do giga dividem (carregados uma vez na tela).
import type { ParametroCadastro, TesteGiga } from "@/lib/testeGiga";
import type { Produto } from "@/lib/types";

/** OP de máquina: o que o teste do giga usa (NS sugeridos e o número da OP). */
export type OpGiga = {
  id: string; numero: number; produto_id: string; status: string; numeros_serie: string | null; unidade_id: string | null; concluida_em: string | null;
};

export type ContextoGiga = {
  /** todos os testes, inclusive os anulados (ficam no histórico) */
  testes: TesteGiga[];
  /** produtos do tipo máquina */
  maquinas: Produto[];
  nomeMaquina: (id: string) => string;
  ops: OpGiga[];
  parametros: ParametroCadastro[];
  podeLancar: boolean;
};
