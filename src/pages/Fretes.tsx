// Fretes e envios: painel operacional (cada número abre a lista dos envios que o compõem), filtros por período,
// transportadora, região, vendedor, status e tipo de máquina, e a lista completa de envios.
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CircleDollarSign, ClipboardList, PackageCheck, Plus, Truck, X } from "lucide-react";
import { Button, PageHeader, Table, Tabs } from "@/components/ui";
import { EnvioForm } from "@/components/fretes/EnvioForm";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import type { Transportadora } from "@/lib/types";
import {
  INDICADORES, REGIOES, STATUS_ENVIO, filtrarEnvios, regiaoDaUf,
  type ContextoPainel, type Envio, type FiltrosPainel, type OcorrenciaEnvio, type StatusEnvio,
} from "@/lib/fretes";

type PedidoResumo = {
  id: string; numero: number; status: string; vendedor_id: string | null; valor_total: number; created_at: string; enviado_em: string | null; modalidade_frete: number;
  unidade_id?: string | null; cliente: { nome: string; nome_fantasia: string | null; municipio: string | null; uf: string | null } | null;
};

const TONS = {
  ruim: "border-red-200 bg-red-50 text-red-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  zero: "border-slate-200 bg-surface text-slate-500",
};

export default function Fretes() {
  const { pode } = usePerfil();
  const podeEditar = pode("cotar_frete") || pode("editar_financeiro");
  const { filtrar } = useUnidade();
  const invalidar = useInvalidate();
  const [aba, setAba] = useState<"painel" | "envios">("painel");
  const [filtros, setFiltros] = useState<FiltrosPainel>({});
  const [indicador, setIndicador] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ id?: string | null } | null>(null);
  const [verSemEnvio, setVerSemEnvio] = useState(false);

  const { data: todos = [] } = useRows<Envio>("envios", { order: "created_at", ascending: false });
  const { data: ocorrencias = [] } = useRows<OcorrenciaEnvio>("envio_ocorrencias", { order: "created_at", ascending: false });
  const { data: pedidos = [] } = useRows<PedidoResumo>("pedidos", {
    select: "id, numero, status, vendedor_id, valor_total, created_at, enviado_em, modalidade_frete, unidade_id, cliente:clientes(nome, nome_fantasia, municipio, uf)",
    order: "created_at", ascending: false, key: ["fretes"],
  });
  const { data: transportadoras = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { data: vendedores = [] } = useRows<{ id: string; nome: string }>("vendedores", { order: "nome", ascending: true });

  const envios = filtrar(todos);
  const dia = hoje();
  const ctx: ContextoPainel = useMemo(() => {
    const st = new Map(pedidos.map((p) => [p.id, p.status]));
    return { hoje: dia, agora: Date.now(), ocorrencias, statusPedido: (id) => st.get(id) };
  }, [pedidos, ocorrencias, dia]);
  const filtrados = filtrarEnvios(envios, filtros);
  const contagem = useMemo(() => Object.fromEntries(INDICADORES.map((i) => [i.id, filtrados.filter((e) => i.teste(e, ctx))])), [filtrados, ctx]);
  const ind = INDICADORES.find((i) => i.id === indicador);
  const lista = ind ? contagem[ind.id] : filtrados;

  // pedidos aprovados/faturados que ainda não têm envio (nem saíram)
  const comEnvio = new Set(todos.filter((e) => e.status !== "cancelado").map((e) => e.pedido_id));
  const semEnvio = filtrar(pedidos).filter((p) => ["aprovado", "faturado"].includes(p.status) && !comEnvio.has(p.id) && !p.enviado_em
    && (!filtros.vendedor || p.vendedor_id === filtros.vendedor)
    && (!filtros.regiao || regiaoDaUf(p.cliente?.uf) === filtros.regiao) && (!filtros.uf || p.cliente?.uf === filtros.uf));

  const pedidoDe = (id: string | null) => pedidos.find((p) => p.id === id);
  const nomeTransp = (e: Envio) => transportadoras.find((t) => t.id === e.transportadora_id)?.nome ?? e.transportadora_nome ?? "—";
  const equipamentos = [...new Set(envios.map((e) => e.tipo_equipamento).filter(Boolean) as string[])].sort();
  const ufs = [...new Set(envios.map((e) => e.uf_destino).filter(Boolean) as string[])].sort();
  const totalFiltros = Object.values(filtros).filter(Boolean).length;
  const grupos = [...new Set(INDICADORES.map((i) => i.grupo))];

  async function criarDoPedido(p: PedidoResumo) {
    const { data, error } = await supabase.rpc("criar_envio_pedido", { p_pedido: p.id });
    if (error) return notifyError(error);
    notify(`Envio do pedido #${p.numero} criado com os dados do pedido`);
    invalidar("envios");
    setAberto({ id: data as string });
  }

  async function darBaixa(e: Envio) {
    const p = pedidoDe(e.pedido_id);
    if (!p) return;
    const { error } = await supabase.from("pedidos").update({ status: "entregue" }).eq("id", p.id);
    if (error) return notifyError(error);
    notify(`Pedido #${p.numero} marcado como entregue`);
    invalidar("pedidos");
  }

  const filtroSelect = (label: string, chave: keyof FiltrosPainel, opcoes: [string, string][]) => (
    <label className="block min-w-[9rem] flex-1">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <select className="input" value={filtros[chave] ?? ""} onChange={(x) => setFiltros({ ...filtros, [chave]: x.target.value || undefined })}>
        <option value="">Todos</option>{opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );

  return (
    <div>
      <PageHeader title="Fretes e envios" subtitle="Cotação padronizada, aprovação, coleta, entrega e ocorrências de cada envio"
        actions={podeEditar && <Button onClick={() => setAberto({})}><Plus size={16} /> Novo envio</Button>} />
      {aberto && <EnvioForm envioId={aberto.id} onClose={() => { setAberto(null); invalidar("envios", "envio_ocorrencias"); }} />}

      <Tabs value={aba} onChange={(v) => { setAba(v); setIndicador(null); }} options={[{ value: "painel", label: "Painel" }, { value: "envios", label: `Envios (${envios.length})` }]} />

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-surface p-3">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">De</span>
          <input className="input" type="date" value={filtros.de ?? ""} onChange={(x) => setFiltros({ ...filtros, de: x.target.value || undefined })} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Até</span>
          <input className="input" type="date" value={filtros.ate ?? ""} onChange={(x) => setFiltros({ ...filtros, ate: x.target.value || undefined })} /></label>
        {filtroSelect("Transportadora", "transportadora", transportadoras.map((t) => [t.id, t.nome]))}
        {filtroSelect("Região", "regiao", Object.keys(REGIOES).map((r) => [r, r]))}
        {filtroSelect("UF", "uf", ufs.map((u) => [u, u]))}
        {filtroSelect("Vendedor", "vendedor", vendedores.map((v) => [v.id, v.nome]))}
        {filtroSelect("Status", "status", (Object.keys(STATUS_ENVIO) as StatusEnvio[]).map((s) => [s, STATUS_ENVIO[s].rotulo]))}
        {filtroSelect("Tipo de máquina", "equipamento", equipamentos.map((q) => [q, q]))}
        {totalFiltros > 0 && <Button variant="ghost" onClick={() => setFiltros({})}><X size={15} /> Limpar</Button>}
      </div>

      {aba === "painel" && (
        <div className="mb-5 space-y-4">
          <button type="button" onClick={() => setVerSemEnvio(!verSemEnvio)}
            className={`flex w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left ${semEnvio.length ? TONS.atencao : TONS.zero}`}>
            <ClipboardList size={20} />
            <span className="text-2xl font-bold">{semEnvio.length}</span>
            <span className="font-semibold">Pedidos aprovados ainda sem envio</span>
            <span className="text-xs opacity-80">Crie o envio para pedir a cotação com os dados padronizados</span>
            {semEnvio.length > 0 && <ArrowRight size={16} className="ml-auto" />}
          </button>
          {verSemEnvio && semEnvio.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface">
              {semEnvio.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="font-semibold">#{p.numero}</span>
                  <span className="min-w-0 flex-1">{p.cliente?.nome_fantasia || p.cliente?.nome} <span className="text-xs text-slate-500">{[p.cliente?.municipio, p.cliente?.uf].filter(Boolean).join("/")} · {brl(p.valor_total)} · {p.status}</span></span>
                  {podeEditar && <Button variant="secondary" onClick={() => criarDoPedido(p)}><Truck size={15} /> Criar envio</Button>}
                </li>
              ))}
            </ul>
          )}

          {grupos.map((g) => (
            <div key={g}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {INDICADORES.filter((i) => i.grupo === g).map((i) => {
                  const n = contagem[i.id].length;
                  const ativo = indicador === i.id;
                  return (
                    <button key={i.id} type="button" title={i.ajuda} onClick={() => setIndicador(ativo ? null : i.id)}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-pop ${n ? TONS[i.tom] : TONS.zero} ${ativo ? "ring-2 ring-brand" : ""}`}>
                      <span className="num w-10 text-center text-2xl font-bold">{n}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{i.titulo}</span>
                        <span className="block text-xs opacity-80">{i.ajuda}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(aba === "envios" || ind) && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{ind ? ind.titulo : "Todos os envios"}</h2>
            <span className="text-sm text-slate-500">{lista.length} envio(s)</span>
            {ind && <Button variant="ghost" onClick={() => setIndicador(null)}><X size={15} /> Fechar lista</Button>}
          </div>
          <Table empty={!lista.length}
            head={<><th className="th">Envio</th><th className="th">Destino</th><th className="th">Carga</th><th className="th">Transportadora</th><th className="th">Datas</th><th className="th text-right">Frete</th><th className="th" /></>}>
            {lista.map((e) => {
              const p = pedidoDe(e.pedido_id);
              const acima = e.valor_final != null && e.valor_aprovado != null && Number(e.valor_final) > Number(e.valor_aprovado) + 0.005;
              const abertas = ocorrencias.filter((o) => o.envio_id === e.id && o.status === "aberta").length;
              return (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberto({ id: e.id })}>
                  <td className="td" data-label="Envio">
                    <div className="font-semibold">#{e.numero}{p ? <span className="font-normal text-slate-500"> · pedido #{p.numero}</span> : ""}</div>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_ENVIO[e.status].cor}`}>{STATUS_ENVIO[e.status].rotulo}</span>
                    {abertas > 0 && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800"><AlertTriangle size={11} /> {abertas}</span>}
                  </td>
                  <td className="td" data-label="Destino">
                    <div>{p?.cliente?.nome_fantasia || p?.cliente?.nome || "—"}</div>
                    <div className="text-xs text-slate-500">{[e.cidade_destino, e.uf_destino].filter(Boolean).join("/") || "—"}{e.uf_destino ? ` · ${regiaoDaUf(e.uf_destino) ?? ""}` : ""}</div>
                  </td>
                  <td className="td" data-label="Carga">
                    <div className="text-xs">{e.tipo_equipamento || "—"}</div>
                    <div className="text-xs text-slate-500">{e.qtd_volumes} vol · {Number(e.peso_total_kg).toLocaleString("pt-BR")} kg · {Number(e.cubagem_m3).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³</div>
                  </td>
                  <td className="td" data-label="Transportadora">
                    <div>{nomeTransp(e)}</div>
                    {e.codigo_rastreio ? <div className="text-xs text-slate-500">rastreio {e.codigo_rastreio}</div> : e.status === "transito" ? <div className="text-xs font-semibold text-amber-700">sem rastreio</div> : null}
                  </td>
                  <td className="td whitespace-nowrap text-xs" data-label="Datas">
                    {e.coleta_prevista && !e.coletado_em && <div>coleta {dataBR(e.coleta_prevista)}</div>}
                    {e.coletado_em && <div>coletado {dataBR(e.coletado_em)}</div>}
                    {(e.entrega_prevista || e.prazo_desejado) && !e.entregue_em && <div className={(e.entrega_prevista ?? e.prazo_desejado)! < dia ? "font-semibold text-red-700" : ""}>entrega {dataBR(e.entrega_prevista ?? e.prazo_desejado)}</div>}
                    {e.entregue_em && <div>entregue {dataBR(e.entregue_em)}{!e.comprovante_em && <span className="font-semibold text-amber-700"> · sem comprovante</span>}</div>}
                  </td>
                  <td className="td text-right" data-label="Frete">
                    {e.valor_aprovado != null && <div className="font-semibold">{brl(e.valor_aprovado)}</div>}
                    {e.valor_final != null && <div className={`text-xs ${acima ? "font-bold text-red-700" : "text-slate-500"}`}>final {brl(e.valor_final)}</div>}
                  </td>
                  <td className="td text-right" onClick={(x) => x.stopPropagation()}>
                    {indicador === "sem_baixa" && podeEditar && p && <Button variant="secondary" onClick={() => darBaixa(e)}><PackageCheck size={15} /> Dar baixa</Button>}
                    {indicador === "frete_acima" && <CircleDollarSign size={16} className="inline text-red-600" />}
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </div>
  );
}
