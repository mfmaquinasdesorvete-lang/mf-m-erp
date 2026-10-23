// Tela de endereço que não existe (ou que a pessoa não tem acesso): antes voltava calado para o início e parecia que o
// clique não tinha funcionado. Agora diz o que houve e oferece voltar, ir para o início ou procurar a tela.
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui";

export function NaoEncontrada() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const podeVoltar = typeof window !== "undefined" && window.history.length > 1;
  return (
    <div className="cartao mx-auto mt-6 max-w-lg p-6 text-center sm:mt-12 sm:p-8">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-painel bg-slate-100 text-slate-500" aria-hidden><SearchX size={28} /></span>
      <h1 className="mt-4 text-xl font-bold text-fg">Esta tela não foi encontrada</h1>
      <p className="mt-2 text-sm text-slate-600">
        O endereço <code className="break-all rounded-chip bg-slate-100 px-1.5 py-0.5 text-xs">{pathname}</code> não existe ou não está liberado para o seu acesso.
        Se precisar dela, peça a liberação a quem administra o ERP.
      </p>
      <p className="mt-1 text-xs text-slate-500">Para achar outra tela, use a busca do menu (Ctrl+K).</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {podeVoltar && <Button type="button" variant="secondary" onClick={() => navigate(-1)}><ArrowLeft size={16} aria-hidden /> Voltar</Button>}
        <Button type="button" onClick={() => navigate("/", { replace: true })}><Home size={16} aria-hidden /> Ir para o início</Button>
      </div>
    </div>
  );
}
