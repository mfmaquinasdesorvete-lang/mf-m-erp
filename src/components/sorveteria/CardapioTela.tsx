// Cardápio e ajustes: produtos, sabores (com "em falta" em um toque), complementos e dados da loja.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  apagarTudo, novoId, r2, type Estado, type GrupoComplemento, type ProdutoMenu,
} from "@/lib/sorveteria";

type Mudar = (f: (e: Estado) => Estado) => void;
const num = (s: string) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : 0; };
const preco = (n: number) => String(n).replace(".", ",");
const SUBS = [["produtos", "Produtos"], ["sabores", "Sabores"], ["complementos", "Complementos"], ["loja", "Loja e entrega"]] as const;

export function CardapioTela({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [sub, setSub] = useState<(typeof SUBS)[number][0]>("produtos");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {SUBS.map(([id, r]) => (
          <button key={id} type="button" role="tab" aria-selected={sub === id} onClick={() => setSub(id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${sub === id ? "border-modulo bg-modulo text-white" : "border-slate-200 hover:border-modulo"}`}>{r}</button>
        ))}
      </div>
      {sub === "produtos" && <Produtos estado={estado} mudar={mudar} />}
      {sub === "sabores" && <Sabores estado={estado} mudar={mudar} />}
      {sub === "complementos" && <Complementos estado={estado} mudar={mudar} />}
      {sub === "loja" && <LojaAjustes estado={estado} mudar={mudar} />}
    </div>
  );
}

// ---------------------------------------------------------------- produtos
function Produtos({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [edit, setEdit] = useState<ProdutoMenu | null>(null);
  const [cat, setCat] = useState("");
  const novo = (): ProdutoMenu => ({ id: novoId(), categoria_id: estado.categorias[0]?.id ?? "", nome: "", tipo: "unidade", preco: 0, sabores: 0, grupos: [], ativo: true, esgotado: false });
  const alterar = (id: string, p: Partial<ProdutoMenu>) => mudar((e) => ({ ...e, produtos: e.produtos.map((x) => x.id === id ? { ...x, ...p } : x) }));
  const salvar = () => {
    if (!edit) return;
    if (!edit.nome.trim()) return notify("Dê um nome ao produto.", "erro");
    if (!edit.categoria_id) return notify("Escolha a categoria.", "erro");
    mudar((e) => ({ ...e, produtos: e.produtos.some((x) => x.id === edit.id) ? e.produtos.map((x) => x.id === edit.id ? edit : x) : [...e.produtos, edit] }));
    setEdit(null);
  };
  const novaCategoria = () => {
    const nome = window.prompt("Nome da categoria");
    if (nome?.trim()) mudar((e) => ({ ...e, categorias: [...e.categorias, { id: novoId(), nome: nome.trim(), emoji: "🍨" }] }));
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="input w-auto" aria-label="Categoria" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {estado.categorias.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
        </select>
        <div className="flex gap-2"><Button type="button" variant="secondary" onClick={novaCategoria}>Nova categoria</Button><Button type="button" onClick={() => setEdit(novo())}><Plus size={16} aria-hidden /> Produto</Button></div>
      </div>
      <Card className="divide-y divide-slate-100">
        {estado.produtos.filter((p) => !cat || p.categoria_id === cat).map((p) => (
          <div key={p.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${p.ativo ? "" : "opacity-50"}`}>
            <div className="min-w-0 flex-1">
              <b className="text-sm">{p.nome}</b>
              <p className="text-xs text-slate-500">{estado.categorias.find((c) => c.id === p.categoria_id)?.nome} · {p.tipo === "peso" ? `${brl(p.preco)}/kg` : brl(p.preco)}{p.sabores > 0 && ` · ${p.sabores} ${p.sabores === 1 ? "sabor" : "sabores"}`}</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700"><input type="checkbox" checked={p.esgotado} onChange={(e) => alterar(p.id, { esgotado: e.target.checked })} /> Em falta</label>
            <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={p.ativo} onChange={(e) => alterar(p.id, { ativo: e.target.checked })} /> No cardápio</label>
            <Button type="button" variant="secondary" className="!py-1" onClick={() => setEdit(p)}>Editar</Button>
          </div>
        ))}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && estado.produtos.some((p) => p.id === edit.id) ? "Editar produto" : "Novo produto"}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nome"><input className="input" autoFocus value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria"><select className="input" value={edit.categoria_id} onChange={(e) => setEdit({ ...edit, categoria_id: e.target.value })}>{estado.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
              <Field label="Como vende"><select className="input" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value as ProdutoMenu["tipo"] })}><option value="unidade">Por unidade</option><option value="peso">Por peso (kg)</option></select></Field>
              <Field label={edit.tipo === "peso" ? "Preço do kg (R$)" : "Preço (R$)"}><input className="input" inputMode="decimal" value={preco(edit.preco)} onChange={(e) => setEdit({ ...edit, preco: num(e.target.value) })} /></Field>
              <Field label="Sabores a escolher (0 = não pergunta)"><input className="input" type="number" min={0} max={9} value={edit.sabores} onChange={(e) => setEdit({ ...edit, sabores: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })} /></Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-slate-600">Grupos de complementos</legend>
              <div className="flex flex-wrap gap-3">
                {estado.grupos.map((g) => (
                  <label key={g.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={edit.grupos.includes(g.id)} onChange={(e) => setEdit({ ...edit, grupos: e.target.checked ? [...edit.grupos, g.id] : edit.grupos.filter((x) => x !== g.id) })} /> {g.nome}</label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-between gap-2">
              {estado.produtos.some((p) => p.id === edit.id)
                ? <Button type="button" variant="ghost" className="text-red-600" onClick={() => { if (window.confirm("Excluir este produto? Pedidos antigos continuam no relatório.")) { mudar((e) => ({ ...e, produtos: e.produtos.filter((x) => x.id !== edit.id) })); setEdit(null); } }}>Excluir</Button>
                : <span />}
              <Button type="button" onClick={salvar}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- sabores
function Sabores({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const alterar = (id: string, p: Record<string, unknown>) => mudar((e) => ({ ...e, sabores: e.sabores.map((s) => s.id === id ? { ...s, ...p } : s) }));
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Marque <b>em falta</b> quando o sabor acabar: ele some da escolha na hora. O acréscimo vale para cada bola do sabor premium.</p>
        <Button type="button" onClick={() => mudar((e) => ({ ...e, sabores: [...e.sabores, { id: novoId(), nome: "Novo sabor", acrescimo: 0, esgotado: false }] }))}><Plus size={16} aria-hidden /> Sabor</Button>
      </div>
      <Card className="divide-y divide-slate-100">
        {estado.sabores.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <input className="input min-w-0 flex-1" aria-label="Nome do sabor" value={s.nome} onChange={(e) => alterar(s.id, { nome: e.target.value })} />
            <label className="flex items-center gap-1.5 text-xs text-slate-500">Acréscimo R$ <input className="input w-20 py-1 text-right" inputMode="decimal" value={preco(s.acrescimo)} onChange={(e) => alterar(s.id, { acrescimo: r2(num(e.target.value)) })} /></label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700"><input type="checkbox" checked={s.esgotado} onChange={(e) => alterar(s.id, { esgotado: e.target.checked })} /> Em falta</label>
            <button type="button" aria-label={`Excluir ${s.nome}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => mudar((e) => ({ ...e, sabores: e.sabores.filter((x) => x.id !== s.id) }))}><Trash2 size={16} aria-hidden /></button>
          </div>
        ))}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- complementos
function Complementos({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const grupo = (id: string, f: (g: GrupoComplemento) => GrupoComplemento) => mudar((e) => ({ ...e, grupos: e.grupos.map((g) => g.id === id ? f(g) : g) }));
  return (
    <>
      <div className="flex justify-end"><Button type="button" onClick={() => mudar((e) => ({ ...e, grupos: [...e.grupos, { id: novoId(), nome: "Novo grupo", min: 0, max: 3, itens: [] }] }))}><Plus size={16} aria-hidden /> Grupo</Button></div>
      {estado.grupos.map((g) => (
        <Card key={g.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Grupo" className="min-w-0 flex-1"><input className="input" value={g.nome} onChange={(e) => grupo(g.id, (x) => ({ ...x, nome: e.target.value }))} /></Field>
            <Field label="Mínimo"><input className="input w-20" type="number" min={0} value={g.min} onChange={(e) => grupo(g.id, (x) => ({ ...x, min: Math.max(0, Number(e.target.value) || 0) }))} /></Field>
            <Field label="Máximo"><input className="input w-20" type="number" min={1} value={g.max} onChange={(e) => grupo(g.id, (x) => ({ ...x, max: Math.max(1, Number(e.target.value) || 1) }))} /></Field>
            <Button type="button" variant="ghost" className="text-red-600" onClick={() => { if (window.confirm(`Excluir o grupo ${g.nome}?`)) mudar((e) => ({ ...e, grupos: e.grupos.filter((x) => x.id !== g.id), produtos: e.produtos.map((p) => ({ ...p, grupos: p.grupos.filter((id) => id !== g.id) })) })); }}>Excluir grupo</Button>
          </div>
          <div className="space-y-1.5">
            {g.itens.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3">
                <input className="input min-w-0 flex-1 py-1" aria-label="Nome do complemento" value={c.nome} onChange={(e) => grupo(g.id, (x) => ({ ...x, itens: x.itens.map((i) => i.id === c.id ? { ...i, nome: e.target.value } : i) }))} />
                <label className="flex items-center gap-1.5 text-xs text-slate-500">R$ <input className="input w-20 py-1 text-right" inputMode="decimal" value={preco(c.preco)} onChange={(e) => grupo(g.id, (x) => ({ ...x, itens: x.itens.map((i) => i.id === c.id ? { ...i, preco: r2(num(e.target.value)) } : i) }))} /></label>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700"><input type="checkbox" checked={c.esgotado} onChange={(e) => grupo(g.id, (x) => ({ ...x, itens: x.itens.map((i) => i.id === c.id ? { ...i, esgotado: e.target.checked } : i) }))} /> Em falta</label>
                <button type="button" aria-label={`Excluir ${c.nome}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => grupo(g.id, (x) => ({ ...x, itens: x.itens.filter((i) => i.id !== c.id) }))}><Trash2 size={16} aria-hidden /></button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" className="!py-1" onClick={() => grupo(g.id, (x) => ({ ...x, itens: [...x.itens, { id: novoId(), nome: "Novo item", preco: 0, esgotado: false }] }))}><Plus size={14} aria-hidden /> Item</Button>
        </Card>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- loja
function LojaAjustes({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const l = estado.loja;
  const set = (p: Partial<typeof l>) => mudar((e) => ({ ...e, loja: { ...e.loja, ...p } }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-bold">Dados no comprovante</h3>
        <Field label="Nome da sorveteria"><input className="input" value={l.nome} onChange={(e) => set({ nome: e.target.value })} /></Field>
        <Field label="Telefone"><input className="input" value={l.telefone} onChange={(e) => set({ telefone: e.target.value })} /></Field>
        <Field label="Endereço"><input className="input" value={l.endereco} onChange={(e) => set({ endereco: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.imprimirAuto} onChange={(e) => set({ imprimirAuto: e.target.checked })} /> Imprimir o comprovante sozinho ao cobrar</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.producaoBalcao} onChange={(e) => set({ producaoBalcao: e.target.checked })} /> Pedidos do balcão passam pela fila de produção (açaí, milkshake)</label>
      </Card>
      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-bold">Balcão e comandas</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nº de comandas"><input className="input" type="number" min={0} max={200} value={l.comandas} onChange={(e) => set({ comandas: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} /></Field>
          <Field label="Peso do pote (g)"><input className="input" type="number" min={0} value={l.taraG} onChange={(e) => set({ taraG: Math.max(0, Number(e.target.value) || 0) })} /></Field>
          <Field label="Serviço (%)"><input className="input" type="number" min={0} max={30} value={l.gorjetaPct} onChange={(e) => set({ gorjetaPct: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })} /></Field>
        </div>
        <p className="text-xs text-slate-500">O peso do pote é descontado do peso da balança no self-service. O serviço é cobrado só se marcado na comanda.</p>
      </Card>
      <Card className="space-y-3 p-4 lg:col-span-2">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Taxa de entrega por bairro</h3>
          <Button type="button" variant="secondary" className="!py-1" onClick={() => set({ bairros: [...l.bairros, { nome: "", taxa: 0 }] })}><Plus size={14} aria-hidden /> Bairro</Button></div>
        {l.bairros.map((b, i) => (
          <div key={i} className="flex items-center gap-3">
            <input className="input min-w-0 flex-1" aria-label="Bairro" value={b.nome} onChange={(e) => set({ bairros: l.bairros.map((x, k) => k === i ? { ...x, nome: e.target.value } : x) })} />
            <label className="flex items-center gap-1.5 text-xs text-slate-500">R$ <input className="input w-24 text-right" inputMode="decimal" value={preco(b.taxa)} onChange={(e) => set({ bairros: l.bairros.map((x, k) => k === i ? { ...x, taxa: r2(num(e.target.value)) } : x) })} /></label>
            <button type="button" aria-label="Excluir bairro" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => set({ bairros: l.bairros.filter((_, k) => k !== i) })}><Trash2 size={16} aria-hidden /></button>
          </div>
        ))}
      </Card>
      <Card className="p-4 lg:col-span-2">
        <h3 className="mb-1 text-sm font-bold">Zerar dados</h3>
        <p className="mb-2 text-xs text-slate-500">Apaga pedidos, caixas e cardápio deste aparelho e volta ao cardápio de exemplo.</p>
        <Button type="button" variant="danger" onClick={() => { if (window.confirm("Apagar TODOS os dados da sorveteria neste aparelho?")) apagarTudo(); }}>Zerar tudo</Button>
      </Card>
    </div>
  );
}
