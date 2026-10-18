// Ficha técnica (Produção): cada máquina e cada peça fabricada aqui (pá, eixo, subconjunto) com
//  * as peças separadas por grupo — estrutura, refrigeração, elétrica, mecânica, cilindro e pás, acabamento — com o custo
//    e a parte de cada grupo no custo da máquina;
//  * as etapas de produção, marcando as feitas fora (ex.: a pá vai para a injeção e volta para o acabamento);
//  * como cada item chega: comprado pronto, fabricado aqui ou fabricado com etapa em terceiro.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronRight, Factory, Layers, ListOrdered, Plus, Search, Trash2, Truck } from "lucide-react";
import { Button, Card, Field, Tabs } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { sincronizarItens } from "@/lib/itens";
import { brl, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { contemNaEstrutura, custoEstrutura, niveis, temFicha, type LinhaFicha } from "@/lib/estrutura";
import { ehKitAberto } from "@/lib/kits";
import {
  custoPorGrupo, etapasDoProduto, grupoDaLinha, GRUPOS, gruposDosCalculosInternos, nomeEtapaOp, ORIGENS,
  type GrupoFicha, type OrigemProducao,
} from "@/lib/fichaGrupos";
import type { EtapaProducao, KitComponente, Produto } from "@/lib/types";

type Componente = { id?: string; produto_id: string; componente_id: string; quantidade: number; grupo?: string | null };
type Visao = "pecas" | "etapas";

const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`;

/** Modelos de etapas para começar (dá para mudar tudo depois). */
const MODELO_MAQUINA: EtapaProducao[] = [
  { nome: "Receber a estrutura pronta", externa: true, quem: "empresa terceirizada" },
  { nome: "Montar a refrigeração" }, { nome: "Montar a parte elétrica" }, { nome: "Montar a mecânica e o cilindro" },
  { nome: "Vácuo, carga de gás e teste" }, { nome: "Acabamento, limpeza e embalagem" },
];
// peça com etapa fora (ex.: pá batedora): tornearia aqui → injeção terceirizada em outro estado → acabamento aqui
const MODELO_TERCEIRO: EtapaProducao[] = [
  { nome: "Tornearia (aqui na fábrica)" }, { nome: "Injeção (terceirizada)", externa: true, quem: "empresa de injeção", dias: 15 },
  { nome: "Receber da injeção e conferir" }, { nome: "Acabamento (aqui na fábrica)" },
];

export function FichaTecnica() {
  const { pode } = usePerfil();
  const editavel = pode("editar_producao");
  const invalidate = useInvalidate();
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: todas = [] } = useRows<LinhaFicha & { grupo?: string | null }>("produto_componentes", { select: "produto_id, componente_id, quantidade, grupo", order: "produto_id" });
  // kit na ficha (Chave Extratora, Mecânica…) sai pelas peças dele e entra no custo por elas
  const { data: kits = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const vale = (p: Produto) => p.ativo && !p.unificado_em;
  const maquinas = produtos.filter((p) => p.tipo === "maquina" && vale(p));
  const [novos, setNovos] = useState<string[]>([]);
  const fabricados = produtos.filter((p) => p.tipo !== "maquina" && (novos.includes(p.id) || (vale(p)
    && (temFicha(todas, p.id) || !!p.subconjunto_estocado || p.origem_producao === "fabricado" || p.origem_producao === "terceirizado"))));
  const [busca, setBusca] = useState("");
  const [selId, setSelId] = useState<string>("");
  const item = produtos.find((p) => p.id === (selId || maquinas[0]?.id || fabricados[0]?.id));
  const { data: comps } = useQuery({
    queryKey: ["produto_componentes", item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data, error } = await supabase.from("produto_componentes").select("*").eq("produto_id", item!.id);
      if (error) throw error;
      return data as Componente[];
    },
  });
  const [lista, setLista] = useState<Componente[]>([]);
  useEffect(() => { setLista(comps ?? []); }, [comps]);
  const [visao, setVisao] = useState<Visao>("pecas");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [fechados, setFechados] = useState<Set<GrupoFicha>>(new Set());
  const [escolhendo, setEscolhendo] = useState(false);
  const [mudou, setMudou] = useState(false);
  useEffect(() => { setMudou(false); setAbertos(new Set()); }, [item?.id]);

  const fichas = useMemo(() => item ? [...todas.filter((f) => f.produto_id !== item.id), ...lista.map((c) => ({ ...c, produto_id: item.id }))] : todas,
    [todas, lista, item]);
  const ci = useMemo(() => gruposDosCalculosInternos(kits, (id) => produtos.find((p) => p.id === id)?.sku), [kits, produtos]);
  const custoDe = (id: string) => temFicha(fichas, id) || ehKitAberto(id, kits) ? custoEstrutura(fichas, produtos, id, kits) : Number(produtos.find((p) => p.id === id)?.preco_custo ?? 0);
  const linhas = lista.map((c, k) => {
    const peca = produtos.find((p) => p.id === c.componente_id);
    const custoUn = custoDe(c.componente_id);
    return { c, k, peca, custoUn, custo: custoUn * Number(c.quantidade), grupo: grupoDaLinha(c, peca, ci) };
  });
  const custo = item ? custoEstrutura(fichas, produtos, item.id, kits) : 0;
  const grupos = custoPorGrupo(linhas);
  const semCusto = linhas.filter((l) => !(l.custoUn > 0)).length;
  const margem = item && Number(item.preco_venda) ? (Number(item.preco_venda) - custo) / Number(item.preco_venda) : 0;
  const usadoEm = item ? [...new Set(todas.filter((f) => f.componente_id === item.id).map((f) => f.produto_id))].map((id) => produtos.find((p) => p.id === id)?.descricao).filter(Boolean) : [];
  const nNiveis = item ? niveis(fichas, item.id) : 0;

  const mudarLista = (l: Componente[]) => { setLista(l); setMudou(true); };
  async function salvar() {
    try {
      const ids = await sincronizarItens("produto_componentes", "produto_id", item!.id, lista,
        (c) => ({ componente_id: c.componente_id, quantidade: c.quantidade, grupo: c.grupo ?? null }), { chaveNatural: "componente_id" });
      setLista(lista.map((c, k) => ({ ...c, id: ids[k] || c.id })));
      setMudou(false);
      notify("Ficha técnica salva");
      invalidate("produto_componentes", "necessidade_producao");
    } catch (e) { notifyError(e); invalidate("produto_componentes"); }
  }
  async function tirarTodos() {
    if (!item || !(await confirmar(`Tirar todos os ${comps?.length ?? 0} itens da ficha de "${item.descricao}"? A ficha fica vazia (dá para montar de novo depois).`))) return;
    const { error } = await supabase.from("produto_componentes").delete().eq("produto_id", item.id);
    if (error) return notifyError(error);
    setLista([]); setMudou(false);
    notify("Ficha técnica esvaziada");
    invalidate("produto_componentes", "necessidade_producao");
  }
  async function gravarProduto(patch: Partial<Produto>, ok: string) {
    const { error } = await supabase.from("produtos").update(patch).eq("id", item!.id);
    if (error) return notifyError(error);
    notify(ok);
    invalidate("produtos", "necessidade_producao");
  }

  const filtra = (p: Produto) => !busca.trim() || `${p.descricao} ${p.sku ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase());
  const botaoNav = (m: Produto) => {
    const n = todas.filter((f) => f.produto_id === m.id).length;
    return (
      <button key={m.id} type="button" onClick={() => setSelId(m.id)} aria-current={m.id === item?.id ? "true" : undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${m.id === item?.id ? "bg-brand-light font-semibold text-fg" : "hover:bg-slate-50"}`}>
        <span className="min-w-0">{m.descricao}</span>
        <span className={`shrink-0 rounded px-1.5 text-[11px] ${n ? "bg-slate-100 text-slate-600" : "bg-amber-100 font-semibold text-amber-800"}`}>
          {n ? `${n} ${pl(n, "item", "itens")}` : "sem ficha"}
        </span>
      </button>
    );
  };
  const novoFabricado = escolhendo ? (
    <ProdutoBusca placeholder="Qual peça é fabricada aqui? (nome ou SKU)"
      produtos={produtos.filter((p) => p.tipo !== "maquina" && vale(p) && !fabricados.some((f) => f.id === p.id))}
      onEscolher={(p) => { setNovos([...novos, p.id]); setSelId(p.id); setEscolhendo(false); setVisao("pecas"); }}
      detalhe={(p) => [p.sku, `estoque ${Number(p.estoque_atual)}`].filter(Boolean).join(" · ")} />
  ) : (
    <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => setEscolhendo(true)}><Plus size={16} aria-hidden /> Peça fabricada aqui (pá, eixo, subconjunto…)</Button>
  );

  if (!maquinas.length && !fabricados.length) return <p className="py-8 text-center text-slate-500">Cadastre as máquinas em Estoque (tipo “Máquina”) para montar a ficha técnica.</p>;
  const ehMaquina = item?.tipo === "maquina";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Field label="Máquina ou peça fabricada" className="lg:hidden">
        <select className="input" value={item?.id ?? ""} onChange={(e) => setSelId(e.target.value)}>
          <optgroup label="Máquinas">{maquinas.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}</optgroup>
          {fabricados.length > 0 && <optgroup label="Fabricados aqui">{fabricados.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}</optgroup>}
        </select>
      </Field>
      <Card className="hidden p-2 lg:col-span-1 lg:block">
        <label className="relative mb-1 block px-1 pt-1">
          <span className="sr-only">Procurar máquina ou peça</span>
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input py-1.5 pl-8 text-sm" placeholder="Procurar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <nav aria-label="Máquinas e peças fabricadas">
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-semibold uppercase text-slate-500"><Factory size={13} aria-hidden /> Máquinas</div>
          {maquinas.filter(filtra).map(botaoNav)}
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-xs font-semibold uppercase text-slate-500"><Layers size={13} aria-hidden /> Fabricados aqui</div>
          {fabricados.filter(filtra).map(botaoNav)}
          {!fabricados.length && <p className="px-3 pb-2 text-xs text-slate-500">Pás, eixos, painel elétrico… peça que a MF faz (aqui ou com etapa em terceiro) e usa na máquina.</p>}
        </nav>
        {editavel && <div className="mt-2 border-t border-slate-100 p-1 pt-2">{novoFabricado}</div>}
      </Card>
      {editavel && <div className="lg:hidden">{novoFabricado}</div>}

      {item && (
        <div className="space-y-4 lg:col-span-2">
          {/* resumo: custo, preço, margem e a parte de cada grupo */}
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id="ficha-titulo" className="text-base font-bold text-fg">{item.descricao}</h3>
                <p className="text-sm text-slate-500">
                  {item.sku ? `${item.sku} · ` : ""}{lista.length} {pl(lista.length, "item", "itens")} para <b>uma</b> unidade{nNiveis > 1 ? ` · ${nNiveis} níveis` : ""}
                  {!ehMaquina && item.origem_producao ? ` · ${ORIGENS.find((o) => o.id === item.origem_producao)?.nome.toLowerCase()}` : ""}
                </p>
              </div>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-right text-sm">
                <div><dt className="text-xs text-slate-500">Custo{nNiveis > 1 ? " (todos os níveis)" : ""}</dt><dd className="num text-lg font-bold text-fg">{brl(custo)}</dd></div>
                {Number(item.preco_venda) > 0 && <>
                  <div><dt className="text-xs text-slate-500">Preço</dt><dd className="num text-lg font-bold text-fg">{brl(item.preco_venda)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Margem s/ peças</dt><dd className={`num text-lg font-bold ${margem < 0.25 ? "text-amber-700" : "text-emerald-700"}`}>{pct(margem)}</dd></div>
                </>}
              </dl>
            </div>
            {grupos.length > 0 && (
              <div className="mt-3">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img"
                  aria-label={`Custo por grupo: ${grupos.map((g) => `${g.nome} ${pct(g.pct)}`).join(", ")}`}>
                  {grupos.map((g) => <div key={g.id} className={g.barra} style={{ width: `${Math.max(g.pct * 100, g.custo > 0 ? 1.5 : 0)}%` }} title={`${g.nome}: ${brl(g.custo)} (${pct(g.pct)})`} />)}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {grupos.map((g) => (
                    <li key={g.id} className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${g.barra}`} aria-hidden />
                      <span className="text-slate-700">{g.nome}</span> <b className="num text-fg">{brl(g.custo)}</b> <span className="text-slate-500">{pct(g.pct)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {semCusto > 0 && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900" role="status">
                {semCusto} {pl(semCusto, "peça", "peças")} sem custo no cadastro: o custo acima está incompleto.
              </p>
            )}
            {!ehMaquina && (
              <div className="mt-3 space-y-3 rounded-lg border border-l-4 border-slate-200 border-l-modulo bg-slate-50 p-3 text-sm">
                <div>{usadoEm.length ? <>Usado em: <b>{usadoEm.join(", ")}</b></> : "Ainda não está na ficha de nenhuma máquina: adicione-o como item na ficha da máquina."}</div>
                <fieldset>
                  <legend className="mb-1 font-semibold text-fg">Como é feito</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {ORIGENS.map((o) => (
                      <label key={o.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${item.origem_producao === o.id ? "border-brand bg-surface" : "border-slate-200"}`}>
                        <input type="radio" className="mt-1" name={`origem-${item.id}`} checked={item.origem_producao === o.id} disabled={!editavel}
                          onChange={() => gravarProduto({ origem_producao: o.id as OrigemProducao }, `${item.descricao}: ${o.nome.toLowerCase()}`)} />
                        <span><b>{o.nome}</b><span className="block text-xs text-slate-500">{o.dica}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {item.origem_producao !== "comprado" && (
                  <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                    <legend className="mb-1 font-semibold text-fg">Na produção da máquina</legend>
                    <label className="flex items-start gap-1.5">
                      <input type="radio" className="mt-1" name={`modo-${item.id}`} checked={!item.subconjunto_estocado} disabled={!editavel}
                        onChange={() => gravarProduto({ subconjunto_estocado: false }, "Montado junto: a OP da máquina usa as peças dele")} />
                      <span><b>Montado junto</b> <span className="block text-xs text-slate-500">a OP da máquina usa e baixa as peças dele</span></span>
                    </label>
                    <label className="flex items-start gap-1.5">
                      <input type="radio" className="mt-1" name={`modo-${item.id}`} checked={!!item.subconjunto_estocado} disabled={!editavel}
                        onChange={() => gravarProduto({ subconjunto_estocado: true }, "Estoque próprio: tem OP própria e a máquina usa a peça pronta")} />
                      <span><b>Estoque próprio</b> <span className="block text-xs text-slate-500">tem OP própria; a máquina usa a peça pronta</span></span>
                    </label>
                  </fieldset>
                )}
              </div>
            )}
          </Card>

          <Tabs value={visao} onChange={setVisao} options={[
            { value: "pecas", label: `Peças por grupo (${lista.length})` },
            { value: "etapas", label: `Etapas de produção (${etapasDoProduto(item).length})` },
          ]} />

          {visao === "pecas" ? (
            <div className="space-y-3">
              {GRUPOS.filter((g) => linhas.some((l) => l.grupo === g.id)).map((g) => {
                const doGrupo = linhas.filter((l) => l.grupo === g.id);
                const info = grupos.find((x) => x.id === g.id)!;
                const fechado = fechados.has(g.id);
                return (
                  <Card key={g.id} className={`border-l-4 ${g.borda} p-0`}>
                    <button type="button" aria-expanded={!fechado}
                      onClick={() => setFechados((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
                      <span className="flex items-center gap-2">
                        <ChevronRight size={16} className={`text-slate-500 transition ${fechado ? "" : "rotate-90"}`} aria-hidden />
                        <b className="text-fg">{g.nome}</b>
                        <span className="text-xs text-slate-500">{doGrupo.length} {pl(doGrupo.length, "item", "itens")}</span>
                      </span>
                      <span className="text-sm"><b className="num text-fg">{brl(info.custo)}</b> <span className="text-slate-500">· {pct(info.pct)} do custo</span></span>
                    </button>
                    {!fechado && (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4" aria-label={`Peças do grupo ${g.nome}`}>
                        {doGrupo.map(({ c, k, peca, custoUn }) => {
                          const sub = temFicha(fichas, c.componente_id);
                          const kitNaFicha = !sub && ehKitAberto(c.componente_id, kits);
                          const nome = peca?.descricao ?? "Peça";
                          const origem = ORIGENS.find((o) => o.id === peca?.origem_producao);
                          return (
                            <li key={c.componente_id} className="py-2.5">
                              <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[1fr_auto_auto_auto]">
                                <span className="min-w-0 text-sm text-fg">
                                  <span className="flex items-start gap-1">
                                    {sub && (
                                      <button type="button" onClick={() => setAbertos((x) => { const n = new Set(x); if (n.has(c.componente_id)) n.delete(c.componente_id); else n.add(c.componente_id); return n; })}
                                        aria-expanded={abertos.has(c.componente_id)} aria-label={`${abertos.has(c.componente_id) ? "Fechar" : "Abrir"} as peças de ${nome}`}
                                        className="mt-0.5 rounded p-0.5 text-slate-500 hover:bg-slate-100">
                                        <ChevronRight size={15} className={`transition ${abertos.has(c.componente_id) ? "rotate-90" : ""}`} aria-hidden />
                                      </button>
                                    )}
                                    <span className="line-clamp-2">{nome}</span>
                                  </span>
                                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                                    {origem && <span className={`rounded px-1.5 font-semibold ${origem.id === "comprado" ? "bg-slate-100 text-slate-700" : origem.id === "terceirizado" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}`}>
                                      {origem.id === "terceirizado" && <Truck size={11} className="mr-0.5 inline" aria-hidden />}{origem.nome.toLowerCase()}</span>}
                                    {sub && <span className="font-semibold text-modulo-texto">subconjunto · {peca?.subconjunto_estocado ? "estoque próprio" : "montado junto"}</span>}
                                    {kitNaFicha && <span className="font-semibold text-purple-700">kit · sai pelas peças dele</span>}
                                    {custoUn > 0 ? <span>{brl(custoUn)}/{peca?.unidade ?? "un"} · linha <b className="num">{brl(custoUn * c.quantidade)}</b></span> : <span className="font-semibold text-amber-700">sem custo</span>}
                                    {!kitNaFicha && <span>estoque {qtd(peca?.estoque_atual)}</span>}
                                    {sub && <button type="button" className="text-brand hover:underline" onClick={() => setSelId(c.componente_id)}>abrir ficha</button>}
                                  </span>
                                </span>
                                <label className="flex items-center gap-1">
                                  <span className="sr-only">Quantidade de {nome} por unidade</span>
                                  <CampoQtd valor={c.quantidade} disabled={!editavel} onChange={(v) => mudarLista(lista.map((x, j) => (j === k ? { ...x, quantidade: v } : x)))} />
                                  <span className="w-7 text-xs text-slate-500" aria-hidden>{peca?.unidade ?? ""}</span>
                                </label>
                                <label className="col-span-1 sm:col-span-1">
                                  <span className="sr-only">Grupo de {nome}</span>
                                  <select className="input w-auto py-1 text-xs" value={grupoDaLinha(c, peca, ci)} disabled={!editavel}
                                    onChange={(e) => mudarLista(lista.map((x, j) => (j === k ? { ...x, grupo: e.target.value } : x)))}>
                                    {GRUPOS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                                  </select>
                                </label>
                                {editavel
                                  ? <Button type="button" variant="ghost" className="!px-2 justify-self-end" aria-label={`Remover ${nome}`} onClick={() => mudarLista(lista.filter((_, j) => j !== k))}><Trash2 size={16} aria-hidden /></Button>
                                  : <span />}
                              </div>
                              {sub && abertos.has(c.componente_id) && (
                                <SubArvore fichas={fichas} produtos={produtos} id={c.componente_id} mult={c.quantidade} nivel={1} caminho={[item.id, c.componente_id]} />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                );
              })}
              {!lista.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma peça nesta ficha ainda. Adicione abaixo: cada peça entra no grupo certo sozinha (dá para trocar).</p>}
              {editavel && (
                <Card className="p-3">
                  <AdicionarPeca produtos={produtos} item={item} lista={lista} todas={todas} fichas={fichas} custoDe={custoDe}
                    onAdicionar={(id, grupo) => mudarLista([...lista, { produto_id: item.id, componente_id: id, quantidade: 1, grupo }])} />
                </Card>
              )}
              {editavel && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {comps?.length ? <Button type="button" variant="ghost" className="w-full !text-red-600 sm:w-auto" onClick={tirarTodos}><Trash2 size={16} aria-hidden /> Tirar todos os itens</Button> : <span />}
                  <Button type="button" className="w-full sm:w-auto" onClick={salvar} disabled={!mudou}>{mudou ? "Salvar ficha técnica" : "Ficha técnica salva"}</Button>
                </div>
              )}
            </div>
          ) : (
            <Etapas key={item.id} produto={item} editavel={editavel} onSalvar={(etapas) => gravarProduto(
              { etapas, etapas_producao: etapas.map(nomeEtapaOp).filter(Boolean) }, "Etapas de produção salvas: a próxima OP já usa esta lista")} />
          )}
        </div>
      )}
    </div>
  );
}

/** Busca de peça com o grupo onde ela entra (sugerido pela peça; dá para escolher outro). */
function AdicionarPeca({ produtos, item, lista, todas, fichas, custoDe, onAdicionar }: {
  produtos: Produto[]; item: Produto; lista: Componente[]; todas: LinhaFicha[]; fichas: LinhaFicha[];
  custoDe: (id: string) => number; onAdicionar: (id: string, grupo: string | null) => void;
}) {
  const [grupo, setGrupo] = useState<string>("");
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <ProdutoBusca placeholder="Adicionar peça: nome, SKU ou código"
        produtos={produtos.filter((p) => p.tipo !== "maquina" && p.id !== item.id && !p.unificado_em && !lista.some((c) => c.componente_id === p.id)
          && !contemNaEstrutura(fichas, p.id, item.id))}
        onEscolher={(p) => onAdicionar(p.id, grupo || null)}
        detalhe={(p) => [temFicha(todas, p.id) ? "fabricado aqui" : null, p.sku, `custo ${brl(custoDe(p.id))}`, `estoque ${Number(p.estoque_atual)}`, p.ativo ? null : "inativo"]
          .filter(Boolean).join(" · ")} />
      <label className="flex items-center gap-2 text-sm">
        <span className="whitespace-nowrap text-slate-600">no grupo</span>
        <select className="input w-auto" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
          <option value="">o da peça (automático)</option>
          {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Etapas de produção: a ordem, quais são feitas fora (terceiro), por quem e em quantos dias. */
function Etapas({ produto, editavel, onSalvar }: { produto: Produto; editavel: boolean; onSalvar: (e: EtapaProducao[]) => void }) {
  const [etapas, setEtapas] = useState<EtapaProducao[]>(() => etapasDoProduto(produto));
  const [mudou, setMudou] = useState(false);
  const mudar = (l: EtapaProducao[]) => { setEtapas(l); setMudou(true); };
  const set = (i: number, p: Partial<EtapaProducao>) => mudar(etapas.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const mover = (i: number, d: -1 | 1) => { const l = [...etapas]; [l[i], l[i + d]] = [l[i + d], l[i]]; mudar(l); };
  const fora = etapas.filter((e) => e.externa);
  const dias = fora.reduce((s, e) => s + Number(e.dias ?? 0), 0);
  const modelo = produto.tipo === "maquina" ? MODELO_MAQUINA : MODELO_TERCEIRO;
  return (
    <Card className="p-4">
      <p className="mb-3 text-sm text-slate-600">
        A ordem em que a {produto.tipo === "maquina" ? "máquina" : "peça"} é feita. Cada OP nova traz estas etapas para ir marcando.
        Etapa <b>feita fora</b> (terceiro) mostra quem faz e o prazo.
        {fora.length > 0 && <> Aqui: {fora.length} {pl(fora.length, "etapa fora", "etapas fora")}{dias ? `, ${dias} ${pl(dias, "dia", "dias")} de prazo` : ""}.</>}
      </p>
      {!etapas.length && (
        <div className="mb-3 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-600">
          Nenhuma etapa ainda.
          {editavel && <Button type="button" variant="secondary" className="ml-2" onClick={() => mudar(modelo.map((e) => ({ ...e })))}><ListOrdered size={16} aria-hidden /> Começar pelo modelo</Button>}
          <span className="mt-1 block text-xs text-slate-500">{modelo.map(nomeEtapaOp).join(" → ")}</span>
        </div>
      )}
      <ol className="space-y-2">
        {etapas.map((e, i) => (
          <li key={i} className={`rounded-xl border p-3 ${e.externa ? "border-orange-200 bg-orange-50" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${e.externa ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-700"}`} aria-hidden>{i + 1}</span>
              <label className="min-w-0 flex-1 basis-48">
                <span className="sr-only">Etapa {i + 1}</span>
                <input className="input" value={e.nome} disabled={!editavel} onChange={(ev) => set(i, { nome: ev.target.value })} placeholder="Ex.: Montar a refrigeração" />
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={!!e.externa} disabled={!editavel} onChange={(ev) => set(i, { externa: ev.target.checked })} />
                <Truck size={14} className="text-orange-700" aria-hidden /> feita fora
              </label>
              {editavel && (
                <span className="ml-auto flex gap-0.5">
                  <Button type="button" variant="ghost" className="!px-2" disabled={i === 0} aria-label="Subir etapa" onClick={() => mover(i, -1)}><ArrowUp size={15} aria-hidden /></Button>
                  <Button type="button" variant="ghost" className="!px-2" disabled={i === etapas.length - 1} aria-label="Descer etapa" onClick={() => mover(i, 1)}><ArrowDown size={15} aria-hidden /></Button>
                  <Button type="button" variant="ghost" className="!px-2" aria-label={`Tirar etapa ${i + 1}`} onClick={() => mudar(etapas.filter((_, j) => j !== i))}><Trash2 size={15} aria-hidden /></Button>
                </span>
              )}
            </div>
            {e.externa && (
              <div className="mt-2 grid gap-2 pl-9 sm:grid-cols-[1fr_8rem]">
                <label className="text-sm"><span className="text-xs text-slate-600">Quem faz</span>
                  <input className="input" value={e.quem ?? ""} disabled={!editavel} onChange={(ev) => set(i, { quem: ev.target.value })} placeholder="Ex.: empresa de injeção" /></label>
                <label className="text-sm"><span className="text-xs text-slate-600">Prazo (dias)</span>
                  <input className="input" type="number" min={0} inputMode="numeric" value={e.dias ?? ""} disabled={!editavel}
                    onChange={(ev) => set(i, { dias: ev.target.value === "" ? null : Math.max(0, Number(ev.target.value)) })} /></label>
              </div>
            )}
          </li>
        ))}
      </ol>
      {editavel && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => mudar([...etapas, { nome: "", externa: false }])}><Plus size={16} aria-hidden /> Etapa</Button>
          <Button type="button" disabled={!mudou || etapas.some((e) => !e.nome.trim())} onClick={() => { onSalvar(etapas.map((e) => ({ ...e, nome: e.nome.trim() }))); setMudou(false); }}>
            {mudou ? "Salvar etapas" : "Etapas salvas"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Peças de um subconjunto (e dos subconjuntos dentro dele), com a quantidade por máquina. */
function SubArvore({ fichas, produtos, id, mult, nivel, caminho }: { fichas: LinhaFicha[]; produtos: Produto[]; id: string; mult: number; nivel: number; caminho: string[] }) {
  if (nivel > 12) return null;
  return (
    <ul className="ml-3 mt-1 space-y-1 border-l-2 border-slate-200 pl-3" aria-label="Peças do subconjunto">
      {fichas.filter((f) => f.produto_id === id && !caminho.slice(0, -1).includes(f.componente_id)).map((f) => {
        const p = produtos.find((x) => x.id === f.componente_id);
        const sub = temFicha(fichas, f.componente_id);
        const q = mult * Number(f.quantidade);
        return (
          <li key={f.componente_id} className="text-xs">
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="text-fg">{p?.descricao ?? "Peça"}{sub && <span className="ml-1 font-semibold text-modulo-texto">· subconjunto{p?.subconjunto_estocado ? " (estoque próprio)" : ""}</span>}</span>
              <span className="num text-slate-600">{qtd(Number(f.quantidade))} × {qtd(mult)} = <b>{qtd(q)}</b> {p?.unidade ?? ""}</span>
            </div>
            {sub && <SubArvore fichas={fichas} produtos={produtos} id={f.componente_id} mult={q} nivel={nivel + 1} caminho={[...caminho, f.componente_id]} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Quantidade com vírgula ("0,4") e teclado numérico do celular; guarda o texto enquanto a pessoa digita. */
const qtdCampo = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
const lerQtd = (t: string) => Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);

function CampoQtd({ valor, onChange, disabled }: { valor: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [txt, setTxt] = useState(qtdCampo(valor));
  useEffect(() => { if (lerQtd(txt) !== valor) setTxt(qtdCampo(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="input w-20 py-1.5 text-right" inputMode="decimal" value={txt} disabled={disabled}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, "");
        setTxt(t);
        const v = lerQtd(t);
        if (Number.isFinite(v) && v > 0) onChange(v);
      }}
      onBlur={() => setTxt(qtdCampo(valor))} />
  );
}
