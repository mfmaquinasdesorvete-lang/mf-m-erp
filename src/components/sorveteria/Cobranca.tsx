// Cobrança: um ou vários meios de pagamento, troco do dinheiro e (no delivery) "receber na entrega".
import { useState } from "react";
import { Banknote, CreditCard, QrCode, Ticket, Trash2, Truck } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { MEIOS, r2, rotuloMeio, totalPedido, type Estado, type Meio, type Pagamento, type Pedido } from "@/lib/sorveteria";

const ICONE: Record<Meio, typeof Banknote> = { dinheiro: Banknote, pix: QrCode, credito: CreditCard, debito: CreditCard, vale: Ticket };
const num = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : 0; };

type Linha = { meio: Meio; valorTxt: string; recebidoTxt: string };

export function Cobranca({ pedido, estado, onConfirmar, onNaEntrega, onClose }: {
  pedido: Pedido; estado: Estado; onClose: () => void;
  onConfirmar: (pagamentos: Pagamento[], troco: number) => void;
  /** delivery: manda para a produção e cobra quando entregar */
  onNaEntrega?: () => void;
}) {
  const total = totalPedido(pedido, estado.loja.gorjetaPct);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  // dinheiro: o cliente entrega "recebido"; só entra na conta o que falta (o resto vira troco)
  const aplicado = (ls: Linha[]) => {
    let restante = total;
    const out: { l: Linha; valor: number; recebido: number }[] = [];
    // meios que não são dinheiro primeiro: o dinheiro cobre o que sobrar
    for (const l of ls.filter((x) => x.meio !== "dinheiro")) { const v = Math.min(restante, num(l.valorTxt)); restante = r2(restante - v); out.push({ l, valor: v, recebido: v }); }
    for (const l of ls.filter((x) => x.meio === "dinheiro")) {
      const rec = num(l.recebidoTxt) || num(l.valorTxt);
      const v = Math.min(restante, rec); restante = r2(restante - v); out.push({ l, valor: v, recebido: rec });
    }
    return { itens: ls.map((l) => out.find((o) => o.l === l)!), restante };
  };
  const { itens, restante } = aplicado(linhas);
  const troco = r2(itens.reduce((s, o) => s + (o.l.meio === "dinheiro" ? Math.max(0, o.recebido - o.valor) : 0), 0));

  const falta = (ls: Linha[]) => aplicado(ls).restante;
  const adicionar = (meio: Meio) => setLinhas((ls) => {
    const f = falta(ls);
    if (f <= 0 && meio !== "dinheiro") return ls;
    return [...ls, { meio, valorTxt: f > 0 ? f.toFixed(2).replace(".", ",") : "", recebidoTxt: "" }];
  });
  const mudar = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));

  const confirmar = () => {
    const pags: Pagamento[] = itens.filter((o) => o.valor > 0).map((o) => ({ meio: o.l.meio, valor: o.valor, recebido: o.l.meio === "dinheiro" ? o.recebido : undefined }));
    onConfirmar(pags, troco);
  };

  return (
    <Modal open onClose={onClose} title={`Cobrar pedido${pedido.numero ? ` ${pedido.numero}` : ""}`}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3">
          <span className="text-sm font-semibold text-slate-600">Total a pagar</span>
          <b className="text-3xl font-extrabold">{brl(total)}</b>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label="Forma de pagamento">
          {MEIOS.map(({ id, rotulo }) => {
            const I = ICONE[id];
            return (
              <button key={id} type="button" onClick={() => adicionar(id)}
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 px-1 py-3 text-xs font-semibold transition hover:border-modulo hover:bg-modulo/10">
                <I size={20} aria-hidden /> {rotulo}
              </button>
            );
          })}
        </div>

        {linhas.length > 0 && (
          <ul className="space-y-2">
            {linhas.map((l, i) => (
              <li key={i} className="rounded-xl border border-slate-200 p-2.5">
                <div className="flex items-center gap-2">
                  <b className="flex-1 text-sm">{rotuloMeio(l.meio)}</b>
                  {l.meio === "dinheiro" ? (
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">Recebido
                      <input className="input w-28 py-1 text-right" inputMode="decimal" autoFocus value={l.recebidoTxt} placeholder={l.valorTxt}
                        onChange={(e) => mudar(i, { recebidoTxt: e.target.value.replace(/[^\d,.]/g, "") })} />
                    </label>
                  ) : (
                    <input className="input w-28 py-1 text-right" inputMode="decimal" aria-label={`Valor em ${rotuloMeio(l.meio)}`} value={l.valorTxt}
                      onChange={(e) => mudar(i, { valorTxt: e.target.value.replace(/[^\d,.]/g, "") })} />
                  )}
                  <button type="button" aria-label={`Remover ${rotuloMeio(l.meio)}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}><Trash2 size={16} aria-hidden /></button>
                </div>
                {l.meio === "dinheiro" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[10, 20, 50, 100, 200].map((n) => (
                      <button key={n} type="button" className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:border-modulo" onClick={() => mudar(i, { recebidoTxt: String(n) })}>{brl(n)}</button>
                    ))}
                    <button type="button" className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold hover:border-modulo" onClick={() => mudar(i, { recebidoTxt: "" })}>Valor exato</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <dl className="num space-y-1 text-sm">
          {restante > 0 && <div className="flex justify-between text-amber-800"><dt>Falta</dt><dd className="font-bold">{brl(restante)}</dd></div>}
          {troco > 0 && <div className="flex justify-between text-2xl font-extrabold text-emerald-700"><dt>Troco</dt><dd>{brl(troco)}</dd></div>}
        </dl>

        <div className="flex flex-wrap justify-end gap-2">
          {onNaEntrega && <Button type="button" variant="secondary" onClick={onNaEntrega}><Truck size={16} aria-hidden /> Receber na entrega</Button>}
          <Button type="button" className="!px-6 !py-3 text-base" disabled={restante > 0 || (!linhas.length && total > 0)} onClick={confirmar}>Confirmar pagamento</Button>
        </div>
      </div>
    </Modal>
  );
}
