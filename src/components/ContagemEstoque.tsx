// Produtos e estoque → Contagem de estoque (inventário cíclico).
// Escolhe um pedaço do estoque (categoria, local, tipo), conta "às cegas" (o saldo do sistema fica escondido),
// depois vê as divergências, justifica cada uma e só então o ERP ajusta o saldo, com o motivo no histórico.
import { useMemo, useState } from "react";
import { ClipboardList, Eye, EyeOff, Printer } from "lucide-react";
import { Badge, Button, Card, Field, Modal, Table } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR } from "@/lib/format";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import type { Produto } from "@/lib/types";

type Contagem = {
  id: string; numero: number; unidade_id: string; escopo: string | null; status: "aberta" | "concluida" | "cancelada";
  criada_nome: string | null; concluida_nome: string | null; concluida_em: string | null; ajustes: number | null; created_at: string;
};
type ItemContagem = { contagem_id: string; produto_id: string; saldo_sistema: number; contado: number | null; justificativa: string | null };
const TIPOS: Record<string, string> = { maquina: "Máquinas", peca: "Peças", acessorio: "Acessórios", insumo: "Insumos" };

export function ContagemEstoque({ produtos, podeEditar }: { produtos: Produto[]; podeEditar: boolean }) {
  const { data: contagens = [] } = useRows<Contagem>("contagens_estoque");
  const { nome } = useUnidade();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const aberta = contagens.find((c) => c.id === abertaId);
  if (aberta) return <FolhaContagem contagem={aberta} produtos={produtos} podeEditar={podeEditar} onVoltar={() => setAbertaId(null)} />;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <p className="min-w-[14rem] flex-1 text-sm text-slate-600">
          Conte uma parte do estoque por vez (uma categoria, uma prateleira). A contagem é <b>às cegas</b>: o saldo do sistema só aparece
          depois de contar. Cada diferença precisa de justificativa, e o ajuste entra no histórico do produto com o número da contagem.
        </p>
        {podeEditar && <Button onClick={() => setNova(true)}><ClipboardList size={16} /> Nova contagem</Button>}
      </Card>
      <Table empty={!contagens.length}
        head={<><th className="th">Nº</th><th className="th">Unidade</th><th className="th">O que foi contado</th><th className="th">Situação</th><th className="th">Aberta</th><th className="th">Concluída</th><th className="th" /></>}>
        {contagens.map((c) => (
          <tr key={c.id}>
            <td className="td font-semibold">#{c.numero}</td>
            <td className="td">{nome(c.unidade_id)}</td>
            <td className="td text-sm">{c.escopo ?? "—"}</td>
            <td className="td"><Badge value={c.status} />{c.status === "concluida" && <div className="text-xs text-slate-500">{c.ajustes ?? 0} ajuste(s)</div>}</td>
            <td className="td text-sm">{dataBR(c.created_at)}<div className="text-xs text-slate-500">{c.criada_nome}</div></td>
            <td className="td text-sm">{c.concluida_em ? dataBR(c.concluida_em) : "—"}<div className="text-xs text-slate-500">{c.concluida_nome}</div></td>
            <td className="td text-right"><Button variant="secondary" onClick={() => setAbertaId(c.id)}>{c.status === "aberta" ? "Contar" : "Ver"}</Button></td>
          </tr>
        ))}
      </Table>
      {nova && <NovaContagem produtos={produtos} onClose={() => setNova(false)} onAberta={(id) => { setNova(false); setAbertaId(id); }} />}
    </div>
  );
}

