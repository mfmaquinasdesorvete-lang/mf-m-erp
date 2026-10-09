// Financeiro → Contas fixas: aluguel, salários, mensalidades, contratos de manutenção. O ERP lança cada conta
// sozinho com antecedência (entra no fluxo de caixa previsto); mudar o valor atualiza as próximas em aberto.
import { useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge, Button, Field, Modal, Table } from "@/components/ui";
import { CampoUnidade, EtiquetaUnidade, useUnidade } from "@/lib/unidade";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, rotuloCliente } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { Historico } from "@/components/Historico";
import { CampoCategoria, CampoRateio, rateioOk } from "./CategoriaRateio";
import type { Rateio } from "@/lib/dre";
import type { Cliente } from "@/lib/types";

type Fixa = {
  id: string; tipo: "pagar" | "receber"; descricao: string; fornecedor_id: string | null; cliente_id: string | null; categoria: string | null;
  rateio: Rateio; valor: number; dia_vencimento: number; frequencia: string; inicio: string; fim: string | null; antecedencia_dias: number;
  unidade_id: string | null; forma_pagamento: string | null; observacoes: string | null; ativo: boolean;
};
const FREQ: Record<string, { rotulo: string; meses: number }> = {
  mensal: { rotulo: "todo mês", meses: 1 }, bimestral: { rotulo: "a cada 2 meses", meses: 2 }, trimestral: { rotulo: "a cada 3 meses", meses: 3 },
  semestral: { rotulo: "a cada 6 meses", meses: 6 }, anual: { rotulo: "todo ano", meses: 12 },
};
// dia 31 = último dia de cada mês (30, 28 ou 29 em fevereiro)
const ULTIMO_DIA = 31;
const FORMAS_PAGAR: [string, string][] = [["pix", "Pix"], ["boleto", "Boleto"], ["transferencia", "Transferência (TED)"], ["debito_automatico", "Débito automático"], ["cartao", "Cartão"], ["dinheiro", "Dinheiro"]];
const FORMAS_RECEBER: [string, string][] = [["boleto", "Boleto"], ["pix", "Pix"], ["cartao", "Cartão"], ["transferencia", "Transferência"]];
const rotuloForma = (v: string | null) => [...FORMAS_PAGAR, ...FORMAS_RECEBER].find(([k]) => k === v)?.[1] ?? null;
const rotuloDia = (d: number) => (d === ULTIMO_DIA ? "último dia do mês" : `dia ${d}`);

