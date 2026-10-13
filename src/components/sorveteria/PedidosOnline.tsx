// Pedidos que chegam pelo cardápio online: o caixa aceita (vira pedido do PDV e entra na fila de produção) ou recusa com motivo.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, MessageCircle, X } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { enderecoCardapio, type PedidoOnline } from "@/lib/sorveteriaOnline";
import { rotuloMeio, type Estado, type Meio } from "@/lib/sorveteria";

/** Pedidos online ainda sem resposta (o PDV usa para o aviso no menu e para tocar o som). */
export function useOnline(slug: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["sorv-online", slug], enabled: !!slug, refetchInterval: 12_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sorv_online_listar", { p_slug: slug });
      if (error) throw error;
      return (data ?? []) as PedidoOnline[];
    },
  });
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const novos = (q.data ?? []).filter((o) => o.status === "novo");
    if (vistos.current === null) { vistos.current = new Set(novos.map((o) => o.id)); return; }
    const chegou = novos.filter((o) => !vistos.current!.has(o.id));
    chegou.forEach((o) => vistos.current!.add(o.id));
    if (chegou.length) {
      notify(`Novo pedido online ${chegou[0].codigo} · ${brl(chegou[0].total)}`);
      try {
        const ctx = new AudioContext(), osc = ctx.createOscillator(), ganho = ctx.createGain();
        osc.frequency.value = 880; ganho.gain.value = 0.15; osc.connect(ganho); ganho.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.35); osc.onended = () => ctx.close();
      } catch { /* navegador sem som liberado */ }
    }
  }, [q.data]);
  return { ...q, atualizar: () => qc.invalidateQueries({ queryKey: ["sorv-online", slug] }), novos: (q.data ?? []).filter((o) => o.status === "novo").length };
}

export function PedidosOnline({ estado, online, onAceitar }: {
  estado: Estado; online: ReturnType<typeof useOnline>; onAceitar: (o: PedidoOnline) => void;
}) {
  const [recusando, setRecusando] = useState<PedidoOnline | null>(null);
  const [motivo, setMotivo] = useState("");
  const slug = estado.loja.slug;

  if (!slug) return <Card className="mx-auto max-w-lg p-6 text-center text-sm text-slate-600">Defina o endereço do cardápio online em <b>Cardápio → Loja e entrega</b> para receber pedidos pelo link.</Card>;
  const lista = online.data ?? [];

  async function aceitar(o: PedidoOnline) {
    try {
      const { error } = await supabase.rpc("sorv_online_status", { p_id: o.id, p_status: "aceito" });
      if (error) throw error;
      onAceitar(o); online.atualizar();
    } catch (e) { notifyError(e); online.atualizar(); }
  }
  async function recusar() {
    if (!recusando) return;
    if (!motivo.trim()) return notify("Informe o motivo para o cliente.", "erro");
    try {
      const { error } = await supabase.rpc("sorv_online_status", { p_id: recusando.id, p_status: "recusado", p_motivo: motivo });
      if (error) throw error;
      setRecusando(null); setMotivo(""); online.atualizar();
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        Link do cardápio: <a className="inline-flex items-center gap-1 font-semibold text-modulo-texto underline" href={enderecoCardapio(slug)} target="_blank" rel="noreferrer">{enderecoCardapio(slug)} <ExternalLink size={13} aria-hidden /></a>
        {!estado.loja.online && <b className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">recebimento pausado</b>}
      </p>
      {online.isError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Não foi possível buscar os pedidos online. Verifique a conexão.</p>}
      {lista.length === 0 && !online.isLoading && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nenhum pedido online nos últimos 2 dias.</p>}
      {lista.map((o) => (
        <Card key={o.id} className={`p-4 ${o.status === "novo" ? "border-amber-400" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <b className="text-lg tracking-widest">{o.codigo}</b>
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{o.canal === "delivery" ? "Entrega" : "Retirada"}</span>
              <span className={`ml-2 text-xs font-bold ${o.status === "novo" ? "text-amber-700" : o.status === "aceito" ? "text-emerald-700" : "text-red-700"}`}>{o.status === "novo" ? "AGUARDANDO" : o.status === "aceito" ? "ACEITO" : "RECUSADO"}</span>
            </div>
            <span className="text-xs text-slate-500">{new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <p className="mt-1 text-sm"><b>{o.cliente.nome}</b> · {o.cliente.telefone}</p>
          {o.canal === "delivery" && <p className="text-sm text-slate-600">{o.cliente.endereco}{o.cliente.bairro ? ` · ${o.cliente.bairro}` : ""}{o.cliente.referencia ? ` · ${o.cliente.referencia}` : ""}</p>}
          <ul className="mt-2 space-y-1 text-sm">
            {o.itens.map((i) => (
              <li key={i.id}><b>{i.qtd}× {i.nome}</b> <span className="text-slate-500">{[i.sabores.join(", "), i.complementos.map((c) => `+ ${c.nome}`).join(", "), i.obs && `Obs: ${i.obs}`].filter(Boolean).join(" · ")}</span></li>
            ))}
          </ul>
          <p className="num mt-2 text-sm text-slate-600">Pagamento: {rotuloMeio(o.pagamento as Meio)}{o.troco_para ? ` (troco para ${brl(o.troco_para)})` : ""} · entrega {brl(o.taxa_entrega)}{o.desconto > 0 && ` · cupom ${o.cupom} − ${brl(o.desconto)}`} · <b className="text-fg">total {brl(o.total)}</b></p>
          {o.observacoes && <p className="mt-1 rounded bg-amber-50 p-2 text-xs font-semibold text-amber-900">{o.observacoes}</p>}
          {o.motivo && <p className="mt-1 text-xs text-red-700">Motivo: {o.motivo}</p>}
          {o.status === "novo" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => aceitar(o)}><Check size={16} aria-hidden /> Aceitar e enviar para produção</Button>
              <Button type="button" variant="secondary" onClick={() => setRecusando(o)}><X size={16} aria-hidden /> Recusar</Button>
              <a className="inline-flex min-h-[42px] items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50" target="_blank" rel="noreferrer"
                href={whatsappLink(o.cliente.telefone, `Olá, ${o.cliente.nome}! Sobre o seu pedido ${o.codigo}:`)}><MessageCircle size={16} aria-hidden /> WhatsApp</a>
            </div>
          )}
        </Card>
      ))}

      <Modal open={!!recusando} onClose={() => setRecusando(null)} title={`Recusar pedido ${recusando?.codigo ?? ""}`}>
        <div className="space-y-3">
          <Field label="Motivo (o cliente vê)"><input className="input" autoFocus value={motivo} placeholder="Ex.: sabor acabou, fora da área de entrega" onChange={(e) => setMotivo(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setRecusando(null)}>Voltar</Button><Button type="button" variant="danger" onClick={recusar}>Recusar pedido</Button></div>
        </div>
      </Modal>
    </div>
  );
}
