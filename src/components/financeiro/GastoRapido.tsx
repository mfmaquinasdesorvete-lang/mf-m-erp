// Gasto rápido pelo celular: falar ("gastei 80 de gasolina ontem") ou digitar, tirar a foto do cupom e conferir.
// A fala vira texto no próprio aparelho (reconhecimento de voz do navegador); o ERP sugere valor, data e categoria.
// A foto vai junto como comprovante, e o QR Code da NFC-e (quando o aparelho lê) entra como nº do documento.
// O gasto entra como conta a pagar em revisão: passa pelas Aprovações como qualquer outra conta.
import { useRef, useState, type FormEvent } from "react";
import { Camera, Check, Mic, MicOff, X } from "lucide-react";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { hoje } from "@/lib/format";
import { lerValor } from "@/lib/auditoriaBusca";
import { enviarDocumentos } from "@/components/Anexos";
import { chaveDoQrCode, interpretarGasto } from "@/lib/gastoRapido";

type Categoria = { nome: string; tipo: string; ativo: boolean | null };
export type Reconhecedor = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

/** O reconhecimento de voz do navegador (Chrome, Edge, Safari); sem ele, a pessoa digita. */
export const Reconhecimento = () => (window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Reconhecedor }).webkitSpeechRecognition;

/** Lê o QR Code da foto (Chrome/Android têm o leitor; no iPhone a foto vai só como comprovante). */
async function lerQrCode(arquivo: File): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (b: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const imagem = await createImageBitmap(arquivo);
    const achados = await new Detector({ formats: ["qr_code"] }).detect(imagem);
    for (const a of achados) { const c = chaveDoQrCode(a.rawValue); if (c) return c; }
  } catch { /* sem leitura: segue sem a chave */ }
  return null;
}

export function GastoRapido({ onClose }: { onClose: () => void }) {
  const invalidar = useInvalidate();
  const { padrao } = useUnidade();
  const { data: categorias = [] } = useRows<Categoria>("categorias_financeiras", { order: "ordem", ascending: true });
  const despesas = categorias.filter((c) => c.tipo === "despesa" && c.ativo !== false);
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [categoria, setCategoria] = useState("outros");
  const [jaPago, setJaPago] = useState(true);
  const [foto, setFoto] = useState<File | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [ouvindo, setOuvindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const temVoz = !!Reconhecimento();

  // a fala preenche tudo; digitando, só completa o que ainda está vazio (não desfaz o que a pessoa corrigiu)
  function aplicar(t: string, tudo: boolean) {
    setTexto(t);
    const g = interpretarGasto(t, hoje());
    if (g.valor && (tudo || !valor)) setValor(g.valor.toFixed(2).replace(".", ","));
    if (tudo || data === hoje()) setData(g.data);
    if (g.categoria && (tudo || categoria === "outros")) setCategoria(g.categoria);
  }

  function falar() {
    const R = Reconhecimento();
    if (!R) return notify("Este navegador não reconhece voz. Digite o gasto.", "erro");
    if (ouvindo) { rec.current?.stop(); return; }
    const r = new R();
    r.lang = "pt-BR"; r.interimResults = false; r.continuous = false;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(" "); aplicar(t, true); };
    r.onend = () => setOuvindo(false);
    r.onerror = (e) => { setOuvindo(false); if (e.error !== "aborted") notify("Não deu para ouvir. Tente de novo ou digite.", "erro"); };
    rec.current = r; setOuvindo(true); r.start();
  }

  async function escolherFoto(f: File | null) {
    setFoto(f); setChave(null);
    if (f) { const c = await lerQrCode(f); if (c) { setChave(c); notify("QR Code do cupom lido"); } }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = lerValor(valor) ?? NaN; // "45.90" é quarenta e cinco e noventa
    if (!(v > 0)) return notify("Informe o valor do gasto", "erro");
    if (!texto.trim()) return notify("Escreva ou fale o que foi o gasto", "erro");
    setGravando(true);
    try {
      const { data: conta, error } = await supabase.from("contas_pagar").insert({
        descricao: texto.trim().slice(0, 200), categoria, valor: v, vencimento: data, emissao: data,
        unidade_id: padrao || null, documento: chave, lancamento: "manual",
        observacoes: [`Gasto rápido lançado pelo celular${jaPago ? "; já foi pago (conferir no extrato)" : ""}.`, chave ? `Chave da NFC-e: ${chave}` : ""].filter(Boolean).join(" "),
      }).select("id").single();
      if (error) throw error;
      invalidar("contas_pagar", "documentos");
      // a conta já foi lançada: se só a foto falhar, fecha e avisa (tentar de novo lançaria o gasto em dobro)
      if (foto && conta) {
        try { await enviarDocumentos("conta_pagar", conta.id, [foto]); } catch {
          notify("Gasto lançado, mas a foto não foi enviada: anexe pela conta em Contas a pagar", "erro");
          onClose();
          return;
        }
      }
      notify("Gasto lançado: vai para as Aprovações");
      onClose();
    } catch (err) { notifyError(err); } finally { setGravando(false); }
  }

  const campo = "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-noite-texto placeholder:text-fixo-gray-500";
  return (
    <div className="fixed inset-0 z-janela flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Lançar gasto">
      <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0f1420] p-5 text-noite-texto sm:rounded-3xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Lançar gasto</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-noite-fraco hover:bg-white/10"><X size={20} /></button>
        </div>

        {temVoz && (
          <button type="button" onClick={falar}
            className={`mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold ${ouvindo ? "animate-pulse bg-fixo-rose-400 text-[#1a0508]" : "bg-fixo-cyan-400 text-[#05131a]"}`}>
            {ouvindo ? <><MicOff size={22} /> Ouvindo… toque para parar</> : <><Mic size={22} /> Falar o gasto</>}
          </button>
        )}
        <label className="block text-xs font-semibold text-noite-fraco">O que foi
          <textarea className={`${campo} mt-1`} rows={2} value={texto} onChange={(e) => aplicar(e.target.value, false)}
            placeholder='Ex.: "gastei 80 reais de gasolina ontem"' />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold text-noite-fraco">Valor (R$)
            <input className={`${campo} num mt-1 text-lg font-bold`} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </label>
          <label className="block text-xs font-semibold text-noite-fraco">Data
            <input type="date" className={`${campo} mt-1`} value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-noite-fraco">Categoria
          <select className={`${campo} mt-1`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {!despesas.some((c) => c.nome === categoria) && <option value={categoria}>{categoria}</option>}
            {despesas.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
          </select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} className="h-5 w-5" /> Já foi pago (cartão, Pix ou dinheiro)
        </label>

        <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 py-3 text-sm font-semibold text-noite-medio">
          <Camera size={18} /> {foto ? `Foto: ${foto.name.slice(0, 28)}` : "Foto do cupom ou da nota"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => escolherFoto(e.target.files?.[0] ?? null)} />
        </label>
        {chave && <p className="mt-1 text-xs text-fixo-emerald-300">NFC-e lida: …{chave.slice(-10)}</p>}

        <button type="submit" disabled={gravando}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-fixo-emerald-500 py-3.5 text-base font-bold text-noite-tinta disabled:opacity-50">
          <Check size={20} /> {gravando ? "Gravando…" : "Lançar gasto"}
        </button>
        <p className="mt-2 text-center text-xs text-noite-fraco">Confira os campos antes de lançar. O gasto passa pelas Aprovações.</p>
      </form>
    </div>
  );
}
