// App da assistência no celular (erp.myfrost.ai/app/assistencia): o técnico na bancada ou no cliente, sem o menu do ERP.
// As OS dele (ou todas) por etapa, o próximo passo com um toque, foto direto da câmera para a OS, WhatsApp do cliente
// e "Abrir OS" para o checklist, o laudo e a assinatura (a mesma janela do ERP). Etapas e passos em lib/quadroOS.
import { SeloCidade } from "@/components/SeloCidade";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, ChevronRight, LayoutGrid, MessageCircle, MoreHorizontal, PackageOpen, Search, Send, Stethoscope, ThumbsUp, User, Users, Wrench } from "lucide-react";
import { InstalarApp } from "@/components/InstalarApp";
import { useInvalidate, useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { hoje, pl } from "@/lib/format";
import { enviarFotoOS } from "@/lib/fotos";
import { ETAPAS_OS, proximoStatus, situacaoOS, type AcaoOS, type EtapaOS, type SituacaoOS } from "@/lib/quadroOS";
import { combina, numeroWhatsApp } from "@/lib/appVendas";
import { CHAVE_APP_ASSISTENCIA, ehDoTecnico } from "@/lib/appCelular";
import type { FotoOS, OrdemServico } from "@/lib/types";

type OS = OrdemServico & { fotos?: FotoOS[] | null; concluida_em?: string | null; entregue_em?: string | null };
type Aba = "minhas" | "todas" | "mais";
const BOTAO: Partial<Record<AcaoOS, { rotulo: string; icone: typeof Send }>> = {
  diagnosticar: { rotulo: "Começar diagnóstico", icone: Stethoscope }, orcamento: { rotulo: "Orçamento enviado", icone: Send },
  aprovado: { rotulo: "Cliente aprovou", icone: ThumbsUp }, peca_chegou: { rotulo: "Peça chegou", icone: PackageOpen },
};
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const NIVEL = ["text-noite-fraco", "text-fixo-amber-400", "text-fixo-rose-400"];

export default function AppAssistencia() {
  const { nome, pode } = usePerfil();
  const podeEditar = pode("editar_os");
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const { filtrar } = useUnidade();
  const { data: todas = [] } = useRows<OS>("ordens_servico", { select: "*, cliente:clientes(nome, nome_fantasia, whatsapp, telefone, municipio, uf)", order: "data_entrada" });
  const [aba, setAba] = useState<Aba>("minhas");
  const [etapa, setEtapa] = useState<EtapaOS | null>(null);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sempre, setSempre] = useState(ler(CHAVE_APP_ASSISTENCIA) !== "0");
  const dia = hoje();

  // só o que está na fila (canceladas e entregues há mais de 15 dias ficam fora), do mais urgente ao mais tranquilo
  const fila = useMemo(() => filtrar(todas).flatMap((o) => { const s = situacaoOS(o, dia); return s && s.etapa !== "entregue" ? [{ o, s }] : []; })
    .sort((a, b) => b.s.nivel - a.s.nivel || a.s.desde.localeCompare(b.s.desde)), [todas, filtrar, dia]);
  const minhas = fila.filter((x) => ehDoTecnico(x.o.tecnico, nome));
  const base = aba === "todas" ? fila : minhas;
  const lista = base.filter((x) => (!etapa || x.s.etapa === etapa) && (!busca.trim() || combina(`${x.o.numero} ${x.o.cliente?.nome ?? ""} ${x.o.cliente?.nome_fantasia ?? ""} ${x.o.equipamento} ${x.o.numero_serie ?? ""}`, busca.replace(/^#/, ""))));

  async function avancar(o: OS, s: SituacaoOS) {
    const status = proximoStatus(s.acao);
    if (!status) return abrir(o);
    setOcupado(o.id);
    const extra = s.acao === "aprovado" ? { orcamento_aprovado_em: o.orcamento_aprovado_em ?? new Date().toISOString(), orcamento_aprovado_por: o.orcamento_aprovado_por || `Cliente (app, ${nome})` } : {};
    const { error } = await supabase.from("ordens_servico").update({ status, ...extra }).eq("id", o.id);
    setOcupado(null);
    if (error) return notifyError(error);
    notify(`OS #${o.numero}: ${BOTAO[s.acao]?.rotulo.toLowerCase() ?? "atualizada"}`);
    invalidar("ordens_servico");
  }
  async function foto(o: OS, arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setOcupado(o.id);
    try {
      const novas: FotoOS[] = [];
      for (const f of Array.from(arquivos)) novas.push({ caminho: await enviarFotoOS(o.id, f), criado_em: new Date().toISOString() });
      // lê as fotos atuais do banco antes de somar (outra pessoa pode ter anexado no meio)
      const { data, error: e1 } = await supabase.from("ordens_servico").select("fotos").eq("id", o.id).single();
      if (e1) throw e1;
      const { error } = await supabase.from("ordens_servico").update({ fotos: [...((data?.fotos as FotoOS[] | null) ?? []), ...novas] }).eq("id", o.id);
      if (error) throw error;
      notify(`OS #${o.numero}: ${novas.length} ${pl(novas.length, "foto anexada", "fotos anexadas")}`);
      invalidar("ordens_servico");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }
  const abrir = (o: OS) => navigate("/assistencia", { state: { abrir: o.id } });
  const contagem = (id: EtapaOS) => base.filter((x) => x.s.etapa === id).length;
  const primeiro = (nome || "").split(" ")[0];

  return (
    <div className="min-h-screen bg-noite-fundo pb-28 text-noite-texto" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-md px-4">
        <header className="flex items-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-fixo-teal-500 font-bold text-noite-fundo">MF</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-noite-fraco">Olá{primeiro ? `, ${primeiro}` : ""}</p>
            <p className="truncate font-bold tracking-wide">Assistência MF</p>
          </div>
        </header>

        {aba !== "mais" && (
          <>
            {/* etapas: toque para filtrar */}
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {ETAPAS_OS.filter((x) => x.id !== "entregue").map((x) => {
                const n = contagem(x.id);
                const ativo = etapa === x.id;
                return (
                  <button key={x.id} type="button" aria-pressed={ativo} onClick={() => setEtapa(ativo ? null : x.id)}
                    className={`shrink-0 rounded-2xl border px-3 py-2 text-left ${ativo ? "border-white/50 bg-white/10" : "border-white/10"}`}>
                    <span className="num block text-xl font-bold" style={{ color: x.cor }}>{n}</span>
                    <span className="block text-2xs font-semibold text-noite-medio">{x.curto}</span>
                  </button>
                );
              })}
            </div>

            <label className="relative mb-3 block">
              <span className="sr-only">Procurar OS</span>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-noite-fraco" aria-hidden />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº da OS, cliente, máquina ou série"
                className="w-full rounded-2xl border border-white/15 bg-noite-cartao py-3 pl-11 pr-4 text-base placeholder:text-noite-apagado focus:border-fixo-teal-500 focus:outline-none" />
            </label>

            {aba === "minhas" && !minhas.length && fila.length > 0 && (
              <p className="mb-3 rounded-2xl border border-fixo-amber-400/30 bg-fixo-amber-400/10 p-3 text-sm text-fixo-amber-300">
                Nenhuma OS com você como técnico. Veja em <button type="button" className="font-bold underline" onClick={() => setAba("todas")}>Todas</button>.
              </p>
            )}

            <ul className="space-y-2.5">
              {lista.map(({ o, s }) => {
                const info = ETAPAS_OS.find((x) => x.id === s.etapa)!;
                const botao = BOTAO[s.acao];
                const wa = numeroWhatsApp(o.cliente?.whatsapp || o.cliente?.telefone);
                return (
                  <li key={o.id} className="rounded-2xl border border-white/10 bg-noite-cartao p-3.5" style={{ borderLeft: `4px solid ${info.cor}` }}>
                    <button type="button" onClick={() => abrir(o)} className="flex w-full items-start justify-between gap-2 text-left">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm">
                          <b className="num text-noite-fraco">OS #{o.numero}</b>
                          <span className="rounded-md px-1.5 py-0.5 text-2xs font-bold" style={{ background: `${info.cor}33`, color: info.cor }}>{info.curto}</span>
                          {o.em_garantia && <span className="rounded-md bg-fixo-emerald-400/15 px-1.5 py-0.5 text-2xs font-bold text-fixo-emerald-300">garantia</span>}
                        </span>
                        <span className="mt-0.5 block truncate font-semibold">{o.cliente?.nome_fantasia?.trim() || o.cliente?.nome}<SeloCidade cliente={o.cliente} escuro /></span>
                        <span className="block truncate text-xs text-noite-fraco">{[o.equipamento, o.numero_serie && `série ${o.numero_serie}`, aba === "todas" && o.tecnico].filter(Boolean).join(" · ")}</span>
                      </span>
                      <ChevronRight size={18} className="mt-1 shrink-0 text-noite-fraco" aria-hidden />
                    </button>
                    <p className={`mt-2 text-xs font-semibold ${NIVEL[s.nivel]}`}>{s.alerta ? `⚠ ${s.alerta} · ` : ""}{s.proximo}</p>
                    {podeEditar && (
                      <div className="mt-3 grid grid-cols-[auto_auto_1fr] gap-2">
                        <label className={`flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-white/15 px-3 py-3 text-sm font-semibold ${ocupado === o.id ? "pointer-events-none opacity-50" : ""}`}>
                          <Camera size={17} /> {o.fotos?.length ? o.fotos.length : "Foto"}
                          <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { void foto(o, e.target.files); e.target.value = ""; }} />
                        </label>
                        {wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="WhatsApp do cliente" className="flex items-center justify-center rounded-xl bg-fixo-emerald-500/15 px-3 py-3 text-fixo-emerald-300"><MessageCircle size={18} /></a>
                          : <span className="rounded-xl border border-white/10 px-3 py-3 text-noite-apagado" title="Cliente sem WhatsApp"><MessageCircle size={18} /></span>}
                        <button type="button" disabled={ocupado === o.id} onClick={() => (botao ? avancar(o, s) : abrir(o))}
                          className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-noite-fundo disabled:opacity-50" style={{ background: info.cor }}>
                          {ocupado === o.id ? "Salvando…" : botao ? <><botao.icone size={16} /> {botao.rotulo}</> : <><Wrench size={16} /> Abrir OS</>}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!lista.length && (aba === "todas" || minhas.length > 0) && <p className="rounded-2xl border border-white/10 p-6 text-center text-noite-fraco">{busca || etapa ? "Nenhuma OS com esse filtro." : "Nenhuma OS na fila ✓"}</p>}
          </>
        )}

        {aba === "mais" && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-4 text-sm">
              <span>Abrir sempre aqui pelo celular</span>
              <input type="checkbox" className="h-5 w-5 accent-fixo-teal-500" checked={sempre}
                onChange={(e) => { setSempre(e.target.checked); gravar(CHAVE_APP_ASSISTENCIA, e.target.checked ? "1" : "0"); }} />
            </label>
            <InstalarApp />
            <p className="px-1 text-xs text-noite-fraco">Checklist, laudo, peças, assinatura e NFS-e ficam em “Abrir OS”. Nova OS, garantias e o quadro completo ficam no ERP completo.</p>
            <button type="button" onClick={() => navigate("/assistencia")} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm text-noite-medio">
              <LayoutGrid size={18} /> <span className="flex-1">Abrir o ERP completo</span>
            </button>
          </div>
        )}
      </div>

      <nav aria-label="App da assistência" className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-noite-fundo-2/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-3">
          {([["minhas", "Minhas OS", User, minhas.length], ["todas", "Todas", Users, fila.length], ["mais", "Mais", MoreHorizontal, 0]] as const).map(([id, rot, Icone, n]) => (
            <button key={id} type="button" onClick={() => { setAba(id); setEtapa(null); setBusca(""); }} aria-current={aba === id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs ${aba === id ? "text-fixo-teal-400" : "text-noite-fraco"}`}>
              <Icone size={21} />{rot}
              {n > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-fixo-teal-500 px-1.5 text-2xs font-bold text-noite-fundo">{n}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
