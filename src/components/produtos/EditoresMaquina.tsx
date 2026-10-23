// Cadastro da máquina: especificações técnicas (ficha de venda: voltagem, potência, produção…) e as etapas de
// produção, que viram a lista de conferência de cada OP.
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";

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
              {!disabled && <button type="button" onClick={() => onChange(itens.filter((_, j) => j !== i))} className="botao-icone-perigo p-2" aria-label={`Tirar ${e.nome || "especificação"}`}><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-1.5">
          {faltam.map((s) => (
            <Button key={s} type="button" tamanho="mini" variant="secondary" onClick={() => onChange([...itens, { nome: s, valor: "" }])}>+ {s}</Button>
          ))}
          <Button type="button" tamanho="mini" variant="secondary" onClick={() => onChange([...itens, { nome: "", valor: "" }])}><Plus size={12} /> Outra</Button>
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
                <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="botao-icone p-1" aria-label={`Subir ${e}`}><ArrowUp size={14} /></button>
                <button type="button" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)} className="botao-icone p-1" aria-label={`Descer ${e}`}><ArrowDown size={14} /></button>
                <button type="button" onClick={() => onChange(etapas.filter((_, j) => j !== i))} className="botao-icone-perigo p-1" aria-label={`Tirar ${e}`}><Trash2 size={14} /></button>
              </>)}
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-slate-500">Nenhuma etapa. Elas viram a lista de conferência de cada ordem de produção desta máquina.</p>}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1" value={nova} maxLength={120} placeholder="Nova etapa (ex.: Teste de produção)" aria-label="Nova etapa"
            onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); incluir(); } }} />
          <Button type="button" variant="secondary" onClick={incluir}><Plus size={14} /> Incluir</Button>
          {!etapas.length && (
            <Button type="button" variant="secondary" onClick={() => onChange(ETAPAS_PADRAO)}>Usar as etapas padrão</Button>
          )}
        </div>
      )}
    </div>
  );
}
