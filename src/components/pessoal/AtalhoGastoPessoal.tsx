// Atalho do Início: "Voz ou foto" abre o lançamento rápido do Painel pessoal sem sair da tela inicial.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui";
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
      <Button type="button" onClick={() => (ativas.length ? setAberto(true) : navigate("/pessoal"))}
        title="Painel pessoal: lançar um gasto falando, escrevendo ou com a foto do comprovante">
        <Mic size={17} aria-hidden /> Gasto por voz ou foto
      </Button>
      {aberto && <GastoPessoal contas={ativas} onClose={() => setAberto(false)} onFeito={() => { invalidar("pessoal_lancamentos"); setAberto(false); }} />}
    </>
  );
}
