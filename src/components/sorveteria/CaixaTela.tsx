// Caixa: abertura com fundo de troco, sangria, suprimento e fechamento com conferência do que foi contado.
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Lock, Unlock } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  abrirCaixa, caixaAberto, MEIOS, novoId, r2, totaisCaixa, type Caixa, type Estado, type Meio,
} from "@/lib/sorveteria";

const num = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : 0; };
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function CaixaTela({ estado, mudar, operador }: { estado: Estado; mudar: (f: (e: Estado) => Estado) => void; operador: string }) {
  const caixa = caixaAberto(estado);
  const [fundoTxt, setFundoTxt] = useState("");
  const [mov, setMov] = useState<"sangria" | "suprimento" | null>(null);
  const [movValor, setMovValor] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [fechando, setFechando] = useState(false);
  const [contado, setContado] = useState<Partial<Record<Meio, string>>>({});

  const registrarMov = () => {
    const valor = num(movValor);
    if (!caixa || !mov || valor <= 0) return notify("Informe o valor.", "erro");
    if (!movMotivo.trim()) return notify("Informe o motivo.", "erro");
    mudar((e) => ({ ...e, caixas: e.caixas.map((c) => c.id === caixa.id ? { ...c, movimentos: [...c.movimentos, { id: novoId(), tipo: mov, valor: r2(valor), motivo: movMotivo.trim(), em: new Date().toISOString() }] } : c) }));
    setMov(null); setMovValor(""); setMovMotivo("");
  };

  if (!caixa) {
    const anteriores = [...estado.caixas].reverse().slice(0, 5);
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3"><Lock className="text-slate-400" aria-hidden /><h2 className="text-lg font-bold">Caixa fechado</h2></div>
          <p className="text-sm text-slate-600">Abra o caixa com o dinheiro que está na gaveta para começar a vender.</p>
          <Field label="Fundo de troco (R$)">
            <input className="input text-lg" inputMode="decimal" autoFocus placeholder="0,00" value={fundoTxt} onChange={(e) => setFundoTxt(e.target.value.replace(/[^\d,.]/g, ""))} />
          </Field>
          <Button type="button" className="w-full !py-3 text-base" onClick={() => mudar((e) => abrirCaixa(e, operador, num(fundoTxt)))}><Unlock size={18} aria-hidden /> Abrir caixa</Button>
        </Card>
        {anteriores.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-bold">Últimos caixas</h3>
            <ul className="divide-y divide-slate-100 text-sm">
              {anteriores.map((c) => {
                const t = totaisCaixa(estado, c);
                const cont = c.contado?.dinheiro;
                const dif = cont != null ? r2(cont - t.dinheiroEsperado) : null;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{hora(c.abertoEm)} · {c.operador}</span>
                    <span className="num">{t.qtd} vendas · <b>{brl(t.vendas)}</b>{dif != null && dif !== 0 && <span className={dif < 0 ? " text-red-600" : " text-amber-700"}> · {dif > 0 ? "sobra" : "falta"} {brl(Math.abs(dif))}</span>}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  const t = totaisCaixa(estado, caixa);
  const abertos = estado.pedidos.filter((p) => p.situacao === "aberto" && p.itens.length > 0);
  const esperado: Record<Meio, number> = { dinheiro: t.dinheiroEsperado, pix: t.por.pix, credito: t.por.credito, debito: t.por.debito, vale: t.por.vale };
  const contadoNum = (m: Meio) => (contado[m] === undefined || contado[m] === "" ? null : num(contado[m]!));
  const diferenca = (m: Meio) => { const c = contadoNum(m); return c == null ? null : r2(c - esperado[m]); };

  const fechar = () => {
    if (contadoNum("dinheiro") == null) return notify("Informe o dinheiro contado na gaveta.", "erro");
    const registro: Caixa["contado"] = Object.fromEntries(MEIOS.map((m) => [m.id, contadoNum(m.id) ?? esperado[m.id]]));
    mudar((e) => ({ ...e, caixas: e.caixas.map((c) => c.id === caixa.id ? { ...c, fechadoEm: new Date().toISOString(), contado: registro } : c) }));
    setFechando(false); setContado({});
    notify("Caixa fechado.");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><Unlock size={18} className="text-emerald-600" aria-hidden /> Caixa aberto</h2>
            <p className="text-sm text-slate-500">{hora(caixa.abertoEm)} · {caixa.operador} · fundo {brl(caixa.fundo)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setMov("suprimento")}><ArrowDownToLine size={16} aria-hidden /> Suprimento</Button>
            <Button type="button" variant="secondary" onClick={() => setMov("sangria")}><ArrowUpFromLine size={16} aria-hidden /> Sangria</Button>
            <Button type="button" variant="danger" onClick={() => setFechando(true)}><Lock size={16} aria-hidden /> Fechar caixa</Button>
          </div>
        </div>
        <dl className="num mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Vendas</dt><dd className="text-xl font-extrabold">{brl(t.vendas)}</dd><dd className="text-xs text-slate-500">{t.qtd} pedidos</dd></div>
          {MEIOS.filter((m) => t.por[m.id] > 0 || m.id === "dinheiro").map((m) => (
            <div key={m.id} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{m.rotulo}</dt><dd className="text-xl font-extrabold">{brl(t.por[m.id])}</dd></div>
          ))}
        </dl>
        <p className="num mt-3 text-sm text-slate-600">Dinheiro que deve estar na gaveta: <b>{brl(t.dinheiroEsperado)}</b> <span className="text-slate-400">(fundo + dinheiro + suprimentos − sangrias)</span></p>
      </Card>

      {caixa.movimentos.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold">Sangrias e suprimentos</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {caixa.movimentos.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 py-2"><span>{hora(m.em)} · {m.tipo === "sangria" ? "Sangria" : "Suprimento"} · {m.motivo}</span><b className={m.tipo === "sangria" ? "text-red-600" : "text-emerald-700"}>{m.tipo === "sangria" ? "−" : "+"} {brl(m.valor)}</b></li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!mov} onClose={() => setMov(null)} title={mov === "sangria" ? "Sangria (retirar dinheiro)" : "Suprimento (colocar dinheiro)"}>
        <div className="space-y-3">
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" autoFocus value={movValor} onChange={(e) => setMovValor(e.target.value.replace(/[^\d,.]/g, ""))} /></Field>
          <Field label="Motivo"><input className="input" value={movMotivo} placeholder={mov === "sangria" ? "Ex.: levou ao banco, pagamento de fornecedor" : "Ex.: troco extra"} onChange={(e) => setMovMotivo(e.target.value)} /></Field>
          <div className="flex justify-end"><Button type="button" onClick={registrarMov}>Registrar</Button></div>
        </div>
      </Modal>

      <Modal open={fechando} onClose={() => setFechando(false)} title="Fechar caixa">
        <div className="space-y-4">
          {abertos.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Há {abertos.length} {abertos.length === 1 ? "comanda/pedido em aberto" : "comandas/pedidos em aberto"}. Eles não entram neste caixa: cobre ou cancele antes de fechar.
            </p>
          )}
          <p className="text-sm text-slate-600">Conte o que há na gaveta e confira as maquininhas. Só o dinheiro é obrigatório.</p>
          <div className="space-y-2">
            {MEIOS.filter((m) => m.id === "dinheiro" || esperado[m.id] > 0).map((m) => {
              const d = diferenca(m.id);
              return (
                <div key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-xl border border-slate-200 p-2.5">
                  <b className="text-sm">{m.rotulo}</b>
                  <input className="input w-32 py-1 text-right" inputMode="decimal" aria-label={`${m.rotulo} contado`} placeholder="contado" value={contado[m.id] ?? ""} onChange={(e) => setContado((c) => ({ ...c, [m.id]: e.target.value.replace(/[^\d,.]/g, "") }))} />
                  <span className="num text-xs text-slate-500">esperado {brl(esperado[m.id])}</span>
                  <span className={`num text-right text-xs font-bold ${d == null ? "text-slate-400" : d === 0 ? "text-emerald-700" : d < 0 ? "text-red-600" : "text-amber-700"}`}>
                    {d == null ? "—" : d === 0 ? "confere" : d < 0 ? `falta ${brl(-d)}` : `sobra ${brl(d)}`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setFechando(false)}>Voltar</Button><Button type="button" variant="danger" onClick={fechar}>Fechar caixa</Button></div>
        </div>
      </Modal>
    </div>
  );
}
