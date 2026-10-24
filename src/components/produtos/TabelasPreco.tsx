// Tabelas de preço: Marketplace, Revenda, Atacado… Cada tabela é um % sobre o preço de venda (com arredondamento)
// e pode ter preço fixo em produtos específicos. O cliente pode ter a sua tabela; o pedido usa a tabela escolhida.
import { useMemo, useState, type FormEvent } from "react";
import { lerValor } from "@/lib/auditoriaBusca";
import { FileDown, Pencil, Plus, Tags } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import type { Produto } from "@/lib/types";
import { ARREDONDAMENTOS, CANAIS_TABELA, ajusteTexto, precoNaTabela, type PrecoFixo, type TabelaPreco } from "@/lib/tabelasPreco";

/** valor digitado ("45,90", "45.90", "1.500"); inválido vira NaN para a validação recusar */
const num = (s: string) => lerValor(s) ?? NaN;

export function TabelasPreco({ produtos, podeEditar }: { produtos: Produto[]; podeEditar: boolean }) {
  const { data: tabelas = [] } = useRows<TabelaPreco>("tabelas_preco", { order: "nome", ascending: true });
  const { data: fixos = [] } = useRows<PrecoFixo>("tabela_preco_itens");
  const { data: clientes = [] } = useRows<{ id: string; tabela_preco_id: string | null }>("clientes", { select: "id, tabela_preco_id" });
  const [editando, setEditando] = useState<Partial<TabelaPreco> | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const tabela = tabelas.find((t) => t.id === aberta) ?? null;

  if (tabela) return <DetalheTabela tabela={tabela} produtos={produtos} fixos={fixos} podeEditar={podeEditar} onVoltar={() => setAberta(null)} onEditar={() => setEditando(tabela)} editando={editando} fecharEdicao={() => setEditando(null)} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-600">
          Uma tabela por canal: <b>Marketplace</b> (ex.: +20% para cobrir as taxas), <b>Revenda</b> (ex.: −15%)… O preço sai do preço de venda de cada produto,
          e você pode fixar o preço de produtos específicos. No pedido, escolha a tabela (ou ela vem do cadastro do cliente).
        </p>
        {podeEditar && <Button onClick={() => setEditando({ ajuste_percentual: 0, arredondamento: "centavos", ativo: true, canal: "revenda" })}><Plus size={16} aria-hidden /> Nova tabela</Button>}
      </div>
      {!tabelas.length ? (
        <Card className="p-8 text-center text-sm text-slate-500">Nenhuma tabela ainda. Crie, por exemplo, "Marketplace" com +20% e "Revenda" com −15%.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tabelas.map((t) => {
            const nFixos = fixos.filter((f) => f.tabela_id === t.id).length;
            const nClientes = clientes.filter((c) => c.tabela_preco_id === t.id).length;
            return (
              <Card key={t.id} className={`p-4 ${t.ativo ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-bold"><Tags size={16} aria-hidden /> {t.nome}</div>
                    <div className="text-xs text-slate-600">{CANAIS_TABELA.find((c) => c.value === t.canal)?.label ?? "sem canal"}{t.ativo ? "" : " · inativa"}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${Number(t.ajuste_percentual) < 0 ? "bg-emerald-100 text-emerald-800" : Number(t.ajuste_percentual) > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{ajusteTexto(t.ajuste_percentual)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{nFixos ? `${nFixos} ${nFixos === 1 ? "produto com preço fixo" : "produtos com preço fixo"}` : "sem preços fixos"} · {nClientes} {nClientes === 1 ? "cliente" : "clientes"}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => setAberta(t.id)}>Ver preços</Button>
                  {podeEditar && <Button variant="ghost" onClick={() => setEditando(t)} aria-label={`Editar ${t.nome}`}><Pencil size={15} aria-hidden /> Editar</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editando && <TabelaForm tabela={editando} onClose={() => setEditando(null)} onCriada={(id) => { setEditando(null); setAberta(id); }} />}
    </div>
  );
}

function TabelaForm({ tabela, onClose, onCriada }: { tabela: Partial<TabelaPreco>; onClose: () => void; onCriada: (id: string) => void }) {
  const invalidar = useInvalidate();
  const [f, setF] = useState({ nome: tabela.nome ?? "", canal: tabela.canal ?? "", ajuste: tabela.ajuste_percentual != null ? String(tabela.ajuste_percentual).replace(".", ",") : "0",
    arredondamento: tabela.arredondamento ?? "centavos", observacoes: tabela.observacoes ?? "", ativo: tabela.ativo ?? true });
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const ajuste = num(f.ajuste.replace("+", "").replace("−", "-"));
    if (!Number.isFinite(ajuste) || ajuste < -90 || ajuste > 500) return notifyError(new Error("o ajuste precisa ficar entre −90% e +500%"));
    setSalvando(true);
    const row = { nome: f.nome.trim(), canal: f.canal || null, ajuste_percentual: ajuste, arredondamento: f.arredondamento, observacoes: f.observacoes.trim() || null, ativo: f.ativo, updated_at: new Date().toISOString() };
    const r = tabela.id ? await supabase.from("tabelas_preco").update(row).eq("id", tabela.id).select("id").single()
      : await supabase.from("tabelas_preco").insert(row).select("id").single();
    setSalvando(false);
    if (r.error) return notifyError(/duplicate|unique/i.test(r.error.message) ? new Error("já existe uma tabela com esse nome") : r.error);
    notify("Tabela salva"); invalidar("tabelas_preco");
    if (tabela.id) onClose(); else onCriada(r.data.id);
  }
  return (
    <Modal open onClose={onClose} title={tabela.id ? `Editar ${tabela.nome}` : "Nova tabela de preço"}>
      <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome *" className="sm:col-span-2"><input className="input" required maxLength={60} value={f.nome} placeholder="ex.: Marketplace, Revenda" onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
        <Field label="Canal">
          <select className="input" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
            <option value="">—</option>{CANAIS_TABELA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Ajuste sobre o preço de venda (%)">
          <input className="input text-right" inputMode="decimal" value={f.ajuste} onChange={(e) => setF({ ...f, ajuste: e.target.value.replace(/[^\d,.+−-]/g, "").slice(0, 7) })} />
        </Field>
        <p className="-mt-1 text-xs text-slate-600 sm:col-span-2">Positivo aumenta (Marketplace: +20 para cobrir taxas); negativo dá desconto (Revenda: −15). Um produto de R$ 100,00 fica R$ {(100 * (1 + (num(f.ajuste.replace("−", "-")) || 0) / 100)).toFixed(2).replace(".", ",")}.</p>
        <Field label="Arredondamento" className="sm:col-span-2">
          <select className="input" value={f.arredondamento} onChange={(e) => setF({ ...f, arredondamento: e.target.value as TabelaPreco["arredondamento"] })}>
            {ARREDONDAMENTOS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Observações" className="sm:col-span-2"><input className="input" value={f.observacoes} maxLength={300} placeholder="ex.: pedido mínimo R$ 1.000 para revenda" onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Field>
        {tabela.id && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Tabela ativa</label>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DetalheTabela({ tabela, produtos, fixos, podeEditar, onVoltar, onEditar, editando, fecharEdicao }: {
  tabela: TabelaPreco; produtos: Produto[]; fixos: PrecoFixo[]; podeEditar: boolean; onVoltar: () => void; onEditar: () => void;
  editando: Partial<TabelaPreco> | null; fecharEdicao: () => void;
}) {
  const invalidar = useInvalidate();
  const [busca, setBusca] = useState("");
  const [soFixos, setSoFixos] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const vendaveis = useMemo(() => produtos.filter((p) => p.ativo !== false && (p as any).vendavel !== false && Number(p.preco_venda) > 0), [produtos]);
  const fixosDaTabela = fixos.filter((f) => f.tabela_id === tabela.id);
  const termo = busca.trim().toLowerCase();
  const lista = vendaveis
    .filter((p) => !soFixos || fixosDaTabela.some((f) => f.produto_id === p.id))
    .filter((p) => !termo || `${p.descricao} ${p.sku ?? ""} ${p.categoria ?? ""}`.toLowerCase().includes(termo))
    .slice(0, 300);

  async function salvarFixo(p: Produto) {
    const txt = rascunho[p.id];
    if (txt === undefined) return;
    const atual = fixosDaTabela.find((f) => f.produto_id === p.id);
    const valor = txt.trim() === "" ? null : num(txt);
    if (valor != null && !(valor >= 0)) return notifyError(new Error("preço inválido"));
    const { error } = valor == null
      ? atual ? await supabase.from("tabela_preco_itens").delete().eq("id", atual.id) : { error: null }
      : atual ? await supabase.from("tabela_preco_itens").update({ preco: valor, updated_at: new Date().toISOString() }).eq("id", atual.id)
        : await supabase.from("tabela_preco_itens").insert({ tabela_id: tabela.id, produto_id: p.id, preco: valor });
    if (error) return notifyError(error);
    setRascunho(({ [p.id]: _x, ...resto }) => resto);
    invalidar("tabela_preco_itens");
  }
  function exportar() {
    const linhas = vendaveis.map((p) => {
      const r = precoNaTabela(tabela, p, fixos);
      return { Código: p.sku ?? "", Produto: p.descricao, Categoria: p.categoria ?? "", "Preço de venda": Number(p.preco_venda), [`Preço ${tabela.nome}`]: r.preco, "Preço fixo": r.fixo ? "sim" : "" };
    });
    baixarPlanilha(`tabela-${tabela.nome.toLowerCase().replace(/\s+/g, "-")}`, [{ nome: tabela.nome.slice(0, 30), linhas }]).catch(notifyError);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onVoltar}>← Tabelas</Button>
        <h2 className="mr-auto text-lg font-bold">{tabela.nome} <span className="text-sm font-semibold text-slate-600">· {ajusteTexto(tabela.ajuste_percentual)} · {ARREDONDAMENTOS.find((a) => a.value === tabela.arredondamento)?.label.split(" (")[0]}</span></h2>
        <Button variant="secondary" onClick={exportar}><FileDown size={15} aria-hidden /> Exportar (Excel)</Button>
        {podeEditar && <Button variant="secondary" onClick={onEditar}><Pencil size={15} aria-hidden /> Editar tabela</Button>}
      </div>
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar produto, código, categoria…"
        filtros={<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={soFixos} onChange={(e) => setSoFixos(e.target.checked)} /> Só os com preço fixo ({fixosDaTabela.length})</label>}
        nFiltros={soFixos ? 1 : 0} onLimpar={() => { setBusca(""); setSoFixos(false); }} />
      <Card>
        <ul className="divide-y divide-slate-100">
          {lista.map((p) => {
            const r = precoNaTabela(tabela, p, fixos);
            const auto = precoNaTabela({ ...tabela }, p, []).preco;
            const valor = rascunho[p.id] ?? (r.fixo ? r.preco.toFixed(2).replace(".", ",") : "");
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <span className="min-w-0 flex-1 basis-56 text-sm"><b className="font-semibold">{p.descricao}</b><span className="block text-xs text-slate-500">{[p.sku, p.categoria].filter(Boolean).join(" · ")}</span></span>
                <span className="w-28 text-right text-sm text-slate-600"><span className="block text-2xs">venda</span>{brl(p.preco_venda)}</span>
                <span className="w-28 text-right"><span className="block text-2xs text-slate-500">{tabela.nome}</span><b className={r.fixo ? "text-modulo-texto" : ""}>{brl(r.preco)}</b></span>
                <label className="w-32 text-right text-2xs text-slate-500">preço fixo
                  <input className="input mt-0.5 py-1 text-right" inputMode="decimal" disabled={!podeEditar} aria-label={`Preço fixo de ${p.descricao} em ${tabela.nome}`}
                    placeholder={auto.toFixed(2).replace(".", ",")} value={valor}
                    onChange={(e) => setRascunho((x) => ({ ...x, [p.id]: e.target.value.replace(/[^\d,.]/g, "").slice(0, 12) }))}
                    onBlur={() => salvarFixo(p)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                </label>
              </li>
            );
          })}
          {!lista.length && <li className="p-6 text-center text-sm text-slate-500">Nenhum produto encontrado.</li>}
        </ul>
      </Card>
      <p className="text-xs text-slate-500">Preço fixo em branco = automático ({ajusteTexto(tabela.ajuste_percentual)} sobre o preço de venda). Salva ao sair do campo. {vendaveis.length > 300 && !termo ? "Mostrando os 300 primeiros: use a busca." : ""}</p>
      {editando && <TabelaForm tabela={editando} onClose={fecharEdicao} onCriada={fecharEdicao} />}
    </div>
  );
}
