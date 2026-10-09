// Painel do Financeiro (pensado para o celular): saldo nos bancos, o que entra e sai hoje, vencidas,
// os próximos 7 dias, o que pede atenção e o mês. Cada número abre a lista com a ação ali mesmo
// (receber, pagar, cobrar no WhatsApp, recibo).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarDays, ChevronRight, FileWarning, Landmark, MessageCircle, Plus, ReceiptText, Send, TrendingDown, TrendingUp,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { BaixaModal } from "./BaixaModal";
import { Fluxo } from "./VisaoGeral";
import { BotaoRecibo, reciboDePagar, reciboDeReceber } from "./Recibos";
import { useRows } from "@/lib/data";
import { brl, dataBR, hoje as hojeISO, whatsappLink } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { useConfig } from "@/lib/useConfig";
import { somarDias, type ContaFin } from "@/lib/financeiro";

type Receber = ContaFin & { cliente_id?: string | null; cliente?: { nome: string; nome_fantasia?: string | null; whatsapp?: string | null; cpf_cnpj?: string | null } | null };
type Pagar = ContaFin & { fornecedor_id?: string | null; observacoes?: string | null; fornecedor?: { nome: string; cnpj?: string | null } | null };
type Lista = { titulo: string; tipo: "receber" | "pagar"; contas: (Receber | Pagar)[] };

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const nomeDia = (d: string, h: string) => (d === h ? "Hoje" : d === somarDias(h, 1) ? "Amanhã" : `${DIAS[new Date(d + "T12:00:00Z").getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`);
const soma = (l: { valor: number; valor_pago?: number | null; status: string }[]) => l.reduce((s, c) => s + Number(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor), 0);
const variacao = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

