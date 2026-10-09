// Fluxo de pedidos: todos os pedidos (WhatsApp, loja, proposta, representante...) num painel só,
// do orçamento à entrega, com a NF-e automática e a expedição (separar, conferir, embalar, despachar).
// Cada cartão diz o próximo passo e tem o botão que faz esse passo; o resumo no alto mostra o que precisa de ação agora.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Barcode, CheckCircle2, ClipboardCheck, FileText, PackageCheck, Printer, Search, Send, Truck, User, Zap, ZapOff } from "lucide-react";
import { Badge, Button, Field, Modal, PageHeader } from "@/components/ui";
import { Cartao } from "@/components/fluxo/Cartao";
import { BlocosEtapas, FaixaAcao, type ResumoEtapa } from "@/components/fluxo/Resumo";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR } from "@/lib/format";
import { useConfig } from "@/lib/useConfig";
import { composicao } from "@/lib/kits";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { CANAIS } from "@/lib/margem";
import { usePerfil } from "@/lib/auth";
import { COLUNAS, situacao, type Acao, type ColunaId, type EnvioFluxo, type Exp, type Nivel, type PedidoFluxo as P, type Situacao, type TipoAlerta } from "@/lib/fluxo";
import type { KitComponente, Produto, Transportadora } from "@/lib/types";

const ETAPA: Record<string, string> = { separar: "a separar", separando: "separando", conferido: "conferido", embalado: "embalado", despachado: "despachado", entregue: "entregue" };
type Vendedor = { id: string; nome: string; user_id: string | null; ativo: boolean };
type Linha = { p: P; e?: Exp; s: Situacao };

const CHAVE_MINHAS = "erp.fluxo.minhas";
const NO_QUADRO = 25; // cartões por coluna no quadro; o resto aparece ao abrir a etapa
const NA_LISTA = 120;
/** Proposta recusada ou vencida fica à vista por 15 dias, mas não soma no valor da etapa. */
const somaNoValor = (p: P) => p.status !== "orcamento" || !["rejeitada", "expirada"].includes(p.proposta_status ?? "");

/** Tela larga o bastante para o quadro com colunas (no celular e tablet, uma etapa embaixo da outra). */
function useTelaLarga(q = "(min-width: 1024px)") {
  const [ok, setOk] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const f = () => setOk(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, [q]);
  return ok;
}

/** As mesmas chamadas da janela de expedição, usadas também pelos botões dos cartões. */
function useAcoesExpedicao() {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState<string | null>(null); // pedido com ação em andamento
  async function avancar(exp: Exp, etapa: string, dados: Record<string, unknown> = {}, aviso?: string) {
    setOcupado(exp.pedido_id);
    const { error } = await supabase.rpc("avancar_expedicao", { p_expedicao: exp.id, p_etapa: etapa, p_dados: dados });
    setOcupado(null);
    if (error) { notifyError(error); return false; }
    notify(aviso ?? (etapa === "despachado" ? "Despachado: o cliente recebe o rastreio por e-mail" : "Expedição atualizada"));
    invalidar("expedicoes", "pedidos");
    return true;
  }
  async function emitirNota(pedidoId: string) {
    if (!(await confirmarSeTeste())) return false;
    setOcupado(pedidoId);
    try { await callFunction("nfe-emitir", { pedido_id: pedidoId }); notify("NF-e enviada para a SEFAZ"); invalidar("pedidos", "notas_fiscais"); return true; }
    catch (e) { notifyError(e); return false; }
    finally { setOcupado(null); }
  }
  return { avancar, emitirNota, ocupado };
}

