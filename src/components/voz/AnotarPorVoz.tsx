// Botão do microfone em todas as telas do ERP (celular, tablet e computador): a pessoa fala ("a cliente tal pagou a
// vídeo chamada", "a Braspress coletou a máquina do pedido 1520"), a IA entende (função ia-voz), a pessoa confere o
// resumo e o registro e confirma. A voz só anota: vira OBS no registro e aviso para quem confere (anotar_por_voz).
// Sem a IA (chave não cadastrada ou fora do ar) dá para anotar do mesmo jeito, escolhendo o tipo e escrevendo.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Mic, MicOff, RotateCcw, Sparkles } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useVisivel } from "@/lib/menu";
import { usePerfil } from "@/lib/auth";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import {
  acharPessoa, ouvir, suportaVoz, TIPOS, tiposPermitidos, type CandidatoVoz, type RespostaVoz, type TipoVoz,
} from "@/lib/anotacoesVoz";

type Etapa = "ouvindo" | "texto" | "entendendo" | "confirmar" | "gravando";
const SEM_REGISTRO = "";

export function AnotarPorVoz() {
  const { papel } = usePerfil();
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  // PDV (caixa) e contador ficam sem o botão
  if (papel === "contador" || pathname.startsWith("/pdv")) return null;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-label="Anotar por voz" title="Anotar por voz"
        className="fixed bottom-[calc(100px+env(safe-area-inset-bottom,0px))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand text-brand-fg shadow-pop ring-4 ring-white/70 transition hover:scale-105 active:scale-95 md:bottom-20 md:right-5 md:h-12 md:w-12">
        <Mic className="h-6 w-6 md:h-5 md:w-5" />
      </button>
      {aberto && <JanelaVoz onClose={() => setAberto(false)} />}
    </>
  );
}

