import { useEffect, useMemo, useRef } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { Button, Modal } from "./ui";
import { notify } from "@/lib/notify";

/** Mostra o PDF gerado com opções de baixar e compartilhar (no celular abre o WhatsApp, e-mail etc.). */
export function PdfViewer({ blob, nome, titulo, onClose }: { blob: Blob; nome: string; titulo: string; onClose: () => void }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const arquivo = useMemo(() => new File([blob], nome, { type: "application/pdf" }), [blob, nome]);
  const podeCompartilhar = typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [arquivo] });

  const quadro = useRef<HTMLIFrameElement>(null);
  function imprimir() {
    // computador: imprime direto; celular (sem impressão de PDF embutido): abre o PDF, que tem o botão de imprimir
    try { quadro.current?.contentWindow?.focus(); quadro.current?.contentWindow?.print(); }
    catch { window.open(url, "_blank"); }
  }

  async function compartilhar() {
    try {
      await navigator.share({ files: [arquivo], title: titulo });
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify("Não foi possível compartilhar daqui. Baixe o PDF e envie pelo WhatsApp.", "erro");
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo} wide>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {podeCompartilhar ? "Use Compartilhar para mandar direto pelo WhatsApp." : "Baixe o PDF e anexe na conversa do WhatsApp."}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={imprimir}><Printer size={16} /> Imprimir</Button>
          {podeCompartilhar && <Button variant="secondary" onClick={compartilhar}><Share2 size={16} /> Compartilhar</Button>}
          <a href={url} download={nome}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-dark">
            <Download size={16} /> Baixar PDF
          </a>
        </div>
      </div>
      <iframe ref={quadro} src={url} title={titulo} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-50" />
    </Modal>
  );
}
