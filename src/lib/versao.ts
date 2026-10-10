// Versão nova do ERP publicada enquanto a aba estava aberta.
// O site guarda os arquivos da versão anterior por um tempo, mas uma aba muito antiga pode pedir um arquivo
// que já saiu do servidor (ex.: o gerador de PDF). Em vez de recarregar sozinho (e perder o que está sendo
// digitado), o ERP avisa e a pessoa recarrega quando quiser.

/** Erro de "parte do sistema que não carregou" (arquivo de uma versão que já saiu do servidor). */
export function ehErroDeVersao(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

export const MSG_VERSAO = "O ERP foi atualizado. Salve o que estiver fazendo e recarregue a página para continuar.";

/** Script principal da página carregada agora (ex.: /assets/index-Czk0Jg8o.js). */
export function scriptAtual(doc: Pick<Document, "querySelector"> = document) {
  return doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute("src") ?? null;
}

/** Script principal anunciado pelo index.html publicado. */
export function scriptPublicado(html: string) {
  return /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1]
    ?? /src="([^"]*\/assets\/index-[^"]+\.js)"[^>]*type="module"/.exec(html)?.[1] ?? null;
}

/** Confere se há versão nova publicada (sem cache). null = não deu para saber. */
export async function haVersaoNova(): Promise<boolean | null> {
  const atual = scriptAtual();
  if (!atual) return null; // modo de desenvolvimento ou prévia
  try {
    const r = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const publicado = scriptPublicado(await r.text());
    return publicado ? publicado !== atual : null;
  } catch {
    return null;
  }
}
