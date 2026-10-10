import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, ClipboardList, Factory, FileDown, MessageCircle, PackageCheck, PackageSearch, Play, Plus, ShoppingBag, Trash2, Truck, XCircle,
} from "lucide-react";
import { Badge, CelulaAbrir, Button, Card, Field, Modal, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { limpar, useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, somarDias, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { comUnidade, pdfPedidoCompra } from "@/lib/pdf";
import { useConfig } from "@/lib/useConfig";
import { usePerfil } from "@/lib/auth";
import type { Fornecedor, ItemCompra, Necessidade, OrdemProducao, PedidoCompra, Produto } from "@/lib/types";
import { Reposicao } from "@/components/Reposicao";
import { ProdutoBusca } from "@/components/ProdutoBusca";

type Aba = "producao" | "reposicao" | "compras" | "ficha";


/** Quanto falta comprar de cada peça para a OP. */
const falta = (n: Necessidade) =>
  Math.max(0, Number(n.necessario) - Math.max(0, Number(n.estoque_atual) - Number(n.reservado_outras_op)) - Number(n.a_caminho));

export default function Producao() {
  const { pode } = usePerfil();
  const location = useLocation();
  const navigate = useNavigate();
  const verCompras = pode("editar_producao") || pode("receber_compras");
  const [aba, setAba] = useState<Aba>("producao");
  const [novaCompra, setNovaCompra] = useState(false);

  useEffect(() => {
    const st = location.state as any;
    if (st?.aba) setAba(st.aba);
    if (st?.novaCompra) setNovaCompra(true);
    if (st) navigate(location.pathname, { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const abas: { value: Aba; label: string }[] = [
    { value: "producao", label: "Ordens de produção" },
    ...(verCompras ? [{ value: "reposicao" as Aba, label: "Reposição de estoque" }, { value: "compras" as Aba, label: "Pedidos de compra" }] : []),
    { value: "ficha", label: "Ficha técnica" },
  ];

  return (
    <div>
      <PageHeader title="Produção e compras" subtitle="Monte as máquinas, veja quais peças faltam e peça aos fornecedores com cotação." />
      <Tabs value={aba} onChange={setAba} options={abas} />
      {aba === "producao" && <OrdensProducao irParaCompras={() => setAba("compras")} />}
      {aba === "reposicao" && verCompras && <Reposicao podeComprar={pode("editar_producao")} aoGerar={() => setAba("compras")} />}
      {aba === "compras" && verCompras && <PedidosCompra abrirNovo={novaCompra} onAberto={() => setNovaCompra(false)} />}
      {aba === "ficha" && <FichaTecnica />}
    </div>
  );
}

/* ============================== Ordens de produção ============================== */

function useNecessidade() {
  return useRows<Necessidade>("necessidade_producao", { order: "descricao", ascending: true });
}

function OrdensProducao({ irParaCompras }: { irParaCompras: () => void }) {
  const { pode } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: ordensTodos = [], isLoading } = useRows<OrdemProducao>("ordens_producao", { select: "*, produto:produtos(*)" });
  const ordens = filtrar(ordensTodos);
  const { data: necessidade = [] } = useNecessidade();
  const [aberta, setAberta] = useState<Partial<OrdemProducao> | null>(null);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const lista = ordens.filter((o) => mostrarTodas || ["planejada", "em_producao"].includes(o.status));
  const faltasPorOP = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of necessidade) if (falta(n) > 0) m.set(n.ordem_id, (m.get(n.ordem_id) ?? 0) + 1);
    return m;
  }, [necessidade]);
  const abertas = ordens.filter((o) => ["planejada", "em_producao"].includes(o.status));

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ClipboardList} tom="info" label="Planejadas" valor={ordens.filter((o) => o.status === "planejada").length} />
        <Stat icon={Factory} tom="atencao" label="Em produção" valor={ordens.filter((o) => o.status === "em_producao").length} />
        <Stat icon={PackageSearch} tom={abertas.some((o) => faltasPorOP.get(o.id)) ? "critico" : "bom"} label="Ordens com peça faltando"
          valor={abertas.filter((o) => faltasPorOP.get(o.id)).length} />
        <Stat icon={PackageCheck} tom="bom" label="Máquinas montadas no mês"
          valor={ordens.filter((o) => o.status === "concluida" && (o.concluida_em ?? "").startsWith(hoje().slice(0, 7))).reduce((s, o) => s + Number(o.quantidade), 0)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={mostrarTodas} onChange={(e) => setMostrarTodas(e.target.checked)} /> Mostrar concluídas e canceladas
        </label>
        {pode("editar_producao") && <Button onClick={() => setAberta({ quantidade: 1, status: "planejada", previsao: somarDias(10) })}><Plus size={16} /> Nova ordem de produção</Button>}
      </div>

      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">OP</th><th className="th">Máquina</th><th className="th text-right">Qtd</th><th className="th">Situação</th><th className="th">Peças</th><th className="th">Previsão</th><th className="th" /></>}>
        {lista.map((o) => {
          const f = faltasPorOP.get(o.id) ?? 0;
          const aberta = ["planejada", "em_producao"].includes(o.status);
          return (
            <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta(o)}>
              <td className="td font-bold text-fg">#{o.numero}</td>
              <td className="td">{o.produto?.descricao}{o.responsavel && <div className="text-xs text-slate-500">{o.responsavel}</div>}</td>
              <td className="td num text-right">{Number(o.quantidade)}</td>
              <td className="td"><Badge value={o.status} /></td>
              <td className="td">{aberta ? (f ? <span className="font-semibold text-red-600">faltam {f} peça(s)</span> : <span className="font-semibold text-emerald-700">tudo disponível</span>) : "—"}</td>
              <td className={`td num ${aberta && o.previsao && o.previsao < hoje() ? "font-semibold text-red-600" : ""}`}>{dataBR(o.previsao)}</td>
              <CelulaAbrir texto="Ver / editar" />
            </tr>
          );
        })}
      </Table>

      {aberta && <OPModal inicial={aberta} onClose={() => setAberta(null)} irParaCompras={irParaCompras} />}
    </>
  );
}

