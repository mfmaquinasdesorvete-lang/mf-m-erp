// Calculadora do material cortado em peças (barra, tubo, chapa): a pessoa mede a peça do jeito da fábrica
// (comprimento em mm, tamanho da peça na chapa ou quantas saem da chapa) e o ERP devolve quanto do material vai
// em cada peça, na unidade em que ele é comprado, contando o aproveitamento e a sobra.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button, Field, chip } from "@/components/ui";
import { brl } from "@/lib/format";
import { consumo, faltaMedida, formatoDe, type Material, type UsoMaterial } from "@/lib/material";
import { diametroDoNome } from "@/lib/tornearia";

const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const ler = (s: string) => { const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };

/** Material com formato (barra, tubo, chapa) ou barra redonda comprada por kg (mede pelo diâmetro do nome). */
export const temCalculo = (m: Material) => !!formatoDe(m) || (String(m.unidade ?? "").toUpperCase() === "KG" && !!diametroDoNome(m.descricao));

export function CalculoMaterial({ material, uso: inicial, custo, onUsar, rotuloUsar = "Usar", ocupado }: {
  material: Material & { id?: string; preco_custo?: number | string | null };
  uso?: unknown; custo?: number; onUsar: (quantidade: number, uso: UsoMaterial) => void; rotuloUsar?: string; ocupado?: boolean;
}) {
  const f = formatoDe(material) ?? "barra";
  const u = (inicial && typeof inicial === "object" ? inicial : {}) as Partial<UsoMaterial> & Record<string, any>;
  const [modo, setModo] = useState<UsoMaterial["modo"]>(f === "chapa" ? (u.modo === "pecas" ? "pecas" : "peca") : "comprimento");
  const [a, setA] = useState(String(u.mm ?? u.comprimento ?? u.n ?? ""));
  const [b, setB] = useState(String(u.largura ?? ""));
  const [perda, setPerda] = useState(String(u.perda ?? ""));
  const uso: UsoMaterial = modo === "comprimento" ? { modo, mm: ler(a), ...(ler(perda) ? { perda: ler(perda) } : {}) }
    : modo === "peca" ? { modo, comprimento: ler(a), largura: ler(b) } : { modo, n: Math.floor(ler(a)) };
  const r = consumo(material, uso);
  const falta = faltaMedida(material);
  const un = material.unidade ?? "un";
  const custoUn = Number(custo ?? material.preco_custo ?? 0);
  const nome = f === "chapa" ? "chapa" : f === "tubo" ? "tubo" : "barra";

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2">
      {f === "chapa" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Como medir">
          <button type="button" className={chip(modo === "peca")} aria-pressed={modo === "peca"} onClick={() => { setModo("peca"); setA(""); }}>Tamanho da peça</button>
          <button type="button" className={chip(modo === "pecas")} aria-pressed={modo === "pecas"} onClick={() => { setModo("pecas"); setA(""); }}>Quantas saem da chapa</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modo === "comprimento" && <>
          <Field label="Comprimento da peça (mm)"><input className="input" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></Field>
          <Field label="Perda do corte (mm)" dica="serra ou disco; vazio = 0"><input className="input" inputMode="decimal" value={perda} onChange={(e) => setPerda(e.target.value)} /></Field>
        </>}
        {modo === "peca" && <>
          <Field label="Comprimento da peça (mm)"><input className="input" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></Field>
          <Field label="Largura da peça (mm)"><input className="input" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        </>}
        {modo === "pecas" && (
          <Field label="Peças que saem de 1 chapa"><input className="input" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></Field>
        )}
      </div>
      {falta && (
        <p className="flex items-start gap-1 text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>Falta {falta} da {nome} no cadastro do material{material.id ? <> (<Link className="link-acao" to={`/produtos/componentes?editar=${material.id}`}>abrir o cadastro</Link>)</> : ""}: sem isso a sobra não entra na conta.</span>
        </p>
      )}
      {r?.aviso && <p className="text-xs font-semibold text-amber-800">{r.aviso}</p>}
      {r && r.quantidade > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
          <span>
            <span className="block text-slate-700">{r.texto}</span>
            <span className="block">= <b className="num">{qtd(r.quantidade)} {un}</b> por peça{custoUn > 0 ? <> · <b className="num">{brl(custoUn * r.quantidade)}</b> de material</> : ""}</span>
          </span>
          <Button type="button" tamanho="mini" carregando={ocupado} onClick={() => onUsar(r.quantidade, uso)}>{rotuloUsar}</Button>
        </div>
      )}
    </div>
  );
}
