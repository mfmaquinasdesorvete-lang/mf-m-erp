// Separação e embalagem: a tela do estoque/expedição (pensada para tablet e celular no galpão).
// Fila por etapa (separar → conferir → embalar → despachar), lista de separação somada por produto e local de vários
// pedidos de uma vez, conferência com leitor, embalagem, etiquetas, DANFE e despacho. Os botões grandes fazem o próximo passo.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlarmClock, Barcode, CheckSquare, ClipboardCheck, ExternalLink, FileWarning, Hourglass, ListChecks, PackageCheck, Printer, Search, Send,
  Square, Timer, Truck, Users,
} from "lucide-react";
import { Section } from "@/components/ui";
import { CabecalhoPainel, CartaoPainel, ListaAtencao, type Cartao, type ItemAtencao } from "@/components/painel/Painel";
import { ExpedicaoModal, useAcoesExpedicao } from "@/components/fluxo/Expedicao";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { pecasDoKit } from "@/lib/kits";
import { notify } from "@/lib/notify";
import { hoje, pl } from "@/lib/format";
import type { Exp, PedidoFluxo as P } from "@/lib/fluxo";
import type { KitComponente, Produto, Transportadora } from "@/lib/types";
import { confirmar } from "@/components/Dialogos";

const SELECT = "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id, status, numero, serie, chave, mensagem, ambiente, created_at, danfe_url)";
type Etapa = "separar" | "conferir" | "embalar" | "despachar";
const ETAPAS: { id: Etapa; status: string; titulo: string; frase: string; botao: string; icone: typeof Truck }[] = [
  { id: "separar", status: "separar", titulo: "Separar", frase: "Pegue os itens no estoque. Dá para separar vários pedidos de uma vez pela lista somada.", botao: "Começar a separar", icone: ListChecks },
  { id: "conferir", status: "separando", titulo: "Conferir", frase: "Confira cada item com o leitor de código de barras, o SKU ou o número de série.", botao: "Conferir itens", icone: ClipboardCheck },
  { id: "embalar", status: "conferido", titulo: "Embalar", frase: "Informe volumes e peso e imprima as etiquetas.", botao: "Embalar", icone: PackageCheck },
  { id: "despachar", status: "embalado", titulo: "Despachar", frase: "Sai com a NF-e autorizada. O cliente recebe o rastreio por e-mail.", botao: "Despachar", icone: Send },
];
const CHAVE_ETAPA = "erp.expedicao.etapa";

type Linha = { p: P; e: Exp; desde: string; horas: number; nota: P["notas"][number] | undefined; processando: boolean };

/** Desde quando o pedido está na etapa atual. */
function desdeDe(e: Exp, p: P) {
  if (e.status === "separando") return e.separando_em ?? e.created_at;
  if (e.status === "conferido") return e.conferido_em ?? e.created_at;
  if (e.status === "embalado") return e.embalado_em ?? e.created_at;
  return p.aprovado_em ?? e.created_at;
}
const tempo = (horas: number) => (horas < 1 ? "agora há pouco" : horas < 24 ? `há ${Math.floor(horas)} h` : `há ${Math.floor(horas / 24)} ${pl(Math.floor(horas / 24), "dia", "dias")}`);
const corTempo = (horas: number) => (horas >= 24 ? "text-red-600" : horas >= 8 ? "text-amber-600" : "text-slate-500");