export default function Fluxo() {
  const { filtrar } = useUnidade();
  const { papel, user_id, nome: nomeUsuario, pode, podeVer } = usePerfil();
  const { data: todos = [], isLoading } = useRows<P>("pedidos", { select: "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id, status, numero, serie, chave, mensagem, ambiente, created_at)" });
  const { data: exps = [] } = useRows<Exp>("expedicoes", {});
  const { data: envios = [] } = useRows<EnvioFluxo>("envios", { select: "id, pedido_id, status, entrega_prevista, codigo_rastreio" });
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: cfg } = useConfig();
  const etiquetas = useEtiquetas();
  const acoes = useAcoesExpedicao();
  const invalidar = useInvalidate();
  const navigate = useNavigate();
  const largo = useTelaLarga();

  const [canal, setCanal] = useState("");
  const [busca, setBusca] = useState("");
  const [vendedorSel, setVendedorSel] = useState(""); // "" todos · "sem" sem vendedor · id
  const [minhas, setMinhasState] = useState(() => { try { return localStorage.getItem(CHAVE_MINHAS) === "1"; } catch { return false; } });
  const setMinhas = (v: boolean) => { setMinhasState(v); try { localStorage.setItem(CHAVE_MINHAS, v ? "1" : "0"); } catch { /* sem armazenamento */ } };
  const [etapa, setEtapa] = useState<ColunaId | null>(null);
  const [soAcao, setSoAcao] = useState(false);
  const [tipo, setTipo] = useState<TipoAlerta | null>(null);
  const [aberta, setAberta] = useState<{ p: P; e: Exp } | null>(null);

  const meuVendedor = vendedores.find((v) => v.user_id === user_id);
  const escolheVendedor = papel === "admin" || papel === "financeiro";
  const filtroVendedor = escolheVendedor ? vendedorSel : minhas && meuVendedor ? meuVendedor.id : "";
  const nomeVendedor = (p: P) => (meuVendedor && p.vendedor_id === meuVendedor.id ? "você" : vendedores.find((v) => v.id === p.vendedor_id)?.nome ?? p.vendedor);

  // NF-e na SEFAZ: confere de novo a cada 5 s até autorizar; fora isso, a cada minuto (outras pessoas mexendo)
  const naSefaz = todos.some((p) => p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)));
  useEffect(() => {
    const t = setInterval(() => invalidar("pedidos", "expedicoes", "envios"), naSefaz ? 5000 : 60000);
    return () => clearInterval(t);
  }, [naSefaz]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada pedido com a etapa, o tempo nela, o próximo passo e o alerta (já com os filtros de unidade, canal, busca e vendedor)
  const linhas = useMemo(() => {
    const expPor = new Map(exps.map((e) => [e.pedido_id, e]));
    const envioPor = new Map(envios.filter((x) => x.pedido_id && x.status !== "cancelado").map((x) => [x.pedido_id!, x]));
    const termo = busca.trim().toLowerCase();
    const agora = Date.now();
    const r: Linha[] = [];
    for (const p of filtrar(todos)) {
      if (canal && p.origem !== canal) continue;
      if (filtroVendedor && (filtroVendedor === "sem" ? p.vendedor_id : p.vendedor_id !== filtroVendedor)) continue;
      if (termo && !`${p.numero} ${p.cliente?.nome ?? ""} ${p.cliente?.nome_fantasia ?? ""}`.toLowerCase().includes(termo)) continue;
      const e = expPor.get(p.id);
      const s = situacao(p, e, envioPor.get(p.id), agora);
      if (s) r.push({ p, e, s });
    }
    return r;
  }, [todos, exps, envios, canal, busca, filtroVendedor, filtrar]);

  const { resumo, porTipo, totalAlertas, nivelGeral } = useMemo(() => {
    const resumo = Object.fromEntries(COLUNAS.map((c) => [c.id, { qtd: 0, valor: 0, alertas: 0, nivel: 0 }])) as Record<ColunaId, ResumoEtapa>;
    const tipos = new Map<TipoAlerta, number>();
    let nivelGeral: Nivel = 0;
    for (const { p, s } of linhas) {
      const r = resumo[s.coluna];
      r.qtd++;
      if (somaNoValor(p)) r.valor += Number(p.valor_total);
      if (s.nivel > 0) {
        r.alertas++;
        r.nivel = Math.max(r.nivel, s.nivel) as Nivel;
        nivelGeral = Math.max(nivelGeral, s.nivel) as Nivel;
        if (s.alerta) tipos.set(s.alerta, (tipos.get(s.alerta) ?? 0) + 1);
      }
    }
    return { resumo, porTipo: [...tipos.entries()], totalAlertas: linhas.filter((l) => l.s.nivel > 0).length, nivelGeral };
  }, [linhas]);

  // Por coluna, já com "só o que precisa de ação": primeiro o mais atrasado, depois o que espera há mais tempo
  const porColuna = useMemo(() => {
    const m = new Map<ColunaId, Linha[]>(COLUNAS.map((c) => [c.id, []]));
    for (const l of linhas) {
      if ((soAcao && l.s.nivel === 0) || (tipo && l.s.alerta !== tipo)) continue;
      m.get(l.s.coluna)!.push(l);
    }
    for (const [id, l] of m) {
      l.sort((a, b) => b.s.nivel - a.s.nivel || (id === "entregue" ? b.s.desde.localeCompare(a.s.desde) : a.s.desde.localeCompare(b.s.desde)));
    }
    return m;
  }, [linhas, soAcao, tipo]);

  const irPedido = (p: P) => navigate("/pedidos", { state: { abrir: p.id } });
  const abrir = ({ p, e }: Linha) => { if (e) setAberta({ p, e }); else irPedido(p); };

  function agir({ p, e }: Linha, a: Acao) {
    switch (a) {
      case "enviar_proposta": case "abrir_pedido": case "corrigir_nfe": case "informar_rastreio":
        return irPedido(p);
      case "emitir_nfe":
        return void acoes.emitirNota(p.id);
      case "comecar_separar":
        return e && void acoes.avancar(e, "separando", { responsavel: nomeUsuario }, `Pedido #${p.numero}: separação começou`);
      case "conferir": case "embalar": case "despachar":
        return e && setAberta({ p, e });
      case "marcar_entregue":
        if (e && confirm(`Confirmar que o pedido #${p.numero} (${p.cliente?.nome ?? ""}) chegou ao cliente?`)) void acoes.avancar(e, "entregue", {}, `Pedido #${p.numero} entregue`);
        return;
    }
  }
  const podeAgir = (a?: Acao) => (a === "emitir_nfe" ? pode("emitir_nfe") : a === "enviar_proposta" || a === "abrir_pedido" || a === "corrigir_nfe" || a === "informar_rastreio" ? podeVer("pedidos") : true);

  const cartao = (l: Linha) => (
    <Cartao key={l.p.id} p={l.p} s={l.s} vendedor={filtroVendedor && filtroVendedor !== "sem" ? null : nomeVendedor(l.p)}
      ocupado={acoes.ocupado === l.p.id} podeAgir={podeAgir(l.s.acao)} onAbrir={() => abrir(l)} onAcao={(a) => agir(l, a)}
      onEtiquetas={l.e && ["conferido", "embalado", "despachado"].includes(l.e.status) ? () => etiquetas.imprimir([{ tipo: "pedido", pedido_id: l.p.id }]) : undefined} />
  );
  const imprimirTodas = (id: ColunaId, lista: Linha[], className = "") => id === "embalar" && lista.length > 0 && (
    <button type="button" disabled={etiquetas.ocupado} onClick={() => etiquetas.imprimir(lista.map((l) => ({ tipo: "pedido" as const, pedido_id: l.p.id })))}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg hover:border-brand disabled:opacity-50 ${className}`}
      title="Imprimir as etiquetas de todos os pedidos desta etapa">
      <Printer size={13} /> Imprimir etiquetas de todos
    </button>
  );
  const valorDe = (lista: Linha[]) => lista.reduce((s, l) => s + (somaNoValor(l.p) ? Number(l.p.valor_total) : 0), 0);
  const filtrando = soAcao || !!tipo;
  const vazioTexto = filtrando ? "Nada pedindo ação nesta etapa." : "Nenhum pedido nesta etapa agora.";

  const chip = (chave: string, ativo: boolean, onClick: () => void, children: ReactNode) => (
    <button key={chave} type="button" onClick={onClick} aria-pressed={ativo}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${ativo ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}>
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Fluxo de pedidos" subtitle="Do orçamento à entrega, de todos os canais. Cada cartão mostra o próximo passo e o botão para fazê-lo."
        actions={cfg?.nfe_automatica && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" title="Pedido aprovado tem a nota emitida sozinho">
            <Zap size={13} /> NF-e automática ligada
          </span>
        )} />

      {cfg && !cfg.nfe_automatica && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <ZapOff size={20} className="shrink-0 text-amber-700" />
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            <b>NF-e automática desligada.</b>{" "}
            {podeVer("configuracoes")
              ? "Cada pedido aprovado espera alguém emitir a nota à mão (botão Emitir NF-e no cartão). Ligue para a nota sair sozinha na aprovação."
              : "Emita a nota de cada pedido aprovado pelo botão Emitir NF-e no cartão. Para a nota sair sozinha, peça ao administrador."}
          </p>
          {podeVer("configuracoes") && (
            <Link to="/configuracoes" state={{ secao: "automacao-pedidos" }}
              className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm hover:bg-brand-dark sm:min-h-0">
              Ligar em Configurações <ArrowRight size={15} />
            </Link>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative block sm:w-72">
            <span className="sr-only">Buscar</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar nº ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          {escolheVendedor && vendedores.length > 0 && (
            <select className="input sm:w-60" aria-label="Vendedor" value={vendedorSel} onChange={(e) => setVendedorSel(e.target.value)}>
              <option value="">Todos os vendedores</option>
              {meuVendedor && <option value={meuVendedor.id}>Minhas vendas</option>}
              {vendedores.filter((v) => v.ativo !== false && v.id !== meuVendedor?.id).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              <option value="sem">Sem vendedor</option>
            </select>
          )}
          {!escolheVendedor && meuVendedor && (
            <div className="flex gap-1.5">
              {chip("todas", !minhas, () => setMinhas(false), "Todas as vendas")}
              {chip("minhas", minhas, () => setMinhas(true), <><User size={14} /> Minhas vendas</>)}
            </div>
          )}
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Canal de venda">
          {[["", "Todos os canais"], ...Object.entries(CANAIS)].map(([v, l]) => chip(v || "todos", canal === v, () => setCanal(v), l))}
        </div>
      </div>

      {/* Resumo: o que precisa de ação agora e um bloco por etapa */}
      <FaixaAcao porTipo={porTipo} total={totalAlertas} nivel={nivelGeral} soAcao={filtrando} tipo={tipo}
        onSoAcao={(v) => { setSoAcao(v); setTipo(null); }}
        onTipo={(t) => { const igual = tipo === t; setTipo(igual ? null : t); setSoAcao(!igual); }} />
      <BlocosEtapas resumo={resumo} etapa={etapa} onEtapa={setEtapa} />

      {isLoading ? (
        <p className="py-10 text-center text-slate-500">Carregando pedidos…</p>
      ) : etapa ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setEtapa(null)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            <ArrowLeft size={15} /> Ver todas as etapas
          </button>
          <SecaoEtapa id={etapa} lista={porColuna.get(etapa)!} limite={NA_LISTA} vazio={vazioTexto} cartao={cartao} extra={imprimirTodas(etapa, porColuna.get(etapa)!)} valor={valorDe} />
        </div>
      ) : largo ? (
        // Quadro: uma coluna por etapa; coluna vazia vira uma faixa estreita
        <div className="-mx-1 overflow-x-auto px-1 pb-3">
          <div className="flex min-w-full gap-2.5">
            {COLUNAS.map((c) => {
              const lista = porColuna.get(c.id)!;
              if (!lista.length) {
                return (
                  <button key={c.id} type="button" onClick={() => setEtapa(c.id)} title={`${c.titulo}: ${filtrando ? "nada pedindo ação" : "nenhum pedido agora"}. ${c.frase}`}
                    className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-3 text-slate-400 transition hover:border-slate-300 hover:text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                    <span className="num text-xs font-bold">0</span>
                    <span className="rotate-180 whitespace-nowrap text-xs font-semibold [writing-mode:vertical-rl]">{c.titulo}</span>
                  </button>
                );
              }
              return (
                <section key={c.id} className="flex min-w-[212px] flex-1 basis-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-1.5">
                  <header className="px-1.5 pb-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.cor }} />
                      <h2 className="flex-1 text-sm font-bold leading-tight text-fg">{c.titulo}</h2>
                      <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{lista.length}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-500">{c.frase}</p>
                    <div className="num mt-1.5 text-xs font-semibold text-slate-600">{brl(valorDe(lista))}</div>
                    {imprimirTodas(c.id, lista, "mt-2 w-full")}
                  </header>
                  <div className="space-y-2">{lista.slice(0, NO_QUADRO).map(cartao)}</div>
                  {lista.length > NO_QUADRO && (
                    <button type="button" onClick={() => setEtapa(c.id)} className="mt-2 rounded-lg py-2 text-sm font-semibold text-brand hover:bg-slate-100">
                      Ver mais {lista.length - NO_QUADRO}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        // Celular e tablet: uma etapa embaixo da outra; as vazias viram uma linha só
        <div className="space-y-5">
          {COLUNAS.map((c) => {
            const lista = porColuna.get(c.id)!;
            if (!lista.length) {
              return (
                <button key={c.id} type="button" onClick={() => setEtapa(c.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-left text-sm text-slate-400">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.cor }} />
                  <span className="font-semibold">{c.titulo}</span>
                  <span className="ml-auto text-xs">{filtrando ? "nada pedindo ação" : "nenhum pedido"}</span>
                </button>
              );
            }
            return <SecaoEtapa key={c.id} id={c.id} lista={lista} limite={NO_QUADRO} vazio={vazioTexto} cartao={cartao} extra={imprimirTodas(c.id, lista)} valor={valorDe}
              onMais={() => setEtapa(c.id)} />;
          })}
        </div>
      )}
      {aberta && <ExpedicaoModal pedido={aberta.p} exp={aberta.e} onClose={() => setAberta(null)} />}
    </div>
  );
}

/** Uma etapa como lista de cartões (etapa escolhida no resumo, ou no celular). */
function SecaoEtapa({ id, lista, limite, vazio, cartao, extra, valor, onMais }: {
  id: ColunaId; lista: Linha[]; limite: number; vazio: string; cartao: (l: Linha) => ReactNode; extra: ReactNode;
  valor: (l: Linha[]) => number; onMais?: () => void;
}) {
  const c = COLUNAS.find((x) => x.id === id)!;
  return (
    <section>
      <header className="mb-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.cor }} />
          <h2 className="text-base font-bold text-fg">{c.titulo}</h2>
          <span className="num rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{lista.length}</span>
          <span className="num text-sm text-slate-500">{brl(valor(lista))}</span>
          <span className="ml-auto">{extra}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{c.frase}</p>
      </header>
      {lista.length ? (
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">{lista.slice(0, limite).map(cartao)}</div>
      ) : <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">{vazio}</p>}
      {lista.length > limite && (
        onMais
          ? <button type="button" onClick={onMais} className="mt-2 w-full rounded-lg py-2 text-sm font-semibold text-brand hover:bg-slate-100">Ver mais {lista.length - limite}</button>
          : <p className="mt-2 text-center text-xs text-slate-500">Mostrando {limite} de {lista.length}. Use a busca para achar os outros.</p>
      )}
    </section>
  );
}

/* ------------------------------ Expedição ------------------------------ */

const PASSOS = ["separar", "separando", "conferido", "embalado", "despachado", "entregue"];

function ExpedicaoModal({ pedido: p, exp, onClose }: { pedido: P; exp: Exp; onClose: () => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: transp = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { nome: nomeUsuario } = usePerfil();
  const acoes = useAcoesExpedicao();
  const ocupado = acoes.ocupado !== null;
  const [conf, setConf] = useState<Set<string>>(new Set(exp.itens_conferidos ?? []));
  const [f, setF] = useState({ volumes: String(exp.volumes ?? 1), peso_kg: String(exp.peso_kg ?? ""), transportadora_id: exp.transportadora_id ?? p.transportadora_id ?? "", codigo_rastreio: exp.codigo_rastreio ?? "", observacoes: "" });
  const [scan, setScan] = useState("");
  const etiquetasImp = useEtiquetas();
  const nota = p.notas?.find((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
  const prod = (id: string) => produtos.find((x) => x.id === id);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const atual = PASSOS.indexOf(exp.status);

  async function avancar(etapa: string, dados: Record<string, unknown> = {}) {
    if (await acoes.avancar(exp, etapa, dados)) onClose();
  }
  async function emitirNota() {
    if (await acoes.emitirNota(p.id)) onClose();
  }
  function lerCodigo(e: FormEvent) {
    e.preventDefault();
    const c = scan.trim().toLowerCase();
    const item = p.itens.find((i) => !conf.has(i.id) && [prod(i.produto_id)?.codigo_barras, prod(i.produto_id)?.sku, i.numero_serie].some((x) => x && String(x).toLowerCase() === c));
    if (item) { setConf(new Set([...conf, item.id])); notify(`Conferido: ${item.descricao}`); } else notify("Código não confere com nenhum item pendente", "erro");
    setScan("");
  }
  // abre o editor com o que está na tela (volumes, peso, transportadora e rastreio ainda não salvos)
  const etiquetas = () => etiquetasImp.abrir({ tipo: "pedido", pedido_id: p.id, sobrepor: { volumes: Number(f.volumes) || 1, peso_kg: f.peso_kg, transportadora_id: f.transportadora_id || null, rastreio: f.codigo_rastreio || null } });

  return (
    <Modal open onClose={onClose} title={`Expedição · pedido #${p.numero} · ${p.cliente?.nome ?? ""}`} wide>
      <ol className="mb-4 flex flex-wrap gap-1.5 text-xs font-semibold">
        {PASSOS.map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 ${i < atual ? "bg-emerald-50 text-emerald-700" : i === atual ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-500"}`}>{i < atual ? "✓ " : ""}{ETAPA[s]}</li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <FileText size={18} className={nota ? "text-emerald-600" : "text-amber-600"} />
        {nota ? <span>NF-e <b>{nota.numero}</b> autorizada</span> : <span className="text-amber-800">Sem NF-e autorizada: a mercadoria só pode sair com a nota.</span>}
        {!nota && !p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) && <Button type="button" variant="secondary" disabled={ocupado} onClick={emitirNota}><FileText size={15} /> Emitir NF-e</Button>}
        {!nota && p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) && <Badge value={p.notas.find((n) => ["processando", "contingencia"].includes(n.status))!.status} />}
      </div>

      {(exp.status === "separar" || exp.status === "separando") && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={18} /> {exp.status === "separar" ? "Lista de separação" : "Conferência"}</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {p.itens.map((i) => {
              const pr = prod(i.produto_id);
              const partes = pr?.kit ? composicao(i.produto_id, comps, i.kit_escolha) : [];
              return (
                <li key={i.id} className="flex items-start gap-3 p-3">
                  {exp.status === "separando" && <input type="checkbox" className="mt-1 h-5 w-5" checked={conf.has(i.id)} onChange={(e) => { const n = new Set(conf); if (e.target.checked) n.add(i.id); else n.delete(i.id); setConf(n); }} />}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-fg">{Number(i.quantidade)}× {i.descricao}</div>
                    <div className="text-xs text-slate-500">{[pr?.sku && `cód. ${pr.sku}`, pr?.localizacao && `local ${pr.localizacao}`, i.numero_serie && `série ${i.numero_serie}`].filter(Boolean).join(" · ")}</div>
                    {partes.length > 0 && <div className="mt-1 text-xs text-slate-600">Kit: {partes.map((c) => `${c.quantidade * Number(i.quantidade)}× ${prod(c.componente_id)?.descricao}${prod(c.componente_id)?.localizacao ? ` (${prod(c.componente_id)?.localizacao})` : ""}`).join(" · ")}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
          {exp.status === "separar"
            ? <div className="flex justify-end"><Button type="button" disabled={ocupado} onClick={() => avancar("separando", { responsavel: nomeUsuario })}><PackageCheck size={16} /> Começar a separar</Button></div>
            : (
              <>
                <form onSubmit={lerCodigo} className="flex gap-2">
                  <div className="relative flex-1"><Barcode size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input className="input pl-9" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Leia o código de barras, SKU ou nº de série (leitor ou digitando)" /></div>
                  <Button variant="secondary">Conferir</Button>
                </form>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-500">{conf.size} de {p.itens.length} itens conferidos</span>
                  <Button type="button" disabled={ocupado || conf.size < p.itens.length} onClick={() => avancar("conferido", { itens_conferidos: [...conf] })}><CheckCircle2 size={16} /> Conferência ok</Button>
                </div>
              </>
            )}
        </div>
      )}

      {(exp.status === "conferido" || exp.status === "embalado") && (
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold"><Truck size={18} /> {exp.status === "conferido" ? "Embalagem" : "Despacho"}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Volumes"><input className="input" type="number" min={1} value={f.volumes} onChange={set("volumes")} disabled={exp.status === "embalado"} /></Field>
            <Field label="Peso total (kg)"><input className="input" inputMode="decimal" value={f.peso_kg} onChange={set("peso_kg")} disabled={exp.status === "embalado"} /></Field>
            <Field label="Transportadora" className="col-span-2">
              <select className="input" value={f.transportadora_id} onChange={set("transportadora_id")}>
                <option value="">— (retira / entrega própria)</option>
                {transp.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Field>
            {exp.status === "embalado" && <Field label="Código de rastreio" className="col-span-2 sm:col-span-4"><input className="input" value={f.codigo_rastreio} onChange={set("codigo_rastreio")} placeholder="o cliente recebe por e-mail ao despachar" /></Field>}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={etiquetas} title="Conferir, editar e imprimir as etiquetas"><Printer size={16} /> Etiquetas</Button>
            {exp.status === "conferido"
              ? <Button type="button" disabled={ocupado} onClick={() => avancar("embalado", { volumes: Number(f.volumes), peso_kg: f.peso_kg ? Number(f.peso_kg.replace(",", ".")) : null, transportadora_id: f.transportadora_id || null })}><PackageCheck size={16} /> Embalado</Button>
              : <Button type="button" disabled={ocupado || !nota} title={nota ? "" : "emita a NF-e antes"} onClick={() => avancar("despachado", { transportadora_id: f.transportadora_id || null, codigo_rastreio: f.codigo_rastreio })}><Send size={16} /> Despachar</Button>}
          </div>
        </div>
      )}

      {exp.status === "despachado" && (
        <div className="space-y-3 text-sm">
          <p>Despachado em <b>{dataBR(exp.despachado_em)}</b>{exp.codigo_rastreio ? <> · rastreio <b>{exp.codigo_rastreio}</b></> : null}{exp.volumes ? ` · ${exp.volumes} volume(s)` : ""}.</p>
          <div className="flex justify-end"><Button type="button" disabled={ocupado} onClick={() => avancar("entregue")}><CheckCircle2 size={16} /> Marcar entregue</Button></div>
        </div>
      )}
      {exp.status === "entregue" && <p className="text-sm text-emerald-700">Entregue em {dataBR(exp.entregue_em)}.</p>}
      {etiquetasImp.modal}
    </Modal>
  );
}
