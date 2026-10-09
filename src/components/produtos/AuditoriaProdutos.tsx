// Produtos → Auditoria e marketplace: cadastros repetidos (unificar), nomes no padrão (SEO) e o que falta para
// anunciar em marketplace (nota de 0 a 100, pendências e preenchimento automático do anúncio).
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Sparkles, Store, Type, Wand2 } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { useConfig } from "@/lib/useConfig";
import {
  avaliarAnuncio, correcaoAutomatica, gruposRepetidos, nomePadrao, type GrupoRepetido, type ProdutoAnuncio,
} from "@/lib/marketplace";
import type { Produto } from "@/lib/types";

type Aba = "repetidos" | "nomes" | "marketplace";
const vendavel = (p: ProdutoAnuncio & { vendavel?: boolean | null }) => p.ativo !== false && !p.unificado_em && p.tipo !== "insumo" && p.vendavel !== false;
const corNota = (n: number) => (n >= 90 ? "bg-emerald-100 text-emerald-800" : n >= 70 ? "bg-sky-100 text-sky-800" : n >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800");

/** Grava em lotes pequenos (cada produto tem o seu valor). */
async function gravarVarios(mudancas: { id: string; dados: Record<string, unknown> }[], aoAndar?: (n: number) => void) {
  let feitos = 0;
  for (let i = 0; i < mudancas.length; i += 8) {
    const lote = mudancas.slice(i, i + 8);
    const res = await Promise.all(lote.map((m) => supabase.from("produtos").update(m.dados).eq("id", m.id)));
    const erro = res.find((r) => r.error)?.error;
    if (erro) throw erro;
    feitos += lote.length;
    aoAndar?.(feitos);
  }
  return feitos;
}

export function AuditoriaProdutos({ produtos, podeEditar, onAbrir }: { produtos: Produto[]; podeEditar: boolean; onAbrir: (p: Produto) => void }) {
  const [aba, setAba] = useState<Aba>("repetidos");
  const lista = produtos as unknown as (ProdutoAnuncio & Produto)[];
  const { data: itens = [] } = useRows<{ produto_id: string }>("pedido_itens", { select: "produto_id", order: "produto_id", key: ["auditoria"] });
  const { data: movs = [] } = useRows<{ produto_id: string }>("estoque_movimentos", { select: "produto_id", order: "produto_id", key: ["auditoria"] });
  const uso = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of [...itens, ...movs]) m.set(r.produto_id, (m.get(r.produto_id) ?? 0) + 1);
    return m;
  }, [itens, movs]);
  const grupos = useMemo(() => gruposRepetidos(lista, uso), [lista, uso]);
  const foraDoPadrao = useMemo(() => lista.filter((p) => p.ativo !== false && !p.unificado_em && nomePadrao(p.descricao) !== p.descricao), [lista]);
  const vendaveis = useMemo(() => lista.filter(vendavel).map((p) => ({ p, a: avaliarAnuncio(p) })), [lista]);
  const prontos = vendaveis.filter((x) => x.a.nota >= 90).length;
  const media = vendaveis.length ? Math.round(vendaveis.reduce((s, x) => s + x.a.nota, 0) / vendaveis.length) : 0;

  const blocos: { id: Aba; Icone: typeof Copy; titulo: string; valor: string; detalhe: string; tom: string }[] = [
    { id: "repetidos", Icone: Copy, titulo: "Cadastros repetidos", valor: String(grupos.reduce((s, g) => s + g.produtos.length - 1, 0)), detalhe: `${grupos.length} grupo(s) para unificar`, tom: grupos.length ? "border-amber-300" : "border-emerald-300" },
    { id: "nomes", Icone: Type, titulo: "Nomes fora do padrão", valor: String(foraDoPadrao.length), detalhe: "unidade no fim, maiúsculas, acentos", tom: foraDoPadrao.length ? "border-amber-300" : "border-emerald-300" },
    { id: "marketplace", Icone: Store, titulo: "Prontos para marketplace", valor: `${prontos}/${vendaveis.length}`, detalhe: `nota média ${media}`, tom: prontos === vendaveis.length ? "border-emerald-300" : "border-sky-300" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {blocos.map((b) => (
          <button key={b.id} type="button" onClick={() => setAba(b.id)} aria-pressed={aba === b.id}
            className={`flex items-center gap-3 rounded-xl border-2 bg-surface p-3 text-left transition ${aba === b.id ? "border-brand shadow-pop" : b.tom}`}>
            <b.Icone size={22} className="shrink-0 text-brand" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-500">{b.titulo}</span>
              <span className="num block text-2xl font-bold text-fg">{b.valor}</span>
              <span className="block text-xs text-slate-500">{b.detalhe}</span>
            </span>
          </button>
        ))}
      </div>
      {aba === "repetidos" && <Repetidos grupos={grupos} uso={uso} podeEditar={podeEditar} onAbrir={onAbrir} />}
      {aba === "nomes" && <Nomes produtos={foraDoPadrao} podeEditar={podeEditar} />}
      {aba === "marketplace" && <Marketplace itens={vendaveis} todos={lista} podeEditar={podeEditar} onAbrir={onAbrir} />}
    </div>
  );
}

