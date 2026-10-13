// Fluxo de pedidos: todos os pedidos (WhatsApp, loja, proposta, representante...) num painel só,
// do orçamento à entrega, com a NF-e automática e a expedição (separar, conferir, embalar, despachar).
// Cada cartão diz o próximo passo e tem o botão que faz esse passo; o resumo no alto mostra o que precisa de ação agora.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Printer, Search, User, Zap, ZapOff } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { Cartao } from "@/components/fluxo/Cartao";
import { BlocosEtapas, FaixaAcao, type ResumoEtapa } from "@/components/fluxo/Resumo";
import { ExpedicaoModal, useAcoesExpedicao } from "@/components/fluxo/Expedicao";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl } from "@/lib/format";
import { useConfig } from "@/lib/useConfig";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { CANAIS } from "@/lib/margem";
import { usePerfil } from "@/lib/auth";
import { COLUNAS, situacao, type Acao, type ColunaId, type EnvioFluxo, type Exp, type Nivel, type PedidoFluxo as P, type Situacao, type TipoAlerta } from "@/lib/fluxo";

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

export default function Fluxo() {
  const { filtrar } = useUnidade();
  const { papel, user_id, nome: nomeUsuario, pode, podeVer, tem } = usePerfil();
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
  const escolheVendedor = tem("financeiro");
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
        actions={cfg && (cfg.nfe_automatica ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" title="Pedido aprovado tem a nota emitida sozinho">
            <Zap size={13} aria-hidden /> NF-e automática ligada
          </span>
        ) : podeVer("configuracoes") ? (
          <Link to="/configuracoes/pedidos" title="Hoje cada pedido aprovado espera alguém emitir a nota pelo botão Emitir NF-e do cartão"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:border-amber-500">
            <ZapOff size={13} aria-hidden /> NF-e automática desligada · Ligar <ArrowRight size={13} aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800" title="Emita a nota de cada pedido aprovado pelo botão Emitir NF-e no cartão">
            <ZapOff size={13} aria-hidden /> NF-e automática desligada
          </span>
        ))} />

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
