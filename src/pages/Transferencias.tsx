// Transferências de mercadoria entre a matriz (SC) e a filial (SP):
// rascunho → enviada (sai do estoque da origem, emite NF-e) → recebida (entra no destino).
import { useMemo, useState } from "react";
import { ArrowRight, ExternalLink, FileText, Plus, Send, Trash2, Truck, X } from "lucide-react";
import { Badge, Button, CelulaAbrir, Field, Modal, PageHeader, Table } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import type { Produto } from "@/lib/types";

type Item = { id?: string; produto_id: string; descricao: string; quantidade: number; custo_unitario: number; numero_serie?: string | null };
type Transf = {
  id: string; numero: number; origem_id: string; destino_id: string; status: string; observacoes: string | null;
  enviada_em: string | null; recebida_em: string | null; created_at: string; itens?: Item[];
};
type Nota = { id: string; transferencia_id: string | null; status: string; numero: string | null; danfe_url: string | null; mensagem: string | null; created_at: string };
type Saldo = { produto_id: string; unidade_id: string; quantidade: number };

const ROTULO: Record<string, string> = { rascunho: "rascunho", enviada: "em trânsito", recebida: "recebida", cancelada: "cancelada" };

export default function Transferencias() {
  const { pode } = usePerfil();
  const { unidades, atual, nome } = useUnidade();
  const { data: lista = [], isLoading } = useRows<Transf>("transferencias", { select: "*, itens:transferencia_itens(*)" });
  const { data: notas = [] } = useRows<Nota>("notas_fiscais", { key: ["transf"] });
  const [aberta, setAberta] = useState<Partial<Transf> | null>(null);
  const podeEditar = pode("editar_producao") || pode("movimentar_estoque");

  const visiveis = atual ? lista.filter((t) => t.origem_id === atual || t.destino_id === atual) : lista;
  const nova = () => {
    const origem = atual ?? unidades.find((u) => u.matriz)?.id ?? unidades[0]?.id;
    setAberta({ origem_id: origem, destino_id: unidades.find((u) => u.id !== origem)?.id, status: "rascunho", itens: [] });
  };

  return (
    <div>
      <PageHeader title="Transferências SC ↔ SP" subtitle="Máquinas e peças que vão de uma unidade para a outra, com NF-e de transferência."
        actions={podeEditar && unidades.length > 1 && <Button onClick={nova}><Plus size={16} /> Nova transferência</Button>} />
      {unidades.length < 2 && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Cadastre a segunda unidade em Configurações → Unidades.</p>}
      <Table empty={!isLoading && !visiveis.length}
        head={<><th className="th">Nº</th><th className="th">De → para</th><th className="th">Itens</th><th className="th">Situação</th><th className="th">NF-e</th><th className="th">Data</th><th className="th" /></>}>
        {visiveis.map((t) => {
          const nf = notas.filter((n) => !!n.transferencia_id && n.transferencia_id === t.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return (
            <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta({ ...t, itens: t.itens ?? [] })}>
              <td className="td font-bold text-fg">#{t.numero}</td>
              <td className="td"><span className="inline-flex items-center gap-1.5 font-semibold">{nome(t.origem_id)} <ArrowRight size={14} className="text-slate-400" /> {nome(t.destino_id)}</span></td>
              <td className="td text-slate-600">{(t.itens ?? []).map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ")}</td>
              <td className="td"><Badge value={t.status === "enviada" ? "em_transito" : t.status} /></td>
              <td className="td">{nf ? <Badge value={nf.status} /> : <span className="text-slate-400">—</span>}</td>
              <td className="td num">{dataBR(t.enviada_em ?? t.created_at)}</td>
              <CelulaAbrir texto="Ver / editar" />
            </tr>
          );
        })}
      </Table>
      {aberta && <TransfModal inicial={aberta} todasNotas={notas} onClose={() => setAberta(null)} podeEditar={podeEditar} />}
    </div>
  );
}

function TransfModal({ inicial, todasNotas, onClose, podeEditar }: { inicial: Partial<Transf>; todasNotas: Nota[]; onClose: () => void; podeEditar: boolean }) {
  const { unidades, nome } = useUnidade();
  const invalidar = useInvalidate();
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: saldos = [] } = useRows<Saldo>("estoque_unidade", { order: "produto_id" });
  const [t, setT] = useState(inicial);
  const [itens, setItens] = useState<Item[]>(inicial.itens ?? []);
  const [ocupado, setOcupado] = useState(false);
  const rascunho = !t.id || t.status === "rascunho";
  const editavel = rascunho && podeEditar;
  const saldo = (produto: string, unidade?: string) => Number(saldos.find((s) => s.produto_id === produto && s.unidade_id === unidade)?.quantidade ?? 0);
  const total = useMemo(() => itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.custo_unitario), 0), [itens]);
  const notas = t.id ? todasNotas.filter((n) => n.transferencia_id === t.id) : [];
  const ultimaNota = [...notas].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  function adicionar(id: string) {
    const p = produtos.find((x) => x.id === id);
    if (!p || itens.some((i) => i.produto_id === id)) return;
    setItens([...itens, { produto_id: p.id, descricao: p.descricao, quantidade: 1, custo_unitario: Number(p.preco_custo) || 0 }]);
  }

  async function salvar(): Promise<string | null> {
    if (t.origem_id === t.destino_id) { notify("Origem e destino precisam ser diferentes", "erro"); return null; }
    if (!itens.length) { notify("Adicione ao menos um item", "erro"); return null; }
    const dados = { origem_id: t.origem_id, destino_id: t.destino_id, observacoes: t.observacoes || null };
    const { data, error } = t.id
      ? await supabase.from("transferencias").update(dados).eq("id", t.id).select("id, numero").single()
      : await supabase.from("transferencias").insert(dados).select("id, numero").single();
    if (error) throw error;
    await supabase.from("transferencia_itens").delete().eq("transferencia_id", data.id);
    const { error: e2 } = await supabase.from("transferencia_itens").insert(itens.map((i) => ({
      transferencia_id: data.id, produto_id: i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade),
      custo_unitario: Number(i.custo_unitario) || 0, numero_serie: i.numero_serie || null,
    })));
    if (e2) throw e2;
    setT({ ...t, id: data.id, numero: data.numero, status: t.status ?? "rascunho" });
    invalidar("transferencias");
    return data.id;
  }

  async function acao(fn: () => Promise<void>) {
    setOcupado(true);
    try { await fn(); } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const rpc = (nomeRpc: string, id: string, msg: string, status: string) => acao(async () => {
    const { error } = await supabase.rpc(nomeRpc, { p_transf: id });
    if (error) throw error;
    setT((x) => ({ ...x, status }));
    invalidar("transferencias", "produtos", "estoque_unidade");
    notify(msg);
  });

  const emitirNota = () => acao(async () => {
    if (!(await confirmarSeTeste())) throw new Error("Emissão cancelada: ambiente de teste");
    const r = await callFunction("nfe-emitir", { transferencia_id: t.id });
    invalidar("notas_fiscais");
    notify(r?.ok === false ? "A nota voltou com erro: veja a mensagem" : "NF-e de transferência enviada para a SEFAZ");
  });

  return (
    <Modal open wide onClose={onClose} title={t.id ? `Transferência #${t.numero}` : "Nova transferência"}>
      <div className="space-y-4">
        {t.id && <div className="flex flex-wrap items-center gap-2"><Badge value={t.status === "enviada" ? "em_transito" : t.status} />
          {ultimaNota && <span className="text-sm text-slate-500">NF-e {ultimaNota.numero ?? ""} <Badge value={ultimaNota.status} /></span>}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="Sai de">
            <select className="input" value={t.origem_id ?? ""} disabled={!editavel} onChange={(e) => setT({ ...t, origem_id: e.target.value })}>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
          <ArrowRight className="mx-auto hidden text-slate-400 sm:block" />
          <Field label="Vai para">
            <select className="input" value={t.destino_id ?? ""} disabled={!editavel} onChange={(e) => setT({ ...t, destino_id: e.target.value })}>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
        </div>

        {editavel && (
          <Field label="Adicionar produto">
            <select className="input" value="" onChange={(e) => adicionar(e.target.value)}>
              <option value="">Escolha a máquina ou peça…</option>
              {produtos.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.descricao} — tem {saldo(p.id, t.origem_id)} em {nome(t.origem_id)}</option>
              ))}
            </select>
          </Field>
        )}

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {itens.map((i, k) => {
            const tem = saldo(i.produto_id, t.origem_id);
            const falta = rascunho && Number(i.quantidade) > tem;
            return (
              <li key={i.produto_id} className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[1fr_90px_120px_140px_auto] sm:items-center">
                <div className="col-span-2 sm:col-span-1">
                  <div className="font-semibold text-fg">{i.descricao}</div>
                  <div className={`text-xs ${falta ? "font-semibold text-red-600" : "text-slate-500"}`}>tem {tem} em {nome(t.origem_id)}{falta ? " · não dá para enviar" : ""}</div>
                </div>
                <Field label="Qtd"><input className="input" type="number" min={1} step="any" value={i.quantidade} disabled={!editavel}
                  onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value) } : x)))} /></Field>
                <Field label="Custo un. (NF-e)"><input className="input" type="number" min={0} step="0.01" value={i.custo_unitario} disabled={!editavel}
                  onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, custo_unitario: Number(e.target.value) } : x)))} /></Field>
                <Field label="Nº de série"><input className="input" value={i.numero_serie ?? ""} disabled={!editavel}
                  onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, numero_serie: e.target.value } : x)))} /></Field>
                {editavel && <Button type="button" variant="ghost" className="!text-red-600 sm:mt-5" onClick={() => setItens(itens.filter((_, j) => j !== k))} aria-label="Remover"><Trash2 size={16} /></Button>}
              </li>
            );
          })}
          {!itens.length && <li className="p-6 text-center text-sm text-slate-500">Nenhum item ainda.</li>}
        </ul>
        <div className="text-right text-sm text-slate-600">Valor da nota (custo): <b className="num text-fg">{brl(total)}</b></div>

        <Field label="Observações (saem na nota)">
          <textarea className="input" rows={2} value={t.observacoes ?? ""} disabled={!editavel} onChange={(e) => setT({ ...t, observacoes: e.target.value })} />
        </Field>

        {ultimaNota?.mensagem && ultimaNota.status === "erro" && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ultimaNota.mensagem}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {t.id && podeEditar && ["rascunho", "enviada"].includes(t.status ?? "") && (
            <Button type="button" variant="ghost" className="!text-red-600 mr-auto" disabled={ocupado}
              onClick={() => confirm("Cancelar a transferência? Se já saiu, volta para o estoque da origem.") && rpc("cancelar_transferencia", t.id!, "Transferência cancelada", "cancelada")}>
              <X size={16} /> Cancelar
            </Button>
          )}
          {editavel && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => acao(async () => { if (await salvar()) notify("Rascunho salvo"); })}>Salvar rascunho</Button>}
          {editavel && (
            <Button type="button" disabled={ocupado} onClick={() => acao(async () => {
              const id = await salvar();
              if (!id) return;
              const { error } = await supabase.rpc("enviar_transferencia", { p_transf: id });
              if (error) throw error;
              setT((x) => ({ ...x, id, status: "enviada" }));
              invalidar("transferencias", "produtos", "estoque_unidade");
              notify("Enviada: saiu do estoque de " + nome(t.origem_id) + ". Agora emita a NF-e.");
            })}><Send size={16} /> Enviar (baixa da origem)</Button>
          )}
          {t.status && ["enviada", "recebida"].includes(t.status) && podeEditar && (!ultimaNota || ["erro", "cancelada"].includes(ultimaNota.status)) && (
            <Button type="button" variant="secondary" disabled={ocupado} onClick={emitirNota}><FileText size={16} /> Emitir NF-e de transferência</Button>
          )}
          {ultimaNota?.danfe_url && <a href={ultimaNota.danfe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><ExternalLink size={15} /> DANFE</a>}
          {t.status === "enviada" && podeEditar && (
            <Button type="button" disabled={ocupado} onClick={() => rpc("receber_transferencia", t.id!, "Recebida: entrou no estoque de " + nome(t.destino_id), "recebida")}>
              <Truck size={16} /> Chegou em {nome(t.destino_id)}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
