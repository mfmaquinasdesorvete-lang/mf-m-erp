// Caixa do PDV: abrir com troco inicial e operador, sangria, reforço e devolução, resumo por forma de recebimento,
// cupom de abertura, relatório de movimentação e fechamento com conferência (contado x esperado). Um caixa aberto por loja.
import { useMemo, useRef, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Printer, RotateCcw, Unlock, Wallet } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { pdfCaixa, type CaixaPdf } from "@/lib/pdf";
import { imprimirPdf } from "@/lib/imprimir";
import { conferencia, formaDaConta, resumoCaixa } from "@/lib/caixaPdv";
import type { Config } from "@/lib/types";

export type Caixa = {
  id: string; unidade_id: string | null; status: "aberto" | "fechado"; aberto_em: string; aberto_por_nome: string | null; troco_inicial: number;
  fechado_em: string | null; fechado_por_nome: string | null; esperado: { forma: string; valor: number }[] | null;
  contado: Record<string, number> | null; diferenca: number | null; observacao: string | null;
};
export type MovimentoPdv = {
  id: string; caixa_id: string; tipo: "sangria" | "reforco" | "devolucao"; valor: number; forma: string; motivo: string | null;
  pedido_id: string | null; criado_por_nome: string | null; criado_em: string;
};
type PedidoCx = { id: string; numero: number; origem: string; status: string; valor_total: number; created_at: string; unidade_id: string | null };
type ContaCx = { pedido_id: string | null; forma_pagamento: string | null; valor: number; status: string; descricao: string | null };

const FORMAS = ["Dinheiro", "Pix", "Crédito", "Débito", "Cartão"];
const NOME_TIPO = { sangria: "Sangria", reforco: "Reforço", devolucao: "Devolução" } as const;
const A_PAGAR = new Set(["Link (a pagar)", "A prazo"]);
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => {
  const t = String(s).trim();
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? v : NaN;
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
const quando = (iso: string) => `${new Date(iso).toLocaleDateString("pt-BR")}, às ${hora(iso)}`;
const mesmaLoja = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);

/** Caixas e movimentos do PDV; o aberto desta loja e as vendas de balcão de cada caixa. */
export function useCaixaPdv(unidadeId: string | null) {
  const caixas = useRows<Caixa>("pdv_caixas", { order: "aberto_em", ascending: false });
  const { data: movimentos = [] } = useRows<MovimentoPdv>("pdv_caixa_movimentos", { order: "criado_em", ascending: true });
  const { data: pedidos = [] } = useRows<PedidoCx>("pedidos", { order: "created_at", ascending: false });
  const { data: contas = [] } = useRows<ContaCx>("contas_receber");
  const lista = caixas.data ?? [];
  const aberto = lista.find((c) => c.status === "aberto" && mesmaLoja(c.unidade_id, unidadeId)) ?? null;
  const vendasDo = (c: Caixa) => {
    const ini = new Date(c.aberto_em).getTime(), fim = c.fechado_em ? new Date(c.fechado_em).getTime() : Infinity;
    const doCaixa = pedidos.filter((p) => p.origem === "balcao" && p.status !== "cancelado" && mesmaLoja(p.unidade_id, c.unidade_id)
      && new Date(p.created_at).getTime() >= ini && new Date(p.created_at).getTime() <= fim);
    const ids = new Set(doCaixa.map((p) => p.id));
    const recebimentos = contas.filter((x) => x.pedido_id && ids.has(x.pedido_id) && x.status !== "cancelado")
      .map((x) => ({ forma: formaDaConta(x), valor: Number(x.valor) }));
    return { pedidos: doCaixa, recebimentos };
  };
  const movimentosDo = (c: Caixa) => movimentos.filter((m) => m.caixa_id === c.id);
  const resumoDo = (c: Caixa) => resumoCaixa(Number(c.troco_inicial), vendasDo(c).recebimentos, movimentosDo(c).map((m) => ({ ...m, valor: Number(m.valor) })));
  return { carregado: caixas.isSuccess, aberto, caixas: lista.filter((c) => mesmaLoja(c.unidade_id, unidadeId)), vendasDo, movimentosDo, resumoDo };
}
type UsoCaixa = ReturnType<typeof useCaixaPdv>;

