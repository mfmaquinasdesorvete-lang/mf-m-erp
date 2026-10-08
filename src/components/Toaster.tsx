import { useEffect, useState } from "react";
import type { Aviso } from "@/lib/notify";

export function Toaster() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    const onAviso = (e: Event) => {
      const aviso = (e as CustomEvent<Aviso>).detail;
      setAvisos((a) => [...a, aviso]);
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== aviso.id)), aviso.tipo === "erro" ? 8000 : 3500);
    };
    window.addEventListener("erp-aviso", onAviso);
    return () => window.removeEventListener("erp-aviso", onAviso);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
      {avisos.map((a) => (
        <div
          key={a.id}
          className={`rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${a.tipo === "erro" ? "bg-[#c62828]" : "bg-[#1b7a4b]"}`}
        >
          {a.texto}
        </div>
      ))}
    </div>
  );
}
