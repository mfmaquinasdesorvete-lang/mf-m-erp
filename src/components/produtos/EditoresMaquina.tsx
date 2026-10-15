// Cadastro da máquina: especificações técnicas (ficha de venda: voltagem, potência, produção…) e as etapas de
// produção, que viram a lista de conferência de cada OP.
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

export type Especificacao = { nome: string; valor: string };

export const SUGESTOES_ESPEC = ["Voltagem", "Potência", "Produção (litros/hora)", "Cilindro", "Cuba", "Sabores", "Gás refrigerante", "Compressor", "Consumo", "Dimensões", "Peso", "Garantia"];
/** Peças e acessórios: o que o comprador (e o Mercado Livre) pergunta antes de comprar. */
export const SUGESTOES_PECA = ["Part number", "Compatível com", "Voltagem", "Material", "Medida", "Condição", "Conteúdo da embalagem", "Garantia"];
export const ETAPAS_PADRAO = ["Vácuo e teste de vazamento", "Giga de teste", "Teste de produção", "Acabamento", "Adesivação + conferência final", "Placa de identificação"];

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function EditorEspecificacoes({ valor, onChange, disabled, sugestoes = SUGESTOES_ESPEC }: { valor: unknown; onChange: (v: Especificacao[]) => void; disabled?: boolean; sugestoes?: string[] }) {
  const itens = lista<Especificacao>(valor);
  const mudar = (i: number, p: Partial<Especificacao>) => onChange(itens.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const faltam = sugestoes.filter((s) => !itens.some((x) => x.nome.trim().toLowerCase() === s.toLowerCase()));
  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((e, i) => (
            <li key={i} className="flex gap-2">
              <input className="input w-2/5 min-w-0" value={e.nome} disabled={disabled} maxLength={60} placeholder="Ex.: Voltagem" aria-label={`Nome da especificação ${i + 1}`} onChange={(x) => mudar(i, { nome: x.target.value })} />
              <input className="input min-w-0 flex-1" value={e.valor} disabled={disabled} maxLength={160} placeholder="Ex.: 220 V monofásica" aria-label={`Valor de ${e.nome || `especificação ${i + 1}`}`} onChange={(x) => mudar(i, { valor: x.target.value })} />
              {!disabled && <button type="button" onClick={() => onChange(itens.filter((_, j) => j !== i))} className="rounded p-2 text-red-600 hover:bg-red-50" aria-label={`Tirar ${e.nome || "especificação"}`}><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-1.5">
          {faltam.map((s) => (
            <button key={s} type="button" onClick={() => onChange([...itens, { nome: s, valor: "" }])}
              className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">+ {s}</button>
          ))}
          <button type="button" onClick={() => onChange([...itens, { nome: "", valor: "" }])}
            className="inline-flex items-center gap-1 rounded-full border border-brand/40 px-2.5 py-0.5 text-xs font-semibold text-brand hover:bg-brand/10"><Plus size={12} /> Outra</button>
        </div>
      )}
    </div>
  );
}

export function EditorEtapas({ valor, onChange, disabled }: { valor: unknown; onChange: (v: string[]) => void; disabled?: boolean }) {
  const etapas = lista<string>(valor);
  const [nova, setNova] = useState("");
  const mover = (i: number, d: -1 | 1) => { const n = [...etapas]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  const incluir = () => { const t = nova.trim(); if (!t) return; onChange([...etapas, t]); setNova(""); };
  return (
    <div className="space-y-2">
      {etapas.length > 0 ? (
        <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {etapas.map((e, i) => (
            <li key={`${i}-${e}`} className="flex items-center gap-2 px-3 py-1.5">
              <span className="num w-6 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1 font-medium text-fg">{e}</span>
              {!disabled && (<>
                <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={`Subir ${e}`}><ArrowUp size={14} /></button>
                <button type="button" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={`Descer ${e}`}><ArrowDown size={14} /></button>
                <button type="button" onClick={() => onChange(etapas.filter((_, j) => j !== i))} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label={`Tirar ${e}`}><Trash2 size={14} /></button>
              </>)}
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-slate-500">Nenhuma etapa. Elas viram a lista de conferência de cada ordem de produção desta máquina.</p>}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1" value={nova} maxLength={120} placeholder="Nova etapa (ex.: Teste de produção)" aria-label="Nova etapa"
            onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); incluir(); } }} />
          <button type="button" onClick={incluir} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={14} /> Incluir</button>
          {!etapas.length && (
            <button type="button" onClick={() => onChange(ETAPAS_PADRAO)} className="rounded-xl border border-brand/40 px-3 text-sm font-semibold text-brand hover:bg-brand/10">Usar as etapas padrão</button>
          )}
        </div>
      )}
    </div>
  );
}
