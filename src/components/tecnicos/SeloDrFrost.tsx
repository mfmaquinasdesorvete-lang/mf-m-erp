// Selo do técnico parceiro convidado do site Dr. Frost (os demais técnicos são contatos).
import { BadgeCheck } from "lucide-react";

/** "Dr. Frost", com o check quando o anúncio no site é verificado. */
export function SeloDrFrost({ t }: { t: { drfrost?: boolean | null; verificado?: boolean | null } }) {
  if (!t.drfrost) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800" title={t.verificado ? "Parceiro Dr. Frost · anúncio verificado" : "Parceiro Dr. Frost (convidado)"}>
      {t.verificado && <BadgeCheck size={12} aria-hidden />} Dr. Frost
    </span>
  );
}
