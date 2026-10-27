// Galeria do produto: fotos e vídeos curtos (reduzidos antes de subir) e, nas máquinas, os documentos (manual da
// máquina, manual elétrico/esquema e dicas de manutenção). Tirar da galeria só esconde (ativo = false).
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, ImagePlus, Link2, Loader2, Play, Star, Trash2, Video, X } from "lucide-react";
import { Button, useFecharComEsc } from "../ui";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { ehLinkCalameo, enviarMidia, linkDocumento, NOME_MIDIA, tamanhoTexto, urlMidia, VIDEO_MAX_SEG, type Midia, type TipoMidia } from "@/lib/midia";
import { confirmar } from "@/components/Dialogos";
import { AlcaArrastar, useArrastar } from "@/components/Arrastar";
import { moverNaLista } from "@/lib/arrastar";

export function useMidiaProduto(produtoId: string | null | undefined) {
  return useQuery({
    queryKey: ["produtos_midia", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos_midia").select("*").eq("produto_id", produtoId!).eq("ativo", true)
        .order("ordem", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Midia[];
    },
  });
}

/** Fotos e vídeos do produto, com envio (já reduzido) e visualização grande. */
export function GaleriaProduto({ produtoId, podeEditar, fotoPrincipal, aoEscolherPrincipal }: {
  produtoId?: string | null; podeEditar: boolean; fotoPrincipal?: string | null; aoEscolherPrincipal?: (url: string) => void;
}) {
  const qc = useQueryClient();
  const { data: midia = [] } = useMidiaProduto(produtoId);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Midia | null>(null);
  const fotos = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  if (!produtoId) return <span className="text-xs text-slate-500">Salve o produto para montar a galeria de fotos e vídeos.</span>;
  const galeria = midia.filter((m) => m.tipo === "foto" || m.tipo === "video");

  async function enviar(arquivos: FileList | null, tipo: TipoMidia) {
    if (!arquivos?.length) return;
    try {
      for (const [i, a] of [...arquivos].entries()) {
        setEnviando(tipo === "video" ? "Reduzindo o vídeo… 0%" : `Enviando foto ${i + 1} de ${arquivos.length}…`);
        await enviarMidia(produtoId!, a, tipo, null, (pct) => setEnviando(`Reduzindo o vídeo… ${pct}%`));
      }
      notify(tipo === "video" ? "Vídeo enviado (já reduzido)" : `${arquivos.length === 1 ? "Foto enviada" : `${arquivos.length} fotos enviadas`}`);
      qc.invalidateQueries({ queryKey: ["produtos_midia", produtoId] });
    } catch (e) { notifyError(e); } finally { setEnviando(null); }
  }
  async function tirar(m: Midia) {
    if (!(await confirmar(`Tirar ${m.tipo === "video" ? "este vídeo" : "esta foto"} da galeria?`))) return;
    const { error } = await supabase.from("produtos_midia").update({ ativo: false }).eq("id", m.id);
    if (error) return notifyError(error);
    qc.invalidateQueries({ queryKey: ["produtos_midia", produtoId] });
  }

  return (
    <div className="space-y-2">
      {galeria.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Fotos e vídeos">
          {galeria.map((m) => {
            const url = urlMidia(m.caminho);
            const principal = m.tipo === "foto" && fotoPrincipal === url;
            return (
              <li key={m.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <button type="button" className="block h-full w-full" onClick={() => setAberta(m)} aria-label={m.tipo === "video" ? "Ver vídeo" : "Ver foto"}>
                  {m.tipo === "foto"
                    ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    : <span className="relative grid h-full w-full place-items-center bg-ink text-white">
                        <video src={url} muted preload="metadata" className="absolute inset-0 h-full w-full object-cover opacity-70" />
                        <Play size={28} className="relative drop-shadow" aria-hidden />
                      </span>}
                </button>
                {principal && <span className="absolute left-1 top-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-2xs font-bold text-amber-950">principal</span>}
                {m.tipo === "video" && m.duracao_seg != null && <span className="num absolute bottom-1 right-1 rounded bg-black/70 px-1 text-2xs text-white">{m.duracao_seg}s</span>}
                {podeEditar && (
                  <span className="absolute right-1 top-1 flex gap-1 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100">
                    {m.tipo === "foto" && aoEscolherPrincipal && !principal && (
                      <button type="button" title="Usar como foto principal" aria-label="Usar como foto principal" onClick={() => aoEscolherPrincipal(url)}
                        className="rounded-md bg-white/90 p-1 text-amber-600 shadow"><Star size={13} /></button>
                    )}
                    <button type="button" title="Tirar da galeria" aria-label="Tirar da galeria" onClick={() => tirar(m)} className="rounded-md bg-white/90 p-1 text-red-600 shadow"><Trash2 size={13} /></button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-slate-500">Nenhuma foto ou vídeo ainda. Fotos de vários ângulos (e do código gravado na peça) evitam devolução.</p>}
      <DicasFotos fotos={galeria.filter((m) => m.tipo === "foto").length + (fotoPrincipal ? 1 : 0)} />
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fotos} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { enviar(e.target.files, "foto"); e.target.value = ""; }} />
          <input ref={video} type="file" accept="video/*" className="hidden" onChange={(e) => { enviar(e.target.files, "video"); e.target.value = ""; }} />
          <Button type="button" variant="secondary" disabled={!!enviando} onClick={() => fotos.current?.click()}><ImagePlus size={15} /> Fotos</Button>
          <Button type="button" variant="secondary" disabled={!!enviando} onClick={() => video.current?.click()}><Video size={15} /> Vídeo rápido</Button>
          {enviando ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand"><Loader2 size={14} className="animate-spin" /> {enviando}</span>
            : <span className="text-xs text-slate-500">O site reduz sozinho: foto até 1600 px, vídeo em 720p até {VIDEO_MAX_SEG} s.</span>}
        </div>
      )}
      {aberta && <VerMidia m={aberta} onClose={() => setAberta(null)} />}
    </div>
  );
}

/** O que o Mercado Livre pede nas fotos (vale também para a loja): as fotos da galeria vão para o anúncio e para a
 *  página do produto depois da principal, na ordem daqui. */
function DicasFotos({ fotos }: { fotos: number }) {
  const poucas = fotos < 4;
  return (
    <details className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold text-fg">
        Fotos como o Mercado Livre pede: <span className={poucas ? "text-amber-700" : "text-emerald-700"}>{fotos} de até 10</span>
        {poucas ? " (o ideal é 4 ou mais)" : ""}
      </summary>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
        <li>A 1ª (a principal) é a miniatura do anúncio: só a peça, centralizada, em fundo branco ou claro, sem texto, logo, marca d&apos;água ou moldura.</li>
        <li>Depois, as outras: vários lados, detalhes (rosca, encaixe, código gravado), a peça montada na máquina, medidas e o que vem no pacote.</li>
        <li>Quadradas, de 1200 × 1200 px (mínimo 500 px). Acima de 800 px o Mercado Livre liga o zoom; o site já reduz para até 1600 px.</li>
        <li>Só fotos nossas: foto copiada de outro anúncio pode derrubar o anúncio.</li>
        <li>A ordem do anúncio e da loja é a ordem de envio: a 1ª enviada vem logo depois da principal.</li>
      </ul>
    </details>
  );
}

function VerMidia({ m, onClose }: { m: Midia; onClose: () => void }) {
  useFecharComEsc(true, onClose);
  const url = urlMidia(m.caminho);
  return (
    <div className="fixed inset-0 z-alerta grid place-items-center bg-black/85 p-3" role="dialog" aria-modal="true" aria-label={m.tipo === "video" ? "Vídeo" : "Foto"} onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Fechar"><X size={20} /></button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full">
        {m.tipo === "video"
          ? <video src={url} controls autoPlay playsInline className="max-h-[85vh] max-w-full rounded-lg" />
          : <img src={url} alt={m.titulo ?? ""} className="max-h-[85vh] max-w-full rounded-lg object-contain" />}
      </div>
    </div>
  );
}

export const TIPOS_DOC: TipoMidia[] = ["manual", "eletrico", "dicas", "outro"];

/** Documentos da máquina: manual, manual elétrico/esquema, dicas de manutenção (PDF ou imagem).
 *  Com tipos={["desenho"]}: o desenho técnico da peça (só uso interno; aparece na OP da tornearia e da mecânica). */
export function DocumentosMaquina({ produtoId, podeEditar, tipos = TIPOS_DOC }: { produtoId?: string | null; podeEditar: boolean; tipos?: TipoMidia[] }) {
  const ehDesenho = tipos.length === 1 && tipos[0] === "desenho";
  const qc = useQueryClient();
  const { data: midia = [] } = useMidiaProduto(produtoId);
  const [tipo, setTipo] = useState<TipoMidia>(tipos[0]);
  const [titulo, setTitulo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [link, setLink] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);
  const docs = midia.filter((m) => tipos.includes(m.tipo));
  // a lista de Máquinas → Manuais também conta os documentos de cada máquina
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["produtos_midia", produtoId] }); qc.invalidateQueries({ queryKey: ["produtos_midia", "maquinas"] }); };
  /** Grava a ordem nova dos documentos (o cliente vê nesta ordem pelo link da máquina). */
  async function ordenar(nova: Midia[]) {
    qc.setQueryData<Midia[]>(["produtos_midia", produtoId], (antes) => [...(antes ?? []).filter((m) => !tipos.includes(m.tipo)), ...nova]);
    const mudaram = nova.map((m, i) => ({ m, i })).filter(({ m, i }) => m.ordem !== i);
    for (const { m, i } of mudaram) {
      const { error } = await supabase.from("produtos_midia").update({ ordem: i }).eq("id", m.id);
      if (error) { notifyError(error); break; }
    }
    atualizar();
  }
  const arrastar = useArrastar(({ de, para, depois }) => {
    const i = docs.findIndex((m) => m.id === de), j = docs.findIndex((m) => m.id === para);
    if (i >= 0 && j >= 0) ordenar(moverNaLista(docs, i, j, depois));
  }, (id, passo) => {
    const i = docs.findIndex((m) => m.id === id);
    if (docs[i + passo]) ordenar(moverNaLista(docs, i, i + passo, passo === 1));
  });
  if (!produtoId) return <span className="text-xs text-slate-500">{ehDesenho ? "Escolha a peça para ver o desenho." : "Salve o produto para anexar os manuais."}</span>;

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviando(true);
    try {
      for (const a of lista) await enviarMidia(produtoId!, a, tipo, titulo || null);
      setTitulo("");
      notify("Documento anexado");
      atualizar();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }
  /** Link do Calameo (ou de outro site) no lugar do PDF: o cliente abre o mesmo endereço pelo link da máquina. */
  async function salvarLink() {
    const url = linkDocumento(link);
    if (!url) return notify("Cole um endereço de internet válido (ex.: o link do Calameo).", "erro");
    if (docs.some((m) => m.caminho === url)) return notify(ehDesenho ? "Este link já está nos desenhos da peça." : "Este link já está nos documentos da máquina.", "erro");
    setEnviando(true);
    try {
      const { error } = await supabase.from("produtos_midia").insert({
        produto_id: produtoId, tipo, titulo: titulo.trim() || null, caminho: url, mime: "text/uri-list", ordem: docs.length,
      });
      if (error) throw error;
      setLink(""); setTitulo("");
      notify("Link anexado");
      atualizar();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }
  async function tirar(m: Midia) {
    if (!(await confirmar(`Tirar "${m.titulo ?? NOME_MIDIA[m.tipo]}" dos documentos?`))) return;
    const { error } = await supabase.from("produtos_midia").update({ ativo: false }).eq("id", m.id);
    if (error) return notifyError(error);
    atualizar();
  }

  return (
    <div className="space-y-2">
      {docs.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {docs.map((m) => (
            <li key={m.id} {...arrastar.linha(m.id)} className={`relative flex items-center gap-3 px-3 py-2 ${arrastar.apagada(m.id) ? "opacity-40" : ""}`}>
              {arrastar.marca(m.id)}
              {podeEditar && docs.length > 1 && <AlcaArrastar nome={m.titulo || NOME_MIDIA[m.tipo]} {...arrastar.alca(m.id)} />}
              {ehLinkCalameo(m.caminho) ? <BookOpen size={18} className="shrink-0 text-brand" aria-hidden />
                : /^https?:/.test(m.caminho) ? <Link2 size={18} className="shrink-0 text-brand" aria-hidden /> : <FileText size={18} className="shrink-0 text-brand" aria-hidden />}
              <a href={urlMidia(m.caminho)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-semibold text-fg">{m.titulo || NOME_MIDIA[m.tipo]}</span>
                <span className="text-xs text-slate-500">{NOME_MIDIA[m.tipo]}{ehLinkCalameo(m.caminho) ? " · Calameo" : /^https?:/.test(m.caminho) ? " · link" : ""}{m.tamanho ? ` · ${tamanhoTexto(m.tamanho)}` : ""}</span>
              </a>
              {podeEditar && <button type="button" onClick={() => tirar(m)} className="botao-icone-perigo p-1" aria-label={`Tirar ${m.titulo ?? "documento"}`}><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">{ehDesenho ? "Nenhum desenho ainda. Anexe o PDF ou a foto do desenho com as medidas: ele fica na peça e aparece em toda OP dela." : "Nenhum manual ainda. O cliente recebe estes documentos pelo link da máquina dele."}</p>}
      {ehDesenho && docs.filter((m) => m.mime?.startsWith("image/")).map((m) => (
        <a key={`img-${m.id}`} href={urlMidia(m.caminho)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-white">
          <img src={urlMidia(m.caminho)} alt={m.titulo || "Desenho técnico"} className="mx-auto max-h-80 w-auto object-contain" loading="lazy" />
        </a>
      ))}
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          {tipos.length > 1 && <select className="input w-full sm:w-auto" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMidia)} aria-label="Tipo do documento">
            {tipos.map((t) => <option key={t} value={t}>{NOME_MIDIA[t]}</option>)}
          </select>}
          <input className="input min-w-0 flex-1 basis-40" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (opcional)" aria-label="Título do documento" />
          <input ref={arquivo} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="secondary" disabled={enviando} onClick={() => arquivo.current?.click()}>
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} {enviando ? "Enviando…" : ehDesenho ? "Anexar desenho (PDF ou foto)" : "Anexar PDF"}
          </Button>
          <form className="flex w-full flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); salvarLink(); }}>
            <input className="input min-w-0 flex-1 basis-56" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
              placeholder={ehDesenho ? "ou cole o link do desenho (Drive, site…)" : "ou cole o link do Calameo (calameo.com/read/…)"} aria-label="Link do documento (Calameo ou outro site)" />
            <Button type="submit" variant="secondary" disabled={enviando || !link.trim()}><Link2 size={15} /> Anexar link</Button>
          </form>
        </div>
      )}
    </div>
  );
}
