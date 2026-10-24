// Dúvida de manutenção com IA (Assistência e Perguntar à IA, só a equipe): a pessoa descreve o defeito, escolhe a
// máquina se souber, e a função ia-manutencao responde com as causas, os passos, as peças suspeitas e os cuidados,
// usando as dicas conferidas, as OS parecidas e as peças do ERP. O técnico ou o administrador marca "Virou dica" e a
// resposta entra na base (salvar_dica_manutencao) para as próximas perguntas.
import { useState, type FormEvent } from "react";
import { AlertTriangle, Check, Loader2, Wrench } from "lucide-react";
import { Button, Field, Modal } from "./ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { notify, notifyError } from "@/lib/notify";
import type { RespostaManutencao } from "../../supabase/functions/_shared/ia-manutencao";

type Resultado = { resposta: RespostaManutencao; usados: { dicas: number; os: number; pecas: number } };
const CONFIANCA = { alta: "Confirmada pelo ERP", media: "Provável", baixa: "Pouca certeza" } as const;

export function DuvidaManutencao({ inicial = "", onClose }: { inicial?: string; onClose: () => void }) {
  const { tem, papel } = usePerfil();
  const podeSalvar = papel === "admin" || tem("tecnico");
  const { data: maquinas = [] } = useRows<{ id: string; descricao: string }>("produtos", {
    select: "id, descricao", order: "descricao", ascending: true, key: ["duvida_manutencao"], filtro: (q) => q.eq("ativo", true).eq("tipo", "maquina"),
  });
  const [duvida, setDuvida] = useState(inicial);
  const [maquina, setMaquina] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Resultado | null>(null);
  const [salva, setSalva] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function perguntar(e?: FormEvent) {
    e?.preventDefault();
    if (duvida.trim().length < 6) return;
    setOcupado(true); setErro(null); setR(null); setSalva(false);
    try { setR(await callFunction<Resultado>("ia-manutencao", { duvida, produto_id: maquina || null })); }
    catch (x) { setErro((x as Error).message); }
    finally { setOcupado(false); }
  }

  async function virouDica() {
    if (!r || salvando) return;
    setSalvando(true);
    const solucao = [r.resposta.resumo, ...r.resposta.passos.map((p, i) => `${i + 1}. ${p}`)].join("\n");
    const modelo = maquinas.find((m) => m.id === maquina)?.descricao ?? null;
    const { error } = await supabase.rpc("salvar_dica_manutencao", { p_defeito: duvida.trim(), p_solucao: solucao, p_produto_id: maquina || null, p_modelo: modelo, p_origem: "ia" });
    setSalvando(false);
    if (error) { notifyError(error); return; }
    setSalva(true);
    notify("Dica salva: a IA usa nas próximas perguntas");
  }

  const res = r?.resposta;
  return (
    <Modal open onClose={onClose} title="Dúvida de manutenção" wide>
      <form onSubmit={perguntar} className="space-y-3">
        <Field label="O que a máquina está fazendo?">
          <textarea className="input min-h-[80px]" value={duvida} onChange={(e) => setDuvida(e.target.value)} maxLength={1000} autoFocus
            placeholder="Ex.: A 200 não está congelando, o compressor liga e desliga sozinho" />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Máquina (se souber)" className="min-w-0 flex-1 basis-56">
            <select className="input" value={maquina} onChange={(e) => setMaquina(e.target.value)}>
              <option value="">Não sei / qualquer uma</option>
              {maquinas.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
            </select>
          </Field>
          <Button type="submit" disabled={ocupado || duvida.trim().length < 6}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} {ocupado ? "Pensando…" : "Perguntar"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">No celular dá para falar: toque no campo e use o 🎤 do teclado.</p>
      </form>

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{erro}</p>}

      {res && (
        <div className="mt-4 space-y-3 text-sm" aria-live="polite">
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-sky-900">
            <p className="font-semibold">{res.resumo}</p>
            <p className="mt-1 text-xs">{CONFIANCA[res.confianca]} · fontes: {res.fontes.join(", ")}</p>
          </div>
          {res.seguranca && <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {res.seguranca}</p>}
          {res.chamar_tecnico && <p className="rounded-lg bg-rose-50 px-3 py-2 font-semibold text-rose-800">🛠️ Isso é com o técnico: não abrir a máquina sem ele.</p>}
          {res.causas.length > 0 && (
            <div><h3 className="mb-1 font-semibold text-fg">O que pode ser</h3><ul className="list-disc space-y-0.5 pl-5">{res.causas.map((c) => <li key={c}>{c}</li>)}</ul></div>
          )}
          {res.passos.length > 0 && (
            <div><h3 className="mb-1 font-semibold text-fg">O que conferir, em ordem</h3><ol className="list-decimal space-y-0.5 pl-5">{res.passos.map((p) => <li key={p}>{p}</li>)}</ol></div>
          )}
          {res.pecas.length > 0 && (
            <div><h3 className="mb-1 font-semibold text-fg">Peças que podem precisar trocar</h3>
              <ul className="space-y-0.5">{res.pecas.map((p) => <li key={p.descricao}>{p.descricao}{p.sku ? <span className="ml-1 font-mono text-xs text-slate-500">{p.sku}</span> : null}</li>)}</ul></div>
          )}
          <p className="text-xs text-slate-500">Usou do ERP: {r!.usados.dicas} dicas, {r!.usados.os} OS parecidas e {r!.usados.pecas} peças. A IA pode errar: confirme com o técnico antes de trocar peça ou passar ao cliente.</p>
          {podeSalvar && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={virouDica} disabled={salva || salvando}><Check className="h-4 w-4" /> {salva ? "Dica salva" : "Virou dica (a resposta está certa)"}</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