/** Próximo vencimento a partir de hoje (respeitando início, fim e frequência). */
export function proximoVencimento(f: Pick<Fixa, "inicio" | "fim" | "dia_vencimento" | "frequencia" | "ativo">, dia: string) {
  if (!f.ativo) return null;
  const passo = FREQ[f.frequencia]?.meses ?? 1;
  let y = Number(f.inicio.slice(0, 4)), m = Number(f.inicio.slice(5, 7));
  for (let k = 0; k < 400; k++) {
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const v = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(f.dia_vencimento, ultimo)).padStart(2, "0")}`;
    if (f.fim && v > f.fim) return null;
    if (v >= dia && v >= f.inicio) return v;
    m += passo; while (m > 12) { m -= 12; y++; }
  }
  return null;
}

export function ContasFixas() {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { filtrar, padrao } = useUnidade();
  const { data: todas = [] } = useRows<Fixa>("contas_recorrentes", { order: "descricao", ascending: true });
  const fixas = filtrar(todas);
  const { data: fornecedores = [] } = useRows<{ id: string; nome: string; chave_pix?: string | null }>("fornecedores", { order: "nome", ascending: true });
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const [editando, setEditando] = useState<Partial<Fixa> | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();
  const dia = hoje();
  const nomeDe = (f: Fixa) => f.tipo === "pagar" ? fornecedores.find((x) => x.id === f.fornecedor_id)?.nome : clientes.find((x) => x.id === f.cliente_id)?.nome;
  const totais = useMemo(() => {
    const mensal = (f: Fixa) => (f.ativo ? Number(f.valor) / (FREQ[f.frequencia]?.meses ?? 1) : 0);
    return { pagar: fixas.filter((f) => f.tipo === "pagar").reduce((s, f) => s + mensal(f), 0), receber: fixas.filter((f) => f.tipo === "receber").reduce((s, f) => s + mensal(f), 0) };
  }, [fixas]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    if (!rateioOk(editando.rateio)) return notify("Os centros de custo precisam somar 100%", "erro");
    setOcupado(true);
    try {
      const { id, ...row } = editando;
      const dados = {
        ...row, valor: Number(row.valor), dia_vencimento: Number(row.dia_vencimento), antecedencia_dias: Number(row.antecedencia_dias ?? 45),
        fim: row.fim || null, fornecedor_id: row.tipo === "pagar" ? row.fornecedor_id || null : null, cliente_id: row.tipo === "receber" ? row.cliente_id || null : null,
        forma_pagamento: row.forma_pagamento || (row.tipo === "receber" ? "boleto" : null), observacoes: row.observacoes || null,
      };
      const { error } = id ? await supabase.from("contas_recorrentes").update(dados).eq("id", id) : await supabase.from("contas_recorrentes").insert(dados);
      if (error) throw error;
      notify(id ? "Conta fixa salva: as próximas contas em aberto foram atualizadas" : "Conta fixa criada: as próximas contas já foram lançadas");
      invalidate("contas_recorrentes", "contas_pagar", "contas_receber");
      setEditando(null);
    } catch (err) {
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }

  async function lancarAgora() {
    const { data, error } = await supabase.rpc("gerar_recorrentes");
    if (error) return notifyError(error);
    notify(data ? `${data} conta(s) lançada(s)` : "Nada novo para lançar: as contas fixas já estão em dia");
    invalidate("contas_pagar", "contas_receber");
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <p className="min-w-[16rem] flex-1 text-sm text-slate-600">
          O ERP lança cada conta fixa sozinho, com antecedência, e ela já entra no fluxo de caixa previsto.
          Por mês: <b className="text-red-700">{brl(totais.pagar)}</b> a pagar e <b className="text-emerald-700">{brl(totais.receber)}</b> a receber.
        </p>
        {podeEditar && <Button variant="secondary" onClick={lancarAgora}><RefreshCw size={16} /> Lançar o que falta</Button>}
        {podeEditar && <Button onClick={() => setEditando({ tipo: "pagar", frequencia: "mensal", dia_vencimento: 10, forma_pagamento: "pix", inicio: dia, antecedencia_dias: 45, ativo: true, rateio: [], unidade_id: padrao, categoria: "aluguel" })}><Plus size={16} /> Nova conta fixa</Button>}
      </div>
      <Table empty={!fixas.length}
        head={<><th className="th">Descrição</th><th className="th">Tipo</th><th className="th">Vencimento</th><th className="th">Próxima</th><th className="th text-right">Valor</th><th className="th" /></>}>
        {fixas.map((f) => {
          const prox = proximoVencimento(f, dia);
          return (
            <tr key={f.id} className={f.ativo ? "" : "opacity-60"}>
              <td className="td"><div className="font-medium">{f.descricao}<EtiquetaUnidade id={f.unidade_id} /></div><div className="text-xs text-slate-500">{[nomeDe(f), f.categoria, rotuloForma(f.forma_pagamento)].filter(Boolean).join(" · ")}</div></td>
              <td className="td"><span className={`rounded border px-1.5 py-px text-xs font-semibold ${f.tipo === "pagar" ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{f.tipo === "pagar" ? "A pagar" : "A receber"}</span></td>
              <td className="td whitespace-nowrap">{rotuloDia(f.dia_vencimento)}, {FREQ[f.frequencia]?.rotulo}{f.fim && <div className="text-xs text-slate-500">até {dataBR(f.fim)}</div>}</td>
              <td className="td whitespace-nowrap">{f.ativo ? (prox ? dataBR(prox) : "encerrada") : <Badge value="desativada" />}</td>
              <td className="td text-right font-semibold">{brl(f.valor)}</td>
              <td className="td text-right"><Button variant="secondary" onClick={() => setEditando({ ...f })}>{podeEditar ? <><Pencil size={15} /> Editar</> : "Ver"}</Button></td>
            </tr>
          );
        })}
      </Table>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.id ? "Conta fixa" : "Nova conta fixa"}>
        {editando && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <fieldset disabled={!podeEditar} className="contents">
              <Field label="Tipo">
                <select className="input" value={editando.tipo} disabled={!!editando.id}
                  onChange={(e) => setEditando({ ...editando, tipo: e.target.value as Fixa["tipo"], categoria: e.target.value === "pagar" ? "aluguel" : "assistência técnica" })}>
                  <option value="pagar">A pagar (aluguel, salário, advogado, mensalidade…)</option>
                  <option value="receber">A receber (contrato, mensalidade de cliente…)</option>
                </select>
              </Field>
              <div><CampoUnidade value={editando.unidade_id ?? null} onChange={(v) => setEditando({ ...editando, unidade_id: v })} label="Unidade" /></div>
              <Field label="Descrição" className="sm:col-span-2"><input className="input" value={editando.descricao ?? ""} required minLength={3}
                onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} placeholder={editando.tipo === "pagar" ? "Ex.: Aluguel do galpão" : "Ex.: Contrato de manutenção"} /></Field>
              {editando.tipo === "pagar" ? (
                <Field label="Fornecedor (opcional)" className="sm:col-span-2">
                  <select className="input" value={editando.fornecedor_id ?? ""} onChange={(e) => setEditando({ ...editando, fornecedor_id: e.target.value })}>
                    <option value="">—</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Cliente" className="sm:col-span-2">
                  <select className="input" value={editando.cliente_id ?? ""} required onChange={(e) => setEditando({ ...editando, cliente_id: e.target.value })}>
                    <option value="">Escolha…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{rotuloCliente(c)}</option>)}
                  </select>
                </Field>
              )}
              <CampoCategoria tipo={editando.tipo === "pagar" ? "despesa" : "receita"} value={editando.categoria} onChange={(v) => setEditando({ ...editando, categoria: v })} />
              <Field label="Valor"><input className="input" type="number" step="0.01" min={0.01} required value={editando.valor ?? ""} onChange={(e) => setEditando({ ...editando, valor: Number(e.target.value) })} /></Field>
              <Field label="Dia do vencimento">
                <input className="input" type="number" min={1} max={31} required value={editando.dia_vencimento ?? ""} disabled={editando.dia_vencimento === ULTIMO_DIA}
                  onChange={(e) => setEditando({ ...editando, dia_vencimento: Number(e.target.value) })} />
                <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={editando.dia_vencimento === ULTIMO_DIA} onChange={(e) => setEditando({ ...editando, dia_vencimento: e.target.checked ? ULTIMO_DIA : 10 })} />
                  Último dia do mês (30, 31 ou 28/29 em fevereiro)
                </label>
              </Field>
              <Field label="Repete">
                <select className="input" value={editando.frequencia} onChange={(e) => setEditando({ ...editando, frequencia: e.target.value })}>
                  {Object.entries(FREQ).map(([v, f]) => <option key={v} value={v}>{f.rotulo}</option>)}
                </select>
              </Field>
              <Field label="Começa em"><input className="input" type="date" required value={editando.inicio ?? ""} onChange={(e) => setEditando({ ...editando, inicio: e.target.value })} /></Field>
              <Field label="Termina em (opcional)"><input className="input" type="date" value={editando.fim ?? ""} min={editando.inicio} onChange={(e) => setEditando({ ...editando, fim: e.target.value })} /></Field>
              <Field label="Lançar com quantos dias de antecedência"><input className="input" type="number" min={0} max={120} value={editando.antecedencia_dias ?? 45} onChange={(e) => setEditando({ ...editando, antecedencia_dias: Number(e.target.value) })} /></Field>
              <Field label="Forma de pagamento">
                <select className="input" value={editando.forma_pagamento ?? (editando.tipo === "receber" ? "boleto" : "")} onChange={(e) => setEditando({ ...editando, forma_pagamento: e.target.value })}>
                  {editando.tipo === "pagar" && <option value="">—</option>}
                  {(editando.tipo === "pagar" ? FORMAS_PAGAR : FORMAS_RECEBER).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
                {editando.tipo === "pagar" && editando.forma_pagamento === "pix" && (() => {
                  const chave = fornecedores.find((x) => x.id === editando.fornecedor_id)?.chave_pix;
                  return <span className="mt-1 block text-xs text-slate-600">{chave ? <>Chave Pix: <b>{chave}</b> (vai na conta lançada)</> : editando.fornecedor_id ? "Este fornecedor ainda não tem chave Pix: coloque em Cadastros → Fornecedores." : "Escolha o fornecedor para a chave Pix ir junto."}</span>;
                })()}
              </Field>
              <div className="sm:col-span-2"><CampoRateio value={editando.rateio} onChange={(v) => setEditando({ ...editando, rateio: v })} /></div>
              <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={editando.observacoes ?? ""} onChange={(e) => setEditando({ ...editando, observacoes: e.target.value })} /></Field>
              {editando.id && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={editando.ativo ?? true} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} />
                  Ativa (desmarcar cancela as próximas contas em aberto)
                </label>
              )}
            </fieldset>
            {editando.inicio && editando.dia_vencimento && (
              <p className="flex items-center gap-1.5 text-sm text-slate-600 sm:col-span-2"><CalendarClock size={15} />
                Próximo vencimento: {(() => { const p = proximoVencimento({ inicio: editando.inicio!, fim: editando.fim || null, dia_vencimento: Number(editando.dia_vencimento), frequencia: editando.frequencia ?? "mensal", ativo: editando.ativo ?? true }, dia); return p ? dataBR(p) : "—"; })()}
              </p>
            )}
            {editando.id && <div className="sm:col-span-2"><Historico tabela="contas_recorrentes" id={editando.id} /></div>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>{podeEditar ? "Cancelar" : "Fechar"}</Button>
              {podeEditar && <Button disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar"}</Button>}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
