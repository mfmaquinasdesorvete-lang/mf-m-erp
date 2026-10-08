// Impressão direta de um PDF (um clique): abre a janela de impressão do navegador sem mostrar o visualizador.
// No celular (onde o navegador não imprime PDF embutido) abre o PDF, que já tem o botão de imprimir/compartilhar.
export function imprimirPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const celular = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (celular) { window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 120_000); return; }
  const quadro = document.createElement("iframe");
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  quadro.src = url;
  quadro.onload = () => {
    try { quadro.contentWindow?.focus(); quadro.contentWindow?.print(); } catch { window.open(url, "_blank"); }
    setTimeout(() => { quadro.remove(); URL.revokeObjectURL(url); }, 120_000);
  };
  document.body.appendChild(quadro);
}
