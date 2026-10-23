// App da expedição no celular (erp.myfrost.ai/app/expedicao): o galpão sem o menu do ERP. Uma aba por etapa
// (separar → conferir → embalar → despachar), lista de separação somada por produto com o local no estoque e um botão
// grande para o próximo passo. Conferir, embalar e despachar abrem a mesma janela do ERP (leitor, volumes, etiquetas, NF-e).
import { SeloCidade } from "@/components/SeloCidade";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, LayoutGrid, ListChecks, MoreHorizontal, PackageCheck, Search, Send, Timer } from "lucide-react";
import { ExpedicaoModal, useAcoesExpedicao } from "@/components/fluxo/Expedicao";
import { InstalarApp } from "@/components/InstalarApp";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { pecasDoKit } from "@/lib/kits";
import { hoje, pl } from "@/lib/format";
import { filaPorEtapa, tempo, type EtapaFila, type LinhaFila } from "@/lib/filaExpedicao";
import { CHAVE_APP_EXPEDICAO } from "@/lib/appCelular";
import type { Exp, PedidoFluxo as P } from "@/lib/fluxo";
import type { KitComponente, Produto } from "@/lib/types";
import { confirmar } from "@/components/Dialogos";

const SELECT = "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id, status, numero, serie, chave, mensagem, ambiente, created_at, danfe_url)";
type Aba = EtapaFila | "mais";
const ETAPAS: { id: EtapaFila; titulo: string; icone: typeof Send; cor: string; botao: string }[] = [
  { id: "separar", titulo: "Separar", icone: ListChecks, cor: "#38bdf8", botao: "Começar a separar" },
  { id: "conferir", titulo: "Conferir", icone: ClipboardCheck, cor: "#a855f7", botao: "Conferir itens" },
  { id: "embalar", titulo: "Embalar", icone: PackageCheck, cor: "#fb923c", botao: "Embalar" },
  { id: "despachar", titulo: "Despachar", icone: Send, cor: "#34d399", botao: "Despachar" },
];
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const corTempo = (h: number) => (h >= 24 ? "text-fixo-rose-400" : h >= 8 ? "text-fixo-amber-400" : "text-noite-fraco");

