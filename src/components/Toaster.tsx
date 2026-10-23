import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Aviso } from "@/lib/notify";

/** Quanto tempo cada aviso fica: erro e aviso com botão (Desfazer, Tentar de novo) ficam mais, para dar tempo de agir. */
export const tempoDoAviso = (a: Pick<Aviso, "tipo" | "acao">) => (a.acao ? 10000 : a.tipo === "erro" ? 8000 : 3500);

export function Toaster() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const fechar = (id: number) => setAvisos((a) => a.filter((x) => x.id !== id));

  useEffect(() => {
    const onAviso = (e: Event) => {
      const aviso = (e as CustomEvent<Aviso>).detail;
      setAvisos((a) => [...a, aviso]);
      setTimeout(() => fechar(aviso.id), tempoDoAviso(aviso));
    };
    window.addEventListener("erp-aviso", onAviso);
    return () => window.removeEventListener("erp-aviso", onAviso);
  }, []);

  return (
    // no celular fica acima da barra de baixo e na largura toda; no computador, no canto
    <div className="fixed inset-x-3 bottom-24 z-flutuante flex flex-col gap-2 md:inset-x-auto md:bottom-4 md:right-4 md:max-w-sm" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} role={a.tipo === "erro" ? "alert" : undefined}
          className={`flex items-start gap-2 rounded-cartao py-2.5 pl-4 pr-2 text-sm font-medium text-white shadow-pop ${a.tipo === "erro" ? "bg-solido-vermelho" : "bg-publico-sucesso"}`}>
          <span className="min-w-0 flex-1 py-0.5">{a.texto}</span>
          {a.acao && (
            <button type="button" onClick={() => { a.acao!.fazer(); fechar(a.id); }}
              className="botao-claro px-2.5 py-1 text-sm">{a.acao.rotulo}</button>
          )}
          <button type="button" onClick={() => fechar(a.id)} className="botao-claro h-7 w-7 bg-transparent" aria-label="Fechar aviso">
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
