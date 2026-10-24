// Admissão e saída: o que falta no cadastro e na pasta de cada pessoa.
// Registrado (CLT, experiência, estágio, aprendiz, temporário) precisa de PIS, CTPS e ASO; PJ, autônomo e sócio, não.
import type { Pasta } from "./pastaFuncionario";

export type PessoaAdmissao = {
  vinculo: string; situacao: string; ativo: boolean;
  cpf: string | null; pis: string | null; ctps: string | null; cargo: string | null; data_admissao: string | null;
  pix: string | null; conta: string | null; contato_emergencia: string | null;
  data_desligamento: string | null; motivo_desligamento: string | null;
};
type Contagem = Partial<Record<Pasta, number>>;

const REGISTRADOS = ["clt", "experiencia", "estagio", "aprendiz", "temporario"];
export const registrado = (vinculo: string) => REGISTRADOS.includes(vinculo);
const vazio = (v: string | null | undefined) => !v?.trim();
export const desligada = (f: Pick<PessoaAdmissao, "situacao" | "ativo">) => f.situacao === "desligado" || !f.ativo;

/** O que falta para a admissão ficar completa (quem está na ativa). */
export function faltaAdmissao(f: PessoaAdmissao, docs: Contagem = {}) {
  const falta: string[] = [];
  if (vazio(f.cpf)) falta.push("CPF");
  if (registrado(f.vinculo)) {
    if (vazio(f.pis)) falta.push("PIS");
    if (vazio(f.ctps)) falta.push("CTPS");
  }
  if (vazio(f.cargo)) falta.push("cargo");
  if (!f.data_admissao) falta.push("data de admissão");
  if (vazio(f.pix) && vazio(f.conta)) falta.push("Pix ou conta");
  if (vazio(f.contato_emergencia)) falta.push("contato de emergência");
  if (!docs.contrato) falta.push("contrato na pasta");
  if (registrado(f.vinculo) && !docs.exames) falta.push("ASO na pasta");
  return falta;
}

/** O que falta para a saída ficar registrada (desligados). */
export function faltaSaida(f: PessoaAdmissao, docs: Contagem = {}) {
  const falta: string[] = [];
  if (!f.data_desligamento) falta.push("data de saída");
  if (vazio(f.motivo_desligamento)) falta.push("motivo");
  if (!docs.outros) falta.push("documentos de saída na pasta");
  return falta;
}
