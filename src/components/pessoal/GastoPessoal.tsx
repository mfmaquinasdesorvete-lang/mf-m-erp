// Painel pessoal: lançar um gasto (ou entrada) falando, escrevendo ou com a foto do comprovante.
// A fala vira texto no próprio aparelho; o ERP sugere valor, data, conta e categoria para conferir.
// A foto vai para um balde só do dono (pessoal/<id do usuário>/…): nem o administrador do ERP vê.
import { useRef, useState, type FormEvent } from "react";
import { Camera, Mic, MicOff, Paperclip, Sparkles } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { Reconhecimento, type Reconhecedor } from "@/components/financeiro/GastoRapido";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { hoje } from "@/lib/format";
import { numeroBR } from "@/lib/fichaCadastral";
import { CATEGORIAS, categoriaDe, type ContaPessoal } from "@/lib/pessoal";
import { interpretarLancPessoal } from "@/lib/gastoPessoal";

export function GastoPessoal({ contas, contaInicial, onClose, onFeito }: {
  contas: ContaPessoal[]; contaInicial?: string; onClose: () => void; onFeito: () => void;
}) {
  const { user_id } = usePerfil();
  const [texto, setTexto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [sentido, setSentido] = useState<"saida" | "entrada">("saida");
  const [contaId, setContaId] = useState(contaInicial || contas[0]?.id || "");
  const [categoria, setCategoria] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const temVoz = !!Reconhecimento();

  // a fala preenche tudo; digitando, preenche o que a pessoa ainda não mexeu
  function aplicar(t: string) {
    setTexto(t);
    const g = interpretarLancPessoal(t, hoje(), contas);
    if (g.valor) setValor(g.valor.toFixed(2).replace(".", ","));
    setData(g.data);
    setSentido(g.sentido);
    if (g.conta_id) setContaId(g.conta_id);
    setDescricao(g.descricao);
    setCategoria(g.categoria);
  }

  function falar() {
    const R = Reconhecimento();
    if (!R) return notify("Este navegador não reconhece voz. Use o microfone do teclado ou digite.", "erro");
    if (ouvindo) { rec.current?.stop(); return; }
    const r = new R();
    r.lang = "pt-BR"; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => aplicar(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setOuvindo(false);
    r.onerror = (e) => { setOuvindo(false); if (e.error !== "aborted") notify("Não deu para ouvir. Tente de novo ou digite.", "erro"); };
    rec.current = r; setOuvindo(true); r.start();
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = numeroBR(valor);
    if (!v) return notify("Informe o valor", "erro");
    const desc = (descricao || texto).trim().slice(0, 200);
    if (!desc) return notify("Fale ou escreva o que foi", "erro");
    if (!contaId) return notify("Escolha a conta", "erro");
    setGravando(true);
    let caminho: string | null = null;
    try {
      if (foto) {
        if (foto.size > 10 * 1024 * 1024) throw new Error("A foto passa de 10 MB");
        const limpo = foto.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-60);
        caminho = `${user_id}/${crypto.randomUUID()}-${limpo}`;
        const { error } = await supabase.storage.from("pessoal").upload(caminho, foto, { contentType: foto.type || "image/jpeg" });
        if (error) throw error;
      }
      const { error } = await supabase.from("pessoal_lancamentos").insert({
        conta_id: contaId, data, descricao: desc, valor: sentido === "saida" ? -Math.abs(v) : Math.abs(v),
        categoria: categoria || categoriaDe(desc), situacao: "realizado", comprovante: caminho,
      });
      if (error) {
        if (caminho) await supabase.storage.from("pessoal").remove([caminho]);
        throw error;
      }
      notify(sentido === "saida" ? "Gasto lançado" : "Entrada lançada");
      onFeito();
    } catch (err) { notifyError(err); } finally { setGravando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Lançar por voz, texto ou foto">
      <form onSubmit={salvar} className="space-y-3">
        {temVoz && (
          <button type="button" onClick={falar} aria-pressed={ouvindo}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold ${ouvindo ? "animate-pulse bg-solido-vermelho text-white" : "bg-brand text-brand-fg"}`}>
            {ouvindo ? <><MicOff size={22} aria-hidden /> Ouvindo… toque para parar</> : <><Mic size={22} aria-hidden /> Falar o gasto</>}
          </button>
        )}
        <Field label="O que foi (fale ou escreva)">
          <textarea className="input" rows={2} value={texto} onChange={(e) => aplicar(e.target.value)} autoFocus={!temVoz}
            placeholder='Ex.: "gastei 45,90 no almoço ontem no cartão Nubank"' />
        </Field>
        {texto && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Sparkles size={13} aria-hidden /> Preenchi os campos abaixo pelo que você disse. Confira antes de lançar.</p>}

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Entrada ou saída">
          {([["saida", "Saída (gastei)", "bg-solido-vermelho"], ["entrada", "Entrada (recebi)", "bg-solido-verde"]] as const).map(([v, nome, cor]) => (
            <button key={v} type="button" aria-pressed={sentido === v} onClick={() => setSentido(v)}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold ${sentido === v ? `${cor} text-white` : "bg-slate-100 text-slate-600"}`}>{nome}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} placeholder="Ex.: Almoço" /></Field>
          <Field label="Valor (R$)"><input className="input num text-lg font-bold" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required /></Field>
          <Field label="Data"><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Field>
          <Field label="Conta">
            <select className="input" value={contaId} onChange={(e) => setContaId(e.target.value)} required>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </Field>
          <Field label="Categoria">
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Automática ({categoriaDe(descricao || texto)})</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          {foto ? <><Paperclip size={18} aria-hidden /> {foto.name.slice(0, 32)}</> : <><Camera size={18} aria-hidden /> Foto do comprovante (opcional)</>}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </label>
        <p className="text-xs text-slate-500">A foto fica guardada só para você, junto do lançamento.</p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={gravando}>{gravando ? "Gravando…" : sentido === "saida" ? "Lançar gasto" : "Lançar entrada"}</Button>
        </div>
      </form>
    </Modal>
  );
}
