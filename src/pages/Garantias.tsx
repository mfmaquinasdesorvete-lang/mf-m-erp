import { bicosDoModelo, proximaPreventiva6m, serieMF } from "@/lib/serieMaquina";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, BellRing, CalendarCheck, CalendarClock, Clock, History, MessageCircle, Plus, ShieldAlert, ShieldCheck, ShieldOff, Wrench } from "lucide-react";
import { Badge, Button, Field, Modal, PageHeader, Stat, Table, TOM_ACAO } from "@/components/ui";
import { limpar, useInvalidate, useRows, useSave } from "@/lib/data";
import { dataBR, hoje, somarDias, whatsappLink, pl } from "@/lib/format";
import { diasAte, situacaoGarantia, situacaoPreventiva, textoVenda } from "@/lib/garantia";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import type { Cliente, Equipamento, Produto } from "@/lib/types";
import { ClienteBusca } from "@/components/ClienteBusca";
import { TesteGigaDoNs } from "@/components/testeGiga/SeloGiga";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { noPeriodo, SEM_PERIODO, type Periodo } from "@/lib/filtroLista";

type Filtro = "todos" | "em_garantia" | "vence_logo" | "fora_garantia" | "prev_atrasada" | "prev_proxima";

export default function Garantias() {
  const { pode } = usePerfil();
  const navigate = useNavigate();
  const { data: equipamentos = [], isLoading } = useRows<Equipamento>("equipamentos", { select: "*, cliente:clientes(*)", order: "data_venda" });
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  // período pela data da venda: abre sem período (a lista de garantias é de todas as máquinas, não da semana)
  const [periodo, setPeriodo] = useState<Periodo>(SEM_PERIODO);
  const [editando, setEditando] = useState<Partial<Equipamento> | null>(null);
  const [historico, setHistorico] = useState<Equipamento | null>(null);
  const [fila, setFila] = useState(false);
  const { data: lembretes = [] } = useRows<Lembrete>("lembretes_manutencao", { order: "proxima_preventiva", ascending: true });
  const location = useLocation();
  useEffect(() => {
    if ((location.state as any)?.lembretes) {
      setFila(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const cont = useMemo(() => {
    const c = { em_garantia: 0, vence_logo: 0, fora_garantia: 0, prev_atrasada: 0, prev_proxima: 0 };
    for (const e of equipamentos) {
      c[situacaoGarantia(e.garantia_ate)]++;
      const p = situacaoPreventiva(e.proxima_preventiva);
      if (p === "atrasada") c.prev_atrasada++;
      if (p === "proxima") c.prev_proxima++;
    }
    return c;
  }, [equipamentos]);

  const lista = useMemo(() => equipamentos.filter((e) => {
    const g = situacaoGarantia(e.garantia_ate);
    const p = situacaoPreventiva(e.proxima_preventiva);
    const ok = filtro === "todos" || filtro === g || (filtro === "em_garantia" && g === "vence_logo")
      || (filtro === "prev_atrasada" && p === "atrasada") || (filtro === "prev_proxima" && p === "proxima");
    const b = busca.trim().toLowerCase();
    return ok && noPeriodo(e.data_venda, periodo) && (!b || `${e.descricao} ${e.numero_serie ?? ""} ${e.cliente?.nome ?? ""}`.toLowerCase().includes(b));
  }), [equipamentos, filtro, busca, periodo]);

  const alternar = (f: Filtro) => setFiltro(filtro === f ? "todos" : f);

  function mensagem(e: Equipamento) {
    const nome = e.cliente?.nome.split(" ")[0] ?? "";
    const p = situacaoPreventiva(e.proxima_preventiva);
    const g = situacaoGarantia(e.garantia_ate);
    if (p === "atrasada" || p === "proxima") {
      return `Olá ${nome}! Aqui é da MF Máquinas. Está na hora da manutenção preventiva da sua ${e.descricao}${e.numero_serie ? ` (série ${e.numero_serie})` : ""}. A preventiva evita paradas no meio do expediente e mantém a garantia em dia. Podemos agendar?`;
    }
    if (g === "vence_logo") {
      return `Olá ${nome}! A garantia da sua ${e.descricao} vence em ${dataBR(e.garantia_ate)}. Se notou qualquer barulho, vazamento ou sorvete fora do ponto, avise agora para avaliarmos ainda dentro da garantia.`;
    }
    return `Olá ${nome}! Aqui é da MF Máquinas. Tudo certo com a sua ${e.descricao}?`;
  }

  function abrirOS(e: Equipamento) {
    navigate("/assistencia", {
      state: {
        novaOS: {
          cliente_id: e.cliente_id, produto_id: e.produto_id, equipamento_id: e.id, equipamento: e.descricao,
          numero_serie: e.numero_serie, em_garantia: !e.origem && situacaoGarantia(e.garantia_ate) !== "fora_garantia", maquina_origem: e.origem ?? null,
        },
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Garantias e preventivas"
        subtitle="Cada máquina vendida entra aqui sozinha, com a garantia e a próxima preventiva calculadas."
        actions={<>
          <Button onClick={() => setFila(true)}><BellRing size={16} aria-hidden /> Lembrar<span className="hidden sm:inline"> clientes</span>{lembretes.length ? ` (${lembretes.length})` : ""}</Button>
          {pode("editar_equipamentos") && <Button variant="secondary" onClick={() => setEditando({ data_venda: hoje() })}><Plus size={16} aria-hidden /> <span className="hidden sm:inline">Cadastrar </span>máquina</Button>}
        </>}
      />

      {/* celular: os 5 cartões numa faixa que rola para o lado (em grade ocupavam meia tela e empurravam a busca e a lista) */}
      <div className="-mx-4 mb-5 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-5 max-md:[&>*]:w-40 max-md:[&>*]:shrink-0 max-md:[&>*]:snap-start">
        <Stat icon={ShieldCheck} tom="bom" label="Em garantia" valor={cont.em_garantia + cont.vence_logo}
          sub={filtro === "em_garantia" ? "filtrando ✓" : "toque para filtrar"} onClick={() => alternar("em_garantia")} />
        <Stat icon={ShieldAlert} tom={cont.vence_logo ? "atencao" : "neutro"} label="Garantia vence em 30 dias" valor={cont.vence_logo}
          sub={filtro === "vence_logo" ? "filtrando ✓" : "avise o cliente"} onClick={() => alternar("vence_logo")} />
        <Stat icon={ShieldOff} label="Fora da garantia" valor={cont.fora_garantia}
          sub={filtro === "fora_garantia" ? "filtrando ✓" : "serviço cobrado"} onClick={() => alternar("fora_garantia")} />
        <Stat icon={AlarmClock} tom={cont.prev_atrasada ? "critico" : "neutro"} label="Preventiva atrasada" valor={cont.prev_atrasada}
          sub={filtro === "prev_atrasada" ? "filtrando ✓" : "chame no WhatsApp"} onClick={() => alternar("prev_atrasada")} />
        <Stat icon={CalendarClock} tom="info" label="Preventiva nos próximos 30 dias" valor={cont.prev_proxima}
          sub={filtro === "prev_proxima" ? "filtrando ✓" : "agende com antecedência"} onClick={() => alternar("prev_proxima")} />
      </div>

      {/* a situação (garantia, preventiva) se escolhe tocando nos cartões acima; aqui a busca e o período da venda */}
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar por série, máquina ou cliente…" periodo={periodo} onPeriodo={setPeriodo} rotuloData="Venda"
        nFiltros={filtro !== "todos" ? 1 : 0} onLimpar={() => { setBusca(""); setPeriodo(SEM_PERIODO); setFiltro("todos"); }} />

      {/* Celular: um cartão por máquina */}
      <div className="space-y-3 md:hidden">
        {lista.map((e) => {
          const g = situacaoGarantia(e.garantia_ate);
          const p = situacaoPreventiva(e.proxima_preventiva);
          return (
            <div key={e.id} className="cartao p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">{e.descricao} <SeloVoltagem v={e.voltagem} /></div>
                  <div className="text-xs text-slate-500">{e.numero_serie ? `Série ${e.numero_serie}` : "sem nº de série"} · {textoVenda(e)}{e.usada ? " · usada" : ""}</div>
                </div>
                <Badge value={g} />
              </div>
              <div className="mt-2 text-sm text-slate-700">{e.cliente?.nome}</div>
              <dl className="num mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-slate-500">Garantia até</dt><dd className="font-semibold text-fg">{e.garantia_ate || !e.origem ? dataBR(e.garantia_ate) : "sem garantia da MF"}</dd></div>
                <div>
                  <dt className="text-slate-500">Preventiva</dt>
                  <dd className={`font-semibold ${p === "atrasada" ? "text-red-600" : p === "proxima" ? "text-amber-700" : "text-fg"}`}>
                    {dataBR(e.proxima_preventiva)}{p === "atrasada" ? " · atrasada" : ""}
                  </dd>
                </div>
              </dl>
              {/* ações do cartão: botões pequenos lado a lado (no celular eram 4 botões grandes em 2 linhas) */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                {e.cliente?.whatsapp && (
                  <a href={whatsappLink(e.cliente.whatsapp, mensagem(e))} target="_blank" rel="noreferrer"
                    className={`botao-mini ${TOM_ACAO.enviar}`}><MessageCircle size={13} aria-hidden /> WhatsApp</a>
                )}
                <Button tamanho="mini" variant="secondary" onClick={() => setHistorico(e)}><History size={13} aria-hidden /> Histórico</Button>
                {pode("editar_os") && <Button tamanho="mini" tom="servico" onClick={() => abrirOS(e)}><Wrench size={13} aria-hidden /> Abrir OS</Button>}
                {pode("editar_equipamentos") && <Button tamanho="mini" variant="ghost" onClick={() => setEditando(e)}>Editar</Button>}
              </div>
            </div>
          );
        })}
        {!isLoading && !lista.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma máquina encontrada.</p>}
      </div>

      <div className="hidden md:block">
      <Table
        empty={!isLoading && lista.length === 0}
        head={<><th className="th">Máquina</th><th className="th">Cliente</th><th className="th">Garantia</th><th className="th">Próxima preventiva</th><th className="th" /></>}
      >
        {lista.map((e) => {
          const g = situacaoGarantia(e.garantia_ate);
          const d = e.garantia_ate ? diasAte(e.garantia_ate) : null;
          return (
            <tr key={e.id} className="hover:bg-slate-50/70">
              <td className="td">
                <div className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">{e.descricao} <SeloVoltagem v={e.voltagem} /></div>
                <div className="text-xs text-slate-500">{e.numero_serie ? `Série ${e.numero_serie}` : "sem nº de série"} · {textoVenda(e)}{e.usada ? " · usada" : ""}</div>
              </td>
              <td className="td">{e.cliente?.nome}<div className="text-xs text-slate-500">{[e.cliente?.municipio, e.cliente?.uf].filter(Boolean).join("/")}</div></td>
              <td className="td">
                {e.origem ? (
                  // vendida por outra empresa: a MF não dá garantia da máquina (só do serviço e das peças que trocar)
                  <span title={`Máquina vendida pela ${e.origem}. A MF Máquinas não dá garantia desta máquina: responde só pelo serviço e pelas peças que trocar.`}
                    className="inline-flex flex-col rounded-lg border-2 border-red-400 bg-red-50 px-2 py-1 text-red-800">
                    <span className="text-2xs font-black uppercase tracking-wide">Sem garantia da MF</span>
                    <span className="text-2xs font-semibold">vendida pela {e.origem}</span>
                  </span>
                ) : g === "fora_garantia" ? (
                  <span className="inline-flex rounded-md border border-slate-400 bg-slate-100 px-2 py-0.5 text-2xs font-black uppercase tracking-wide text-slate-700">Fora da garantia</span>
                ) : <Badge value={g} />}
                <div className="num mt-1 text-xs text-slate-500">
                  {e.garantia_ate ? (d! >= 0 ? `até ${dataBR(e.garantia_ate)} · ${d} ${pl(d, "dia", "dias")}` : `venceu em ${dataBR(e.garantia_ate)}`) : e.origem ? "" : "sem garantia registrada"}
                </div>
              </td>
              <td className="td">
                {(() => {
                  // sem data marcada: de 6 em 6 meses a partir da compra (NF ou proposta)
                  const prev = e.proxima_preventiva ?? proximaPreventiva6m(e.data_venda, hoje());
                  const sp = situacaoPreventiva(prev);
                  if (!prev) return "—";
                  return (
                    <span className={`inline-flex flex-col rounded-lg px-2 py-1 ${sp === "atrasada" ? "bg-red-100 text-red-800" : sp === "proxima" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
                      <span className="num text-sm font-bold">{dataBR(prev)}</span>
                      <span className="text-2xs font-semibold">{sp === "atrasada" ? "atrasada" : sp === "proxima" ? "nos próximos 30 dias" : "em dia"}{e.proxima_preventiva ? "" : " · 6 em 6 meses"}</span>
                    </span>
                  );
                })()}
              </td>
              <td className="td">
                <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                  {e.cliente?.whatsapp && (
                    <a href={whatsappLink(e.cliente.whatsapp, mensagem(e))} target="_blank" rel="noreferrer" title="Lembrete no WhatsApp"
                      className="inline-flex items-center rounded-lg px-2 py-2 text-emerald-700 hover:bg-emerald-50"><MessageCircle size={16} /></a>
                  )}
                  <Button variant="ghost" title="Histórico de atendimentos" onClick={() => setHistorico(e)}><History size={16} /></Button>
                  {pode("editar_os") && <Button variant="secondary" onClick={() => abrirOS(e)}><Wrench size={15} /> Abrir OS</Button>}
                  {pode("editar_equipamentos") && <Button variant="ghost" onClick={() => setEditando(e)}>Editar</Button>}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      </div>

      {editando && <EquipamentoModal inicial={editando} onClose={() => setEditando(null)} />}
      {historico && <HistoricoModal equipamento={historico} onClose={() => setHistorico(null)} />}
      {fila && <FilaLembretes lembretes={lembretes} mensagem={mensagem} onClose={() => setFila(false)} />}
    </div>
  );
}

export function EquipamentoModal({ inicial, onClose }: { inicial: Partial<Equipamento>; onClose: () => void }) {
  const [e, setE] = useState(inicial);
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto & { garantia_meses?: number | null }>("produtos", { order: "descricao", ascending: true });
  const { data: cfg } = useConfig();
  const save = useSave("equipamentos");
  const set = (p: Partial<Equipamento>) => setE((x) => ({ ...x, ...p }));

  // Ao escolher o modelo e a data da venda, sugere garantia e preventiva pelos prazos cadastrados.
  function sugerir(produtoId: string | null, dataVenda: string | null | undefined) {
    const prod = produtos.find((p) => p.id === produtoId);
    if (!dataVenda || !cfg) return {};
    const base = new Date(dataVenda + "T12:00:00");
    // soma meses sem passar do fim do mês (31/08 + 6 meses = 28/02) e sem virar o dia pelo fuso
    const somaMeses = (m: number) => {
      const fim = new Date(base.getFullYear(), base.getMonth() + m + 1, 0).getDate();
      const d = new Date(base.getFullYear(), base.getMonth() + m, Math.min(base.getDate(), fim));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    // máquina vendida por outra empresa (ex.: My Frost) não tem garantia da MF: só sugere a preventiva
    return {
      ...(e.origem ? {} : { garantia_ate: somaMeses(prod?.garantia_meses ?? cfg.garantia_meses_padrao) }),
      proxima_preventiva: somaMeses(cfg.preventiva_meses),
    };
  }

  const [nfSerie, setNfSerie] = useState("");
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    try {
      const { cliente: _c, ...row } = e as any;
      await save.mutateAsync(limpar(row));
      notify("Máquina salva");
      onClose();
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <Modal open onClose={onClose} title={e.id ? "Editar máquina" : "Cadastrar máquina do cliente"}>
      {!e.id && <p className="mb-4 text-sm text-slate-500">Use para máquinas vendidas antes do ERP. As vendas novas entram aqui sozinhas quando o pedido é aprovado.</p>}
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Cliente" className="sm:col-span-2">
          <ClienteBusca clientes={clientes} value={e.cliente_id} required onChange={(id) => set({ cliente_id: id })} />
        </Field>
        <Field label="Modelo" className="sm:col-span-2">
          <select className="input" value={e.produto_id ?? ""} onChange={(x) => {
            const prod = produtos.find((p) => p.id === x.target.value);
            set({ produto_id: x.target.value || null, descricao: prod?.descricao ?? e.descricao, ...sugerir(x.target.value, e.data_venda) });
          }}>
            <option value="">Outro / não cadastrado</option>
            {produtos.filter((p) => p.tipo === "maquina").map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
          </select>
        </Field>
        <Field label="Descrição"><input className="input" value={e.descricao ?? ""} onChange={(x) => set({ descricao: x.target.value })} required /></Field>
        <Field label="Voltagem que o cliente comprou">
          <select className="input" value={e.voltagem ?? ""} onChange={(x) => set({ voltagem: x.target.value || null })}>
            <option value="">Não informada</option>
            {VOLTAGENS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Nº de série">
          <input className="input" value={e.numero_serie ?? ""} onChange={(x) => set({ numero_serie: x.target.value })} />
          {/* regra da MF: bicos + mês/ano da NF + 3 últimos números da NF */}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            NF nº <input className="input !min-h-0 w-24 !py-1 text-xs" inputMode="numeric" value={nfSerie} onChange={(x) => setNfSerie(x.target.value)} aria-label="Número da NF da venda" />
            {(() => {
              const sug = serieMF(bicosDoModelo(e.descricao), e.data_venda, nfSerie);
              return sug ? <Button type="button" tamanho="mini" onClick={() => set({ numero_serie: sug })}>Usar {sug}</Button>
                : <span>{bicosDoModelo(e.descricao) ? "digite a NF para gerar" : "não sei os bicos pelo modelo"}</span>;
            })()}
          </span>
        </Field>
        <Field label="Data da venda">
          <input className="input" type="date" value={e.data_venda ?? ""} onChange={(x) => set({ data_venda: x.target.value || null, ...sugerir(e.produto_id ?? null, x.target.value) })} required={!e.origem} />
        </Field>
        <Field label="Garantia até"><input className="input" type="date" value={e.garantia_ate ?? ""} onChange={(x) => set({ garantia_ate: x.target.value })} /></Field>
        <Field label="Próxima preventiva"><input className="input" type="date" value={e.proxima_preventiva ?? ""} onChange={(x) => set({ proxima_preventiva: x.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={!!e.usada} onChange={(x) => set({ usada: x.target.checked })} />
          Máquina usada (o cliente entra no cadastro de quem compra máquina usada)
        </label>
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={e.observacoes ?? ""} onChange={(x) => set({ observacoes: x.target.value })} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Todas as OS da máquina (pelo vínculo ou pelo nº de série). */
export function HistoricoModal({ equipamento, onClose }: { equipamento: { id?: string; numero_serie?: string | null; descricao: string }; onClose: () => void }) {
  const { data: ordens = [], isLoading, error: erroHistorico } = useQuery({
    queryKey: ["ordens_servico", "historico", equipamento.id, equipamento.numero_serie],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordens_servico").select("*").order("data_entrada", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((o: any) =>
        (equipamento.id && o.equipamento_id === equipamento.id) || (equipamento.numero_serie && o.numero_serie === equipamento.numero_serie));
    },
  });

  return (
    <Modal open onClose={onClose} title={`Histórico · ${equipamento.descricao}${equipamento.numero_serie ? ` (${equipamento.numero_serie})` : ""}`} wide>
      <TesteGigaDoNs ns={equipamento.numero_serie} rotulo="Teste na fábrica (REG-006):" className="mb-4" />
      {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : erroHistorico ? (
        <p className="py-6 text-center text-sm text-red-600">Não deu para carregar o histórico: {(erroHistorico as Error).message}</p>
      ) : !ordens.length ? (
        <p className="py-6 text-center text-sm text-slate-500">Nenhum atendimento registrado para esta máquina.</p>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
          {ordens.map((o: any) => (
            <li key={o.id} className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-fg">OS #{o.numero}</span>
                <span className="num text-sm text-slate-500">{dataBR(o.data_entrada)}</span>
                <Badge value={o.status} />
                {o.em_garantia && <Badge value="em_garantia" />}
              </div>
              <p className="mt-1 text-sm text-slate-700"><b>Defeito:</b> {o.defeito_relatado}</p>
              {o.diagnostico && <p className="text-sm text-slate-600"><b>Diagnóstico:</b> {o.diagnostico}</p>}
              {o.solucao && <p className="text-sm text-slate-600"><b>Serviço:</b> {o.solucao}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

type Lembrete = Equipamento & { cliente_nome: string; cliente_whatsapp: string | null; ultimo_lembrete: string | null; preventiva_agendada?: string | null };

/** Fila do dia: quem precisa ser lembrado da preventiva. Cada ação registra o contato e tira a máquina da fila. */
function FilaLembretes({ lembretes, mensagem, onClose }: { lembretes: Lembrete[]; mensagem: (e: Equipamento) => string; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [agendando, setAgendando] = useState<string | null>(null);
  const [data, setData] = useState(somarDias(3));
  // Máquinas com uma ação rodando: o ref trava o clique duplo na hora (antes de a tela redesenhar), o estado apaga os botões.
  const rodando = useRef(new Set<string>());
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const marcar = (id: string, on: boolean) => {
    if (on) rodando.current.add(id); else rodando.current.delete(id);
    setOcupados(new Set(rodando.current));
  };

  /** Registra o contato e tira a máquina da fila. Devolve true se deu certo; com erro, avisa e a máquina continua na fila. */
  async function registrar(e: Lembrete, resultado: string, proximo: string | null, agendada?: string): Promise<boolean> {
    if (rodando.current.has(e.id)) return false;
    marcar(e.id, true);
    try {
      const { error } = await supabase.from("contatos_cliente").insert({
        cliente_id: e.cliente_id, equipamento_id: e.id, tipo: "preventiva", canal: "whatsapp", resultado, proximo_contato: proximo,
      });
      if (error) throw error;
      const patch: Record<string, unknown> = { ultimo_contato: hoje() };
      if (agendada) patch.preventiva_agendada = agendada;
      const { error: erroMaquina } = await supabase.from("equipamentos").update(patch).eq("id", e.id);
      if (erroMaquina) throw erroMaquina;
      notify("Contato registrado");
      return true;
    } catch (err) {
      notifyError(err);
      return false;
    } finally {
      // Atualiza a fila também no erro: se o contato entrou e só a máquina falhou, a tela mostra o que ficou gravado.
      invalidate("lembretes_manutencao", "equipamentos");
      marcar(e.id, false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Lembrar clientes da manutenção" wide>
      <p className="mb-4 text-sm text-slate-500">
        Máquinas com preventiva vencida ou nos próximos 15 dias. Ao enviar a mensagem, a máquina sai da fila por 7 dias.
        Se o cliente agendar, registre a data e ela sai da fila até lá.
      </p>
      {!lembretes.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Ninguém para lembrar hoje. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {lembretes.map((e) => {
            const atrasada = (e.proxima_preventiva ?? "") < hoje();
            const ocupado = ocupados.has(e.id);
            return (
              <li key={e.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-fg">{e.cliente_nome}</div>
                    <div className="text-sm text-slate-500">{e.descricao}{e.numero_serie ? ` · ${e.numero_serie}` : ""}</div>
                  </div>
                  <span className={`num text-sm font-semibold ${atrasada ? "text-red-600" : "text-amber-700"}`}>
                    preventiva {atrasada ? "venceu" : "vence"} {dataBR(e.proxima_preventiva)}
                  </span>
                </div>
                {e.ultimo_lembrete && <div className="mt-1 text-xs text-slate-500">Último lembrete em {dataBR(e.ultimo_lembrete)}</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.cliente_whatsapp ? (
                    <a href={whatsappLink(e.cliente_whatsapp, mensagem({ ...e, cliente: { nome: e.cliente_nome } as Cliente }))} target="_blank" rel="noreferrer"
                      aria-disabled={ocupado}
                      onClick={(ev) => {
                        // Clique duplo: não abre o WhatsApp de novo nem grava o contato duas vezes.
                        if (rodando.current.has(e.id)) { ev.preventDefault(); return; }
                        registrar(e, "mensagem enviada pelo WhatsApp", somarDias(7));
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg bg-publico-sucesso px-3 py-2 text-sm font-semibold text-white hover:opacity-90 ${ocupado ? "pointer-events-none opacity-50" : ""}`}>
                      <MessageCircle size={16} /> Enviar lembrete
                    </a>
                  ) : <span className="self-center text-sm text-amber-700">Cliente sem WhatsApp no cadastro</span>}
                  {agendando === e.id ? (
                    <span className="flex items-center gap-2">
                      <input aria-label="Data da preventiva" className="input w-auto" type="date" value={data} onChange={(x) => setData(x.target.value)} />
                      <Button variant="secondary" disabled={ocupado || !data}
                        onClick={async () => { if (await registrar(e, `agendou a preventiva para ${dataBR(data)}`, null, data)) setAgendando(null); }}>Confirmar</Button>
                    </span>
                  ) : (
                    <Button variant="secondary" disabled={ocupado} onClick={() => setAgendando(e.id)}><CalendarCheck size={16} /> Agendou</Button>
                  )}
                  <Button variant="ghost" disabled={ocupado} onClick={() => registrar(e, "pediu para lembrar depois", somarDias(30))}><Clock size={16} /> Lembrar em 30 dias</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

const VOLTAGENS = ["127V", "220V", "220V trifásica", "380V"];

/** Etiqueta da voltagem: trifásica e 380V em laranja (pedem atenção na instalação). */
function SeloVoltagem({ v }: { v?: string | null }) {
  if (!v) return null;
  const forte = /tri|380/i.test(v);
  return <span className={`rounded-md px-1.5 py-0.5 text-2xs font-extrabold ${forte ? "bg-orange-600 text-white" : "bg-sky-600 text-white"}`} title="Voltagem que o cliente comprou">⚡ {v}</span>;
}
