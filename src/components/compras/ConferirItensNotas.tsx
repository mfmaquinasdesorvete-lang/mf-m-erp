// Conferir itens das notas de fornecedor: cada item diferente (fornecedor + código dele) que a MF já comprou,
// para ligar ao produto do ERP uma vez só, criar o produto que falta ou marcar o que não é de estoque (uso e
// consumo, bem da empresa, serviço). Ligar grava o fornecedor do produto com o último preço e faz as próximas
// notas desse item entrarem sozinhas no estoque. Esta tela não mexe no estoque.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Link2, Loader2, PackagePlus, Search, Sparkles, Undo2, X } from "lucide-react";
import { Button, Field, Modal, chip } from "../ui";
import { ProdutoBusca } from "../ProdutoBusca";
import { confirmar } from "../Dialogos";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { nomePadrao } from "@/lib/marketplace";
import { UNIDADES } from "@/lib/qualidadeProdutos";
import {
  chaveItem, NOME_SEM_ESTOQUE, situacaoItem, sugerirPorNome, unidadeDeEmbalagem, unidadeDoErp,
  type ItemNota, type SituacaoItem, type TipoSemEstoque,
} from "@/lib/itensNotas";
import type { Produto } from "@/lib/types";
import { LIMITE_ITENS, type ItemIA, type SugestaoItemIA } from "../../../supabase/functions/_shared/ia-itens";