/** Texto da bobina: abertura (só o troco) ou movimentação/fechamento (resumo, formas, movimentos e conferência). */
function bobina(c: Caixa, uso: UsoCaixa, loja: string | null, tipo: "abertura" | "movimentacao"): CaixaPdf {
  const info = [loja ? `Loja: ${loja}` : "", `Operador: ${c.aberto_por_nome ?? "—"}`, `Aberto em ${quando(c.aberto_em)}`,
    c.fechado_em ? `Fechado em ${quando(c.fechado_em)}${c.fechado_por_nome ? ` por ${c.fechado_por_nome}` : ""}` : "Caixa aberto"].filter(Boolean);
  if (tipo === "abertura") {
    return { titulo: "ABERTURA DE CAIXA", info, blocos: [{ titulo: "Troco inicial", linhas: [{ rotulo: "Dinheiro na gaveta", valor: brl(c.troco_inicial), forte: true }] }], assinaturas: ["Operador"] };
  }
  const r = uso.resumoDo(c), movs = uso.movimentosDo(c), v = uso.vendasDo(c);
  const blocos: CaixaPdf["blocos"] = [
    { titulo: "Resumo", linhas: [
      { rotulo: "Troco inicial", valor: brl(c.troco_inicial) },
      { rotulo: `Vendas (${v.pedidos.length})`, valor: brl(r.vendido) },
      { rotulo: "Reforços", valor: brl(r.reforcos) },
      { rotulo: "Sangrias", valor: `- ${brl(r.sangrias)}` },
      { rotulo: "Devoluções", valor: `- ${brl(r.devolucoes)}` },
    ] },
    { titulo: "Por forma de recebimento", linhas: [...r.formas.map((f) => ({ rotulo: f.forma, valor: brl(f.valor) })), { rotulo: "Total", valor: brl(r.total), forte: true }] },
  ];
  if (movs.length) blocos.push({ titulo: "Movimentos", linhas: movs.map((m) => ({ rotulo: `${hora(m.criado_em)} ${NOME_TIPO[m.tipo]}${m.motivo ? ` · ${m.motivo}` : ""}`.slice(0, 44), valor: `${m.tipo === "reforco" ? "" : "- "}${brl(m.valor)}` })) });
  if (c.status === "fechado" && c.esperado) {
    const conf = conferencia(c.esperado, c.contado ?? {});
    blocos.push({ titulo: "Conferência (contado x esperado)", linhas: [
      ...conf.linhas.map((l) => ({ rotulo: `${l.forma} ${brl(l.contado)}`, valor: l.diferenca ? `${l.diferenca > 0 ? "+" : ""}${brl(l.diferenca)}` : "ok" })),
      { rotulo: conf.diferenca > 0 ? "Sobra" : conf.diferenca < 0 ? "Falta" : "Diferença", valor: brl(Math.abs(conf.diferenca)), forte: true },
    ] });
    if (c.observacao) blocos.push({ titulo: "Observação", linhas: [{ rotulo: c.observacao.slice(0, 60), valor: "" }] });
  }
  return { titulo: c.status === "fechado" ? "FECHAMENTO DE CAIXA" : "MOVIMENTAÇÃO DO CAIXA", info, blocos, assinaturas: c.status === "fechado" ? ["Operador", "Conferente"] : [] };
}

async function imprimir(dados: CaixaPdf, cfg: Config | null) {
  if (!cfg) return;
  try { imprimirPdf(await pdfCaixa(dados, cfg)); } catch (e) { notifyError(e); }
}

/** Janela do caixa: "abrir" (troco inicial) ou "detalhes" (o caixa aberto, movimentos, fechamento e histórico). */
export function CaixaPdv({ modo, onClose, uso, unidadeId, loja, operador, cfg }: {
  modo: "abrir" | "detalhes" | null; onClose: () => void; uso: UsoCaixa; unidadeId: string | null; loja: string | null; operador: string; cfg: Config | null;
}) {
  // o caixa que estava aberto segue na tela depois de fechado, para mostrar a conferência e imprimir o fechamento
  const ultimo = useRef<Caixa | null>(null);
  if (uso.aberto) ultimo.current = uso.aberto;
  if (!modo) return null;
  const caixa = uso.aberto ?? (modo === "detalhes" ? ultimo.current : null);
  if (modo === "abrir" || !caixa) return <AbrirCaixa onClose={onClose} uso={uso} unidadeId={unidadeId} loja={loja} operador={operador} cfg={cfg} />;
  return <DetalhesCaixa caixa={caixa} onClose={onClose} uso={uso} loja={loja} operador={operador} cfg={cfg} />;
}

