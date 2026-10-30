// Oportunidades (CRM, parte 1, pedido da usuária de 30/10): o que vem antes do orçamento, num quadro por etapas
// (novo contato → em conversa → proposta enviada → ganho / perdido), com responsável, os mesmos marcadores do ERP,
// histórico de tudo o que aconteceu (gravado pelo banco), notas e as métricas do funil. O orçamento continua em Vendas:
// daqui se abre um orçamento novo para o cliente e se liga o orçamento ou pedido à oportunidade.
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, MessageCircle, Plus, ShoppingCart, StickyNote, Trash2 } from "lucide-react";
import { Button, Carregando, ErroLista, Field, Modal, PageHeader, Tabs, Vazio, chip } from "@/components/ui";
import { QuadroEtapas, CartaoEtapa } from "@/components/quadro/QuadroEtapas";
import { BotaoMarcadores, ChipsMarcadores, SelectMarcador, useMarcadores } from "@/components/nfe/Marcadores";
import type { Marcador } from "@/lib/marcadores";
import { ClienteBusca } from "@/components/ClienteBusca";
import { confirmar, pedirTexto } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate, useRows } from "@/lib/data";
import { ATALHOS, noPeriodo, periodoDoAtalho, type Atalho } from "@/lib/filtroLista";
import { brl, dataBR, hoje, pl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { ClienteBuscavel } from "@/lib/buscaCliente";
import {
  ABERTAS, ETAPAS_OP, MOTIVOS_PERDA, ORIGENS, PROXIMA, metricasOp, rotuloEtapa, situacaoOp,
  type EtapaOp, type EventoOp, type Oportunidade,
} from "@/lib/oportunidades";

type Vendedor = { id: string; nome: string; ativo: boolean; user_id: string | null };
type Cliente = ClienteBuscavel;
type PedidoCliente = { id: string; numero: number; status: string; valor_total: number | null; created_at: string; cliente_id: string };

/** Ganho e perdido ficam no quadro por 30 dias depois de fechar; as métricas olham tudo. */
const DIAS_FECHADAS = 30;

export default function Oportunidades() {
  const { tem, papel, user_id } = usePerfil();
  const podeMexer = tem("vendas");
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [aba, setAba] = useState<"quadro" | "metricas">("quadro");
  const { data: ops = [], isLoading, error, refetch } = useRows<Oportunidade>("oportunidades", { filtro: (q) => q.is("excluida_em", null), key: ["ativas"] });
  const { data: eventos = [] } = useRows<EventoOp>("oportunidade_eventos", { order: "criado_em", ascending: true });
  const { data: clientes = [], isLoading: carregandoClientes } = useRows<Cliente>("clientes", {
    select: "id, codigo, nome, nome_fantasia, cpf_cnpj, municipio, uf, email, telefone, whatsapp", order: "nome", ascending: true,
  });
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { select: "id, nome, ativo, user_id", order: "nome", ascending: true });
  const { data: marcadores = [] } = useMarcadores();
  const [aberta, setAberta] = useState<Partial<Oportunidade> | null>(null);
  const [busca, setBusca] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [marcador, setMarcador] = useState("");
  const [movendo, setMovendo] = useState<string | null>(null);

  const porCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const nomeVendedor = (id: string | null) => vendedores.find((v) => v.id === id)?.nome ?? "Sem responsável";
  const meuVendedor = vendedores.find((v) => v.user_id === user_id && v.ativo)?.id ?? null;
  const quem = (o: Oportunidade) => (o.cliente_id ? porCliente.get(o.cliente_id)?.nome : null) ?? o.contato_nome ?? "Sem nome";

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return ops.filter((o) => (!vendedor || (vendedor === "sem" ? !o.vendedor_id : o.vendedor_id === vendedor))
      && (!marcador || (o.marcadores ?? []).includes(marcador))
      && (!t || [o.titulo, quem(o), o.contato_whatsapp, o.contato_email, String(o.numero)].some((x) => x?.toLowerCase().includes(t))));
  }, [ops, busca, vendedor, marcador, porCliente]); // eslint-disable-line react-hooks/exhaustive-deps

  const limiteFechadas = Date.now() - DIAS_FECHADAS * 86_400_000;
  const itens = useMemo(() => filtradas
    .filter((o) => ABERTAS.includes(o.etapa) || new Date(o.fechada_em ?? o.etapa_desde).getTime() >= limiteFechadas)
    .map((o) => { const s = situacaoOp(o); return { id: o.id, etapa: o.etapa, nivel: s.nivel, alerta: s.alerta, desde: o.etapa_desde, valor: Number(o.valor || 0), o, s }; }),
  [filtradas, limiteFechadas]);

  async function mover(o: Oportunidade, etapa: EtapaOp) {
    if (etapa === "ganho" && !(await confirmar(`Marcar "${o.titulo}" como ganha?${o.pedido_id ? "" : " Dica: ligue o pedido na oportunidade para saber de onde veio a venda."}`, { ok: "Ganhou" }))) return;
    setMovendo(o.id);
    const { error } = await supabase.from("oportunidades").update({ etapa }).eq("id", o.id);
    setMovendo(null);
    if (error) return notifyError(error);
    invalidate("oportunidades", "oportunidade_eventos");
    notify(`${o.titulo}: ${rotuloEtapa(etapa)}`);
  }

  const zap = (o: Oportunidade) => o.contato_whatsapp || (o.cliente_id ? porCliente.get(o.cliente_id)?.whatsapp : null);

  return (
    <div className="space-y-4">
      <PageHeader title="Oportunidades" subtitle="Do primeiro contato até virar venda: quem falou com quem, em que pé está e o que fazer agora."
        actions={podeMexer && <Button onClick={() => setAberta({ etapa: "novo", vendedor_id: meuVendedor })}><Plus size={16} /> Nova oportunidade</Button>} />

      <Tabs value={aba} onChange={setAba} options={[{ value: "quadro", label: "Quadro" }, { value: "metricas", label: "Métricas" }]} />

      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-64" type="search" placeholder="Buscar cliente, contato, título ou nº" aria-label="Buscar oportunidade"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className={`input w-auto max-w-56 ${vendedor ? "!border-brand" : ""}`} aria-label="Filtrar por responsável" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
          <option value="">Responsável: todos</option>
          {vendedores.filter((v) => v.ativo).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          <option value="sem">Sem responsável</option>
        </select>
        <SelectMarcador valor={marcador} onChange={setMarcador} todos={marcadores} />
        {(busca || vendedor || marcador) && (
          <Button variant="ghost" onClick={() => { setBusca(""); setVendedor(""); setMarcador(""); }}>Limpar filtros</Button>
        )}
      </div>

      {error ? <ErroLista erro={error} onTentar={() => refetch()} />
        : isLoading ? <Carregando />
        : aba === "metricas" ? <Metricas ops={filtradas} eventos={eventos} nomeVendedor={nomeVendedor} />
        : !ops.length ? (
          <Vazio titulo="Nenhuma oportunidade ainda." texto="Cada pessoa que procura a MF vira uma oportunidade: anote aqui e acompanhe até fechar."
            acao={podeMexer && <Button onClick={() => setAberta({ etapa: "novo", vendedor_id: meuVendedor })}><Plus size={16} /> Nova oportunidade</Button>} />
        ) : (
          <>
            <QuadroEtapas etapas={ETAPAS_OP} itens={itens} nome={["oportunidade", "oportunidades"]}
              cartao={({ o, s }) => {
                const prox = PROXIMA[o.etapa];
                const fone = zap(o);
                return (
                  <CartaoEtapa key={o.id} cor={ETAPAS_OP.find((e) => e.id === o.etapa)!.cor} titulo={quem(o)} subtitulo={`#${o.numero} · ${o.titulo}`}
                    valor={o.valor} dias={s.dias} nivel={s.nivel} alerta={s.alerta}
                    etiquetas={<>
                      <span className={chip(false)}>{nomeVendedor(o.vendedor_id)}</span>
                      {o.etapa === "perdido" && o.motivo_perda && <span className={chip(false)}>{o.motivo_perda}</span>}
                      <ChipsMarcadores ids={o.marcadores} todos={marcadores} pequeno />
                    </>}
                    proximo={prox?.frase}
                    botao={podeMexer && prox ? { rotulo: prox.rotulo, icon: ArrowRight, ocupado: movendo === o.id, onClick: () => mover(o, prox.etapa) } : null}
                    extra={fone ? (
                      <a href={whatsappLink(fone, `Olá, ${quem(o).split(" ")[0]}!`)} target="_blank" rel="noreferrer" title="Abrir a conversa no WhatsApp"
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                        <MessageCircle size={14} aria-hidden /> WhatsApp
                      </a>
                    ) : undefined}
                    onAbrir={() => setAberta(o)} />
                );
              }} />
            <p className="text-xs text-slate-500">Ganho e perdido mostram os fechados nos últimos {DIAS_FECHADAS} dias; as métricas contam todos.</p>
          </>
        )}

      {aberta && (
        <OportunidadeModal inicial={aberta} clientes={clientes} carregandoClientes={carregandoClientes} vendedores={vendedores}
          eventos={eventos.filter((e) => e.oportunidade_id === aberta.id)} podeMexer={podeMexer} admin={papel === "admin"}
          marcadores={marcadores} marcadoresAtuais={ops.find((x) => x.id === aberta.id)?.marcadores ?? null} navigate={navigate} onClose={() => setAberta(null)} />
      )}
    </div>
  );
}

