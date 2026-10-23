import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Printer, Share2 } from "lucide-react";
import { Button, Modal } from "./ui";
import { notify } from "@/lib/notify";

/** Celular/tablet: o PDF num quadro (iframe) aparece no tamanho de uma folha A4 e fica cortado. */
const telaPequena = () =>
  typeof window !== "undefined" && (window.matchMedia("(max-width: 767px)").matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

/** Mostra o PDF gerado com opções de baixar e compartilhar (no celular abre o WhatsApp, e-mail etc.). */
export function PdfViewer({ blob, nome, titulo, onClose }: { blob: Blob; nome: string; titulo: string; onClose: () => void }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const arquivo = useMemo(() => new File([blob], nome, { type: "application/pdf" }), [blob, nome]);
  const podeCompartilhar = typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [arquivo] });
  const [celular] = useState(telaPequena);

  const quadro = useRef<HTMLIFrameElement>(null);
  function imprimir() {
    // computador: imprime direto; celular (sem impressão de PDF embutido): abre o PDF, que tem o botão de imprimir
    try {
      if (!quadro.current) throw new Error("sem quadro");
      quadro.current.contentWindow?.focus();
      quadro.current.contentWindow?.print();
    } catch { window.open(url, "_blank"); }
  }

  async function compartilhar() {
    try {
      await navigator.share({ files: [arquivo], title: titulo });
    } catch (e) {
      if ((e as Error).name !== "AbortError") notify("Não foi possível compartilhar daqui. Baixe o PDF e envie pelo WhatsApp.", "erro");
    }
  }

  const baixar = (
    <a href={url} download={nome}
      className="inline-flex min-h-toque items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-dark sm:min-h-0">
      <Download size={16} /> Baixar PDF
    </a>
  );

  return (
    <Modal open onClose={onClose} title={titulo} wide>
      <div className="mb-3 space-y-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:space-y-0">
        <p className="text-sm text-slate-500">
          {podeCompartilhar ? "Use Compartilhar para mandar direto pelo WhatsApp." : "Baixe o PDF e anexe na conversa do WhatsApp."}
        </p>
        {/* celular: Compartilhar em cima, ocupando a linha; Baixar e Imprimir lado a lado (nada sai da tela) */}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {podeCompartilhar && <Button variant="secondary" className="col-span-2 sm:col-span-1" onClick={compartilhar}><Share2 size={16} /> Compartilhar</Button>}
          <Button variant="secondary" onClick={imprimir}>{celular ? <ExternalLink size={16} /> : <Printer size={16} />} {celular ? "Abrir" : "Imprimir"}</Button>
          {baixar}
        </div>
      </div>
      {celular
        ? <PaginasPdf blob={blob} url={url} />
        : <iframe ref={quadro} src={url} title={titulo} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-50" />}
    </Modal>
  );
}

/** Desenha cada página na largura da tela (pdf.js), nítida e sem cortar. Se falhar, oferece abrir o PDF. */
function PaginasPdf({ blob, url }: { blob: Blob; url: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [situacao, setSituacao] = useState<"carregando" | "pronto" | "erro">("carregando");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
        }
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const alvo = caixa.current;
        if (!alvo || cancelado) return;
        alvo.replaceChildren();
        const largura = alvo.clientWidth || window.innerWidth - 32;
        const nitidez = Math.min(window.devicePixelRatio || 1, 3);
        for (let i = 1; i <= doc.numPages; i++) {
          const pagina = await doc.getPage(i);
          if (cancelado) return;
          const vista = pagina.getViewport({ scale: (largura / pagina.getViewport({ scale: 1 }).width) * nitidez });
          const tela = document.createElement("canvas");
          tela.width = Math.floor(vista.width);
          tela.height = Math.floor(vista.height);
          tela.style.width = "100%";
          tela.className = "block rounded-md bg-white shadow-sm ring-1 ring-slate-200";
          tela.setAttribute("aria-label", `Página ${i} de ${doc.numPages}`);
          alvo.appendChild(tela);
          await pagina.render({ canvasContext: tela.getContext("2d")!, viewport: vista }).promise;
          if (i === 1 && !cancelado) setSituacao("pronto");
        }
        doc.destroy();
      } catch {
        if (!cancelado) setSituacao("erro");
      }
    })();
    return () => { cancelado = true; };
  }, [blob]);

  return (
    <div>
      {situacao === "carregando" && <p className="py-10 text-center text-sm text-slate-500">Preparando a visualização…</p>}
      {situacao === "erro" && (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">
          Não deu para mostrar o PDF aqui. <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Abrir o PDF</a>
        </p>
      )}
      <div ref={caixa} className="space-y-3" />
    </div>
  );
}
