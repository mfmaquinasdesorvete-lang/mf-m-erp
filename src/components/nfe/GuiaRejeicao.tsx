// O que fazer quando a SEFAZ recusa a nota: o motivo em português e os passos, para qualquer pessoa resolver sem
// esperar o contador. Sem guia para a mensagem, mostra só o texto original.
import { Lightbulb } from "lucide-react";
import { guiaRejeicao } from "@/lib/faturamento";

export function GuiaRejeicaoNota({ mensagem, rotulo = "Motivo da rejeição" }: { mensagem: string | null | undefined; rotulo?: string }) {
  const g = guiaRejeicao(mensagem);
  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div><b>{rotulo}:</b> {mensagem}</div>
      {g && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="flex items-center gap-1.5 font-bold"><Lightbulb size={16} className="shrink-0 text-amber-600" aria-hidden /> {g.titulo}</p>
          <p className="mt-1 text-amber-900">{g.porque}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">{g.fazer.map((f) => <li key={f}>{f}</li>)}</ol>
        </div>
      )}
    </div>
  );
}