function OportunidadeModal({ inicial, clientes, carregandoClientes, vendedores, eventos, podeMexer, admin, marcadores, marcadoresAtuais, navigate, onClose }: {
  inicial: Partial<Oportunidade>; clientes: Cliente[]; carregandoClientes: boolean; vendedores: Vendedor[]; eventos: EventoOp[];
  podeMexer: boolean; admin: boolean; marcadores: Marcador[]; navigate: ReturnType<typeof useNavigate>; onClose: () => void;
  /** marcadores de agora (mudam pelo botão sem fechar a janela) */
  marcadoresAtuais: string[] | null;
}) {
  const invalidate = useInvalidate();
  const [o, setO] = useState<Partial<Oportunidade>>(inicial);
  const [semCadastro, setSemCadastro] = useState(!inicial.cliente_id && !!inicial.contato_nome);
  const [motivoOutro, setMotivoOutro] = useState(inicial.motivo_perda && !MOTIVOS_PERDA.includes(inicial.motivo_perda) ? inicial.motivo_perda : "");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [sujo, setSujo] = useState(false);
  const novo = !inicial.id;
  const set = (x: Partial<Oportunidade>) => { setO((a) => ({ ...a, ...x })); setSujo(true); };
  const { data: pedidos = [] } = useRows<PedidoCliente>("pedidos", {
    select: "id, numero, status, valor_total, created_at, cliente_id", key: ["oportunidade", o.cliente_id ?? ""], enabled: !!o.cliente_id,
    filtro: (q) => q.eq("cliente_id", o.cliente_id).neq("status", "cancelado"),
  });
  const motivoEscolhido = o.motivo_perda && MOTIVOS_PERDA.includes(o.motivo_perda) ? o.motivo_perda : o.motivo_perda ? "Outro" : "";

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const titulo = (o.titulo ?? "").trim();
    if (titulo.length < 2) return notifyError(new Error("Escreva o que a pessoa procura (ex.: Máquina de sorvete expresso)."));
    if (!o.cliente_id && !(o.contato_nome ?? "").trim()) return notifyError(new Error("Escolha o cliente ou escreva o nome do contato."));
    const motivo = o.etapa === "perdido" ? (motivoEscolhido === "Outro" ? motivoOutro.trim() : o.motivo_perda) : null;
    if (o.etapa === "perdido" && !motivo) return notifyError(new Error("Diga por que não fechou (motivo da perda)."));
    const linha = {
      titulo, cliente_id: o.cliente_id || null,
      contato_nome: o.cliente_id ? null : (o.contato_nome ?? "").trim() || null,
      contato_whatsapp: o.cliente_id ? null : (o.contato_whatsapp ?? "").trim() || null,
      contato_email: o.cliente_id ? null : (o.contato_email ?? "").trim() || null,
      etapa: o.etapa ?? "novo", valor: o.valor == null || Number.isNaN(Number(o.valor)) ? null : Number(o.valor),
      vendedor_id: o.vendedor_id || null, origem: o.origem || null, previsao: o.previsao || null,
      motivo_perda: motivo || null, pedido_id: o.pedido_id || null,
    };
    setOcupado(true);
    const { error } = novo
      ? await supabase.from("oportunidades").insert(linha)
      : await supabase.from("oportunidades").update(linha).eq("id", inicial.id!);
    setOcupado(false);
    if (error) return notifyError(error);
    invalidate("oportunidades", "oportunidade_eventos");
    notify(novo ? "Oportunidade criada" : "Oportunidade salva");
    onClose();
  }

  async function anotar() {
    if (!nota.trim() || !inicial.id) return;
    setOcupado(true);
    const { error } = await supabase.from("oportunidade_eventos").insert({ oportunidade_id: inicial.id, tipo: "nota", texto: nota.trim() });
    setOcupado(false);
    if (error) return notifyError(error);
    setNota("");
    invalidate("oportunidade_eventos");
    notify("Nota guardada");
  }

  async function excluir() {
    const motivo = await pedirTexto("Por que excluir esta oportunidade? (ela some do quadro e das métricas)", "", { titulo: "Excluir oportunidade", ok: "Excluir", minimo: 3 });
    if (!motivo?.trim()) return;
    setOcupado(true);
    const { error } = await supabase.from("oportunidades").update({ excluida_em: new Date().toISOString() }).eq("id", inicial.id!);
    if (!error) await supabase.from("oportunidade_eventos").insert({ oportunidade_id: inicial.id, tipo: "nota", texto: `Excluída: ${motivo.trim()}` });
    setOcupado(false);
    if (error) return notifyError(error);
    invalidate("oportunidades", "oportunidade_eventos");
    notify("Oportunidade excluída");
    onClose();
  }

  const fazerOrcamento = () => navigate("/pedidos", { state: { novo: true, cliente_id: o.cliente_id } });
  const leitura = !podeMexer;

  return (
    <Modal open onClose={onClose} sujo={sujo} wide title={novo ? "Nova oportunidade" : `Oportunidade #${inicial.numero}`}>
      <form onSubmit={salvar} className="space-y-4">
        <Field label="O que a pessoa procura" obrigatorio>
          <input className="input" autoFocus={novo} required minLength={2} maxLength={200} disabled={leitura} placeholder="Ex.: Máquina de sorvete expresso para a loja nova"
            value={o.titulo ?? ""} onChange={(e) => set({ titulo: e.target.value })} />
        </Field>

        <section className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-fg">Quem</h3>
            {!leitura && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4" checked={semCadastro} onChange={(e) => { setSemCadastro(e.target.checked); set(e.target.checked ? { cliente_id: null } : {}); }} />
                Ainda não é cliente
              </label>
            )}
          </div>
          {semCadastro ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nome do contato" obrigatorio>
                <input className="input" disabled={leitura} maxLength={200} value={o.contato_nome ?? ""} onChange={(e) => set({ contato_nome: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <input className="input" inputMode="tel" disabled={leitura} maxLength={40} value={o.contato_whatsapp ?? ""} onChange={(e) => set({ contato_whatsapp: e.target.value })} />
              </Field>
              <Field label="E-mail">
                <input className="input" type="email" disabled={leitura} maxLength={200} value={o.contato_email ?? ""} onChange={(e) => set({ contato_email: e.target.value })} />
              </Field>
            </div>
          ) : (
            <ClienteBusca clientes={clientes} carregando={carregandoClientes} value={o.cliente_id ?? null} disabled={leitura}
              placeholder="Buscar o cliente: nome, CNPJ, telefone ou cidade" onChange={(id) => set({ cliente_id: id || null, pedido_id: null })} />
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Etapa">
            <select className="input" disabled={leitura} value={o.etapa ?? "novo"} onChange={(e) => set({ etapa: e.target.value as EtapaOp })}>
              {ETAPAS_OP.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
            </select>
          </Field>
          <Field label="Valor estimado (R$)">
            <input className="input" type="number" inputMode="decimal" min={0} step="0.01" disabled={leitura}
              value={o.valor ?? ""} onChange={(e) => set({ valor: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Responsável">
            <select className="input" disabled={leitura} value={o.vendedor_id ?? ""} onChange={(e) => set({ vendedor_id: e.target.value || null })}>
              <option value="">Sem responsável</option>
              {vendedores.filter((v) => v.ativo || v.id === o.vendedor_id).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Field>
          <Field label="Previsão de fechar">
            <input className="input" type="date" disabled={leitura} value={o.previsao ?? ""} onChange={(e) => set({ previsao: e.target.value || null })} />
          </Field>
          <Field label="Como chegou">
            <select className="input" disabled={leitura} value={o.origem ?? ""} onChange={(e) => set({ origem: e.target.value || null })}>
              <option value="">Escolha…</option>
              {ORIGENS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          {o.etapa === "perdido" && (
            <Field label="Por que não fechou" obrigatorio className={motivoEscolhido === "Outro" ? "" : "lg:col-span-3"}>
              <select className="input" disabled={leitura} required value={motivoEscolhido} onChange={(e) => { set({ motivo_perda: e.target.value || null }); if (e.target.value !== "Outro") setMotivoOutro(""); }}>
                <option value="">Escolha…</option>
                {MOTIVOS_PERDA.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          )}
          {o.etapa === "perdido" && motivoEscolhido === "Outro" && (
            <Field label="Qual motivo" obrigatorio className="lg:col-span-2">
              <input className="input" disabled={leitura} required maxLength={300} value={motivoOutro} onChange={(e) => { setMotivoOutro(e.target.value); setSujo(true); }} />
            </Field>
          )}
        </div>

        {o.cliente_id && (
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-bold text-fg">Orçamento ou pedido</h3>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Ligado a esta oportunidade" className="min-w-0 flex-1 basis-60">
                <select className="input" disabled={leitura} value={o.pedido_id ?? ""}
                  onChange={(e) => set({ pedido_id: e.target.value || null, ...(e.target.value && (o.etapa === "novo" || o.etapa === "conversa") ? { etapa: "proposta" as EtapaOp } : {}) })}>
                  <option value="">Nenhum</option>
                  {[...pedidos].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((p) => (
                    <option key={p.id} value={p.id}>#{p.numero} · {p.status === "orcamento" ? "orçamento" : p.status} · {brl(p.valor_total)} · {dataBR(p.created_at)}</option>
                  ))}
                </select>
              </Field>
              {o.pedido_id && <Button type="button" variant="secondary" onClick={() => navigate("/pedidos", { state: { abrir: o.pedido_id } })}>Abrir</Button>}
              {!leitura && <Button type="button" variant="secondary" onClick={fazerOrcamento}><ShoppingCart size={15} /> Fazer orçamento</Button>}
            </div>
            <p className="mt-1 text-xs text-slate-500">Depois de fazer o orçamento em Vendas, volte e ligue ele aqui: a oportunidade passa para "Proposta enviada".</p>
          </section>
        )}

        {!novo && (
          <section className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="flex-1 text-sm font-bold text-fg">Marcadores</h3>
              {!leitura && <BotaoMarcadores tabela="oportunidades" registro={{ id: inicial.id!, marcadores: marcadoresAtuais }} nome={["oportunidade", "oportunidades"]} />}
            </div>
            <ChipsMarcadores ids={marcadoresAtuais} todos={marcadores} />
            {!(marcadoresAtuais ?? []).length && <p className="text-sm text-slate-500">Nenhum marcador.</p>}
          </section>
        )}

        {!novo && (
          <section className="rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><StickyNote size={15} className="text-modulo-texto" aria-hidden /> Notas e histórico</h3>
            {!leitura && (
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Nova nota" className="flex-1">
                  <textarea className="input min-h-[64px]" maxLength={4000} placeholder="Ex.: pediu o preço da máquina com o kit de peças; ligar na quinta"
                    value={nota} onChange={(e) => setNota(e.target.value)} />
                </Field>
                <Button type="button" variant="secondary" disabled={ocupado || !nota.trim()} onClick={anotar}>Guardar nota</Button>
              </div>
            )}
            <Historico eventos={eventos} />
          </section>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {admin && !novo && <Button type="button" variant="ghost" className="!text-red-600" disabled={ocupado} onClick={excluir}><Trash2 size={15} /> Excluir</Button>}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>{leitura ? "Fechar" : "Cancelar"}</Button>
          {!leitura && <Button disabled={ocupado}>{novo ? "Criar oportunidade" : "Salvar"}</Button>}
        </div>
      </form>
    </Modal>
  );
}

/** O que aconteceu na oportunidade, do mais novo para o mais antigo. */
function Historico({ eventos }: { eventos: EventoOp[] }) {
  if (!eventos.length) return <p className="text-sm text-slate-500">Nada ainda.</p>;
  const frase = (e: EventoOp) => {
    switch (e.tipo) {
      case "criada": return `Criada em "${rotuloEtapa(e.para)}"`;
      case "etapa": return `${rotuloEtapa(e.de)} → ${rotuloEtapa(e.para)}${e.texto ? ` (${e.texto})` : ""}`;
      case "valor": return `Valor: ${e.de ? brl(Number(e.de)) : "sem valor"} → ${e.para ? brl(Number(e.para)) : "sem valor"}`;
      case "vendedor": return `Responsável: ${e.de ?? "ninguém"} → ${e.para ?? "ninguém"}`;
      case "pedido": return e.para ? `Ligada ao pedido ${e.para}` : `Desligada do pedido ${e.de ?? ""}`;
      default: return e.texto ?? "";
    }
  };
  return (
    <ol className="space-y-2">
      {[...eventos].reverse().map((e) => (
        <li key={e.id} className={`rounded-lg px-2.5 py-1.5 text-sm ${e.tipo === "nota" ? "bg-amber-50 text-fg" : "bg-slate-50 text-slate-700"}`}>
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{frase(e)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{new Date(e.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{e.por_nome ? ` · ${e.por_nome}` : ""}</p>
        </li>
      ))}
    </ol>
  );
}

/** Métricas do funil no período (oportunidades criadas nele). */
function Metricas({ ops, eventos, nomeVendedor }: { ops: Oportunidade[]; eventos: EventoOp[]; nomeVendedor: (id: string | null) => string }) {
  const [atalho, setAtalho] = useState<Atalho | "tudo">("semana");
  const doPeriodo = atalho === "tudo" ? ops : ops.filter((o) => noPeriodo(o.created_at, periodoDoAtalho(atalho, hoje())));
  const m = useMemo(() => metricasOp(doPeriodo, eventos, nomeVendedor), [doPeriodo, eventos]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR")}%`);
  const Cartao = ({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) => (
    <div className="rounded-xl border border-slate-200 bg-surface p-3 shadow-card">
      <p className="text-xs font-semibold text-slate-600">{rotulo}</p>
      <p className="num mt-1 text-2xl font-bold text-fg">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Oportunidades criadas em
        <select className="input w-auto" value={atalho} onChange={(e) => setAtalho(e.target.value as Atalho | "tudo")}>
          {ATALHOS.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
          <option value="tudo">Todo o período</option>
        </select>
      </label>
      {!m.total ? <Vazio titulo="Nenhuma oportunidade criada neste período." texto="Escolha um período maior para ver as métricas." /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao rotulo="Valor no funil" valor={brl(m.valorFunil)} sub={`${m.funil.reduce((s, f) => s + f.quantidade, 0)} em aberto`} />
            <Cartao rotulo="Taxa de ganho" valor={pct(m.taxaGanho)} sub={`${m.ganhas} ${pl(m.ganhas, "ganha", "ganhas")} · ${m.perdidas} ${pl(m.perdidas, "perdida", "perdidas")}`} />
            <Cartao rotulo="Valor ganho" valor={brl(m.valorGanho)} />
            <Cartao rotulo="Tempo até fechar" valor={m.diasAteFechar == null ? "—" : `${m.diasAteFechar.toLocaleString("pt-BR")} dias`} sub="em média, do contato ao ganho ou perda" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-surface p-3 shadow-card">
              <h3 className="mb-2 text-sm font-bold text-fg">Conversão de uma etapa para a seguinte</h3>
              <ul className="space-y-2">
                {m.conversao.map((c) => (
                  <li key={c.de} className="text-sm">
                    <div className="flex justify-between gap-2"><span>{rotuloEtapa(c.de)} → {rotuloEtapa(c.para)}</span><b className="num">{pct(c.taxa)}</b></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${c.taxa ?? 0}%` }} /></div>
                    <p className="mt-0.5 text-xs text-slate-500">{c.seguiram} de {c.chegaram}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border border-slate-200 bg-surface p-3 shadow-card">
              <h3 className="mb-2 text-sm font-bold text-fg">Tempo médio em cada etapa</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {m.tempoMedio.map((t) => (
                  <li key={t.etapa} className="flex justify-between gap-2 py-1.5">
                    <span>{rotuloEtapa(t.etapa)}</span>
                    <span className="num">{t.dias == null ? "—" : `${t.dias.toLocaleString("pt-BR")} dias`} <span className="text-xs text-slate-500">({t.oportunidades})</span></span>
                  </li>
                ))}
              </ul>
              <h3 className="mb-2 mt-4 text-sm font-bold text-fg">No funil agora</h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {m.funil.map((f) => (
                  <li key={f.etapa} className="flex justify-between gap-2 py-1.5"><span>{rotuloEtapa(f.etapa)} ({f.quantidade})</span><span className="num">{brl(f.valor)}</span></li>
                ))}
              </ul>
            </section>
          </div>
          <section className="rounded-xl border border-slate-200 bg-surface p-3 shadow-card">
            <h3 className="mb-2 text-sm font-bold text-fg">Por responsável</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-2">Responsável</th><th className="py-1 pr-2 text-right">Total</th><th className="py-1 pr-2 text-right">Abertas</th><th className="py-1 pr-2 text-right">Ganhas</th><th className="py-1 pr-2 text-right">Perdidas</th><th className="py-1 pr-2 text-right">Taxa de ganho</th><th className="py-1 text-right">Valor ganho</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {m.porVendedor.map((v) => (
                    <tr key={v.vendedor}><td className="py-1.5 pr-2">{v.vendedor}</td><td className="num py-1.5 pr-2 text-right">{v.total}</td><td className="num py-1.5 pr-2 text-right">{v.abertas}</td>
                      <td className="num py-1.5 pr-2 text-right">{v.ganhas}</td><td className="num py-1.5 pr-2 text-right">{v.perdidas}</td><td className="num py-1.5 pr-2 text-right">{pct(v.taxa)}</td><td className="num py-1.5 text-right">{brl(v.valorGanho)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-surface p-3 shadow-card">
            <h3 className="mb-2 text-sm font-bold text-fg">Por que não fechou</h3>
            {!m.motivos.length ? <p className="text-sm text-slate-500">Nenhuma perdida no período.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {m.motivos.map((x) => <li key={x.motivo} className="flex justify-between gap-2 py-1.5"><span>{x.motivo}</span><span className="num">{x.quantidade}</span></li>)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
