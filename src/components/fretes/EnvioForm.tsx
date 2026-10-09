// Envio: os dados padronizados da cotação (origem/destino, volumes, valor e seguro, equipamento e restrições,
// prazo e modalidade, quem paga e a que se liga), as cotações com aprovação, o transporte até o comprovante
// de entrega, o frete final e as ocorrências.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCopy, MessageCircle, PackageCheck, Plus, Search, Send, Trash2, Truck, X } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { buscarCep } from "@/lib/cep";
import type { Transportadora } from "@/lib/types";
import {
  MODALIDADES, PAGADORES, RESTRICOES, STATUS_ENVIO, TIPOS_OCORRENCIA, faltandoParaCotar, mensagemCotacao, totaisCarga,
  type CotacaoEnvio, type Envio, type OcorrenciaEnvio, type Volume,
} from "@/lib/fretes";

export type Embalagem = { id: string; descricao: string; tipo: string; largura_cm: number | null; altura_cm: number | null; comprimento_cm: number | null; peso_kg: number | null; ativo: boolean };

// colunas que o formulário grava (o resto é calculado pelo banco ou vem das ações)
const CAMPOS = [
  "pedido_id", "cliente_id", "unidade_id", "vendedor_id", "cep_origem", "cidade_origem", "uf_origem", "cep_destino", "cidade_destino", "uf_destino",
  "endereco_destino", "volumes", "valor_mercadoria", "seguro", "tipo_equipamento", "restricoes", "restricoes_obs", "prazo_desejado", "modalidade",
  "pagador", "centro_custo_id", "coleta_prevista", "coletado_em", "codigo_rastreio", "entrega_prevista", "entregue_em", "comprovante_em",
  "valor_final", "cte_numero", "observacoes", "transportadora_id", "transportadora_nome",
] as const;

const num = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
const vazio = (v: unknown) => v === "" || v === undefined ? null : v;

