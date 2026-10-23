// Ícone de uma área do menu: a imagem que a empresa colocou (Sobre → Design) ou o desenho de sempre, no quadrado
// com o degradê da área (a cor escolhida para a área, quando houver; senão a do menu).
import type { LucideIcon } from "lucide-react";
import { corValida, useAparencia } from "@/lib/aparencia";

/** Primeira cor de um degradê do menu ("from-[#10b981] to-[…]" → "#10b981"). */
export const corDoDegrade = (degrade?: string) => /#[0-9a-f]{6}/i.exec(degrade ?? "")?.[0];

export function IconeArea({ id, Icone, tamanho, caixa, degrade, suave }: {
  id: string; Icone: LucideIcon; tamanho: number;
  /** classes do quadrado (tamanho, cantos, sombra) */
  caixa: string;
  /** degradê do menu ("from-… to-…"), usado quando a área não tem cor própria */
  degrade?: string;
  /** fundo tingido com o ícone na cor da área (menu renovado): menos peso que o quadrado cheio */
  suave?: boolean;
}) {
  const a = useAparencia();
  const img = a.icones_areas?.[id];
  const cor = a.cores_areas?.[id];
  const base = corValida(cor) ? cor : corDoDegrade(degrade);
  if (suave && !img && base) return (
    <span className={`grid shrink-0 place-items-center overflow-hidden ${caixa}`}
      style={{ background: `color-mix(in srgb, ${base} 22%, transparent)`, color: `color-mix(in srgb, ${base} 70%, white)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${base} 40%, transparent)` }}>
      <Icone size={tamanho} />
    </span>
  );
  const estilo = corValida(cor) ? { background: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 65%, black))` } : undefined;
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden text-white ${caixa} ${estilo || img ? "" : `bg-gradient-to-br ${degrade ?? "from-brand to-brand-dark"}`}`}
      style={img ? undefined : estilo}>
      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <Icone size={tamanho} />}
    </span>
  );
}
