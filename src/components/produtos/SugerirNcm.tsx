// Campo NCM com "Sugerir": o banco procura nas notas de fornecedor do mesmo código de barras (GTIN) ou código
// e nos produtos parecidos pelo nome (sugerir_ncm). Só sugere: a pessoa escolhe e, na dúvida, confirma com o contador.
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";

type Sugestao = { ncm: string; fonte: string; detalhe: string | null; pontos: number };
const ncmFmt = (v: string) => v.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3");

export function CampoNcm({ valor, onChange, produtoId, disabled }: { valor: string | null | undefined; onChange: (v: string) => void; produtoId?: string | null; disabled?: boolean }) {
  const [lista, setLista] = useState<Sugestao[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function sugerir() {
    if (!produtoId) return;
    setBuscando(true);
    try {
      const { data, error } = await supabase.rpc("sugerir_ncm", { p_produto: produtoId });
      if (error) throw error;
      setLista((data ?? []) as Sugestao[]);
    } catch (e) { notifyError(e); } finally { setBuscando(false); }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input className="input num min-w-0 flex-1" inputMode="numeric" maxLength={10} value={valor ?? ""} disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 dígitos" aria-label="NCM" />
        <button type="button" onClick={sugerir} disabled={!produtoId || buscando || disabled} title={produtoId ? "Sugerir o NCM pelas notas de fornecedor e pelos produtos parecidos" : "Salve o produto para sugerir"}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-brand/40 px-2.5 text-xs font-semibold text-brand hover:bg-brand/10 disabled:opacity-50">
          {buscando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Sugerir
        </button>
      </div>
      {lista && (
        lista.length === 0
          ? <p className="text-xs text-slate-500">Sem sugestão: nenhuma nota de fornecedor com este código e nenhum produto parecido com NCM. Confirme com o contador.</p>
          : (
            <ul className="space-y-1" aria-label="NCM sugeridos">
              {lista.map((s) => (
                <li key={s.ncm}>
                  <button type="button" onClick={() => { onChange(s.ncm); setLista(null); }}
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition hover:border-brand ${s.ncm === valor ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                    <span className="num font-bold text-fg">{ncmFmt(s.ncm)}</span>
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-2xs font-semibold ${s.pontos >= 100 ? "bg-emerald-100 text-emerald-800" : s.pontos >= 40 ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}>
                      {s.pontos >= 100 ? "forte" : s.pontos >= 40 ? "provável" : "fraco"}
                    </span>
                    <span className="block text-slate-500">{s.fonte}{s.detalhe ? ` · ${s.detalhe}` : ""}</span>
                  </button>
                </li>
              ))}
              <li className="text-2xs text-slate-500">Escolha um e confirme com o contador antes de emitir a nota.</li>
            </ul>
          )
      )}
    </div>
  );
}