export function EnvioForm({ envioId, inicial, onClose }: { envioId?: string | null; inicial?: Partial<Envio>; onClose: () => void }) {
  const { pode } = usePerfil();
  const podeEditar = pode("cotar_frete") || pode("editar_financeiro");
  const invalidar = useInvalidate();
  const { unidades, padrao } = useUnidade();
  const [id, setId] = useState<string | null>(envioId ?? null);
  const [e, setE] = useState<Partial<Envio>>(() => ({
    status: "cotacao", volumes: [{ quantidade: 1 }], restricoes: [], seguro: true, modalidade: "cif", pagador: "empresa", valor_mercadoria: 0, ...inicial,
  }));
  const [ocupado, setOcupado] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const carregado = useQuery({
    queryKey: ["envios", "um", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("envios").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Envio;
    },
  });
  useEffect(() => { if (carregado.data) setE(carregado.data); }, [carregado.data]);

  const { data: transportadoras = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { data: embalagens = [] } = useRows<Embalagem>("embalagens", { order: "descricao", ascending: true });
  const { data: centros = [] } = useRows<{ id: string; nome: string; ativo?: boolean }>("centros_custo", { order: "nome", ascending: true });
  const { data: tiposExistentes = [] } = useRows<{ tipo_equipamento: string | null }>("envios", { select: "tipo_equipamento", order: "tipo_equipamento", ascending: true, key: ["tipos"] });
  const { data: maquinas = [] } = useRows<{ descricao: string; tipo: string }>("produtos", { select: "descricao, tipo", order: "descricao", ascending: true, key: ["maquinas"] });
  const pedido = useQuery({
    queryKey: ["pedidos", "envio", e.pedido_id],
    enabled: !!e.pedido_id,
    queryFn: async () => (await supabase.from("pedidos").select("id, numero, status, cliente:clientes(nome, nome_fantasia, whatsapp)").eq("id", e.pedido_id!).maybeSingle()).data as
      { id: string; numero: number; status: string; cliente: { nome: string; nome_fantasia: string | null; whatsapp: string | null } | null } | null,
  });

  const set = (patch: Partial<Envio>) => setE((x) => ({ ...x, ...patch }));
  const volumes = (e.volumes ?? []) as Volume[];
  const setVol = (i: number, patch: Partial<Volume>) => set({ volumes: volumes.map((v, k) => (k === i ? { ...v, ...patch } : v)) });
  const t = totaisCarga(volumes);
  const falta = faltandoParaCotar(e);
  const status = (e.status ?? "cotacao") as Envio["status"];
  const fechado = status === "entregue" || status === "cancelado";
  const nomeTransp = transportadoras.find((x) => x.id === e.transportadora_id)?.nome ?? e.transportadora_nome;
  const sugestoesEquip = useMemo(() => [...new Set([
    ...tiposExistentes.map((x) => x.tipo_equipamento).filter(Boolean) as string[],
    ...maquinas.filter((p) => p.tipo === "maquina").map((p) => p.descricao),
    "Peças e acessórios",
  ])], [tiposExistentes, maquinas]);

  function origemDaUnidade(uid: string) {
    const u = unidades.find((x) => x.id === uid);
    set({ unidade_id: uid, cep_origem: u?.cep ?? e.cep_origem, cidade_origem: u?.municipio ?? e.cidade_origem, uf_origem: u?.uf ?? e.uf_origem });
  }
  useEffect(() => {
    // envio novo sem pedido: a origem vem da unidade padrão
    if (!id && !e.cep_origem && padrao) origemDaUnidade(padrao);
  }, [padrao, unidades.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cepDestino(forcar = false) {
    const cep = String(e.cep_destino ?? "").replace(/\D/g, "");
    if (cep.length !== 8 || (!forcar && e.cidade_destino)) return;
    setBuscandoCep(true);
    const r = await buscarCep(cep);
    setBuscandoCep(false);
    if (!r) return forcar ? notify("CEP não encontrado", "erro") : undefined;
    set({ cidade_destino: r.municipio, uf_destino: r.uf, endereco_destino: e.endereco_destino || [r.logradouro, r.bairro].filter(Boolean).join(", ") || null });
  }

  async function salvar(ev?: FormEvent) {
    ev?.preventDefault();
    setOcupado(true);
    try {
      const dados: Record<string, unknown> = {};
      for (const k of CAMPOS) dados[k] = vazio((e as Record<string, unknown>)[k]);
      dados.volumes = volumes.filter((v) => Number(v.quantidade) > 0).map((v) => ({
        ...v, quantidade: Number(v.quantidade), largura_cm: num(v.largura_cm), altura_cm: num(v.altura_cm), comprimento_cm: num(v.comprimento_cm), peso_kg: num(v.peso_kg),
      }));
      dados.valor_mercadoria = num(e.valor_mercadoria) ?? 0;
      dados.valor_final = num(e.valor_final);
      dados.restricoes = e.restricoes ?? [];
      dados.seguro = !!e.seguro;
      const r = id
        ? await supabase.from("envios").update(dados).eq("id", id).select("*").single()
        : await supabase.from("envios").insert({ ...dados, unidade_id: dados.unidade_id ?? padrao }).select("*").single();
      if (r.error) throw r.error;
      setId(r.data.id);
      setE(r.data as Envio);
      notify(id ? "Envio salvo" : `Envio #${r.data.numero} criado`);
      invalidar("envios", "pedidos");
    } catch (err) {
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }

  async function cancelarEnvio() {
    if (!id || !confirm("Cancelar este envio? Ele sai do painel (o histórico fica).")) return;
    const { error } = await supabase.from("envios").update({ status: "cancelado" }).eq("id", id);
    if (error) return notifyError(error);
    notify("Envio cancelado");
    invalidar("envios");
    carregado.refetch();
  }

  async function darBaixaPedido() {
    if (!e.pedido_id) return;
    const { error } = await supabase.from("pedidos").update({ status: "entregue" }).eq("id", e.pedido_id);
    if (error) return notifyError(error);
    notify(`Pedido #${pedido.data?.numero ?? ""} marcado como entregue`);
    invalidar("pedidos", "envios");
    pedido.refetch();
  }

  const titulo = id ? `Envio #${e.numero ?? ""}` : "Novo envio";
  const cliente = pedido.data?.cliente;
  const msgCliente = [
    `Olá ${(cliente?.nome_fantasia || cliente?.nome || "").split(" ")[0]}! Seu pedido #${pedido.data?.numero ?? ""} da *MF Máquinas* foi despachado.`,
    nomeTransp ? `Transportadora: ${nomeTransp}` : "",
    e.codigo_rastreio ? `Código de rastreio: ${e.codigo_rastreio}` : "",
    e.entrega_prevista ? `Entrega prevista: ${dataBR(e.entrega_prevista)}` : "",
    `Qualquer dúvida, é só chamar!`,
  ].filter(Boolean).join("\n");

  return (
    <Modal open wide onClose={onClose} title={titulo}>
      <form onSubmit={salvar} className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_ENVIO[status].cor}`}>{STATUS_ENVIO[status].rotulo}</span>
          {pedido.data && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Pedido #{pedido.data.numero} · {pedido.data.cliente?.nome_fantasia || pedido.data.cliente?.nome} · {pedido.data.status}</span>}
          {nomeTransp && <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800"><Truck size={13} /> {nomeTransp}{e.valor_aprovado != null ? ` · aprovado ${brl(e.valor_aprovado)}` : ""}</span>}
          {id && podeEditar && !fechado && <Button type="button" variant="ghost" className="ml-auto !text-red-600" onClick={cancelarEnvio}><X size={15} /> Cancelar envio</Button>}
        </div>

        {falta.length > 0 && !fechado && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div><b>Para pedir a cotação falta:</b> {falta.join(", ")}.</div>
          </div>
        )}

        <fieldset disabled={!podeEditar} className="space-y-4">
          <Secao n={1} titulo="Origem e destino">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              {unidades.length > 1 && (
                <Field label="Sai de" className="col-span-2">
                  <select className="input" value={e.unidade_id ?? ""} onChange={(x) => origemDaUnidade(x.target.value)}>
                    <option value="">—</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </Field>
              )}
              <Field label="CEP de origem"><input className="input" inputMode="numeric" value={e.cep_origem ?? ""} onChange={(x) => set({ cep_origem: x.target.value })} /></Field>
              <Field label="Cidade/UF origem" className={unidades.length > 1 ? "col-span-2 sm:col-span-3" : "col-span-1 sm:col-span-5"}>
                <input className="input" value={[e.cidade_origem, e.uf_origem].filter(Boolean).join("/")} readOnly />
              </Field>
              <Field label="CEP de destino">
                <div className="flex gap-1">
                  <input className="input" inputMode="numeric" value={e.cep_destino ?? ""} onChange={(x) => set({ cep_destino: x.target.value, cidade_destino: null, uf_destino: null })} onBlur={() => cepDestino()} />
                  <Button type="button" variant="ghost" title="Buscar o CEP" onClick={() => cepDestino(true)}><Search size={15} className={buscandoCep ? "animate-pulse" : ""} /></Button>
                </div>
              </Field>
              <Field label="Cidade de destino" className="sm:col-span-2"><input className="input" value={e.cidade_destino ?? ""} onChange={(x) => set({ cidade_destino: x.target.value })} /></Field>
              <Field label="UF"><input className="input" maxLength={2} value={e.uf_destino ?? ""} onChange={(x) => set({ uf_destino: x.target.value.toUpperCase() })} /></Field>
              <Field label="Endereço de entrega" className="col-span-2"><input className="input" value={e.endereco_destino ?? ""} onChange={(x) => set({ endereco_destino: x.target.value })} /></Field>
            </div>
          </Secao>

          <Secao n={2} titulo="Peso, dimensões e volumes">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="text-left text-xs text-slate-500">
                  <th className="py-1 pr-2">Embalagem</th><th className="py-1 pr-2">Descrição</th><th className="w-16 py-1 pr-2">Qtd</th>
                  <th className="w-20 py-1 pr-2">Larg. cm</th><th className="w-20 py-1 pr-2">Alt. cm</th><th className="w-20 py-1 pr-2">Comp. cm</th><th className="w-24 py-1 pr-2">Peso kg (cada)</th><th className="w-8" />
                </tr></thead>
                <tbody>
                  {volumes.map((v, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <select className="input" value={v.embalagem_id ?? ""} onChange={(x) => {
                          const emb = embalagens.find((m) => m.id === x.target.value);
                          setVol(i, emb ? { embalagem_id: emb.id, descricao: v.descricao || emb.descricao, largura_cm: emb.largura_cm, altura_cm: emb.altura_cm, comprimento_cm: emb.comprimento_cm, peso_kg: v.peso_kg || emb.peso_kg } : { embalagem_id: null });
                        }}>
                          <option value="">—</option>{embalagens.filter((m) => m.ativo || m.id === v.embalagem_id).map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-2"><input className="input" value={v.descricao ?? ""} onChange={(x) => setVol(i, { descricao: x.target.value })} /></td>
                      <td className="py-1 pr-2"><input className="input" inputMode="numeric" value={v.quantidade ?? ""} onChange={(x) => setVol(i, { quantidade: Number(x.target.value) || 0 })} /></td>
                      <td className="py-1 pr-2"><input className="input" inputMode="decimal" value={v.largura_cm ?? ""} onChange={(x) => setVol(i, { largura_cm: x.target.value as unknown as number })} /></td>
                      <td className="py-1 pr-2"><input className="input" inputMode="decimal" value={v.altura_cm ?? ""} onChange={(x) => setVol(i, { altura_cm: x.target.value as unknown as number })} /></td>
                      <td className="py-1 pr-2"><input className="input" inputMode="decimal" value={v.comprimento_cm ?? ""} onChange={(x) => setVol(i, { comprimento_cm: x.target.value as unknown as number })} /></td>
                      <td className="py-1 pr-2"><input className="input" inputMode="decimal" value={v.peso_kg ?? ""} onChange={(x) => setVol(i, { peso_kg: x.target.value as unknown as number })} /></td>
                      <td className="py-1"><Button type="button" variant="ghost" aria-label="Tirar volume" onClick={() => set({ volumes: volumes.filter((_, k) => k !== i) })}><Trash2 size={14} /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => set({ volumes: [...volumes, { quantidade: 1 }] })}><Plus size={15} /> Volume</Button>
              <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span><b className="text-fg">{t.qtd}</b> volume(s)</span>
                <span>peso real <b className="text-fg">{t.peso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</b></span>
                <span>cubagem <b className="text-fg">{t.cubagem.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³</b></span>
                <span title="Rodoviário: 300 kg por m³. A transportadora cobra pelo maior.">peso cubado <b className="text-fg">{t.pesoCubado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</b></span>
                <span className={t.pesoCubado > t.peso ? "font-semibold text-amber-700" : ""}>peso taxado <b>{t.pesoTaxado.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</b></span>
              </div>
            </div>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-2">
            <Secao n={3} titulo="Valor da mercadoria e seguro">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor da mercadoria (R$)"><input className="input" inputMode="decimal" value={e.valor_mercadoria ?? ""} onChange={(x) => set({ valor_mercadoria: x.target.value as unknown as number })} /></Field>
                <label className="mt-6 flex items-center gap-2"><input type="checkbox" checked={!!e.seguro} onChange={(x) => set({ seguro: x.target.checked })} /> Precisa de seguro</label>
              </div>
            </Secao>
            <Secao n={5} titulo="Prazo e modalidade combinados com o cliente">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entregar até"><input className="input" type="date" value={e.prazo_desejado ?? ""} onChange={(x) => set({ prazo_desejado: x.target.value })} /></Field>
                <Field label="Modalidade do frete">
                  <select className="input" value={e.modalidade ?? "cif"} onChange={(x) => set({ modalidade: x.target.value, pagador: x.target.value === "fob" || x.target.value === "retira" ? "cliente" : x.target.value === "terceiros" ? "terceiro" : "empresa" })}>
                    {MODALIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                </Field>
              </div>
            </Secao>
          </div>

          <Secao n={4} titulo="Equipamento, embalagem e restrições de carga e descarga">
            <Field label="Tipo de equipamento">
              <input className="input" list="tipos-equipamento" value={e.tipo_equipamento ?? ""} onChange={(x) => set({ tipo_equipamento: x.target.value })} placeholder="Ex.: Máquina de sorvete expresso MF-300" />
              <datalist id="tipos-equipamento">{sugestoesEquip.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
              {RESTRICOES.map(([k, r]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={(e.restricoes ?? []).includes(k)}
                    onChange={(x) => set({ restricoes: x.target.checked ? [...(e.restricoes ?? []), k] : (e.restricoes ?? []).filter((y) => y !== k) })} /> {r}
                </label>
              ))}
            </div>
            <Field label="Outras restrições ou instruções" className="mt-3"><input className="input" value={e.restricoes_obs ?? ""} onChange={(x) => set({ restricoes_obs: x.target.value })} placeholder="Ex.: recebe só das 8h às 11h; portão de 2,5 m" /></Field>
          </Secao>

          <Secao n={6} titulo="Quem paga o frete e a que se liga">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Quem paga o frete">
                <select className="input" value={e.pagador ?? "empresa"} onChange={(x) => set({ pagador: x.target.value })}>
                  {PAGADORES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </Field>
              <Field label="Centro de custo">
                <select className="input" value={e.centro_custo_id ?? ""} onChange={(x) => set({ centro_custo_id: x.target.value || null })}>
                  <option value="">—</option>{centros.filter((c) => c.ativo !== false || c.id === e.centro_custo_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field label="Pedido relacionado"><input className="input" readOnly value={pedido.data ? `#${pedido.data.numero}` : "— (envio avulso)"} /></Field>
            </div>
            <Field label="Observações" className="mt-3"><textarea className="input" rows={2} value={e.observacoes ?? ""} onChange={(x) => set({ observacoes: x.target.value })} /></Field>
          </Secao>

          {id && (
            <Secao n={8} titulo="Transporte, entrega e frete final">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Coleta prevista"><input className="input" type="date" value={e.coleta_prevista ?? ""} onChange={(x) => set({ coleta_prevista: x.target.value })} /></Field>
                <Field label="Coletado em"><input className="input" type="date" value={e.coletado_em ?? ""} onChange={(x) => set({ coletado_em: x.target.value })} /></Field>
                <Field label="Código de rastreio" className="col-span-2"><input className="input" value={e.codigo_rastreio ?? ""} onChange={(x) => set({ codigo_rastreio: x.target.value })} /></Field>
                <Field label="Entrega prevista"><input className="input" type="date" value={e.entrega_prevista ?? ""} onChange={(x) => set({ entrega_prevista: x.target.value })} /></Field>
                <Field label="Entregue em"><input className="input" type="date" value={e.entregue_em ?? ""} onChange={(x) => set({ entregue_em: x.target.value })} /></Field>
                <Field label="Comprovante recebido em"><input className="input" type="date" value={e.comprovante_em ?? ""} onChange={(x) => set({ comprovante_em: x.target.value })} /></Field>
                <div className="flex items-end"><Button type="button" variant="secondary" disabled={!!e.comprovante_em} onClick={() => set({ comprovante_em: hoje() })}><PackageCheck size={15} /> Recebi hoje</Button></div>
                <Field label="Frete final cobrado (R$)"><input className="input" inputMode="decimal" value={e.valor_final ?? ""} onChange={(x) => set({ valor_final: x.target.value as unknown as number })} /></Field>
                <Field label="Nº do CT-e / fatura"><input className="input" value={e.cte_numero ?? ""} onChange={(x) => set({ cte_numero: x.target.value })} /></Field>
              </div>
              {e.valor_final != null && e.valor_aprovado != null && Number(e.valor_final) > Number(e.valor_aprovado) + 0.005 && (
                <p className="mt-2 flex items-center gap-1.5 font-semibold text-red-700"><AlertTriangle size={15} /> Frete final {brl(Number(e.valor_final))} está {brl(Number(e.valor_final) - Number(e.valor_aprovado))} acima do aprovado ({brl(e.valor_aprovado)}).</p>
              )}
            </Secao>
          )}
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          {status === "entregue" && pedido.data && !["entregue", "cancelado"].includes(pedido.data.status) && podeEditar && (
            <Button type="button" variant="secondary" onClick={darBaixaPedido}><CheckCircle2 size={15} /> Dar baixa no pedido #{pedido.data.numero}</Button>
          )}
          {cliente?.whatsapp && e.coletado_em && (
            <a href={whatsappLink(cliente.whatsapp, msgCliente)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><Send size={15} /> Avisar o cliente</a>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          {podeEditar && <Button disabled={ocupado}>{ocupado ? "Salvando…" : id ? "Salvar" : "Criar envio"}</Button>}
        </div>
      </form>

      {id && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 text-sm">
          <Cotacoes envio={{ ...e, id } as Envio} transportadoras={transportadoras} podeEditar={podeEditar && !fechado} pedidoOrcamento={pedido.data?.status === "orcamento"}
            onMudou={() => { carregado.refetch(); invalidar("envios", "pedidos"); }} />
          <Ocorrencias envioId={id} podeEditar={podeEditar} />
          <Anexos entidade="geral" id={id} titulo="Comprovante de entrega, CT-e e fotos" />
        </div>
      )}
    </Modal>
  );
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">{n}</span>{titulo}</h3>
      {children}
    </section>
  );
}

function Cotacoes({ envio, transportadoras, podeEditar, pedidoOrcamento, onMudou }: {
  envio: Envio; transportadoras: Transportadora[]; podeEditar: boolean; pedidoOrcamento: boolean; onMudou: () => void;
}) {
  const { data: cotacoes = [], refetch } = useQuery({
    queryKey: ["envio_cotacoes", envio.id],
    queryFn: async () => ((await supabase.from("envio_cotacoes").select("*").eq("envio_id", envio.id).order("valor", { ascending: true })).data ?? []) as CotacaoEnvio[],
  });
  const [nova, setNova] = useState<{ transportadora_id: string; transportadora_nome: string; valor: string; prazo_dias: string; validade: string; observacoes: string } | null>(null);
  const [cobrar, setCobrar] = useState(false);
  const ativas = cotacoes.filter((c) => c.ativa);
  const nome = (c: CotacaoEnvio) => transportadoras.find((x) => x.id === c.transportadora_id)?.nome ?? c.transportadora_nome ?? "—";
  const msg = mensagemCotacao(envio);
  const falta = faltandoParaCotar(envio);

  async function adicionar() {
    if (!nova || !nova.valor || (!nova.transportadora_id && !nova.transportadora_nome.trim())) return notify("Informe a transportadora e o valor", "erro");
    const { error } = await supabase.from("envio_cotacoes").insert({
      envio_id: envio.id, transportadora_id: nova.transportadora_id || null, transportadora_nome: nova.transportadora_id ? null : nova.transportadora_nome.trim(),
      valor: Number(nova.valor.replace(",", ".")), prazo_dias: nova.prazo_dias ? Number(nova.prazo_dias) : null, validade: nova.validade || null, observacoes: nova.observacoes || null,
    });
    if (error) return notifyError(error);
    setNova(null);
    refetch();
    onMudou();
  }
  async function aprovar(c: CotacaoEnvio) {
    const { error } = await supabase.rpc("aprovar_cotacao_envio", { p_cotacao: c.id, p_cobrar_cliente: cobrar });
    if (error) return notifyError(error);
    notify(`Frete aprovado: ${nome(c)}, ${brl(c.valor)}`);
    refetch();
    onMudou();
  }
  async function remover(c: CotacaoEnvio) {
    const { error } = await supabase.from("envio_cotacoes").update({ ativa: false }).eq("id", c.id);
    if (error) return notifyError(error);
    refetch();
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">7</span>Cotações e aprovação</h3>
      {podeEditar && (
        <div className="mb-3 rounded-xl bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Pedir cotação com os dados padronizados:</span>
            <Button type="button" variant="ghost" onClick={() => navigator.clipboard?.writeText(msg).then(() => notify("Mensagem copiada"))}><ClipboardCopy size={14} /> Copiar mensagem</Button>
          </div>
          {falta.length > 0 && <p className="mb-2 text-xs text-amber-800">Salve antes os dados que faltam ({falta.join(", ")}) para a cotação sair completa.</p>}
          <div className="flex flex-wrap gap-2">
            {transportadoras.filter((x) => x.ativo && x.whatsapp).map((x) => (
              <a key={x.id} href={whatsappLink(x.whatsapp, msg)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><MessageCircle size={14} /> {x.nome}</a>
            ))}
            {!transportadoras.some((x) => x.ativo && x.whatsapp) && <span className="text-xs text-slate-500">Cadastre o WhatsApp das transportadoras em Cadastros → Transportadoras.</span>}
          </div>
        </div>
      )}
      {pedidoOrcamento && podeEditar && (
        <label className="mb-2 flex items-center gap-2 text-slate-600"><input type="checkbox" checked={cobrar} onChange={(x) => setCobrar(x.target.checked)} /> Ao aprovar, cobrar o frete do cliente no pedido</label>
      )}
      <div className="space-y-2">
        {ativas.map((c, k) => (
          <div key={c.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${c.escolhida ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
            <Truck size={18} className="text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-fg">{nome(c)} {k === 0 && ativas.length > 1 && <span className="ml-1 text-xs font-semibold text-emerald-700">menor preço</span>}</div>
              <div className="text-xs text-slate-500">{c.prazo_dias != null ? `${c.prazo_dias} dia(s) úteis` : "prazo não informado"}{c.validade ? ` · válida até ${dataBR(c.validade)}` : ""}{c.observacoes ? ` · ${c.observacoes}` : ""}</div>
            </div>
            <span className="num text-lg font-bold text-fg">{brl(c.valor)}</span>
            {c.escolhida ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">aprovada</span>
              : podeEditar && <Button type="button" variant="secondary" onClick={() => aprovar(c)}><CheckCircle2 size={15} /> Aprovar</Button>}
            {podeEditar && !c.escolhida && <Button type="button" variant="ghost" aria-label="Tirar cotação" onClick={() => remover(c)}><Trash2 size={15} /></Button>}
          </div>
        ))}
        {!ativas.length && !nova && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-slate-500">Nenhuma cotação ainda. Peça às transportadoras e registre aqui o valor e o prazo.</p>}
      </div>
      {podeEditar && (nova ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-6">
          <Field label="Transportadora" className="col-span-2">
            <select className="input" value={nova.transportadora_id} onChange={(x) => setNova({ ...nova, transportadora_id: x.target.value })}>
              <option value="">Outra (digitar)</option>{transportadoras.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </Field>
          {!nova.transportadora_id && <Field label="Nome"><input className="input" placeholder="ex.: Correios" value={nova.transportadora_nome} onChange={(x) => setNova({ ...nova, transportadora_nome: x.target.value })} /></Field>}
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={nova.valor} onChange={(x) => setNova({ ...nova, valor: x.target.value })} /></Field>
          <Field label="Prazo (dias úteis)"><input className="input" inputMode="numeric" value={nova.prazo_dias} onChange={(x) => setNova({ ...nova, prazo_dias: x.target.value })} /></Field>
          <Field label="Válida até"><input className="input" type="date" value={nova.validade} onChange={(x) => setNova({ ...nova, validade: x.target.value })} /></Field>
          <Field label="Observação" className="col-span-2 sm:col-span-5"><input className="input" placeholder="ex.: coleta amanhã, seguro incluso, veículo com plataforma" value={nova.observacoes} onChange={(x) => setNova({ ...nova, observacoes: x.target.value })} /></Field>
          <div className="col-span-2 flex items-end justify-end gap-2 sm:col-span-1">
            <Button type="button" variant="ghost" onClick={() => setNova(null)}>Cancelar</Button>
            <Button type="button" onClick={adicionar}>Salvar</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setNova({ transportadora_id: "", transportadora_nome: "", valor: "", prazo_dias: "", validade: "", observacoes: "" })}>
          <Plus size={15} /> Registrar cotação
        </Button>
      ))}
    </section>
  );
}

function Ocorrencias({ envioId, podeEditar }: { envioId: string; podeEditar: boolean }) {
  const invalidar = useInvalidate();
  const { data: lista = [], refetch } = useQuery({
    queryKey: ["envio_ocorrencias", envioId],
    queryFn: async () => ((await supabase.from("envio_ocorrencias").select("*").eq("envio_id", envioId).order("created_at", { ascending: false })).data ?? []) as OcorrenciaEnvio[],
  });
  const [nova, setNova] = useState<{ tipo: string; descricao: string; responsavel: string } | null>(null);
  const [editando, setEditando] = useState<Record<string, { responsavel: string; andamento: string }>>({});

  async function registrar() {
    if (!nova || nova.descricao.trim().length < 3) return notify("Descreva a ocorrência", "erro");
    const { error } = await supabase.from("envio_ocorrencias").insert({ envio_id: envioId, tipo: nova.tipo, descricao: nova.descricao.trim(), responsavel: nova.responsavel.trim() || null });
    if (error) return notifyError(error);
    setNova(null);
    refetch();
    invalidar("envio_ocorrencias");
  }
  async function atualizar(o: OcorrenciaEnvio, patch: Partial<OcorrenciaEnvio>) {
    const { error } = await supabase.from("envio_ocorrencias").update(patch).eq("id", o.id);
    if (error) return notifyError(error);
    notify(patch.status === "resolvida" ? "Ocorrência resolvida" : "Ocorrência atualizada");
    setEditando((x) => { const y = { ...x }; delete y[o.id]; return y; });
    refetch();
    invalidar("envio_ocorrencias");
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">9</span>Ocorrências</h3>
      <div className="space-y-2">
        {lista.map((o) => {
          const ed = editando[o.id];
          return (
            <div key={o.id} className={`rounded-xl border p-3 ${o.status === "aberta" ? "border-amber-200 bg-amber-50/60" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <b>{TIPOS_OCORRENCIA.find(([k]) => k === o.tipo)?.[1] ?? o.tipo}</b>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === "aberta" ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{o.status}</span>
                <span className="text-xs text-slate-500">aberta em {dataBR(o.created_at)} · atualizada em {dataBR(o.atualizado_em)}{o.responsavel ? ` · responsável: ${o.responsavel}` : " · sem responsável"}</span>
              </div>
              <p className="mt-1">{o.descricao}</p>
              {o.andamento && <p className="mt-1 text-slate-600"><b>Andamento:</b> {o.andamento}</p>}
              {podeEditar && o.status === "aberta" && (ed ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input className="input" placeholder="Responsável" value={ed.responsavel} onChange={(x) => setEditando({ ...editando, [o.id]: { ...ed, responsavel: x.target.value } })} />
                  <input className="input sm:col-span-2" placeholder="Andamento (o que foi feito)" value={ed.andamento} onChange={(x) => setEditando({ ...editando, [o.id]: { ...ed, andamento: x.target.value } })} />
                  <Button type="button" variant="secondary" onClick={() => atualizar(o, { responsavel: ed.responsavel.trim() || null, andamento: ed.andamento.trim() || null })}>Salvar</Button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditando({ ...editando, [o.id]: { responsavel: o.responsavel ?? "", andamento: o.andamento ?? "" } })}>Atualizar</Button>
                  <Button type="button" variant="secondary" onClick={() => atualizar(o, { status: "resolvida" })}><CheckCircle2 size={14} /> Resolvida</Button>
                </div>
              ))}
            </div>
          );
        })}
        {!lista.length && !nova && <p className="text-slate-500">Nenhuma ocorrência.</p>}
      </div>
      {podeEditar && (nova ? (
        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
          <select className="input" value={nova.tipo} onChange={(x) => setNova({ ...nova, tipo: x.target.value })}>
            {TIPOS_OCORRENCIA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <input className="input sm:col-span-2" placeholder="O que aconteceu" value={nova.descricao} onChange={(x) => setNova({ ...nova, descricao: x.target.value })} />
          <input className="input" placeholder="Responsável" value={nova.responsavel} onChange={(x) => setNova({ ...nova, responsavel: x.target.value })} />
          <div className="flex justify-end gap-2 sm:col-span-4">
            <Button type="button" variant="ghost" onClick={() => setNova(null)}>Cancelar</Button>
            <Button type="button" onClick={registrar}>Registrar</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="mt-2" onClick={() => setNova({ tipo: "atraso", descricao: "", responsavel: "" })}><Plus size={15} /> Registrar ocorrência</Button>
      ))}
    </section>
  );
}