function NovaContagem({ produtos, onClose, onAberta }: { produtos: Produto[]; onClose: () => void; onAberta: (id: string) => void }) {
  const { padrao, unidades } = useUnidade();
  const [unidadeId, setUnidadeId] = useState<string | null>(padrao ?? unidades[0]?.id ?? null);
  const [f, setF] = useState({ tipo: "", categoria: "", local: "", comEstoque: false });
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const ativos = produtos.filter((p) => p.ativo !== false && !p.kit);
  const categorias = [...new Set(ativos.map((p) => p.categoria).filter(Boolean))].sort() as string[];
  const locais = [...new Set(ativos.map((p) => p.localizacao).filter(Boolean))].sort() as string[];
  const escolhidos = ativos.filter((p) => (!f.tipo || p.tipo === f.tipo) && (!f.categoria || p.categoria === f.categoria) && (!f.local || p.localizacao === f.local)
    && (!f.comEstoque || Number(saldos.find((s) => s.produto_id === p.id && s.unidade_id === unidadeId)?.quantidade ?? 0) > 0));
  const escopo = [f.tipo && TIPOS[f.tipo], f.categoria && `categoria ${f.categoria}`, f.local && `local ${f.local}`, f.comEstoque && "com saldo"].filter(Boolean).join(" · ") || "Todos os produtos";

  async function abrir() {
    if (!unidadeId || !escolhidos.length) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("abrir_contagem", { p_unidade: unidadeId, p_produtos: escolhidos.map((p) => p.id), p_escopo: escopo });
    setOcupado(false);
    if (error) return notifyError(error);
    invalidar("contagens_estoque", "contagem_itens");
    notify(`Contagem aberta com ${escolhidos.length} produto(s)`);
    onAberta(data as string);
  }

  const sel = (k: "tipo" | "categoria" | "local", label: string, opcoes: [string, string][]) => (
    <Field label={label}>
      <select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">Todos</option>{opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
  return (
    <Modal open onClose={onClose} title="Nova contagem de estoque">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><CampoUnidade value={unidadeId} onChange={setUnidadeId} label="Unidade (estoque contado)" /></div>
        {sel("tipo", "Tipo", Object.entries(TIPOS))}
        {sel("categoria", "Categoria", categorias.map((c) => [c, c]))}
        {sel("local", "Localização", locais.map((l) => [l, l]))}
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.comEstoque} onChange={(e) => setF({ ...f, comEstoque: e.target.checked })} /> Só itens com saldo</label>
        <p className="text-sm text-slate-600 sm:col-span-2"><b>{escolhidos.length}</b> produto(s) para contar: {escopo}.</p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={abrir} disabled={ocupado || !escolhidos.length || !unidadeId}>{ocupado ? "Abrindo…" : "Abrir contagem"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function FolhaContagem({ contagem: c, produtos, podeEditar, onVoltar }: { contagem: Contagem; produtos: Produto[]; podeEditar: boolean; onVoltar: () => void }) {
  const { nome } = useUnidade();
  const invalidar = useInvalidate();
  const { data: todos = [] } = useRows<ItemContagem>("contagem_itens", { order: "produto_id" });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const [revelar, setRevelar] = useState(c.status !== "aberta");
  const [ocupado, setOcupado] = useState(false);
  const editavel = podeEditar && c.status === "aberta";
  const prod = (id: string) => produtos.find((p) => p.id === id);
  const saldoAgora = (id: string) => Number(saldos.find((s) => s.produto_id === id && s.unidade_id === c.unidade_id)?.quantidade ?? 0);
  const itens = useMemo(() => todos.filter((i) => i.contagem_id === c.id).sort((a, b) =>
    (prod(a.produto_id)?.localizacao ?? "~").localeCompare(prod(b.produto_id)?.localizacao ?? "~", "pt-BR")
    || (prod(a.produto_id)?.descricao ?? "").localeCompare(prod(b.produto_id)?.descricao ?? "", "pt-BR")), // eslint-disable-next-line react-hooks/exhaustive-deps
  [todos, c.id, produtos]);
  const contados = itens.filter((i) => i.contado != null).length;
  // concluída: a diferença foi contra o saldo da época (o ajuste já entrou); aberta: contra o saldo de agora
  const diferenca = (i: ItemContagem) => i.contado == null ? null : Number(i.contado) - (c.status === "aberta" ? saldoAgora(i.produto_id) : Number(i.saldo_sistema));
  const divergentes = itens.filter((i) => (diferenca(i) ?? 0) !== 0);
  const semJustificativa = divergentes.filter((i) => !i.justificativa);

  async function gravar(i: ItemContagem, patch: Partial<ItemContagem>) {
    const { error } = await supabase.from("contagem_itens").update(patch).eq("contagem_id", c.id).eq("produto_id", i.produto_id);
    if (error) return notifyError(error);
    invalidar("contagem_itens");
  }
  async function concluir() {
    if (semJustificativa.length) { setRevelar(true); return notify(`Justifique ${semJustificativa.length} divergência(s) antes de concluir`, "erro"); }
    if (!confirm(`Concluir a contagem nº ${c.numero}? ${divergentes.length} saldo(s) serão ajustados para o que foi contado.`)) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("concluir_contagem", { p_contagem: c.id });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(`Contagem concluída: ${(data as any)?.ajustes ?? 0} ajuste(s) de saldo`);
    invalidar("contagens_estoque", "contagem_itens", "produtos", "estoque_unidade", "estoque_movimentos");
  }
  async function cancelar() {
    if (!confirm("Cancelar esta contagem? Nenhum saldo é alterado.")) return;
    const { error } = await supabase.rpc("cancelar_contagem", { p_contagem: c.id });
    if (error) return notifyError(error);
    invalidar("contagens_estoque");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onVoltar}>← Contagens</Button>
        <div className="min-w-[12rem] flex-1">
          <div className="font-semibold">Contagem nº {c.numero} · {nome(c.unidade_id)} <Badge value={c.status} /></div>
          <div className="text-sm text-slate-500">{c.escopo} · {contados} de {itens.length} contados{revelar ? ` · ${divergentes.length} divergência(s)` : ""}</div>
        </div>
        <Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir folha</Button>
        {c.status === "aberta" && <Button variant="secondary" onClick={() => setRevelar(!revelar)}>{revelar ? <><EyeOff size={16} /> Esconder saldo</> : <><Eye size={16} /> Ver divergências</>}</Button>}
        {editavel && <Button variant="ghost" className="!text-red-600" onClick={cancelar}>Cancelar contagem</Button>}
        {editavel && <Button onClick={concluir} disabled={ocupado || !contados}>{ocupado ? "Concluindo…" : "Concluir e ajustar saldos"}</Button>}
      </div>
      {c.status === "aberta" && !revelar && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Conte e anote a quantidade física. O saldo do sistema fica escondido para não influenciar a contagem; deixe em branco o que não foi contado.</p>
      )}
      <Table empty={!itens.length}
        head={<><th className="th">Local</th><th className="th">Produto</th><th className="th w-32">Contado</th>{revelar && <><th className="th text-right">Sistema</th><th className="th text-right">Diferença</th><th className="th">Justificativa</th></>}</>}>
        {itens.map((i) => {
          const p = prod(i.produto_id);
          const dif = diferenca(i);
          return (
            <tr key={i.produto_id}>
              <td className="td text-sm">{p?.localizacao ?? "—"}</td>
              <td className="td"><div className="font-medium">{p?.descricao}</div><div className="text-xs text-slate-500">{[p?.sku, p?.unidade].filter(Boolean).join(" · ")}</div></td>
              <td className="td">
                <input className="input w-28" type="number" step="any" min={0} disabled={!editavel} key={`${i.produto_id}-${i.contado}`}
                  defaultValue={i.contado ?? ""} aria-label={`Contado de ${p?.descricao}`}
                  onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (i.contado == null ? null : Number(i.contado))) gravar(i, { contado: v }); }} />
              </td>
              {revelar && <>
                <td className="td text-right">{c.status === "aberta" ? saldoAgora(i.produto_id) : Number(i.saldo_sistema)}</td>
                <td className={`td text-right font-semibold ${dif ? (dif < 0 ? "text-red-600" : "text-amber-700") : "text-emerald-700"}`}>{dif == null ? "—" : dif > 0 ? `+${dif}` : dif}</td>
                <td className="td">
                  {dif ? (
                    <input className={`input text-sm ${!i.justificativa && editavel ? "border-red-300" : ""}`} disabled={!editavel} key={`${i.produto_id}-${i.justificativa}`}
                      defaultValue={i.justificativa ?? ""} placeholder="Ex.: peça usada na OS 120 sem baixa"
                      onBlur={(e) => e.target.value.trim() !== (i.justificativa ?? "") && gravar(i, { justificativa: e.target.value })} />
                  ) : <span className="text-xs text-slate-400">—</span>}
                </td>
              </>}
            </tr>
          );
        })}
      </Table>
      {revelar && c.status === "aberta" && <p className="text-xs text-slate-500">Antes de justificar, investigue: entrada não lançada, baixa de OS esquecida, item guardado em outro local. O ajuste só acontece ao concluir.</p>}
    </div>
  );
}
