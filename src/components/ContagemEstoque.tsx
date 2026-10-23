// Produtos e estoque → Contagem de estoque (inventário cíclico).
// Escolhe um pedaço do estoque (categoria, local, tipo) ou a contagem do dia (poucos itens sorteados pela curva ABC),
// conta "às cegas" (o saldo do sistema fica escondido), com dupla contagem opcional (duas pessoas; só vale quando bate),
// depois vê as divergências, justifica cada uma e só então o ERP ajusta o saldo, com o motivo no histórico.
// No alto, a acuracidade (itens que já estavam certos) e o giro do estoque.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, ClipboardList, Eye, EyeOff, Flag, Gauge, PackageX, Printer, RefreshCw, Users } from "lucide-react";
import { Badge, Button, Card, Field, Modal, Table } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { acuracidade, giroEstoque, partesPartida, situacaoDupla, sorteioDoDia, type ItemInventario } from "@/lib/inventario";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import type { Produto } from "@/lib/types";
import { confirmar } from "@/components/Dialogos";

type Contagem = {
  id: string; numero: number; unidade_id: string; escopo: string | null; status: "aberta" | "concluida" | "cancelada";
  criada_nome: string | null; concluida_nome: string | null; concluida_em: string | null; ajustes: number | null; created_at: string;
  dupla?: boolean | null; contados?: number | null;
};
type ItemContagem = { contagem_id: string; produto_id: string; saldo_sistema: number; contado: number | null; contado2?: number | null; justificativa: string | null };
type Saldo = { produto_id: string; unidade_id: string; quantidade: number };
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
      <PainelInventario produtos={produtos} contagens={contagens} podeEditar={podeEditar} onAberta={setAbertaId} />
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <p className="min-w-56 flex-1 text-sm text-slate-600">
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
            <td className="td"><Badge value={c.status} />{c.status === "concluida" && <div className="text-xs text-slate-500">{c.ajustes ?? 0} {pl(c.ajustes ?? 0, "ajuste", "ajustes")}</div>}</td>
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
  const [dupla, setDupla] = useState(true);
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
    const { data, error } = await supabase.rpc("abrir_contagem_v2", { p_unidade: unidadeId, p_produtos: escolhidos.map((p) => p.id), p_escopo: escopo, p_dupla: dupla });
    setOcupado(false);
    if (error) return notifyError(error);
    invalidar("contagens_estoque", "contagem_itens");
    notify(`Contagem aberta com ${escolhidos.length} ${pl(escolhidos.length, "produto", "produtos")}`);
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
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={dupla} onChange={(e) => setDupla(e.target.checked)} />
          <span><b>Dupla contagem</b>: duas pessoas contam sem ver a outra; o saldo só é ajustado quando as duas batem.</span></label>
        {escolhidos.length > 60 && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900 sm:col-span-2">Contagem grande demora e acaba ficando aberta. Prefira a <b>contagem do dia</b> (poucos itens) ou uma categoria por vez.</p>}
        <p className="text-sm text-slate-600 sm:col-span-2"><b>{escolhidos.length}</b> {pl(escolhidos.length, "produto", "produtos")} para contar: {escopo}.</p>
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
  // dupla contagem: cada pessoa vê só a própria coluna enquanto conta
  const [vez, setVez] = useState<1 | 2>(1);
  const campo: "contado" | "contado2" = vez === 1 ? "contado" : "contado2";
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
  const recontar = c.dupla ? itens.filter((i) => i.contado != null && situacaoDupla(i.contado, i.contado2 ?? null) !== "bate") : [];

  async function gravar(i: ItemContagem, patch: Partial<ItemContagem>) {
    const { error } = await supabase.from("contagem_itens").update(patch).eq("contagem_id", c.id).eq("produto_id", i.produto_id);
    if (error) return notifyError(error);
    invalidar("contagem_itens");
  }
  // anota a prateleira na hora de contar: a próxima folha já sai na ordem do caminho
  async function gravarLocal(produtoId: string, local: string) {
    const { error } = await supabase.from("produtos").update({ localizacao: local || null }).eq("id", produtoId);
    if (error) return notifyError(error);
    invalidar("produtos");
  }
  async function concluir() {
    if (recontar.length) { setRevelar(true); return notify(`Dupla contagem: ${recontar.length} ${pl(recontar.length, "item precisa", "itens precisam")} da 2ª contagem igual à 1ª (${recontar.slice(0, 3).map((i) => prod(i.produto_id)?.descricao).join(", ")})`, "erro"); }
    if (semJustificativa.length) { setRevelar(true); return notify(`Justifique ${semJustificativa.length} ${pl(semJustificativa.length, "divergência", "divergências")} antes de concluir`, "erro"); }
    if (!(await confirmar(`Concluir a contagem nº ${c.numero}? ${divergentes.length} ${pl(divergentes.length, "saldo", "saldos")} serão ajustados para o que foi contado.`))) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("concluir_contagem", { p_contagem: c.id });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(`Contagem concluída: ${(data as any)?.ajustes ?? 0} ${pl((data as any)?.ajustes ?? 0, "ajuste", "ajustes")} de saldo`);
    invalidar("contagens_estoque", "contagem_itens", "produtos", "estoque_unidade", "estoque_movimentos");
  }
  // folha para contar no papel: abre numa janela própria já pronta para imprimir (ou salvar em PDF)
  function imprimirFolha() {
    const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
    const linhas = itens.map((i) => { const p = prod(i.produto_id);
      return `<tr><td>${esc(p?.localizacao ?? "")}</td><td><b>${esc(p?.descricao)}</b><br><small>${esc([p?.sku, p?.unidade].filter(Boolean).join(" · "))}</small></td><td class="q">${i.contado != null ? esc(i.contado) : ""}</td></tr>`; }).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contagem ${c.numero}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111} h1{font-size:18px;margin:0 0 4px} p{margin:0 0 12px;font-size:12px;color:#444}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #999;padding:6px;vertical-align:top} th{background:#eee;text-align:left}
      td.q{width:110px;height:26px} small{color:#555} @page{margin:12mm}</style></head><body>
      <h1>Contagem de estoque nº ${c.numero} · ${esc(nome(c.unidade_id))}</h1>
      <p>${esc(c.escopo)} · ${itens.length} itens · Data: ____/____/______ · Quem contou: ______________________</p>
      <table><thead><tr><th>Local</th><th>Produto</th><th>Contado</th></tr></thead><tbody>${linhas}</tbody></table>
      <script>window.onload=function(){window.print()}<\/script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return notify("O navegador bloqueou a janela de impressão: libere as janelas deste site e tente de novo", "erro");
    w.document.open(); w.document.write(html); w.document.close();
  }
  async function cancelar() {
    if (!(await confirmar("Cancelar esta contagem? Nenhum saldo é alterado."))) return;
    const { error } = await supabase.rpc("cancelar_contagem", { p_contagem: c.id });
    if (error) return notifyError(error);
    invalidar("contagens_estoque");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onVoltar}>← Contagens</Button>
        <div className="min-w-48 flex-1">
          <div className="font-semibold">Contagem nº {c.numero} · {nome(c.unidade_id)} <Badge value={c.status} /></div>
          <div className="text-sm text-slate-500">{c.escopo} · {contados} de {itens.length} contados{c.dupla ? ` · dupla contagem${recontar.length ? ` (${recontar.length} a conferir)` : ""}` : ""}{revelar ? ` · ${divergentes.length} ${pl(divergentes.length, "divergência", "divergências")}` : ""}</div>
        </div>
        <Button variant="secondary" onClick={imprimirFolha}><Printer size={16} /> Imprimir folha</Button>
        {c.status === "aberta" && <Button variant="secondary" onClick={() => setRevelar(!revelar)}>{revelar ? <><EyeOff size={16} /> Esconder saldo</> : <><Eye size={16} /> Ver divergências</>}</Button>}
        {editavel && <Button variant="ghost" className="!text-red-600" onClick={cancelar}>Cancelar contagem</Button>}
        {editavel && <Button onClick={concluir} disabled={ocupado || !contados}>{ocupado ? "Concluindo…" : "Concluir e ajustar saldos"}</Button>}
      </div>
      {c.dupla && editavel && !revelar && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900" role="radiogroup" aria-label="Quem está contando">
          <b>Quem está contando agora?</b>
          {([1, 2] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={vez === v} onClick={() => setVez(v)}
              className={`rounded-lg px-3 py-1 font-semibold ${vez === v ? "bg-violet-600 text-white" : "bg-white text-violet-700"}`}>{v}ª pessoa</button>
          ))}
          <span className="text-xs">Cada uma conta sem ver a outra. Só ajusta o saldo quando as duas batem.</span>
        </div>
      )}
      {c.status === "aberta" && !revelar && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Conte e anote a quantidade física. O saldo do sistema fica escondido para não influenciar a contagem; deixe em branco o que não foi contado.</p>
      )}
      <Table empty={!itens.length}
        head={<><th className="th">Local</th><th className="th">Produto</th><th className="th w-32">{c.dupla && !revelar ? `Contado (${vez}ª)` : c.dupla ? "1ª" : "Contado"}</th>{c.dupla && revelar && <><th className="th w-32">2ª</th><th className="th">Dupla</th></>}{revelar && <><th className="th text-right">Sistema</th><th className="th text-right">Diferença</th><th className="th">Justificativa</th></>}</>}>
        {itens.map((i) => {
          const p = prod(i.produto_id);
          const dif = diferenca(i);
          return (
            <tr key={i.produto_id}>
              <td className="td text-sm">{editavel && p ? (
                <input className="input w-28 text-sm" key={`${p.id}-${p.localizacao ?? ""}`} defaultValue={p.localizacao ?? ""} placeholder="Ex.: A1-2" aria-label={`Local de ${p.descricao}`}
                  onBlur={(e) => e.target.value.trim() !== (p.localizacao ?? "") && gravarLocal(p.id, e.target.value.trim())} />
              ) : (p?.localizacao ?? "—")}</td>
              <td className="td"><div className="font-medium">{p?.descricao}</div><div className="text-xs text-slate-500">{[p?.sku, p?.unidade].filter(Boolean).join(" · ")}</div></td>
              {((c.dupla && !revelar ? [campo] : c.dupla ? ["contado", "contado2"] : ["contado"]) as ("contado" | "contado2")[]).map((k) => (
                <td key={k} className="td">
                  <input className="input w-28" type="number" step="any" min={0} disabled={!editavel} key={`${i.produto_id}-${k}-${i[k]}`}
                    defaultValue={i[k] ?? ""} aria-label={`${k === "contado2" ? "2ª contagem" : "Contado"} de ${p?.descricao}`}
                    onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (i[k] == null ? null : Number(i[k]))) gravar(i, { [k]: v }); }} />
                </td>
              ))}
              {c.dupla && revelar && <td className="td text-xs font-semibold">{({ falta1: <span className="text-slate-400">—</span>, falta2: <span className="text-amber-700">falta a 2ª</span>,
                bate: <span className="text-emerald-700">✓ bate</span>, recontar: <span className="text-red-600">✗ reconte</span> } as const)[situacaoDupla(i.contado, i.contado2 ?? null)]}</td>}
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

/** Acuracidade (90 dias), giro do ano, valor parado e a contagem do dia (sorteio pela curva ABC). */
function PainelInventario({ produtos, contagens, podeEditar, onAberta }: { produtos: Produto[]; contagens: Contagem[]; podeEditar: boolean; onAberta: (id: string) => void }) {
  const { padrao, unidades, nome } = useUnidade();
  const unidadeId = padrao ?? unidades[0]?.id ?? null;
  const invalidar = useInvalidate();
  const [abrindo, setAbrindo] = useState(false);
  const [verParados, setVerParados] = useState(false);
  const { data: saldos = [] } = useRows<Saldo>("estoque_unidade", { order: "produto_id" });
  const { data: itensCont = [] } = useRows<ItemContagem>("contagem_itens", { order: "produto_id" });
  const desde12 = new Date(Date.now() - 365 * 864e5).toISOString();
  const { data: vendas = [] } = useQuery({
    queryKey: ["pedido_itens", "giro", desde12.slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedido_itens").select("produto_id, quantidade, pedido:pedidos!inner(status, created_at)")
        .in("pedido.status", ["aprovado", "faturado", "entregue"]).gte("pedido.created_at", desde12);
      if (error) throw error;
      return (data ?? []) as { produto_id: string; quantidade: number }[];
    },
  });

  const r = useMemo(() => {
    const vendido = new Map<string, number>();
    for (const v of vendas) if (v.produto_id) vendido.set(v.produto_id, (vendido.get(v.produto_id) ?? 0) + Number(v.quantidade || 0));
    // última vez que cada produto foi contado (contagens concluídas desta unidade)
    const concl = new Map(contagens.filter((c) => c.status === "concluida" && c.unidade_id === unidadeId).map((c) => [c.id, c.concluida_em ?? c.created_at]));
    const ultima = new Map<string, string>();
    for (const i of itensCont) {
      const d = concl.get(i.contagem_id);
      if (d && i.contado != null && (!ultima.has(i.produto_id) || ultima.get(i.produto_id)! < d)) ultima.set(i.produto_id, d);
    }
    const lista: ItemInventario[] = produtos.filter((p) => p.ativo !== false && !p.kit).map((p) => ({
      id: p.id, custo: Number(p.preco_custo) || 0, vendido12m: vendido.get(p.id) ?? 0, ultimaContagem: ultima.get(p.id) ?? null,
      saldo: Number(saldos.find((s) => s.produto_id === p.id && s.unidade_id === unidadeId)?.quantidade ?? 0),
    }));
    const fisicos = produtos.filter((p) => p.ativo !== false && !p.kit && (p.tipo as string) !== "servico");
    const partes = partesPartida(fisicos, new Set(ultima.keys()));
    const totalP = partes.reduce((s, x) => s + x.ids.length, 0);
    const feitosP = partes.reduce((s, x) => s + x.contados, 0);
    return {
      partes, totalP, feitosP, pctPartida: totalP ? Math.round((feitosP / totalP) * 100) : 100,
      sorteio: sorteioDoDia(lista, hoje(), 8),
      acur: acuracidade(contagens.filter((c) => c.unidade_id === unidadeId), new Date(Date.now() - 90 * 864e5).toISOString()),
      giro: giroEstoque(lista),
      nunca: lista.filter((i) => i.saldo > 0 && !i.ultimaContagem).length,
    };
  }, [produtos, saldos, itensCont, contagens, vendas, unidadeId]);

  const prod = (id: string) => produtos.find((p) => p.id === id);
  // enquanto não houver uma primeira contagem de quase tudo, os números do sistema não são confiáveis
  const emPartida = r.pctPartida < 90;
  const abertaDaParte = (nomeParte: string) => contagens.find((c) => c.status === "aberta" && c.unidade_id === unidadeId && c.escopo === `Partida: ${nomeParte}`);
  async function contarParte(nomeParte: string, ids: string[]) {
    const ja = abertaDaParte(nomeParte);
    if (ja) return onAberta(ja.id);
    if (!unidadeId) return;
    setAbrindo(true);
    const { data, error } = await supabase.rpc("abrir_contagem_v2", { p_unidade: unidadeId, p_produtos: ids, p_escopo: `Partida: ${nomeParte}`, p_dupla: true });
    setAbrindo(false);
    if (error) return notifyError(error);
    invalidar("contagens_estoque", "contagem_itens");
    onAberta(data as string);
  }
  const jaAbertaHoje = contagens.find((c) => c.status === "aberta" && c.escopo?.startsWith(`Contagem do dia ${dataBR(hoje())}`) && c.unidade_id === unidadeId);

  async function abrirDoDia() {
    if (!unidadeId || !r.sorteio.length) return;
    setAbrindo(true);
    const { data, error } = await supabase.rpc("abrir_contagem_v2", { p_unidade: unidadeId, p_produtos: r.sorteio.map((x) => x.id),
      p_escopo: `Contagem do dia ${dataBR(hoje())} (${r.sorteio.length} itens)`, p_dupla: true });
    setAbrindo(false);
    if (error) return notifyError(error);
    invalidar("contagens_estoque", "contagem_itens");
    onAberta(data as string);
  }

  const a = r.acur.pct;
  const corA = a == null ? "text-slate-500" : a >= 98 ? "text-emerald-600" : a >= 90 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador icone={<Gauge size={16} />} titulo="Acuracidade (90 dias)" valor={a == null ? "—" : `${a.toLocaleString("pt-BR")}%`} cor={corA}
          detalhe={r.acur.contados ? `${r.acur.certos} de ${r.acur.contados} itens já estavam certos · meta 98%` : "conclua uma contagem para medir · meta 98%"} />
        <Indicador icone={<RefreshCw size={16} />} titulo={emPartida ? "Giro no ano (estimado)" : "Giro no ano"} valor={r.giro.giro == null ? "—" : `${r.giro.giro.toLocaleString("pt-BR")}×`} cor="text-sky-600"
          detalhe={r.giro.diasDeEstoque != null ? `estoque dura uns ${r.giro.diasDeEstoque} dias · ${brl(r.giro.valorEstoque)} a custo` : `${brl(r.giro.valorEstoque)} a custo`} />
        <button type="button" onClick={() => setVerParados(!verParados)} className="text-left">
          <Indicador icone={<PackageX size={16} />} titulo={emPartida ? "Parado (estimado)" : "Parado (sem venda 12 meses)"} valor={brl(r.giro.valorParado)} cor={r.giro.parados ? "text-amber-600" : "text-emerald-600"}
            detalhe={`${r.giro.parados} ${pl(r.giro.parados, "item", "itens")} · toque para ver`} />
        </button>
        <Indicador icone={<ClipboardList size={16} />} titulo="Com saldo e nunca contados" valor={String(r.nunca)} cor={r.nunca ? "text-violet-600" : "text-emerald-600"} detalhe={`na unidade ${nome(unidadeId ?? "")}`} />
      </div>

      {verParados && r.giro.paradosIds.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-bold">Itens parados: plano de desova</h3>
          <p className="mb-2 text-xs text-slate-500">Sem venda há 12 meses. Ideias: promoção, kit com peça que gira, devolução ao fornecedor ou venda no Mercado Livre.</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {r.giro.paradosIds.slice(0, 15).map((id) => { const p = prod(id); const s = Number(saldos.find((x) => x.produto_id === id && x.unidade_id === unidadeId)?.quantidade ?? 0);
              return <li key={id} className="flex justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{p?.descricao}</span><span className="shrink-0 text-slate-600">{s} un · {brl(s * (Number(p?.preco_custo) || 0))}</span></li>; })}
          </ul>
        </Card>
      )}

      {emPartida && (
        <Card className="order-first space-y-3 p-4">
          <div>
            <h3 className="flex items-center gap-1.5 font-bold"><Flag size={18} className="text-brand" /> Contagem de partida · {r.feitosP} de {r.totalP} itens ({r.pctPartida}%)</h3>
            <p className="text-xs text-slate-500">A primeira contagem de verdade do estoque, uma parte por dia, com dupla contagem. Anote também o local de cada item (prateleira).
              Os números de giro e parado só ficam certos depois dela. Ao chegar em 90%, o ERP passa para a contagem do dia.</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${r.pctPartida}%` }} /></div>
          </div>
          <ul className="divide-y divide-slate-100">
            {r.partes.map((x) => {
              const feita = x.contados >= x.ids.length;
              const aberta = abertaDaParte(x.nome);
              return (
                <li key={x.chave} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">{feita ? <CheckCircle2 size={15} className="mr-1 inline text-emerald-600" /> : null}<b>{x.nome}</b>
                    <span className="text-slate-500"> · {x.contados}/{x.ids.length}</span>{aberta && <span className="ml-1 rounded bg-amber-100 px-1.5 text-2xs font-semibold text-amber-800">em contagem</span>}</span>
                  {podeEditar && !feita && <Button variant={aberta ? "primary" : "secondary"} disabled={abrindo} onClick={() => contarParte(x.nome, x.ids)}>{aberta ? "Continuar" : "Contar"}</Button>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {!emPartida && <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 font-bold"><CalendarCheck size={18} className="text-emerald-600" /> Contagem do dia · {r.sorteio.length} {pl(r.sorteio.length, "item", "itens")}</h3>
            <p className="text-xs text-slate-500">Conte logo cedo, leva uns 15 minutos. Os que valem mais (curva A) voltam a cada 30 dias, B a cada 60 e C a cada 120. Com dupla contagem.</p>
          </div>
          {podeEditar && (jaAbertaHoje
            ? <Button variant="secondary" onClick={() => onAberta(jaAbertaHoje.id)}>Continuar a de hoje</Button>
            : <Button onClick={abrirDoDia} disabled={abrindo || !r.sorteio.length}><Users size={16} /> {abrindo ? "Abrindo…" : "Contar agora"}</Button>)}
        </div>
        {r.sorteio.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {r.sorteio.map((x) => <li key={x.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs"><b className={x.curva === "A" ? "text-red-600" : x.curva === "B" ? "text-amber-600" : "text-slate-500"}>{x.curva}</b> {prod(x.id)?.descricao}</li>)}
          </ul>
        ) : <p className="text-sm text-emerald-700">Tudo contado dentro do prazo. 🎉</p>}
      </Card>}
    </div>
  );
}

function Indicador({ icone, titulo, valor, detalhe, cor }: { icone: React.ReactNode; titulo: string; valor: string; detalhe: string; cor: string }) {
  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-surface p-4">
      <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${cor}`}>{icone} {titulo}</div>
      <div className={`mt-1.5 text-2xl font-extrabold ${cor}`}>{valor}</div>
      <div className="mt-1 text-xs text-slate-500">{detalhe}</div>
    </div>
  );
}