type Filtro = "pendentes" | "sugestao" | "ligados" | "sem_estoque" | "todos";
type Acao = { item: ItemNota; acao: "produto" | TipoSemEstoque | "pendente"; produto_id?: string; fator?: number };
type Criando = { item: ItemNota; nome?: string | null; tipo?: string | null };
const ROTULO_IA: Record<SugestaoItemIA["decisao"], string> = {
  ligar: "Ligar a", criar: "Criar o produto", consumo: "Uso e consumo", ativo: "Bem da empresa", servico: "Serviço", duvida: "Na dúvida",
};
const POR_VEZ = 40;
const qtd = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function desdeDe(periodo: string) {
  const d = new Date();
  if (periodo === "ano") return `${d.getFullYear()}-01-01`;
  if (periodo === "12m") { d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
  return null;
}

export function ConferirItensNotas({ onClose }: { onClose: () => void }) {
  const { unidades, padrao } = useUnidade();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const [unidade, setUnidade] = useState<string>(() => unidades.find((u) => u.matriz)?.id ?? padrao ?? "");
  const [periodo, setPeriodo] = useState("ano");
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(POR_VEZ);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [criando, setCriando] = useState<Criando | null>(null);
  const [ia, setIa] = useState<Map<string, SugestaoItemIA>>(new Map());
  const [iaOcupada, setIaOcupada] = useState(false);
  const desde = desdeDe(periodo);

  const { data: itens = [], isLoading, error } = useQuery({
    queryKey: ["itens_notas_fornecedor", unidade, desde],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("itens_notas_fornecedor", { p_unidade: unidade || null, p_desde: desde });
      if (error) throw error;
      return (data ?? []) as ItemNota[];
    },
  });
  const { data: produtosTodos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const produtos = useMemo(() => produtosTodos.filter((p) => p.ativo !== false && !p.unificado_em && p.tipo !== "servico"), [produtosTodos]);
  const porId = useMemo(() => new Map(produtosTodos.map((p) => [p.id, p])), [produtosTodos]);

  const contagem = useMemo(() => {
    const c: Record<SituacaoItem, number> = { ligado: 0, sem_estoque: 0, sugestao: 0, pendente: 0 };
    for (const i of itens) c[situacaoItem(i)]++;
    return c;
  }, [itens]);
  const termo = busca.trim().toLowerCase();
  const lista = useMemo(() => itens.filter((i) => {
    const s = situacaoItem(i);
    const ok = filtro === "todos" || (filtro === "pendentes" ? s === "pendente" || s === "sugestao" : filtro === "sugestao" ? s === "sugestao" : filtro === "ligados" ? s === "ligado" : s === "sem_estoque");
    return ok && (!termo || [i.descricao, i.codigo, i.fornecedor, i.ean, i.ncm].some((x) => String(x ?? "").toLowerCase().includes(termo)));
  }), [itens, filtro, termo]);
  const visiveis = lista.slice(0, limite);
  const porCodigoBarras = itens.filter((i) => situacaoItem(i) === "sugestao" && i.sugestao_motivo === "mesmo código de barras");

  async function gravar(acoes: Acao[], ok: string) {
    if (!acoes.length) return;
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("ligar_itens_fornecedor", {
        p_itens: acoes.map((a) => ({ fornecedor_id: a.item.fornecedor_id, codigo: a.item.codigo, descricao: a.item.descricao, acao: a.acao, produto_id: a.produto_id ?? null, fator: a.fator ?? 1 })),
      });
      if (error) throw error;
      notify(ok);
      setSel(new Set());
      await qc.invalidateQueries({ queryKey: ["itens_notas_fornecedor"] });
      invalidate("fornecimentos", "produto_fornecedor", "produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function aceitarCodigoBarras() {
    if (!(await confirmar(`Ligar ${porCodigoBarras.length} ${pl(porCodigoBarras.length, "item", "itens")} ao produto com o mesmo código de barras?`))) return;
    gravar(porCodigoBarras.map((i) => ({ item: i, acao: "produto", produto_id: i.sugestao_id!, fator: 1 })), `${porCodigoBarras.length} ${pl(porCodigoBarras.length, "item ligado", "itens ligados")}`);
  }
  // IA: os próximos itens a ligar (da lista na tela) vão com até 5 produtos parecidos cada; ela devolve uma decisão por item
  const semIa = lista.filter((i) => { const s = situacaoItem(i); return (s === "pendente" || s === "sugestao") && !ia.has(chaveItem(i)); });
  async function pedirIa() {
    const lote = semIa.slice(0, LIMITE_ITENS);
    if (!lote.length) return;
    setIaOcupada(true);
    try {
      const itensIa: ItemIA[] = lote.map((i) => {
        const cands = sugerirPorNome(i.descricao, produtos, 5).map((x) => x.produto);
        const sug = i.sugestao_id ? porId.get(i.sugestao_id) : null;
        if (sug && !cands.some((c) => c.id === sug.id)) cands.unshift(sug);
        return {
          chave: chaveItem(i), descricao: i.descricao ?? "", codigo: i.codigo, ncm: i.ncm, ean: i.ean, fornecedor: i.fornecedor, unidade: i.unidade,
          ultimo_valor: i.ultimo_valor == null ? null : Number(i.ultimo_valor),
          candidatos: cands.map((c) => ({ id: c.id, descricao: c.descricao, sku: c.sku, codigo_fabricante: c.codigo_fabricante, unidade: c.unidade })),
        };
      });
      const r = await callFunction<{ itens: SugestaoItemIA[] }>("ia-produto", { acao: "itens", itens: itensIa });
      setIa((m) => { const n = new Map(m); for (const x of r.itens) n.set(x.chave, x); return n; });
      notify(`A IA olhou ${r.itens.length} ${pl(r.itens.length, "item", "itens")}: confira e aplique`);
    } catch (e) { notifyError(e); } finally { setIaOcupada(false); }
  }
  const iaAlta = itens.filter((i) => {
    const x = ia.get(chaveItem(i)); const s = situacaoItem(i);
    return x && x.confianca === "alta" && (s === "pendente" || s === "sugestao") && x.decisao !== "criar" && x.decisao !== "duvida";
  });
  async function aplicarIaAlta() {
    if (!(await confirmar(`Aplicar ${iaAlta.length} ${pl(iaAlta.length, "sugestão", "sugestões")} da IA com confiança alta?`))) return;
    gravar(iaAlta.map((i) => { const x = ia.get(chaveItem(i))!; return x.decisao === "ligar"
      ? { item: i, acao: "produto" as const, produto_id: x.produto_id!, fator: x.fator }
      : { item: i, acao: x.decisao as TipoSemEstoque }; }), `${iaAlta.length} ${pl(iaAlta.length, "sugestão aplicada", "sugestões aplicadas")}`);
  }

  function marcarSelecionados(tipo: TipoSemEstoque) {
    const escolhidos = itens.filter((i) => sel.has(chaveItem(i)) && !i.produto_id);
    gravar(escolhidos.map((i) => ({ item: i, acao: tipo })), `${escolhidos.length} ${pl(escolhidos.length, "item marcado", "itens marcados")} como ${NOME_SEM_ESTOQUE[tipo].toLowerCase()}`);
  }

  const FILTROS: { id: Filtro; rotulo: string; n: number }[] = [
    { id: "pendentes", rotulo: "A ligar", n: contagem.pendente + contagem.sugestao },
    { id: "sugestao", rotulo: "Com sugestão", n: contagem.sugestao },
    { id: "ligados", rotulo: "Ligados", n: contagem.ligado },
    { id: "sem_estoque", rotulo: "Não é de estoque", n: contagem.sem_estoque },
    { id: "todos", rotulo: "Todos", n: itens.length },
  ];

  return (
    <Modal open onClose={onClose} title="Conferir itens das notas de fornecedor" wide>
      <p className="mb-3 text-sm text-slate-600">
        Cada linha é um item que a MF comprou (fornecedor + código dele). Ligue ao produto do ERP uma vez: o fornecedor e o último preço entram
        no produto e as próximas notas desse item entram sozinhas no estoque. <b>Ligar aqui não mexe no estoque.</b>
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        {unidades.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Empresa</span>
            <select className="input" value={unidade} onChange={(e) => { setUnidade(e.target.value); setLimite(POR_VEZ); }}>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo} · {u.nome}</option>)}
              <option value="">Todas</option>
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Notas de</span>
          <select className="input" value={periodo} onChange={(e) => { setPeriodo(e.target.value); setLimite(POR_VEZ); }}>
            <option value="ano">{new Date().getFullYear()}</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="tudo">Todas</option>
          </select>
        </label>
        <label className="col-span-2 block sm:min-w-64 sm:flex-1">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Buscar</span>
          <span className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_VEZ); }} placeholder="Item, código, fornecedor, NCM" />
          </span>
        </label>
      </div>
      <div className="faixa-chips mb-3" role="tablist" aria-label="Situação dos itens">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => { setFiltro(f.id); setLimite(POR_VEZ); setSel(new Set()); }}
            className={chip(filtro === f.id, "border-transparent bg-modulo-escuro text-white")}>
            {f.rotulo} <span className="num opacity-80">{f.n}</span>
          </button>
        ))}
      </div>
      {semIa.length + iaAlta.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-sm text-violet-900">
          <Sparkles size={16} className="shrink-0 text-violet-700" aria-hidden />
          <span className="min-w-0 flex-1">A IA lê cada item e sugere: ligar a um produto, criar um novo ou marcar o que não é de estoque. Você confere e aplica.</span>
          {semIa.length > 0 && (
            <Button type="button" disabled={iaOcupada || ocupado} onClick={pedirIa}>
              {iaOcupada ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Sugestões da IA ({Math.min(semIa.length, LIMITE_ITENS)}{semIa.length > LIMITE_ITENS ? ` de ${semIa.length}` : ""})
            </Button>
          )}
          {iaAlta.length > 0 && <Button type="button" variant="secondary" disabled={ocupado} onClick={aplicarIaAlta}><CheckCheck size={15} /> Aplicar as {iaAlta.length} de confiança alta</Button>}
        </div>
      )}
      {(porCodigoBarras.length > 0 || sel.size > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm">
          {sel.size > 0 ? (<>
            <span className="font-semibold text-fg">{sel.size} {pl(sel.size, "selecionado", "selecionados")}:</span>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => marcarSelecionados("consumo")}>Uso e consumo</Button>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => marcarSelecionados("ativo")}>Bem da empresa</Button>
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => marcarSelecionados("servico")}>Serviço</Button>
            <Button type="button" variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
          </>) : (<>
            <span className="min-w-0 flex-1 text-slate-700">{porCodigoBarras.length} {pl(porCodigoBarras.length, "item tem", "itens têm")} o mesmo código de barras de um produto do ERP.</span>
            <Button type="button" disabled={ocupado} onClick={aceitarCodigoBarras}><CheckCheck size={15} /> Ligar {porCodigoBarras.length === 1 ? "este" : `os ${porCodigoBarras.length}`}</Button>
          </>)}
        </div>
      )}

      {isLoading && <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Lendo os itens das notas…</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não deu para ler os itens: {(error as Error).message}</p>}
      {!isLoading && !error && !lista.length && <p className="py-8 text-center text-sm text-slate-500">Nenhum item aqui{filtro === "pendentes" ? ": tudo ligado ou marcado neste período 🎉" : "."}</p>}

      <ul className="space-y-2" aria-label="Itens das notas">
        {visiveis.map((i) => (
          <LinhaItem key={chaveItem(i)} item={i} produtos={produtos} porId={porId} ocupado={ocupado} ia={ia.get(chaveItem(i))}
            selecionado={sel.has(chaveItem(i))} aoSelecionar={() => setSel((s) => { const n = new Set(s); const k = chaveItem(i); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
            gravar={gravar} aoCriar={(nome, tipo) => setCriando({ item: i, nome, tipo })} />
        ))}
      </ul>
      {lista.length > limite && (
        <div className="mt-3 text-center"><Button type="button" variant="secondary" onClick={() => setLimite(limite + POR_VEZ)}>Mostrar mais ({lista.length - limite})</Button></div>
      )}
      {criando && <CriarProdutoItem item={criando.item} nomeInicial={criando.nome} tipoInicial={criando.tipo} produtos={produtosTodos} onClose={() => setCriando(null)}
        onCriado={(id, fator) => { const it = criando.item; setCriando(null); gravar([{ item: it, acao: "produto", produto_id: id, fator }], "Produto criado e ligado"); }} />}
    </Modal>
  );
}

function LinhaItem({ item: i, produtos, porId, ocupado, ia, selecionado, aoSelecionar, gravar, aoCriar }: {
  item: ItemNota; produtos: Produto[]; porId: Map<string, Produto>; ocupado: boolean; ia?: SugestaoItemIA; selecionado: boolean; aoSelecionar: () => void;
  gravar: (a: Acao[], ok: string) => void; aoCriar: (nome?: string | null, tipo?: string | null) => void;
}) {
  const s = situacaoItem(i);
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [fator, setFator] = useState(String(i.fator ?? 1));
  const [trocando, setTrocando] = useState(false);
  const embalagem = unidadeDeEmbalagem(i.unidade);
  const sugestao = i.sugestao_id ? porId.get(i.sugestao_id) : null;
  // sugestão pelo nome só para os itens que aparecem e ainda não estão ligados
  const peloNome = useMemo(() => (s === "pendente" || s === "sugestao" || trocando)
    ? sugerirPorNome(i.descricao, produtos, 3).filter((x) => x.produto.id !== i.sugestao_id && x.produto.id !== i.produto_id).slice(0, 2) : [],
  [s, trocando, i.descricao, i.sugestao_id, i.produto_id, produtos]);
  const ligar = (p: Produto, f = 1) => gravar([{ item: i, acao: "produto", produto_id: p.id, fator: f }], `Ligado a ${p.descricao}`);
  function escolher(p: Produto) {
    if (!embalagem) return ligar(p);
    setEscolhido(p);
    setFator("1");
  }
  const ligado = i.produto_id ? porId.get(i.produto_id) : null;
  const aberto = s === "pendente" || s === "sugestao" || trocando;

  return (
    <li className={`flex flex-col gap-3 rounded-xl border p-3 lg:flex-row lg:items-start ${s === "ligado" ? "border-emerald-200 bg-emerald-50/40" : s === "sem_estoque" ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-surface"}`}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {!i.produto_id && <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selecionado} onChange={aoSelecionar} aria-label={`Selecionar ${i.descricao ?? i.codigo}`} />}
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <div className="font-semibold leading-snug text-fg">{i.descricao}</div>
          <div className="text-xs text-slate-500">Cód. {i.codigo}{i.ncm ? ` · NCM ${i.ncm}` : ""}{i.ean ? ` · EAN ${i.ean}` : ""}</div>
          <div className="mt-0.5 text-xs text-slate-600">
            <b className="font-semibold">{i.fornecedor ?? "Fornecedor"}</b> · {i.notas} {pl(i.notas, "nota", "notas")} · {qtd(i.quantidade)} {i.unidade ?? ""}
            {i.ultimo_valor != null && <> · último <b className="num">{brl(Number(i.ultimo_valor))}</b>{i.ultima_data ? ` em ${dataBR(i.ultima_data)}` : ""}</>}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-2 lg:w-[48%]">
        {s === "ligado" && !trocando && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-emerald-800"><Check size={15} className="shrink-0" /> <span className="min-w-0">Ligado a {ligado?.descricao ?? "produto"}</span></span>
            {Number(i.fator) !== 1 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">fator {qtd(i.fator)}</span>}
            <Button type="button" variant="ghost" onClick={() => setTrocando(true)}>Trocar</Button>
          </div>
        )}
        {s === "sem_estoque" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{NOME_SEM_ESTOQUE[i.sem_estoque!]}</span>
            <Button type="button" variant="ghost" disabled={ocupado} onClick={() => gravar([{ item: i, acao: "pendente" }], "Item voltou para a lista")}><Undo2 size={14} /> Voltar para a lista</Button>
          </div>
        )}
        {aberto && (<>
          {ia && <SugestaoIa ia={ia} produto={ia.produto_id ? porId.get(ia.produto_id) : undefined} ocupado={ocupado}
            aplicar={() => {
              if (ia.decisao === "ligar") { const p = porId.get(ia.produto_id!); if (p) gravar([{ item: i, acao: "produto", produto_id: p.id, fator: ia.fator }], `Ligado a ${p.descricao}`); }
              else if (ia.decisao === "criar") aoCriar(ia.nome_novo, ia.tipo_novo);
              else if (ia.decisao !== "duvida") gravar([{ item: i, acao: ia.decisao }], `Marcado como ${NOME_SEM_ESTOQUE[ia.decisao].toLowerCase()}`);
            }} />}
          {sugestao && s === "sugestao" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-sm text-sky-900">
              <span className="min-w-0 flex-1"><b>{sugestao.descricao}</b> <span className="text-xs">({i.sugestao_motivo})</span></span>
              <Button type="button" disabled={ocupado} onClick={() => escolher(sugestao)}><Link2 size={14} /> Ligar</Button>
            </div>
          )}
          {peloNome.map(({ produto: p }) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 text-slate-700">Parecido: <b className="text-fg">{p.descricao}</b></span>
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => escolher(p)}><Link2 size={14} /> Ligar</Button>
            </div>
          ))}
          {escolhido ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-brand/40 bg-brand/5 p-2 text-sm">
              <span className="min-w-0 flex-1 basis-full font-semibold text-fg">→ {escolhido.descricao}</span>
              <label className="block">
                <span className="mb-0.5 block text-xs text-slate-600">Quantas unidades vêm em 1 {i.unidade ?? "item"}?</span>
                <input className="input num w-28" inputMode="decimal" value={fator} onChange={(e) => setFator(e.target.value)} aria-label="Fator" />
              </label>
              <Button type="button" disabled={ocupado || !(Number(fator.replace(",", ".")) > 0)} onClick={() => ligar(escolhido, Number(fator.replace(",", ".")))}><Link2 size={14} /> Ligar</Button>
              <Button type="button" variant="ghost" onClick={() => setEscolhido(null)} aria-label="Cancelar"><X size={14} /></Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <ProdutoBusca produtos={produtos} onEscolher={escolher} placeholder="Ligar a um produto (nome, SKU, código)…" className="min-w-0 flex-1 basis-56" />
              {!i.produto_id && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => aoCriar()}><PackagePlus size={14} /> Criar produto</Button>}
              {!i.produto_id && (
                <select className="input w-auto text-sm" value="" disabled={ocupado} aria-label="Não é de estoque"
                  onChange={(e) => { const t = e.target.value as TipoSemEstoque; if (t) gravar([{ item: i, acao: t }], `Marcado como ${NOME_SEM_ESTOQUE[t].toLowerCase()}`); }}>
                  <option value="">Não é de estoque…</option>
                  {(Object.keys(NOME_SEM_ESTOQUE) as TipoSemEstoque[]).map((t) => <option key={t} value={t}>{NOME_SEM_ESTOQUE[t]}</option>)}
                </select>
              )}
              {trocando && <Button type="button" variant="ghost" onClick={() => setTrocando(false)}>Cancelar</Button>}
            </div>
          )}
          {embalagem && !escolhido && <p className="text-xs text-amber-700">A nota vem em {i.unidade}: ao ligar, informe quantas unidades vêm em cada {i.unidade} (fator).</p>}
        </>)}
      </div>
    </li>
  );
}