function JanelaVoz({ onClose }: { onClose: () => void }) {
  const vis = useVisivel();
  const qc = useQueryClient();
  const permitidos = tiposPermitidos((t) => vis.ve(t));
  const [etapa, setEtapa] = useState<Etapa>(suportaVoz() ? "ouvindo" : "texto");
  const [fala, setFala] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [semIa, setSemIa] = useState(false);
  const [resp, setResp] = useState<RespostaVoz | null>(null);
  const [tipo, setTipo] = useState<TipoVoz>("outro");
  const [resumo, setResumo] = useState("");
  const [registro, setRegistro] = useState<string>(SEM_REGISTRO);
  const [para, setPara] = useState<string>("");
  const microfone = useRef<{ parar: () => void; cancelar: () => void } | null>(null);

  function comecar() {
    setErro(null); setFala(""); setEtapa("ouvindo");
    try {
      microfone.current = ouvir({
        parcial: setFala,
        fim: (t) => { microfone.current = null; setFala(t); setEtapa((e) => (e === "ouvindo" ? "texto" : e)); },
        erro: (m) => setErro(m),
      });
    } catch { setErro("Este navegador não ouve a fala: escreva a anotação."); setEtapa("texto"); }
  }
  useEffect(() => {
    if (etapa === "ouvindo") comecar();
    return () => microfone.current?.cancelar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function aplicar(r: RespostaVoz) {
    const t = permitidos.includes(r.entendido.tipo) ? r.entendido.tipo : "outro";
    setResp(r); setTipo(t); setResumo(r.entendido.resumo);
    setRegistro(r.candidatos.length === 1 ? r.candidatos[0].id : SEM_REGISTRO);
    setPara(t === "lembrete" ? acharPessoa(r.entendido.pessoa, r.pessoas)?.id ?? "" : "");
    setEtapa("confirmar");
  }

  async function entender() {
    microfone.current?.parar();
    const texto = fala.trim();
    if (texto.length < 4) { setErro("Fale ou escreva o que quer anotar."); return; }
    setErro(null); setEtapa("entendendo");
    try {
      aplicar(await callFunction<RespostaVoz>("ia-voz", { fala: texto }));
    } catch (e) {
      // sem a IA: anota à mão (tipo e texto), sem ligar a um registro
      setSemIa(true); setErro((e as Error).message); setResp(null); setTipo(permitidos.includes("outro") ? "outro" : permitidos[0]);
      setResumo(texto); setRegistro(SEM_REGISTRO); setPara(""); setEtapa("confirmar");
    }
  }

  const escolhido: CandidatoVoz | undefined = resp?.candidatos.find((c) => c.id === registro);
  async function gravar() {
    if (!resumo.trim()) { setErro("Escreva o resumo da anotação."); return; }
    setEtapa("gravando");
    const { error } = await supabase.rpc("anotar_por_voz", {
      p_fala: fala.trim() || resumo.trim(), p_tipo: tipo, p_resumo: resumo.trim(),
      p_ref_tabela: escolhido?.tabela ?? null, p_ref_id: escolhido?.id ?? null, p_ref_rotulo: escolhido?.rotulo ?? null,
      p_link: escolhido?.link ?? TIPOS[tipo].link, p_valor: resp?.entendido.valor ?? (tipo === "pagamento_video" ? escolhido?.valor ?? null : null), p_para: tipo === "lembrete" && para ? para : null,
    });
    if (error) { notifyError(error); setEtapa("confirmar"); return; }
    qc.invalidateQueries({ queryKey: ["anotacoes_voz"] });
    notify(tipo === "lembrete" && para ? "Anotado: o lembrete foi para a pessoa" : "Anotado: foi para quem confere");
    onClose();
  }

  const ouvindo = etapa === "ouvindo";
  return (
    <Modal open onClose={() => { microfone.current?.cancelar(); onClose(); }} title="Anotar por voz">
      {(etapa === "ouvindo" || etapa === "texto" || etapa === "entendendo") && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Fale o que aconteceu. Ex.: <i>“A cliente Maria da Sorveteria Gelato pagou a vídeo chamada”</i>, <i>“A Braspress coletou a máquina do pedido 1520”</i>, <i>“Giga da série 1234 conferido, está certo”</i>.
          </p>
          <div className="flex justify-center">
            <button type="button" disabled={etapa === "entendendo" || !suportaVoz()} onClick={() => (ouvindo ? microfone.current?.parar() : comecar())}
              aria-label={ouvindo ? "Parar de ouvir" : "Falar de novo"}
              className={`grid h-24 w-24 place-items-center rounded-full text-white shadow-pop transition disabled:opacity-40 ${ouvindo ? "animate-pulse bg-red-600" : "bg-brand"}`}>
              {ouvindo ? <Mic className="h-10 w-10" /> : suportaVoz() ? <RotateCcw className="h-9 w-9" /> : <MicOff className="h-9 w-9" />}
            </button>
          </div>
          <p className="text-center text-xs font-semibold text-slate-500">
            {ouvindo ? "Ouvindo… toque para parar" : suportaVoz() ? "Toque para falar de novo, ou corrija o texto" : "Este navegador não ouve a fala: escreva aqui"}
          </p>
          <Field label="O que foi dito">
            <textarea className="input min-h-[88px]" value={fala} onChange={(e) => setFala(e.target.value)} placeholder="A fala aparece aqui…" />
          </Field>
          {erro && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={entender} disabled={etapa === "entendendo" || fala.trim().length < 4}>
              {etapa === "entendendo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Entender
            </Button>
          </div>
        </div>
      )}

      {(etapa === "confirmar" || etapa === "gravando") && (
        <div className="space-y-4">
          {semIa
            ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">A IA não respondeu ({erro}). Escolha o tipo e confira o texto: a anotação vai do mesmo jeito.</p>
            : <p className="text-sm text-slate-600">Confira o que eu entendi. Nada muda no ERP: só fica a anotação para quem confere.</p>}
          {resp?.entendido.falta && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">❓ {resp.entendido.falta}</p>}
          <Field label="Tipo">
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoVoz)}>
              {permitidos.map((t) => <option key={t} value={t}>{TIPOS[t].emoji} {TIPOS[t].rotulo}</option>)}
            </select>
          </Field>
          <Field label="Anotação">
            <textarea className="input min-h-[72px]" value={resumo} onChange={(e) => setResumo(e.target.value)} />
          </Field>
          {resp?.entendido.valor ? <p className="text-sm text-slate-600">Valor falado: <b>{brl(resp.entendido.valor)}</b></p> : null}

          {tipo === "lembrete" && resp && (
            <Field label="Para quem">
              <select className="input" value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">Quem confere as anotações</option>
                {resp.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Field>
          )}

          {resp && tipo !== "lembrete" && (
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-slate-600">É sobre qual registro?</legend>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {resp.candidatos.map((c) => (
                  <label key={c.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${registro === c.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                    <input type="radio" name="registro" className="mt-1" checked={registro === c.id} onChange={() => setRegistro(c.id)} />
                    <span className="min-w-0">
                      <b className="block text-fg">{c.rotulo}</b>
                      {c.detalhe && <span className="block text-xs text-slate-500">{c.detalhe}</span>}
                    </span>
                  </label>
                ))}
                <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${registro === SEM_REGISTRO ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                  <input type="radio" name="registro" checked={registro === SEM_REGISTRO} onChange={() => setRegistro(SEM_REGISTRO)} />
                  <span>{resp.candidatos.length ? "Nenhum destes: anotar sem ligar a um registro" : "Não achei o registro no ERP: anotar assim mesmo"}</span>
                </label>
              </div>
            </fieldset>
          )}
          {erro && !semIa && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => { setSemIa(false); setErro(null); setEtapa("texto"); }} disabled={etapa === "gravando"}>Corrigir a fala</Button>
            <Button onClick={gravar} disabled={etapa === "gravando" || !resumo.trim()}>
              {etapa === "gravando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
