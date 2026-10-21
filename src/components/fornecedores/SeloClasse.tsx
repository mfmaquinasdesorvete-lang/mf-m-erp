// Selo da classe da avaliação do fornecedor (A, B ou C, com a nota): lista de fornecedores e tela de avaliação.
import { CLASSES, type Classe } from "@/lib/avaliacaoFornecedor";

export function SeloClasse({ c, nota }: { c?: string | null; nota?: number | null }) {
  if (!c || !(c in CLASSES)) return null;
  const k = c as Classe;
  return (
    <span title={CLASSES[k].texto} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-2xs font-black ${CLASSES[k].cor}`}>
      {k}{nota != null && <span className="font-semibold">· {Number(nota).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>}
    </span>
  );
}
