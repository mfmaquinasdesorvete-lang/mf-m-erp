// Conferência de risco antes de despachar (vendas pagas por cartão ou por link): os pontos e os motivos de cada pedido,
// a janela de aprovar ou recusar (financeiro ou administrador, dizendo o que foi conferido) e a faixa com os pedidos da
// expedição que esperam a conferência. A regra e a trava do despacho ficam no banco (risco_pedido_calc e o gatilho
// expedicao_risco), então nenhuma tela despacha sem a aprovação.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR } from "@/lib/format";

export type Motivo = { codigo: string; pontos: number; texto: string };
export type Risco = {
  elegivel: boolean; pontos: number; nivel: "baixo" | "medio" | "alto"; motivos: Motivo[]; travar: boolean; ativo: boolean; limite: number;
  meio?: "cartao" | "link";
  conferencia: { situacao: "aprovada" | "recusada"; por: string | null; em: string; observacao: string; pontos: number; valor: number; valor_mudou: boolean } | null;
};
type Pendente = { pedido_id: string; numero: number; cliente: string | null; valor: number; etapa: string; pontos: number; nivel: Risco["nivel"]; travar: boolean; situacao: string | null };

export const NIVEL: Record<Risco["nivel"], { rotulo: string; cor: string }> = {
  baixo: { rotulo: "baixo", cor: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  medio: { rotulo: "médio", cor: "border-amber-300 bg-amber-50 text-amber-900" },
  alto: { rotulo: "alto", cor: "border-red-300 bg-red-50 text-red-800" },
};

/** O que vale a pena conferir: um toque põe a frase na observação. */
const CONFERIDO = [
  "Liguei para o cliente no telefone do cadastro e ele confirmou a compra",
  "O nome do titular do cartão é o do cliente",
  "O comprovante do pagamento confere",
  "O endereço de entrega é o do cadastro",
  "Cliente conhecido / já comprou antes",
];

export function useRiscoPedido(pedidoId: string | null | undefined) {
  return useQuery({
    queryKey: ["risco", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("risco_pedido", { p_pedido: pedidoId });
      if (error) throw error;
      return (data ?? null) as Risco | null;
    },
  });
}

/** Selo do nível com os pontos. */
export function SeloRisco({ nivel, pontos }: { nivel: Risco["nivel"]; pontos: number }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${NIVEL[nivel].cor}`}>Risco {NIVEL[nivel].rotulo} · {pontos} pts</span>;
}

/** Quadro dentro da expedição: só aparece em venda por cartão ou link. */
export function QuadroRisco({ pedidoId, numero }: { pedidoId: string; numero: number }) {
  const { data: r } = useRiscoPedido(pedidoId);
  const [aberto, setAberto] = useState(false);
  if (!r?.elegivel || !r.ativo) return null;
  const c = r.conferencia;
  const Icone = r.travar ? (c?.situacao === "recusada" ? ShieldX : ShieldAlert) : ShieldCheck;
  const cor = r.travar ? (c?.situacao === "recusada" ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900") : "border-emerald-300 bg-emerald-50 text-emerald-900";
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${cor}`}>
      <Icone size={18} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {r.travar
            ? c?.situacao === "recusada" ? "Conferência de risco recusada: não despachar" : c?.valor_mudou ? "O valor mudou depois da conferência: confira de novo" : "Conferir o risco antes de despachar"
            : c?.situacao === "aprovada" ? `Risco conferido${c.por ? ` por ${c.por}` : ""} em ${dataBR(c.em)}` : "Risco abaixo do limite: pode despachar"}
        </div>
        <div className="text-xs opacity-90">{r.motivos.length ? r.motivos.map((m) => m.texto).join(" · ") : "Nenhum sinal de risco."}</div>
      </div>
      <SeloRisco nivel={r.nivel} pontos={r.pontos} />
      <Button type="button" variant="secondary" onClick={() => setAberto(true)}>{r.travar ? "Conferir" : "Ver"}</Button>
      {aberto && <DecidirRisco pedidoId={pedidoId} numero={numero} onClose={() => setAberto(false)} />}
    </div>
  );
}

