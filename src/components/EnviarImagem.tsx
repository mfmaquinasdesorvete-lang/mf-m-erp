// Envio de imagem (logo, ícone, foto) para o armazenamento público: devolve o endereço para gravar no cadastro.
import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { DEMO, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";

const BUCKET = "produtos-fotos";
const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Envia a imagem para o armazenamento público (na pasta indicada) e devolve o endereço. */
export function EnviarImagem({ rotulo, dica, url, nome, pasta, quadrado, onUrl }: { rotulo: string; dica: string; url?: string | null; nome: string; pasta: string; quadrado?: boolean; onUrl: (u: string | null) => void }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  async function enviar(f: File) {
    if (!TIPOS.includes(f.type)) return notify("Use PNG, JPG, WEBP ou SVG", "erro");
    if (f.size > 2 * 1024 * 1024) return notify("A imagem passa de 2 MB: diminua e envie de novo", "erro");
    setEnviando(true);
    try {
      if (DEMO) { onUrl(URL.createObjectURL(f)); notify("Prévia: a imagem não é salva"); return; }
      const ext = f.name.split(".").pop()?.toLowerCase() || "png";
      const caminho = `${pasta}/${nome}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, f, { contentType: f.type, upsert: false });
      if (error) throw error;
      onUrl(supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl);
      notify(`${rotulo} enviado: toque em Salvar para usar`);
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }
  return (
    <div className="flex items-center gap-3">
      <div className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] ${quadrado ? "h-16 w-16" : "h-16 w-28"}`}>
        {url ? <img src={url} alt={rotulo} className="max-h-full max-w-full object-contain" /> : <span className="text-2xs text-slate-400">sem {rotulo.toLowerCase().split(" ")[0]}</span>}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{rotulo}</div>
        <div className="text-xs text-slate-500">{dica}</div>
        <div className="mt-1.5 flex gap-2">
          <input ref={arquivo} type="file" accept={TIPOS.join(",")} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
          <Button type="button" variant="secondary" disabled={enviando} onClick={() => arquivo.current?.click()}><ImageUp size={15} /> {enviando ? "Enviando…" : url ? "Trocar" : "Enviar"}</Button>
          {url && <Button type="button" variant="ghost" onClick={() => onUrl(null)} title={`Tirar ${rotulo.toLowerCase()}`} aria-label={`Tirar ${rotulo.toLowerCase()}`}><Trash2 size={15} /></Button>}
        </div>
      </div>
    </div>
  );
}