export function PainelFinanceiro() {
  const { nome, pode } = usePerfil();
  const podeBaixar = pode("editar_financeiro");
  const navigate = useNavigate();
  const { filtrar } = useUnidade();
  const dia = hojeISO();
  const { data: recTodos = [] } = useRows<Receber>("contas_receber", { select: "*, cliente:clientes(nome, nome_fantasia, whatsapp, cpf_cnpj)", key: ["painel"] });
  const { data: pagTodos = [] } = useRows<Pagar>("contas_pagar", { select: "*, fornecedor:fornecedores(nome, cnpj)", key: ["painel"] });
  const { data: recebidasTodas = [] } = useRows<{ processamento: string; unidade_id: string | null }>("nfe_recebidas", { select: "processamento, unidade_id", key: ["painel"] });
  const { data: extrato = [] } = useRows<{ status: string }>("extrato_lancamentos", { select: "status", order: "status", key: ["painel"] });
  const { data: saldosTodos = [] } = useQuery({
    queryKey: ["saldos_bancarios"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saldos_bancarios"); if (error) throw error; return (data ?? []) as { conta_id: string; unidade_id: string; saldo: number }[]; },
  });
  const rec = useMemo(() => filtrar(recTodos).filter((c) => c.status !== "cancelado").map((c) => ({ ...c, terceiro: c.cliente?.nome_fantasia?.trim() || c.cliente?.nome || null })), [recTodos, filtrar]);
  const pag = useMemo(() => filtrar(pagTodos).filter((c) => c.status !== "cancelado").map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? null })), [pagTodos, filtrar]);
  const saldoBancos = filtrar(saldosTodos).reduce((s, x) => s + Number(x.saldo), 0);
  const temBancos = filtrar(saldosTodos).length > 0;

  const [lista, setLista] = useState<Lista | null>(null);
  const [baixa, setBaixa] = useState<{ conta: ContaFin; tabela: "contas_receber" | "contas_pagar" } | null>(null);

  const k = useMemo(() => {
    const abertas = <T extends ContaFin>(l: T[]) => l.filter((c) => c.status === "aberto");
    const ar = abertas(rec), ap = abertas(pag);
    const semana = Array.from({ length: 7 }, (_, i) => somarDias(dia, i));
    const ate7 = semana[6];
    const mes = dia.slice(0, 7);
    const mesAnt = somarDias(`${mes}-01`, -1).slice(0, 7);
    const pagoNo = <T extends ContaFin>(l: T[], m: string) => l.filter((c) => c.status === "pago" && (c.data_pagamento ?? "").startsWith(m));
    // mesmo dia do mês passado, para comparar de igual para igual
    const ateDiaAnt = `${mesAnt}-${dia.slice(8, 10)}`;
    const pagoAte = <T extends ContaFin>(l: T[], m: string, ate: string) => l.filter((c) => c.status === "pago" && (c.data_pagamento ?? "").startsWith(m) && (c.data_pagamento ?? "") <= ate);
    return {
      recHoje: ar.filter((c) => c.vencimento === dia), pagHoje: ap.filter((c) => c.vencimento === dia),
      recVencidas: ar.filter((c) => c.vencimento < dia).sort((a, b) => b.valor - a.valor),
      pagVencidas: ap.filter((c) => c.vencimento < dia).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
      semana: semana.map((d) => ({ dia: d, rec: ar.filter((c) => c.vencimento === d), pag: ap.filter((c) => c.vencimento === d) })),
      entra7: soma(ar.filter((c) => c.vencimento >= dia && c.vencimento <= ate7)),
      sai7: soma(ap.filter((c) => c.vencimento >= dia && c.vencimento <= ate7)),
      recebidoMes: soma(pagoNo(rec, mes)), pagoMes: soma(pagoNo(pag, mes)),
      recebidoAnt: soma(pagoAte(rec, mesAnt, ateDiaAnt)), pagoAnt: soma(pagoAte(pag, mesAnt, ateDiaAnt)),
      recebidosHoje: rec.filter((c) => c.status === "pago" && c.data_pagamento === dia),
    };
  }, [rec, pag, dia]);

  const previsto7 = saldoBancos + k.entra7 - k.sai7;
  const nfeConferir = filtrar(recebidasTodas).filter((n) => ["aguardando_vinculo", "revisao"].includes(n.processamento)).length;
  const extratoPendente = extrato.filter((l) => l.status === "pendente").length;
  const resultadoMes = k.recebidoMes - k.pagoMes;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const atencao: { texto: string; acao: string; onClick: () => void; tom: "ruim" | "atencao" }[] = [];
  if (temBancos && previsto7 < 0) atencao.push({ tom: "ruim", texto: `O saldo previsto para os próximos 7 dias fica negativo (${brl(previsto7)}).`, acao: "Ver fluxo", onClick: () => document.getElementById("fluxo-caixa")?.scrollIntoView({ behavior: "smooth" }) });
  if (k.pagVencidas.length) atencao.push({ tom: "ruim", texto: `${k.pagVencidas.length} conta(s) a pagar vencida(s): ${brl(soma(k.pagVencidas))}.`, acao: "Pagar", onClick: () => setLista({ titulo: "A pagar vencidas", tipo: "pagar", contas: k.pagVencidas }) });
  if (k.recVencidas.length) atencao.push({ tom: "atencao", texto: `${new Set(k.recVencidas.map((c) => c.cliente_id)).size} cliente(s) com ${brl(soma(k.recVencidas))} vencido.`, acao: "Cobrar", onClick: () => setLista({ titulo: "A receber vencidas", tipo: "receber", contas: k.recVencidas }) });
  if (nfeConferir) atencao.push({ tom: "atencao", texto: `${nfeConferir} nota(s) de fornecedor para conferir e lançar.`, acao: "Abrir", onClick: () => navigate("/notas") });
  if (extratoPendente) atencao.push({ tom: "atencao", texto: `${extratoPendente} lançamento(s) do extrato para conciliar.`, acao: "Conciliar", onClick: () => navigate("/conciliacao") });

  return (
    <div className="space-y-4">
      {baixa && <BaixaModal conta={baixa.conta} tabela={baixa.tabela} onClose={() => setBaixa(null)} />}
      {lista && <ListaContas lista={lista} dia={dia} podeBaixar={podeBaixar} onClose={() => setLista(null)}
        onBaixa={(c) => setBaixa({ conta: c, tabela: lista.tipo === "receber" ? "contas_receber" : "contas_pagar" })} />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{saudacao}, {nome.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} · seu financeiro de hoje</p>
      </div>

      {/* saldo: o número principal */}
      <button type="button" onClick={() => navigate("/conciliacao")}
        className="w-full rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#ea580c] p-5 text-left text-white shadow-pop transition active:scale-[0.99]">
        <div className="flex items-center justify-between text-sm font-semibold text-white/90"><span className="flex items-center gap-1.5"><Landmark size={16} /> Saldo nos bancos hoje</span><ChevronRight size={18} /></div>
        <div className="num mt-1 text-[clamp(1.9rem,8vw,2.6rem)] font-extrabold leading-tight">{temBancos ? brl(saldoBancos) : "—"}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/25 pt-2.5 text-xs">
          <span className="min-w-0"><span className="block text-white/85">entra em 7 dias</span><b className="num block whitespace-nowrap text-[clamp(0.72rem,3.3vw,0.9rem)]">+{brl(k.entra7)}</b></span>
          <span className="min-w-0"><span className="block text-white/85">sai em 7 dias</span><b className="num block whitespace-nowrap text-[clamp(0.72rem,3.3vw,0.9rem)]">−{brl(k.sai7)}</b></span>
          <span className="min-w-0"><span className="block text-white/85">saldo em 7 dias</span><b className="num block whitespace-nowrap text-[clamp(0.72rem,3.3vw,0.9rem)]">{temBancos ? brl(previsto7) : "—"}</b></span>
        </div>
        {!temBancos && <p className="mt-2 text-xs text-white/90">Cadastre as contas bancárias com o saldo inicial (toque aqui) para o saldo aparecer.</p>}
      </button>

      {/* hoje e vencidas: cada um abre a lista com a ação */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tile icone={ArrowDownCircle} cor="text-emerald-600" titulo="Recebe hoje" valor={soma(k.recHoje)} sub={`${k.recHoje.length} conta(s)${k.recebidosHoje.length ? ` · ${k.recebidosHoje.length} já recebida(s)` : ""}`}
          onClick={() => setLista({ titulo: "A receber hoje", tipo: "receber", contas: k.recHoje })} />
        <Tile icone={ArrowUpCircle} cor="text-orange-600" titulo="Paga hoje" valor={soma(k.pagHoje)} sub={`${k.pagHoje.length} conta(s)`}
          onClick={() => setLista({ titulo: "A pagar hoje", tipo: "pagar", contas: k.pagHoje })} />
        <Tile icone={AlertTriangle} cor="text-red-600" titulo="Clientes atrasados" valor={soma(k.recVencidas)} sub={`${k.recVencidas.length} conta(s) vencida(s)`} alerta={k.recVencidas.length > 0}
          onClick={() => setLista({ titulo: "A receber vencidas", tipo: "receber", contas: k.recVencidas })} />
        <Tile icone={FileWarning} cor="text-red-600" titulo="Contas atrasadas" valor={soma(k.pagVencidas)} sub={`${k.pagVencidas.length} a pagar vencida(s)`} alerta={k.pagVencidas.length > 0}
          onClick={() => setLista({ titulo: "A pagar vencidas", tipo: "pagar", contas: k.pagVencidas })} />
      </div>

      {/* atalhos */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Ações rápidas">
        {[
          { rotulo: "Conta a pagar", icone: Plus, onClick: () => navigate("/financeiro", { state: { aba: "pagar", nova: true } }) },
          { rotulo: "Cobrar atrasados", icone: MessageCircle, onClick: () => navigate("/financeiro", { state: { aba: "cobranca" } }) },
          { rotulo: "Recibos", icone: ReceiptText, onClick: () => navigate("/financeiro", { state: { aba: "recibos" } }) },
          { rotulo: "Conciliar banco", icone: Landmark, onClick: () => navigate("/conciliacao") },
          { rotulo: "Contas da semana", icone: CalendarDays, onClick: () => navigate("/financeiro", { state: { aba: "visao" } }) },
        ].map(({ rotulo, icone: Icone, onClick }) => (
          <button key={rotulo} type="button" onClick={onClick}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-surface px-3.5 py-2 text-sm font-semibold text-fg shadow-card hover:border-brand/40">
            <Icone size={15} className="text-brand" /> {rotulo}
          </button>
        ))}
      </div>

      {/* o que pede atenção */}
      {atencao.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
          <h2 className="mb-2 font-bold text-fg">Precisa da sua atenção</h2>
          <ul className="divide-y divide-slate-100">
            {atencao.map((a) => (
              <li key={a.texto} className="flex items-center gap-3 py-2.5">
                <AlertTriangle size={17} className={`shrink-0 ${a.tom === "ruim" ? "text-red-600" : "text-amber-600"}`} aria-hidden />
                <span className="min-w-0 flex-1 text-sm text-fg">{a.texto}</span>
                <Button type="button" variant="secondary" onClick={a.onClick}>{a.acao}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* próximos 7 dias */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
        <h2 className="mb-1 font-bold text-fg">Próximos 7 dias</h2>
        <p className="mb-2 text-xs text-slate-500">Toque no dia para ver as contas.</p>
        <ul className="divide-y divide-slate-100">
          {k.semana.map((d) => {
            const e = soma(d.rec), s = soma(d.pag);
            const vazio = !d.rec.length && !d.pag.length;
            return (
              <li key={d.dia}>
                <button type="button" disabled={vazio} onClick={() => setLista({ titulo: `Contas de ${nomeDia(d.dia, dia).toLowerCase()}`, tipo: d.pag.length && !d.rec.length ? "pagar" : "receber", contas: [...d.rec, ...d.pag] })}
                  className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
                  <span className={`w-20 shrink-0 text-sm font-semibold ${d.dia === dia ? "text-brand" : "text-fg"}`}>{nomeDia(d.dia, dia)}</span>
                  <span className="num min-w-0 flex-1 whitespace-nowrap text-right text-sm text-emerald-700">{e ? `+${brl(e)}` : ""}</span>
                  <span className="num min-w-0 flex-1 whitespace-nowrap text-right text-sm text-red-700">{s ? `−${brl(s)}` : ""}</span>
                  {!vazio && <ChevronRight size={16} className="shrink-0 text-slate-400" />}
                  {vazio && <span className="w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* o mês */}
      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Mes titulo="Recebido no mês" valor={k.recebidoMes} delta={variacao(k.recebidoMes, k.recebidoAnt)} bomSobe />
        <Mes titulo="Pago no mês" valor={k.pagoMes} delta={variacao(k.pagoMes, k.pagoAnt)} />
        <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
          <div className="text-sm text-slate-500">Resultado do mês (recebido − pago)</div>
          <div className={`num text-2xl font-bold ${resultadoMes >= 0 ? "text-emerald-700" : "text-red-700"}`}>{resultadoMes >= 0 ? "+ " : "− "}{brl(Math.abs(resultadoMes))}</div>
        </div>
      </section>

      <div id="fluxo-caixa"><Fluxo receber={rec} pagar={pag} dia={dia} /></div>
    </div>
  );
}

function Tile({ icone: Icone, cor, titulo, valor, sub, alerta, onClick }: {
  icone: typeof Landmark; cor: string; titulo: string; valor: number; sub: string; alerta?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex min-w-0 flex-col rounded-2xl border bg-surface p-3.5 text-left shadow-card transition active:scale-[0.98] ${alerta ? "border-red-200" : "border-slate-200"}`}>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-600"><Icone size={17} className={cor} /> {titulo}</span>
      <span className={`num mt-1 truncate text-[clamp(1.05rem,4.6vw,1.5rem)] font-bold ${alerta ? "text-red-700" : "text-fg"}`}>{brl(valor)}</span>
      <span className="truncate text-xs text-slate-500">{sub}</span>
    </button>
  );
}

function Mes({ titulo, valor, delta, bomSobe }: { titulo: string; valor: number; delta: number | null; bomSobe?: boolean }) {
  const bom = delta == null ? null : bomSobe ? delta >= 0 : delta <= 0;
  const Seta = delta != null && delta < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
      <div className="text-sm text-slate-500">{titulo}</div>
      <div className="num text-2xl font-bold text-fg">{brl(valor)}</div>
      {delta != null && (
        <div className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${bom ? "text-emerald-700" : "text-red-700"}`}>
          <Seta size={14} aria-hidden /> {delta > 0 ? "+" : ""}{delta}% vs mesmo dia do mês passado
        </div>
      )}
    </div>
  );
}

/** Lista que abre ao tocar num número: cada conta com a ação (receber/pagar, cobrar no WhatsApp, recibo). */
function ListaContas({ lista, dia, podeBaixar, onClose, onBaixa }: {
  lista: Lista; dia: string; podeBaixar: boolean; onClose: () => void; onBaixa: (c: ContaFin) => void;
}) {
  const { unidades } = useUnidade();
  const { data: cfg } = useConfig();
  const total = soma(lista.contas);
  const ehReceber = (c: Receber | Pagar): c is Receber => "cliente_id" in c;
  return (
    <Modal open onClose={onClose} title={`${lista.titulo} · ${brl(total)}`}>
      {!lista.contas.length ? <p className="py-6 text-center text-sm text-slate-500">Nada por aqui.</p> : (
        <ul className="-mx-1 divide-y divide-slate-100">
          {lista.contas.map((c) => {
            const receber = ehReceber(c);
            const vencida = c.status === "aberto" && c.vencimento < dia;
            const msg = receber
              ? `Olá ${(c.cliente?.nome_fantasia || c.cliente?.nome || "").split(" ")[0]}! Aqui é do financeiro da MF Máquinas. Consta em aberto *${c.descricao}*, no valor de *${brl(c.valor)}*, com vencimento em ${dataBR(c.vencimento)}. Precisa da segunda via ou de outra forma de pagamento?`
              : "";
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-1 py-3">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${receber ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
                  {receber ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{c.terceiro || c.descricao}</span>
                  <span className={`block truncate text-xs ${vencida ? "font-semibold text-red-700" : "text-slate-500"}`}>
                    {c.terceiro ? `${c.descricao} · ` : ""}{c.status === "pago" ? `pago em ${dataBR(c.data_pagamento)}` : vencida ? `venceu ${dataBR(c.vencimento)}` : `vence ${dataBR(c.vencimento)}`}
                  </span>
                </span>
                <span className="num shrink-0 font-bold text-fg">{brl(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor)}</span>
                <span className="flex w-full justify-end gap-1.5 pl-10">
                  {receber && c.status === "aberto" && c.cliente?.whatsapp && (
                    <a href={whatsappLink(c.cliente.whatsapp, msg)} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Send size={13} /> Cobrar</a>
                  )}
                  {c.status === "pago" && (receber
                    ? <BotaoRecibo contaId={c.id} tipo="receber" montar={() => reciboDeReceber({ ...c, valor_pago: c.valor_pago ?? null, data_pagamento: c.data_pagamento ?? null, forma_pagamento: c.forma_pagamento ?? null }, unidades.find((u) => u.id === c.unidade_id), cfg)} />
                    : <BotaoRecibo contaId={c.id} tipo="pagar" montar={() => reciboDePagar({ ...c, valor_pago: c.valor_pago ?? null, data_pagamento: c.data_pagamento ?? null }, (c as Pagar).fornecedor ?? undefined, unidades.find((u) => u.id === c.unidade_id), cfg, /pagar por ([^·]+)/.exec((c as Pagar).observacoes ?? "")?.[1]?.trim() ?? null)} />)}
                  {podeBaixar && c.status === "aberto" && (
                    <Button type="button" onClick={() => onBaixa(c)} className="!min-h-0 !px-3 !py-1.5 text-xs">{receber ? "Receber" : "Pagar"}</Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