/** Janela da conferência: motivos, o que foi conferido e aprovar ou recusar. */
export function DecidirRisco({ pedidoId, numero, onClose }: { pedidoId: string; numero: number; onClose: () => void }) {
  const { data: r } = useRiscoPedido(pedidoId);
  const { tem } = usePerfil();
  const decide = tem("financeiro");
  const invalidar = useInvalidate();
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function decidir(decisao: "aprovada" | "recusada") {
    setOcupado(true);
    const { error } = await supabase.rpc("decidir_risco", { p_pedido: pedidoId, p_decisao: decisao, p_observacao: obs });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(decisao === "aprovada" ? `Pedido #${numero} liberado para despachar` : `Pedido #${numero} recusado: não será despachado`);
    invalidar("risco", "riscos_despachar", "expedicoes");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Conferência de risco · pedido #${numero}`}>
      {!r ? <p className="text-sm text-slate-500">Carregando…</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeloRisco nivel={r.nivel} pontos={r.pontos} />
            <span className="text-sm text-slate-600">Venda por {r.meio === "link" ? "link de pagamento" : "cartão"} · trava a partir de {r.limite} pontos</span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {r.motivos.length ? r.motivos.map((m) => (
              <li key={m.codigo} className="flex items-center justify-between gap-3 px-3 py-2"><span>{m.texto}</span><b className="shrink-0">+{m.pontos}</b></li>
            )) : <li className="px-3 py-2 text-slate-500">Nenhum sinal de risco.</li>}
          </ul>
          {r.conferencia && (
            <p className={`rounded-lg p-2.5 text-sm ${r.conferencia.situacao === "aprovada" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
              {r.conferencia.situacao === "aprovada" ? "Aprovada" : "Recusada"}{r.conferencia.por ? ` por ${r.conferencia.por}` : ""} em {dataBR(r.conferencia.em)} ({brl(r.conferencia.valor)}): {r.conferencia.observacao}
              {r.conferencia.valor_mudou && <b> · o valor do pedido mudou depois</b>}
            </p>
          )}
          {decide ? (
            <>
              <div>
                <div className="mb-1.5 text-xs font-semibold text-slate-600">O que foi conferido (fica registrado)</div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {CONFERIDO.map((t) => (
                    <Button key={t} type="button" tamanho="mini" variant="secondary" onClick={() => setObs((o) => (o.includes(t) ? o : o ? `${o}; ${t}` : t))}>
                      <CheckCircle2 size={12} aria-hidden />{t}</Button>
                  ))}
                </div>
                <textarea className="input min-h-[80px]" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000}
                  placeholder="Ex.: liguei para o cliente, confirmou a compra; o titular do cartão é o sócio da empresa" aria-label="O que foi conferido" />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" disabled={ocupado || obs.trim().length < 5} onClick={() => decidir("recusada")}><ShieldX size={16} aria-hidden /> Recusar (não despachar)</Button>
                <Button type="button" disabled={ocupado || obs.trim().length < 5} onClick={() => decidir("aprovada")}><ShieldCheck size={16} aria-hidden /> Aprovar e liberar</Button>
              </div>
              <p className="text-xs text-slate-500">Recusou? Cancele a venda e devolva o pagamento pela InfinitePay. A aprovação vale para o valor de agora: se o pedido mudar de valor, confere de novo.</p>
            </>
          ) : <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">Só o financeiro ou o administrador aprova. Avise quem cuida do financeiro: o pedido fica parado até a conferência.</p>}
        </div>
      )}
    </Modal>
  );
}

/** Faixa com os pedidos da expedição que esperam a conferência de risco (Fluxo de pedidos e painel da expedição). */
export function RiscosParaDespachar() {
  const { data: lista = [] } = useQuery({
    queryKey: ["riscos_despachar"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("riscos_para_despachar");
      if (error) throw error;
      return (data ?? []) as Pendente[];
    },
    refetchInterval: 120_000,
  });
  const [aberto, setAberto] = useState<Pendente | null>(null);
  const travados = lista.filter((x) => x.travar);
  if (!travados.length) return null;
  return (
    <Card className="border-amber-300 bg-amber-50 p-3 sm:p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900"><ShieldAlert size={17} aria-hidden /> Conferir o risco antes de despachar ({travados.length})</h2>
      <ul className="flex flex-wrap gap-2">
        {travados.map((x) => (
          <li key={x.pedido_id}>
            <button type="button" onClick={() => setAberto(x)}
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-surface px-2.5 py-1.5 text-left text-sm hover:border-amber-500">
              <b>#{x.numero}</b><span className="max-w-[12rem] truncate">{x.cliente ?? "—"}</span><span className="num">{brl(x.valor)}</span>
              {x.situacao === "recusada" ? <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">recusado</span> : <SeloRisco nivel={x.nivel} pontos={x.pontos} />}
            </button>
          </li>
        ))}
      </ul>
      {aberto && <DecidirRisco pedidoId={aberto.pedido_id} numero={aberto.numero} onClose={() => setAberto(null)} />}
    </Card>
  );
}