function AbrirCaixa({ onClose, uso, unidadeId, loja, operador, cfg }: { onClose: () => void; uso: UsoCaixa; unidadeId: string | null; loja: string | null; operador: string; cfg: Config | null }) {
  const invalidate = useInvalidate();
  const [troco, setTroco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState<Caixa | null>(null);
  const ultimo = uso.caixas.find((c) => c.status === "fechado");
  async function abrir() {
    const v = troco.trim() ? num(troco) : 0;
    if (!Number.isFinite(v) || v < 0) { notify("Troco inicial inválido", "erro"); return; }
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("pdv_caixas").insert({ unidade_id: unidadeId, troco_inicial: r2(v), aberto_por_nome: operador }).select().single();
      if (error) throw error;
      setAberto(data as Caixa);
      invalidate("pdv_caixas");
      notify("Caixa aberto");
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }
  return (
    <Modal open onClose={onClose} title={aberto ? "Caixa aberto" : "Abrir caixa"}>
      {aberto ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Caixa aberto em <b>{quando(aberto.aberto_em)}</b> por <b>{aberto.aberto_por_nome}</b>, com troco inicial de <b className="num">{brl(aberto.troco_inicial)}</b>.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => imprimir(bobina(aberto, uso, loja, "abertura"), cfg)}><Printer size={15} aria-hidden /> Imprimir cupom de abertura</Button>
            <Button type="button" onClick={onClose}>Começar a vender</Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); abrir(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Operador"><input className="input" value={operador} readOnly /></Field>
            <Field label={loja ? `Loja` : "Data"}><input className="input" value={loja ?? new Date().toLocaleDateString("pt-BR")} readOnly /></Field>
          </div>
          <Field label="Troco inicial (dinheiro na gaveta)">
            <input className="input num text-lg" inputMode="decimal" autoFocus placeholder="0,00" value={troco} onChange={(e) => setTroco(e.target.value)} />
          </Field>
          {ultimo && <p className="text-xs text-slate-500">Último fechamento: {quando(ultimo.fechado_em ?? ultimo.aberto_em)} · ficou em dinheiro <span className="num">{brl(ultimo.contado?.Dinheiro ?? ultimo.esperado?.find((f) => f.forma === "Dinheiro")?.valor ?? 0)}</span></p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Agora não</Button>
            <Button type="submit" disabled={salvando}><Unlock size={15} aria-hidden /> {salvando ? "Abrindo…" : "Abrir caixa"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

type Aba = "geral" | "sangrias" | "devolucoes" | "historico";

function DetalhesCaixa({ caixa, onClose, uso, loja, operador, cfg }: { caixa: Caixa; onClose: () => void; uso: UsoCaixa; loja: string | null; operador: string; cfg: Config | null }) {
  const [aba, setAba] = useState<Aba>("geral");
  const [lancar, setLancar] = useState<MovimentoPdv["tipo"] | null>(null);
  const [fechar, setFechar] = useState(false);
  const [fechado, setFechado] = useState<Caixa | null>(null);
  const r = uso.resumoDo(caixa), movs = uso.movimentosDo(caixa), vendas = uso.vendasDo(caixa);
  if (fechado) {
    const conf = conferencia(fechado.esperado ?? [], fechado.contado ?? {});
    return (
      <Modal open onClose={onClose} title="Caixa fechado">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Fechado em <b>{quando(fechado.fechado_em!)}</b>. {conf.diferenca === 0 ? "Conferência sem diferença." : <>Diferença de <b className={`num ${conf.diferenca < 0 ? "text-red-700" : "text-emerald-700"}`}>{conf.diferenca < 0 ? "falta" : "sobra"} {brl(Math.abs(conf.diferenca))}</b>.</>}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => imprimir(bobina(fechado, uso, loja, "movimentacao"), cfg)}><Printer size={15} aria-hidden /> Imprimir fechamento</Button>
            <Button type="button" onClick={onClose}>Concluir</Button>
          </div>
        </div>
      </Modal>
    );
  }
  const abas: { id: Aba; nome: string }[] = [
    { id: "geral", nome: "Dados gerais" }, { id: "sangrias", nome: "Sangrias e reforços" }, { id: "devolucoes", nome: "Devoluções" }, { id: "historico", nome: "Histórico" },
  ];
  return (
    <Modal open onClose={onClose} title="Detalhes do caixa" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden />caixa aberto</span>
            <p className="text-lg font-bold">Caixa aberto em {quando(caixa.aberto_em)}</p>
            <p className="text-sm text-slate-600">Operador: <b>{caixa.aberto_por_nome ?? "—"}</b>{loja ? ` · ${loja}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => imprimir(bobina(caixa, uso, loja, "abertura"), cfg)}><RotateCcw size={15} aria-hidden /> Reimprimir cupom de abertura</Button>
            <Button type="button" variant="secondary" onClick={() => imprimir(bobina(caixa, uso, loja, "movimentacao"), cfg)}><Printer size={15} aria-hidden /> Relatório de movimentação</Button>
          </div>
        </div>

        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {abas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${aba === a.id ? "border-modulo text-modulo-texto" : "border-transparent text-slate-500 hover:text-fg"}`}>{a.nome}</button>
          ))}
        </div>

        {aba === "geral" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["Troco inicial", brl(caixa.troco_inicial)], [`Vendas (${vendas.pedidos.length})`, brl(r.vendido)],
                ["Reforços", brl(r.reforcos)], ["Sangrias", brl(r.sangrias)], ["Devoluções", brl(r.devolucoes)], ["Em dinheiro agora", brl(r.formas[0]?.valor ?? 0)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{k}</dt><dd className="num text-base font-bold">{v}</dd></div>
              ))}
            </dl>
            <div className="rounded-xl ring-1 ring-slate-200">
              <h3 className="border-b border-slate-200 px-4 py-2.5 text-sm font-bold">Resumo por forma de recebimento</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {r.formas.map((f) => (
                  <li key={f.forma} className="flex justify-between gap-2 px-4 py-2"><span>{f.forma}{A_PAGAR.has(f.forma) && <span className="ml-1 text-xs text-slate-500">(não entra na gaveta)</span>}</span><span className="num font-semibold">{brl(f.valor)}</span></li>
                ))}
                <li className="flex justify-between gap-2 bg-slate-50 px-4 py-2.5 font-bold"><span>Total</span><span className="num">{brl(r.total)}</span></li>
              </ul>
            </div>
          </div>
        )}

        {(aba === "sangrias" || aba === "devolucoes") && (
          <ListaMovimentos movs={movs.filter((m) => (aba === "devolucoes" ? m.tipo === "devolucao" : m.tipo !== "devolucao"))}
            vazio={aba === "devolucoes" ? "Nenhuma devolução neste caixa." : "Nenhuma sangria ou reforço neste caixa."} />
        )}

        {aba === "historico" && <Historico uso={uso} loja={loja} cfg={cfg} />}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setLancar("sangria")}><ArrowUpCircle size={15} aria-hidden /> Sangria</Button>
            <Button type="button" variant="secondary" onClick={() => setLancar("reforco")}><ArrowDownCircle size={15} aria-hidden /> Reforço</Button>
            <Button type="button" variant="secondary" onClick={() => setLancar("devolucao")}><RotateCcw size={15} aria-hidden /> Devolução</Button>
          </div>
          <Button type="button" tom="perigo" onClick={() => setFechar(true)}><Lock size={15} aria-hidden /> Fechar caixa</Button>
        </div>
      </div>
      {lancar && <NovoMovimento tipo={lancar} caixa={caixa} pedidos={vendas.pedidos} operador={operador} dinheiro={r.formas[0]?.valor ?? 0} onClose={() => setLancar(null)} />}
      {fechar && <FecharCaixa caixa={caixa} esperado={r.formas.filter((f) => !A_PAGAR.has(f.forma))} operador={operador} onClose={() => setFechar(false)} onFechado={(c) => { setFechar(false); setFechado(c); }} />}
    </Modal>
  );
}

