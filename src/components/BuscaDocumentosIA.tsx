// "Achar pelo assunto" (Documentos): a pessoa escreve o que procura e a função ia-busca-docs aponta os anexos que
// respondem (pelo nome, onde está anexado e o resumo da IA). Só aponta: abrir é pelo link do ERP, como sempre.
import { useState, type FormEvent } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "./ui";
import { callFunction } from "@/lib/supabase";
import { dataBR } from "@/lib/format";
import { IconeArquivo, abrirDocumento, type Documento } from "./Anexos";
import { BotaoResumir } from "./ResumoDocumento";

export function BuscaDocumentosIA({ docs }: { docs: Documento[] }) {
  const [pergunta, setPergunta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [achados, setAchados] = useState<{ id: string; motivo: string }[] | null>(null);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (ocupado || pergunta.trim().length < 3) return;
    setOcupado(true); setErro(null); setAchados(null);
    try { setAchados((await callFunction<{ achados: { id: string; motivo: string }[] }>("ia-busca-docs", { pergunta: pergunta.trim() })).achados); }
    catch (x) { setErro((x as Error).message); }
    finally { setOcupado(false); }
  }

  const lista = (achados ?? []).flatMap((a) => { const d = docs.find((x) => x.id === a.id); return d ? [{ d, motivo: a.motivo }] : []; });
  return (
    <div className="cartao p-4 sm:p-5">
      <form onSubmit={buscar} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 basis-64 text-sm">
          <span className="mb-1 flex items-center gap-1.5 font-semibold text-fg"><Sparkles size={15} className="text-violet-700" aria-hidden /> Achar pelo assunto</span>
          <input className="input" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={300}
            placeholder="Ex.: contrato da loja de Paulínia, manual da A 200, boleto do aluguel" />
        </label>
        <Button type="submit" disabled={ocupado || pergunta.trim().length < 3}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {ocupado ? "Procurando…" : "Procurar"}
        </Button>
      </form>
      <p className="mt-1 text-xs text-slate-500">A IA procura pelo nome, por onde o arquivo está anexado e pelo resumo (quando já foi resumido). Documentos de funcionários não entram.</p>
      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{erro}</p>}
      {achados && (
        lista.length ? (
          <ul className="mt-3 divide-y divide-slate-100" aria-live="polite">
            {lista.map(({ d, motivo }) => (
              <li key={d.id} className="flex items-start gap-2 py-2 text-sm">
                <span className="mt-0.5"><IconeArquivo tipo={d.tipo} /></span>
                <span className="min-w-0 flex-1">
                  <button type="button" className="block max-w-full truncate text-left font-medium text-fg hover:underline" onClick={() => abrirDocumento(d)}>{d.nome}</button>
                  <span className="block text-xs text-slate-500">{motivo} · {dataBR(d.created_at)}</span>
                </span>
                <BotaoResumir d={d} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-500" aria-live="polite">Não achei nenhum documento sobre isso. Tente com outras palavras.</p>
      )}
    </div>
  );
}
