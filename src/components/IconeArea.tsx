// Ícone de uma área do menu: a imagem que a empresa colocou (Sobre → Design) ou o desenho de sempre, no quadrado
// com o degradê da área (a cor escolhida para a área, quando houver; senão a do menu).
import type { LucideIcon } from "lucide-react";
import { corValida, useAparencia } from "@/lib/aparencia";

export function IconeArea({ id, Icone, tamanho, caixa, degrade }: {
  id: string; Icone: LucideIcon; tamanho: number;
  /** classes do quadrado (tamanho, cantos, sombra) */
  caixa: string;
  /** degradê do menu ("from-… to-…"), usado quando a área não tem cor própria */
  degrade?: string;
}) {
  const a = useAparencia();
  const img = a.icones_areas?.[id];
  const cor = a.cores_areas?.[id];
  const estilo = corValida(cor) ? { background: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 65%, black))` } : undefined;
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden text-white ${caixa} ${estilo || img ? "" : `bg-gradient-to-br ${degrade ?? "from-brand to-brand-dark"}`}`}
      style={img ? undefined : estilo}>
      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <Icone size={tamanho} />}
    </span>
  );
}