function ListaMovimentos({ movs, vazio }: { movs: MovimentoPdv[]; vazio: string }) {
  if (!movs.length) return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{vazio}</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200">
      {movs.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="min-w-0">
            <b>{NOME_TIPO[m.tipo]}</b> · {hora(m.criado_em)}{m.tipo === "devolucao" ? ` · ${m.forma}` : ""}
            {m.motivo && <span className="block truncate text-xs text-slate-500">{m.motivo}</span>}
            {m.criado_por_nome && <span className="block text-xs text-slate-500">por {m.criado_por_nome}</span>}
          </span>
          <span className={`num shrink-0 font-semibold ${m.tipo === "reforco" ? "text-emerald-700" : "text-red-700"}`}>{m.tipo === "reforco" ? "+" : "−"} {brl(m.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

function NovoMovimento({ tipo, caixa, pedidos, operador, dinheiro, onClose }: { tipo: MovimentoPdv["tipo"]; caixa: Caixa; pedidos: PedidoCx[]; operador: string; dinheiro: number; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState("Dinheiro");
  const [motivo, setMotivo] = useState("");
  const [pedidoId, setPedidoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const ajuda = { sangria: "Dinheiro retirado da gaveta (depósito, cofre, pagamento).", reforco: "Dinheiro colocado na gaveta (mais troco).", devolucao: "Valor devolvido ao cliente nesta forma." }[tipo];
  async function salvar() {
    const v = num(valor);
    if (!Number.isFinite(v) || v <= 0) { notify("Informe o valor", "erro"); return; }
    if (tipo !== "reforco" && forma === "Dinheiro" && v > dinheiro + 0.001) { notify(`Só há ${brl(dinheiro)} em dinheiro neste caixa`, "erro"); return; }
    if (tipo === "devolucao" && !motivo.trim()) { notify("Diga o motivo da devolução", "erro"); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.from("pdv_caixa_movimentos").insert({
        caixa_id: caixa.id, tipo, valor: r2(v), forma: tipo === "devolucao" ? forma : "Dinheiro", motivo: motivo.trim() || null, pedido_id: pedidoId || null, criado_por_nome: operador,
      });
      if (error) throw error;
      invalidate("pdv_caixa_movimentos");
      notify(`${NOME_TIPO[tipo]} de ${brl(v)} registrada`);
      onClose();
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }
  return (
    <Modal open onClose={onClose} title={NOME_TIPO[tipo]}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <p className="text-sm text-slate-600">{ajuda}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor"><input className="input num text-lg" inputMode="decimal" autoFocus placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></Field>
          {tipo === "devolucao" && (
            <Field label="Devolvido em"><select className="input" value={forma} onChange={(e) => setForma(e.target.value)}>{FORMAS.map((f) => <option key={f}>{f}</option>)}</select></Field>
          )}
        </div>
        {tipo === "devolucao" && pedidos.length > 0 && (
          <Field label="Venda (opcional)">
            <select className="input" value={pedidoId} onChange={(e) => setPedidoId(e.target.value)}>
              <option value="">—</option>
              {pedidos.map((p) => <option key={p.id} value={p.id}>#{p.numero} · {hora(p.created_at)} · {brl(p.valor_total)}</option>)}
            </select>
          </Field>
        )}
        <Field label={tipo === "devolucao" ? "Motivo" : "Motivo (opcional)"}><input className="input" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : `Registrar ${NOME_TIPO[tipo].toLowerCase()}`}</Button>
        </div>
      </form>
    </Modal>
  );
}

function FecharCaixa({ caixa, esperado, operador, onClose, onFechado }: { caixa: Caixa; esperado: { forma: string; valor: number }[]; operador: string; onClose: () => void; onFechado: (c: Caixa) => void }) {
  const invalidate = useInvalidate();
  const [contadoTxt, setContadoTxt] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const contado = useMemo(() => Object.fromEntries(Object.entries(contadoTxt).filter(([, t]) => t.trim()).map(([f, t]) => [f, num(t)])), [contadoTxt]);
  const conf = conferencia(esperado, contado);
  const faltaContar = !contadoTxt.Dinheiro?.trim();
  async function fechar() {
    if (Object.values(contado).some((v) => !Number.isFinite(v) || v < 0)) { notify("Confira os valores contados", "erro"); return; }
    if (conf.diferenca !== 0 && !obs.trim()) { notify("Diferença no caixa: escreva o motivo na observação", "erro"); return; }
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("pdv_caixas").update({
        status: "fechado", fechado_em: new Date().toISOString(), fechado_por_nome: operador,
        esperado, contado: Object.fromEntries(conf.linhas.map((l) => [l.forma, l.contado])), diferenca: conf.diferenca, observacao: obs.trim() || null,
      }).eq("id", caixa.id).eq("status", "aberto").select().single();
      if (error) throw error;
      invalidate("pdv_caixas");
      notify("Caixa fechado");
      onFechado(data as Caixa);
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }
  return (
    <Modal open onClose={onClose} title="Fechar caixa" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); fechar(); }}>
        <p className="text-sm text-slate-600">Conte o que há em cada forma e digite. Forma em branco fica igual ao esperado. Link e venda a prazo não entram (ainda não foram pagos).</p>
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Forma</th><th className="px-3 py-2 text-right">Esperado</th><th className="px-3 py-2 text-right">Contado</th><th className="px-3 py-2 text-right">Diferença</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {conf.linhas.map((l) => (
                <tr key={l.forma}>
                  <td className="px-3 py-2 font-semibold">{l.forma}</td>
                  <td className="num px-3 py-2 text-right">{brl(l.esperado)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input className="input num ml-auto w-32 text-right" inputMode="decimal" placeholder={brl(l.esperado).replace("R$", "").trim()} aria-label={`Contado em ${l.forma}`}
                      autoFocus={l.forma === "Dinheiro"} value={contadoTxt[l.forma] ?? ""} onChange={(e) => setContadoTxt((c) => ({ ...c, [l.forma]: e.target.value }))} />
                  </td>
                  <td className={`num px-3 py-2 text-right font-semibold ${l.diferenca < 0 ? "text-red-700" : l.diferenca > 0 ? "text-emerald-700" : "text-slate-500"}`}>{l.diferenca ? `${l.diferenca > 0 ? "+" : "−"} ${brl(Math.abs(l.diferenca))}` : "ok"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-slate-50 font-bold"><td className="px-3 py-2" colSpan={3}>{conf.diferenca < 0 ? "Falta no caixa" : conf.diferenca > 0 ? "Sobra no caixa" : "Diferença"}</td>
              <td className={`num px-3 py-2 text-right ${conf.diferenca < 0 ? "text-red-700" : conf.diferenca > 0 ? "text-emerald-700" : ""}`}>{brl(Math.abs(conf.diferenca))}</td></tr></tfoot>
          </table>
        </div>
        <Field label={conf.diferenca !== 0 ? "Observação (obrigatória: por que a diferença?)" : "Observação"}><input className="input" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        {faltaContar && <p className="text-xs font-semibold text-amber-700">Conte o dinheiro da gaveta antes de fechar.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="submit" tom="perigo" disabled={salvando || faltaContar}><Lock size={15} aria-hidden /> {salvando ? "Fechando…" : "Conferir e fechar caixa"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Historico({ uso, loja, cfg }: { uso: UsoCaixa; loja: string | null; cfg: Config | null }) {
  const fechados = uso.caixas.filter((c) => c.status === "fechado").slice(0, 30);
  if (!fechados.length) return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nenhum caixa fechado ainda.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200">
      {fechados.map((c) => {
        const d = Number(c.diferenca ?? 0);
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span className="min-w-0">
              <b>{new Date(c.aberto_em).toLocaleDateString("pt-BR")}</b> · {hora(c.aberto_em)} às {c.fechado_em ? hora(c.fechado_em) : "—"} · {c.aberto_por_nome ?? "—"}
              <span className="block text-xs text-slate-500">Total <span className="num">{brl((c.esperado ?? []).reduce((s, f) => s + Number(f.valor), 0))}</span>
                {" · "}<span className={d < 0 ? "text-red-700" : d > 0 ? "text-emerald-700" : ""}>{d ? `${d < 0 ? "falta" : "sobra"} ${brl(Math.abs(d))}` : "sem diferença"}</span></span>
            </span>
            <Button type="button" variant="ghost" className="!min-h-0 !py-1 text-xs" onClick={() => imprimir(bobina(c, uso, loja, "movimentacao"), cfg)}><Printer size={13} aria-hidden /> Relatório</Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Botão do caixa no topo do PDV: verde com a hora quando aberto, âmbar quando fechado. */
export function BotaoCaixa({ aberto, onClick }: { aberto: Caixa | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={aberto ? "Detalhes do caixa" : "Abrir caixa"}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 ${aberto ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40 hover:bg-emerald-500/25" : "bg-amber-500/20 text-amber-100 ring-amber-400/50 hover:bg-amber-500/30"}`}>
      <Wallet size={16} aria-hidden />
      <span className="hidden sm:inline">{aberto ? `Caixa ${hora(aberto.aberto_em)}` : "Abrir caixa"}</span>
    </button>
  );
}
