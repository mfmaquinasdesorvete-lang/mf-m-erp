// Produção e compras → Cotações: pedido de cotação para vários fornecedores, resposta online de cada um
// (/cotacao/<código>, sem login), mapa comparativo item a item e os vencedores viram pedidos de compra.
// Os fornecedores sugeridos vêm do histórico de fornecimento de cada produto (notas, pedidos e cotações).
import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, Mail, MessageCircle, Plus, Send, Trash2, Trophy, XCircle } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction, supabase } from "@/lib/supabase";
import { brl, dataBR, somarDias, whatsappLink, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import type { Fornecedor, Produto } from "@/lib/types";
import { confirmar } from "@/components/Dialogos";

export type Cotacao = { id: string; numero: number; titulo: string | null; status: "rascunho" | "enviada" | "encerrada" | "cancelada"; prazo_resposta: string | null;
  entrega_desejada: string | null; observacoes: string | null; unidade_id: string | null; enviada_em: string | null; encerrada_em: string | null; created_at: string };
type CotItem = { id: string; cotacao_id: string; produto_id: string; descricao: string; quantidade: number; unidade: string | null; observacao: string | null; ordem: number };
type CotForn = { id: string; cotacao_id: string; fornecedor_id: string; token: string; email: string | null; status: "pendente" | "enviada" | "vista" | "respondida" | "recusou";
  enviado_em: string | null; visto_em: string | null; respondido_em: string | null; respondido_por: string | null; condicao_pagamento: string | null;
  prazo_entrega_dias: number | null; frete: number | null; frete_tipo: string | null; validade: string | null; observacoes: string | null; pedido_compra_id: string | null };
type CotResp = { id: string; cotacao_fornecedor_id: string; cotacao_item_id: string; preco_unitario: number | null; prazo_dias: number | null; disponivel: boolean; observacao: string | null; vencedor: boolean };
type Fornecimento = { id: string; produto_id: string; fornecedor_id: string; preco: number | null; preco_em: string | null; preferido: boolean; ativo: boolean };

const SITUACAO: Record<CotForn["status"], { rotulo: string; cor: string }> = {
  pendente: { rotulo: "não enviada", cor: "bg-slate-100 text-slate-700" },
  enviada: { rotulo: "enviada", cor: "bg-sky-100 text-sky-800" },
  vista: { rotulo: "abriu o link", cor: "bg-indigo-100 text-indigo-800" },
  respondida: { rotulo: "respondeu", cor: "bg-emerald-100 text-emerald-800" },
  recusou: { rotulo: "não vai cotar", cor: "bg-red-100 text-red-800" },
};
const STATUS: Record<Cotacao["status"], { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "rascunho", cor: "bg-slate-100 text-slate-700" },
  enviada: { rotulo: "aguardando respostas", cor: "bg-amber-100 text-amber-800" },
  encerrada: { rotulo: "encerrada", cor: "bg-emerald-100 text-emerald-800" },
  cancelada: { rotulo: "cancelada", cor: "bg-red-100 text-red-800" },
};
const nomeForn = (f?: Pick<Fornecedor, "nome"> & { nome_fantasia?: string | null } | null) => f ? (f.nome_fantasia?.trim() || f.nome) : "—";
const linkCotacao = (token: string) => `${window.location.origin}/cotacao/${token}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function Cotacoes({ podeEditar, inicial, aoGerarPedidos }: {
  podeEditar: boolean;
  /** itens para começar uma cotação nova (ex.: vindos da reposição de estoque) */
  inicial?: { produto_id: string; quantidade: number }[] | null;
  aoGerarPedidos: () => void;
}) {
  const { data: cotacoes = [] } = useRows<Cotacao>("cotacoes", { order: "numero", ascending: false });
  const { data: itens = [] } = useRows<CotItem>("cotacao_itens", { order: "ordem", ascending: true });
  const { data: forns = [] } = useRows<CotForn>("cotacao_fornecedores", { order: "created_at", ascending: true });
  const [filtro, setFiltro] = useState<"abertas" | "encerradas" | "todas">("abertas");
  const [nova, setNova] = useState<boolean>(!!inicial?.length);
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = cotacoes.filter((c) => filtro === "todas" || (filtro === "abertas" ? c.status === "rascunho" || c.status === "enviada" : c.status === "encerrada" || c.status === "cancelada"));
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-bold">Cotações com fornecedores</h2>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Filtrar cotações">
          {(["abertas", "encerradas", "todas"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
              className={`rounded-md px-3 py-1 font-semibold ${filtro === f ? "bg-modulo-escuro text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f}</button>
          ))}
        </div>
        {podeEditar && <Button type="button" onClick={() => setNova(true)}><Plus size={16} aria-hidden /> Nova cotação</Button>}
      </div>
      <p className="mb-3 text-sm text-slate-600">
        Peça preço a vários fornecedores de uma vez: cada um recebe um link para responder online, sem login. Quando responderem, o mapa compara item a item e
        os escolhidos viram pedidos de compra.
      </p>
      {!lista.length ? <p className="py-8 text-center text-sm text-slate-500">Nenhuma cotação {filtro === "todas" ? "ainda" : filtro === "abertas" ? "aberta" : "encerrada"}.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {lista.map((c) => {
            const fs = forns.filter((f) => f.cotacao_id === c.id);
            const resp = fs.filter((f) => f.status === "respondida").length;
            const n = itens.filter((i) => i.cotacao_id === c.id).length;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setAberta(c.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-slate-50">
                  <span className="font-bold">Nº {c.numero}</span>
                  <span className="min-w-0 flex-1 truncate">{c.titulo || `${n} ${n === 1 ? "item" : "itens"}`}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[c.status].cor}`}>{STATUS[c.status].rotulo}</span>
                  <span className="text-xs text-slate-600">{resp}/{fs.length} responderam</span>
                  <span className="text-xs text-slate-500">{dataBR(c.created_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {nova && <NovaCotacao inicial={inicial ?? []} onClose={() => setNova(false)} onCriada={(id) => { setNova(false); setAberta(id); }} />}
      {aberta && <CotacaoDetalhe id={aberta} podeEditar={podeEditar} onClose={() => setAberta(null)} aoGerarPedidos={() => { setAberta(null); aoGerarPedidos(); }} />}
    </Card>
  );
}

/** Nova cotação: itens (busca de produto) e fornecedores sugeridos pelo histórico de cada produto. */
/** Título da cotação pelos itens: "Pá Batedora + Vedação e Sanfona · out/2026" (nome curto, antes do " - "). */
export function tituloCotacao(descricoes: string[], hoje = new Date()): string {
  const nomes = descricoes.map((d) => d.split(/\s+[-–]\s+/)[0].trim()).filter(Boolean);
  if (!nomes.length) return "";
  const lista = nomes.length === 1 ? nomes[0] : nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : `${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;
  const mes = hoje.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "").replace(" de ", "/");
  return `${lista} · ${mes}`.slice(0, 150);
}

function NovaCotacao({ inicial, onClose, onCriada }: { inicial: { produto_id: string; quantidade: number }[]; onClose: () => void; onCriada: (id: string) => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const { data: fornecimentos = [] } = useRows<Fornecimento>("fornecimentos");
  const { padrao } = useUnidade();
  const invalidate = useInvalidate();
  // título: vem montado pelos itens (enquanto a pessoa não escreve outro)
  const [tituloDigitado, setTitulo] = useState<string | null>(null);
  const [prazo, setPrazo] = useState(somarDias(3));
  const [entrega, setEntrega] = useState("");
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<{ produto_id: string; quantidade: number }[]>(inicial);
  const [escolhidos, setEscolhidos] = useState<Set<string> | null>(null); // null = os sugeridos
  const [extra, setExtra] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ativos = useMemo(() => produtos.filter((p) => p.ativo !== false), [produtos]);
  const produto = (id: string) => produtos.find((p) => p.id === id);
  const titulo = tituloDigitado ?? tituloCotacao(linhas.map((l) => produto(l.produto_id)?.descricao ?? ""));
  // fornecedores que já venderam algum dos itens, por quantos itens cobrem
  const sugeridos = useMemo(() => {
    const ids = new Set(linhas.map((l) => l.produto_id));
    const m = new Map<string, { itens: Set<string>; preferido: number }>();
    for (const f of fornecimentos) {
      if (!f.ativo || !ids.has(f.produto_id)) continue;
      const x = m.get(f.fornecedor_id) ?? { itens: new Set<string>(), preferido: 0 };
      x.itens.add(f.produto_id); if (f.preferido) x.preferido++;
      m.set(f.fornecedor_id, x);
    }
    return [...m].map(([id, x]) => ({ id, cobre: x.itens.size, preferido: x.preferido }))
      .sort((a, b) => b.cobre - a.cobre || b.preferido - a.preferido).slice(0, 12);
  }, [linhas, fornecimentos]);
  const marcados = escolhidos ?? new Set(sugeridos.slice(0, 5).map((s) => s.id));
  const listaForn = [...new Set([...sugeridos.map((s) => s.id), ...marcados])];
  const alternar = (id: string) => { const n = new Set(marcados); if (n.has(id)) n.delete(id); else n.add(id); setEscolhidos(n); };

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!linhas.length) return notifyError(new Error("adicione ao menos um item"));
    if (!marcados.size) return notifyError(new Error("escolha ao menos um fornecedor"));
    setSalvando(true);
    try {
      const { data: c, error } = await supabase.from("cotacoes").insert({ titulo: titulo.trim() || null, prazo_resposta: prazo || null, entrega_desejada: entrega || null,
        observacoes: obs.trim() || null, unidade_id: padrao, status: "rascunho" }).select("id").single();
      if (error) throw error;
      const { error: e1 } = await supabase.from("cotacao_itens").insert(linhas.map((l, i) => {
        const p = produto(l.produto_id);
        return { cotacao_id: c.id, produto_id: l.produto_id, descricao: p?.descricao ?? "", quantidade: l.quantidade, unidade: p?.unidade ?? null, ordem: i };
      }));
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("cotacao_fornecedores").insert([...marcados].map((f) => ({
        cotacao_id: c.id, fornecedor_id: f, email: fornecedores.find((x) => x.id === f)?.email ?? null })));
      if (e2) throw e2;
      invalidate("cotacoes", "cotacao_itens", "cotacao_fornecedores");
      notify("Cotação criada: agora é só enviar aos fornecedores");
      onCriada(c.id);
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Nova cotação" wide>
      <form onSubmit={criar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Título (opcional)" className="sm:col-span-3"><input className="input" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: reposição de peças de outubro" /></Field>
          <Field label="Responder até"><input type="date" className="input" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Field>
          <Field label="Entrega desejada"><input type="date" className="input" value={entrega} onChange={(e) => setEntrega(e.target.value)} /></Field>
          <Field label="Observação para os fornecedores"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: frete CIF para Joinville" /></Field>
        </div>

        <section aria-labelledby="cot-itens">
          <h3 id="cot-itens" className="mb-1 font-semibold">Itens</h3>
          <ProdutoBusca produtos={ativos} placeholder="Produto a cotar: nome, código ou código do fabricante"
            onEscolher={(p) => setLinhas((l) => (l.some((x) => x.produto_id === p.id) ? l : [...l, { produto_id: p.id, quantidade: Number(p.compra_minima) || 1 }]))} />
          {linhas.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {linhas.map((l, k) => {
                const p = produto(l.produto_id);
                return (
                  <li key={l.produto_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1"><b>{p?.descricao}</b>{p?.codigo_fabricante && <span className="ml-2 text-xs text-slate-500">fab. {p.codigo_fabricante}</span>}</span>
                    <input className="input w-24 py-1 text-right" inputMode="decimal" aria-label={`Quantidade de ${p?.descricao}`} value={String(l.quantidade).replace(".", ",")}
                      onChange={(e) => { const q = Number(e.target.value.replace(",", ".")); if (q > 0) setLinhas((x) => x.map((y, i) => (i === k ? { ...y, quantidade: q } : y))); }} />
                    <span className="w-8 text-xs text-slate-500">{p?.unidade}</span>
                    <Button type="button" variant="ghost" className="!min-h-0 !px-2" aria-label={`Tirar ${p?.descricao}`} onClick={() => setLinhas((x) => x.filter((_, i) => i !== k))}><Trash2 size={15} aria-hidden /></Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="cot-forn">
          <h3 id="cot-forn" className="mb-1 font-semibold">Fornecedores</h3>
          {!linhas.length ? <p className="text-sm text-slate-500">Adicione os itens: os fornecedores que já venderam esses produtos aparecem aqui.</p> : (
            <>
              {!sugeridos.length && <p className="mb-2 text-sm text-slate-500">Nenhum fornecedor no histórico destes itens: escolha abaixo.</p>}
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {listaForn.map((id) => {
                  const f = fornecedores.find((x) => x.id === id);
                  const s = sugeridos.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <label className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm ${marcados.has(id) ? "border-modulo bg-modulo/10" : "border-slate-200"}`}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={marcados.has(id)} onChange={() => alternar(id)} />
                        <span className="min-w-0">
                          <b>{nomeForn(f)}</b>
                          <span className="block text-xs text-slate-500">
                            {s ? `já vendeu ${s.cobre} de ${linhas.length} ${linhas.length === 1 ? "item" : "itens"}` : "escolhido por você"}
                            {f?.email ? ` · ${f.email}` : " · sem e-mail (mande o link pelo WhatsApp)"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex gap-2">
                <select className="input" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Adicionar outro fornecedor">
                  <option value="">Adicionar outro fornecedor…</option>
                  {fornecedores.filter((f) => !listaForn.includes(f.id)).map((f) => <option key={f.id} value={f.id}>{nomeForn(f)}</option>)}
                </select>
                <Button type="button" variant="secondary" disabled={!extra} onClick={() => { const n = new Set(marcados); n.add(extra); setEscolhidos(n); setExtra(""); }}><Plus size={15} aria-hidden /> Incluir</Button>
              </div>
            </>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Criando…" : `Criar cotação (${linhas.length} ${linhas.length === 1 ? "item" : "itens"}, ${marcados.size} ${marcados.size === 1 ? "fornecedor" : "fornecedores"})`}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Uma cotação: envio aos fornecedores, situação de cada um e o mapa comparativo com a escolha dos vencedores. */
function CotacaoDetalhe({ id, podeEditar, onClose, aoGerarPedidos }: { id: string; podeEditar: boolean; onClose: () => void; aoGerarPedidos: () => void }) {
  const { data: cotacoes = [] } = useRows<Cotacao>("cotacoes", { order: "numero", ascending: false });
  const { data: todosItens = [] } = useRows<CotItem>("cotacao_itens", { order: "ordem", ascending: true });
  const { data: todosForns = [] } = useRows<CotForn>("cotacao_fornecedores", { order: "created_at", ascending: true });
  const { data: respostas = [] } = useRows<CotResp>("cotacao_respostas");
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const invalidate = useInvalidate();
  const [enviando, setEnviando] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [gerando, setGerando] = useState(false);
  const [extra, setExtra] = useState("");

  const c = cotacoes.find((x) => x.id === id);
  const itens = todosItens.filter((i) => i.cotacao_id === id);
  const forns = todosForns.filter((f) => f.cotacao_id === id);
  const fornecedor = (f: CotForn) => fornecedores.find((x) => x.id === f.fornecedor_id);
  const resp = (cf: string, item: string) => respostas.find((r) => r.cotacao_fornecedor_id === cf && r.cotacao_item_id === item);
  const responderam = forns.filter((f) => f.status === "respondida");
  const aberta = c?.status === "rascunho" || c?.status === "enviada";

  // vencedor padrão de cada item: o menor preço disponível
  const melhor = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of itens) {
      let best: { cf: string; p: number } | null = null;
      for (const f of responderam) {
        const r = resp(f.id, i.id);
        if (r?.disponivel && r.preco_unitario != null && (!best || Number(r.preco_unitario) < best.p)) best = { cf: f.id, p: Number(r.preco_unitario) };
      }
      if (best) m[i.id] = best.cf;
    }
    return m;
  }, [itens, responderam, respostas]); // eslint-disable-line react-hooks/exhaustive-deps
  const escolhido = (item: string) => (item in escolha ? escolha[item] : melhor[item]) ?? "";
  const totalDe = (cf: string, so?: boolean) => r2(itens.reduce((s, i) => {
    const r = resp(cf, i.id);
    if (!r?.disponivel || r.preco_unitario == null || (so && escolhido(i.id) !== cf)) return s;
    return s + Number(r.preco_unitario) * Number(i.quantidade);
  }, 0));
  const totalEscolhido = r2(responderam.reduce((s, f) => s + totalDe(f.id, true), 0));
  const fretesEscolhidos = r2(responderam.filter((f) => totalDe(f.id, true) > 0).reduce((s, f) => s + Number(f.frete ?? 0), 0));

  if (!c) return null;

  async function enviar(ids?: string[]) {
    setEnviando(true);
    try {
      const r = await callFunction<{ enviados: number; sem_email: string[]; falhas: string[] }>("cotacao-enviar", { cotacao_id: id, fornecedores: ids ?? [] });
      notify(r.enviados ? `Cotação enviada a ${r.enviados} ${r.enviados === 1 ? "fornecedor" : "fornecedores"}` : "Nenhum e-mail enviado");
      if (r.sem_email.length) notifyError(new Error(`Sem e-mail: ${r.sem_email.join(", ")}. Mande o link pelo WhatsApp.`));
      if (r.falhas.length) notifyError(new Error(r.falhas.join("; ")));
      invalidate("cotacoes", "cotacao_fornecedores");
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }
  async function marcarEnviada(cf: string) {
    const { error } = await supabase.rpc("cotacao_marcar_enviada", { p_ids: [cf] });
    if (error) return notifyError(error);
    invalidate("cotacoes", "cotacao_fornecedores");
  }
  async function copiar(f: CotForn) {
    try { await navigator.clipboard.writeText(linkCotacao(f.token)); notify("Link copiado"); } catch { notifyError(new Error("não deu para copiar: segure o link para copiar")); }
  }
  async function incluir() {
    if (!extra) return;
    const { error } = await supabase.from("cotacao_fornecedores").insert({ cotacao_id: id, fornecedor_id: extra, email: fornecedores.find((x) => x.id === extra)?.email ?? null });
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("este fornecedor já está na cotação") : error);
    setExtra(""); invalidate("cotacao_fornecedores");
  }
  async function cancelar() {
    if (!(await confirmar("Cancelar esta cotação? Os fornecedores não conseguem mais responder."))) return;
    const { error } = await supabase.from("cotacoes").update({ status: "cancelada", encerrada_em: new Date().toISOString() }).eq("id", id);
    if (error) return notifyError(error);
    invalidate("cotacoes"); onClose();
  }
  async function gerar() {
    const escolhas = itens.map((i) => ({ item_id: i.id, cotacao_fornecedor_id: escolhido(i.id) })).filter((x) => x.cotacao_fornecedor_id);
    if (!escolhas.length) return notifyError(new Error("escolha o fornecedor de ao menos um item"));
    const sem = itens.length - escolhas.length;
    if (!(await confirmar(`Gerar ${new Set(escolhas.map((e) => e.cotacao_fornecedor_id)).size} ${pl(new Set(escolhas.map((e) => e.cotacao_fornecedor_id)).size, "pedido", "pedidos")} de compra com ${escolhas.length} ${escolhas.length === 1 ? "item" : "itens"}?${sem ? ` ${sem} ${pl(sem, "item", "itens")} ficam de fora (sem preço escolhido).` : ""} A cotação será encerrada.`))) return;
    setGerando(true);
    try {
      const { data, error } = await supabase.rpc("cotacao_gerar_pedidos", { p_cotacao: id, p_escolhas: escolhas });
      if (error) throw error;
      const ps = (data ?? []) as { numero: number; fornecedor: string }[];
      notify(`${pl(ps.length, "Pedido de compra gerado", "Pedidos de compra gerados")}: ${ps.map((p) => `#${p.numero} ${p.fornecedor}`).join(", ")}`);
      invalidate("cotacoes", "cotacao_fornecedores", "cotacao_respostas", "pedidos_compra", "pedido_compra_itens");
      aoGerarPedidos();
    } catch (e) { notifyError(e); } finally { setGerando(false); }
  }

  const pendentes = forns.filter((f) => f.status === "pendente");
  const pendentesEmail = pendentes.filter((f) => f.email || fornecedor(f)?.email);
  const semEmail = pendentes.length - pendentesEmail.length;
  const mensagemZap = (f: CotForn) => `Olá, ${nomeForn(fornecedor(f))}! Pode cotar ${itens.length === 1 ? "este item" : `estes ${itens.length} itens`} para a MF Máquinas (cotação nº ${c.numero})? É só abrir o link e informar os preços: ${linkCotacao(f.token)}`;

  return (
    <Modal open onClose={onClose} title={`Cotação nº ${c.numero}${c.titulo ? ` · ${c.titulo}` : ""}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[c.status].cor}`}>{STATUS[c.status].rotulo}</span>
          {c.prazo_resposta && <span className="text-slate-600">responder até <b>{dataBR(c.prazo_resposta)}</b></span>}
          {c.entrega_desejada && <span className="text-slate-600">· entrega desejada {dataBR(c.entrega_desejada)}</span>}
          {podeEditar && aberta && pendentes.length > 0 && (
            <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {semEmail > 0 && <span className="text-xs text-slate-600">{semEmail} sem e-mail: mande o link pelo WhatsApp</span>}
              {pendentesEmail.length > 0 && (
                <Button type="button" disabled={enviando} onClick={() => enviar(pendentesEmail.map((f) => f.id))}><Send size={16} aria-hidden /> {enviando ? "Enviando…" : `Enviar por e-mail (${pendentesEmail.length})`}</Button>
              )}
            </span>
          )}
        </div>

        <section aria-labelledby="det-forn">
          <h3 id="det-forn" className="mb-1 font-semibold">Fornecedores</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {forns.map((f) => {
              const fo = fornecedor(f);
              const zap = fo?.whatsapp || fo?.telefone;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><b>{nomeForn(fo)}</b><span className="block truncate text-xs text-slate-500">{f.email || fo?.email || "sem e-mail"}{f.respondido_por ? ` · respondido por ${f.respondido_por}` : ""}</span></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SITUACAO[f.status].cor}`}>{SITUACAO[f.status].rotulo}</span>
                  {aberta && podeEditar && (
                    <span className="flex gap-1">
                      <Button type="button" variant="ghost" className="!min-h-0 !px-2" title="Copiar o link de resposta" aria-label={`Copiar link de ${nomeForn(fo)}`} onClick={() => copiar(f)}><Copy size={15} aria-hidden /></Button>
                      {zap && <a className="inline-flex items-center rounded-lg px-2 text-emerald-700 hover:bg-slate-100" href={whatsappLink(zap, mensagemZap(f))} target="_blank" rel="noreferrer"
                        title="Mandar o link pelo WhatsApp" aria-label={`WhatsApp para ${nomeForn(fo)}`} onClick={() => f.status === "pendente" && marcarEnviada(f.id)}><MessageCircle size={16} aria-hidden /></a>}
                      {(f.email || fo?.email) && f.status !== "respondida" && f.status !== "recusou" && (
                        <Button type="button" variant="ghost" className="!min-h-0 !px-2" title={f.status === "pendente" ? "Enviar por e-mail" : "Reenviar por e-mail"} aria-label={`E-mail para ${nomeForn(fo)}`} disabled={enviando} onClick={() => enviar([f.id])}><Mail size={15} aria-hidden /></Button>
                      )}
                    </span>
                  )}
                  {f.status === "recusou" && f.observacoes && <span className="w-full text-xs text-slate-500">Motivo: {f.observacoes}</span>}
                </li>
              );
            })}
          </ul>
          {aberta && podeEditar && (
            <div className="mt-2 flex gap-2">
              <select className="input" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Incluir fornecedor na cotação">
                <option value="">Incluir outro fornecedor…</option>
                {fornecedores.filter((f) => !forns.some((x) => x.fornecedor_id === f.id)).map((f) => <option key={f.id} value={f.id}>{nomeForn(f)}</option>)}
              </select>
              <Button type="button" variant="secondary" disabled={!extra} onClick={incluir}><Plus size={15} aria-hidden /> Incluir</Button>
            </div>
          )}
        </section>

        <section aria-labelledby="det-mapa">
          <h3 id="det-mapa" className="mb-1 font-semibold">Mapa comparativo</h3>
          {!responderam.length ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              {itens.length} {itens.length === 1 ? "item" : "itens"}: {itens.map((i) => `${Number(i.quantidade).toLocaleString("pt-BR")} ${i.unidade ?? ""} ${i.descricao}`).join("; ")}.
              <br />Os preços aparecem aqui assim que os fornecedores responderem.
            </p>
          ) : (
            <>
              {/* computador: tabela item × fornecedor */}
              <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Item</th>
                      {responderam.map((f) => <th key={f.id} className="th text-right">{nomeForn(fornecedor(f))}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itens.map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2"><b>{i.descricao}</b><span className="block text-xs text-slate-500">{Number(i.quantidade).toLocaleString("pt-BR")} {i.unidade}</span></td>
                        {responderam.map((f) => {
                          const r = resp(f.id, i.id);
                          const ok = r?.disponivel && r.preco_unitario != null;
                          const eh = escolhido(i.id) === f.id;
                          return (
                            <td key={f.id} className={`px-3 py-2 text-right ${eh ? "bg-emerald-50" : ""}`}>
                              {!ok ? <span className="text-xs text-slate-500">{r && !r.disponivel ? "não tem" : "—"}</span> : (
                                <label className="flex cursor-pointer items-start justify-end gap-2">
                                  <span>
                                    <span className="num block font-semibold">{brl(r!.preco_unitario)}</span>
                                    <span className="num block text-xs text-slate-500">{brl(Number(r!.preco_unitario) * Number(i.quantidade))}{r!.prazo_dias != null ? ` · ${r!.prazo_dias}d` : ""}</span>
                                    {melhor[i.id] === f.id && <span className="text-[11px] font-semibold text-emerald-700">menor preço</span>}
                                  </span>
                                  {aberta && <input type="radio" className="mt-1 h-4 w-4" name={`esc-${i.id}`} checked={eh} aria-label={`Comprar ${i.descricao} de ${nomeForn(fornecedor(f))}`}
                                    onChange={() => setEscolha((e) => ({ ...e, [i.id]: f.id }))} />}
                                  {!aberta && r!.vencedor && <Trophy size={14} className="mt-1 text-emerald-700" aria-label="vencedor" />}
                                </label>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-xs">
                    <tr><td className="px-3 py-1.5 font-semibold">Todos os itens</td>{responderam.map((f) => <td key={f.id} className="num px-3 py-1.5 text-right font-semibold">{brl(totalDe(f.id))}</td>)}</tr>
                    <tr><td className="px-3 py-1.5">Frete</td>{responderam.map((f) => <td key={f.id} className="num px-3 py-1.5 text-right">{f.frete != null ? brl(f.frete) : "—"}{f.frete_tipo ? ` ${f.frete_tipo}` : ""}</td>)}</tr>
                    <tr><td className="px-3 py-1.5">Pagamento</td>{responderam.map((f) => <td key={f.id} className="px-3 py-1.5 text-right">{f.condicao_pagamento ?? "—"}</td>)}</tr>
                    <tr><td className="px-3 py-1.5">Entrega</td>{responderam.map((f) => <td key={f.id} className="px-3 py-1.5 text-right">{f.prazo_entrega_dias != null ? `${f.prazo_entrega_dias} dias` : "—"}</td>)}</tr>
                    <tr><td className="px-3 py-1.5">Validade</td>{responderam.map((f) => <td key={f.id} className="px-3 py-1.5 text-right">{f.validade ? dataBR(f.validade) : "—"}</td>)}</tr>
                  </tfoot>
                </table>
              </div>
              {/* celular: um cartão por item */}
              <ul className="space-y-2 md:hidden">
                {itens.map((i) => (
                  <li key={i.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1 font-semibold">{i.descricao} <span className="text-xs font-normal text-slate-500">· {Number(i.quantidade).toLocaleString("pt-BR")} {i.unidade}</span></div>
                    <ul className="space-y-1">
                      {responderam.map((f) => {
                        const r = resp(f.id, i.id);
                        const ok = r?.disponivel && r.preco_unitario != null;
                        return (
                          <li key={f.id}>
                            <label className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${escolhido(i.id) === f.id ? "bg-emerald-50" : ""}`}>
                              {aberta && ok && <input type="radio" className="h-4 w-4" name={`esc-m-${i.id}`} checked={escolhido(i.id) === f.id} onChange={() => setEscolha((e) => ({ ...e, [i.id]: f.id }))} />}
                              <span className="min-w-0 flex-1 truncate">{nomeForn(fornecedor(f))}</span>
                              <span className="num text-right">{ok ? <>{brl(r!.preco_unitario)}{melhor[i.id] === f.id && <span className="ml-1 text-[11px] font-semibold text-emerald-700">menor</span>}</> : <span className="text-xs text-slate-500">{r && !r.disponivel ? "não tem" : "—"}</span>}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
              {aberta && podeEditar && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 size={18} aria-hidden />
                  <span className="flex-1">Escolhidos: <b className="num">{brl(totalEscolhido)}</b>{fretesEscolhidos > 0 && <> + frete <b className="num">{brl(fretesEscolhidos)}</b></>}</span>
                  <Button type="button" disabled={gerando} onClick={gerar}>{gerando ? "Gerando…" : "Gerar pedidos de compra"}</Button>
                </div>
              )}
            </>
          )}
        </section>

        {aberta && podeEditar && (
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <Button type="button" variant="ghost" onClick={cancelar}><XCircle size={16} aria-hidden /> Cancelar cotação</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