function OPModal({ inicial, onClose, irParaCompras }: { inicial: Partial<OrdemProducao>; onClose: () => void; irParaCompras: () => void }) {
  const { pode } = usePerfil();
  const [o, setO] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: necessidade = [] } = useNecessidade();
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const invalidate = useInvalidate();
  const podeEditar = pode("editar_producao") && !["concluida", "cancelada"].includes(o.status ?? "");
  const nec = necessidade.filter((n) => n.ordem_id === o.id);
  const faltantes = nec.filter((n) => falta(n) > 0);
  const set = (p: Partial<OrdemProducao>) => setO((x) => ({ ...x, ...p }));

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = true) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("ordens_producao", "necessidade_producao", "produtos", "pedidos_compra", "estoque_movimentos");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    executar(async () => {
      const { produto: _p, numero: _n, created_at: _c, ...row } = o as any;
      const dados = limpar({ ...row, quantidade: Number(row.quantidade) });
      const { data, error } = dados.id
        ? await supabase.from("ordens_producao").update(dados).eq("id", dados.id).select("id, numero").single()
        : await supabase.from("ordens_producao").insert(dados).select("id, numero").single();
      if (error) throw error;
      set({ id: data.id, numero: data.numero });
    }, "Ordem de produção salva", false);
  };

  const mudarStatus = (status: string, ok: string) => executar(async () => {
    const { error } = await supabase.from("ordens_producao").update({ status }).eq("id", o.id!);
    if (error) throw error;
  }, ok);

  const concluir = () => executar(async () => {
    if (o.numeros_serie !== undefined) await supabase.from("ordens_producao").update({ numeros_serie: o.numeros_serie }).eq("id", o.id!);
    const { error } = await supabase.rpc("concluir_producao", { p_ordem: o.id });
    if (error) throw error;
  }, "Produção concluída: peças baixadas e máquinas no estoque");

  /** Um pedido de compra (em cotação) por fornecedor padrão das peças que faltam. */
  const gerarCompras = () => executar(async () => {
    const grupos = new Map<string, Necessidade[]>();
    for (const n of faltantes) {
      const k = n.fornecedor_padrao_id ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), n]);
    }
    for (const [fornecedor, itens] of grupos) {
      const { data: pc, error } = await supabase.from("pedidos_compra").insert({
        fornecedor_id: fornecedor || null, ordem_producao_id: o.id, status: "cotacao", previsao_entrega: o.previsao,
        observacoes: `Peças para a OP #${o.numero} (${Number(o.quantidade)}x ${produtos.find((p) => p.id === o.produto_id)?.descricao ?? ""})`,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("pedido_compra_itens").insert(itens.map((n) => ({
        pedido_compra_id: pc.id, produto_id: n.componente_id, descricao: n.descricao, quantidade: falta(n), custo_unitario: Number(n.preco_custo),
      })));
      if (e2) throw e2;
    }
    irParaCompras();
  }, "Pedidos de compra criados em cotação. Confira e envie aos fornecedores.");

  const nomeForn = (id: string | null) => fornecedores.find((f) => f.id === id)?.nome ?? "sem fornecedor padrão";

  return (
    <Modal open onClose={onClose} title={o.id ? `Ordem de produção #${o.numero}` : "Nova ordem de produção"} wide>
      <form onSubmit={salvar} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Máquina a produzir" className="sm:col-span-2">
            <select className="input" value={o.produto_id ?? ""} disabled={!podeEditar || !!o.id} onChange={(e) => set({ produto_id: e.target.value })} required>
              <option value="">Selecione…</option>
              {produtos.filter((p) => p.tipo === "maquina").map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
            </select>
          </Field>
          <Field label="Quantidade"><input className="input" type="number" min={1} value={o.quantidade ?? 1} disabled={!podeEditar} onChange={(e) => set({ quantidade: Number(e.target.value) })} /></Field>
          <Field label="Previsão"><input className="input" type="date" value={o.previsao ?? ""} disabled={!podeEditar} onChange={(e) => set({ previsao: e.target.value })} /></Field>
          <Field label="Responsável" className="sm:col-span-2"><input className="input" value={o.responsavel ?? ""} disabled={!podeEditar} onChange={(e) => set({ responsavel: e.target.value })} /></Field>
          <Field label="Nº de série das máquinas (separe por vírgula)" className="sm:col-span-2">
            <input className="input" value={o.numeros_serie ?? ""} disabled={!podeEditar} onChange={(e) => set({ numeros_serie: e.target.value })} />
          </Field>
          <Field label="Observações" className="sm:col-span-4"><input className="input" value={o.observacoes ?? ""} disabled={!podeEditar} onChange={(e) => set({ observacoes: e.target.value })} /></Field>
        </div>

        {o.id && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg">Peças necessárias</h3>
              {faltantes.length > 0 && podeEditar && (
                <Button type="button" onClick={gerarCompras} disabled={ocupado}><ShoppingBag size={16} /> Pedir as {faltantes.length} peça(s) que faltam</Button>
              )}
            </div>
            {!nec.length ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Esta máquina ainda não tem ficha técnica. Cadastre as peças na aba <b>Ficha técnica</b> para o sistema calcular o que comprar.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50"><tr>
                    <th className="th">Peça</th><th className="th text-right">Precisa</th><th className="th text-right">Em estoque</th>
                    <th className="th text-right">Reservado (outras OP)</th><th className="th text-right">A caminho</th><th className="th text-right">Falta</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {nec.map((n) => {
                      const f = falta(n);
                      return (
                        <tr key={n.componente_id}>
                          <td className="td">{n.descricao}<div className="text-xs text-slate-500">{nomeForn(n.fornecedor_padrao_id)}</div></td>
                          <td className="td num text-right">{Number(n.necessario)} {n.unidade}</td>
                          <td className="td num text-right">{Number(n.estoque_atual)}</td>
                          <td className="td num text-right text-slate-500">{Number(n.reservado_outras_op) || "—"}</td>
                          <td className="td num text-right text-slate-500">{Number(n.a_caminho) || "—"}</td>
                          <td className={`td num text-right font-bold ${f ? "text-red-600" : "text-emerald-700"}`}>{f ? f : "ok"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {podeEditar && o.id && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => mudarStatus("cancelada", "Ordem cancelada")} disabled={ocupado}><XCircle size={16} /> Cancelar OP</Button>}
          <span className="flex-1" />
          {podeEditar && <Button variant="secondary" disabled={ocupado}>Salvar</Button>}
          {podeEditar && o.status === "planejada" && o.id && <Button type="button" variant="secondary" onClick={() => mudarStatus("em_producao", "Produção iniciada")} disabled={ocupado}><Play size={16} /> Iniciar produção</Button>}
          {podeEditar && o.id && <Button type="button" onClick={concluir} disabled={ocupado || !nec.length || nec.some((n) => Number(n.estoque_atual) < Number(n.necessario))}><CheckCircle2 size={16} /> Concluir produção</Button>}
        </div>
      </form>
    </Modal>
  );
}

/* ============================== Pedidos de compra ============================== */

function PedidosCompra({ abrirNovo, onAberto }: { abrirNovo: boolean; onAberto: () => void }) {
  const { pode } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: pcsTodos = [], isLoading } = useRows<PedidoCompra>("pedidos_compra", { select: "*, fornecedor:fornecedores(*), itens:pedido_compra_itens(*)" });
  const pcs = filtrar(pcsTodos);
  const [aberto, setAberto] = useState<(Partial<PedidoCompra> & { itens: ItemCompra[] }) | null>(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    if (abrirNovo) { setAberto({ status: "cotacao", frete: 0, itens: [] }); onAberto(); }
  }, [abrirNovo]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = pcs.filter((p) => mostrarTodos || !["recebido", "cancelado"].includes(p.status));
  const atrasados = pcs.filter((p) => ["enviado", "parcial"].includes(p.status) && p.previsao_entrega && p.previsao_entrega < hoje()).length;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ClipboardList} tom="info" label="Em cotação" valor={pcs.filter((p) => p.status === "cotacao").length} sub="aguardando preço do fornecedor" />
        <Stat icon={Truck} tom="atencao" label="A caminho" valor={pcs.filter((p) => ["enviado", "parcial"].includes(p.status)).length} />
        <Stat icon={PackageSearch} tom={atrasados ? "critico" : "neutro"} label="Entrega atrasada" valor={atrasados} />
        <Stat icon={ShoppingBag} label="Em aberto (R$)" valor={brl(pcs.filter((p) => ["enviado", "parcial"].includes(p.status)).reduce((s, p) => s + Number(p.valor_total), 0))} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} /> Mostrar recebidos e cancelados
        </label>
        {pode("editar_producao") && <Button onClick={() => setAberto({ status: "cotacao", frete: 0, itens: [] })}><Plus size={16} /> Novo pedido de compra</Button>}
      </div>
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">Nº</th><th className="th">Fornecedor</th><th className="th">Itens</th><th className="th">Situação</th><th className="th">Entrega</th><th className="th text-right">Total</th><th className="th" /></>}>
        {lista.map((p) => (
          <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberto({ ...p, itens: p.itens ?? [] })}>
            <td className="td font-bold text-fg">#{p.numero}</td>
            <td className="td">{p.fornecedor?.nome ?? <span className="text-amber-700">a definir</span>}</td>
            <td className="td text-slate-600">{(p.itens ?? []).slice(0, 2).map((i) => i.descricao).join(", ")}{(p.itens?.length ?? 0) > 2 ? ` +${p.itens!.length - 2}` : ""}</td>
            <td className="td"><Badge value={p.status === "cotacao" ? "pc_cotacao" : `pc_${p.status}`} /></td>
            <td className={`td num ${["enviado", "parcial"].includes(p.status) && p.previsao_entrega && p.previsao_entrega < hoje() ? "font-semibold text-red-600" : ""}`}>{dataBR(p.previsao_entrega)}</td>
            <td className="td num text-right font-semibold">{brl(p.valor_total)}</td>
            <CelulaAbrir texto="Ver / editar" />
          </tr>
        ))}
      </Table>
      {aberto && <PCModal inicial={aberto} onClose={() => setAberto(null)} />}
    </>
  );
}

function PCModal({ inicial, onClose }: { inicial: Partial<PedidoCompra> & { itens: ItemCompra[] }; onClose: () => void }) {
  const { pode } = usePerfil();
  const [p, setP] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [receber, setReceber] = useState(false);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: cfg } = useConfig();
  const { unidades } = useUnidade();
  const invalidate = useInvalidate();
  const editavel = pode("editar_producao") && ["cotacao", "enviado"].includes(p.status ?? "cotacao");
  const fornecedor = fornecedores.find((f) => f.id === p.fornecedor_id);
  const subtotal = p.itens.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);
  const set = (x: Partial<PedidoCompra> & { itens?: ItemCompra[] }) => setP((a) => ({ ...a, ...x }));
  const atualizarItem = (k: number, patch: Partial<ItemCompra>) => set({ itens: p.itens.map((i, j) => (j === k ? { ...i, ...patch } : i)) });

  async function gravar(status?: string) {
    const { itens, fornecedor: _f, numero: _n, valor_total: _v, created_at: _c, ...cab } = p as any;
    const dados = limpar({ ...cab, frete: Number(cab.frete || 0), ...(status ? { status, ...(status === "enviado" ? { enviado_em: new Date().toISOString() } : {}) } : {}) });
    const { data, error } = dados.id
      ? await supabase.from("pedidos_compra").update(dados).eq("id", dados.id).select("id, numero").single()
      : await supabase.from("pedidos_compra").insert(dados).select("id, numero").single();
    if (error) throw error;
    if (editavel) {
      await supabase.from("pedido_compra_itens").delete().eq("pedido_compra_id", data.id);
      if (itens.length) {
        const { error: e2 } = await supabase.from("pedido_compra_itens").insert(itens.map((i: ItemCompra) => ({
          pedido_compra_id: data.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade,
          custo_unitario: i.custo_unitario, quantidade_recebida: i.quantidade_recebida ?? 0,
        })));
        if (e2) throw e2;
      }
    }
    set({ id: data.id, numero: data.numero, ...(status ? { status } : {}) });
    return data;
  }

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = false) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("pedidos_compra", "necessidade_producao", "produtos", "contas_pagar");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const mensagem = (cotacao: boolean) => [
    `Olá! Aqui é da *${cfg?.nome_fantasia ?? "MF Máquinas"}*.`,
    cotacao ? `Pode nos passar uma cotação (preço, prazo e frete) para os itens abaixo?` : `Confirmamos o pedido de compra *#${p.numero ?? ""}*:`,
    "",
    ...p.itens.map((i) => `• ${i.quantidade}x ${i.descricao}${!cotacao && i.custo_unitario ? ` — ${brl(i.custo_unitario)} un.` : ""}`),
    "",
    !cotacao ? `Total: ${brl(subtotal + Number(p.frete || 0))}` : "",
    p.previsao_entrega ? `Precisamos para: ${dataBR(p.previsao_entrega)}` : "",
    p.condicao_pagamento && !cotacao ? `Pagamento: ${p.condicao_pagamento}` : "",
  ].filter((l) => l !== "").join("\n");

  async function gerarPdf() {
    if (!cfg) return;
    try {
      setPdf(await pdfPedidoCompra({
        numero: p.numero, status: p.status ?? "cotacao", fornecedor, frete: Number(p.frete || 0), previsao_entrega: p.previsao_entrega,
        condicao_pagamento: p.condicao_pagamento, observacoes: p.observacoes,
        itens: p.itens.map((i) => ({ ...i, unidade: produtos.find((x) => x.id === i.produto_id)?.unidade })),
      }, comUnidade(cfg, unidades.find((u) => u.id === (p as any).unidade_id))));
    } catch (e) { notifyError(e); }
  }

  return (
    <Modal open onClose={onClose} title={p.id ? `Pedido de compra #${p.numero}` : "Novo pedido de compra"} wide>
      <form onSubmit={(e) => { e.preventDefault(); executar(gravar, "Pedido de compra salvo"); }} className="space-y-5">
        {p.status && <div className="flex flex-wrap items-center gap-2"><Badge value={`pc_${p.status}`} />
          {p.status === "cotacao" && <span className="text-sm text-slate-500">Mande para o fornecedor, preencha os preços que ele passar e depois confirme o pedido.</span>}
        </div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Fornecedor" className="sm:col-span-2">
            <select className="input" value={p.fornecedor_id ?? ""} disabled={!editavel} onChange={(e) => set({ fornecedor_id: e.target.value || null })}>
              <option value="">A definir</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <Field label="Entrega desejada"><input className="input" type="date" value={p.previsao_entrega ?? ""} disabled={!editavel} onChange={(e) => set({ previsao_entrega: e.target.value })} /></Field>
          <Field label="Frete (R$)"><input className="input" type="number" step="0.01" min={0} value={p.frete ?? 0} disabled={!editavel} onChange={(e) => set({ frete: Number(e.target.value) })} /></Field>
          <Field label="Condição de pagamento" className="sm:col-span-2"><input className="input" placeholder="ex.: 28 dias boleto" value={p.condicao_pagamento ?? ""} disabled={!editavel} onChange={(e) => set({ condicao_pagamento: e.target.value })} /></Field>
          <Field label="Observações" className="sm:col-span-2"><input className="input" value={p.observacoes ?? ""} disabled={!editavel} onChange={(e) => set({ observacoes: e.target.value })} /></Field>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-slate-50"><tr>
              <th className="th">Peça / insumo</th><th className="th w-28 text-right">Qtd</th><th className="th w-36 text-right">Custo unit.</th>
              <th className="th w-32 text-right">Total</th>{p.status && ["enviado", "parcial", "recebido"].includes(p.status) && <th className="th text-right">Recebido</th>}<th className="th w-10" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {p.itens.map((i, k) => (
                <tr key={k}>
                  <td className="td">{i.descricao}</td>
                  <td className="td"><input className="input text-right" type="number" min={0.001} step="any" value={i.quantidade} disabled={!editavel} onChange={(e) => atualizarItem(k, { quantidade: Number(e.target.value) })} /></td>
                  <td className="td"><input className="input text-right" type="number" min={0} step="0.01" value={i.custo_unitario} disabled={!editavel} onChange={(e) => atualizarItem(k, { custo_unitario: Number(e.target.value) })} /></td>
                  <td className="td num pt-5 text-right">{brl(i.quantidade * i.custo_unitario)}</td>
                  {p.status && ["enviado", "parcial", "recebido"].includes(p.status) && <td className="td num pt-5 text-right">{Number(i.quantidade_recebida ?? 0)} / {i.quantidade}</td>}
                  <td className="td">{editavel && <Button type="button" variant="ghost" aria-label="Remover" onClick={() => set({ itens: p.itens.filter((_, j) => j !== k) })}><Trash2 size={16} /></Button>}</td>
                </tr>
              ))}
              {!p.itens.length && <tr><td colSpan={6} className="td py-6 text-center text-slate-500">Adicione as peças abaixo.</td></tr>}
            </tbody>
          </table>
        </div>
        {editavel && (
          <ProdutoBusca produtos={produtos.filter((x) => x.tipo !== "maquina" && x.ativo && !x.fora_de_linha)}
            placeholder="Adicionar peça ou insumo: nome ou SKU"
            onEscolher={(prod) => set({ itens: [...p.itens, { produto_id: prod.id, descricao: prod.descricao, quantidade: 1, custo_unitario: Number(prod.preco_custo) }] })}
            detalhe={(x) => [x.sku, `custo ${brl(x.preco_custo)}`, `estoque ${Number(x.estoque_atual)} (mín. ${Number(x.estoque_minimo)})`].filter(Boolean).join(" · ")} />
        )}
        <div className="text-right text-sm text-slate-600">Itens {brl(subtotal)} · Frete {brl(p.frete)} · <span className="num text-lg font-bold text-fg">Total {brl(subtotal + Number(p.frete || 0))}</span></div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {p.itens.length > 0 && <Button type="button" variant="ghost" onClick={gerarPdf}><FileDown size={16} /> PDF</Button>}
          {fornecedor?.whatsapp && p.itens.length > 0 && (
            <a href={whatsappLink(fornecedor.whatsapp, mensagem(p.status === "cotacao"))} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
              <MessageCircle size={16} /> {p.status === "cotacao" ? "Pedir cotação" : "Enviar pedido"} no WhatsApp
            </a>
          )}
          {editavel && p.id && <Button type="button" variant="ghost" className="!text-red-600" disabled={ocupado} onClick={() => executar(() => gravar("cancelado"), "Pedido cancelado", true)}>Cancelar</Button>}
          <span className="flex-1" />
          {editavel && <Button variant="secondary" disabled={ocupado || !p.itens.length}>Salvar</Button>}
          {editavel && p.status === "cotacao" && (
            <Button type="button" disabled={ocupado || !p.itens.length || !p.fornecedor_id} onClick={() => executar(() => gravar("enviado"), "Pedido confirmado com o fornecedor")}>
              <CheckCircle2 size={16} /> Confirmar pedido
            </Button>
          )}
          {pode("receber_compras") && p.id && ["enviado", "parcial"].includes(p.status ?? "") && (
            <Button type="button" onClick={() => setReceber(true)}><PackageCheck size={16} /> Receber mercadoria</Button>
          )}
        </div>
      </form>
      {receber && <ReceberModal pc={p as PedidoCompra & { itens: ItemCompra[] }} onClose={() => setReceber(false)} onFeito={onClose} />}
      {pdf && <PdfViewer blob={pdf} nome={`pedido-compra-${p.numero ?? "rascunho"}.pdf`} titulo={p.status === "cotacao" ? "Solicitação de cotação" : `Pedido de compra #${p.numero}`} onClose={() => setPdf(null)} />}
    </Modal>
  );
}

