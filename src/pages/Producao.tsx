import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2, ClipboardList, Factory, FileDown, History, Layers, MessageCircle, PackageCheck, PackageSearch, Play, Plus, ShoppingBag, Trash2, Truck, XCircle,
} from "lucide-react";
import { Badge, CelulaAbrir, Button, Card, Field, Modal, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { limpar, useInvalidate, useRows, semUnificados } from "@/lib/data";
import { criarComItens, desfazerCompra, sincronizarItens } from "@/lib/itens";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, somarDias, whatsappLink, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { comUnidade, pdfPedidoCompra } from "@/lib/pdf";
import { useConfig } from "@/lib/useConfig";
import { textoPadrao } from "@/lib/textosPadrao";
import { UltimasCompras } from "@/components/compras/UltimasCompras";
import { NotasDaOc } from "@/components/compras/NotasDaOc";
import { Historico } from "@/components/Historico";
import { usePerfil } from "@/lib/auth";
import type { EtapaOp, Fornecedor, ItemCompra, Necessidade, OrdemProducao, PedidoCompra, Produto } from "@/lib/types";
import { Reposicao } from "@/components/Reposicao";
import { NecessidadesCompra } from "@/components/compras/NecessidadesCompra";
import { Cotacoes } from "@/components/Cotacoes";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { niveis, temFicha, type LinhaFicha } from "@/lib/estrutura";
import { BotaoMarcadores, ChipsMarcadores, useMarcadores } from "@/components/nfe/Marcadores";
import { DocumentosExcluidos, ExcluirDocumento } from "@/components/ExcluirDocumento";
import { confirmar } from "@/components/Dialogos";
import { buscaDaAba, useAbaUrl } from "@/lib/abaUrl";
import { FichaTecnica } from "@/components/producao/FichaTecnica";
import { TesteGigaDaOp } from "@/components/testeGiga/SeloGiga";
import { avisoGigaDaOp } from "@/lib/testeGigaDados";

type Aba = "producao" | "reposicao" | "necessidades" | "compras" | "cotacoes" | "ficha";
/** Duas telas: Produção (ordens e ficha técnica) e Compras (pedidos de compra, cotações, necessidades de compra e reposição). */
type Area = "producao" | "compras";
const ABAS_DA_AREA: Record<Area, readonly Aba[]> = { producao: ["producao", "ficha"], compras: ["compras", "cotacoes", "necessidades", "reposicao"] };
const ROTA_DA_AREA: Record<Area, string> = { producao: "/producao", compras: "/compras" };
const areaDaAba = (a: string | null | undefined): Area | null =>
  a && (ABAS_DA_AREA.compras as readonly string[]).includes(a) ? "compras" : a && (ABAS_DA_AREA.producao as readonly string[]).includes(a) ? "producao" : null;


/** Quantidade no jeito brasileiro: 0,5 · 1.250 · 2,375 */
const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Quanto falta comprar de cada peça para a OP. */
const falta = (n: Necessidade) =>
  Math.max(0, Number(n.necessario) - Math.max(0, Number(n.estoque_atual) - Number(n.reservado_outras_op)) - Number(n.a_caminho));

export default function Producao({ area = "producao" }: { area?: Area } = {}) {
  const { pode } = usePerfil();
  const location = useLocation();
  const navigate = useNavigate();
  const verCompras = pode("editar_producao") || pode("receber_compras");
  const [aba, setAba] = useAbaUrl<Aba>(ABAS_DA_AREA[area][0], ABAS_DA_AREA[area]);
  const [novaCompra, setNovaCompra] = useState(false);
  // aba da outra tela (link antigo "/producao?aba=compras", aviso de cotação respondida…): vai para a tela certa
  const irPara = (a: Aba) => {
    const outra = areaDaAba(a);
    if (outra && outra !== area) navigate({ pathname: ROTA_DA_AREA[outra], search: buscaDaAba(a, ABAS_DA_AREA[outra][0]) });
    else setAba(a);
  };

  const [cotarItens, setCotarItens] = useState<{ produto_id: string; quantidade: number }[] | null>(null);
  // o aviso "cotação respondida" abre com ?aba=cotacoes (a aba já vem do endereço)
  useEffect(() => {
    const st = location.state as any;
    const pedida = st?.aba ?? new URLSearchParams(location.search).get("aba");
    const outra = areaDaAba(pedida);
    if (outra && outra !== area) {
      navigate({ pathname: ROTA_DA_AREA[outra], search: buscaDaAba(pedida, ABAS_DA_AREA[outra][0]) }, { replace: true, state: st ?? null });
      return;
    }
    if (st?.novaCompra) setNovaCompra(true);
    if (st) navigate({ pathname: location.pathname, search: st.aba ? buscaDaAba(st.aba, ABAS_DA_AREA[area][0]) : location.search }, { replace: true, state: null });
  }, [location.state, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const abas: { value: Aba; label: string }[] = area === "producao"
    ? [{ value: "producao", label: "Ordens de produção" }, { value: "ficha", label: "Ficha técnica" }]
    : verCompras ? [{ value: "compras", label: "Pedidos de compra" }, { value: "cotacoes", label: "Cotações" }, { value: "necessidades", label: "Necessidades de compra" }, { value: "reposicao", label: "Reposição de estoque" }] : [];

  return (
    <div>
      {area === "producao"
        ? <PageHeader title="Produção" subtitle="Monte as máquinas: o quadro mostra cada ordem, o que está atrasado e as peças que faltam." />
        : <PageHeader title="Compras" subtitle="Peça aos fornecedores com cotação, escolha se a compra vem para SC ou SP e mande pelo WhatsApp." />}
      {area === "compras" && !verCompras ? <Card className="p-4 text-sm text-slate-600">Seu perfil não faz compras.</Card> : <Tabs value={aba} onChange={setAba} options={abas} />}
      {aba === "producao" && <OrdensProducao irParaCompras={() => irPara("compras")} />}
      {aba === "reposicao" && verCompras && <Reposicao podeComprar={pode("editar_producao")} aoGerar={() => setAba("compras")}
        aoCotar={(itens) => { setCotarItens(itens); setAba("cotacoes"); }} />}
      {aba === "necessidades" && verCompras && <NecessidadesCompra podeComprar={pode("editar_producao")} aoGerar={() => setAba("compras")}
        aoCotar={(itens) => { setCotarItens(itens); setAba("cotacoes"); }} />}
      {aba === "cotacoes" && verCompras && <Cotacoes podeEditar={pode("editar_producao")} inicial={cotarItens}
        aoGerarPedidos={() => { setCotarItens(null); setAba("compras"); }} />}
      {aba === "compras" && verCompras && <PedidosCompra abrirNovo={novaCompra} onAberto={() => setNovaCompra(false)} />}
      {aba === "ficha" && <FichaTecnica />}
    </div>
  );
}

/* ============================== Ordens de produção ============================== */

function useNecessidade() {
  return useRows<Necessidade>("necessidade_producao", { order: "descricao", ascending: true });
}

function OrdensProducao({ irParaCompras }: { irParaCompras: () => void }) {
  const { data: cfgTextos } = useConfig();
  const { pode } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: ordensTodos = [], isLoading } = useRows<OrdemProducao>("ordens_producao", { select: "*, produto:produtos(*)" });
  const ordens = filtrar(ordensTodos);
  const { data: necessidade = [] } = useNecessidade();
  const [aberta, setAberta] = useState<Partial<OrdemProducao> | null>(null);
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [verExcluidas, setVerExcluidas] = useState(false);
  const [vista, setVista] = useAbaUrl<"quadro" | "lista">("quadro", ["quadro", "lista"] as const, "ver");
  const { data: marcadores = [] } = useMarcadores();

  const lista = ordens.filter((o) => mostrarTodas || ["planejada", "em_producao"].includes(o.status));
  const faltasPorOP = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of necessidade) if (falta(n) > 0) m.set(n.ordem_id, (m.get(n.ordem_id) ?? 0) + 1);
    return m;
  }, [necessidade]);
  const abertas = ordens.filter((o) => ["planejada", "em_producao"].includes(o.status));

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ClipboardList} tom="info" label="Planejadas" valor={ordens.filter((o) => o.status === "planejada").length} />
        <Stat icon={Factory} tom="atencao" label="Em produção" valor={ordens.filter((o) => o.status === "em_producao").length} />
        <Stat icon={PackageSearch} tom={abertas.some((o) => faltasPorOP.get(o.id)) ? "critico" : "bom"} label="Ordens com peça faltando"
          valor={abertas.filter((o) => faltasPorOP.get(o.id)).length} />
        <Stat icon={PackageCheck} tom="bom" label="Máquinas montadas no mês"
          valor={ordens.filter((o) => o.status === "concluida" && (o.concluida_em ?? "").startsWith(hoje().slice(0, 7))).reduce((s, o) => s + Number(o.quantidade), 0)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Como ver as ordens">
            {([["quadro", "Quadro"], ["lista", "Lista"]] as const).map(([v, r]) => (
              <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${vista === v ? "bg-brand text-brand-fg" : "text-slate-600 hover:bg-slate-100"}`}>{r}</button>
            ))}
          </div>
          {vista === "lista" && <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={mostrarTodas} onChange={(e) => setMostrarTodas(e.target.checked)} /> Mostrar concluídas e canceladas
          </label>}
        </div>
        <div className="flex flex-wrap gap-2">
          {pode("editar_producao") && <Button variant="ghost" onClick={() => setVerExcluidas(true)}><Trash2 size={16} /> Excluídas</Button>}
          {pode("editar_producao") && <Button onClick={() => setAberta({ quantidade: 1, status: "planejada", previsao: somarDias(10), observacoes: textoPadrao(cfgTextos, "op_observacoes") || null })}><Plus size={16} /> Nova ordem de produção</Button>}
        </div>
      </div>

      {vista === "quadro" ? <QuadroProducao ordens={ordens} faltas={faltasPorOP} marcadores={marcadores} carregando={isLoading} aoAbrir={setAberta} /> :
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">OP</th><th className="th">Produto</th><th className="th text-right">Qtd</th><th className="th">Situação</th><th className="th">Peças</th><th className="th">Previsão</th><th className="th"><span className="sr-only">Ações</span></th><th className="th" /></>}>
        {lista.map((o) => {
          const f = faltasPorOP.get(o.id) ?? 0;
          const aberta = ["planejada", "em_producao"].includes(o.status);
          return (
            <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta(o)}>
              <td className="td font-bold text-fg">#{o.numero}</td>
              <td className="td">{o.produto?.descricao}{o.responsavel && <div className="text-xs text-slate-500">{o.responsavel}</div>}
                <div className="mt-1"><ChipsMarcadores ids={o.marcadores} todos={marcadores} pequeno /></div></td>
              <td className="td num text-right">{Number(o.quantidade)}</td>
              <td className="td"><Badge value={o.status} /></td>
              <td className="td">{aberta ? (f ? <span className="font-semibold text-red-600">faltam {f} {pl(f, "peça", "peças")}</span> : <span className="font-semibold text-emerald-700">tudo disponível</span>) : "—"}</td>
              <td className={`td num ${aberta && o.previsao && o.previsao < hoje() ? "font-semibold text-red-600" : ""}`}>{dataBR(o.previsao)}</td>
              <td className="td whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <BotaoMarcadores tabela="ordens_producao" registro={o} nome={["ordem de produção", "ordens de produção"]} />
                {pode("editar_producao") && o.status !== "concluida" && <ExcluirDocumento tabela="ordens_producao" id={o.id} numero={o.numero} />}
              </td>
              <CelulaAbrir texto="Ver / editar" />
            </tr>
          );
        })}
      </Table>}

      {aberta && <OPModal inicial={aberta} onClose={() => setAberta(null)} irParaCompras={irParaCompras} />}
      {verExcluidas && <DocumentosExcluidos tabela="ordens_producao" onClose={() => setVerExcluidas(false)} />}
    </>
  );
}

/** Para quem o fornecedor fatura e onde entrega (vai na mensagem do WhatsApp): razão social, CNPJ, IE e endereço da unidade. */
function dadosDestino(u: { razao_social: string | null; cnpj: string | null; inscricao_estadual: string | null; logradouro: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null; cep: string | null }) {
  const cnpj = String(u.cnpj ?? "").replace(/\D/g, "");
  const cnpjFmt = cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpj;
  const cep = String(u.cep ?? "").replace(/\D/g, "");
  return [
    u.razao_social ?? "",
    [cnpjFmt && `CNPJ ${cnpjFmt}`, u.inscricao_estadual && `IE ${u.inscricao_estadual}`].filter(Boolean).join(" · "),
    [[u.logradouro, u.numero].filter(Boolean).join(", "), u.complemento, u.bairro].filter(Boolean).join(" - "),
    [[u.municipio, u.uf].filter(Boolean).join("/"), cep.length === 8 && `CEP ${cep.slice(0, 5)}-${cep.slice(5)}`].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/** Quadro da produção: cada ordem num cartão, nas colunas Planejadas → Em produção → Prontas no mês. */
function QuadroProducao({ ordens, faltas, marcadores, carregando, aoAbrir }: {
  ordens: OrdemProducao[]; faltas: Map<string, number>; marcadores: Parameters<typeof ChipsMarcadores>[0]["todos"]; carregando: boolean;
  aoAbrir: (o: OrdemProducao) => void;
}) {
  const dia = hoje();
  const mes = dia.slice(0, 7);
  const porPrevisao = (a: OrdemProducao, b: OrdemProducao) => (a.previsao ?? "9999").localeCompare(b.previsao ?? "9999");
  const colunas = [
    { id: "planejada", titulo: "Planejadas", cor: "border-t-sky-500", lista: ordens.filter((o) => o.status === "planejada").sort(porPrevisao) },
    { id: "em_producao", titulo: "Em produção", cor: "border-t-amber-500", lista: ordens.filter((o) => o.status === "em_producao").sort(porPrevisao) },
    { id: "concluida", titulo: "Prontas no mês", cor: "border-t-emerald-500",
      lista: ordens.filter((o) => o.status === "concluida" && (o.concluida_em ?? "").startsWith(mes)).sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? "")) },
  ];
  if (carregando) return <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Quadro da produção">
      {colunas.map((c) => (
        <section key={c.id} aria-label={c.titulo} className={`min-w-0 rounded-2xl border border-t-4 border-slate-200 bg-slate-50/60 p-2 ${c.cor}`}>
          <h3 className="flex items-center justify-between px-1 pb-2 text-sm font-bold text-fg">{c.titulo} <span className="num rounded-full bg-surface px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">{c.lista.length}</span></h3>
          {!c.lista.length && <p className="px-1 pb-2 text-sm text-slate-500">Nenhuma.</p>}
          <ul className="space-y-2">
            {c.lista.map((o) => {
              const f = faltas.get(o.id) ?? 0;
              const aberta = c.id !== "concluida";
              const atraso = aberta && o.previsao && o.previsao < dia ? Math.round((Date.parse(dia) - Date.parse(o.previsao)) / 864e5) : 0;
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => aoAbrir(o)}
                    className={`w-full rounded-xl border bg-surface p-2.5 text-left shadow-sm transition hover:border-brand hover:shadow-pop ${atraso ? "border-red-300" : "border-slate-200"}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-bold text-fg [overflow-wrap:anywhere]">{Number(o.quantidade)}× {o.produto?.descricao ?? "Produto"}</span>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">OP #{o.numero}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                      {aberta && (f
                        ? <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">faltam {f} {pl(f, "peça", "peças")}</span>
                        : <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">peças ok</span>)}
                      {aberta && o.previsao && <span className={`rounded-full px-1.5 py-0.5 font-semibold ${atraso ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                        {atraso ? `atrasada ${atraso} ${pl(atraso, "dia", "dias")}` : `para ${dataBR(o.previsao)}`}</span>}
                      {!aberta && o.concluida_em && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">pronta em {dataBR(o.concluida_em)}</span>}
                      {o.responsavel && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700">{o.responsavel}</span>}
                    </span>
                    {(o.marcadores ?? []).length > 0 && <span className="mt-1 block"><ChipsMarcadores ids={o.marcadores} todos={marcadores} pequeno /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function OPModal({ inicial, onClose, irParaCompras }: { inicial: Partial<OrdemProducao>; onClose: () => void; irParaCompras: () => void }) {
  const perfil = usePerfil();
  const { pode } = perfil;
  const [o, setO] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  // vendas para ligar a OP (Venda de Máquinas: Proposta → Pedido → OP → NF)
  const { data: vendas = [] } = useRows<{ id: string; numero: number; status: string; cliente: { nome: string } | null }>("pedidos", {
    select: "id, numero, status, cliente:clientes(nome)", order: "numero", ascending: false, key: ["op"],
  });
  const { data: necessidade = [] } = useNecessidade();
  const { data: fornecedoresTodos = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const fornecedores = semUnificados(fornecedoresTodos);
  const { data: fornecimentos = [] } = useRows<{ produto_id: string; fornecedor_id: string; ativo: boolean }>("fornecimentos", { select: "produto_id, fornecedor_id, ativo", order: "produto_id" });
  const { data: fichas = [] } = useRows<LinhaFicha>("produto_componentes", { select: "produto_id, componente_id, quantidade", order: "produto_id" });
  const invalidate = useInvalidate();
  const podeEditar = pode("editar_producao") && !["concluida", "cancelada"].includes(o.status ?? "");
  const nec = necessidade.filter((n) => n.ordem_id === o.id);
  // o que falta: peça comprada vira pedido de compra; subconjunto com estoque próprio vira OP dele
  const faltantes = nec.filter((n) => falta(n) > 0 && !n.subconjunto);
  const subFaltando = nec.filter((n) => falta(n) > 0 && n.subconjunto);
  // máquinas, subconjuntos (com ficha) e as peças fabricadas aqui (eixos, pás…); unificado ou inativo não entra
  // (a não ser o da própria OP que está aberta)
  const produziveis = produtos.filter((p) => p.id === o.produto_id || (!p.unificado_em && p.ativo
    && (p.tipo === "maquina" || temFicha(fichas, p.id) || !!p.subconjunto_estocado || ["fabricado", "terceirizado"].includes(p.origem_producao ?? ""))));
  const nNiveis = o.produto_id ? niveis(fichas, o.produto_id) : 0;
  const set = (p: Partial<OrdemProducao>) => setO((x) => ({ ...x, ...p }));

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = true) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("ordens_producao", "necessidade_producao", "produtos", "pedidos_compra", "estoque_movimentos");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    executar(async () => {
      const { produto: _p, numero: _n, created_at: _c, ...row } = o as any;
      const dados = limpar({ ...row, quantidade: Number(row.quantidade) });
      const { data, error } = dados.id
        ? await supabase.from("ordens_producao").update(dados).eq("id", dados.id).select("id, numero").single()
        : await supabase.from("ordens_producao").insert(dados).select("id, numero").single();
      if (error) throw error;
      set({ id: data.id, numero: data.numero });
    }, "Ordem de produção salva", false);
  };

  const mudarStatus = (status: string, ok: string) => executar(async () => {
    const { error } = await supabase.from("ordens_producao").update({ status }).eq("id", o.id!);
    if (error) throw error;
  }, ok);

  const etapas = (Array.isArray(o.etapas) ? o.etapas : []) as EtapaOp[];
  const etapasMaquina = (produtos.find((p) => p.id === o.produto_id)?.etapas_producao ?? []) as string[];
  const ehMaquina = produtos.find((p) => p.id === o.produto_id)?.tipo === "maquina";
  const faltamEtapas = etapas.filter((e) => !e.feita).length;
  /** Marca ou desmarca uma etapa e grava na hora (quem e quando ficam registrados). */
  async function marcarEtapa(i: number) {
    const novas = etapas.map((e, j) => (j === i ? { ...e, feita: !e.feita, por: !e.feita ? perfil.nome : null, em: !e.feita ? new Date().toISOString() : null } : e));
    const { error } = await supabase.from("ordens_producao").update({ etapas: novas }).eq("id", o.id!);
    if (error) return notifyError(error);
    set({ etapas: novas });
    invalidate("ordens_producao");
  }
  async function puxarEtapas() {
    const novas = etapasMaquina.map((nome) => ({ nome, feita: false }));
    const { error } = await supabase.from("ordens_producao").update({ etapas: novas }).eq("id", o.id!);
    if (error) return notifyError(error);
    set({ etapas: novas });
    invalidate("ordens_producao");
  }

  const concluir = async () => {
    if (faltamEtapas && !(await confirmar(`Faltam ${faltamEtapas} ${pl(faltamEtapas, "etapa", "etapas")} da conferência. Concluir a produção mesmo assim?`))) return;
    // teste do giga (REG-006): só avisa, não bloqueia
    const aviso = ehMaquina ? await avisoGigaDaOp(o.numeros_serie) : null;
    if (aviso && !(await confirmar(`${aviso} Concluir a produção mesmo assim? O teste pode ser lançado depois.`,
      { titulo: "Teste do giga (REG-006)", ok: "Concluir mesmo assim", perigo: false }))) return;
    return concluirAgora();
  };
  const concluirAgora = () => executar(async () => {
    if (o.numeros_serie !== undefined) await supabase.from("ordens_producao").update({ numeros_serie: o.numeros_serie }).eq("id", o.id!);
    const { error } = await supabase.rpc("concluir_producao", { p_ordem: o.id });
    if (error) throw error;
  }, "Produção concluída: peças baixadas e máquinas no estoque");

  /** Um pedido de compra (em cotação) por fornecedor padrão das peças que faltam. */
  const gerarCompras = () => executar(async () => {
    const grupos = new Map<string, Necessidade[]>();
    for (const n of faltantes) {
      const k = n.fornecedor_padrao_id ?? "";
      grupos.set(k, [...(grupos.get(k) ?? []), n]);
    }
    for (const [fornecedor, itens] of grupos) {
      // cabeçalho e itens juntos: se os itens não gravarem, o pedido vazio é desfeito
      await criarComItens("pedidos_compra", {
        fornecedor_id: fornecedor || null, ordem_producao_id: o.id, status: "cotacao", previsao_entrega: o.previsao,
        observacoes: `Peças para a OP #${o.numero} (${Number(o.quantidade)}x ${produtos.find((p) => p.id === o.produto_id)?.descricao ?? ""})`,
      }, "pedido_compra_itens", "pedido_compra_id", itens.map((n) => ({
        produto_id: n.componente_id, descricao: n.descricao, quantidade: falta(n), custo_unitario: Number(n.preco_custo),
      })), desfazerCompra);
    }
    irParaCompras();
  }, "Pedidos de compra criados em cotação. Confira e envie aos fornecedores.");

  /** Uma OP (planejada) para cada subconjunto com estoque próprio que falta, para ficar pronto antes da máquina. */
  const gerarOpsSub = () => executar(async () => {
    const prev = o.previsao ? new Date(Date.parse(o.previsao + "T12:00:00") - 3 * 864e5).toISOString().slice(0, 10) : null;
    const { error } = await supabase.from("ordens_producao").insert(subFaltando.map((n) => limpar({
      produto_id: n.componente_id, quantidade: falta(n), status: "planejada", previsao: prev && prev > hoje() ? prev : hoje(),
      unidade_id: (o as any).unidade_id, responsavel: o.responsavel ?? null, observacoes: `Subconjunto para a OP #${o.numero}`,
    })));
    if (error) throw error;
  }, `OP criada para ${subFaltando.length} ${pl(subFaltando.length, "subconjunto", "subconjuntos")}`, false);

  const nomeForn = (n: Necessidade) => {
    if (n.subconjunto) return "subconjunto · produzido em OP própria";
    if (n.fornecedor_padrao_id) return fornecedores.find((f) => f.id === n.fornecedor_padrao_id)?.nome ?? "fornecedor padrão";
    const outros = fornecimentos.filter((f) => f.produto_id === n.componente_id && f.ativo !== false).length;
    return outros ? `sem preferido · ${outros} ${pl(outros, "fornecedor", "fornecedores")} ${pl(outros, "conhecido", "conhecidos")}` : "sem fornecedor cadastrado";
  };

  return (
    <Modal open onClose={onClose} title={o.id ? `Ordem de produção #${o.numero}` : "Nova ordem de produção"} wide>
      <form onSubmit={salvar} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Máquina ou subconjunto a produzir" className="sm:col-span-2">
            <select className="input" value={o.produto_id ?? ""} disabled={!podeEditar || !!o.id} onChange={(e) => set({ produto_id: e.target.value })} required>
              <option value="">Selecione…</option>
              <optgroup label="Máquinas">{produziveis.filter((p) => p.tipo === "maquina").map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}</optgroup>
              {produziveis.some((p) => p.tipo !== "maquina") && (
                <optgroup label="Subconjuntos">{produziveis.filter((p) => p.tipo !== "maquina").map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}</optgroup>
              )}
            </select>
            {nNiveis > 1 && <span className="mt-1 block text-xs text-slate-500">Estrutura com {nNiveis} níveis: as peças abaixo já somam os subconjuntos.</span>}
          </Field>
          <Field label="Quantidade"><input className="input" type="number" inputMode="numeric" min={1} value={o.quantidade ?? 1} disabled={!podeEditar} onChange={(e) => set({ quantidade: Number(e.target.value) })} /></Field>
          <Field label="Previsão"><input className="input" type="date" value={o.previsao ?? ""} disabled={!podeEditar} onChange={(e) => set({ previsao: e.target.value })} /></Field>
          <Field label="Responsável" className="sm:col-span-2"><input className="input" value={o.responsavel ?? ""} disabled={!podeEditar} onChange={(e) => set({ responsavel: e.target.value })} /></Field>
          <Field label="Nº de série das máquinas (separe por vírgula)" className="sm:col-span-2">
            <input className="input" value={o.numeros_serie ?? ""} disabled={!podeEditar} onChange={(e) => set({ numeros_serie: e.target.value })} />
          </Field>
          <Field label="Venda (pedido) desta máquina" className="sm:col-span-2">
            <select className="input" value={o.pedido_id ?? ""} disabled={!podeEditar} onChange={(e) => set({ pedido_id: e.target.value || null })}>
              <option value="">Estoque (sem venda)</option>
              {vendas.filter((v) => v.status !== "cancelado" || v.id === o.pedido_id).map((v) => <option key={v.id} value={v.id}>#{v.numero} · {v.cliente?.nome ?? "—"}</option>)}
            </select>
          </Field>
          <Field label="Observações" className="sm:col-span-2"><input className="input" value={o.observacoes ?? ""} disabled={!podeEditar} onChange={(e) => set({ observacoes: e.target.value })} /></Field>
        </div>

        {o.id && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 id="op-pecas" className="text-sm font-bold text-fg">
                Peças necessárias{nec.length > 0 && <span className="ml-1 font-normal text-slate-500">· {faltantes.length + subFaltando.length ? `faltam ${faltantes.length + subFaltando.length} de ${nec.length}` : `todas as ${nec.length} em estoque`}</span>}
              </h3>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {subFaltando.length > 0 && podeEditar && (
                  <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={gerarOpsSub} disabled={ocupado}><Layers size={16} aria-hidden /> Criar OP de {subFaltando.length} {pl(subFaltando.length, "subconjunto", "subconjuntos")}</Button>
                )}
                {faltantes.length > 0 && podeEditar && (
                  <Button type="button" className="w-full sm:w-auto" onClick={gerarCompras} disabled={ocupado}><ShoppingBag size={16} aria-hidden /> Pedir as {faltantes.length} {pl(faltantes.length, "peça", "peças")} que faltam</Button>
                )}
              </div>
            </div>
            {!nec.length ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Este item ainda não tem ficha técnica. Cadastre as peças na aba <b>Ficha técnica</b> para o sistema calcular o que comprar.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="tabela w-full text-sm md:min-w-[640px]" aria-labelledby="op-pecas">
                  <thead className="bg-slate-50"><tr>
                    <th scope="col" className="th">Peça</th><th scope="col" className="th text-right">Precisa</th><th scope="col" className="th text-right">Em estoque</th>
                    <th scope="col" className="th text-right">Reservado (outras OP)</th><th scope="col" className="th text-right">A caminho</th><th scope="col" className="th text-right">Falta</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...nec].sort((a, b) => Number(falta(b) > 0) - Number(falta(a) > 0)).map((n) => {
                      const f = falta(n);
                      const un = n.unidade ?? "";
                      return (
                        <tr key={n.componente_id}>
                          <td className="td" data-label="Peça">{n.descricao}<span className="block text-xs font-normal text-slate-500">{nomeForn(n)}</span></td>
                          <td className="td num text-right" data-label="Precisa">{qtd(n.necessario)} {un}</td>
                          <td className="td num text-right" data-label="Em estoque">{qtd(n.estoque_atual)} {un}</td>
                          <td className="td num text-right text-slate-500" data-label="Reservado (outras OP)">{Number(n.reservado_outras_op) ? qtd(n.reservado_outras_op) : "—"}</td>
                          <td className="td num text-right text-slate-500" data-label="A caminho">{Number(n.a_caminho) ? qtd(n.a_caminho) : "—"}</td>
                          <td className={`td num text-right font-bold ${f ? "text-red-600" : "text-emerald-700"}`} data-label="Falta">{f ? `${qtd(f)} ${un}` : "ok"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {o.id && (etapas.length > 0 || etapasMaquina.length > 0) && (
          <div>
            <h3 id="op-etapas" className="mb-2 text-sm font-bold text-fg">
              Etapas de produção{etapas.length > 0 && <span className="ml-1 font-normal text-slate-500">· {faltamEtapas ? `${etapas.length - faltamEtapas} de ${etapas.length} feitas` : "todas feitas ✓"}</span>}
            </h3>
            {etapas.length ? (
              <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-labelledby="op-etapas">
                {etapas.map((e, i) => (
                  <li key={i}>
                    <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${podeEditar ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-emerald-600" checked={!!e.feita} disabled={!podeEditar} onChange={() => marcarEtapa(i)} />
                      <span className="num w-5 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
                      <span className={`min-w-0 flex-1 font-medium ${e.feita ? "text-slate-500 line-through" : "text-fg"}`}>{e.nome}</span>
                      {e.feita && (e.por || e.em) && <span className="shrink-0 text-right text-[11px] text-slate-500">{e.por ?? ""}{e.em ? ` · ${dataBR(e.em.slice(0, 10))}` : ""}</span>}
                    </label>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
                <span className="min-w-0 flex-1">Esta OP foi criada antes das etapas. A máquina tem {etapasMaquina.length} {pl(etapasMaquina.length, "etapa", "etapas")} cadastradas.</span>
                {podeEditar && <Button type="button" variant="secondary" onClick={puxarEtapas}>Usar a lista da máquina</Button>}
              </div>
            )}
          </div>
        )}

        {o.id && ehMaquina && <TesteGigaDaOp numerosSerie={o.numeros_serie} produtoId={o.produto_id} opId={o.id} />}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {podeEditar && o.id && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => mudarStatus("cancelada", "Ordem cancelada")} disabled={ocupado}><XCircle size={16} /> Cancelar OP</Button>}
          <span className="flex-1" />
          {podeEditar && <Button variant="secondary" disabled={ocupado}>Salvar</Button>}
          {podeEditar && o.status === "planejada" && o.id && <Button type="button" variant="secondary" onClick={() => mudarStatus("em_producao", "Produção iniciada")} disabled={ocupado}><Play size={16} /> Iniciar produção</Button>}
          {podeEditar && o.id && <Button type="button" onClick={concluir} disabled={ocupado || !nec.length || nec.some((n) => Number(n.estoque_atual) < Number(n.necessario))}><CheckCircle2 size={16} /> Concluir produção</Button>}
        </div>
      </form>
    </Modal>
  );
}

/* ============================== Pedidos de compra ============================== */

function PedidosCompra({ abrirNovo, onAberto }: { abrirNovo: boolean; onAberto: () => void }) {
  const { data: cfgTextos } = useConfig();
  // OC nova feita à mão: já vem com as observações padrão (Configurações → Textos dos documentos)
  const novaOC = () => ({ status: "cotacao", frete: 0, itens: [], observacoes: textoPadrao(cfgTextos, "oc_observacoes") || null });
  const { pode } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: pcsTodos = [], isLoading } = useRows<PedidoCompra>("pedidos_compra", { select: "*, fornecedor:fornecedores(*), itens:pedido_compra_itens(*)" });
  const pcs = filtrar(pcsTodos);
  const [aberto, setAberto] = useState<(Partial<PedidoCompra> & { itens: ItemCompra[] }) | null>(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [verExcluidas, setVerExcluidas] = useState(false);
  const { data: marcadores = [] } = useMarcadores();
  const recebeu = (p: PedidoCompra) => ["parcial", "recebido"].includes(p.status) || (p.itens ?? []).some((i) => Number(i.quantidade_recebida) > 0);

  useEffect(() => {
    if (abrirNovo) { setAberto(novaOC()); onAberto(); }
  }, [abrirNovo]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = pcs.filter((p) => mostrarTodos || !["recebido", "cancelado"].includes(p.status));
  const atrasados = pcs.filter((p) => ["enviado", "parcial"].includes(p.status) && p.previsao_entrega && p.previsao_entrega < hoje()).length;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ClipboardList} tom="info" label="Em cotação" valor={pcs.filter((p) => p.status === "cotacao").length} sub="aguardando preço do fornecedor" />
        <Stat icon={Truck} tom="atencao" label="A caminho" valor={pcs.filter((p) => ["enviado", "parcial"].includes(p.status)).length} />
        <Stat icon={PackageSearch} tom={atrasados ? "critico" : "neutro"} label="Entrega atrasada" valor={atrasados} />
        <Stat icon={ShoppingBag} label="Em aberto (R$)" valor={brl(pcs.filter((p) => ["enviado", "parcial"].includes(p.status)).reduce((s, p) => s + Number(p.valor_total), 0))} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} /> Mostrar recebidos e cancelados
        </label>
        <div className="flex flex-wrap gap-2">
          {pode("editar_producao") && <Button variant="ghost" onClick={() => setVerExcluidas(true)}><Trash2 size={16} /> Excluídas</Button>}
          {pode("editar_producao") && <Button onClick={() => setAberto(novaOC())}><Plus size={16} /> Novo pedido de compra</Button>}
        </div>
      </div>
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">Nº</th><th className="th">Fornecedor</th><th className="th">Itens</th><th className="th">Situação</th><th className="th">Entrega</th><th className="th text-right">Total</th><th className="th"><span className="sr-only">Ações</span></th><th className="th" /></>}>
        {lista.map((p) => (
          <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberto({ ...p, itens: p.itens ?? [] })}>
            <td className="td font-bold text-fg">#{p.numero}</td>
            <td className="td">{p.fornecedor?.nome ?? <span className="text-amber-700">a definir</span>}
              <div className="mt-1"><ChipsMarcadores ids={p.marcadores} todos={marcadores} pequeno /></div></td>
            <td className="td text-slate-600">{(p.itens ?? []).slice(0, 2).map((i) => i.descricao).join(", ")}{(p.itens?.length ?? 0) > 2 ? ` +${p.itens!.length - 2}` : ""}</td>
            <td className="td"><Badge value={p.status === "cotacao" ? "pc_cotacao" : `pc_${p.status}`} /></td>
            <td className={`td num ${["enviado", "parcial"].includes(p.status) && p.previsao_entrega && p.previsao_entrega < hoje() ? "font-semibold text-red-600" : ""}`}>{dataBR(p.previsao_entrega)}</td>
            <td className="td num text-right font-semibold">{brl(p.valor_total)}</td>
            <td className="td whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
              <BotaoMarcadores tabela="pedidos_compra" registro={p} nome={["ordem de compra", "ordens de compra"]} />
              {pode("editar_producao") && !recebeu(p) && <ExcluirDocumento tabela="pedidos_compra" id={p.id} numero={p.numero} />}
            </td>
            <CelulaAbrir texto="Ver / editar" />
          </tr>
        ))}
      </Table>
      {aberto && <PCModal inicial={aberto} onClose={() => setAberto(null)} />}
      {verExcluidas && <DocumentosExcluidos tabela="pedidos_compra" onClose={() => setVerExcluidas(false)} />}
    </>
  );
}

function PCModal({ inicial, onClose }: { inicial: Partial<PedidoCompra> & { itens: ItemCompra[] }; onClose: () => void }) {
  const { pode } = usePerfil();
  const [p, setP] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [receber, setReceber] = useState(false);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [verUltimas, setVerUltimas] = useState(false);
  const { data: fornecedoresTodos = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const fornecedores = semUnificados(fornecedoresTodos);
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: cfg } = useConfig();
  const { unidades, padrao } = useUnidade();
  const invalidate = useInvalidate();
  const editavel = pode("editar_producao") && ["cotacao", "enviado"].includes(p.status ?? "cotacao");
  const fornecedor = fornecedores.find((f) => f.id === p.fornecedor_id);
  // compra nova já vem para a unidade em que se está trabalhando; dá para trocar (SC ou SP) até confirmar
  const unidadeId = (p as any).unidade_id ?? (p.id ? null : padrao);
  const destino = unidades.find((u) => u.id === unidadeId);
  // WhatsApp do fornecedor; sem ele, o celular do cadastro; sem nenhum, abre o WhatsApp para escolher o contato
  const foneWhats = fornecedor?.whatsapp || (String(fornecedor?.telefone ?? "").replace(/\D/g, "").length >= 10 ? fornecedor?.telefone : null);
  const subtotal = p.itens.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);
  const set = (x: Partial<PedidoCompra> & { itens?: ItemCompra[] }) => setP((a) => ({ ...a, ...x }));
  const atualizarItem = (k: number, patch: Partial<ItemCompra>) => set({ itens: p.itens.map((i, j) => (j === k ? { ...i, ...patch } : i)) });

  async function gravar(status?: string) {
    const { itens, fornecedor: _f, numero: _n, valor_total: _v, created_at: _c, ...cab } = p as any;
    const dados = limpar({ ...cab, unidade_id: cab.unidade_id ?? unidadeId ?? undefined, frete: Number(cab.frete || 0), ...(status ? { status, ...(status === "enviado" ? { enviado_em: new Date().toISOString() } : {}) } : {}) });
    const { data, error } = dados.id
      ? await supabase.from("pedidos_compra").update(dados).eq("id", dados.id).select("id, numero").single()
      : await supabase.from("pedidos_compra").insert(dados).select("id, numero").single();
    if (error) throw error;
    let comId = itens as ItemCompra[];
    if (editavel) {
      // a quantidade já recebida nunca é sobrescrita; nada some se a internet cair no meio
      const ids = await sincronizarItens("pedido_compra_itens", "pedido_compra_id", data.id, itens as ItemCompra[], (i) => ({
        produto_id: i.produto_id, descricao: i.descricao, quantidade: i.quantidade,
        custo_unitario: i.custo_unitario, quantidade_recebida: i.quantidade_recebida ?? 0,
      }), { preservar: ["quantidade_recebida"] });
      comId = (itens as ItemCompra[]).map((i, k) => ({ ...i, id: ids[k] || i.id }));
    }
    set({ id: data.id, numero: data.numero, itens: comId, ...(status ? { status } : {}) });
    return data;
  }

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = false) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("pedidos_compra", "necessidade_producao", "produtos", "contas_pagar");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const mensagem = (cotacao: boolean) => [
    `Olá! Aqui é da *${cfg?.nome_fantasia ?? "MF Máquinas"}*.`,
    cotacao ? `Pode nos passar uma cotação (preço, prazo e frete) para os itens abaixo?` : `Confirmamos o pedido de compra *#${p.numero ?? ""}*:`,
    "",
    ...p.itens.map((i) => `• ${i.quantidade}x ${i.descricao}${!cotacao && i.custo_unitario ? ` — ${brl(i.custo_unitario)} un.` : ""}`),
    "",
    !cotacao ? `Total: ${brl(subtotal + Number(p.frete || 0))}` : "",
    p.previsao_entrega ? `Precisamos para: ${dataBR(p.previsao_entrega)}` : "",
    p.condicao_pagamento && !cotacao ? `Pagamento: ${p.condicao_pagamento}` : "",
    ...(destino ? ["", `*Faturar e entregar para ${destino.nome}*`, ...dadosDestino(destino)] : []),
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();

  async function gerarPdf() {
    if (!cfg) return;
    try {
      setPdf(await pdfPedidoCompra({
        numero: p.numero, status: p.status ?? "cotacao", fornecedor, frete: Number(p.frete || 0), previsao_entrega: p.previsao_entrega,
        condicao_pagamento: p.condicao_pagamento, observacoes: p.observacoes,
        itens: p.itens.map((i) => ({ ...i, unidade: produtos.find((x) => x.id === i.produto_id)?.unidade })),
      }, comUnidade(cfg, unidades.find((u) => u.id === (p as any).unidade_id))));
    } catch (e) { notifyError(e); }
  }

  return (
    <Modal open onClose={onClose} title={p.id ? `Pedido de compra #${p.numero}` : "Novo pedido de compra"} wide>
      <form onSubmit={(e) => { e.preventDefault(); executar(gravar, "Pedido de compra salvo"); }} className="space-y-5">
        {p.status && <div className="flex flex-wrap items-center gap-2"><Badge value={`pc_${p.status}`} />
          {p.status === "cotacao" && <span className="text-sm text-slate-500">Mande para o fornecedor, preencha os preços que ele passar e depois confirme o pedido.</span>}
        </div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Fornecedor" className="sm:col-span-2">
            <select className="input" value={p.fornecedor_id ?? ""} disabled={!editavel} onChange={(e) => set({ fornecedor_id: e.target.value || null })}>
              <option value="">A definir</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2"><CampoUnidade label="Comprar para (recebe a mercadoria e a nota)" value={unidadeId} disabled={!editavel || p.status !== "cotacao" && !!p.id}
            onChange={(id) => set({ unidade_id: id } as Partial<PedidoCompra>)} /></div>
          <Field label="Entrega desejada"><input className="input" type="date" value={p.previsao_entrega ?? ""} disabled={!editavel} onChange={(e) => set({ previsao_entrega: e.target.value })} /></Field>
          <Field label="Frete (R$)"><input className="input" type="number" step="0.01" min={0} value={p.frete ?? 0} disabled={!editavel} onChange={(e) => set({ frete: Number(e.target.value) })} /></Field>
          <Field label="Condição de pagamento" className="sm:col-span-2"><input className="input" placeholder="ex.: 28 dias boleto" value={p.condicao_pagamento ?? ""} disabled={!editavel} onChange={(e) => set({ condicao_pagamento: e.target.value })} /></Field>
          <Field label="Observações" className="sm:col-span-2"><input className="input" value={p.observacoes ?? ""} disabled={!editavel} onChange={(e) => set({ observacoes: e.target.value })} /></Field>
        </div>
        {p.fornecedor_id && (
          <div className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button type="button" onClick={() => setVerUltimas(true)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
              <History size={15} aria-hidden /> Ver últimas compras deste fornecedor
            </button>
          </div>
        )}
        {verUltimas && p.fornecedor_id && <UltimasCompras fornecedorId={p.fornecedor_id} fornecedorNome={fornecedor?.nome} onClose={() => setVerUltimas(false)} />}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="itens w-full text-sm md:min-w-[620px]" aria-label="Itens do pedido de compra">
            <thead className="bg-slate-50"><tr>
              <th scope="col" className="th">Peça / insumo</th><th scope="col" className="th w-28 text-right">Qtd</th><th scope="col" className="th w-36 text-right">Custo unit.</th>
              <th scope="col" className="th w-32 text-right">Total</th>{p.status && ["enviado", "parcial", "recebido"].includes(p.status) && <th scope="col" className="th text-right">Recebido</th>}<th className="th w-10"><span className="sr-only">Ações</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {p.itens.map((i, k) => (
                <tr key={k}>
                  <td className="td it-largo font-medium text-fg">{i.descricao}</td>
                  <td className="td" data-label="Qtd">
                    <input className="input text-right" type="number" inputMode="decimal" min={0.001} step="any" value={i.quantidade} disabled={!editavel}
                      aria-label={`Quantidade de ${i.descricao}`} onChange={(e) => atualizarItem(k, { quantidade: Number(e.target.value) })} />
                  </td>
                  <td className="td" data-label="Custo unit.">
                    <input className="input text-right" type="number" inputMode="decimal" min={0} step="0.01" value={i.custo_unitario} disabled={!editavel}
                      aria-label={`Custo unitário de ${i.descricao}`} onChange={(e) => atualizarItem(k, { custo_unitario: Number(e.target.value) })} />
                  </td>
                  <td className="td it-total num text-right md:pt-5" data-label="Total">{brl(i.quantidade * i.custo_unitario)}</td>
                  {p.status && ["enviado", "parcial", "recebido"].includes(p.status) && <td className="td num text-right md:pt-5" data-label="Recebido">{Number(i.quantidade_recebida ?? 0)} / {i.quantidade}</td>}
                  <td className="td it-acao">{editavel && <Button type="button" variant="ghost" aria-label={`Remover ${i.descricao}`} onClick={() => set({ itens: p.itens.filter((_, j) => j !== k) })}><Trash2 size={16} aria-hidden /></Button>}</td>
                </tr>
              ))}
              {!p.itens.length && <tr><td colSpan={6} className="td py-6 text-center text-slate-500">Adicione as peças abaixo.</td></tr>}
            </tbody>
          </table>
        </div>
        {editavel && (
          <ProdutoBusca produtos={produtos.filter((x) => x.tipo !== "maquina" && x.ativo && !x.fora_de_linha)}
            placeholder="Adicionar peça ou insumo: nome ou SKU"
            onEscolher={(prod) => set({ itens: [...p.itens, { produto_id: prod.id, descricao: prod.descricao, quantidade: 1, custo_unitario: Number(prod.preco_custo) }] })}
            detalhe={(x) => [x.sku, `custo ${brl(x.preco_custo)}`, `estoque ${Number(x.estoque_atual)} (mín. ${Number(x.estoque_minimo)})`].filter(Boolean).join(" · ")} />
        )}
        <div className="text-right text-sm text-slate-600">Itens {brl(subtotal)} · Frete {brl(p.frete)} · <span className="num text-lg font-bold text-fg">Total {brl(subtotal + Number(p.frete || 0))}</span></div>
        {p.id && p.status && ["enviado", "parcial", "recebido"].includes(p.status) && (
          <NotasDaOc pedido={{ id: p.id, numero: Number(p.numero), status: p.status, itens: p.itens }} onBaixa={onClose} />
        )}
        {p.id && pode("receber_compras") && <Historico tabela="pedidos_compra" id={p.id} />}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {p.itens.length > 0 && <Button type="button" variant="ghost" onClick={gerarPdf}><FileDown size={16} /> PDF</Button>}
          {p.itens.length > 0 && (
            <a href={whatsappLink(foneWhats, mensagem(p.status === "cotacao"))} target="_blank" rel="noreferrer"
              title={foneWhats ? `Abre a conversa com ${fornecedor?.nome}` : "O fornecedor não tem WhatsApp no cadastro: o WhatsApp abre para você escolher o contato"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
              <MessageCircle size={16} /> {p.status === "cotacao" ? "Pedir cotação" : "Enviar pedido"} no WhatsApp
            </a>
          )}
          {editavel && p.id && <Button type="button" variant="ghost" className="!text-red-600" disabled={ocupado} onClick={() => executar(() => gravar("cancelado"), "Pedido cancelado", true)}>Cancelar</Button>}
          <span className="flex-1" />
          {editavel && <Button variant="secondary" disabled={ocupado || !p.itens.length}>Salvar</Button>}
          {editavel && p.status === "cotacao" && (
            <Button type="button" disabled={ocupado || !p.itens.length || !p.fornecedor_id} onClick={() => executar(() => gravar("enviado"), "Pedido confirmado com o fornecedor")}>
              <CheckCircle2 size={16} /> Confirmar pedido
            </Button>
          )}
          {pode("receber_compras") && p.id && ["enviado", "parcial"].includes(p.status ?? "") && (
            <Button type="button" onClick={() => setReceber(true)}><PackageCheck size={16} /> Receber mercadoria</Button>
          )}
        </div>
      </form>
      {receber && <ReceberModal pc={p as PedidoCompra & { itens: ItemCompra[] }} onClose={() => setReceber(false)} onFeito={onClose} />}
      {pdf && <PdfViewer blob={pdf} nome={`pedido-compra-${p.numero ?? "rascunho"}.pdf`} titulo={p.status === "cotacao" ? "Solicitação de cotação" : `Pedido de compra #${p.numero}`} onClose={() => setPdf(null)} />}
    </Modal>
  );
}

function ReceberModal({ pc, onClose, onFeito }: { pc: PedidoCompra & { itens: ItemCompra[] }; onClose: () => void; onFeito: () => void }) {
  const [qtd, setQtd] = useState<Record<string, number>>(Object.fromEntries(pc.itens.map((i) => [i.id!, i.quantidade - Number(i.quantidade_recebida ?? 0)])));
  const [gerarConta, setGerarConta] = useState(true);
  const [vencimento, setVencimento] = useState(somarDias(28));
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();

  async function confirmar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("receber_pedido_compra", {
        p_pedido: pc.id, p_itens: Object.entries(qtd).map(([item_id, quantidade]) => ({ item_id, quantidade })),
        p_gerar_conta: gerarConta, p_vencimento: vencimento,
      });
      if (error) throw error;
      notify(data === "recebido" ? "Mercadoria recebida e lançada no estoque" : "Recebimento parcial registrado");
      invalidate("pedidos_compra", "necessidade_producao", "produtos", "contas_pagar", "estoque_movimentos");
      onClose();
      onFeito();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Receber pedido #${pc.numero}`}>
      <p className="mb-3 text-sm text-slate-500">Confira o que chegou. Se veio menos, ajuste a quantidade: o resto continua “a caminho”.</p>
      <div className="space-y-2">
        {pc.itens.map((i) => {
          const pendente = i.quantidade - Number(i.quantidade_recebida ?? 0);
          return (
            <div key={i.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
              <span className="flex-1 text-sm"><b className="text-fg">{i.descricao}</b><span className="block text-xs text-slate-500">faltam {pendente} de {i.quantidade}</span></span>
              <input className="input w-24 text-right" type="number" min={0} max={pendente} step="any" value={qtd[i.id!] ?? 0}
                onChange={(e) => setQtd({ ...qtd, [i.id!]: Math.min(pendente, Number(e.target.value)) })} disabled={!pendente} />
            </div>
          );
        })}
      </div>
      <Card className="mt-4 p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={gerarConta} onChange={(e) => setGerarConta(e.target.checked)} /> Lançar em contas a pagar</label>
        {gerarConta && <Field label="Vencimento" className="mt-2 max-w-[200px]"><input className="input" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></Field>}
        <p className="mt-2 text-xs text-slate-500">Se a nota do fornecedor chegar pela SEFAZ, prefira lançar a conta por ela (Notas fiscais), para não duplicar.</p>
      </Card>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
        <Button onClick={confirmar} disabled={ocupado}><PackageCheck size={16} /> Confirmar recebimento</Button>
      </div>
    </Modal>
  );
}
