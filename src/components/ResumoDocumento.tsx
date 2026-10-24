// "Resumir com IA" de um documento anexado (PDF ou foto): mostra o resumo já guardado ou pede à função ia-resumo (o que
// é, pontos, datas, valores e o que fazer). Só resume: o documento vale. Documentos de funcionários e pessoais não vão.
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button, Modal } from "./ui";
import { callFunction, supabase } from "@/lib/supabase";
import { dataBR } from "@/lib/format";
import { podeResumir, type ResumoDocumento as Resumo } from "../../supabase/functions/_shared/ia-resumo";
import type { Documento } from "./Anexos";

export { podeResumir };

/** Botão pequeno da linha do documento; abre a janela do resumo. */
export function BotaoResumir({ d }: { d: Documento }) {
  const [aberto, setAberto] = useState(false);
  if (!podeResumir(d)) return null;
  return (
    <>
      <button type="button" className="botao-icone p-1" title="Resumir com IA" aria-label={`Resumir ${d.nome} com IA`} onClick={() => setAberto(true)}><Sparkles size={15} /></button>
      {aberto && <ResumoDocumento d={d} onClose={() => setAberto(false)} />}
    </>
  );
}

export function ResumoDocumento({ d, onClose }: { d: Documento; onClose: () => void }) {
  const [r, setR] = useState<{ resumo: Resumo; criado_em?: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    supabase.from("ia_resumos_documentos").select("resumo, criado_em").eq("documento_id", d.id).maybeSingle().then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(error.message);
      else if (data) setR(data as { resumo: Resumo; criado_em: string });
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [d.id]);

  async function resumir() {
    setOcupado(true); setErro(null);
    try { setR(await callFunction<{ resumo: Resumo }>("ia-resumo", { documento_id: d.id })); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }

  const res = r?.resumo;
  return (
    <Modal open onClose={onClose} title={`Resumo · ${d.nome}`}>
      <div className="space-y-3 text-sm">
        {carregando ? <p className="text-slate-500">Carregando…</p> : !res ? (
          <div className="space-y-3">
            <p className="text-slate-600">A IA lê o documento e mostra o que é, os pontos principais, as datas, os valores e o que precisa ser feito. O resumo fica guardado para as próximas vezes.</p>
            <div className="flex justify-end">
              <Button onClick={resumir} disabled={ocupado}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {ocupado ? "Lendo o documento…" : "Resumir com IA"}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3" aria-live="polite">
            <div className="rounded-lg bg-violet-50 px-3 py-2 text-violet-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{res.tipo_documento}</p>
              <p className="mt-0.5">{res.resumo}</p>
            </div>
            {res.pendencias.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><p className="font-semibold">O que fazer</p>
                <ul className="list-disc pl-5">{res.pendencias.map((p) => <li key={p}>{p}</li>)}</ul></div>
            )}
            {res.pontos.length > 0 && <div><h3 className="mb-1 font-semibold text-fg">Pontos principais</h3><ul className="list-disc space-y-0.5 pl-5">{res.pontos.map((p) => <li key={p}>{p}</li>)}</ul></div>}
            {res.datas.length > 0 && <div><h3 className="mb-1 font-semibold text-fg">Datas e prazos</h3><ul className="space-y-0.5">{res.datas.map((x) => <li key={x.data + x.o_que}><b>{x.data}</b> · {x.o_que}</li>)}</ul></div>}
            {res.valores.length > 0 && <div><h3 className="mb-1 font-semibold text-fg">Valores</h3><ul className="space-y-0.5">{res.valores.map((x) => <li key={x.valor + x.o_que}><b className="num">{x.valor}</b> · {x.o_que}</li>)}</ul></div>}
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-500">Resumo da IA{r?.criado_em ? ` de ${dataBR(r.criado_em)}` : ""}: confira no documento antes de decidir.</p>
              <Button variant="ghost" className="ml-auto" onClick={resumir} disabled={ocupado}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Resumir de novo</Button>
            </div>
          </div>
        )}
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{erro}</p>}
      </div>
    </Modal>
  );
}
