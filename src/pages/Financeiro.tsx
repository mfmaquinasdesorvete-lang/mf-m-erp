import { useMemo, useState, type FormEvent } from "react";
import { Ban, Copy, Eye, FileDown, MessageCircle, Pencil, Plus, Printer, Undo2 } from "lucide-react";
import { Badge, Button, Card, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { limpar, useInvalidate, useRows, useSave } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, rotuloCliente, situacaoConta, somarDias, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { pdfFinanceiro } from "@/lib/pdf";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { PdfViewer } from "@/components/PdfViewer";
import { Anexos } from "@/components/Anexos";
import { Historico } from "@/components/Historico";
import { BaixaModal } from "@/components/financeiro/BaixaModal";
import { VisaoGeral } from "@/components/financeiro/VisaoGeral";
import { CampoCategoria, CampoRateio, rateioOk } from "@/components/financeiro/CategoriaRateio";
import { ContasFixas } from "@/components/financeiro/ContasFixas";
import { Dre } from "@/components/financeiro/Dre";
import { PlanoContas } from "@/components/financeiro/PlanoContas";
import { Cobranca } from "@/components/financeiro/Cobranca";
import { BotaoRecibo, Recibos, reciboDePagar, reciboDeReceber } from "@/components/financeiro/Recibos";
import { pixDaConta } from "@/lib/cobranca";
import type { LancDre, Rateio } from "@/lib/dre";

type Receber = {
  id: string; descricao: string; cliente_id: string | null; valor: number; vencimento: string; status: string;
  forma_pagamento: string; data_pagamento: string | null; valor_pago: number | null; unidade_id?: string | null;
  conta_bancaria_id?: string | null; motivo_alteracao?: string | null; cliente?: Cliente | null;
  categoria?: string; rateio?: Rateio; competencia?: string | null; recorrente_id?: string | null;
};
type Pagar = {
  id: string; descricao: string; fornecedor_id: string | null; categoria: string; documento: string | null;
  valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  observacoes: string | null; conta_bancaria_id?: string | null; motivo_alteracao?: string | null; fornecedor?: { nome: string } | null;
  rateio?: Rateio; competencia?: string | null; recorrente_id?: string | null; unidade_id?: string | null;
};
type ContaBancaria = { id: string; nome: string; unidade_id: string; ativo: boolean };

/** Mudou valor ou vencimento de uma conta já lançada: pede o motivo (fica no histórico). */
const precisaMotivo = (orig: { valor: number; vencimento: string } | undefined, nova: { valor?: number; vencimento?: string }) =>
  !!orig && (Number(orig.valor) !== Number(nova.valor) || orig.vencimento !== nova.vencimento);

const FILTROS = [
  { value: "pendentes", label: "Em aberto" },
  { value: "vencido", label: "Vencidas" },
  { value: "pago", label: "Pagas" },
  { value: "todos", label: "Todas" },
];

function filtrar<T extends { status: string; vencimento: string }>(lista: T[], filtro: string, mes: string) {
  return lista
    .filter((c) => !mes || c.vencimento.startsWith(mes))
    .filter((c) => {
      const s = situacaoConta(c.status, c.vencimento);
      if (filtro === "pendentes") return s === "aberto" || s === "vencido";
      if (filtro === "todos") return true;
      return s === filtro;
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export default function Financeiro() {
  const { pode, papel } = usePerfil();
  const veContasPagar = pode("contas_pagar") || papel === "contador";
  const [aba, setAba] = useState<"visao" | "receber" | "pagar" | "cobranca" | "recibos" | "fixas" | "dre" | "plano">("visao");
  const veCobranca = papel === "admin" || papel === "financeiro" || papel === "vendas";
  const { filtrar } = useUnidade();
  const { data: receberTodos = [] } = useRows<Receber>("contas_receber", { select: "*, cliente:clientes(*)" });
  const receber = filtrar(receberTodos);
  const { data: pagarTodos = [] } = useRows<Pagar>("contas_pagar", { select: "*, fornecedor:fornecedores(nome)" });
  const pagar = filtrar(pagarTodos);

  const resumo = useMemo(() => {
    const aberto = (l: { status: string; valor: number; vencimento: string }[]) => l.filter((c) => c.status === "aberto");
    const soma = (l: { valor: number }[]) => l.reduce((s, c) => s + Number(c.valor), 0);
    const r = aberto(receber), p = aberto(pagar);
    return {
      aReceber: soma(r), vencidoReceber: soma(r.filter((c) => c.vencimento < hoje())),
      aPagar: soma(p), vencidoPagar: soma(p.filter((c) => c.vencimento < hoje())),
      pagar7dias: soma(p.filter((c) => c.vencimento <= somarDias(7))),
    };
  }, [receber, pagar]);
  const paraVisao = useMemo(() => ({
    receber: receber.map((c) => ({ ...c, terceiro: c.cliente ? c.cliente.nome_fantasia?.trim() || c.cliente.nome : null })),
    pagar: pagar.map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? null })),
  }), [receber, pagar]);
  const paraDre = useMemo<LancDre[]>(() => [
    ...receber.map((c) => ({ ...c, tipo: "receber" as const })),
    ...pagar.map((c) => ({ ...c, tipo: "pagar" as const })),
  ], [receber, pagar]);

  return (
    <div>
      <PageHeader title="Financeiro" />
      <Tabs value={aba} onChange={setAba} options={[
        { value: "visao", label: "Visão geral" }, { value: "receber", label: "Contas a receber" },
        ...(veContasPagar ? [{ value: "pagar" as const, label: "Contas a pagar" }] : []),
        ...(veCobranca ? [{ value: "cobranca" as const, label: "Cobrança" }] : []),
        { value: "recibos" as const, label: "Recibos" },
        ...(veContasPagar ? [{ value: "fixas" as const, label: "Contas fixas" },
          { value: "dre" as const, label: "DRE" }, { value: "plano" as const, label: "Plano de contas" }] : []),
      ]} />
      {aba === "cobranca" && veCobranca ? <Cobranca contas={receber} />
        : aba === "recibos" ? <Recibos />
        : aba === "fixas" && veContasPagar ? <ContasFixas />
        : aba === "dre" && veContasPagar ? <Dre lancamentos={paraDre} />
        : aba === "plano" && veContasPagar ? <PlanoContas />
        : aba === "visao" ? (
        <VisaoGeral receber={paraVisao.receber} pagar={veContasPagar ? paraVisao.pagar : []} vePagar={veContasPagar}
          veSaldo={papel === "admin" || papel === "financeiro" || papel === "contador"} podeBaixar={pode("editar_financeiro")} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Resumo label="A receber (aberto)" valor={resumo.aReceber} />
            <Resumo label="Recebimentos vencidos" valor={resumo.vencidoReceber} alerta />
            {veContasPagar && <Resumo label="A pagar (aberto)" valor={resumo.aPagar} />}
            {veContasPagar && <Resumo label="A pagar nos próximos 7 dias" valor={resumo.pagar7dias} alerta={resumo.vencidoPagar > 0}
              sub={resumo.vencidoPagar ? `${brl(resumo.vencidoPagar)} vencido` : undefined} />}
          </div>
          {aba === "pagar" && veContasPagar ? <ContasPagar contas={pagar} /> : <ContasReceber contas={receber} />}
        </>
      )}
    </div>
  );
}

function Resumo({ label, valor, alerta, sub }: { label: string; valor: number; alerta?: boolean; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta && valor > 0 ? "text-red-600" : ""}`}>{brl(valor)}</div>
      {sub && <div className="text-xs text-red-600">{sub}</div>}
    </Card>
  );
}

function Filtros({ filtro, setFiltro, mes, setMes, onNovo, onImprimir, onExportar }: {
  filtro: string; setFiltro: (v: string) => void; mes: string; setMes: (v: string) => void; onNovo?: () => void;
  onImprimir: () => void; onExportar: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
        {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm text-slate-600">Vencimento em <input className="input w-auto" type="month" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês de vencimento" /></label>
      <div className="flex-1" />
      <Button variant="secondary" onClick={onImprimir}><Printer size={16} /> Imprimir</Button>
      <Button variant="secondary" onClick={onExportar}><FileDown size={16} /> Exportar</Button>
      {onNovo && <Button onClick={onNovo}><Plus size={16} /> Nova conta</Button>}
    </div>
  );
}

/* ------------------------- Imprimir e exportar a lista ------------------------- */

type LinhaRel = { vencimento: string; descricao: string; terceiro: string; status: string; data_pagamento: string | null; valor: number; valor_pago: number | null; unidade_id?: string | null };

function useRelatorio(tipo: "receber" | "pagar", filtro: string, mes: string) {
  const { data: cfg } = useConfig();
  const { nome, atual } = useUnidade();
  const [pdf, setPdf] = useState<Blob | null>(null);
  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";
  const terceiro = tipo === "receber" ? "Cliente" : "Fornecedor";
  const filtros = () => [
    FILTROS.find((f) => f.value === filtro)?.label,
    mes ? `vencimento em ${mes.split("-").reverse().join("/")}` : "todos os meses",
    atual ? nome(atual) : "todas as unidades",
  ].join(" · ");

  async function imprimir(lista: LinhaRel[]) {
    if (!cfg) return;
    try {
      setPdf(await pdfFinanceiro({
        titulo, terceiro, filtros: filtros(),
        linhas: lista.map((c) => ({ vencimento: c.vencimento, descricao: c.descricao, terceiro: c.terceiro, situacao: situacaoConta(c.status, c.vencimento),
          pagamento: c.data_pagamento, valor: Number(c.valor), pago: c.valor_pago == null ? null : Number(c.valor_pago) })),
      }, cfg));
    } catch (e) { notifyError(e); }
  }
  function exportar(lista: LinhaRel[], extra: (c: any) => Record<string, unknown> = () => ({})) {
    const SIT: Record<string, string> = { aberto: "Em aberto", vencido: "Vencida", pago: "Paga", cancelado: "Cancelada" };
    baixarPlanilha(tipo === "receber" ? "contas-a-receber" : "contas-a-pagar", [{ nome: titulo, linhas: lista.map((c) => ({
      Vencimento: celula(c.vencimento), Descrição: c.descricao, [terceiro]: c.terceiro, ...extra(c),
      Situação: SIT[situacaoConta(c.status, c.vencimento)] ?? c.status, Valor: Number(c.valor),
      "Pago em": celula(c.data_pagamento), "Valor pago": c.valor_pago == null ? "" : Number(c.valor_pago), Unidade: nome(c.unidade_id ?? null),
    })) }]).catch(notifyError);
  }
  const visor = pdf && <PdfViewer blob={pdf} nome={`${tipo === "receber" ? "contas-a-receber" : "contas-a-pagar"}${mes ? `-${mes}` : ""}.pdf`} titulo={titulo} onClose={() => setPdf(null)} />;
  return { imprimir, exportar, visor };
}

/* ----------------------------- Contas a receber ----------------------------- */

function ContasReceber({ contas }: { contas: Receber[] }) {
  const { data: cfgRecibo } = useConfig();
  const { padrao, unidades } = useUnidade();
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const [filtro, setFiltro] = useState("pendentes");
  const [mes, setMes] = useState("");
  const [nova, setNova] = useState<Partial<Receber> | null>(null);
  const [baixa, setBaixa] = useState<{ conta: Receber; tabela: "contas_receber" } | null>(null);
  const [motivo, setMotivo] = useState<{ conta: Receber; acao: "cancelar" | "estornar" } | null>(null);
  const contaBanco = useNomeContaBancaria();
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const save = useSave("contas_receber");
  const invalidate = useInvalidate();
  const lista = filtrar(contas, filtro, mes);
  const rel = useRelatorio("receber", filtro, mes);
  const paraRel = () => lista.map((c) => ({ ...c, terceiro: c.cliente?.nome ?? "" }));

  const copiar = (texto: string, o: string) => navigator.clipboard.writeText(texto).then(() => notify(`${o} copiado`));

  const pagamentoDe = (c: Receber) => unidades.find((u) => u.id === c.unidade_id)?.instrucoes_pagamento ?? "";
  const mensagemCobranca = (c: Receber) => {
    const u = unidades.find((x) => x.id === c.unidade_id);
    const pix = pixDaConta(u, Number(c.valor), c.id);
    return [
      `Olá ${c.cliente?.nome.split(" ")[0] ?? ""}! Segue a cobrança da *MF Máquinas*:`,
      `${c.descricao}`,
      `Valor: ${brl(c.valor)} · Vencimento: ${dataBR(c.vencimento)}`,
      pix ? `\n*Pix copia e cola:*\n${pix}` : "",
      pagamentoDe(c) ? `\n*Como pagar:*\n${pagamentoDe(c)}` : "",
      c.cliente?.portal_token ? `\nSuas contas e a segunda via: ${window.location.origin}/cliente/${c.cliente.portal_token}` : "",
    ].filter(Boolean).join("\n");
  };

  const somenteVer = !!nova?.id && (!podeEditar || nova.status !== "aberto");

  async function salvarNova(e: FormEvent) {
    e.preventDefault();
    try {
      const { cliente: _c, ...row } = nova as any;
      if (!rateioOk(row.rateio)) return notify("Os centros de custo precisam somar 100%", "erro");
      if (!precisaMotivo(contas.find((c) => c.id === row.id), row)) delete row.motivo_alteracao;
      await save.mutateAsync(limpar({ ...row, valor: Number(row.valor) }));
      notify(row.id ? "Conta salva" : "Conta lançada");
      setNova(null);
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <>
      {rel.visor}
      <Filtros filtro={filtro} setFiltro={setFiltro} mes={mes} setMes={setMes}
        onImprimir={() => rel.imprimir(paraRel())} onExportar={() => rel.exportar(paraRel(), (c) => ({ Forma: c.forma_pagamento }))}
        onNovo={podeEditar ? () => setNova({ forma_pagamento: "boleto", vencimento: somarDias(3), descricao: "", unidade_id: padrao, categoria: "vendas", rateio: [] } as any) : undefined} />
      <Table
        empty={lista.length === 0}
        head={<><th className="th">Vencimento</th><th className="th">Descrição</th><th className="th">Cliente</th><th className="th">Situação</th><th className="th text-right">Valor</th><th className="th" /></>}
      >
        {lista.map((c) => {
          const s = situacaoConta(c.status, c.vencimento);
          return (
            <tr key={c.id}>
              <td className="td whitespace-nowrap">{dataBR(c.vencimento)}</td>
              <td className="td">{c.descricao}<EtiquetaUnidade id={(c as any).unidade_id} /><div className="text-xs text-slate-500">{c.forma_pagamento}{c.data_pagamento && ` · pago em ${dataBR(c.data_pagamento)}`}{c.conta_bancaria_id && ` · ${contaBanco(c.conta_bancaria_id)}`}</div></td>
              <td className="td">{c.cliente?.nome ?? "—"}</td>
              <td className="td"><Badge value={s} /></td>
              <td className="td text-right font-medium">{brl(c.valor)}</td>
              <td className="td">
                <div className="flex flex-wrap justify-end gap-1">
                  {c.status === "aberto" && pagamentoDe(c) && <Button variant="ghost" title="Copiar dados para pagamento" onClick={() => copiar(pagamentoDe(c), "Dados para pagamento")}><Copy size={15} /></Button>}
                  {c.status === "aberto" && c.cliente?.whatsapp && (
                    <a href={whatsappLink(c.cliente.whatsapp, mensagemCobranca(c))} target="_blank" rel="noreferrer" title="Enviar cobrança no WhatsApp"
                      className="inline-flex items-center rounded-md px-2 py-2 text-green-700 hover:bg-green-50"><MessageCircle size={16} /></a>
                  )}
                  {podeEditar && c.status === "aberto" && <Button variant="ghost" onClick={() => setBaixa({ conta: c, tabela: "contas_receber" })}>Baixar</Button>}
                  {c.status === "pago" && <BotaoRecibo contaId={c.id} tipo="receber" montar={() => reciboDeReceber(c, unidades.find((u) => u.id === c.unidade_id), cfgRecibo)} />}
                  {podeEditar && c.status === "pago" && <Button variant="ghost" title="Estornar a baixa (volta a ficar em aberto)" onClick={() => setMotivo({ conta: c, acao: "estornar" })}><Undo2 size={15} /></Button>}
                  <Button variant="secondary" onClick={() => setNova({ ...c })}>{podeEditar && c.status === "aberto" ? <><Pencil size={15} /> Editar</> : <><Eye size={15} /> Ver</>}</Button>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>

      <Modal open={!!nova} onClose={() => setNova(null)}
        title={!nova?.id ? "Nova conta a receber" : somenteVer ? "Conta a receber" : "Editar conta a receber"}>
        {nova && (
          <form onSubmit={salvarNova} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {nova.id && (
              <div className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
                <Badge value={situacaoConta(nova.status!, nova.vencimento!)} />
                {nova.data_pagamento && <span className="text-slate-500">pago em {dataBR(nova.data_pagamento)} · {brl(nova.valor_pago)}</span>}
              </div>
            )}
            <fieldset disabled={somenteVer} className="contents">
            <div className="sm:col-span-2"><CampoUnidade value={(nova as any).unidade_id} disabled={!!nova.id} onChange={(v) => setNova({ ...nova, unidade_id: v } as any)} label="Unidade que recebe" /></div>
            <Field label="Descrição" className="sm:col-span-2"><input className="input" value={nova.descricao ?? ""} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} required /></Field>
            <Field label="Cliente" className="sm:col-span-2">
              <select className="input" value={nova.cliente_id ?? ""} onChange={(e) => setNova({ ...nova, cliente_id: e.target.value })} required={nova.forma_pagamento === "boleto"}>
                <option value="">—</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{rotuloCliente(c)}</option>)}
              </select>
            </Field>
            <Field label="Valor"><input className="input" type="number" step="0.01" min={0.01} value={nova.valor ?? ""} onChange={(e) => setNova({ ...nova, valor: Number(e.target.value) })} required /></Field>
            <Field label="Vencimento"><input className="input" type="date" value={nova.vencimento} onChange={(e) => setNova({ ...nova, vencimento: e.target.value })} required /></Field>
            <Field label="Forma" className="sm:col-span-2">
              <select className="input" value={nova.forma_pagamento} onChange={(e) => setNova({ ...nova, forma_pagamento: e.target.value })}>
                <option value="boleto">Boleto</option><option value="pix">Pix</option><option value="cartao">Cartão</option>
                <option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option>
              </select>
            </Field>
            <CampoCategoria tipo="receita" value={nova.categoria} onChange={(v) => setNova({ ...nova, categoria: v })} className="sm:col-span-2" />
            <div className="sm:col-span-2"><CampoRateio value={nova.rateio} disabled={somenteVer} onChange={(v) => setNova({ ...nova, rateio: v })} /></div>
            {nova.recorrente_id && <p className="text-xs text-slate-500 sm:col-span-2">Lançada pela conta fixa (Financeiro → Contas fixas).</p>}
            {precisaMotivo(contas.find((c) => c.id === nova.id), nova) && (
              <Field label="Motivo da alteração de valor/vencimento (fica no histórico)" className="sm:col-span-2">
                <input className="input" value={nova.motivo_alteracao ?? ""} onChange={(e) => setNova({ ...nova, motivo_alteracao: e.target.value })} required minLength={3} placeholder="Ex.: cliente pediu prorrogação por e-mail" />
              </Field>
            )}
            </fieldset>
            <div className="sm:col-span-2"><Anexos entidade="conta_receber" id={nova?.id} /></div>
            <div className="sm:col-span-2"><Historico tabela="contas_receber" id={nova?.id} /></div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              {podeEditar && nova.id && nova.status === "aberto" && (
                <Button type="button" variant="ghost" className="mr-auto text-red-600" onClick={() => { setMotivo({ conta: nova as Receber, acao: "cancelar" }); setNova(null); }}><Ban size={15} /> Cancelar conta</Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setNova(null)}>{somenteVer ? "Fechar" : "Cancelar"}</Button>
              {!somenteVer && <Button disabled={save.isPending}>Salvar</Button>}
            </div>
          </form>
        )}
      </Modal>

      {baixa && <BaixaModal conta={baixa.conta} tabela={baixa.tabela} onClose={() => setBaixa(null)} />}
      {motivo && <MotivoModal conta={motivo.conta} acao={motivo.acao} tabela="contas_receber" onClose={() => setMotivo(null)} />}
    </>
  );
}

/* ------------------------------ Contas a pagar ------------------------------ */

function ContasPagar({ contas }: { contas: Pagar[] }) {
  const { padrao, unidades } = useUnidade();
  const { data: cfgRecibo } = useConfig();
  const [filtro, setFiltro] = useState("pendentes");
  const [mes, setMes] = useState("");
  const [editando, setEditando] = useState<Partial<Pagar> | null>(null);
  const [baixa, setBaixa] = useState<Pagar | null>(null);
  const [motivo, setMotivo] = useState<{ conta: Pagar; acao: "cancelar" | "estornar" } | null>(null);
  const contaBanco = useNomeContaBancaria();
  const { data: fornecedores = [] } = useRows<{ id: string; nome: string; cnpj?: string | null }>("fornecedores", { order: "nome", ascending: true });
  const save = useSave("contas_pagar");
  // "pagar por Pix à vista" (conta fixa) vira a forma de pagamento do recibo
  const formaDaObs = (obs: string | null) => /pagar por ([^·]+)/.exec(obs ?? "")?.[1]?.trim() ?? null;
  const lista = filtrar(contas, filtro, mes);
  const rel = useRelatorio("pagar", filtro, mes);
  const paraRel = () => lista.map((c) => ({ ...c, terceiro: c.fornecedor?.nome ?? "" }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      const { fornecedor: _f, ...row } = editando as any;
      if (!rateioOk(row.rateio)) return notify("Os centros de custo precisam somar 100%", "erro");
      if (!precisaMotivo(contas.find((c) => c.id === row.id), row)) delete row.motivo_alteracao;
      await save.mutateAsync(limpar({ ...row, valor: Number(row.valor) }));
      notify("Conta salva");
      setEditando(null);
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <>
      {rel.visor}
      <Filtros filtro={filtro} setFiltro={setFiltro} mes={mes} setMes={setMes}
        onImprimir={() => rel.imprimir(paraRel())} onExportar={() => rel.exportar(paraRel(), (c) => ({ Categoria: c.categoria, Documento: c.documento ?? "" }))}
        onNovo={() => setEditando({ categoria: "fornecedores", vencimento: hoje(), descricao: "", unidade_id: padrao, rateio: [] } as any)} />
      <Table
        empty={lista.length === 0}
        head={<><th className="th">Vencimento</th><th className="th">Descrição</th><th className="th">Fornecedor</th><th className="th">Categoria</th><th className="th">Situação</th><th className="th text-right">Valor</th><th className="th" /></>}
      >
        {lista.map((c) => (
          <tr key={c.id}>
            <td className="td whitespace-nowrap">{dataBR(c.vencimento)}</td>
            <td className="td">{c.descricao}<EtiquetaUnidade id={(c as any).unidade_id} />{(c.documento || c.data_pagamento) && <div className="text-xs text-slate-500">{[c.documento, c.data_pagamento && `pago em ${dataBR(c.data_pagamento)}`, c.conta_bancaria_id && contaBanco(c.conta_bancaria_id)].filter(Boolean).join(" · ")}</div>}</td>
            <td className="td">{c.fornecedor?.nome ?? "—"}</td>
            <td className="td">{c.categoria}</td>
            <td className="td"><Badge value={situacaoConta(c.status, c.vencimento)} /></td>
            <td className="td text-right font-medium">{brl(c.valor)}</td>
            <td className="td whitespace-nowrap text-right">
              {c.status === "aberto" && <Button variant="ghost" onClick={() => setBaixa(c)}>Pagar</Button>}
              {c.status === "pago" && <BotaoRecibo contaId={c.id} tipo="pagar" montar={() => reciboDePagar(c, fornecedores.find((f) => f.id === c.fornecedor_id), unidades.find((u) => u.id === c.unidade_id), cfgRecibo, formaDaObs(c.observacoes))} />}
              {c.status === "pago" && <Button variant="ghost" title="Estornar o pagamento (volta a ficar em aberto)" onClick={() => setMotivo({ conta: c, acao: "estornar" })}><Undo2 size={15} /></Button>}
              <Button variant="secondary" onClick={() => setEditando(c)}><Pencil size={15} /> Editar</Button>
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.id ? "Editar conta a pagar" : "Nova conta a pagar"}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><CampoUnidade value={(editando as any).unidade_id} onChange={(v) => setEditando({ ...editando, unidade_id: v } as any)} label="Unidade que paga" /></div>
            <Field label="Descrição" className="sm:col-span-2"><input className="input" value={editando.descricao ?? ""} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} required /></Field>
            <Field label="Fornecedor">
              <select className="input" value={editando.fornecedor_id ?? ""} onChange={(e) => setEditando({ ...editando, fornecedor_id: e.target.value })}>
                <option value="">—</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
            <CampoCategoria tipo="despesa" value={editando.categoria} onChange={(v) => setEditando({ ...editando, categoria: v })} />
            <Field label="Valor"><input className="input" type="number" step="0.01" min={0.01} value={editando.valor ?? ""} onChange={(e) => setEditando({ ...editando, valor: Number(e.target.value) })} required /></Field>
            <Field label="Vencimento"><input className="input" type="date" value={editando.vencimento} onChange={(e) => setEditando({ ...editando, vencimento: e.target.value })} required /></Field>
            <Field label="Documento (NF, boleto…)" className="sm:col-span-2"><input className="input" value={editando.documento ?? ""} onChange={(e) => setEditando({ ...editando, documento: e.target.value })} /></Field>
            <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Field>
            <div className="sm:col-span-2"><CampoRateio value={editando.rateio} onChange={(v) => setEditando({ ...editando, rateio: v })} /></div>
            {editando.recorrente_id && <p className="text-xs text-slate-500 sm:col-span-2">Lançada pela conta fixa (Financeiro → Contas fixas).</p>}
            {precisaMotivo(contas.find((c) => c.id === editando.id), editando) && (
              <Field label="Motivo da alteração de valor/vencimento (fica no histórico)" className="sm:col-span-2">
                <input className="input" value={editando.motivo_alteracao ?? ""} onChange={(e) => setEditando({ ...editando, motivo_alteracao: e.target.value })} required minLength={3} placeholder="Ex.: fornecedor enviou boleto corrigido" />
              </Field>
            )}
            <div className="sm:col-span-2"><Anexos entidade="conta_pagar" id={editando?.id} /></div>
            <div className="sm:col-span-2"><Historico tabela="contas_pagar" id={editando?.id} /></div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              {editando.id && editando.status === "aberto" && (
                <Button type="button" variant="ghost" className="mr-auto text-red-600" onClick={() => { setMotivo({ conta: editando as Pagar, acao: "cancelar" }); setEditando(null); }}><Ban size={15} /> Cancelar conta</Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button disabled={save.isPending}>Salvar</Button>
            </div>
          </form>
        )}
      </Modal>

      {baixa && <BaixaModal conta={baixa} tabela="contas_pagar" onClose={() => setBaixa(null)} />}
      {motivo && <MotivoModal conta={motivo.conta} acao={motivo.acao} tabela="contas_pagar" onClose={() => setMotivo(null)} />}
    </>
  );
}

/* --------------------------- Baixa manual (pagamento) --------------------------- */

/* --------------------- Cancelar conta / estornar baixa (com motivo) --------------------- */

function MotivoModal({ conta, acao, tabela, onClose }: {
  conta: { id: string; descricao: string; valor: number }; acao: "cancelar" | "estornar"; tabela: "contas_receber" | "contas_pagar"; onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const invalidate = useInvalidate();
  async function confirmar(e: FormEvent) {
    e.preventDefault();
    const patch = acao === "cancelar"
      ? { status: "cancelado", motivo_alteracao: motivo }
      : { status: "aberto", data_pagamento: null, valor_pago: null, conta_bancaria_id: null, motivo_alteracao: `Estorno: ${motivo}` };
    const { error } = await supabase.from(tabela).update(patch).eq("id", conta.id);
    if (error) return notifyError(error);
    notify(acao === "cancelar" ? "Conta cancelada" : "Baixa estornada: a conta voltou a ficar em aberto");
    invalidate(tabela, "auditoria");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`${acao === "cancelar" ? "Cancelar conta" : "Estornar baixa"} — ${conta.descricao}`}>
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-sm text-slate-600">
          {acao === "cancelar"
            ? <>A conta de <b>{brl(conta.valor)}</b> deixa de contar como {tabela === "contas_receber" ? "a receber" : "a pagar"}. Ela não é apagada: fica como cancelada, com o motivo no histórico.</>
            : <>O pagamento é desfeito e a conta de <b>{brl(conta.valor)}</b> volta a ficar em aberto. O motivo fica no histórico.</>}
        </p>
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant={acao === "cancelar" ? "danger" : "primary"}>{acao === "cancelar" ? "Cancelar conta" : "Estornar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Nome da conta bancária pelo id (para mostrar onde o dinheiro entrou/saiu). */
function useNomeContaBancaria() {
  const { data: bancos = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  return (id: string) => bancos.find((b) => b.id === id)?.nome ?? "";
}
