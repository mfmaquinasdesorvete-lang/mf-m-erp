// Editor das etiquetas de transporte e de volume: confere e ajusta tudo antes de imprimir (remetente, destinatário,
// NF-e, transportadora, cada volume com conteúdo, peso e medidas, avisos de manuseio) vendo a etiqueta ao lado.
// O que foi editado fica guardado e sai igual nas próximas impressões; o modelo (layout) vale para todas.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Copy, Download, Eye, Plus, Printer, RotateCcw, Save, Settings2, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useConfig } from "@/lib/useConfig";
import { useInvalidate } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { imprimirPdf } from "@/lib/imprimir";
import { pdfEtiquetas } from "@/lib/pdf";
import { dataBR } from "@/lib/format";
import { carregarEtiqueta, salvarEtiqueta, type EtiquetaCarregada, type OrigemEtiqueta } from "@/lib/etiquetas";
import {
  AVISOS, ajustarQtd, alertasEtiqueta, faltandoNaEtiqueta, gravarCampo, lerCampo, modeloDe, num, volumeVazio,
  type AvisoId, type EtiquetaDados, type ModeloEtiqueta, type VolumeEtiqueta,
} from "@/lib/etiquetaDados";

const celular = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Abre o editor ou imprime direto (em lote) com as versões editadas. */
export function useEtiquetas() {
  const { data: cfg } = useConfig();
  const { pode } = usePerfil();
  const [ocupado, setOcupado] = useState(false);
  const [aberta, setAberta] = useState<OrigemEtiqueta | null>(null);
  const podeSalvar = pode("editar_pedidos") || pode("editar_financeiro");

  async function imprimir(origens: OrigemEtiqueta[]) {
    if (!cfg || !origens.length) return;
    setOcupado(true);
    try {
      const salvo = modeloDe(cfg);
      const modelo = { ...salvo, imprimir: lerImprimir() ?? salvo.imprimir };
      const prontas: EtiquetaCarregada[] = [];
      const pulados: string[] = [];
      for (const o of origens) {
        const c = await carregarEtiqueta(o, cfg, modelo);
        const falta = faltandoNaEtiqueta(c.dados);
        if (falta.length) pulados.push(`${c.titulo} (${falta.join(", ")})`); else prontas.push(c);
      }
      if (prontas.length) {
        const { blob, paginas } = await pdfEtiquetas(prontas.map((c) => c.dados), modelo);
        imprimirPdf(blob);
        notify(`${paginas} etiqueta(s) enviada(s) para a impressora`);
        if (podeSalvar) await Promise.allSettled(prontas.map((c) => salvarEtiqueta(c, c.dados, c.editados, true)));
      }
      if (pulados.length) notify(`Sem imprimir, falta dado: ${pulados.join("; ")}. Abra para editar.`, "erro");
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  const modal = aberta ? <EditorEtiquetas origem={aberta} onClose={() => setAberta(null)} /> : null;
  return { abrir: setAberta, imprimir, ocupado, modal };
}

/** Campo numérico que aceita "12,5" enquanto digita. */
function Numero({ valor, onChange, placeholder, rotulo }: { valor: number | null; onChange: (n: number | null) => void; placeholder?: string; rotulo: string }) {
  const fmt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const [t, setT] = useState(fmt(valor));
  useEffect(() => { if (num(t) !== valor) setT(fmt(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input className="input !px-2" inputMode="decimal" aria-label={rotulo} placeholder={placeholder} value={t}
    onChange={(e) => { setT(e.target.value); onChange(num(e.target.value)); }} />;
}

function Grupo({ titulo, children, extra }: { titulo: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-fg">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

const IMPRIMIR: [ModeloEtiqueta["imprimir"], string][] = [["transporte", "Transporte"], ["volume", "Volume"], ["ambas", "As duas"]];
const CHAVE_IMPRIMIR = "erp.etiquetas.imprimir";
function lerImprimir(): ModeloEtiqueta["imprimir"] | null {
  try { const v = localStorage.getItem(CHAVE_IMPRIMIR); return v === "transporte" || v === "volume" || v === "ambas" ? v : null; } catch { return null; }
}
function gravarImprimir(v: ModeloEtiqueta["imprimir"]) {
  try { localStorage.setItem(CHAVE_IMPRIMIR, v); } catch { /* sem armazenamento: vale só agora */ }
}

export function EditorEtiquetas({ origem, onClose }: { origem: OrigemEtiqueta; onClose: () => void }) {
  const { data: cfg } = useConfig();
  const { pode } = usePerfil();
  const invalidar = useInvalidate();
  const podeSalvar = pode("editar_pedidos") || pode("editar_financeiro");
  // "Imprimir: transporte / volume / as duas" fica lembrado neste navegador
  const [imprimirLocal, setImprimirLocal] = useState<ModeloEtiqueta["imprimir"] | null>(lerImprimir);
  const modeloSalvo = useMemo(() => modeloDe(cfg), [cfg]);
  const [modeloTela, setModeloTela] = useState<ModeloEtiqueta | null>(null);
  const m = useMemo(() => {
    const base = modeloTela ?? modeloSalvo;
    return imprimirLocal && !modeloTela ? { ...base, imprimir: imprimirLocal } : base;
  }, [modeloTela, modeloSalvo, imprimirLocal]);

  const carga = useQuery({
    queryKey: ["etiqueta", JSON.stringify(origem)],
    enabled: !!cfg,
    // sempre do banco ao abrir (a versão salva agora há pouco tem de aparecer); depois não recarrega por cima da edição
    gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false,
    queryFn: () => carregarEtiqueta(origem, cfg, modeloSalvo),
  });
  const [c, setC] = useState<EtiquetaCarregada | null>(null);
  const [d, setD] = useState<EtiquetaDados | null>(null);
  const [editados, setEditados] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (carga.data && !c) { setC(carga.data); setD(carga.data.dados); setEditados(new Set(carga.data.editados)); }
  }, [carga.data, c]);

  const [ocupado, setOcupado] = useState(false);
  const [verModelo, setVerModelo] = useState(false);
  const [volPrev, setVolPrev] = useState(0);
  const [qtd, setQtd] = useState("");

  // Pré-visualização (um volume por vez), refeita logo depois de cada mudança
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!d) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const { blob } = await pdfEtiquetas([d], m, Math.min(volPrev, d.volumes.length - 1));
        if (!vivo) return;
        const novo = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = novo;
        setUrl(novo);
      } catch { /* a pré-visualização não impede editar */ }
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [d, m, volPrev]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  if (carga.error) {
    return <Modal open onClose={onClose} title="Etiquetas"><p className="text-sm text-red-700">Não deu para carregar: {(carga.error as Error).message}</p></Modal>;
  }
  if (!c || !d) {
    return <Modal open wide onClose={onClose} title="Etiquetas"><p className="py-10 text-center text-sm text-slate-500">Carregando…</p></Modal>;
  }

  const marca = (caminho: string) => setEditados((s) => new Set(s).add(caminho));
  const set = (caminho: string, valor: unknown) => { setD((x) => (x ? gravarCampo(x, caminho, valor) : x)); marca(caminho); };
  const voltarCampo = (caminho: string) => {
    setD((x) => (x ? gravarCampo(x, caminho, lerCampo(c.base, caminho)) : x));
    setEditados((s) => { const n = new Set(s); n.delete(caminho); return n; });
  };
  const setVolumes = (v: VolumeEtiqueta[]) => { setD((x) => (x ? { ...x, volumes: v.length ? v : [volumeVazio()] } : x)); marca("volumes"); };
  const setVol = (i: number, patch: Partial<VolumeEtiqueta>) => setVolumes(d.volumes.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const setModelo = (patch: Partial<ModeloEtiqueta>) => setModeloTela({ ...m, ...patch });
  const modeloMudou = !!modeloTela && JSON.stringify(modeloTela) !== JSON.stringify(modeloSalvo);

  /** Campo de texto com a marca de editado e o botão de voltar ao valor do ERP (função, não componente: não perde o foco). */
  const texto = ({ caminho, rotulo, className = "", placeholder, max = 120 }: { caminho: string; rotulo: string; className?: string; placeholder?: string; max?: number }) => (
    <label key={caminho} className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
        {rotulo}
        {editados.has(caminho) && (
          <button type="button" title="Voltar ao que está no ERP" onClick={() => voltarCampo(caminho)}
            className="ml-auto inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200">
            editado <RotateCcw size={10} />
          </button>
        )}
      </span>
      <input className={`input ${editados.has(caminho) ? "!border-amber-400" : ""}`} value={String(lerCampo(d, caminho) ?? "")} maxLength={max}
        placeholder={placeholder} onChange={(e) => set(caminho, e.target.value)} />
    </label>
  );

  const falta = faltandoNaEtiqueta(d);
  const alertas = alertasEtiqueta(d);
  const porVolume = m.imprimir === "ambas" ? 2 : 1;
  const total = d.volumes.length * porVolume;
  const somaPesos = d.volumes.reduce((t, v) => t + (v.peso_kg ?? 0), 0);
  const nomeArquivo = `etiquetas-${c.titulo.split(" · ")[0].replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`;

  async function salvar(impressa = false) {
    if (!podeSalvar || !c || !d) return;
    const s = await salvarEtiqueta(c, d, [...editados], impressa);
    setC({ ...c, salva: s, chave: c.chave });
    invalidar("etiquetas_envio");
    return s;
  }
  async function acaoSalvar() {
    setOcupado(true);
    try { await salvar(); notify("Etiqueta salva: as próximas impressões saem assim"); } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function imprimir() {
    if (!d) return;
    if (falta.length) return notify(`Falta: ${falta.join(", ")}`, "erro");
    setOcupado(true);
    try {
      const { blob, paginas } = await pdfEtiquetas([d], m);
      imprimirPdf(blob);
      notify(`${paginas} etiqueta(s) enviada(s) para a impressora`);
      if (podeSalvar) await salvar(true).catch(() => undefined);
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function pdf() {
    if (!d) return;
    setOcupado(true);
    try { baixar((await pdfEtiquetas([d], m)).blob, nomeArquivo); } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function salvarModelo() {
    setOcupado(true);
    const { error } = await supabase.rpc("salvar_modelo_etiqueta", { p_modelo: m });
    setOcupado(false);
    if (error) return notifyError(error);
    notify("Modelo salvo: vale para todas as etiquetas");
    invalidar("configuracoes");
    setModeloTela(null);
  }
  function aplicarQtd() {
    const n = Math.floor(Number(qtd));
    if (n >= 1) { setVolumes(ajustarQtd(d!.volumes, n)); setQtd(""); }
  }
  function repetirPrimeiro() {
    const p = d!.volumes[0];
    setVolumes(d!.volumes.map((v, i) => (i === 0 ? v : { ...p })));
  }
  function dividirPeso() {
    if (!d!.peso_total_kg) return;
    const n = d!.volumes.length;
    const cada = Math.floor((d!.peso_total_kg / n) * 1000) / 1000;
    const ultimo = Math.round((d!.peso_total_kg - cada * (n - 1)) * 1000) / 1000;
    setVolumes(d!.volumes.map((v, i) => ({ ...v, peso_kg: i === n - 1 ? ultimo : cada })));
  }

  const r = "remetente.", t = "destinatario.";
  return (
    <Modal open wide onClose={onClose} title={`Etiquetas · ${c.titulo}`}>
      <div className="grid grid-cols-1 gap-4 text-sm lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {/* O que imprimir */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Imprimir:</span>
            <div role="group" aria-label="O que imprimir" className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {IMPRIMIR.map(([v, rot]) => (
                <button key={v} type="button" aria-pressed={m.imprimir === v} onClick={() => { gravarImprimir(v); setImprimirLocal(v); if (modeloTela) setModelo({ imprimir: v }); }}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${m.imprimir === v ? "bg-brand text-brand-fg" : "text-slate-600 hover:bg-slate-100"}`}>{rot}</button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {m.imprimir === "transporte" ? "endereçamento, uma por volume" : m.imprimir === "volume" ? "identificação de cada volume (nº, conteúdo, peso)" : "transporte + volume de cada caixa"}
            </span>
            {c.salva?.impressa_em && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">impressa {c.salva.impressoes}× · última em {dataBR(c.salva.impressa_em)}</span>}
          </div>

          {(falta.length > 0 || alertas.length > 0) && (
            <div className={`flex gap-2 rounded-xl border p-2.5 text-xs ${falta.length ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <AlertTriangle size={16} className="shrink-0" />
              <div>{falta.length > 0 && <div><b>Falta para imprimir:</b> {falta.join(", ")}.</div>}{alertas.map((a) => <div key={a}>{a}</div>)}</div>
            </div>
          )}

          <Grupo titulo="Destinatário">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {texto({ caminho: `${t}nome`, rotulo: "Nome", className: "col-span-2 sm:col-span-4" })}
              {texto({ caminho: `${t}telefone`, rotulo: "Telefone", className: "col-span-2" })}
              {texto({ caminho: `${t}ac`, rotulo: "A/C (aos cuidados de) ou nome fantasia", className: "col-span-2 sm:col-span-6" })}
              {texto({ caminho: `${t}logradouro`, rotulo: "Endereço", className: "col-span-2 sm:col-span-4" })}
              {texto({ caminho: `${t}numero`, rotulo: "Número", className: "sm:col-span-1", max: 20 })}
              {texto({ caminho: `${t}complemento`, rotulo: "Compl.", className: "sm:col-span-1", max: 60 })}
              {texto({ caminho: `${t}bairro`, rotulo: "Bairro", className: "col-span-2 sm:col-span-2" })}
              {texto({ caminho: `${t}municipio`, rotulo: "Cidade", className: "col-span-2 sm:col-span-2" })}
              {texto({ caminho: `${t}uf`, rotulo: "UF", max: 2 })}
              {texto({ caminho: `${t}cep`, rotulo: "CEP", max: 9 })}
              {texto({ caminho: `${t}referencia`, rotulo: "Ponto de referência / instrução de entrega", className: "col-span-2 sm:col-span-6", placeholder: "ex.: entregar na doca 2, horário 8h–17h" })}
            </div>
          </Grupo>

          <Grupo titulo="Transporte e documento">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {texto({ caminho: "pedido", rotulo: "Pedido", max: 20 })}
              {texto({ caminho: "nota.numero", rotulo: "NF-e nº", max: 20 })}
              {texto({ caminho: "nota.serie", rotulo: "Série", max: 5 })}
              {texto({ caminho: "transportadora", rotulo: "Transportadora", className: "col-span-2 sm:col-span-3" })}
              {texto({ caminho: "rastreio", rotulo: "Código de rastreio", className: "col-span-2 sm:col-span-3", max: 60 })}
              {texto({ caminho: "cte", rotulo: "CT-e", max: 30 })}
              {texto({ caminho: "nota.chave", rotulo: "Chave da NF-e (44 dígitos)", className: "col-span-2 sm:col-span-2", max: 44 })}
              {texto({ caminho: "observacao", rotulo: "Observação na etiqueta", className: "col-span-2 sm:col-span-6", placeholder: "ex.: entrega agendada com Sr. João" })}
            </div>
          </Grupo>

          <Grupo titulo={`Volumes (${d.volumes.length})`} extra={
            <div className="flex flex-wrap items-center gap-1.5">
              <input className="input !w-20 !py-1" inputMode="numeric" placeholder="qtd." aria-label="Quantidade de volumes" value={qtd}
                onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarQtd(); } }} />
              <Button type="button" variant="secondary" className="!py-1" onClick={aplicarQtd} disabled={!qtd}>Mudar quantidade</Button>
            </div>
          }>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead><tr className="text-left text-slate-500">
                  <th className="w-8 py-1">Vol.</th><th className="py-1">Conteúdo</th><th className="w-20 py-1">Peso (kg)</th>
                  <th className="w-16 py-1">Compr.</th><th className="w-16 py-1">Larg.</th><th className="w-16 py-1">Alt. (cm)</th><th className="w-16" />
                </tr></thead>
                <tbody>
                  {d.volumes.map((v, i) => (
                    <tr key={i} className={volPrev === i ? "bg-sky-50" : ""}>
                      <td className="py-1 font-bold">
                        <button type="button" title="Ver este volume na pré-visualização" onClick={() => setVolPrev(i)} className="rounded px-1 hover:bg-slate-100">{i + 1}</button>
                      </td>
                      <td className="py-1 pr-1"><input className="input !px-2" aria-label={`Conteúdo do volume ${i + 1}`} value={v.descricao} maxLength={160} placeholder="o que vai nesta caixa"
                        onChange={(e) => setVol(i, { descricao: e.target.value })} /></td>
                      <td className="py-1 pr-1"><Numero rotulo={`Peso do volume ${i + 1}`} valor={v.peso_kg} onChange={(n) => setVol(i, { peso_kg: n })} /></td>
                      <td className="py-1 pr-1"><Numero rotulo={`Comprimento do volume ${i + 1}`} valor={v.comprimento_cm} onChange={(n) => setVol(i, { comprimento_cm: n })} /></td>
                      <td className="py-1 pr-1"><Numero rotulo={`Largura do volume ${i + 1}`} valor={v.largura_cm} onChange={(n) => setVol(i, { largura_cm: n })} /></td>
                      <td className="py-1 pr-1"><Numero rotulo={`Altura do volume ${i + 1}`} valor={v.altura_cm} onChange={(n) => setVol(i, { altura_cm: n })} /></td>
                      <td className="whitespace-nowrap py-1">
                        <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Duplicar" aria-label={`Duplicar o volume ${i + 1}`}
                          onClick={() => setVolumes([...d.volumes.slice(0, i + 1), { ...v }, ...d.volumes.slice(i + 1)])}><Copy size={14} /></button>
                        <button type="button" className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Tirar" aria-label={`Tirar o volume ${i + 1}`}
                          disabled={d.volumes.length <= 1} onClick={() => { setVolumes(d.volumes.filter((_, k) => k !== i)); setVolPrev(0); }}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" className="!py-1" onClick={() => setVolumes([...d.volumes, volumeVazio()])}><Plus size={14} /> Volume</Button>
              {d.volumes.length > 1 && <Button type="button" variant="ghost" className="!py-1" onClick={repetirPrimeiro}>Repetir o 1º em todos</Button>}
              {d.volumes.length > 1 && d.peso_total_kg && <Button type="button" variant="ghost" className="!py-1" onClick={dividirPeso}>Dividir o peso total</Button>}
              {editados.has("volumes") && <button type="button" onClick={() => voltarCampo("volumes")} className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800"><RotateCcw size={11} /> volumes como no ERP</button>}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
                Peso total (kg)
                <span className="w-24"><Numero rotulo="Peso total" valor={d.peso_total_kg} onChange={(n) => set("peso_total_kg", n)} /></span>
              </label>
            </div>
            {somaPesos > 0 && <p className="mt-1 text-right text-[11px] text-slate-500">soma dos volumes: {somaPesos.toLocaleString("pt-BR")} kg</p>}
          </Grupo>

          <Grupo titulo="Avisos de manuseio" extra={editados.has("avisos") ? <button type="button" onClick={() => voltarCampo("avisos")} className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"><RotateCcw size={11} /> como no ERP</button> : undefined}>
            <div className="flex flex-wrap gap-2">
              {AVISOS.map((a) => {
                const on = d.avisos.includes(a.id);
                return (
                  <button key={a.id} type="button" aria-pressed={on}
                    onClick={() => set("avisos", on ? d.avisos.filter((x) => x !== a.id) : AVISOS.map((x) => x.id).filter((x) => x === a.id || d.avisos.includes(x)) as AvisoId[])}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${on ? "border-ink bg-ink text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{a.rotulo}</button>
                );
              })}
            </div>
          </Grupo>

          <Grupo titulo="Remetente">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {texto({ caminho: `${r}nome`, rotulo: "Nome / razão social", className: "col-span-2 sm:col-span-4" })}
              {texto({ caminho: `${r}documento`, rotulo: "CNPJ", className: "col-span-2", max: 18 })}
              {texto({ caminho: `${r}endereco`, rotulo: "Endereço", className: "col-span-2 sm:col-span-4" })}
              {texto({ caminho: `${r}bairro`, rotulo: "Bairro", className: "col-span-2" })}
              {texto({ caminho: `${r}municipio`, rotulo: "Cidade", className: "col-span-2" })}
              {texto({ caminho: `${r}uf`, rotulo: "UF", max: 2 })}
              {texto({ caminho: `${r}cep`, rotulo: "CEP", max: 9 })}
              {texto({ caminho: `${r}telefone`, rotulo: "Telefone", className: "col-span-2" })}
            </div>
          </Grupo>

          {/* Modelo: vale para todas as etiquetas */}
          <section className="rounded-xl border border-slate-200">
            <button type="button" onClick={() => setVerModelo(!verModelo)} className="flex w-full items-center gap-2 p-3 text-left text-sm font-bold text-fg">
              <Settings2 size={16} /> Modelo das etiquetas <span className="font-normal text-slate-500">(formato, o que aparece, avisos padrão; vale para todas)</span>
              {modeloMudou && <span className="ml-auto rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">alterado</span>}
            </button>
            {verModelo && (
              <div className="space-y-3 border-t border-slate-100 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Field label="Etiqueta de transporte">
                    <select className="input" value={m.formato_transporte} onChange={(e) => setModelo({ formato_transporte: e.target.value as ModeloEtiqueta["formato_transporte"] })}>
                      <option value="10x15">10 × 15 cm (térmica)</option><option value="a4">Folha A4, 4 por folha</option>
                    </select>
                  </Field>
                  <Field label="Etiqueta de volume">
                    <select className="input" value={m.formato_volume} onChange={(e) => setModelo({ formato_volume: e.target.value as ModeloEtiqueta["formato_volume"] })}>
                      <option value="10x10">10 × 10 cm (térmica)</option><option value="10x15">10 × 15 cm (térmica)</option><option value="a4">Folha A4, 6 por folha</option>
                    </select>
                  </Field>
                  <Field label="Código de barras (transporte)">
                    <select className="input" value={m.codigo} onChange={(e) => setModelo({ codigo: e.target.value as ModeloEtiqueta["codigo"] })}>
                      <option value="chave">Chave da NF-e</option><option value="pedido">Nº do pedido</option><option value="rastreio">Código de rastreio</option><option value="nenhum">Sem código de barras</option>
                    </select>
                  </Field>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {([
                    ["mostrar_logo", "Logo"], ["mostrar_cnpj", "CNPJ do remetente"], ["mostrar_telefone", "Telefones"], ["mostrar_peso", "Peso"],
                    ["mostrar_medidas", "Medidas"], ["mostrar_conteudo", "Conteúdo (etiqueta de volume)"], ["destinatario_grande", "Nome do destinatário maior"],
                  ] as [keyof ModeloEtiqueta, string][]).map(([k, rot]) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={!!m[k]} onChange={(e) => setModelo({ [k]: e.target.checked } as Partial<ModeloEtiqueta>)} /> {rot}
                    </label>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-600">Avisos que já vêm marcados</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {AVISOS.map((a) => (
                      <label key={a.id} className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={m.avisos_padrao.includes(a.id)}
                          onChange={(e) => setModelo({ avisos_padrao: e.target.checked ? [...m.avisos_padrao, a.id] : m.avisos_padrao.filter((x) => x !== a.id) })} /> {a.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Rodapé da etiqueta de transporte">
                  <input className="input" maxLength={120} value={m.rodape} placeholder="ex.: Em caso de avaria, recuse e anote no comprovante" onChange={(e) => setModelo({ rodape: e.target.value })} />
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                  {modeloMudou && <Button type="button" variant="ghost" onClick={() => setModeloTela(null)}><RotateCcw size={14} /> Desfazer</Button>}
                  {podeSalvar && <Button type="button" variant="secondary" disabled={ocupado || !modeloMudou} onClick={salvarModelo}><Save size={14} /> Salvar modelo</Button>}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Pré-visualização */}
        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-600"><Eye size={13} className="mr-1 inline" />Volume {Math.min(volPrev, d.volumes.length - 1) + 1} de {d.volumes.length}</span>
            {d.volumes.length > 1 && (
              <select className="input !w-auto !py-0.5 text-xs" aria-label="Volume na pré-visualização" value={Math.min(volPrev, d.volumes.length - 1)} onChange={(e) => setVolPrev(Number(e.target.value))}>
                {d.volumes.map((_, i) => <option key={i} value={i}>volume {i + 1}</option>)}
              </select>
            )}
          </div>
          {celular()
            ? <Button type="button" variant="secondary" className="w-full" disabled={!url} onClick={() => url && window.open(url, "_blank")}><Eye size={15} /> Ver a etiqueta</Button>
            : url
              ? <iframe title="Pré-visualização da etiqueta" src={`${url}#toolbar=0&navpanes=0&view=Fit`} className="h-[480px] w-full rounded-xl border border-slate-200 bg-slate-100" />
              : <div className="flex h-[480px] items-center justify-center rounded-xl border border-slate-200 text-xs text-slate-400">gerando…</div>}
          <p className="mt-1.5 text-[11px] text-slate-500">
            {m.imprimir === "ambas" ? "Transporte e volume" : m.imprimir === "volume" ? `Volume (${m.formato_volume === "a4" ? "A4" : m.formato_volume.replace("x", " × ")} cm)` : `Transporte (${m.formato_transporte === "a4" ? "A4" : "10 × 15 cm"})`}.
            {editados.size > 0 ? ` ${editados.size} campo(s) editado(s) à mão.` : " Tudo como está no ERP."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {editados.size > 0 && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={() => { setD(c.base); setEditados(new Set()); setVolPrev(0); }}>
            <RotateCcw size={15} /> Voltar tudo ao ERP
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
        <Button type="button" variant="secondary" disabled={ocupado} onClick={pdf}><Download size={15} /> PDF</Button>
        {podeSalvar && <Button type="button" variant="secondary" disabled={ocupado} onClick={acaoSalvar}><Save size={15} /> Salvar</Button>}
        <Button type="button" disabled={ocupado || falta.length > 0} title={falta.length ? `Falta: ${falta.join(", ")}` : ""} onClick={imprimir}>
          <Printer size={15} /> Imprimir {total} etiqueta{total === 1 ? "" : "s"}
        </Button>
      </div>
    </Modal>
  );
}