export default function PainelExpedicao() {
  const { pode, nome } = usePerfil();
  const podeExpedir = pode("expedir");
  const { filtrar } = useUnidade();
  const invalidar = useInvalidate();
  const { data: pedidos = [], isLoading } = useRows<P>("pedidos", { select: SELECT, key: ["expedicao"] });
  const { data: exps = [] } = useRows<Exp>("expedicoes", {});
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: transp = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const acoes = useAcoesExpedicao();
  const etiquetas = useEtiquetas();
  const [etapa, setEtapaState] = useState<Etapa>(() => { try { return (localStorage.getItem(CHAVE_ETAPA) as Etapa) || "separar"; } catch { return "separar"; } });
  const setEtapa = (e: Etapa) => { setEtapaState(e); try { localStorage.setItem(CHAVE_ETAPA, e); } catch { /* sem armazenamento */ } };
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<{ p: P; e: Exp } | null>(null);
  const [fora, setFora] = useState<Set<string>>(new Set()); // pedidos tirados da lista de separação
  const [lote, setLote] = useState(false);

  // outras pessoas mexendo ao mesmo tempo: atualiza a cada 30 s
  useEffect(() => {
    const t = setInterval(() => invalidar("pedidos", "expedicoes"), 30_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prod = useMemo(() => new Map(produtos.map((x) => [x.id, x])), [produtos]);
  const nomeTransp = (id: string | null | undefined) => (id ? transp.find((t) => t.id === id)?.nome ?? "transportadora" : "retira / entrega própria");

  const { porEtapa, todasLinhas, despachadosHoje } = useMemo(() => {
    const porPedido = new Map(filtrar(pedidos).map((p) => [p.id, p]));
    const agora = Date.now();
    const linhas: Linha[] = [];
    for (const e of exps) {
      const p = porPedido.get(e.pedido_id);
      if (!p || !ETAPAS.some((x) => x.status === e.status)) continue;
      const desde = desdeDe(e, p);
      const nota = p.notas?.find((n) => n.status === "autorizada" && n.ambiente !== "homologacao");
      linhas.push({ p, e, desde, horas: (agora - Date.parse(desde)) / 36e5, nota, processando: !!p.notas?.some((n) => ["processando", "contingencia"].includes(n.status)) });
    }
    linhas.sort((a, b) => a.desde.localeCompare(b.desde));
    const porEtapa = Object.fromEntries(ETAPAS.map((x) => [x.id, linhas.filter((l) => l.e.status === x.status)])) as Record<Etapa, Linha[]>;
    const dia = hoje();
    const despachadosHoje = exps.filter((e) => porPedido.has(e.pedido_id) && (e.despachado_em ?? "").slice(0, 10) === dia);
    return { porEtapa, todasLinhas: linhas, despachadosHoje };
  }, [pedidos, exps, filtrar]);

  const termo = busca.trim().toLowerCase().replace(/^#/, "");
  const lista = porEtapa[etapa].filter((l) => !termo || `${l.p.numero} ${l.p.cliente?.nome ?? ""} ${l.p.cliente?.nome_fantasia ?? ""}`.toLowerCase().includes(termo));
  const aSeparar = porEtapa.separar.filter((l) => !fora.has(l.p.id));

  // lista de separação: soma por produto (kits abertos nos componentes), na ordem do local no estoque
  const separacao = useMemo(() => {
    const m = new Map<string, { id: string; descricao: string; sku: string | null; local: string | null; qtd: number; pedidos: Set<number> }>();
    const somar = (id: string, descricao: string, qtd: number, numero: number) => {
      const pr = prod.get(id);
      const x = m.get(id) ?? { id, descricao: pr?.descricao ?? descricao, sku: pr?.sku ?? null, local: pr?.localizacao ?? null, qtd: 0, pedidos: new Set<number>() };
      x.qtd += qtd; x.pedidos.add(numero); m.set(id, x);
    };
    for (const { p } of aSeparar) for (const i of p.itens ?? []) {
      const pr = prod.get(i.produto_id);
      const partes = pr?.kit ? pecasDoKit(i.produto_id, comps, i.kit_escolha) : [];
      if (partes.length) for (const c of partes) somar(c.componente_id, prod.get(c.componente_id)?.descricao ?? "componente", c.quantidade * Number(i.quantidade), p.numero);
      else somar(i.produto_id, i.descricao, Number(i.quantidade), p.numero);
    }
    // sem local cadastrado vai para o fim
    return [...m.values()].sort((a, b) => Number(!a.local) - Number(!b.local) || (a.local ?? "").localeCompare(b.local ?? "", "pt-BR", { numeric: true }) || a.descricao.localeCompare(b.descricao, "pt-BR"));
  }, [aSeparar, prod, comps]);

  async function comecarTodos() {
    if (!aSeparar.length || !(await confirmar(`Começar a separar ${aSeparar.length} ${pl(aSeparar.length, "pedido", "pedidos")}? Eles vão para Conferir com você como responsável.`))) return;
    setLote(true);
    let ok = 0;
    for (const l of aSeparar) if (await acoes.avancar(l.e, "separando", { responsavel: nome }, `Pedido #${l.p.numero}: separação começou`)) ok++;
    setLote(false);
    if (ok > 1) notify(`${ok} pedidos em separação`);
    setFora(new Set());
  }

  function imprimirSeparacao() {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { notify("Libere as janelas (pop-up) do ERP no navegador para imprimir", "erro"); return; }
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const linhas = separacao.map((x) => `<tr><td class="c">☐</td><td>${esc(x.local ?? "—")}</td><td><b>${esc(x.descricao)}</b>${x.sku ? `<br><small>${esc(x.sku)}</small>` : ""}</td><td class="n">${x.qtd.toLocaleString("pt-BR")}</td><td><small>${[...x.pedidos].map((n) => `#${n}`).join(" ")}</small></td></tr>`).join("");
    const pedidosTxt = aSeparar.map((l) => `#${l.p.numero} ${esc(l.p.cliente?.nome_fantasia || l.p.cliente?.nome || "")}`).join(" · ");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de separação</title><style>
      body{font:13px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#444}
      table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#f2f2f2}.n{text-align:right;font-size:15px;font-weight:700}.c{width:22px;font-size:16px}small{color:#555}
    </style></head><body><h1>Lista de separação · ${new Date().toLocaleString("pt-BR")}</h1><p>${aSeparar.length} ${pl(aSeparar.length, "pedido", "pedidos")}: ${pedidosTxt}</p>
    <table><thead><tr><th></th><th>Local</th><th>Produto</th><th class="n">Qtd.</th><th>Pedidos</th></tr></thead><tbody>${linhas}</tbody></table>
    <p style="margin-top:16px">Separado por: ____________________ &nbsp; Conferido por: ____________________</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  function lerPedido(ev: FormEvent) {
    ev.preventDefault();
    const n = Number(termo);
    const l = n ? todasLinhas.find((x) => x.p.numero === n) : undefined;
    if (l) { setEtapa(ETAPAS.find((x) => x.status === l.e.status)!.id); if (podeExpedir) setAberta({ p: l.p, e: l.e }); setBusca(""); }
  }

  function agir(l: Linha) {
    if (!podeExpedir) return;
    if (l.e.status === "separar") void acoes.avancar(l.e, "separando", { responsavel: nome }, `Pedido #${l.p.numero}: separação começou`);
    else setAberta({ p: l.p, e: l.e });
  }

  const semNota = porEtapa.despachar.filter((l) => !l.nota);
  const atrasadosSeparar = porEtapa.separar.filter((l) => l.horas >= 24);
  const conferenciaParada = porEtapa.conferir.filter((l) => l.horas >= 4);
  const porPessoa = useMemo(() => {
    const dia = hoje();
    const m = new Map<string, number>();
    for (const e of exps) if ((e.separando_em ?? "").slice(0, 10) === dia) { const r = e.responsavel?.trim() || "Sem nome"; m.set(r, (m.get(r) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [exps]);
  const tempoMedio = useMemo(() => {
    const limite = Date.now() - 30 * 864e5;
    const porPedido = new Map(pedidos.map((p) => [p.id, p]));
    const t = exps.filter((e) => e.despachado_em && Date.parse(e.despachado_em) >= limite).map((e) => {
      const p = porPedido.get(e.pedido_id);
      const ini = p?.aprovado_em ?? e.created_at;
      return (Date.parse(e.despachado_em!) - Date.parse(ini)) / 36e5;
    }).filter((h) => h >= 0);
    return t.length ? t.reduce((s, h) => s + h, 0) / t.length : null;
  }, [exps, pedidos]);

  const cartoes: Cartao[] = [
    { id: "separar", rotulo: "Para separar", valor: porEtapa.separar.length, icone: ListChecks, cor: "var(--kpi-azul)", onClick: () => setEtapa("separar"),
      sub: atrasadosSeparar.length ? `${atrasadosSeparar.length} esperando há mais de 1 dia` : "nenhum atrasado" },
    { id: "conferir", rotulo: "Em conferência", valor: porEtapa.conferir.length, icone: ClipboardCheck, cor: "var(--kpi-roxo)", onClick: () => setEtapa("conferir"),
      sub: conferenciaParada.length ? `${conferenciaParada.length} ${pl(conferenciaParada.length, "parado", "parados")} há mais de 4 h` : "andando" },
    { id: "embalar", rotulo: "Para embalar", valor: porEtapa.embalar.length, icone: PackageCheck, cor: "var(--kpi-laranja)", onClick: () => setEtapa("embalar"), sub: "conferidos, esperando caixa" },
    { id: "despachar", rotulo: "Prontos para sair", valor: porEtapa.despachar.length, icone: Truck, cor: "var(--kpi-ciano)", onClick: () => setEtapa("despachar"),
      sub: semNota.length ? `${semNota.length} sem NF-e autorizada` : "todos com NF-e" },
    { id: "hoje", rotulo: "Despachados hoje", valor: despachadosHoje.length, icone: Send, cor: "var(--kpi-verde)",
      sub: tempoMedio !== null ? `da aprovação ao despacho: ${tempoMedio < 48 ? `${Math.round(tempoMedio)} h` : `${(tempoMedio / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`} em média (30 dias)` : "sem despachos nos últimos 30 dias" },
  ];

  const atencao: ItemAtencao[] = [
    atrasadosSeparar.length > 0 && { icone: AlarmClock, cor: "var(--kpi-rosa)", texto: `${atrasadosSeparar.length} ${pl(atrasadosSeparar.length, "pedido", "pedidos")} esperando separação há mais de 1 dia`, sub: atrasadosSeparar.slice(0, 3).map((l) => `#${l.p.numero}`).join(" · "), to: "/expedicao" },
    semNota.length > 0 && { icone: FileWarning, cor: "var(--kpi-roxo)", texto: `${semNota.length} ${pl(semNota.length, "embalado", "embalados")} sem NF-e autorizada`, sub: "não podem sair: peça a nota a vendas ou ao financeiro", to: "/expedicao" },
    conferenciaParada.length > 0 && { icone: Hourglass, cor: "var(--kpi-laranja)", texto: `${conferenciaParada.length} ${pl(conferenciaParada.length, "conferência", "conferências")} ${pl(conferenciaParada.length, "parada", "paradas")} há mais de 4 h`, sub: conferenciaParada.slice(0, 3).map((l) => `#${l.p.numero} · ${l.e.responsavel ?? "sem responsável"}`).join(" · "), to: "/expedicao" },
  ].filter(Boolean) as ItemAtencao[];

  const atual = ETAPAS.find((x) => x.id === etapa)!;
  const resumo = isLoading ? "Carregando…"
    : <>{porEtapa.separar.length} para separar · {porEtapa.conferir.length} em conferência · {porEtapa.embalar.length} para embalar · {porEtapa.despachar.length} {pl(porEtapa.despachar.length, "pronto", "prontos")} para sair.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={PackageCheck} area="Expedição" titulo="Separação e embalagem" resumo={resumo}
        acoes={(
          <form onSubmit={lerPedido} className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pedido" placeholder="Nº do pedido ou cliente (Enter abre)"
              className="h-10 w-full rounded-xl border-0 bg-white pl-9 pr-3 text-sm text-slate-800 shadow placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/70 sm:w-72" />
          </form>
        )} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}
      </div>

      {/* Etapas: botões grandes para o tablet */}
      <div role="tablist" aria-label="Etapa" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ETAPAS.map((x) => {
          const ativo = x.id === etapa;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={ativo} onClick={() => setEtapa(x.id)}
              className={`flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 text-left transition ${ativo ? "border-modulo bg-modulo text-white shadow-card" : "border-slate-200 bg-surface text-fg hover:border-modulo/50"}`}>
              <x.icone size={22} className={ativo ? "text-white" : "text-modulo-texto"} aria-hidden />
              <span className="flex-1 text-[15px] font-bold">{x.titulo}</span>
              <span className={`num grid h-8 min-w-[32px] place-items-center rounded-full px-2 text-sm font-extrabold ${ativo ? "bg-white/20" : "bg-slate-100 text-slate-700"}`}>{porEtapa[x.id].length}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="space-y-3 xl:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-slate-600">{atual.frase}</p>
            {etapa === "embalar" || etapa === "despachar" ? lista.length > 0 && (
              <button type="button" disabled={etiquetas.ocupado} onClick={() => etiquetas.imprimir(lista.map((l) => ({ tipo: "pedido" as const, pedido_id: l.p.id })))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-surface px-3 py-2 text-sm font-semibold text-fg hover:border-modulo disabled:opacity-50">
                <Printer size={16} /> Etiquetas de todos
              </button>
            ) : null}
          </div>
          {isLoading ? <p className="py-10 text-center text-slate-500">Carregando pedidos…</p> : lista.length ? (
            <ul className="space-y-2.5">
              {lista.map((l) => {
                const marcado = etapa === "separar" && !fora.has(l.p.id);
                const itens = l.p.itens ?? [];
                const unidades = itens.reduce((s, i) => s + Number(i.quantidade), 0);
                return (
                  <li key={l.p.id} className={`rounded-2xl border bg-surface p-3 shadow-card sm:p-4 ${l.horas >= 24 ? "border-red-200" : "border-slate-200/80"}`}>
                    <div className="flex items-start gap-3">
                      {etapa === "separar" && (
                        <button type="button" onClick={() => { const n = new Set(fora); if (marcado) n.add(l.p.id); else n.delete(l.p.id); setFora(n); }}
                          aria-pressed={marcado} title={marcado ? "Tirar da lista de separação" : "Pôr na lista de separação"} className="mt-0.5 text-modulo-texto">
                          {marcado ? <CheckSquare size={24} /> : <Square size={24} className="text-slate-400" />}
                        </button>
                      )}
                      <button type="button" onClick={() => podeExpedir && setAberta({ p: l.p, e: l.e })} className="min-w-0 flex-1 text-left">
                        <span className="block text-lg font-extrabold leading-tight text-fg">#{l.p.numero} · {l.p.cliente?.nome_fantasia || l.p.cliente?.nome}</span>
                        <span className="mt-0.5 block text-sm text-slate-600">
                          {l.p.cliente?.municipio ? `${l.p.cliente.municipio}/${l.p.cliente.uf ?? ""} · ` : ""}{itens.length} {pl(itens.length, "item", "itens")}, {unidades.toLocaleString("pt-BR")} un. · {nomeTransp(l.e.transportadora_id ?? l.p.transportadora_id)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                          <span className={`inline-flex items-center gap-1 ${corTempo(l.horas)}`}><Timer size={13} aria-hidden /> {tempo(l.horas)} nesta etapa</span>
                          {l.e.responsavel && <span className="inline-flex items-center gap-1 text-slate-500"><Users size={13} aria-hidden /> {l.e.responsavel}</span>}
                          {l.nota ? <span className="text-emerald-700">NF-e {l.nota.numero}</span> : l.processando ? <span className="text-sky-700">NF-e processando</span> : <span className="text-amber-700">sem NF-e</span>}
                          {l.e.volumes && l.e.status !== "separar" && l.e.status !== "separando" ? <span className="text-slate-500">{l.e.volumes} {pl(l.e.volumes, "volume", "volumes")}</span> : null}
                        </span>
                        {etapa === "separar" && (
                          <span className="mt-2 block text-sm text-slate-700">
                            {itens.slice(0, 4).map((i) => `${Number(i.quantidade)}× ${i.descricao}${prod.get(i.produto_id)?.localizacao ? ` (${prod.get(i.produto_id)!.localizacao})` : ""}`).join(" · ")}{itens.length > 4 ? " …" : ""}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {l.nota?.danfe_url && (
                        <a href={l.nota.danfe_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-fg hover:border-modulo">
                          <ExternalLink size={16} /> DANFE
                        </a>
                      )}
                      {(etapa === "embalar" || etapa === "despachar") && (
                        <button type="button" disabled={etiquetas.ocupado} onClick={() => etiquetas.imprimir([{ tipo: "pedido", pedido_id: l.p.id }])}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-fg hover:border-modulo disabled:opacity-50">
                          <Printer size={16} /> Etiquetas
                        </button>
                      )}
                      {podeExpedir && (
                        <button type="button" disabled={acoes.ocupado === l.p.id || lote || (etapa === "despachar" && !l.nota)} onClick={() => agir(l)}
                          title={etapa === "despachar" && !l.nota ? "Precisa da NF-e autorizada" : undefined}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-modulo px-4 text-[15px] font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50">
                          <atual.icone size={18} aria-hidden /> {acoes.ocupado === l.p.id ? "Salvando…" : atual.botao}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-10 text-center text-slate-500">
              {termo ? "Nenhum pedido com essa busca nesta etapa." : `Nada para ${atual.titulo.toLowerCase()} agora. ✅`}
            </p>
          )}
        </div>

        <div className="space-y-4 xl:col-span-2">
          {etapa === "separar" && (
            <Section title={`Lista de separação · ${aSeparar.length} ${pl(aSeparar.length, "pedido", "pedidos")}`}
              actions={separacao.length > 0 && <button type="button" onClick={imprimirSeparacao} className="inline-flex items-center gap-1 text-sm font-semibold text-modulo-texto hover:underline"><Printer size={15} /> Imprimir</button>}>
              {separacao.length ? (
                <>
                  <ul className="divide-y divide-slate-100">
                    {separacao.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 py-2">
                        <span className="w-16 shrink-0 rounded-lg bg-slate-100 px-1.5 py-1 text-center text-xs font-bold text-slate-700" title="Local no estoque">{x.local ?? "—"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">{x.descricao}</span>
                          <span className="block truncate text-xs text-slate-500">{x.sku ? `${x.sku} · ` : ""}{[...x.pedidos].map((n) => `#${n}`).join(" ")}</span>
                        </span>
                        <span className="num shrink-0 text-lg font-extrabold text-fg">{x.qtd.toLocaleString("pt-BR")}</span>
                      </li>
                    ))}
                  </ul>
                  {podeExpedir && (
                    <button type="button" disabled={lote || !aSeparar.length} onClick={comecarTodos}
                      className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-modulo px-4 text-[15px] font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50">
                      <ListChecks size={18} /> {lote ? "Salvando…" : `Começar a separar ${aSeparar.length === 1 ? "o pedido" : `os ${aSeparar.length} pedidos`}`}
                    </button>
                  )}
                  <p className="mt-2 text-xs text-slate-500">Soma dos pedidos marcados, na ordem do local no estoque. Kits já aparecem abertos nos componentes. Desmarque um pedido na lista ao lado para tirá-lo daqui.</p>
                </>
              ) : <p className="py-6 text-center text-sm text-slate-500">Nenhum pedido marcado para separar.</p>}
            </Section>
          )}
          {etapa === "conferir" && (
            <Section title="Como conferir">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                <li>Toque em <b>Conferir itens</b> no pedido.</li>
                <li>Leia o código de barras de cada peça com o leitor (ou digite o SKU ou o número de série).</li>
                <li>Quando todos os itens estiverem marcados, toque em <b>Conferência ok</b>.</li>
              </ol>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Barcode size={14} aria-hidden /> Leitor USB ou Bluetooth funciona como teclado: é só ler com o campo selecionado.</p>
            </Section>
          )}
          <Section title="Precisa de atenção">
            <ListaAtencao itens={atencao} vazio="Expedição em dia" />
          </Section>
          <Section title="Separações de hoje por pessoa">
            {porPessoa.length ? (
              <ul className="space-y-1.5">
                {porPessoa.map(([n, q]) => (
                  <li key={n} className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-slate-700">{n}</span><span className="num font-bold text-fg">{q} {pl(q, "pedido", "pedidos")}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Nenhuma separação começou hoje.</p>}
          </Section>
        </div>
      </div>

      {aberta && <ExpedicaoModal pedido={aberta.p} exp={aberta.e} onClose={() => setAberta(null)} />}
      {etiquetas.modal}
    </div>
  );
}