// ---------------------------------------------------------------------
function Repetidos({ grupos, uso, podeEditar, onAbrir }: { grupos: GrupoRepetido[]; uso: Map<string, number>; podeEditar: boolean; onAbrir: (p: Produto) => void }) {
  const invalidar = useInvalidate();
  const [principal, setPrincipal] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Record<string, Set<string>>>({});
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<GrupoRepetido[] | null>(null);
  const identicos = grupos.filter((g) => g.identicos);

  const escolhido = (g: GrupoRepetido) => principal[g.chave] ?? g.principal;
  // nos grupos com diferenças (códigos ou preços), nenhum entra sem a pessoa marcar
  const incluidos = (g: GrupoRepetido) => g.produtos.filter((p) => p.id !== escolhido(g) && (g.identicos ? !fora[g.chave]?.has(p.id) : fora[g.chave]?.has(p.id)));
  const alternar = (g: GrupoRepetido, id: string) => setFora((f) => { const s = new Set(f[g.chave] ?? []); s.has(id) ? s.delete(id) : s.add(id); return { ...f, [g.chave]: s }; });

  async function unificar(lista: GrupoRepetido[]) {
    setOcupado(true);
    let n = 0;
    try {
      for (const g of lista) {
        const outros = incluidos(g).map((p) => p.id);
        if (!outros.length) continue;
        const { data, error } = await supabase.rpc("unificar_produtos", { p_principal: escolhido(g), p_outros: outros, p_motivo: "Cadastro repetido (auditoria de produtos)" });
        if (error) throw error;
        n += Number(data) || 0;
      }
      notify(`${n} cadastro(s) unificado(s): pedidos, estoque, kits e fornecedores foram para o principal`);
      invalidar("produtos", "estoque_unidade", "estoque_movimentos", "kit_componentes", "produto_fornecedor", "pedido_itens");
      setConfirmar(null);
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  if (!grupos.length) return <Card className="flex items-center gap-2 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} /> Nenhum cadastro repetido.</Card>;
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
        <span className="min-w-0 flex-1">
          Unificar passa <b>pedidos, NF, OS, compras, kits, ficha técnica, fornecedores, anexos e o saldo de estoque</b> para o cadastro que fica.
          Os outros ficam <b>arquivados</b> (inativos, com o aviso "unificado em"), nunca apagados. Códigos antigos (SKU, EAN, Tiny) viram códigos alternativos.
        </span>
        {podeEditar && identicos.length > 0 && <Button disabled={ocupado} onClick={() => setConfirmar(identicos)}><Sparkles size={15} /> Unificar os {identicos.length} grupo(s) idênticos</Button>}
      </Card>
      {grupos.map((g) => (
        <Card key={g.chave} className="p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <b className="text-fg">{nomePadrao(g.produtos[0].descricao)}</b>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{g.produtos.length}× · {g.motivo}</span>
            {g.identicos ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">idênticos</span>
              : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"><AlertTriangle size={12} /> conferir: {g.alerta}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500">
                <th className="py-1">Fica</th><th className="py-1">Junta</th><th className="py-1">Cadastro</th><th className="py-1">SKU / EAN</th>
                <th className="py-1 text-right">Preço</th><th className="py-1 text-right">Estoque</th><th className="py-1 text-right">Usado</th><th />
              </tr></thead>
              <tbody>
                {g.produtos.map((p) => {
                  const fica = escolhido(g) === p.id;
                  const junta = !fica && incluidos(g).some((x) => x.id === p.id);
                  return (
                    <tr key={p.id} className={fica ? "bg-emerald-50" : ""}>
                      <td className="py-1"><input type="radio" name={`fica-${g.chave}`} aria-label={`Fica ${p.descricao}`} checked={fica} disabled={!podeEditar} onChange={() => setPrincipal({ ...principal, [g.chave]: p.id })} /></td>
                      <td className="py-1"><input type="checkbox" aria-label={`Juntar ${p.descricao}`} checked={junta} disabled={fica || !podeEditar} onChange={() => alternar(g, p.id)} /></td>
                      <td className="py-1"><div className="font-medium text-fg">{p.descricao}</div>
                        <div className="text-xs text-slate-500">{[p.foto_caminho && "com foto", p.no_catalogo && "no catálogo", p.id_externo && `Tiny ${p.id_externo}`].filter(Boolean).join(" · ")}</div></td>
                      <td className="py-1 text-xs">{p.sku || "—"}<div className="text-slate-500">{p.codigo_barras || ""}</div></td>
                      <td className="num py-1 text-right">{brl(Number(p.preco_venda) || 0)}</td>
                      <td className="num py-1 text-right">{Number(p.estoque_atual) || 0}</td>
                      <td className="num py-1 text-right">{uso.get(p.id) ?? 0}</td>
                      <td className="py-1 text-right"><button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onAbrir(p as unknown as Produto)}>abrir</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {podeEditar && (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              {!g.identicos && <span className="text-xs text-amber-800">Com diferenças: marque em "Junta" só o que for o mesmo produto. Se forem modelos diferentes, renomeie em "abrir".</span>}
              <Button variant="secondary" disabled={ocupado || !incluidos(g).length} onClick={() => setConfirmar([g])}>Unificar {incluidos(g).length ? `${incluidos(g).length + 1} em 1` : ""}</Button>
            </div>
          )}
        </Card>
      ))}
      {confirmar && (
        <Modal open onClose={() => setConfirmar(null)} title="Unificar cadastros">
          <div className="space-y-2 text-sm">
            {confirmar.map((g) => {
              const f = g.produtos.find((p) => p.id === escolhido(g))!;
              return <p key={g.chave}><b>{f.descricao}</b>{f.sku ? ` (${f.sku})` : ""} fica e recebe {incluidos(g).length} cadastro(s).</p>;
            })}
            <p className="text-slate-600">Os repetidos ficam arquivados com o aviso "unificado em". Isso não se desfaz pela tela.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setConfirmar(null)}>Voltar</Button>
              <Button disabled={ocupado} onClick={() => unificar(confirmar)}>{ocupado ? "Unificando…" : "Unificar"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function Nomes({ produtos, podeEditar }: { produtos: (ProdutoAnuncio & Produto)[]; podeEditar: boolean }) {
  const invalidar = useInvalidate();
  const [editado, setEditado] = useState<Record<string, string>>({});
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const novo = (p: ProdutoAnuncio) => editado[p.id] ?? nomePadrao(p.descricao);
  const marcados = produtos.filter((p) => !fora.has(p.id) && novo(p).trim() && novo(p) !== p.descricao);

  async function aplicar() {
    setOcupado("0");
    try {
      const n = await gravarVarios(marcados.map((p) => ({ id: p.id, dados: { descricao: novo(p).trim(), motivo_alteracao: "Padronização dos nomes (auditoria de produtos)" } })), (k) => setOcupado(String(k)));
      notify(`${n} nome(s) padronizado(s)`);
      invalidar("produtos");
      setEditado({}); setFora(new Set());
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  if (!produtos.length) return <Card className="flex items-center gap-2 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} /> Todos os nomes estão no padrão.</Card>;
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
        <span className="min-w-0 flex-1">
          Padrão: <b>o que é + característica + marca/modelo</b>, sem a unidade no fim ("- UN" fica no campo Unidade), sem tudo em maiúsculas,
          com acentos ("Relé", "Monofásico") e hífen com espaço. Siglas, códigos e medidas ficam como estão. Confira e ajuste o nome novo se precisar.
        </span>
        {podeEditar && <Button disabled={!!ocupado || !marcados.length} onClick={aplicar}><Wand2 size={15} /> {ocupado ? `Gravando ${ocupado}/${marcados.length}…` : `Aplicar em ${marcados.length}`}</Button>}
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="w-8 p-2" /><th className="p-2">Como está</th><th className="p-2">Como fica</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {produtos.map((p) => (
              <tr key={p.id}>
                <td className="p-2"><input type="checkbox" aria-label={`Padronizar ${p.descricao}`} checked={!fora.has(p.id)} onChange={() => setFora((f) => { const s = new Set(f); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; })} /></td>
                <td className="p-2 text-slate-500 line-through decoration-slate-300">{p.descricao}</td>
                <td className="p-2"><input className="input !py-1" aria-label={`Nome novo de ${p.descricao}`} value={novo(p)} onChange={(e) => setEditado({ ...editado, [p.id]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
const ROTULO_PEND: Record<string, string> = {
  nome: "Nome fora do padrão", titulo: "Título", descricao: "Descrição do anúncio", foto: "Foto", preco: "Preço", sku: "SKU", gtin: "EAN / sem GTIN",
  marca: "Marca", modelo: "Modelo", ncm: "NCM", frete: "Peso e medidas", categoria: "Categoria", seo: "Endereço, Google e palavras-chave",
};

function Marketplace({ itens, todos, podeEditar, onAbrir }: {
  itens: { p: ProdutoAnuncio & Produto; a: ReturnType<typeof avaliarAnuncio> }[]; todos: (ProdutoAnuncio & Produto)[]; podeEditar: boolean; onAbrir: (p: Produto) => void;
}) {
  const invalidar = useInvalidate();
  const { data: cfg } = useConfig();
  const [filtro, setFiltro] = useState<string>("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of itens) for (const p of x.a.pendencias) m.set(p.id, (m.get(p.id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);
  const visiveis = itens.filter((x) => !filtro || (filtro === "prontos" ? x.a.nota >= 90 : x.a.pendencias.some((p) => p.id === filtro)))
    .sort((a, b) => a.a.nota - b.a.nota || a.p.descricao.localeCompare(b.p.descricao));
  const automaticos = itens.filter((x) => x.a.pendencias.some((p) => p.automatica));

  async function completar() {
    if (!automaticos.length) return;
    if (!confirm(`Completar ${automaticos.length} anúncio(s)? Preenche o que está vazio (título, endereço da página, descrição para o Google, palavras-chave e texto do anúncio) e padroniza o nome. Nada que alguém escreveu é apagado.`)) return;
    setOcupado("0");
    try {
      const usados = new Set(todos.map((p) => p.slug).filter(Boolean) as string[]);
      const garantia = Number(cfg?.garantia_meses_padrao) || 3;
      const mudancas = automaticos.map(({ p }) => ({ id: p.id, dados: correcaoAutomatica(p, usados, garantia) as Record<string, unknown> }))
        .filter((m) => Object.keys(m.dados).length)
        .map((m) => ({ ...m, dados: { ...m.dados, ...(m.dados.descricao ? { motivo_alteracao: "Padronização dos nomes (auditoria de produtos)" } : {}) } }));
      const n = await gravarVarios(mudancas, (k) => setOcupado(String(k)));
      notify(`${n} anúncio(s) completado(s). Falta o que só vocês sabem: fotos, EAN, marca/modelo, peso e medidas.`);
      invalidar("produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  function exportar() {
    baixarPlanilha("anuncios-marketplace", [{ nome: "Anúncios", linhas: itens.map(({ p, a }) => ({
      SKU: p.sku ?? "", Nome: p.descricao, "Título do anúncio": p.titulo_anuncio ?? "", Endereço: p.slug ?? "", "Descrição para o Google": p.meta_descricao ?? "",
      "Palavras-chave": (p.palavras_chave ?? []).join(", "), Preço: Number(p.preco_venda) || 0, Estoque: Number(p.estoque_atual) || 0, EAN: p.gtin_isento ? "SEM GTIN" : p.codigo_barras ?? "",
      Marca: p.marca ?? "", Modelo: p.modelo ?? "", NCM: p.ncm ?? "", "Peso (kg)": Number(p.peso_kg) || "", Categoria: p.categoria ?? "", Nota: a.nota,
      Pendências: a.pendencias.map((x) => x.texto).join("; "), "Texto do anúncio": p.descricao_anuncio ?? "",
    })) }]).catch(notifyError);
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
        <span className="min-w-0 flex-1">
          Nota de 0 a 100 de cada produto que vende (máquinas, peças e acessórios). <b>90 ou mais</b> = pronto para Mercado Livre, Shopee, Amazon e loja virtual.
          Título de até 60 letras, texto sem telefone/link, foto, EAN (ou "sem GTIN"), marca, modelo, NCM, peso e medidas.
        </span>
        <Button variant="secondary" onClick={exportar}>Planilha dos anúncios</Button>
        {podeEditar && <Button disabled={!!ocupado || !automaticos.length} onClick={completar}><Wand2 size={15} /> {ocupado ? `Gravando ${ocupado}…` : `Completar automaticamente (${automaticos.length})`}</Button>}
      </Card>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setFiltro("")} className={`rounded-full px-3 py-1 text-xs font-semibold ${!filtro ? "bg-brand text-brand-fg" : "border border-slate-300 text-slate-600"}`}>Todos ({itens.length})</button>
        <button type="button" onClick={() => setFiltro("prontos")} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtro === "prontos" ? "bg-brand text-brand-fg" : "border border-slate-300 text-slate-600"}`}>Prontos ({itens.filter((x) => x.a.nota >= 90).length})</button>
        {contagem.map(([id, n]) => (
          <button key={id} type="button" onClick={() => setFiltro(id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtro === id ? "bg-brand text-brand-fg" : "border border-slate-300 text-slate-600"}`}>
            Falta {ROTULO_PEND[id] ?? id} ({n})
          </button>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="p-2">Nota</th><th className="p-2">Produto e título do anúncio</th><th className="p-2">O que falta</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visiveis.slice(0, 300).map(({ p, a }) => (
              <tr key={p.id}>
                <td className="p-2"><span className={`num inline-block min-w-[2.5rem] rounded-lg px-2 py-1 text-center text-sm font-bold ${corNota(a.nota)}`}>{a.nota}</span></td>
                <td className="p-2"><div className="font-medium text-fg">{p.descricao}</div>
                  <div className="text-xs text-slate-500">{p.titulo_anuncio ? <>“{p.titulo_anuncio}” · {p.titulo_anuncio.length}/60</> : "sem título de anúncio"}</div></td>
                <td className="p-2"><div className="flex flex-wrap gap-1">{a.pendencias.map((x) => (
                  <span key={x.id} title={x.texto} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${x.automatica ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}>{ROTULO_PEND[x.id] ?? x.id}</span>
                ))}{!a.pendencias.length && <span className="text-xs font-semibold text-emerald-700">tudo certo</span>}</div></td>
                <td className="p-2 text-right"><button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onAbrir(p as unknown as Produto)}>abrir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500"><span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">azul</span> = o "Completar automaticamente" resolve; cinza = precisa de vocês (foto, EAN, marca, medidas…).</p>
    </div>
  );
}