function ReceberModal({ pc, onClose, onFeito }: { pc: PedidoCompra & { itens: ItemCompra[] }; onClose: () => void; onFeito: () => void }) {
  const [qtd, setQtd] = useState<Record<string, number>>(Object.fromEntries(pc.itens.map((i) => [i.id!, i.quantidade - Number(i.quantidade_recebida ?? 0)])));
  const [gerarConta, setGerarConta] = useState(true);
  const [vencimento, setVencimento] = useState(somarDias(28));
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();

  async function confirmar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("receber_pedido_compra", {
        p_pedido: pc.id, p_itens: Object.entries(qtd).map(([item_id, quantidade]) => ({ item_id, quantidade })),
        p_gerar_conta: gerarConta, p_vencimento: vencimento,
      });
      if (error) throw error;
      notify(data === "recebido" ? "Mercadoria recebida e lançada no estoque" : "Recebimento parcial registrado");
      invalidate("pedidos_compra", "necessidade_producao", "produtos", "contas_pagar", "estoque_movimentos");
      onClose();
      onFeito();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Receber pedido #${pc.numero}`}>
      <p className="mb-3 text-sm text-slate-500">Confira o que chegou. Se veio menos, ajuste a quantidade: o resto continua “a caminho”.</p>
      <div className="space-y-2">
        {pc.itens.map((i) => {
          const pendente = i.quantidade - Number(i.quantidade_recebida ?? 0);
          return (
            <div key={i.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
              <span className="flex-1 text-sm"><b className="text-fg">{i.descricao}</b><span className="block text-xs text-slate-500">faltam {pendente} de {i.quantidade}</span></span>
              <input className="input w-24 text-right" type="number" min={0} max={pendente} step="any" value={qtd[i.id!] ?? 0}
                onChange={(e) => setQtd({ ...qtd, [i.id!]: Math.min(pendente, Number(e.target.value)) })} disabled={!pendente} />
            </div>
          );
        })}
      </div>
      <Card className="mt-4 p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={gerarConta} onChange={(e) => setGerarConta(e.target.checked)} /> Lançar em contas a pagar</label>
        {gerarConta && <Field label="Vencimento" className="mt-2 max-w-[200px]"><input className="input" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></Field>}
        <p className="mt-2 text-xs text-slate-500">Se a nota do fornecedor chegar pela SEFAZ, prefira lançar a conta por ela (Notas fiscais), para não duplicar.</p>
      </Card>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
        <Button onClick={confirmar} disabled={ocupado}><PackageCheck size={16} /> Confirmar recebimento</Button>
      </div>
    </Modal>
  );
}