function SugestaoIa({ ia, produto, ocupado, aplicar }: { ia: SugestaoItemIA; produto?: Produto; ocupado: boolean; aplicar: () => void }) {
  const cor = ia.confianca === "alta" ? "bg-emerald-100 text-emerald-800" : ia.confianca === "media" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700";
  const alvo = ia.decisao === "ligar" ? produto?.descricao : ia.decisao === "criar" ? `"${ia.nome_novo}"` : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-sm text-violet-900">
      <Sparkles size={14} className="shrink-0 text-violet-700" aria-hidden />
      <span className="min-w-0 flex-1">
        <b>IA: {ROTULO_IA[ia.decisao]}</b>{alvo && <> <b className="text-fg">{alvo}</b></>}{ia.decisao === "ligar" && ia.fator !== 1 && <> · fator {qtd(ia.fator)}</>}
        {ia.motivo && <span className="block text-xs text-violet-800">{ia.motivo}</span>}
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>confiança {ia.confianca === "media" ? "média" : ia.confianca}</span>
      {ia.decisao !== "duvida" && (
        <Button type="button" disabled={ocupado} onClick={aplicar}>{ia.decisao === "criar" ? <PackagePlus size={14} /> : <Check size={14} />} {ia.decisao === "criar" ? "Criar" : "Aplicar"}</Button>
      )}
    </div>
  );
}

