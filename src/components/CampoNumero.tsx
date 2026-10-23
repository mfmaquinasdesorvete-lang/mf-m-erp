// Campo de número em texto, no jeito brasileiro: aceita "1.500,00", "1500" ou "45,90". O campo numérico do navegador
// lia "1.500" como 1,5. Enquanto digita, só passa adiante quando o texto vira número; ao sair, mostra o valor formatado.
import { useEffect, useState } from "react";
import { lerValor } from "@/lib/auditoriaBusca";

const formatar = (v: number, casas: number, minimo: number) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: minimo, maximumFractionDigits: casas }) : "";

export function CampoNumero({ valor, onValor, disabled, casas = 2, minimo = 2, className = "", ...resto }: {
  valor: number; onValor: (v: number) => void; disabled?: boolean; casas?: number; minimo?: number; className?: string;
  "aria-label"?: string; placeholder?: string;
}) {
  const [texto, setTexto] = useState(formatar(valor, casas, minimo));
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(formatar(valor, casas, minimo)); }, [valor, editando, casas, minimo]);
  const invalido = editando && texto.trim() !== "" && lerValor(texto) == null;
  const fator = 10 ** casas;
  return (
    <input {...resto} className={`input text-right ${invalido ? "border-red-500" : ""} ${className}`} inputMode="decimal" value={texto}
      disabled={disabled} aria-invalid={invalido}
      onFocus={() => setEditando(true)}
      onBlur={() => { setEditando(false); setTexto(formatar(valor, casas, minimo)); }}
      onChange={(e) => {
        setTexto(e.target.value);
        const v = e.target.value.trim() === "" ? 0 : lerValor(e.target.value);
        if (v != null && v >= 0) onValor(Math.round(v * fator) / fator);
      }} />
  );
}