/* ============================== Ficha técnica ============================== */

type Componente = { id?: string; produto_id: string; componente_id: string; quantidade: number };

function FichaTecnica() {
  const { pode } = usePerfil();
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const maquinas = produtos.filter((p) => p.tipo === "maquina");
  const [maquinaId, setMaquinaId] = useState<string>("");
  const maquina = produtos.find((p) => p.id === (maquinaId || maquinas[0]?.id));
  const { data: comps = [], refetch } = useQuery({
    queryKey: ["produto_componentes", maquina?.id],
    enabled: !!maquina,
    queryFn: async () => (await supabase.from("produto_componentes").select("*").eq("produto_id", maquina!.id)).data as Componente[],
  });
  const [lista, setLista] = useState<Componente[]>([]);
  useEffect(() => { setLista(comps ?? []); }, [comps]);
  const editavel = pode("editar_producao");
  const custo = lista.reduce((s, c) => s + c.quantidade * Number(produtos.find((p) => p.id === c.componente_id)?.preco_custo ?? 0), 0);
  const margem = maquina && Number(maquina.preco_venda) ? (Number(maquina.preco_venda) - custo) / Number(maquina.preco_venda) : 0;

  async function salvar() {
    try {
      await supabase.from("produto_componentes").delete().eq("produto_id", maquina!.id);
      if (lista.length) {
        const { error } = await supabase.from("produto_componentes").insert(lista.map((c) => ({ produto_id: maquina!.id, componente_id: c.componente_id, quantidade: c.quantidade })));
        if (error) throw error;
      }
      notify("Ficha técnica salva");
      refetch();
    } catch (e) { notifyError(e); }
  }

  if (!maquinas.length) return <p className="py-8 text-center text-slate-500">Cadastre as máquinas em Estoque (tipo “Máquina”) para montar a ficha técnica.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-2 lg:col-span-1">
        {maquinas.map((m) => (
          <button key={m.id} onClick={() => setMaquinaId(m.id)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${m.id === maquina?.id ? "bg-brand-light font-semibold text-fg" : "hover:bg-slate-50"}`}>
            {m.descricao}
          </button>
        ))}
      </Card>
      {maquina && (
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-1 text-base font-bold text-fg">{maquina.descricao}</h3>
          <p className="mb-3 text-sm text-slate-500">Peças e insumos usados para montar <b>uma</b> unidade.</p>
          <div className="space-y-2">
            {lista.map((c, k) => {
              const peca = produtos.find((p) => p.id === c.componente_id);
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{peca?.descricao}<span className="block text-xs text-slate-500">custo {brl(peca?.preco_custo)} · estoque {Number(peca?.estoque_atual ?? 0)}</span></span>
                  <input className="input w-24 text-right" type="number" min={0.001} step="any" value={c.quantidade} disabled={!editavel}
                    onChange={(e) => setLista(lista.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value) } : x)))} />
                  {editavel && <Button variant="ghost" aria-label="Remover" onClick={() => setLista(lista.filter((_, j) => j !== k))}><Trash2 size={16} /></Button>}
                </div>
              );
            })}
          </div>
          {editavel && (
            <ProdutoBusca className="mt-3" placeholder="Adicionar peça: nome, SKU ou código"
              produtos={produtos.filter((p) => p.tipo !== "maquina" && !lista.some((c) => c.componente_id === p.id))}
              onEscolher={(p) => setLista([...lista, { produto_id: maquina.id, componente_id: p.id, quantidade: 1 }])}
              detalhe={(p) => [p.sku, `custo ${brl(p.preco_custo)}`, `estoque ${Number(p.estoque_atual)}`, p.ativo ? null : "inativo"].filter(Boolean).join(" · ")} />
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div><div className="text-slate-500">Custo das peças</div><div className="num text-lg font-bold text-fg">{brl(custo)}</div></div>
            <div><div className="text-slate-500">Preço de venda</div><div className="num text-lg font-bold text-fg">{brl(maquina.preco_venda)}</div></div>
            <div><div className="text-slate-500">Margem sobre peças</div><div className={`num text-lg font-bold ${margem < 0.25 ? "text-amber-700" : "text-emerald-700"}`}>{(margem * 100).toFixed(0)}%</div></div>
          </div>
          {editavel && <div className="mt-4 flex justify-end"><Button onClick={salvar}>Salvar ficha técnica</Button></div>}
        </Card>
      )}
    </div>
  );
}
