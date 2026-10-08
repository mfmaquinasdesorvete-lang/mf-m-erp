// Documentos anexados a um registro (pedido, OS, cliente, fornecedor, produto, conta...).
// Arquivos no bucket privado "documentos"; abrir gera um link temporário.
import { useRef, useState } from "react";
import { FileText, Image as Imagem, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR } from "@/lib/format";
import { usePerfil } from "@/lib/auth";

export type Documento = { id: string; entidade: string; entidade_id: string | null; nome: string; caminho: string; tamanho: number | null; tipo: string | null; descricao: string | null; created_by: string | null; created_at: string };
export const ENTIDADES: Record<string, string> = {
  pedido: "Pedido / proposta", os: "Ordem de serviço", cliente: "Cliente", fornecedor: "Fornecedor", produto: "Produto",
  conta_receber: "Conta a receber", conta_pagar: "Conta a pagar", nfe_recebida: "NF-e de fornecedor", pedido_compra: "Pedido de compra",
  equipamento: "Máquina vendida", geral: "Empresa (geral)", fechamento: "Fechamento (contador)",
};
const LIMITE = 20 * 1024 * 1024;
export const tamanhoArquivo = (n: number | null) => !n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

export async function abrirDocumento(d: Documento) {
  const { data, error } = await supabase.storage.from("documentos").createSignedUrl(d.caminho, 600);
  if (error || !data?.signedUrl) return notifyError(error ?? new Error("não foi possível abrir"));
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function enviarDocumentos(entidade: string, entidadeId: string | null, arquivos: File[]) {
  let enviados = 0;
  for (const f of arquivos) {
    if (f.size > LIMITE) { notify(`${f.name}: maior que 20 MB`, "erro"); continue; }
    const limpo = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
    const caminho = `${entidade}/${entidadeId ?? "geral"}/${crypto.randomUUID()}-${limpo}`;
    const { error } = await supabase.storage.from("documentos").upload(caminho, f, { contentType: f.type || "application/octet-stream" });
    if (error) { notifyError(error); continue; }
    const { error: e2 } = await supabase.from("documentos").insert({ entidade, entidade_id: entidadeId, nome: f.name, caminho, tamanho: f.size, tipo: f.type || null });
    if (e2) { await supabase.storage.from("documentos").remove([caminho]); notifyError(e2); continue; }
    enviados++;
  }
  return enviados;
}

export async function apagarDocumento(d: Documento) {
  if (!confirm(`Apagar "${d.nome}"?`)) return false;
  const { error } = await supabase.from("documentos").delete().eq("id", d.id);
  if (error) { notifyError(error); return false; }
  await supabase.storage.from("documentos").remove([d.caminho]);
  return true;
}

export function IconeArquivo({ tipo }: { tipo: string | null }) {
  return tipo?.startsWith("image/") ? <Imagem size={18} className="text-sky-600" /> : <FileText size={18} className="text-brand" />;
}

/** Lista + envio de anexos de um registro. */
export function Anexos({ entidade, id, titulo = "Documentos" }: { entidade: string; id: string | null | undefined; titulo?: string }) {
  const { data: todos = [] } = useRows<Documento>("documentos", {});
  const docs = todos.filter((d) => d.entidade === entidade && d.entidade_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [ocupado, setOcupado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const invalidar = useInvalidate();
  const { user_id, papel } = usePerfil();

  async function enviar(lista: FileList | null) {
    if (!lista?.length || !id) return;
    setOcupado(true);
    const n = await enviarDocumentos(entidade, id, [...lista]);
    setOcupado(false);
    if (n) notify(`${n} arquivo(s) anexado(s)`);
    invalidar("documentos");
  }

  if (!id) return <p className="text-sm text-slate-500"><Paperclip size={14} className="mr-1 inline" />Salve primeiro para anexar documentos.</p>;
  return (
    <div onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}
      className={`rounded-xl border border-dashed p-3 ${arrastando ? "border-brand bg-brand-light" : "border-slate-300"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Paperclip size={15} /> {titulo} {docs.length > 0 && <span className="text-slate-500">({docs.length})</span>}</span>
        <Button type="button" variant="secondary" disabled={ocupado} onClick={() => input.current?.click()}><Upload size={15} /> {ocupado ? "Enviando…" : "Anexar"}</Button>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
      </div>
      {docs.length ? (
        <ul className="divide-y divide-slate-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
              <IconeArquivo tipo={d.tipo} />
              <button type="button" className="min-w-0 flex-1 truncate text-left font-medium text-fg hover:underline" onClick={() => abrirDocumento(d)}>{d.nome}</button>
              <span className="shrink-0 text-xs text-slate-500">{tamanhoArquivo(d.tamanho)} · {dataBR(d.created_at)}</span>
              {(d.created_by === user_id || papel === "admin") && (
                <button type="button" aria-label="Apagar" className="rounded p-1 text-slate-400 hover:text-red-600"
                  onClick={async () => { if (await apagarDocumento(d)) invalidar("documentos"); }}><Trash2 size={15} /></button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">Arraste arquivos aqui ou use Anexar (PDF, fotos, planilhas; até 20 MB cada).</p>}
    </div>
  );
}
