// Fretes → Rastreio: as entregas na estrada (sem código, a caminho, atrasadas e entregues nos últimos 15 dias). Em
// cada uma: o link de acompanhar da transportadora, copiar o código e mandar pelo WhatsApp do cliente. Ao preencher o
// código aqui, o banco manda sozinho o e-mail "Seu pedido foi enviado" com o link para o cliente. Transportadora que usa
// o SSW é rastreada sozinha pela chave da nota (7h05 e 14h05, ou no botão): a última ocorrência aparece no cartão e,
// quando ela informa a entrega, o envio vai para "Entregues pela transportadora" para a equipe confirmar.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, BellRing, CheckCircle2, ChevronDown, Copy, ExternalLink, Mail, MessageCircle, PackageCheck, PackageSearch, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { dataBR, dataHoraBR, hoje, pl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { integracaoApi, linkRastreio } from "@/lib/transportadoras";
import { grupoRastreio, mensagemAtraso, mensagemChegando, mensagemRastreio, type GrupoRastreio } from "@/lib/rastreio";
import type { Envio } from "@/lib/fretes";
import type { Transportadora } from "@/lib/types";

type ClienteContato = { id: string; nome: string; nome_fantasia: string | null; whatsapp: string | null; telefone: string | null; email: string | null; avisos_email: boolean | null };

const GRUPOS: { id: GrupoRastreio; titulo: string; icone: typeof Truck; cor: string }[] = [
  { id: "confirmar", titulo: "Entregues pela transportadora (confirmar)", icone: PackageCheck, cor: "border-l-emerald-600" },
  { id: "sem_codigo", titulo: "Saíram sem código de rastreio", icone: PackageSearch, cor: "border-l-amber-400" },
  { id: "atrasado", titulo: "Passaram da previsão", icone: AlarmClock, cor: "border-l-red-500" },
  { id: "chegando", titulo: "Chegam hoje ou amanhã", icone: BellRing, cor: "border-l-violet-500" },
  { id: "a_caminho", titulo: "A caminho", icone: Truck, cor: "border-l-sky-500" },
  { id: "entregue", titulo: "Entregues (últimos 15 dias)", icone: CheckCircle2, cor: "border-l-emerald-500" },
];

