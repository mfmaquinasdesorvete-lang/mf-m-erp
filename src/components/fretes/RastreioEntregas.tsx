// Fretes → Rastreio: as entregas na estrada (sem código, a caminho, atrasadas e entregues nos últimos 15 dias). Em
// cada uma: o link de acompanhar da transportadora, copiar o código e mandar pelo WhatsApp do cliente. Ao preencher o
// código aqui, o banco manda sozinho o e-mail "Seu pedido foi enviado" com o link para o cliente.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CheckCircle2, Copy, ExternalLink, Mail, MessageCircle, PackageSearch, Truck } from "lucide-react";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { dataBR, hoje, pl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { linkRastreio } from "@/lib/transportadoras";
import { grupoRastreio, mensagemRastreio, type GrupoRastreio } from "@/lib/rastreio";
import type { Envio } from "@/lib/fretes";
import type { Transportadora } from "@/lib/types";

type ClienteContato = { id: string; nome: string; nome_fantasia: string | null; whatsapp: string | null; telefone: string | null; email: string | null; avisos_email: boolean | null };

const GRUPOS: { id: GrupoRastreio; titulo: string; icone: typeof Truck; cor: string }[] = [
  { id: "sem_codigo", titulo: "Saíram sem código de rastreio", icone: PackageSearch, cor: "border-l-amber-400" },
  { id: "atrasado", titulo: "Passaram da previsão", icone: AlarmClock, cor: "border-l-red-500" },
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
        <Mail size={15} className="mr-1 inline" aria-hidden /> Ao preencher o código de rastreio, o cliente recebe o e-mail <b>"Seu pedido foi enviado"</b> com o link para acompanhar (se tiver e-mail no cadastro). Pelo WhatsApp, use o botão de cada entrega.
      </p>
      {GRUPOS.map(({ id, titulo, icone: Icone, cor }) => {
        const doGrupo = lista.filter((x) => x.g === id);
        if (!doGrupo.length) return null;
        return (
          <section key={id} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-fg"><Icone size={16} aria-hidden /> {titulo} · {doGrupo.length}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {doGrupo.map(({ e }) => (
                <CartaoRastreio key={e.id} e={e} cor={cor} cliente={e.cliente_id ? cli.get(e.cliente_id) : undefined}
                  transportadora={e.transportadora_id ? transp.get(e.transportadora_id) : undefined} pedido={numeroPedido(e.pedido_id)} podeEditar={podeEditar} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CartaoRastreio({ e, cor, cliente, transportadora, pedido, podeEditar }: {
  e: Envio; cor: string; cliente?: ClienteContato; transportadora?: Transportadora; pedido: number | null; podeEditar: boolean;
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
          <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-fg hover:bg-slate-200" aria-label={`Copiar o código ${cod}`}>
            {cod} <Copy size={12} aria-hidden />
          </button>
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
      {cod && e.status !== "entregue" && (
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

export const contarRastreio = (envios: Envio[], dia = hoje()) => {
  const g = envios.map((e) => grupoRastreio(e, dia));
  const atencao = g.filter((x) => x === "sem_codigo" || x === "atrasado").length;
  return { naEstrada: g.filter((x) => x && x !== "entregue").length, atencao, texto: atencao ? `${atencao} ${pl(atencao, "precisa", "precisam")} de atenção` : "" };
};
