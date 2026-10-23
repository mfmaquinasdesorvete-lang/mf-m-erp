// Selo com a cidade/UF do cliente ao lado do nome (pedidos, vendas, OS, expedição): saber de onde é sem abrir o cadastro.
import { MapPin } from "lucide-react";

export const textoCidade = (c?: { municipio?: string | null; uf?: string | null } | null) => {
  const m = c?.municipio?.trim(), uf = c?.uf?.trim().toUpperCase();
  return m && uf ? `${m}/${uf}` : m || uf || "";
};

/** escuro: para os apps do celular (fundo escuro). */
export function SeloCidade({ cliente, escuro }: { cliente?: { municipio?: string | null; uf?: string | null } | null; escuro?: boolean }) {
  const t = textoCidade(cliente);
  if (!t) return null;
  return (
    <span title={`Cidade do cliente: ${t}`}
      className={`ml-1.5 inline-flex max-w-[11rem] items-center gap-0.5 truncate rounded-md px-1.5 py-px align-middle text-2xs font-semibold ${escuro ? "bg-white/10 text-noite-medio" : "bg-sky-50 text-sky-800 ring-1 ring-sky-200"}`}>
      <MapPin size={10} className="shrink-0" aria-hidden /><span className="truncate">{t}</span>
    </span>
  );
}