export default function AppExpedicao() {
  const { pode, nome } = usePerfil();
  const podeExpedir = pode("expedir");
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const { filtrar } = useUnidade();
  const { data: pedidos = [] } = useRows<P>("pedidos", { select: SELECT, key: ["expedicao"] });
  const { data: exps = [] } = useRows<Exp>("expedicoes", {});
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const acoes = useAcoesExpedicao();
  const [aba, setAba] = useState<Aba>("separar");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<{ p: P; e: Exp } | null>(null);
  const [verLista, setVerLista] = useState(false);
  const [pegos, setPegos] = useState<Set<string>>(new Set()); // itens da lista somada já pegos (só neste aparelho)
  const [sempre, setSempre] = useState(ler(CHAVE_APP_EXPEDICAO) !== "0");

  // outras pessoas mexendo e pedidos novos chegando: atualiza sozinha a cada 15 s
  useEffect(() => {
    const t = setInterval(() => invalidar("pedidos", "expedicoes"), 15_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { porEtapa, linhas } = useMemo(() => filaPorEtapa(filtrar(pedidos), exps), [pedidos, exps, filtrar]);
  const prod = useMemo(() => new Map(produtos.map((x) => [x.id, x])), [produtos]);
  const despachadosHoje = exps.filter((e) => (e.despachado_em ?? "").slice(0, 10) === hoje()).length;

  // lista de separação: soma por produto (kits abertos nos componentes), na ordem do local no estoque
  const separacao = useMemo(() => {
    const m = new Map<string, { id: string; descricao: string; sku: string | null; local: string | null; qtd: number; pedidos: Set<number> }>();
    const somar = (id: string, descricao: string, qtd: number, numero: number) => {
      const pr = prod.get(id);
      const x = m.get(id) ?? { id, descricao: pr?.descricao ?? descricao, sku: pr?.sku ?? null, local: pr?.localizacao ?? null, qtd: 0, pedidos: new Set<number>() };
      x.qtd += qtd; x.pedidos.add(numero); m.set(id, x);
    };
    for (const { p } of porEtapa.separar) for (const i of p.itens ?? []) {
      const partes = prod.get(i.produto_id)?.kit ? pecasDoKit(i.produto_id, comps, i.kit_escolha) : [];
      if (partes.length) for (const c of partes) somar(c.componente_id, prod.get(c.componente_id)?.descricao ?? "componente", c.quantidade * Number(i.quantidade), p.numero);
      else somar(i.produto_id, i.descricao, Number(i.quantidade), p.numero);
    }
    return [...m.values()].sort((a, b) => Number(!a.local) - Number(!b.local) || (a.local ?? "").localeCompare(b.local ?? "", "pt-BR", { numeric: true }) || a.descricao.localeCompare(b.descricao, "pt-BR"));
  }, [porEtapa.separar, prod, comps]);

  const termo = busca.trim().replace(/^#/, "").toLowerCase();
  const etapa = aba === "mais" ? null : ETAPAS.find((x) => x.id === aba)!;
  const lista = etapa ? porEtapa[etapa.id].filter((l) => !termo || `${l.p.numero} ${l.p.cliente?.nome ?? ""} ${l.p.cliente?.nome_fantasia ?? ""}`.toLowerCase().includes(termo)) : [];

  function agir(l: LinhaFila) {
    if (!podeExpedir) return;
    if (l.e.status === "separar") void acoes.avancar(l.e, "separando", { responsavel: nome }, `Pedido #${l.p.numero}: separação começou`);
    else setAberta({ p: l.p, e: l.e });
  }
  async function comecarTodos() {
    const l = porEtapa.separar;
    if (!l.length || !(await confirmar(`Começar a separar ${l.length} ${pl(l.length, "pedido", "pedidos")}? Eles vão para Conferir com você como responsável.`))) return;
    for (const x of l) await acoes.avancar(x.e, "separando", { responsavel: nome }, `Pedido #${x.p.numero}: separação começou`);
    setPegos(new Set()); setVerLista(false);
  }
  // número do pedido digitado (ou lido): vai direto para a etapa dele
  function irParaPedido() {
    const n = Number(termo);
    const l = n ? linhas.find((x) => x.p.numero === n) : undefined;
    if (!l) return;
    const id = (Object.keys(porEtapa) as EtapaFila[]).find((k) => porEtapa[k].includes(l));
    if (id) setAba(id);
    setBusca("");
    if (podeExpedir && l.e.status !== "separar") setAberta({ p: l.p, e: l.e });
  }

  return (
    <div className="min-h-screen bg-noite-fundo pb-28 text-noite-texto" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-md px-4">
        <header className="flex items-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-fixo-sky-400 to-fixo-emerald-400 font-bold text-noite-fundo">MF</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-noite-fraco">{despachadosHoje} {pl(despachadosHoje, "despachado", "despachados")} hoje</p>
            <p className="truncate font-bold tracking-wide">Expedição MF</p>
          </div>
        </header>

        {etapa && (
          <>
            {/* placar das etapas */}
            <div className="mb-3 grid grid-cols-4 gap-2">
              {ETAPAS.map((x) => (
                <button key={x.id} type="button" onClick={() => setAba(x.id)}
                  className={`rounded-2xl border p-2 text-center ${aba === x.id ? "border-white/40 bg-white/10" : "border-white/10"}`}>
                  <span className="num block text-2xl font-bold" style={{ color: x.cor }}>{porEtapa[x.id].length}</span>
                  <span className="block text-2xs font-semibold text-noite-medio">{x.titulo}</span>
                </button>
              ))}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); irParaPedido(); }} className="relative mb-3">
              <label className="sr-only" htmlFor="busca-exp">Procurar pedido</label>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-noite-fraco" aria-hidden />
              <input id="busca-exp" type="search" inputMode="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº do pedido ou cliente"
                className="w-full rounded-2xl border border-white/15 bg-noite-cartao py-3 pl-11 pr-4 text-base placeholder:text-noite-apagado focus:border-fixo-sky-400 focus:outline-none" />
            </form>

            {aba === "separar" && porEtapa.separar.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setVerLista(!verLista)} className="rounded-2xl border border-fixo-sky-400/40 bg-fixo-sky-400/10 py-3 text-sm font-semibold text-fixo-sky-300">
                  {verLista ? "Ver os pedidos" : `Lista somada (${separacao.length})`}
                </button>
                {podeExpedir && <button type="button" disabled={acoes.ocupado !== null} onClick={comecarTodos} className="rounded-2xl bg-fixo-sky-400 py-3 text-sm font-bold text-[#07131d] disabled:opacity-50">Começar todos</button>}
              </div>
            )}

            {aba === "separar" && verLista ? (
              <ul className="space-y-2" aria-label="Lista de separação somada">
                {separacao.map((x) => {
                  const ok = pegos.has(x.id);
                  return (
                    <li key={x.id}>
                      <button type="button" aria-pressed={ok} onClick={() => setPegos((s) => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${ok ? "border-fixo-emerald-400/40 bg-fixo-emerald-400/10 opacity-70" : "border-white/10 bg-noite-cartao"}`}>
                        <span className="num grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-xl font-bold">{x.qtd.toLocaleString("pt-BR")}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold leading-snug ${ok ? "line-through" : ""}`}>{x.descricao}</span>
                          <span className="block text-xs text-noite-fraco">{[x.local ? `📍 ${x.local}` : "sem local", x.sku, [...x.pedidos].map((n) => `#${n}`).join(" ")].filter(Boolean).join(" · ")}</span>
                        </span>
                        {ok && <CheckCircle2 size={22} className="shrink-0 text-fixo-emerald-400" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-2.5">
                {lista.map((l) => {
                  const semNota = etapa.id === "despachar" && !l.nota;
                  return (
                    <li key={l.e.id} className="rounded-2xl border border-white/10 bg-noite-cartao p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="num text-sm font-bold text-noite-fraco">#{l.p.numero}</p>
                          <p className="truncate font-semibold">{l.p.cliente?.nome_fantasia?.trim() || l.p.cliente?.nome}<SeloCidade cliente={l.p.cliente} escuro /></p>
                          <p className="text-xs text-noite-fraco">{(l.p.itens ?? []).length} {pl((l.p.itens ?? []).length, "item", "itens")}{l.e.responsavel ? ` · ${l.e.responsavel}` : ""}</p>
                        </div>
                        <span className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${corTempo(l.horas)}`}><Timer size={13} aria-hidden /> {tempo(l.horas)}</span>
                      </div>
                      {semNota && <p className="mt-2 rounded-lg bg-fixo-rose-400/15 px-2.5 py-1.5 text-xs font-semibold text-fixo-rose-300">{l.processando ? "NF-e sendo autorizada: aguarde um pouco." : "Sem NF-e autorizada: não pode sair. Avise vendas ou o financeiro."}</p>}
                      {podeExpedir && (
                        <button type="button" disabled={acoes.ocupado === l.p.id || semNota} onClick={() => agir(l)}
                          className="mt-3 w-full rounded-xl py-3.5 text-base font-bold text-noite-fundo disabled:opacity-40" style={{ background: etapa.cor }}>
                          {acoes.ocupado === l.p.id ? "Salvando…" : etapa.botao}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!verLista && !lista.length && <p className="rounded-2xl border border-white/10 p-6 text-center text-noite-fraco">{termo ? "Nenhum pedido com essa busca nesta etapa." : `Nada para ${etapa.titulo.toLowerCase()} agora ✓`}</p>}
          </>
        )}

        {aba === "mais" && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-4 text-sm">
              <span>Abrir sempre aqui pelo celular</span>
              <input type="checkbox" className="h-5 w-5 accent-fixo-sky-400" checked={sempre}
                onChange={(e) => { setSempre(e.target.checked); gravar(CHAVE_APP_EXPEDICAO, e.target.checked ? "1" : "0"); }} />
            </label>
            <InstalarApp />
            <p className="px-1 text-xs text-noite-fraco">Etiquetas, DANFE e impressão da lista de separação ficam no ERP completo (impressora do galpão).</p>
            <button type="button" onClick={() => navigate("/expedicao")} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm text-noite-medio">
              <LayoutGrid size={18} /> <span className="flex-1">Abrir o ERP completo</span>
            </button>
          </div>
        )}
      </div>

      {aberta && <ExpedicaoModal pedido={aberta.p} exp={aberta.e} onClose={() => setAberta(null)} />}

      {/* barra de baixo */}
      <nav aria-label="App da expedição" className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-noite-fundo-2/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {[...ETAPAS.map((x) => [x.id, x.titulo, x.icone] as const), ["mais", "Mais", MoreHorizontal] as const].map(([id, rot, Icone]) => {
            const n = id !== "mais" ? porEtapa[id as EtapaFila].length : 0;
            return (
              <button key={id} type="button" onClick={() => { setAba(id as Aba); setBusca(""); setVerLista(false); }} aria-current={aba === id ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs ${aba === id ? "text-fixo-sky-400" : "text-noite-fraco"}`}>
                <Icone size={21} />{rot}
                {n > 0 && <span className="absolute right-[16%] top-1 rounded-full bg-fixo-sky-400 px-1.5 text-2xs font-bold text-noite-fundo">{n}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