const TIPOS_NOVO = [
  { value: "insumo", label: "Componente de produção (uso interno)" },
  { value: "peca", label: "Peça de reposição (cliente compra)" },
  { value: "acessorio", label: "Acessório" },
];

function CriarProdutoItem({ item: i, nomeInicial, tipoInicial, produtos, onClose, onCriado }: {
  item: ItemNota; nomeInicial?: string | null; tipoInicial?: string | null; produtos: Produto[]; onClose: () => void; onCriado: (id: string, fator: number) => void;
}) {
  const eanLivre = i.ean && !produtos.some((p) => p.codigo_barras === i.ean) ? i.ean : "";
  const [nome, setNome] = useState(() => nomePadrao(nomeInicial || i.descricao || ""));
  const [tipo, setTipo] = useState(() => (TIPOS_NOVO.some((t) => t.value === tipoInicial) ? tipoInicial! : "insumo"));
  const [unidade, setUnidade] = useState(() => (unidadeDeEmbalagem(i.unidade) ? "UN" : unidadeDoErp(i.unidade)));
  const [fator, setFator] = useState("1");
  const [ncm, setNcm] = useState(String(i.ncm ?? "").replace(/\D/g, "").slice(0, 8));
  const [codigoBarras, setCodigoBarras] = useState(eanLivre);
  const [salvando, setSalvando] = useState(false);
  const f = Number(fator.replace(",", ".")) || 1;
  const custo = Math.round((Number(i.ultimo_valor ?? 0) / f) * 100) / 100;
  const parecido = useMemo(() => sugerirPorNome(nome, produtos.filter((p) => p.ativo !== false && !p.unificado_em), 1)[0], [nome, produtos]);

  async function criar() {
    if (nome.trim().length < 3) return notify("Escreva o nome do produto", "erro");
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("produtos").insert({
        descricao: nome.trim(), tipo, unidade, ncm: ncm.length === 8 ? ncm : null, preco_custo: custo, preco_venda: 0,
        codigo_barras: codigoBarras || null, fornecedor_padrao_id: i.fornecedor_id, vendavel: tipo !== "insumo", no_catalogo: false, ativo: true, origem: 0,
        estoque_minimo: 0, estoque_maximo: 0,
      }).select("id").single();
      if (error) throw error;
      onCriado(data.id, f);
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Criar produto a partir do item da nota">
      <p className="mb-3 text-sm text-slate-600">Da nota: <b className="text-fg">{i.descricao}</b> · {i.fornecedor} · cód. {i.codigo}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome do produto" className="sm:col-span-2"><input className="input" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} /></Field>
        {parecido && parecido.nota >= 0.5 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">Já existe um parecido: <b>{parecido.produto.descricao}</b>. Se for o mesmo, feche e use "Ligar".</p>
        )}
        <Field label="Cadastro">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_NOVO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </Field>
        <Field label="Unidade no estoque">
          <select className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)}>{UNIDADES.map(([v, l]) => <option key={v} value={v}>{v} · {l}</option>)}</select>
        </Field>
        {unidadeDeEmbalagem(i.unidade) && (
          <Field label={`Quantas unidades vêm em 1 ${i.unidade}?`}><input className="input num" inputMode="decimal" value={fator} onChange={(e) => setFator(e.target.value)} /></Field>
        )}
        <Field label="NCM"><input className="input num" inputMode="numeric" value={ncm} onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))} /></Field>
        <Field label="Código de barras (da nota)"><input className="input num" inputMode="numeric" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder={i.ean && !eanLivre ? "já usado por outro produto" : "sem código"} /></Field>
        <div className="text-sm sm:col-span-2">Custo: <b className="num">{brl(custo)}</b> <span className="text-xs text-slate-500">(último preço da nota{f !== 1 ? ` ÷ ${qtd(f)}` : ""}); {tipo === "insumo" ? "componente de produção: a venda fica igual ao custo." : "o preço de venda fica para a Formação de preço."}</span></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={salvando} onClick={criar}>{salvando ? <Loader2 size={15} className="animate-spin" /> : <PackagePlus size={15} />} Criar e ligar</Button>
      </div>
    </Modal>
  );
}
