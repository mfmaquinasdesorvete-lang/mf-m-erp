// Medidas do produto desenhadas como uma planta (blueprint): caixa em perspectiva com largura, altura e
// profundidade cotadas, o peso e a embalagem. Sem medida, mostra o que falta (o frete precisa delas).
const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : 0; };
const fmt = (v: number, casas = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export function DesenhoMedidas({ largura, altura, profundidade, peso, embalagem, compacto, letraP = "P" }: {
  largura?: unknown; altura?: unknown; profundidade?: unknown; peso?: unknown; embalagem?: string | null; compacto?: boolean; letraP?: string;
}) {
  const L = n(largura), A = n(altura), P = n(profundidade), kg = n(peso);
  const falta = [!L && "largura", !A && "altura", !P && "profundidade", !kg && "peso"].filter(Boolean) as string[];
  // escala: o maior lado ocupa ~110 px; lado vazio vira 35% do maior (só para desenhar)
  const maior = Math.max(L, A, P, 1);
  const s = 110 / maior;
  const w = Math.max((L || maior * 0.35) * s, 18), h = Math.max((A || maior * 0.35) * s, 18), d = Math.max((P || maior * 0.35) * s, 14);
  const dx = d * 0.62, dy = d * 0.36;
  const x0 = 40, y0 = 30 + dy; // canto de cima da frente
  const frente = `${x0},${y0} ${x0 + w},${y0} ${x0 + w},${y0 + h} ${x0},${y0 + h}`;
  const topo = `${x0},${y0} ${x0 + dx},${y0 - dy} ${x0 + w + dx},${y0 - dy} ${x0 + w},${y0}`;
  const lado = `${x0 + w},${y0} ${x0 + w + dx},${y0 - dy} ${x0 + w + dx},${y0 + h - dy} ${x0 + w},${y0 + h}`;
  const largSvg = x0 + w + dx + 70, altSvg = y0 + h + 40;
  const linha = "#7dd3fc", texto = "#e0f2fe";
  return (
    <figure className={`overflow-hidden rounded-xl border border-sky-900/60 ${compacto ? "" : "p-2"}`}
      style={{ background: "#0b2a4a", backgroundImage: "linear-gradient(rgba(125,211,252,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.08) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
      <svg viewBox={`0 0 ${largSvg} ${altSvg}`} className="mx-auto block h-auto w-full max-w-[360px]" role="img"
        aria-label={`Medidas: largura ${L ? `${fmt(L)} cm` : "sem medida"}, altura ${A ? `${fmt(A)} cm` : "sem medida"}, profundidade ${P ? `${fmt(P)} cm` : "sem medida"}, peso ${kg ? `${fmt(kg, 3)} kg` : "sem peso"}`}>
        <defs>
          <marker id="seta" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" fill={linha} />
          </marker>
        </defs>
        <polygon points={topo} fill="rgba(125,211,252,.16)" stroke={linha} strokeWidth="1.2" />
        <polygon points={lado} fill="rgba(125,211,252,.08)" stroke={linha} strokeWidth="1.2" />
        <polygon points={frente} fill="rgba(125,211,252,.12)" stroke={linha} strokeWidth="1.4" />
        {/* largura: embaixo da frente */}
        <line x1={x0} y1={y0 + h + 14} x2={x0 + w} y2={y0 + h + 14} stroke={linha} strokeWidth="1" markerStart="url(#seta)" markerEnd="url(#seta)" />
        <text x={x0 + w / 2} y={y0 + h + 28} fill={texto} fontSize="11" fontWeight="700" textAnchor="middle">L {L ? `${fmt(L)} cm` : "?"}</text>
        {/* altura: à esquerda */}
        <line x1={x0 - 12} y1={y0} x2={x0 - 12} y2={y0 + h} stroke={linha} strokeWidth="1" markerStart="url(#seta)" markerEnd="url(#seta)" />
        <text x={x0 - 16} y={y0 + h / 2} fill={texto} fontSize="11" fontWeight="700" textAnchor="middle" transform={`rotate(-90 ${x0 - 16} ${y0 + h / 2})`} dy="-4">A {A ? `${fmt(A)} cm` : "?"}</text>
        {/* profundidade: na aresta do lado */}
        <line x1={x0 + w + 8} y1={y0 + h + 4} x2={x0 + w + dx + 8} y2={y0 + h - dy + 4} stroke={linha} strokeWidth="1" markerStart="url(#seta)" markerEnd="url(#seta)" />
        <text x={x0 + w + dx / 2 + 14} y={y0 + h - dy / 2 + 16} fill={texto} fontSize="11" fontWeight="700">{letraP} {P ? `${fmt(P)} cm` : "?"}</text>
        {/* peso */}
        <text x={x0 + w + dx + 8} y={y0 - dy + 12} fill={kg ? "#fde68a" : "#fca5a5"} fontSize="12" fontWeight="800">{kg ? `${fmt(kg, 3)} kg` : "peso ?"}</text>
      </svg>
      {!compacto && (
        <figcaption className="px-1 pt-1 text-center text-2xs" style={{ color: "#e0f2fe" }}>
          {embalagem ? `Embalagem: ${embalagem}` : "Sem embalagem padrão"}{L && A && P ? ` · ${fmt((L * A * P) / 1_000_000, 4)} m³` : ""}
          {falta.length > 0 && <span className="block font-semibold" style={{ color: "#fcd34d" }}>Falta {falta.join(", ")} (o frete do marketplace precisa)</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** Miniatura da planta (ícone ao lado do nome): a caixa na proporção real, sem cotas. Sem medida, caixa tracejada. */
export function MiniDesenho({ largura, altura, profundidade, tamanho = 44 }: { largura?: unknown; altura?: unknown; profundidade?: unknown; tamanho?: number }) {
  const L = n(largura), A = n(altura), P = n(profundidade);
  const tem = L > 0 && A > 0 && P > 0;
  const maior = Math.max(L, A, P, 1), s = 22 / maior;
  const w = tem ? Math.max(L * s, 5) : 18, h = tem ? Math.max(A * s, 5) : 16, d = tem ? Math.max(P * s, 4) : 12;
  const dx = d * 0.62, dy = d * 0.36;
  const x0 = (40 - w - dx) / 2 + 2, y0 = (40 - h + dy) / 2;
  const linha = "#7dd3fc", traco = tem ? undefined : "2 2";
  return (
    <svg viewBox="0 0 40 40" width={tamanho} height={tamanho} className="shrink-0 rounded-lg border border-sky-900/60" aria-hidden
      style={{ background: "#0b2a4a", backgroundImage: "linear-gradient(rgba(125,211,252,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.10) 1px, transparent 1px)", backgroundSize: "6px 6px" }}>
      <polygon points={`${x0},${y0} ${x0 + dx},${y0 - dy} ${x0 + w + dx},${y0 - dy} ${x0 + w},${y0}`} fill="rgba(125,211,252,.18)" stroke={linha} strokeWidth=".8" strokeDasharray={traco} />
      <polygon points={`${x0 + w},${y0} ${x0 + w + dx},${y0 - dy} ${x0 + w + dx},${y0 + h - dy} ${x0 + w},${y0 + h}`} fill="rgba(125,211,252,.08)" stroke={linha} strokeWidth=".8" strokeDasharray={traco} />
      <rect x={x0} y={y0} width={w} height={h} fill="rgba(125,211,252,.12)" stroke={linha} strokeWidth="1" strokeDasharray={traco} />
    </svg>
  );
}
