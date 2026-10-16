// Nota de fornecedor completa (abas do detalhe da nota recebida): itens e custos, preços, marcadores dos produtos
// e ordem de compra. Os dados e o que a pessoa escolheu ficam guardados enquanto a nota está aberta.
import { useNotaFornecedor, type NotaBase } from "./useNotaFornecedor";
import { ItensCustos } from "./ItensCustos";
import { PrecosNota } from "./PrecosNota";
import { MarcadoresNota } from "./MarcadoresNota";
import { OcNota } from "./OcNota";

export type AbaNota = "resumo" | "itens" | "precos" | "marcadores" | "oc";
export const ABAS_NOTA: { value: AbaNota; label: string }[] = [
  { value: "resumo", label: "Resumo" }, { value: "itens", label: "Itens e custos" }, { value: "precos", label: "Preços" },
  { value: "marcadores", label: "Marcadores" }, { value: "oc", label: "Ordem de compra" },
];

export function NotaFornecedorAbas({ nota, aba, podeEditar, podeAprovar }: { nota: NotaBase; aba: AbaNota; podeEditar: boolean; podeAprovar: boolean }) {
  const d = useNotaFornecedor(nota);
  if (aba === "resumo") return null;
  if (d.carregando) return <p className="py-6 text-center text-sm text-slate-500">Lendo a nota, os produtos e as ordens de compra…</p>;
  if (d.erro) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não deu para ler a nota: {(d.erro as Error).message}</p>;
  if (aba === "itens") return <ItensCustos d={d} nota={nota} podeEditar={podeEditar} />;
  if (aba === "precos") return <PrecosNota d={d} nota={nota} podeEditar={podeEditar} podeAprovar={podeAprovar} />;
  if (aba === "marcadores") return <MarcadoresNota d={d} podeEditar={podeEditar} />;
  return <OcNota d={d} nota={nota} podeEditar={podeEditar} />;
}
