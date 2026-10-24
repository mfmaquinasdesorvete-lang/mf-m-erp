// "⚡ Pedir uma ação" (Perguntar à IA): a pessoa escreve o que quer fazer e a função ia-acao diz qual ação e acha a conta
// ou o cliente. Nada é feito aqui: a tela de sempre abre já preenchida (Registrar pagamento, Responder no WhatsApp) e só
// grava depois do Confirmar de quem pode. Por enquanto: baixa de conta a receber ou a pagar e mensagem ao cliente.
import { useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Wallet, Zap } from "lucide-react";
import { Button, Modal } from "./ui";
import { callFunction } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { BaixaModal } from "./financeiro/BaixaModal";
import { ResponderWhatsApp, type ClienteResposta } from "./atendimento/ResponderWhatsApp";
import type { PropostaAcao } from "../../supabase/functions/_shared/ia-acao";

type Conta = { id: string; descricao: string; valor: number; vencimento: string; unidade_id?: string | null; quem: string | null; revisao?: string | null };
type Cli = ClienteResposta & { municipio?: string | null; uf?: string | null };
type Resposta = { proposta: PropostaAcao; contas: Conta[]; clientes: Cli[] };
const EXEMPLOS = ["Recebi R$ 500 da Gelato Nobre no Pix hoje", "Paguei o boleto da Celesc", "Avisa a Sorveteria Gelato que a máquina está pronta"];

export function PedirAcaoIA({ inicial = "", onClose }: { inicial?: string; onClose: () => void }) {
  const { pode } = usePerfil();
  const podeBaixar = pode("editar_financeiro");
  const [pedido, setPedido] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Resposta | null>(null);
  const [baixa, setBaixa] = useState<Conta | null>(null);
  const [mensagem, setMensagem] = useState<Cli | null>(null);

  async function preparar(e?: FormEvent, texto = pedido) {
    e?.preventDefault();
    if (ocupado || texto.trim().length < 6) return;
    setOcupado(true); setErro(null); setR(null);
    try { setR(await callFunction<Resposta>("ia-acao", { pedido: texto.trim() })); }
    catch (x) { setErro((x as Error).message); }
    finally { setOcupado(false); }
  }

  const p = r?.proposta;
  const receber = p?.acao === "baixa_receber";
  return (
    <Modal open onClose={onClose} title="Pedir uma ação à IA" wide>
      <form onSubmit={preparar} className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={500} autoFocus aria-label="O que você quer fazer"
          placeholder="Ex.: recebi R$ 500 da Gelato Nobre no Pix hoje" />
        <Button type="submit" disabled={ocupado || pedido.trim().length < 6}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} {ocupado ? "Preparando…" : "Preparar"}</Button>
      </form>
      {!r && !erro && !ocupado && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="text-slate-500">Exemplos:</span>
          {EXEMPLOS.map((x) => <Button key={x} type="button" tamanho="mini" variant="secondary" onClick={() => { setPedido(x); preparar(undefined, x); }}>{x}</Button>)}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">A IA só prepara: a tela de sempre abre preenchida e nada é gravado sem o seu Confirmar. Por enquanto: dar baixa numa conta e mandar mensagem ao cliente.</p>
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{erro}</p>}

      {p && (
        <div className="mt-4 space-y-3 text-sm" aria-live="polite">
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-sky-900">
            <p><b>Entendi:</b> {p.entendi}</p>
            {(p.valor !== null || p.data) && <p className="mt-0.5 text-xs">{[p.valor !== null && brl(p.valor), p.data && `em ${dataBR(p.data)}`].filter(Boolean).join(" · ")}</p>}
            {p.nao_deu && <p className="mt-1 text-xs text-amber-800">{p.nao_deu}</p>}
          </div>

          {(p.acao === "baixa_receber" || p.acao === "baixa_pagar") && (
            !podeBaixar ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Dar baixa é com o financeiro: peça para quem tem acesso.</p>
            : !r!.contas.length ? <p className="text-slate-500">Não achei conta {receber ? "a receber" : "a pagar"} em aberto {p.quem ? `de "${p.quem}"` : ""}. Confira o nome ou procure no Financeiro.</p>
            : (
              <div>
                <p className="mb-1 font-semibold text-fg">Qual conta? ({receber ? "a receber" : "a pagar"} em aberto)</p>
                <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                  {r!.contas.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1"><b className="text-fg">{c.quem || c.descricao}</b>
                        <span className="block text-xs text-slate-500">{c.quem ? `${c.descricao} · ` : ""}vence {dataBR(c.vencimento)}</span></span>
                      <span className={`num font-semibold ${p.valor !== null && Math.abs(Number(c.valor) - p.valor) < 0.01 ? "text-emerald-700" : "text-fg"}`}>{brl(Number(c.valor))}</span>
                      <Button type="button" variant="secondary" onClick={() => setBaixa(c)}><Wallet className="h-4 w-4" /> Dar baixa…</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}

          {p.acao === "mensagem" && (
            !r!.clientes.length ? <p className="text-slate-500">Não achei o cliente {p.quem ? `"${p.quem}"` : ""} no cadastro.</p> : (
              <div>
                <p className="mb-1 font-semibold text-fg">Para qual cliente?</p>
                <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                  {r!.clientes.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1"><b className="text-fg">{c.nome_fantasia?.trim() || c.nome}</b>
                        <span className="block text-xs text-slate-500">{[c.municipio, c.uf].filter(Boolean).join("/") || " "}{!(c.whatsapp || c.telefone) ? " · sem WhatsApp no cadastro" : ""}</span></span>
                      <Button type="button" variant="secondary" onClick={() => setMensagem(c)}><MessageCircle className="h-4 w-4" /> Escrever a mensagem…</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      )}

      {baixa && p && (
        <BaixaModal conta={baixa} tabela={receber ? "contas_receber" : "contas_pagar"} valorInicial={p.valor ?? undefined} dataInicial={p.data ?? undefined}
          onClose={() => { setBaixa(null); preparar(); }} />
      )}
      {mensagem && p && <ResponderWhatsApp cliente={mensagem} escrever={p.mensagem ?? pedido} onClose={() => setMensagem(null)} />}
    </Modal>
  );
}
