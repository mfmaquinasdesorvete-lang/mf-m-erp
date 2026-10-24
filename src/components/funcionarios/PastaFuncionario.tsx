// Pasta de documentos de um funcionário, separada em divisões (contrato, exames, férias, holerites, atestados, outros).
// Os arquivos ficam no bucket privado "documentos" (entidade "funcionario"); só admin e financeiro veem (o banco garante).
import { useRef, useState } from "react";
import { FolderOpen, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { IconeArquivo, abrirDocumento, apagarDocumento, enviarDocumentos, tamanhoArquivo, type Documento } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, pl } from "@/lib/format";
import { PASTAS, pastaDo } from "@/lib/pastaFuncionario";

export function PastaFuncionario({ id }: { id: string | null | undefined }) {
  const { data: docs = [] } = useRows<Documento>("documentos", {
    key: ["funcionario", id], enabled: !!id, order: "created_at", ascending: false,
    filtro: (q) => q.eq("entidade", "funcionario").eq("entidade_id", id!),
  });
  const [enviando, setEnviando] = useState<string | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pastaEscolhida = useRef<string>("outros");
  const invalidar = useInvalidate();
  const { user_id, papel } = usePerfil();

  async function enviar(pasta: string, lista: FileList | null) {
    if (!lista?.length || !id || enviando) return;
    setEnviando(pasta);
    try {
      const n = await enviarDocumentos("funcionario", id, [...lista], pasta);
      if (n) notify(`${n} ${pl(n, "arquivo guardado", "arquivos guardados")} em ${PASTAS.find((p) => p.value === pasta)?.label}`);
    } finally { setEnviando(null); invalidar("documentos"); }
  }

  async function mudarPasta(d: Documento, pasta: string) {
    setMexendo(d.id);
    try {
      const { error } = await supabase.from("documentos").update({ pasta }).eq("id", d.id);
      if (error) notifyError(error); else invalidar("documentos");
    } finally { setMexendo(null); }
  }

  if (!id) return <p className="text-sm text-slate-500"><FolderOpen size={14} className="mr-1 inline" />Salve primeiro para guardar documentos na pasta.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => { enviar(pastaEscolhida.current, e.target.files); e.target.value = ""; }} />
      {PASTAS.map((p) => {
        const daPasta = docs.filter((d) => pastaDo(d) === p.value);
        return (
          <section key={p.value}
            onDragOver={(e) => { e.preventDefault(); setAlvo(p.value); }} onDragLeave={() => setAlvo(null)}
            onDrop={(e) => { e.preventDefault(); setAlvo(null); enviar(p.value, e.dataTransfer.files); }}
            className={`rounded-xl border border-dashed p-3 ${alvo === p.value ? "border-brand bg-brand-light" : "border-slate-300"}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold"><FolderOpen size={15} /> {p.label}
                {daPasta.length > 0 && <span className="text-slate-500">({daPasta.length})</span>}</span>
              <Button type="button" variant="secondary" disabled={!!enviando}
                onClick={() => { pastaEscolhida.current = p.value; input.current?.click(); }}>
                <Upload size={15} /> {enviando === p.value ? "Enviando…" : "Guardar"}
              </Button>
            </div>
            {daPasta.length ? (
              <ul className="divide-y divide-slate-100">
                {daPasta.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <IconeArquivo tipo={d.tipo} />
                    <button type="button" className="min-w-0 flex-1 truncate text-left font-medium text-fg hover:underline" onClick={() => abrirDocumento(d)}>{d.nome}</button>
                    <span className="shrink-0 text-xs text-slate-500">{tamanhoArquivo(d.tamanho)} · {dataBR(d.created_at)}</span>
                    {(d.created_by === user_id || papel === "admin") && <>
                      <select aria-label="Mudar de divisão" value={pastaDo(d)} disabled={mexendo === d.id}
                        onChange={(e) => mudarPasta(d, e.target.value)} className="max-w-[7rem] rounded border border-slate-300 bg-white px-1 py-0.5 text-xs">
                        {PASTAS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                      <button type="button" aria-label="Apagar" className="botao-icone-perigo p-1" disabled={mexendo === d.id} aria-busy={mexendo === d.id || undefined}
                        onClick={async () => { setMexendo(d.id); try { if (await apagarDocumento(d)) invalidar("documentos"); } finally { setMexendo(null); } }}><Trash2 size={15} /></button>
                    </>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500">{p.dica}. Arraste aqui ou use Guardar.</p>}
          </section>
        );
      })}
    </div>
  );
}
