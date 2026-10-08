import { useRef, useState } from "react";
import { Camera, ImageOff, Trash2 } from "lucide-react";
import { Button } from "./ui";
import { enviarFotoProduto, urlFotoProduto } from "@/lib/catalogo";
import { notifyError } from "@/lib/notify";

/** Foto do produto (vai para o catálogo do WhatsApp e para a vitrine). */
export function FotoProduto({ valor, onChange }: { valor: string | null | undefined; onChange: (caminho: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  async function escolher(f: File | undefined) {
    if (!f) return;
    setEnviando(true);
    try { onChange(await enviarFotoProduto(f)); } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {valor ? <img src={urlFotoProduto(valor)} alt="" className="h-full w-full object-cover" /> : <ImageOff size={26} className="text-slate-400" />}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" variant="secondary" disabled={enviando} onClick={() => input.current?.click()}>
          <Camera size={16} /> {enviando ? "Enviando…" : valor ? "Trocar foto" : "Tirar / escolher foto"}
        </Button>
        {valor && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => onChange(null)}><Trash2 size={15} /> Remover</Button>}
        <span className="text-xs text-slate-500">Fundo limpo, produto inteiro. Quadrada fica melhor.</span>
      </div>
    </div>
  );
}
