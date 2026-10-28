// O que fazer quando a SEFAZ recusa a nota: o motivo em português e os passos, para qualquer pessoa resolver sem
// esperar o contador. Sem guia para a mensagem, mostra só o texto original.
// Só cores do tema (red/amber/slate têm escala clara e escura), para ler bem nos dois temas.
import { AlertTriangle, Lightbulb } from "lucide-react";
import { guiaRejeicao } from "@/lib/faturamento";

export function GuiaRejeicaoNota({ mensagem, rotulo = "Motivo da rejeição" }: { mensagem: string | null | undefined; rotulo?: string }) {
  const g = guiaRejeicao(mensagem);
  return (
    <div className="rounded-cartao border border-red-200 bg-red-50 p-3 text-sm" role="alert">
      <p className="flex items-start gap-2 text-red-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
        <span><b>{rotulo}:</b> {mensagem}</span>
      </p>
      {g && (
        <div className="mt-3 rounded-cartao border border-slate-200 bg-surface p-3 text-fg">
          <p className="flex items-center gap-1.5 font-semibold"><Lightbulb size={16} className="shrink-0 text-amber-600" aria-hidden /> {g.titulo}</p>
          <p className="mt-1 text-slate-600">{g.porque}</p>
          <ol className="mt-2 space-y-1.5">
            {g.fazer.map((f, i) => (
              <li key={f} className="flex gap-2">
                <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-100 text-2xs font-bold text-amber-800" aria-hidden>{i + 1}</span>
                <span><span className="sr-only">Passo {i + 1}: </span>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
