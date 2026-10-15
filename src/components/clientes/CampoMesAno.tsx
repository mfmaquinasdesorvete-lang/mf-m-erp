// Mês/ano digitado como no Tiny (10/2020). Grava AAAA-MM-01; data com dia (29/09/2022) também vale.
import { useEffect, useState } from "react";
import { dataDoCodigo, mesAnoCompra } from "../../../supabase/functions/_shared/compra-maquina";

export function CampoMesAno({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const [texto, setTexto] = useState(mesAnoCompra(value));
  useEffect(() => { if (dataDoCodigo(texto) !== (value ?? "")) setTexto(mesAnoCompra(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const invalido = !!texto.trim() && !dataDoCodigo(texto);

  function mudar(t: string) {
    // "102020" -> "10/2020" enquanto digita
    const so = t.replace(/[^\d/]/g, "");
    const pronto = /^\d{3,}$/.test(so) ? `${so.slice(0, 2)}/${so.slice(2, 6)}` : so.slice(0, 10);
    setTexto(pronto);
    if (!pronto.trim()) onChange(null);
    else if (dataDoCodigo(pronto)) onChange(dataDoCodigo(pronto));
  }

  return (
    <>
      <input className={`input ${invalido ? "border-red-400" : ""}`} value={texto} disabled={disabled} inputMode="numeric" placeholder="MM/AAAA"
        aria-invalid={invalido} title="Mês e ano em que o cliente comprou a máquina (no Tiny ficava no campo Código)"
        onChange={(e) => mudar(e.target.value)} onBlur={() => { if (invalido) { setTexto(mesAnoCompra(value)); } }} />
      {invalido && <span className="mt-1 block text-xs text-red-600">Use mês/ano, ex.: 10/2020</span>}
    </>
  );
}
