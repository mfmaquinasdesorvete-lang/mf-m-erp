// Atalho do Início: "Voz ou foto" abre o lançamento rápido do Painel pessoal sem sair da tela inicial.
// Botão redondo (24/10): microfone com a câmera no canto e o nome curto embaixo, como um botão de gravar.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Mic } from "lucide-react";
import { useInvalidate, useRows } from "@/lib/data";
import type { ContaPessoal } from "@/lib/pessoal";
import { GastoPessoal } from "./GastoPessoal";

export function AtalhoGastoPessoal() {
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const { data: contas = [] } = useRows<ContaPessoal>("pessoal_contas", { order: "ordem", ascending: true });
  const ativas = contas.filter((c) => c.ativa);
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => (ativas.length ? setAberto(true) : navigate("/pessoal"))}
        aria-label="Lançar gasto por voz ou foto" title="Painel pessoal: lançar um gasto falando, escrevendo ou com a foto do comprovante"
        className="botao-toque group flex shrink-0 flex-col items-center gap-0.5 rounded-cartao focus-visible:outline-none">
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-fg shadow-pop transition group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-brand group-focus-visible:ring-offset-2">
          <Mic size={20} aria-hidden />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-surface text-brand shadow-card ring-1 ring-slate-200"><Camera size={11} aria-hidden /></span>
        </span>
        <span className="text-2xs font-semibold text-slate-600 group-hover:text-fg">Gasto</span>
      </button>
      {aberto && <GastoPessoal contas={ativas} onClose={() => setAberto(false)} onFeito={() => { invalidar("pessoal_lancamentos"); setAberto(false); }} />}
    </>
  );
}
