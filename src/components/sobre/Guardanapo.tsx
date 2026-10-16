// Esquema de guardanapo (napkin sketch): o processo desenhado à mão, em poucos passos, com quem faz e a tela do
// ERP de cada passo. Sai como imagem (PNG), link ou texto para mandar à equipe. O papel é sempre claro, de propósito.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCopy, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui";
import { notify, notifyError } from "@/lib/notify";
import { COR_QUEM, PROCESSOS, ROTULO_QUEM, posicoes, quebrar, textoProcesso, type Processo, type Quem } from "@/lib/esquemas";
import { todosItens } from "@/lib/menu";

const FONTE = `"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", "Patrick Hand", cursive`;
const TINTA = "#2b3445";
const BW = 212, BH = 108, GX = 66, GY = 74, M = 34;

/** Números "aleatórios" sempre iguais para o mesmo desenho (o rabisco não muda a cada tela). */
function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const j = (r: () => number, n: number) => (r() - 0.5) * 2 * n;

/** Retângulo traçado à mão: cantos tortos e o traço passando um pouco do canto. */
function caixa(x: number, y: number, w: number, h: number, r: () => number) {
  const p = [[x + j(r, 2), y + j(r, 2)], [x + w + j(r, 3), y + j(r, 2)], [x + w + j(r, 2), y + h + j(r, 3)], [x + j(r, 3), y + h + j(r, 2)]];
  const seg = (a: number[], b: number[]) => `Q ${(a[0] + b[0]) / 2 + j(r, 2.5)} ${(a[1] + b[1]) / 2 + j(r, 2.5)} ${b[0]} ${b[1]}`;
  return `M ${p[0][0] - 3} ${p[0][1] + j(r, 1)} L ${p[0][0]} ${p[0][1]} ${seg(p[0], p[1])} ${seg(p[1], p[2])} ${seg(p[2], p[3])} ${seg(p[3], p[0])} l ${4 + j(r, 2)} ${j(r, 2)}`;
}
/** Seta torta de (x1,y1) a (x2,y2), com a ponta. */
function seta(x1: number, y1: number, x2: number, y2: number, r: () => number) {
  const mx = (x1 + x2) / 2 + j(r, 7), my = (y1 + y2) / 2 + j(r, 7);
  const ang = Math.atan2(y2 - my, x2 - mx);
  const ponta = (d: number) => `${x2 - 11 * Math.cos(ang + d)} ${y2 - 11 * Math.sin(ang + d)}`;
  return { linha: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`, ponta: `M ${ponta(0.45)} L ${x2} ${y2} L ${ponta(-0.45)}` };
}

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(1000);
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(([e]) => setW(e.contentRect.width));
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Baixa o desenho como PNG (o dobro do tamanho, para ficar nítido no WhatsApp). */
export async function baixarSvgPng(svg: SVGSVGElement, nome: string) {
  const vb = svg.viewBox.baseVal;
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml.includes("xmlns=") ? xml : xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error("não deu para montar a imagem")); img.src = url; });
    const c = document.createElement("canvas");
    c.width = vb.width * 2; c.height = vb.height * 2;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (!blob) throw new Error("não deu para gerar a imagem");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${nome}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally { URL.revokeObjectURL(url); }
}

export async function copiar(texto: string, aviso: string) {
  try { await navigator.clipboard.writeText(texto); notify(aviso); } catch { notify("Não deu para copiar: selecione e copie à mão"); }
}

const nomeTela = (rota: string) => {
  const base = rota.split("?")[0];
  if (base === "/sobre") return `Sobre o ERP Line → ${rota.includes("ideias") ? "Ideias" : rota.includes("handoff") ? "Handoff" : "Atualizações"}`;
  return todosItens.find((i) => i.to === base)?.label;
};

export function Guardanapo({ processoId, onProcesso }: { processoId: string; onProcesso: (id: string) => void }) {
  const p = PROCESSOS.find((x) => x.id === processoId) ?? PROCESSOS[0];
  const [ref, largura] = useLargura<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const colunas = largura < 560 ? 1 : largura < 860 ? 2 : largura < 1120 ? 3 : 4;
  const link = `${window.location.origin}/sobre?aba=esquemas&esquema=processos&processo=${p.id}`;

  async function baixar() {
    try { if (svg.current) await baixarSvgPng(svg.current, `esquema-${p.id}`); } catch (e) { notifyError(e); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Processo">
          {PROCESSOS.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === p.id} onClick={() => onProcesso(x.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${x.id === p.id ? "bg-modulo-escuro text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {x.nome}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => copiar(textoProcesso(p, nomeTela), "Passos copiados")}><ClipboardCopy size={16} /> Copiar texto</Button>
          <Button variant="secondary" onClick={() => copiar(link, "Link copiado")}><Link2 size={16} /> Copiar link</Button>
          <Button onClick={baixar}><Download size={16} /> Baixar imagem</Button>
        </div>
      </div>
      <div ref={ref} className="min-w-0">
        <Desenho p={p} colunas={colunas} svgRef={svg} />
      </div>
      <p className="text-xs text-slate-500">Toque num passo para abrir a tela do ERP onde ele acontece. A imagem baixada serve para mandar no WhatsApp ou imprimir.</p>
    </div>
  );
}

function Desenho({ p, colunas, svgRef }: { p: Processo; colunas: number; svgRef: React.RefObject<SVGSVGElement> }) {
  const navigate = useNavigate();
  const pos = posicoes(p.passos.length, colunas);
  const linhas = Math.max(...pos.map((x) => x.linha)) + 1;
  const W = M * 2 + colunas * BW + (colunas - 1) * GX;
  // título e resumo quebram conforme a largura (no celular o desenho tem uma coluna só)
  const tituloLinhas = quebrar(p.nome, Math.max(12, Math.floor((W - M * 2) / 14)));
  const resumoLinhas = quebrar(p.resumo, Math.max(24, Math.floor((W - M * 2) / 6.8)));
  const TOPO = 44 + (tituloLinhas.length - 1) * 30 + 22 + resumoLinhas.length * 17 + 18;
  const quem = [...new Set(p.passos.map((s) => s.quem))] as Quem[];
  const legendaLinhas = Math.ceil(quem.length / Math.max(1, Math.floor((W - M * 2) / 150)));
  const H = TOPO + linhas * BH + (linhas - 1) * GY + 30 + legendaLinhas * 26 + M;
  const xy = (k: number) => ({ x: M + pos[k].coluna * (BW + GX), y: TOPO + pos[k].linha * (BH + GY) });
  const desenho = useMemo(() => {
    const r = sorteio(p.id.length * 97 + p.passos.length);
    return p.passos.map((_, k) => {
      const a = xy(k);
      const ligacao = k < p.passos.length - 1 ? (() => {
        const b = xy(k + 1);
        const mesmaLinha = pos[k].linha === pos[k + 1].linha;
        if (mesmaLinha) {
          const dir = b.x > a.x ? 1 : -1;
          return seta(dir > 0 ? a.x + BW + 6 : a.x - 6, a.y + BH / 2 + j(r, 6), dir > 0 ? b.x - 8 : b.x + BW + 8, b.y + BH / 2 + j(r, 6), r);
        }
        return seta(a.x + BW / 2 + j(r, 10), a.y + BH + 6, b.x + BW / 2 + j(r, 10), b.y - 8, r);
      })() : null;
      return { caixa: caixa(a.x, a.y, BW, BH, r), eco: caixa(a.x + 1.5, a.y - 1, BW, BH, r), giro: j(r, 1.2), marca: j(r, 3), ligacao };
    });
  }, [p, colunas]); // eslint-disable-line react-hooks/exhaustive-deps
  const porLinha = Math.max(1, Math.floor((W - M * 2) / 150));

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W * 1.25, display: "block", margin: "0 auto" }}
      role="img" aria-label={`Esquema: ${p.nome}. ${p.passos.map((s, k) => `${k + 1}. ${s.titulo} (${ROTULO_QUEM[s.quem]})`).join("; ")}`}
      xmlns="http://www.w3.org/2000/svg" fontFamily={FONTE}>
      <defs>
        <pattern id="guardanapo-linhas" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M 0 25.5 H 26" stroke="#e7edf6" strokeWidth="1" />
        </pattern>
      </defs>
      {/* o papel */}
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="10" fill="#fffdf5" stroke="#e8dfc8" strokeWidth="1.5" />
      <rect x="4" y="4" width={W - 8} height={H - 8} rx="10" fill="url(#guardanapo-linhas)" />
      {/* título com sublinhado à mão */}
      {tituloLinhas.map((l, n) => <text key={n} x={M} y={44 + n * 30} fontSize="26" fontWeight="700" fill={TINTA}>{l}</text>)}
      <path d={`M ${M} ${54 + (tituloLinhas.length - 1) * 30} q ${Math.min((W - M * 2) / 2, Math.max(...tituloLinhas.map((l) => l.length)) * 7)} 6 ${Math.min(W - M * 2, Math.max(...tituloLinhas.map((l) => l.length)) * 13.5)} -2`}
        stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" />
      {resumoLinhas.map((l, n) => <text key={n} x={M} y={76 + (tituloLinhas.length - 1) * 30 + n * 17} fontSize="13.5" fill="#5b6475">{l}</text>)}

      {p.passos.map((s, k) => {
        const { x, y } = xy(k);
        const d = desenho[k];
        const cor = COR_QUEM[s.quem];
        const titulo = quebrar(s.titulo, 17).slice(0, 2);
        const abre = s.tela ? () => navigate(s.tela!) : undefined;
        return (
          <g key={k} transform={`rotate(${d.giro} ${x + BW / 2} ${y + BH / 2})`} style={{ cursor: abre ? "pointer" : "default" }}
            onClick={abre} onKeyDown={(e) => { if (abre && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abre(); } }}
            role={abre ? "link" : undefined} tabIndex={abre ? 0 : undefined} aria-label={abre ? `${k + 1}. ${s.titulo}: abrir a tela` : undefined}>
            {abre && <title>{`Abrir: ${nomeTela(s.tela!) ?? s.tela}`}</title>}
            {/* marca-texto de quem faz */}
            <rect x={x + 8} y={y + 10 + d.marca} width={BW - 16} height={BH - 18} rx="6" fill={cor} opacity="0.13" />
            <path d={d.eco} stroke={TINTA} strokeWidth="1" fill="none" opacity="0.35" strokeLinejoin="round" />
            <path d={d.caixa} stroke={TINTA} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {/* número do passo num círculo torto */}
            <circle cx={x + 2} cy={y + 2} r="15" fill="#fffdf5" stroke={TINTA} strokeWidth="1.8" />
            <text x={x + 2} y={y + 7.5} textAnchor="middle" fontSize="15" fontWeight="700" fill={TINTA}>{k + 1}</text>
            {titulo.map((l, n) => (
              <text key={n} x={x + BW / 2} y={y + 38 + n * 21 - (titulo.length - 1) * 6} textAnchor="middle" fontSize="18" fontWeight="700" fill={TINTA}>{l}</text>
            ))}
            {s.nota && <text x={x + BW / 2} y={y + 80} textAnchor="middle" fontSize="12" fill="#5b6475" fontStyle="italic">{s.nota.length > 30 ? `${s.nota.slice(0, 29)}…` : s.nota}</text>}
            <text x={x + BW - 10} y={y + BH - 9} textAnchor="end" fontSize="12.5" fontWeight="700" fill={cor}>— {ROTULO_QUEM[s.quem]}</text>
            {abre && <text x={x + 12} y={y + BH - 9} fontSize="12" fill="#2563eb" textDecoration="underline">abrir</text>}
          </g>
        );
      })}
      {desenho.map((d, k) => d.ligacao && (
        <g key={`s${k}`} stroke={TINTA} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={d.ligacao.linha} /><path d={d.ligacao.ponta} />
        </g>
      ))}
      {/* legenda: quem faz */}
      {quem.map((q, n) => {
        const lx = M + (n % porLinha) * 150, ly = H - M - (legendaLinhas - 1 - Math.floor(n / porLinha)) * 26;
        return (
          <g key={q}>
            <rect x={lx} y={ly - 13} width="18" height="14" rx="3" fill={COR_QUEM[q]} opacity="0.35" stroke={COR_QUEM[q]} />
            <text x={lx + 25} y={ly - 1} fontSize="13" fill={TINTA}>{ROTULO_QUEM[q]}</text>
          </g>
        );
      })}
    </svg>
  );
}
