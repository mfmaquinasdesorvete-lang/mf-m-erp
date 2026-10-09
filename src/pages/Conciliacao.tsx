import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeftRight, Ban, Check, FileUp, Landmark, Link2, Pencil, Plus, Receipt, Undo2 } from "lucide-react";
import { Badge, Button, Card, Field, Modal, PageHeader, Table } from "@/components/ui";
import { limpar, useInvalidate, useRows, useSave } from "@/lib/data";
import { CampoUnidade, EtiquetaUnidade, useUnidade } from "@/lib/unidade";
import { brl, dataBR, digitos, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { CampoCategoria } from "@/components/financeiro/CategoriaRateio";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { lerExtrato, linhasCsv, type LinhaExtrato, type MapaCsv, type ResultadoExtrato } from "@/lib/extrato";
import { sugerir, type Sugestao } from "@/lib/conciliacao";

export type ContaBancaria = {
  id: string; unidade_id: string; nome: string; banco: string; agencia: string | null; numero: string | null; tipo: string;
  saldo_inicial: number; saldo_inicial_data: string; ativo: boolean;
};
type Lancamento = {
  id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; documento: string | null;
  status: "pendente" | "conciliado" | "ignorado" | "transferencia"; conta_receber_id: string | null; conta_pagar_id: string | null;
  par_transferencia_id: string | null; observacao: string | null; baixou_conta: boolean; created_at: string;
};
type Importacao = { id: string; conta_bancaria_id: string; saldo_final: number | null; saldo_final_data: string | null; periodo_fim: string | null; created_at: string; arquivo: string | null };
type Conta = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  unidade_id: string | null; conta_bancaria_id: string | null; cliente?: { nome: string } | null; fornecedor?: { nome: string } | null;
};

export const BANCOS: Record<string, string> = { unicred: "Unicred", nubank: "Nubank", infinitepay: "InfinitePay", outro: "Outro banco", caixa: "Caixa (dinheiro)" };