export function RastreioEntregas({ envios, transportadoras, numeroPedido, podeEditar }: {
  envios: Envio[]; transportadoras: Transportadora[]; numeroPedido: (id: string | null) => number | null; podeEditar: boolean;
}) {
  const dia = hoje();
  const lista = useMemo(() => envios.map((e) => ({ e, g: grupoRastreio(e, dia) })).filter((x) => x.g), [envios, dia]);
  const ids = [...new Set(lista.map((x) => x.e.cliente_id).filter(Boolean) as string[])].sort();
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "rastreio", ids.join(",")], enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id, nome, nome_fantasia, whatsapp, telefone, email, avisos_email").in("id", ids);
      if (error) throw error;
      return (data ?? []) as ClienteContato[];
    },
  });
  const cli = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const transp = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);

  if (!lista.length) return <p className="py-10 text-center text-sm text-slate-500">Nenhuma entrega na estrada agora. Os envios em trânsito aparecem aqui.</p>;
  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <Mail size={15} className="mr-1 inline" aria-hidden /> Toda manhã às 7h30 o ERP confere os envios: quem tem e-mail recebe sozinho <b>"chega hoje/amanhã"</b> e, se passar da previsão,
        o aviso de <b>atraso</b> com a explicação. A equipe recebe o resumo e, abaixo, a mensagem pronta para o WhatsApp de cada cliente.
      </p>
      {GRUPOS.map(({ id, titulo, icone: Icone, cor }) => {
        const doGrupo = lista.filter((x) => x.g === id);
        if (!doGrupo.length) return null;
        return (
          <section key={id} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><Icone size={16} aria-hidden /> {titulo} · {doGrupo.length}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {doGrupo.map(({ e }) => (
                <CartaoRastreio key={e.id} e={e} grupo={id} cor={cor} cliente={e.cliente_id ? cli.get(e.cliente_id) : undefined}
                  transportadora={e.transportadora_id ? transp.get(e.transportadora_id) : undefined} pedido={numeroPedido(e.pedido_id)} podeEditar={podeEditar} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CartaoRastreio({ e, grupo, cor, cliente, transportadora, pedido, podeEditar }: {
  e: Envio; grupo: GrupoRastreio; cor: string; cliente?: ClienteContato; transportadora?: Transportadora; pedido: number | null; podeEditar: boolean;
}) {
  const invalidar = useInvalidate();
  const [codigo, setCodigo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const nomeTransp = transportadora?.nome_fantasia || transportadora?.nome || e.transportadora_nome || null;
  const cod = e.codigo_rastreio?.trim() || null;
  const link = cod ? linkRastreio(transportadora?.rastreio_url, { codigo: cod }) : null;
  const zap = cliente?.whatsapp || cliente?.telefone;
  const nomeCliente = cliente?.nome_fantasia || cliente?.nome || (e.cliente_id ? "Cliente" : "Envio sem cliente");
  const temEmail = !!cliente?.email?.trim() && cliente?.avisos_email !== false;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!codigo.trim()) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from("envios").update({ codigo_rastreio: codigo.trim() }).eq("id", e.id);
      if (error) throw error;
      notify(temEmail ? "Código salvo: o e-mail com o rastreio vai para o cliente" : "Código salvo");
      invalidar("envios", "pedidos");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(cod ?? ""); notify("Código copiado"); } catch { notify(cod ?? ""); }
  }

  return (
    <li className={`space-y-2 rounded-xl border border-l-4 border-slate-200 p-3 ${cor}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight text-fg">{nomeCliente}</div>
          <div className="text-xs text-slate-600">
            {pedido ? `Pedido #${pedido}` : `Envio #${e.numero ?? ""}`}{e.cidade_destino ? ` · ${e.cidade_destino}/${e.uf_destino ?? ""}` : ""}{nomeTransp ? ` · ${nomeTransp}` : ""}
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-600">
          {e.status === "entregue" ? `entregue ${e.entregue_em ? dataBR(e.entregue_em) : ""}` : e.entrega_prevista ? `previsão ${dataBR(e.entrega_prevista)}` : "sem previsão"}
        </span>
      </div>
      {cod ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" tamanho="mini" variant="secondary" onClick={copiar} className="font-mono" aria-label={`Copiar o código ${cod}`}>
            {cod} <Copy size={12} aria-hidden />
          </Button>
          {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-modulo-texto hover:underline"><ExternalLink size={13} aria-hidden /> Rastrear</a>}
          {!link && transportadora?.rastreio_url && <a href={transportadora.rastreio_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-modulo-texto hover:underline"><ExternalLink size={13} aria-hidden /> Site de rastreio</a>}
          <span className="ml-auto text-2xs text-slate-500">{temEmail ? "e-mail automático ✓" : "cliente sem e-mail"}</span>
        </div>
      ) : podeEditar ? (
        <form onSubmit={salvar} className="flex gap-2">
          <input className="input min-w-0 flex-1 py-1.5 text-sm" value={codigo} onChange={(x) => setCodigo(x.target.value)} placeholder="Código de rastreio" aria-label={`Código de rastreio de ${nomeCliente}`} maxLength={80} />
          <Button type="submit" disabled={salvando || !codigo.trim()}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </form>
      ) : <p className="text-xs text-amber-800">Falta o código de rastreio.</p>}
      <SituacaoTransportadora e={e} podeEditar={podeEditar} transportadora={transportadora} />
      {grupo === "atrasado" && podeEditar && <MotivoAtraso e={e} />}
      {(grupo === "chegando" || grupo === "atrasado") && (
        <AvisoCliente e={e} tipo={grupo} zap={zap} texto={grupo === "chegando"
          ? mensagemChegando({ cliente: cliente?.nome_fantasia || cliente?.nome, pedido, transportadora: nomeTransp, codigo: cod, link, previsao: e.entrega_prevista, hoje: hoje() })
          : mensagemAtraso({ cliente: cliente?.nome_fantasia || cliente?.nome, pedido, transportadora: nomeTransp, codigo: cod, link, previsao: e.entrega_prevista, motivo: e.motivo_atraso })} />
      )}
      {cod && e.status !== "entregue" && grupo !== "chegando" && grupo !== "atrasado" && (
        zap ? (
          <a href={whatsappLink(zap, mensagemRastreio({ cliente: cliente?.nome_fantasia || cliente?.nome, pedido, transportadora: nomeTransp, codigo: cod, link, previsao: e.entrega_prevista }))}
            target="_blank" rel="noreferrer"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700">
            <MessageCircle size={15} aria-hidden /> Mandar o rastreio pelo WhatsApp
          </a>
        ) : <p className="text-xs text-slate-500">Cliente sem WhatsApp no cadastro.</p>
      )}
    </li>
  );
}

/** Avisar o cliente (chegando ou atraso): WhatsApp com a mensagem pronta e marca como avisado; mostra se o e-mail já foi. */
function AvisoCliente({ e, tipo, zap, texto }: { e: Envio; tipo: "chegando" | "atrasado"; zap?: string | null; texto: string }) {
  const invalidar = useInvalidate();
  const campo = tipo === "chegando" ? "aviso_chegando_em" : "aviso_atraso_em";
  const avisado = e[campo];
  async function marcar() {
    const { error } = await supabase.from("envios").update({ [campo]: new Date().toISOString() }).eq("id", e.id);
    if (error) notifyError(error); else invalidar("envios");
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {avisado
        ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={13} aria-hidden /> cliente avisado {dataBR(avisado)}</span>
        : <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{tipo === "chegando" ? "avisar que está chegando" : "avisar o atraso"}</span>}
      {zap ? (
        <a href={whatsappLink(zap, texto)} target="_blank" rel="noreferrer" onClick={() => { if (!avisado) void marcar(); }}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700">
          <MessageCircle size={15} aria-hidden /> {tipo === "chegando" ? "Avisar que está chegando" : "Avisar o atraso"}
        </a>
      ) : <span className="text-xs text-slate-500">Cliente sem WhatsApp no cadastro.</span>}
    </div>
  );
}

/** O que a transportadora informou (SSW, pela chave da nota): última ocorrência, todas as ocorrências, atualizar agora
 *  e, quando ela informa a entrega, "Confirmar entrega" (data do comprovante = a da transportadora). */
function SituacaoTransportadora({ e, podeEditar, transportadora }: { e: Envio; podeEditar: boolean; transportadora?: Transportadora }) {
  // Braspress tem rastreio pela API própria; as outras tentam o SSW pela chave da nota
  const fonte = transportadora && integracaoApi(transportadora) === "braspress" ? "braspress" : "ssw";
  const rotulo = fonte === "braspress" ? "Braspress" : "SSW";
  const invalidar = useInvalidate();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const eventos = e.rastreio_eventos ?? [];
  async function atualizar() {
    setOcupado(true);
    try {
      const r = await callFunction<{ ok: boolean; erro?: string; entregue?: boolean }>(fonte, { acao: "rastrear", envio_id: e.id });
      if (r.ok) notify(r.entregue ? "A transportadora informou a entrega" : `Rastreio atualizado pela ${rotulo}`);
      else notify(`${rotulo}: ${r.erro}`);
      invalidar("envios");
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }
  async function confirmar() {
    if (!e.rastreio_entregue_em) return;
    setOcupado(true);
    try {
      // dia da entrega no horário de Brasília
      const dia = new Date(e.rastreio_entregue_em).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const { error } = await supabase.from("envios").update({ status: "entregue", entregue_em: dia, comprovante_em: dia }).eq("id", e.id);
      if (error) throw error;
      notify("Entrega confirmada");
      invalidar("envios", "pedidos");
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }
  if (e.status === "entregue" && !eventos.length) return null;
  return (
    <div className="space-y-1.5 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          {e.rastreio_situacao
            ? <><b>Transportadora:</b> {e.rastreio_situacao}{eventos.length ? ` · ${eventos[eventos.length - 1].em ? dataHoraBR(eventos[eventos.length - 1].em!) : ""}` : ""}</>
            : e.rastreio_em ? (fonte === "braspress" ? "A Braspress ainda não achou a nota." : "O SSW não achou a nota (a transportadora pode não usar o SSW).") : "Ainda não rastreado pela nota."}
        </span>
        {eventos.length > 1 && (
          <button type="button" onClick={() => setAberto(!aberto)} className="link-acao inline-flex items-center gap-0.5" aria-expanded={aberto}>
            {aberto ? "esconder" : `ver ${eventos.length} ocorrências`} <ChevronDown size={12} className={aberto ? "rotate-180" : ""} aria-hidden />
          </button>
        )}
        {podeEditar && e.status !== "entregue" && (
          <Button type="button" tamanho="mini" variant="secondary" onClick={atualizar} disabled={ocupado} aria-label={`Atualizar o rastreio pela ${rotulo}`}>
            <RefreshCw size={12} className={ocupado ? "animate-spin" : ""} aria-hidden /> {rotulo}
          </Button>
        )}
      </div>
      {aberto && (
        <ol className="space-y-0.5 border-l-2 border-slate-200 pl-2">
          {[...eventos].reverse().map((ev, i) => (
            <li key={i}><span className="text-slate-500">{ev.em ? dataHoraBR(ev.em) : ""}</span> {ev.ocorrencia}{ev.cidade ? ` · ${ev.cidade}` : ""}</li>
          ))}
        </ol>
      )}
      {e.rastreio_entregue_em && e.status !== "entregue" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 p-2 text-emerald-900">
          <span className="flex-1">Entregue em <b>{dataHoraBR(e.rastreio_entregue_em)}</b>{e.rastreio_recebedor ? `, recebido por ${e.rastreio_recebedor}` : ""}, segundo a transportadora.</span>
          {podeEditar && <Button type="button" tamanho="mini" onClick={confirmar} disabled={ocupado}><CheckCircle2 size={12} aria-hidden /> Confirmar entrega</Button>}
        </div>
      )}
    </div>
  );
}

/** Explicação do atraso: vai no e-mail automático (se ainda não saiu) e na mensagem do WhatsApp. */
function MotivoAtraso({ e }: { e: Envio }) {
  const invalidar = useInvalidate();
  const [motivo, setMotivo] = useState(e.motivo_atraso ?? "");
  const [salvando, setSalvando] = useState(false);
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setSalvando(true);
    try {
      const { error } = await supabase.from("envios").update({ motivo_atraso: motivo.trim() || null }).eq("id", e.id);
      if (error) throw error;
      notify("Explicação salva: vai na mensagem do atraso");
      invalidar("envios");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }
  return (
    <form onSubmit={salvar} className="flex gap-2">
      <input className="input min-w-0 flex-1 py-1.5 text-sm" value={motivo} onChange={(x) => setMotivo(x.target.value)} maxLength={300}
        placeholder="O que aconteceu? Ex.: a transportadora remarcou para quinta" aria-label="Explicação do atraso para o cliente" />
      <Button type="submit" variant="secondary" disabled={salvando || motivo.trim() === (e.motivo_atraso ?? "")}>{salvando ? "…" : "Salvar"}</Button>
    </form>
  );
}

export const contarRastreio = (envios: Envio[], dia = hoje()) => {
  const g = envios.map((e) => grupoRastreio(e, dia));
  const atencao = g.filter((x) => x === "sem_codigo" || x === "atrasado" || x === "confirmar").length;
  return { naEstrada: g.filter((x) => x && x !== "entregue").length, atencao, texto: atencao ? `${atencao} ${pl(atencao, "precisa", "precisam")} de atenção` : "" };
};