export default function Conciliacao() {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { filtrar } = useUnidade();
  const { data: contasTodas = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  const bancos = filtrar(contasTodas);
  const { data: lancamentos = [] } = useRows<Lancamento>("extrato_lancamentos", { order: "data", ascending: false });
  const { data: importacoes = [] } = useRows<Importacao>("extrato_importacoes");
  const { data: receber = [] } = useRows<Conta>("contas_receber", { select: "*, cliente:clientes(nome)" });
  const { data: pagar = [] } = useRows<Conta>("contas_pagar", { select: "*, fornecedor:fornecedores(nome)" });

  const [contaSel, setContaSel] = useState<string>("");
  const [situacao, setSituacao] = useState<string>("pendente");
  const [mes, setMes] = useState("");
  const [editConta, setEditConta] = useState<Partial<ContaBancaria> | null>(null);
  const [importar, setImportar] = useState(false);
  const [tratar, setTratar] = useState<Lancamento | null>(null);
  const [desfazer, setDesfazer] = useState<Lancamento | null>(null);

  const idsBancos = new Set(bancos.map((b) => b.id));
  const invalidate = useInvalidate();
  const [aprovando, setAprovando] = useState(false);
  const { sugestoes, divergentes } = useMemo(() => sugerir(
    lancamentos.filter((l) => idsBancos.has(l.conta_bancaria_id)), receber, pagar, new Map(contasTodas.map((b) => [b.id, b.unidade_id])),
  ), [lancamentos, receber, pagar, contasTodas, bancos]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = lancamentos
    .filter((l) => idsBancos.has(l.conta_bancaria_id) && (!contaSel || l.conta_bancaria_id === contaSel))
    .filter((l) => situacao === "todos" || (situacao === "sugestao" ? l.status === "pendente" && sugestoes.has(l.id)
      : situacao === "divergente" ? l.status === "pendente" && divergentes.has(l.id) : l.status === situacao))
    .filter((l) => !mes || l.data.startsWith(mes));
  const sugeridasNaLista = lista.filter((l) => l.status === "pendente" && sugestoes.has(l.id));

  async function aprovar(ids: string[]) {
    setAprovando(true);
    let ok = 0; const erros: string[] = [];
    for (const id of ids) {
      const s = sugestoes.get(id) as Sugestao;
      const { error } = s.tipo === "transferencia"
        ? await supabase.rpc("marcar_transferencia", { p_lanc: id, p_par: s.parId })
        : await supabase.rpc("conciliar_lancamento", { p_lanc: id, p_tipo: s.tipo, p_conta: s.contaId });
      if (error) erros.push(error.message); else ok++;
    }
    setAprovando(false);
    invalidate("extrato_lancamentos", "contas_receber", "contas_pagar", "saldos_bancarios", "movimentos_realizados");
    if (ok) notify(`${ok} lançamento(s) conciliado(s)`);
    if (erros.length) notify(`${erros.length} não foram: ${[...new Set(erros)].join("; ")}`, "erro");
  }

  const saldos = useMemo(() => Object.fromEntries(bancos.map((b) => {
    const desde = b.saldo_inicial_data;
    const doBanco = lancamentos.filter((l) => l.conta_bancaria_id === b.id && l.data >= desde);
    const extrato = Number(b.saldo_inicial) + doBanco.reduce((s, l) => s + Number(l.valor), 0);
    const recebido = receber.filter((c) => c.conta_bancaria_id === b.id && c.status === "pago" && (c.data_pagamento ?? "") >= desde).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0);
    const pago = pagar.filter((c) => c.conta_bancaria_id === b.id && c.status === "pago" && (c.data_pagamento ?? "") >= desde).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0);
    const outros = doBanco.filter((l) => l.status === "transferencia" || l.status === "ignorado").reduce((s, l) => s + Number(l.valor), 0);
    const erp = Number(b.saldo_inicial) + recebido - pago + outros;
    const ult = importacoes.filter((i) => i.conta_bancaria_id === b.id && i.saldo_final != null)
      .sort((a, c) => (c.saldo_final_data ?? c.created_at).localeCompare(a.saldo_final_data ?? a.created_at))[0];
    // saldo do extrato na data do saldo informado pelo banco, para comparar
    const extratoNaData = ult?.saldo_final_data ? Number(b.saldo_inicial) + doBanco.filter((l) => l.data <= ult.saldo_final_data!).reduce((s, l) => s + Number(l.valor), 0) : null;
    return [b.id, {
      extrato, erp, pendentes: doBanco.filter((l) => l.status === "pendente").length,
      informado: ult ? Number(ult.saldo_final) : null, informadoData: ult?.saldo_final_data ?? null, extratoNaData,
      ultima: importacoes.filter((i) => i.conta_bancaria_id === b.id).sort((a, c) => c.created_at.localeCompare(a.created_at))[0]?.created_at ?? null,
    }];
  })), [bancos, lancamentos, importacoes, receber, pagar]);

  const nomeConta = (id: string) => contasTodas.find((b) => b.id === id)?.nome ?? "—";
  const vinculo = (l: Lancamento) => {
    if (l.conta_receber_id) { const c = receber.find((x) => x.id === l.conta_receber_id); return c ? `${c.descricao}${c.cliente ? " · " + c.cliente.nome : ""}` : "conta a receber"; }
    if (l.conta_pagar_id) { const c = pagar.find((x) => x.id === l.conta_pagar_id); return c ? `${c.descricao}${c.fornecedor ? " · " + c.fornecedor.nome : ""}` : "conta a pagar"; }
    if (l.par_transferencia_id) { const p = lancamentos.find((x) => x.id === l.par_transferencia_id); return p ? `Transferência ${l.valor < 0 ? "para" : "de"} ${nomeConta(p.conta_bancaria_id)}` : "transferência"; }
    return l.observacao ?? "";
  };

  return (
    <div>
      <PageHeader title="Bancos e conciliação" subtitle="Importe o extrato (OFX ou CSV) e o ERP liga cada entrada e saída à conta certa"
        actions={podeEditar && <>
          <Button variant="secondary" onClick={() => setEditConta({ banco: "unicred", tipo: "corrente", saldo_inicial: 0, saldo_inicial_data: hoje(), ativo: true })}><Plus size={16} /> Nova conta</Button>
          <Button onClick={() => setImportar(true)} disabled={!bancos.some((b) => b.ativo)}><FileUp size={16} /> Importar extrato</Button>
        </>} />

      {!bancos.length && (
        <Card className="mb-5 p-5 text-sm text-slate-600">
          <b className="text-fg">Comece cadastrando as contas</b> de cada unidade (ex.: Unicred SC, Nubank SC, InfinitePay SC, Unicred SP) com o saldo do dia em que vai começar a conciliar.
          Depois importe o extrato de cada uma: OFX na Unicred e no Nubank; na InfinitePay, a planilha (CSV) do extrato.
        </Card>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {bancos.map((b) => {
          const s = saldos[b.id];
          const dif = Math.round((s.extrato - s.erp) * 100) / 100;
          const difBanco = s.informado != null && s.extratoNaData != null ? Math.round((s.informado - s.extratoNaData) * 100) / 100 : 0;
          return (
            <button key={b.id} onClick={() => setContaSel(contaSel === b.id ? "" : b.id)}
              className={`rounded-xl border bg-surface p-4 text-left shadow-card transition ${contaSel === b.id ? "border-brand ring-2 ring-brand/30" : "border-slate-200/80 hover:border-slate-300"} ${b.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold text-fg"><Landmark size={15} className="shrink-0 text-slate-400" /> <span className="truncate">{b.nome}</span></div>
                  <div className="text-xs text-slate-500">{BANCOS[b.banco] ?? b.banco}{b.numero ? ` · ${b.numero}` : ""}<EtiquetaUnidade id={b.unidade_id} /></div>
                </div>
                {podeEditar && <span role="button" tabIndex={0} aria-label={`Editar ${b.nome}`} onClick={(e) => { e.stopPropagation(); setEditConta(b); }}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-fg"><Pencil size={14} /></span>}
              </div>
              <div className="mt-3 text-xl font-bold text-fg">{brl(s.extrato)}</div>
              <div className="text-xs text-slate-500">saldo pelo extrato importado</div>
              <dl className="mt-2 space-y-0.5 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Pelo ERP (baixas)</dt><dd>{brl(s.erp)}</dd></div>
                <div className={`flex justify-between gap-2 ${dif ? "font-semibold text-amber-700" : "text-emerald-700"}`}><dt>Diferença</dt><dd>{dif ? brl(dif) : "nenhuma ✓"}</dd></div>
                {s.informado != null && (
                  <div className={`flex justify-between gap-2 ${difBanco ? "font-semibold text-red-600" : "text-slate-500"}`} title="Saldo que o próprio banco informou no arquivo">
                    <dt>Banco em {dataBR(s.informadoData)}</dt><dd>{brl(s.informado)}{difBanco ? " ≠" : " ✓"}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2 text-slate-500"><dt>Pendentes</dt><dd className={s.pendentes ? "font-semibold text-amber-700" : ""}>{s.pendentes}</dd></div>
              </dl>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
          <option value="pendente">Pendentes</option><option value="sugestao">Com sugestão ({[...sugestoes.keys()].length})</option>
          <option value="divergente">Divergentes ({divergentes.size})</option><option value="conciliado">Conciliados</option>
          <option value="transferencia">Transferências</option><option value="ignorado">Ignorados</option><option value="todos">Todos</option>
        </select>
        <select className="input w-auto" value={contaSel} onChange={(e) => setContaSel(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">Mês <input type="month" className="input w-auto" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês do extrato" /></label>
        {podeEditar && sugeridasNaLista.length > 0 && (
          <Button onClick={() => aprovar(sugeridasNaLista.map((l) => l.id))} disabled={aprovando}><Check size={16} /> {aprovando ? "Aprovando…" : `Aprovar sugestões (${sugeridasNaLista.length})`}</Button>
        )}
        <span className="ml-auto text-sm text-slate-500">{lista.length} lançamento(s) · entradas {brl(lista.filter((l) => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0))} · saídas {brl(-lista.filter((l) => l.valor < 0).reduce((s, l) => s + Number(l.valor), 0))}</span>
      </div>

      <Table empty={!lista.length}
        head={<><th className="th">Data</th><th className="th">Descrição no banco</th><th className="th">Conta</th><th className="th">Situação</th><th className="th">Ligado a</th><th className="th text-right">Valor</th><th className="th" /></>}>
        {lista.map((l) => (
          <tr key={l.id}>
            <td className="td whitespace-nowrap">{dataBR(l.data)}</td>
            <td className="td">{l.descricao}{l.documento && <div className="text-xs text-slate-500">doc. {l.documento}</div>}</td>
            <td className="td whitespace-nowrap text-sm">{nomeConta(l.conta_bancaria_id)}</td>
            <td className="td">
              {l.status === "pendente" && sugestoes.has(l.id) ? <span className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">Sugestão</span>
                : l.status === "pendente" && divergentes.has(l.id) ? <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900" title="Nenhuma conta com este valor e data próxima: lance como receita/despesa, ligue a mano ou ignore">Divergente</span>
                : <Badge value={l.status} />}
            </td>
            <td className="td text-sm text-slate-600">
              {l.status === "pendente" && sugestoes.has(l.id) ? <span className="italic text-sky-800">→ {sugestoes.get(l.id)!.rotulo}</span> : vinculo(l)}
            </td>
            <td className={`td whitespace-nowrap text-right font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td>
            <td className="td whitespace-nowrap text-right">
              {podeEditar && l.status === "pendente" && sugestoes.has(l.id) && <Button variant="secondary" className="mr-1" disabled={aprovando} onClick={() => aprovar([l.id])}><Check size={15} /> Aprovar</Button>}
              {podeEditar && l.status === "pendente" && <Button variant={sugestoes.has(l.id) ? "ghost" : "primary"} onClick={() => setTratar(l)}><Link2 size={15} /> {sugestoes.has(l.id) ? "Outra" : "Conciliar"}</Button>}
              {podeEditar && l.status !== "pendente" && <Button variant="ghost" title="Desfazer" onClick={() => setDesfazer(l)}><Undo2 size={15} /></Button>}
            </td>
          </tr>
        ))}
      </Table>

      {editConta && <ContaBancariaModal conta={editConta} onClose={() => setEditConta(null)} />}
      {importar && <ImportarModal bancos={bancos.filter((b) => b.ativo)} contaInicial={contaSel} onClose={() => setImportar(false)} />}
      {tratar && <TratarModal lanc={tratar} bancos={contasTodas} receber={receber} pagar={pagar} lancamentos={lancamentos} onClose={() => setTratar(null)} />}
      {desfazer && <DesfazerModal lanc={desfazer} onClose={() => setDesfazer(null)} />}
    </div>
  );
}

/* --------------------------------- Conta bancária --------------------------------- */

function ContaBancariaModal({ conta, onClose }: { conta: Partial<ContaBancaria>; onClose: () => void }) {
  const [c, setC] = useState(conta);
  const save = useSave("contas_bancarias");
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(limpar({ ...c, saldo_inicial: Number(c.saldo_inicial || 0) }));
      notify("Conta salva");
      onClose();
    } catch (err) { notifyError(err); }
  }
  return (
    <Modal open onClose={onClose} title={c.id ? "Editar conta bancária" : "Nova conta bancária"}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><CampoUnidade value={c.unidade_id ?? null} onChange={(v) => setC({ ...c, unidade_id: v ?? undefined })} label="Unidade (CNPJ dono da conta)" /></div>
        <Field label="Banco">
          <select className="input" value={c.banco} onChange={(e) => setC({ ...c, banco: e.target.value, tipo: e.target.value === "caixa" ? "caixa" : e.target.value === "infinitepay" ? "pagamentos" : c.tipo })}>
            {Object.entries(BANCOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Nome (como aparece no ERP)"><input className="input" value={c.nome ?? ""} onChange={(e) => setC({ ...c, nome: e.target.value })} required placeholder="Ex.: Unicred SC" /></Field>
        <Field label="Agência"><input className="input" value={c.agencia ?? ""} onChange={(e) => setC({ ...c, agencia: e.target.value })} /></Field>
        <Field label="Conta"><input className="input" value={c.numero ?? ""} onChange={(e) => setC({ ...c, numero: e.target.value })} placeholder="ajuda a reconhecer o arquivo OFX" /></Field>
        <Field label="Saldo inicial"><input className="input" type="number" step="0.01" value={c.saldo_inicial ?? 0} onChange={(e) => setC({ ...c, saldo_inicial: Number(e.target.value) })} /></Field>
        <Field label="Saldo em (data)"><input className="input" type="date" value={c.saldo_inicial_data ?? ""} onChange={(e) => setC({ ...c, saldo_inicial_data: e.target.value })} required /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">O saldo inicial é o saldo do banco no fim do dia anterior ao primeiro lançamento que você vai importar.</p>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-5 w-5" checked={c.ativo ?? true} onChange={(e) => setC({ ...c, ativo: e.target.checked })} /> Conta ativa</label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending || !c.unidade_id}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------ Importar ------------------------------------ */

function ImportarModal({ bancos, contaInicial, onClose }: { bancos: ContaBancaria[]; contaInicial: string; onClose: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [res, setRes] = useState<ResultadoExtrato | null>(null);
  const [mapa, setMapa] = useState<MapaCsv | null>(null);
  const [conta, setConta] = useState(contaInicial || bancos[0]?.id || "");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();
  const linhas: LinhaExtrato[] = res?.csv && mapa ? linhasCsv(res.csv.registros, mapa) : res?.linhas ?? [];

  async function escolher(f: File | null) {
    setArquivo(f); setRes(null); setMapa(null);
    if (!f) return;
    try {
      const r = await lerExtrato(f);
      setRes(r);
      if (r.csv) setMapa(r.csv.mapa);
      // reconhece a conta pelo número que vem no OFX
      const n = digitos(r.conta);
      const achou = n && bancos.find((b) => digitos(b.numero) && (n.endsWith(digitos(b.numero)) || digitos(b.numero).endsWith(n)));
      if (achou) setConta(achou.id);
      else if (/infinite/i.test(f.name)) setConta(bancos.find((b) => b.banco === "infinitepay")?.id ?? conta);
      else if (/nu(bank)?[_-]/i.test(f.name)) setConta(bancos.find((b) => b.banco === "nubank")?.id ?? conta);
    } catch (e) { notifyError(e); }
  }

  async function enviar() {
    if (!res || !linhas.length) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("importar_extrato", {
        p_conta: conta, p_arquivo: arquivo?.name ?? null, p_formato: res.formato, p_linhas: linhas,
        p_saldo_final: res.saldoFinal ?? null, p_saldo_data: res.saldoData ?? null,
      });
      if (error) throw error;
      notify(`${data.novas} lançamento(s) novos${data.repetidas ? `, ${data.repetidas} já importados antes` : ""}; ${data.conciliadas} conciliado(s) automaticamente`);
      invalidate("extrato_lancamentos", "extrato_importacoes", "contas_receber", "contas_pagar", "auditoria");
      onClose();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const colunas = res?.csv?.cabecalho ?? [];
  const sel = (rotulo: string, chave: Exclude<keyof MapaCsv, "descricao">) => (
    <Field label={rotulo}>
      <select className="input" value={mapa?.[chave] ?? -1} onChange={(e) => setMapa({ ...mapa!, [chave]: Number(e.target.value) })}>
        <option value={-1}>—</option>
        {colunas.map((c, i) => <option key={i} value={i}>{c || `coluna ${i + 1}`}</option>)}
      </select>
    </Field>
  );
  const entradas = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const saidas = linhas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  const datas = linhas.map((l) => l.data).sort();

  return (
    <Modal open onClose={onClose} title="Importar extrato bancário" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Arquivo do banco (.ofx ou .csv)">
            <input className="input" type="file" accept=".ofx,.OFX,.csv,.CSV,.txt" onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Conta">
            <select className="input" value={conta} onChange={(e) => setConta(e.target.value)}>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome} ({BANCOS[b.banco] ?? b.banco})</option>)}
            </select>
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          <b>Unicred:</b> extrato → exportar → OFX (Money). <b>Nubank:</b> extrato → exportar → OFX. <b>InfinitePay:</b> extrato → baixar planilha (CSV).
          Pode importar o mesmo período de novo: o que já entrou é ignorado.
        </p>

        {res?.csv && mapa && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-sm font-semibold">Colunas da planilha <span className="font-normal text-slate-500">(confira; o ERP tentou adivinhar)</span></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {sel("Data", "data")}{sel("Valor (com sinal)", "valor")}{sel("Entradas", "entrada")}{sel("Saídas", "saida")}{sel("Tipo (crédito/débito)", "tipo")}
            </div>
            <Field label="Descrição (uma ou mais colunas)" className="mt-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {colunas.map((c, i) => (
                  <label key={i} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={mapa.descricao.includes(i)} onChange={(e) => setMapa({ ...mapa, descricao: e.target.checked ? [...mapa.descricao, i] : mapa.descricao.filter((x) => x !== i) })} />
                    {c || `coluna ${i + 1}`}
                  </label>
                ))}
              </div>
            </Field>
          </div>
        )}

        {res && (
          linhas.length ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-slate-500">Lançamentos</div><b>{linhas.length}</b></div>
                <div><div className="text-xs text-slate-500">Período</div><b>{dataBR(datas[0])} a {dataBR(datas[datas.length - 1])}</b></div>
                <div><div className="text-xs text-slate-500">Entradas / saídas</div><b className="text-emerald-700">{brl(entradas)}</b> / <b className="text-red-600">{brl(-saidas)}</b></div>
                {res.saldoFinal != null && <div><div className="text-xs text-slate-500">Saldo do banco em {dataBR(res.saldoData)}</div><b>{brl(res.saldoFinal)}</b></div>}
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {linhas.slice(0, 50).map((l) => (
                      <tr key={l.identificador}><td className="whitespace-nowrap px-3 py-1.5">{dataBR(l.data)}</td><td className="px-3 py-1.5">{l.descricao}</td>
                        <td className={`whitespace-nowrap px-3 py-1.5 text-right ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className="text-sm text-red-600">Não encontrei lançamentos neste arquivo. {res.csv ? "Confira as colunas de data e valor acima." : "Confira se é o extrato em OFX."}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={!linhas.length || !conta || ocupado}><FileUp size={16} /> {ocupado ? "Importando…" : `Importar ${linhas.length || ""} lançamento(s)`}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------- Tratar uma linha pendente do extrato ------------------------- */

const palavras = (s: string) => new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));

function TratarModal({ lanc, bancos, receber, pagar, lancamentos, onClose }: {
  lanc: Lancamento; bancos: ContaBancaria[]; receber: Conta[]; pagar: Conta[]; lancamentos: Lancamento[]; onClose: () => void;
}) {
  const entrada = lanc.valor > 0;
  const unidade = bancos.find((b) => b.id === lanc.conta_bancaria_id)?.unidade_id;
  const [modo, setModo] = useState<"conta" | "lancar" | "transferencia" | "ignorar">("conta");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState(entrada ? "outras receitas" : "tarifas bancárias");
  const [descricao, setDescricao] = useState(lanc.descricao ?? "");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();

  const ligadas = new Set(lancamentos.filter((l) => l.status === "conciliado").map((l) => (entrada ? l.conta_receber_id : l.conta_pagar_id)));
  const pw = palavras(lanc.descricao ?? "");
  const candidatas = (entrada ? receber : pagar)
    .filter((c) => c.status !== "cancelado" && !ligadas.has(c.id) && (!unidade || c.unidade_id === unidade))
    .filter((c) => c.status === "aberto" || !c.conta_bancaria_id || c.conta_bancaria_id === lanc.conta_bancaria_id)
    .map((c) => {
      const valor = Number(c.status === "pago" ? c.valor_pago ?? c.valor : c.valor);
      const ref = c.status === "pago" ? c.data_pagamento ?? c.vencimento : c.vencimento;
      const dias = Math.abs((Date.parse(ref) - Date.parse(lanc.data)) / 864e5);
      const nome = `${c.descricao} ${c.cliente?.nome ?? ""} ${c.fornecedor?.nome ?? ""}`;
      const comuns = [...palavras(nome)].filter((w) => pw.has(w)).length;
      const pontos = (Math.abs(valor - Math.abs(lanc.valor)) < 0.01 ? 100 : 0) + Math.max(0, 30 - dias) + comuns * 15;
      return { c, valor, ref, pontos, nome };
    })
    // já baixadas: só as de até 30 dias da data do banco (as antigas não são deste lançamento)
    .filter((x) => x.c.status === "aberto" || Math.abs((Date.parse(x.ref) - Date.parse(lanc.data)) / 864e5) <= 30 || !!busca)
    .filter((x) => !busca || x.nome.toLowerCase().includes(busca.toLowerCase()) || String(x.valor).includes(busca.replace(",", ".")))
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 12);

  const pares = lancamentos.filter((l) => l.status === "pendente" && l.conta_bancaria_id !== lanc.conta_bancaria_id && Math.abs(Number(l.valor) + Number(lanc.valor)) < 0.01);

  async function rodar(fn: () => PromiseLike<{ error: any }>, ok: string) {
    setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) return notifyError(error);
    notify(ok);
    invalidate("extrato_lancamentos", "contas_receber", "contas_pagar", "auditoria");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Conciliar lançamento do banco" wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
        <div><div className="text-sm font-semibold text-fg">{lanc.descricao}</div><div className="text-xs text-slate-500">{dataBR(lanc.data)} · {bancos.find((b) => b.id === lanc.conta_bancaria_id)?.nome}</div></div>
        <div className={`text-lg font-bold ${entrada ? "text-emerald-700" : "text-red-600"}`}>{brl(lanc.valor)}</div>
      </div>
      <div className="mb-4 flex flex-wrap gap-1">
        {([["conta", entrada ? "É uma conta a receber" : "É uma conta a pagar", Link2], ["lancar", entrada ? "Lançar como receita" : "Lançar como despesa (tarifa, juros…)", Receipt],
          ["transferencia", "Transferência entre contas", ArrowLeftRight], ["ignorar", "Ignorar", Ban]] as const).map(([v, l, I]) => (
          <button key={v} type="button" onClick={() => setModo(v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${modo === v ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><I size={14} /> {l}</button>
        ))}
      </div>

      {modo === "conta" && (
        <div className="space-y-2">
          <input className="input" placeholder="Buscar por nome, descrição ou valor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {!candidatas.length && <p className="text-sm text-slate-500">Nenhuma conta {entrada ? "a receber" : "a pagar"} desta unidade encontrada. Use "Lançar como {entrada ? "receita" : "despesa"}".</p>}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {candidatas.map(({ c, valor, ref, pontos }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">{c.descricao}{pontos >= 100 && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">mesmo valor</span>}</div>
                  <div className="text-xs text-slate-500">{c.cliente?.nome ?? c.fornecedor?.nome ?? "—"} · {c.status === "pago" ? `baixada em ${dataBR(ref)}` : `vence ${dataBR(ref)}`}</div>
                </div>
                <div className="text-sm font-semibold">{brl(valor)}</div>
                <Button disabled={ocupado} onClick={() => rodar(() => supabase.rpc("conciliar_lancamento", { p_lanc: lanc.id, p_tipo: entrada ? "receber" : "pagar", p_conta: c.id }),
                  c.status === "aberto" ? "Conciliado e baixado com a data do banco" : "Conciliado")}><Check size={15} /> Ligar</Button>
              </li>
            ))}
          </ul>
          {candidatas.some(({ valor }) => Math.abs(valor - Math.abs(lanc.valor)) >= 0.01) && <p className="text-xs text-slate-500">Se o valor for diferente (juros, desconto), a baixa fica com o valor que entrou no banco.</p>}
        </div>
      )}

      {modo === "lancar" && (
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); rodar(() => supabase.rpc("lancar_do_extrato", { p_lanc: lanc.id, p_categoria: categoria, p_descricao: descricao }), `${entrada ? "Receita" : "Despesa"} lançada e conciliada`); }}>
          <Field label="Descrição"><input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} required /></Field>
          <CampoCategoria tipo={entrada ? "receita" : "despesa"} value={categoria} onChange={setCategoria} />
          <p className="text-xs text-slate-500 sm:col-span-2">Cria a conta já paga em {dataBR(lanc.data)}, nesta conta bancária, e entra no resultado (DRE).</p>
          <div className="flex justify-end sm:col-span-2"><Button disabled={ocupado}><Receipt size={15} /> Lançar</Button></div>
        </form>
      )}

      {modo === "transferencia" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Dinheiro que só mudou de conta (ex.: Unicred → Nubank). Não é receita nem despesa. Escolha a linha correspondente na outra conta:</p>
          {!pares.length && <p className="text-sm text-slate-500">Nenhuma linha pendente de {brl(-lanc.valor)} nas outras contas. Importe o extrato da outra conta primeiro.</p>}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {pares.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1 text-sm"><b>{bancos.find((b) => b.id === p.conta_bancaria_id)?.nome}</b> · {dataBR(p.data)} · {p.descricao}</div>
                <div className="text-sm font-semibold">{brl(p.valor)}</div>
                <Button disabled={ocupado} onClick={() => rodar(() => supabase.rpc("marcar_transferencia", { p_lanc: lanc.id, p_par: p.id }), "Transferência entre contas registrada")}><ArrowLeftRight size={15} /> Ligar</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modo === "ignorar" && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); rodar(() => supabase.rpc("ignorar_lancamento", { p_lanc: lanc.id, p_motivo: motivo }), "Lançamento ignorado"); }}>
          <p className="text-sm text-slate-600">Use só para o que não é receita nem despesa da empresa (aplicação e resgate, estorno do próprio banco). O motivo fica registrado.</p>
          <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} placeholder="Ex.: aplicação automática" /></Field>
          <div className="flex justify-end"><Button variant="secondary" disabled={ocupado}><Ban size={15} /> Ignorar</Button></div>
        </form>
      )}
    </Modal>
  );
}

function DesfazerModal({ lanc, onClose }: { lanc: Lancamento; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const invalidate = useInvalidate();
  async function confirmar(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("desfazer_conciliacao", { p_lanc: lanc.id, p_motivo: motivo });
    if (error) return notifyError(error);
    notify("Conciliação desfeita");
    invalidate("extrato_lancamentos", "contas_receber", "contas_pagar", "auditoria");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title="Desfazer conciliação">
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-sm text-slate-600">
          A linha de {brl(lanc.valor)} volta a ficar pendente.{lanc.baixou_conta && " Como a baixa da conta foi feita por esta conciliação, a conta volta a ficar em aberto."}
        </p>
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant="danger"><Undo2 size={15} /> Desfazer</Button>
        </div>
      </form>
    </Modal>
  );
}
