// Envio: os dados padronizados da cotação (origem/destino, volumes da carga embalada, valor e seguro, equipamento
// e restrições, prazo e modalidade, quem paga e quanto se cobra do cliente), as cotações com adicionais, serviço,
// validade e versão da tabela, a decisão (justificada quando não é a mais barata), a execução até a prova de
// entrega, o fechamento (cotado, aprovado, cobrado, faturado, conferido e pago) e as ocorrências.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, BadgeCheck, CheckCircle2, CircleDollarSign, ClipboardCopy, History, MessageCircle, PackageCheck, Plus, Printer, Ruler, Search, Send,
  Trash2, Truck, X,
} from "lucide-react";
import { Badge, Button, Field, Modal } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, somarDias, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { buscarCep } from "@/lib/cep";
import type { Transportadora } from "@/lib/types";
import {
  MODALIDADES, PAGADORES, RESTRICOES, STATUS_ENVIO, TIPOS_ADICIONAL, TIPOS_EXCECAO, TIPOS_OCORRENCIA, TIPOS_SERVICO,
  analisarAprovacao, cotacaoVencida, diferencaFrete, ehMaquina, faltandoParaCotar, maisBarataValida, mensagemCotacao, rotuloAdicional, rotuloServico,
  totaisCarga, totalCotacao, volumesIncompletos,
  type CotacaoEnvio, type Envio, type ExcecaoEnvio, type OcorrenciaEnvio, type Volume,
} from "@/lib/fretes";

export type Embalagem = { id: string; descricao: string; tipo: string; largura_cm: number | null; altura_cm: number | null; comprimento_cm: number | null; peso_kg: number | null; ativo: boolean };

// colunas que o formulário grava (o resto é calculado pelo banco ou vem das ações)
const CAMPOS = [
  "pedido_id", "cliente_id", "unidade_id", "vendedor_id", "cep_origem", "cidade_origem", "uf_origem", "cep_destino", "cidade_destino", "uf_destino",
  "endereco_destino", "volumes", "valor_mercadoria", "seguro", "tipo_equipamento", "restricoes", "restricoes_obs", "prazo_desejado", "modalidade",
  "pagador", "centro_custo_id", "coleta_prevista", "coletado_em", "codigo_rastreio", "entrega_prevista", "entregue_em", "comprovante_em",
  "valor_final", "cte_numero", "observacoes", "transportadora_id", "transportadora_nome", "valor_cobrado_cliente", "sem_comprovante_motivo", "conferencia_obs",
] as const;

const num = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
const vazio = (v: unknown) => v === "" || v === undefined ? null : v;
const pctTxt = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const dataHora = (v?: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const semMedida = (v: Volume, k: "largura_cm" | "altura_cm" | "comprimento_cm" | "peso_kg") => (v.quantidade ?? 1) > 0 && !(Number(String(v[k] ?? "").replace(",", ".")) > 0);

type Usuarios = (u?: string | null) => string;

export function EnvioForm({ envioId, inicial, novaOcorrencia, onClose }: { envioId?: string | null; inicial?: Partial<Envio>; novaOcorrencia?: boolean; onClose: () => void }) {
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
  const [motivoTroca, setMotivoTroca] = useState("");
  const etiquetas = useEtiquetas();

  const carregado = useQuery({
    queryKey: ["envios", "um", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("envios").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Envio;
    },
  });
  useEffect(() => { if (carregado.data) { setE(carregado.data); setMotivoTroca(""); } }, [carregado.data]);
  const salvo = carregado.data;

  const { data: transportadoras = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { data: embalagens = [] } = useRows<Embalagem>("embalagens", { order: "descricao", ascending: true });
  const { data: centros = [] } = useRows<{ id: string; nome: string; ativo?: boolean }>("centros_custo", { order: "nome", ascending: true });
  const { data: tiposExistentes = [] } = useRows<{ tipo_equipamento: string | null }>("envios", { select: "tipo_equipamento", order: "tipo_equipamento", ascending: true, key: ["tipos"] });
  const { data: maquinas = [] } = useRows<{ descricao: string; tipo: string }>("produtos", { select: "descricao, tipo", order: "descricao", ascending: true, key: ["maquinas"] });
  const { data: docs = [] } = useRows<{ entidade: string; entidade_id: string | null }>("documentos", {});
  const { data: usuarios = [] } = useRows<{ user_id: string; nome: string }>("usuarios_erp", { select: "user_id, nome", order: "nome", ascending: true, key: ["nomes"] });
  const nomeUsuario: Usuarios = (u) => usuarios.find((x) => x.user_id === u)?.nome ?? (u ? "usuário do ERP" : "—");
  const pedido = useQuery({
    queryKey: ["pedidos", "envio", e.pedido_id],
    enabled: !!e.pedido_id,
    queryFn: async () => (await supabase.from("pedidos").select("id, numero, status, frete, cliente:clientes(nome, nome_fantasia, whatsapp)").eq("id", e.pedido_id!).maybeSingle()).data as
      { id: string; numero: number; status: string; frete: number; cliente: { nome: string; nome_fantasia: string | null; whatsapp: string | null } | null } | null,
  });
  const conta = useQuery({
    queryKey: ["contas_pagar", "envio", salvo?.conta_pagar_id],
    enabled: !!salvo?.conta_pagar_id,
    queryFn: async () => (await supabase.from("contas_pagar").select("id, descricao, valor, vencimento, status, data_pagamento, valor_pago").eq("id", salvo!.conta_pagar_id!).maybeSingle()).data as
      { id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null } | null,
  });

  const set = (patch: Partial<Envio>) => setE((x) => ({ ...x, ...patch }));
  const volumes = (e.volumes ?? []) as Volume[];
  const setVol = (i: number, patch: Partial<Volume>) => set({ volumes: volumes.map((v, k) => (k === i ? { ...v, ...patch } : v)) });
  const t = totaisCarga(volumes);
  const falta = faltandoParaCotar(e);
  const status = (e.status ?? "cotacao") as Envio["status"];
  const fechado = status === "entregue" || status === "cancelado";
  const nomeTransp = transportadoras.find((x) => x.id === e.transportadora_id)?.nome ?? e.transportadora_nome;
  const maquina = ehMaquina(e);
  const temAnexo = !!id && docs.some((d) => d.entidade === "geral" && d.entidade_id === id);
  // trocar a transportadora depois da aprovação pede justificativa (o banco grava quem e quando)
  const trocouTransp = !!salvo?.aprovado_em && ((e.transportadora_id ?? null) !== (salvo.transportadora_id ?? null)
    || (!e.transportadora_id && (e.transportadora_nome ?? "").trim() !== (salvo.transportadora_nome ?? "").trim()));
  const semProva = !!e.entregue_em && !e.comprovante_em && !e.sem_comprovante_motivo?.trim() && !temAnexo;
  const dif = salvo ? diferencaFrete(salvo) : null;
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
    if (semProva) return notify("Para marcar como entregue: informe a data do comprovante, anexe o comprovante ou escreva por que não há comprovante", "erro");
    if (trocouTransp && motivoTroca.trim().length < 5) return notify(`O frete já foi aprovado com ${transportadoras.find((x) => x.id === salvo?.transportadora_id)?.nome ?? salvo?.transportadora_nome ?? "outra transportadora"}: escreva a justificativa da troca`, "erro");
    setOcupado(true);
    try {
      const dados: Record<string, unknown> = {};
      for (const k of CAMPOS) dados[k] = vazio((e as Record<string, unknown>)[k]);
      dados.volumes = volumes.filter((v) => Number(v.quantidade) > 0).map((v) => ({
        ...v, quantidade: Number(v.quantidade), largura_cm: num(v.largura_cm), altura_cm: num(v.altura_cm), comprimento_cm: num(v.comprimento_cm), peso_kg: num(v.peso_kg),
      }));
      dados.valor_mercadoria = num(e.valor_mercadoria) ?? 0;
      dados.valor_final = num(e.valor_final);
      dados.valor_cobrado_cliente = num(e.valor_cobrado_cliente);
      dados.restricoes = e.restricoes ?? [];
      dados.seguro = !!e.seguro;
      if (trocouTransp) dados.motivo_excecao = motivoTroca.trim();
      const r = id
        ? await supabase.from("envios").update(dados).eq("id", id).select("*").single()
        : await supabase.from("envios").insert({ ...dados, unidade_id: dados.unidade_id ?? padrao }).select("*").single();
      if (r.error) throw r.error;
      setId(r.data.id);
      setE(r.data as Envio);
      setMotivoTroca("");
      notify(id ? "Envio salvo" : `Envio #${r.data.numero} criado`);
      invalidar("envios", "pedidos", "envio_excecoes");
      if (id) carregado.refetch();
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
          {e.tipo_servico && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-800">{rotuloServico(e.tipo_servico)}</span>}
          {dif?.divergente && !salvo?.conferido_em && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800"><AlertTriangle size={13} /> frete divergente</span>}
          {id && podeEditar && !fechado && <Button type="button" variant="ghost" className="ml-auto !text-red-600" onClick={cancelarEnvio}><X size={15} /> Cancelar envio</Button>}
        </div>

        {falta.length > 0 && !fechado && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div><b>Para pedir a cotação falta:</b> {falta.join(", ")}.</div>
          </div>
        )}

        <fieldset disabled={!podeEditar} className="min-w-0 space-y-4">
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

          <Secao n={2} titulo="Peso, dimensões e volumes da carga embalada">
            {maquina ? (
              <div className="mb-2 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sky-900">
                <Ruler size={16} className="mt-0.5 shrink-0" />
                <span><b>Máquina:</b> informe as medidas e o peso da <b>carga embalada</b> (engradado ou caixa com a máquina dentro), não as do produto. É o que a transportadora mede e cobra.</span>
              </div>
            ) : <p className="mb-2 text-xs text-slate-500">Medidas e peso de cada volume já embalado. Sem as três medidas e o peso de todos os volumes, as cotações não são comparáveis.</p>}
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
                      {(["largura_cm", "altura_cm", "comprimento_cm", "peso_kg"] as const).map((k) => (
                        <td key={k} className="py-1 pr-2">
                          <input className={`input ${semMedida(v, k) ? "!border-red-500" : ""}`} inputMode="decimal" aria-label={k} value={v[k] ?? ""} onChange={(x) => setVol(i, { [k]: x.target.value as unknown as number })} />
                        </td>
                      ))}
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

          <Secao n={6} titulo="Quem paga, valor cobrado do cliente e a que se liga">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Quem paga o frete">
                <select className="input" value={e.pagador ?? "empresa"} onChange={(x) => set({ pagador: x.target.value })}>
                  {PAGADORES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </Field>
              <Field label="Valor cobrado do cliente (R$)">
                <input className="input" inputMode="decimal" value={e.valor_cobrado_cliente ?? ""} placeholder={pedido.data ? String(pedido.data.frete ?? 0) : "0,00"}
                  onChange={(x) => set({ valor_cobrado_cliente: x.target.value as unknown as number })} />
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
            <Secao n={8} titulo="Execução: transportadora, coleta, rastreio e entrega">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Transportadora" className="col-span-2">
                  <select className="input" value={e.transportadora_id ?? (e.transportadora_nome ? "__nome" : "")}
                    onChange={(x) => x.target.value === "__nome" ? undefined : set({ transportadora_id: x.target.value || null, transportadora_nome: x.target.value ? null : e.transportadora_nome })}>
                    <option value="">—</option>
                    {!e.transportadora_id && e.transportadora_nome && <option value="__nome">{e.transportadora_nome}</option>}
                    {transportadoras.filter((x) => x.ativo || x.id === e.transportadora_id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                </Field>
                <Field label="Código de rastreio" className="col-span-2"><input className="input" value={e.codigo_rastreio ?? ""} onChange={(x) => set({ codigo_rastreio: x.target.value })} /></Field>
                <Field label="Coleta prevista"><input className="input" type="date" value={e.coleta_prevista ?? ""} onChange={(x) => set({ coleta_prevista: x.target.value })} /></Field>
                <Field label="Coletado em"><input className="input" type="date" value={e.coletado_em ?? ""} onChange={(x) => set({ coletado_em: x.target.value })} /></Field>
                <Field label="Entrega prevista"><input className="input" type="date" value={e.entrega_prevista ?? ""} onChange={(x) => set({ entrega_prevista: x.target.value })} /></Field>
                <Field label="Entregue em"><input className="input" type="date" value={e.entregue_em ?? ""} onChange={(x) => set({ entregue_em: x.target.value })} /></Field>
                <Field label="Comprovante recebido em"><input className="input" type="date" value={e.comprovante_em ?? ""} onChange={(x) => set({ comprovante_em: x.target.value })} /></Field>
                <div className="flex items-end"><Button type="button" variant="secondary" disabled={!!e.comprovante_em} onClick={() => set({ comprovante_em: hoje() })}><PackageCheck size={15} /> Recebi hoje</Button></div>
              </div>
              {trocouTransp && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <Field label={`Justificativa da troca (o frete foi aprovado com ${transportadoras.find((x) => x.id === salvo?.transportadora_id)?.nome ?? salvo?.transportadora_nome ?? "outra transportadora"})`}>
                    <textarea className="input" rows={2} value={motivoTroca} onChange={(x) => setMotivoTroca(x.target.value)} placeholder="Ex.: a aprovada não tinha veículo com plataforma na data da coleta" />
                  </Field>
                </div>
              )}
              {e.entregue_em && !e.comprovante_em && !temAnexo && (
                <div className={`mt-3 rounded-xl border p-3 ${semProva ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <p className={`mb-2 flex gap-1.5 font-semibold ${semProva ? "text-red-800" : "text-slate-700"}`}><AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    Entregue sem comprovante. Anexe o canhoto (em “Comprovante de entrega, CT-e e fotos”, abaixo), informe a data em que o recebeu ou escreva por que não há.</p>
                  <Field label="Por que não há comprovante?">
                    <textarea className="input" rows={2} value={e.sem_comprovante_motivo ?? ""} onChange={(x) => set({ sem_comprovante_motivo: x.target.value })}
                      placeholder="Ex.: cliente recebeu e não assinou o canhoto; confirmou por WhatsApp" />
                  </Field>
                  {salvo?.sem_comprovante_em && <p className="mt-1 text-xs text-slate-500">Registrado por {nomeUsuario(salvo.sem_comprovante_por)} em {dataHora(salvo.sem_comprovante_em)}</p>}
                </div>
              )}
            </Secao>
          )}

          {id && (
            <Secao n={9} titulo="Fechamento: cotado, aprovado, cobrado, faturado e pago">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Valor rotulo="Cotado" valor={salvo?.valor_cotado} sub={salvo?.tabela_versao ? `tabela ${salvo.tabela_versao}` : salvo?.cotacao_aprovada_id ? "cotação aprovada" : undefined} />
                <Valor rotulo="Aprovado" valor={salvo?.valor_aprovado}
                  sub={salvo?.valor_aprovado != null && salvo.valor_cotado != null && Number(salvo.valor_aprovado) > Number(salvo.valor_cotado) + 0.005
                    ? `+ ${brl(Number(salvo.valor_aprovado) - Number(salvo.valor_cotado))} não previsto` : undefined} />
                <Valor rotulo="Cobrado do cliente" valor={salvo?.valor_cobrado_cliente} sub={salvo?.pagador !== "empresa" ? "frete pago pelo cliente/terceiro" : undefined} />
                <Valor rotulo="Faturado (CT-e)" valor={salvo?.valor_final} sub={salvo?.cte_numero ?? undefined} tom={dif?.divergente ? "ruim" : undefined} />
                <Valor rotulo="Pago" valor={conta.data?.status === "pago" ? conta.data.valor_pago ?? conta.data.valor : null}
                  sub={conta.data ? (conta.data.status === "pago" ? `em ${dataBR(conta.data.data_pagamento)}` : `${conta.data.status} · vence ${dataBR(conta.data.vencimento)}`) : salvo?.conta_pagar_id ? "no contas a pagar" : "não lançado"} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Frete final faturado (R$)"><input className="input" inputMode="decimal" value={e.valor_final ?? ""} onChange={(x) => set({ valor_final: x.target.value as unknown as number })} /></Field>
                <Field label="Nº do CT-e / fatura"><input className="input" value={e.cte_numero ?? ""} onChange={(x) => set({ cte_numero: x.target.value })} /></Field>
              </div>
              {dif && !dif.divergente && (
                <p className="mt-2 flex items-center gap-1.5 text-emerald-700"><BadgeCheck size={15} /> Faturado confere com o aprovado{dif.reais ? ` (diferença de ${brl(dif.reais)}, dentro da tolerância de R$ 1,00 e 2%)` : ""}.</p>
              )}
              {dif?.divergente && (
                <div className={`mt-2 rounded-xl border p-3 ${salvo?.conferido_em ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                  <p className={`flex gap-1.5 font-semibold ${salvo?.conferido_em ? "text-emerald-800" : "text-red-800"}`}>
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    Divergente: faturado {brl(salvo!.valor_final)} × aprovado {brl(salvo!.valor_aprovado)} ({dif.reais > 0 ? "+" : ""}{brl(dif.reais)}, {pctTxt(dif.pct)}).
                    {salvo?.conferido_em ? " Conferido." : " Confira o CT-e com a cotação aprovada antes de pagar."}
                  </p>
                  <Field label="Conferência: o que foi verificado e o que foi combinado" className="mt-2">
                    <textarea className="input" rows={2} value={e.conferencia_obs ?? ""} onChange={(x) => set({ conferencia_obs: x.target.value })}
                      placeholder="Ex.: CT-e cobrou TDE que não estava na cotação; transportadora vai abater na próxima fatura" />
                  </Field>
                  {salvo?.conferido_em && <p className="mt-1 text-xs text-slate-600">Conferido por {nomeUsuario(salvo.conferido_por)} em {dataHora(salvo.conferido_em)}</p>}
                </div>
              )}
              <LancarContaPagar envio={salvo} formFinal={num(e.valor_final)} conta={conta.data ?? null} divergenteSemConferencia={!!dif?.divergente && !salvo?.conferido_em}
                onLancado={() => { carregado.refetch(); invalidar("envios", "contas_pagar"); }} />
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
          {id && <Button type="button" variant="secondary" title="Etiquetas de transporte e de volume com os volumes deste envio" onClick={() => etiquetas.abrir({ tipo: "envio", envio_id: id, envio: e })}><Printer size={15} /> Etiquetas</Button>}
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          {podeEditar && <Button disabled={ocupado}>{ocupado ? "Salvando…" : id ? "Salvar" : "Criar envio"}</Button>}
        </div>
      </form>

      {id && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 text-sm">
          <Cotacoes envio={(salvo ?? { ...e, id }) as Envio} transportadoras={transportadoras} podeEditar={podeEditar && !fechado} podeAdicional={podeEditar && status !== "cancelado"}
            pedidoOrcamento={pedido.data?.status === "orcamento"} nomeUsuario={nomeUsuario}
            onMudou={() => { carregado.refetch(); invalidar("envios", "pedidos", "envio_cotacoes"); }} />
          <Ocorrencias envioId={id} podeEditar={podeEditar} abrirNova={!!novaOcorrencia} nomeUsuario={nomeUsuario} />
          <Anexos entidade="geral" id={id} titulo="Comprovante de entrega, CT-e e fotos" />
        </div>
      )}
      {etiquetas.modal}
    </Modal>
  );
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">{n}</span>{titulo}</h3>
      {children}
    </section>
  );
}

function Valor({ rotulo, valor, sub, tom }: { rotulo: string; valor: number | null | undefined; sub?: string; tom?: "ruim" }) {
  return (
    <div className={`rounded-lg border p-2 ${tom === "ruim" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`num font-bold ${tom === "ruim" ? "text-red-700" : "text-fg"}`}>{valor != null ? brl(valor) : "—"}</div>
      {sub && <div className="truncate text-[11px] text-slate-500" title={sub}>{sub}</div>}
    </div>
  );
}

/** Frete pago: lança o frete final no contas a pagar (categoria frete) quando há valor final e ainda não há conta. */
function LancarContaPagar({ envio, formFinal, conta, divergenteSemConferencia, onLancado }: {
  envio: Envio | undefined; formFinal: number | null; conta: { id: string; descricao: string; status: string; vencimento: string } | null;
  divergenteSemConferencia: boolean; onLancado: () => void;
}) {
  const { pode } = usePerfil();
  const [venc, setVenc] = useState(() => somarDias(30));
  const [ocupado, setOcupado] = useState(false);
  if (!envio) return null;
  const temConta = !!envio.conta_pagar_id && conta?.status !== "cancelado";
  if (temConta) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-slate-600"><CircleDollarSign size={15} className="text-emerald-700" />
        Frete lançado no contas a pagar{conta ? <>: {conta.descricao} · vence {dataBR(conta.vencimento)} <Badge value={conta.status} /></> : "."}</p>
    );
  }
  if (!(Number(envio.valor_final) > 0) || envio.status === "cancelado") return null;
  if (envio.pagador !== "empresa") return <p className="mt-3 text-xs text-slate-500">Frete pago pelo {envio.pagador === "cliente" ? "cliente" : "terceiro"}: não vai para o contas a pagar.</p>;
  if (!pode("contas_pagar")) return <p className="mt-3 text-xs text-slate-500">Frete final informado: o financeiro lança no contas a pagar.</p>;
  const mudou = formFinal !== Number(envio.valor_final);

  async function lancar() {
    setOcupado(true);
    const { error } = await supabase.rpc("lancar_frete_contas_pagar", { p_envio: envio!.id, p_vencimento: venc || null });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(`Frete de ${brl(envio!.valor_final)} lançado no contas a pagar`);
    onLancado();
  }
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3">
      <Field label="Vencimento da conta"><input className="input" type="date" value={venc} onChange={(x) => setVenc(x.target.value)} /></Field>
      <Button type="button" variant="secondary" disabled={ocupado || mudou || divergenteSemConferencia} onClick={lancar}><CircleDollarSign size={15} /> Lançar o frete no contas a pagar</Button>
      {(mudou || divergenteSemConferencia) && <span className="text-xs text-amber-700">{mudou ? "Salve o frete final antes de lançar." : "Registre a conferência do frete divergente antes de lançar."}</span>}
    </div>
  );
}

type NovaCotacao = {
  transportadora_id: string; transportadora_nome: string; valor: string; prazo_dias: string; validade: string; observacoes: string;
  tipo_servico: string; tabela_versao: string; adicionais: { tipo: string; valor: string; descricao: string }[];
};

function Cotacoes({ envio, transportadoras, podeEditar, podeAdicional, pedidoOrcamento, nomeUsuario, onMudou }: {
  envio: Envio; transportadoras: Transportadora[]; podeEditar: boolean; podeAdicional: boolean; pedidoOrcamento: boolean; nomeUsuario: Usuarios; onMudou: () => void;
}) {
  const dia = hoje();
  const { data: cotacoes = [], refetch } = useQuery({
    queryKey: ["envio_cotacoes", envio.id],
    queryFn: async () => ((await supabase.from("envio_cotacoes").select("*").eq("envio_id", envio.id).order("valor", { ascending: true })).data ?? []) as CotacaoEnvio[],
  });
  const { data: excecoes = [], refetch: recarregarExcecoes } = useQuery({
    queryKey: ["envio_excecoes", envio.id],
    queryFn: async () => ((await supabase.from("envio_excecoes").select("*").eq("envio_id", envio.id).order("created_at", { ascending: false })).data ?? []) as ExcecaoEnvio[],
  });
  const [nova, setNova] = useState<NovaCotacao | null>(null);
  const [cobrar, setCobrar] = useState(false);
  const [aprovando, setAprovando] = useState<{ id: string; justificativa: string } | null>(null);
  const [extra, setExtra] = useState<{ tipo: string; valor: string; descricao: string; justificativa: string } | null>(null);
  const ativas = cotacoes.filter((c) => c.ativa).sort((a, b) => totalCotacao(a) - totalCotacao(b));
  const barata = maisBarataValida(cotacoes, dia);
  const aprovada = cotacoes.find((c) => c.escolhida && c.ativa);
  const nome = (c: Pick<CotacaoEnvio, "transportadora_id" | "transportadora_nome">) => transportadoras.find((x) => x.id === c.transportadora_id)?.nome ?? c.transportadora_nome ?? "—";
  const msg = mensagemCotacao(envio);
  const falta = faltandoParaCotar(envio);
  const incompletos = volumesIncompletos(envio.volumes ?? []);
  const atualizar = () => { refetch(); recarregarExcecoes(); onMudou(); };

  function abrirNova() {
    setNova({ transportadora_id: "", transportadora_nome: "", valor: "", prazo_dias: "", validade: somarDias(7), observacoes: "", tipo_servico: "padrao", tabela_versao: "", adicionais: [] });
  }
  async function adicionar() {
    if (!nova) return;
    if (incompletos.length) return notify(`Cotação sem medidas não é comparável. Complete e salve: ${incompletos.join("; ")}`, "erro");
    if (!nova.valor || (!nova.transportadora_id && !nova.transportadora_nome.trim())) return notify("Informe a transportadora e o valor", "erro");
    if (!nova.validade) return notify("Informe até quando a cotação vale", "erro");
    const adicionais = nova.adicionais.filter((a) => a.valor.trim() !== "").map((a) => ({ tipo: a.tipo, valor: Number(a.valor.replace(",", ".")), ...(a.descricao.trim() ? { descricao: a.descricao.trim() } : {}) }));
    if (adicionais.some((a) => !(a.valor >= 0))) return notify("Valor de adicional inválido", "erro");
    const { error } = await supabase.from("envio_cotacoes").insert({
      envio_id: envio.id, transportadora_id: nova.transportadora_id || null, transportadora_nome: nova.transportadora_id ? null : nova.transportadora_nome.trim(),
      valor: Number(nova.valor.replace(",", ".")), prazo_dias: nova.prazo_dias ? Number(nova.prazo_dias) : null, validade: nova.validade, observacoes: nova.observacoes || null,
      tipo_servico: nova.tipo_servico, tabela_versao: nova.tabela_versao.trim() || null, adicionais,
    });
    if (error) return notifyError(error);
    notify("Cotação registrada");
    setNova(null);
    atualizar();
  }
  async function aprovar(c: CotacaoEnvio, justificativa?: string) {
    const r = analisarAprovacao(c, cotacoes, envio, dia);
    if (r.bloqueio) return notify(r.bloqueio, "erro");
    if (r.precisaJustificativa && (justificativa ?? "").trim().length < 5) {
      if (!aprovando || aprovando.id !== c.id) return setAprovando({ id: c.id, justificativa: "" });
      return notify(r.maisCara ? "Escreva por que escolher esta e não a mais barata" : "Escreva por que trocar a transportadora já aprovada", "erro");
    }
    const { error } = await supabase.rpc("aprovar_frete_envio", { p_cotacao: c.id, p_justificativa: justificativa?.trim() || null, p_cobrar_cliente: cobrar });
    if (error) return notifyError(error);
    notify(`Frete aprovado: ${nome(c)}, ${brl(totalCotacao(c))}`);
    setAprovando(null);
    atualizar();
  }
  async function remover(c: CotacaoEnvio) {
    const { error } = await supabase.from("envio_cotacoes").update({ ativa: false }).eq("id", c.id);
    if (error) return notifyError(error);
    refetch();
  }
  async function registrarExtra() {
    if (!extra) return;
    const valor = Number(extra.valor.replace(",", "."));
    if (!(valor > 0)) return notify("Informe o valor do adicional", "erro");
    if (extra.justificativa.trim().length < 5) return notify("Adicional fora da cotação aprovada só com justificativa (quem pediu e por quê)", "erro");
    const { error } = await supabase.rpc("registrar_adicional_envio", { p_envio: envio.id, p_tipo: extra.tipo, p_valor: valor, p_justificativa: extra.justificativa.trim(), p_descricao: extra.descricao.trim() || null });
    if (error) return notifyError(error);
    notify(`Adicional de ${brl(valor)} somado ao frete aprovado`);
    setExtra(null);
    atualizar();
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">7</span>Cotações e decisão</h3>
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
      {incompletos.length > 0 && !envio.aprovado_em && (
        <div className="mb-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          <Ruler size={16} className="mt-0.5 shrink-0" />
          <div><b>Cotação sem medidas não é comparável.</b> Complete e salve as medidas e o peso da carga embalada: {incompletos.join("; ")}.</div>
        </div>
      )}
      {pedidoOrcamento && podeEditar && (
        <label className="mb-2 flex items-center gap-2 text-slate-600"><input type="checkbox" checked={cobrar} onChange={(x) => setCobrar(x.target.checked)} /> Ao aprovar, cobrar o frete do cliente no pedido</label>
      )}
      <div className="space-y-2">
        {ativas.map((c) => {
          const vencida = !c.escolhida && cotacaoVencida(c, dia);   // a aprovada já foi decidida na validade
          const an = analisarAprovacao(c, cotacoes, envio, dia);
          const abrindo = aprovando?.id === c.id;
          return (
            <div key={c.id} className={`rounded-xl border p-3 ${c.escolhida ? "border-emerald-200 bg-emerald-50" : vencida ? "border-slate-200 bg-slate-50" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Truck size={18} className="hidden shrink-0 text-slate-400 sm:block" />
                <div className="min-w-[14rem] flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">
                    {nome(c)}
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-800">{rotuloServico(c.tipo_servico)}</span>
                    {barata?.id === c.id && ativas.length > 1 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">menor preço válido</span>}
                    {vencida && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">vencida</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.prazo_dias != null ? `${c.prazo_dias} dia(s) úteis` : "prazo não informado"}{c.validade ? ` · válida até ${dataBR(c.validade)}` : " · sem validade"}
                    {c.tabela_versao ? ` · tabela ${c.tabela_versao}` : ""}{c.observacoes ? ` · ${c.observacoes}` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">frete {brl(c.valor)}</span>
                    {(c.adicionais ?? []).map((a, k) => (
                      <span key={k} title={a.previsto === false ? `Não previsto: ${a.justificativa ?? ""}` : a.descricao ?? undefined}
                        className={`rounded px-1.5 py-0.5 ${a.previsto === false ? "bg-amber-100 font-semibold text-amber-900" : "bg-slate-100 text-slate-700"}`}>
                        + {rotuloAdicional(a.tipo)}{a.descricao ? ` (${a.descricao})` : ""} {brl(a.valor)}{a.previsto === false ? " · não previsto" : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="num text-lg font-bold text-fg">{brl(totalCotacao(c))}</span>
                {c.escolhida ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">aprovada</span>
                  : podeEditar && (vencida ? <span className="text-xs font-semibold text-red-700">não aprova: vencida</span>
                    : <Button type="button" variant="secondary" disabled={!!an.bloqueio} title={an.bloqueio ?? undefined} onClick={() => aprovar(c)}><CheckCircle2 size={15} /> Aprovar</Button>)}
                {podeEditar && !c.escolhida && <Button type="button" variant="ghost" aria-label="Tirar cotação" onClick={() => remover(c)}><Trash2 size={15} /></Button>}
              </div>
              {abrindo && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <p className="mb-2 font-semibold">
                    {an.maisCara && an.barata ? <>Esta não é a mais barata válida ({nome(an.barata)}, {brl(totalCotacao(an.barata))}). </> : null}
                    {an.troca ? <>O frete já foi aprovado com outra transportadora. </> : null}
                    Justifique a escolha: fica registrado com o seu nome e a data.
                  </p>
                  <textarea className="input" rows={2} aria-label="Justificativa da escolha" value={aprovando!.justificativa} onChange={(x) => setAprovando({ id: c.id, justificativa: x.target.value })}
                    placeholder="Ex.: prazo menor para a inauguração do cliente; a mais barata não entrega com agendamento" />
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setAprovando(null)}>Cancelar</Button>
                    <Button type="button" onClick={() => aprovar(c, aprovando!.justificativa)}><CheckCircle2 size={15} /> Aprovar com justificativa</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!ativas.length && !nova && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-slate-500">Nenhuma cotação ainda. Peça às transportadoras e registre aqui o valor, os adicionais, o prazo e a validade.</p>}
      </div>

      {podeEditar && (nova ? (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <Field label="Transportadora" className="col-span-2">
              <select className="input" value={nova.transportadora_id} onChange={(x) => setNova({ ...nova, transportadora_id: x.target.value })}>
                <option value="">Outra (digitar)</option>{transportadoras.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Field>
            {!nova.transportadora_id && <Field label="Nome"><input className="input" placeholder="ex.: Correios" value={nova.transportadora_nome} onChange={(x) => setNova({ ...nova, transportadora_nome: x.target.value })} /></Field>}
            <Field label="Serviço">
              <select className="input" value={nova.tipo_servico} onChange={(x) => setNova({ ...nova, tipo_servico: x.target.value })}>
                {TIPOS_SERVICO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </Field>
            <Field label="Frete (R$)"><input className="input" inputMode="decimal" aria-label="Valor do frete" value={nova.valor} onChange={(x) => setNova({ ...nova, valor: x.target.value })} /></Field>
            <Field label="Prazo (dias úteis)"><input className="input" inputMode="numeric" value={nova.prazo_dias} onChange={(x) => setNova({ ...nova, prazo_dias: x.target.value })} /></Field>
            <Field label="Válida até"><input className="input" type="date" required value={nova.validade} onChange={(x) => setNova({ ...nova, validade: x.target.value })} /></Field>
            <Field label="Versão da tabela"><input className="input" placeholder="ex.: 2026/10" value={nova.tabela_versao} onChange={(x) => setNova({ ...nova, tabela_versao: x.target.value })} /></Field>
            <Field label="Observação" className="col-span-2 sm:col-span-3"><input className="input" placeholder="ex.: coleta amanhã, veículo com plataforma" value={nova.observacoes} onChange={(x) => setNova({ ...nova, observacoes: x.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs font-semibold text-slate-600">Adicionais da cotação</div>
            {nova.adicionais.map((a, k) => (
              <div key={k} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                <select className="input col-span-2" aria-label="Tipo de adicional" value={a.tipo} onChange={(x) => setNova({ ...nova, adicionais: nova.adicionais.map((y, i) => (i === k ? { ...y, tipo: x.target.value } : y)) })}>
                  {TIPOS_ADICIONAL.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
                <input className="input" inputMode="decimal" aria-label="Valor do adicional" placeholder="R$" value={a.valor} onChange={(x) => setNova({ ...nova, adicionais: nova.adicionais.map((y, i) => (i === k ? { ...y, valor: x.target.value } : y)) })} />
                <input className="input sm:col-span-2" placeholder="Detalhe (opcional)" value={a.descricao} onChange={(x) => setNova({ ...nova, adicionais: nova.adicionais.map((y, i) => (i === k ? { ...y, descricao: x.target.value } : y)) })} />
                <Button type="button" variant="ghost" aria-label="Tirar adicional" onClick={() => setNova({ ...nova, adicionais: nova.adicionais.filter((_, i) => i !== k) })}><Trash2 size={14} /></Button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setNova({ ...nova, adicionais: [...nova.adicionais, { tipo: "tde", valor: "", descricao: "" }] })}><Plus size={14} /> Adicional (TDE, TRT, agendamento, pedágio, GRIS, ad valorem…)</Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm text-slate-600">Total: <b className="num text-fg">{brl((Number(nova.valor.replace(",", ".")) || 0) + nova.adicionais.reduce((s, a) => s + (Number(a.valor.replace(",", ".")) || 0), 0))}</b></span>
            <Button type="button" variant="ghost" onClick={() => setNova(null)}>Cancelar</Button>
            <Button type="button" onClick={adicionar}>Salvar cotação</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="mt-3" disabled={incompletos.length > 0} title={incompletos.length ? "Complete as medidas e o peso dos volumes" : undefined} onClick={abrirNova}>
          <Plus size={15} /> Registrar cotação
        </Button>
      ))}

      {envio.aprovado_em && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeCheck size={16} className="shrink-0" />
            <b>Decisão:</b>
            <span>{aprovada ? nome(aprovada) : transportadoras.find((x) => x.id === envio.transportadora_id)?.nome ?? envio.transportadora_nome ?? "—"} · {rotuloServico(envio.tipo_servico)} · {brl(envio.valor_aprovado)}</span>
            <span className="text-xs">aprovada por {nomeUsuario(envio.aprovado_por)} em {dataHora(envio.aprovado_em)}</span>
          </div>
          <p className="mt-1 text-xs">{envio.justificativa_escolha ? <>Justificativa: “{envio.justificativa_escolha}”</> : "Era a opção mais barata entre as válidas."}</p>
          {podeAdicional && (extra ? (
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 sm:grid-cols-6">
              <select className="input col-span-2" aria-label="Tipo do adicional não previsto" value={extra.tipo} onChange={(x) => setExtra({ ...extra, tipo: x.target.value })}>
                {TIPOS_ADICIONAL.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
              <input className="input" inputMode="decimal" aria-label="Valor do adicional não previsto" placeholder="R$" value={extra.valor} onChange={(x) => setExtra({ ...extra, valor: x.target.value })} />
              <input className="input sm:col-span-3" placeholder="Detalhe (opcional)" value={extra.descricao} onChange={(x) => setExtra({ ...extra, descricao: x.target.value })} />
              <textarea className="input col-span-2 sm:col-span-6" rows={2} aria-label="Justificativa do adicional" placeholder="Justificativa: quem pediu e por quê (obrigatória)" value={extra.justificativa} onChange={(x) => setExtra({ ...extra, justificativa: x.target.value })} />
              <div className="col-span-2 flex justify-end gap-2 sm:col-span-6">
                <Button type="button" variant="ghost" onClick={() => setExtra(null)}>Cancelar</Button>
                <Button type="button" onClick={registrarExtra}>Aceitar adicional</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="mt-1" onClick={() => setExtra({ tipo: "tde", valor: "", descricao: "", justificativa: "" })}><Plus size={14} /> Adicional não previsto</Button>
          ))}
        </div>
      )}

      {excecoes.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><History size={13} /> Exceções registradas</div>
          <ul className="space-y-1.5">
            {excecoes.map((x) => (
              <li key={x.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <b className="text-fg">{TIPOS_EXCECAO[x.tipo] ?? x.tipo}</b>
                  {x.valor != null && <span className="num">{brl(x.valor)}</span>}
                  <span className="text-slate-500">{nomeUsuario(x.created_by)} · {dataHora(x.created_at)}</span>
                </div>
                {x.detalhe && <div className="text-slate-600">{x.detalhe}</div>}
                <div className="text-slate-700">“{x.justificativa}”</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Ocorrencias({ envioId, podeEditar, abrirNova, nomeUsuario }: { envioId: string; podeEditar: boolean; abrirNova: boolean; nomeUsuario: Usuarios }) {
  const invalidar = useInvalidate();
  const ref = useRef<HTMLElement>(null);
  const { data: lista = [], refetch } = useQuery({
    queryKey: ["envio_ocorrencias", envioId],
    queryFn: async () => ((await supabase.from("envio_ocorrencias").select("*").eq("envio_id", envioId).order("created_at", { ascending: false })).data ?? []) as OcorrenciaEnvio[],
  });
  const [nova, setNova] = useState<{ tipo: string; descricao: string; responsavel: string } | null>(abrirNova && podeEditar ? { tipo: "atraso", descricao: "", responsavel: "" } : null);
  const [editando, setEditando] = useState<Record<string, { responsavel: string; andamento: string }>>({});
  const [resolvendo, setResolvendo] = useState<Record<string, string>>({});
  useEffect(() => {
    // aberto pelo pedido para registrar ocorrência: rola até aqui
    if (abrirNova) setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  }, [abrirNova]);

  async function registrar() {
    if (!nova || nova.descricao.trim().length < 3) return notify("Descreva a ocorrência", "erro");
    if (!nova.responsavel.trim()) return notify("Diga quem é o responsável por resolver", "erro");
    const { error } = await supabase.from("envio_ocorrencias").insert({ envio_id: envioId, tipo: nova.tipo, descricao: nova.descricao.trim(), responsavel: nova.responsavel.trim() });
    if (error) return notifyError(error);
    notify("Ocorrência registrada");
    setNova(null);
    refetch();
    invalidar("envio_ocorrencias");
  }
  async function atualizar(o: OcorrenciaEnvio, patch: Partial<OcorrenciaEnvio>) {
    const { error } = await supabase.from("envio_ocorrencias").update(patch).eq("id", o.id);
    if (error) return notifyError(error);
    notify(patch.status === "resolvida" ? "Ocorrência resolvida" : "Ocorrência atualizada");
    setEditando((x) => { const y = { ...x }; delete y[o.id]; return y; });
    setResolvendo((x) => { const y = { ...x }; delete y[o.id]; return y; });
    refetch();
    invalidar("envio_ocorrencias");
  }
  function resolver(o: OcorrenciaEnvio) {
    const r = (resolvendo[o.id] ?? "").trim();
    if (r.length < 3) return notify("Escreva como a ocorrência foi resolvida", "erro");
    atualizar(o, { status: "resolvida", resolucao: r });
  }

  return (
    <section ref={ref}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-brand-fg">10</span>Ocorrências</h3>
      <div className="space-y-2">
        {lista.map((o) => {
          const ed = editando[o.id];
          const rv = resolvendo[o.id];
          return (
            <div key={o.id} className={`rounded-xl border p-3 ${o.status === "aberta" ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <b>{TIPOS_OCORRENCIA.find(([k]) => k === o.tipo)?.[1] ?? o.tipo}</b>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === "aberta" ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{o.status}</span>
                <span className="text-xs text-slate-500">aberta em {dataBR(o.created_at)} · atualizada em {dataBR(o.atualizado_em)}{o.responsavel ? ` · responsável: ${o.responsavel}` : " · sem responsável"}</span>
              </div>
              <p className="mt-1">{o.descricao}</p>
              {o.andamento && <p className="mt-1 text-slate-600"><b>Andamento:</b> {o.andamento}</p>}
              {o.status === "resolvida" && (
                <p className="mt-1 text-emerald-800"><b>Resolução:</b> {o.resolucao ?? "—"} <span className="text-xs text-slate-500">({dataBR(o.resolvida_em)}{o.resolvida_por ? ` · ${nomeUsuario(o.resolvida_por)}` : ""})</span></p>
              )}
              {podeEditar && o.status === "aberta" && (ed ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input className="input" placeholder="Responsável" value={ed.responsavel} onChange={(x) => setEditando({ ...editando, [o.id]: { ...ed, responsavel: x.target.value } })} />
                  <input className="input sm:col-span-2" placeholder="Andamento (o que foi feito)" value={ed.andamento} onChange={(x) => setEditando({ ...editando, [o.id]: { ...ed, andamento: x.target.value } })} />
                  <Button type="button" variant="secondary" onClick={() => atualizar(o, { responsavel: ed.responsavel.trim() || null, andamento: ed.andamento.trim() || null })}>Salvar</Button>
                </div>
              ) : rv !== undefined ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input className="input sm:col-span-3" aria-label="Como foi resolvida" placeholder="Como foi resolvida (obrigatório)" value={rv} onChange={(x) => setResolvendo({ ...resolvendo, [o.id]: x.target.value })} />
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setResolvendo((x) => { const y = { ...x }; delete y[o.id]; return y; })}>Cancelar</Button>
                    <Button type="button" onClick={() => resolver(o)}><CheckCircle2 size={14} /> Confirmar</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditando({ ...editando, [o.id]: { responsavel: o.responsavel ?? "", andamento: o.andamento ?? "" } })}>Atualizar</Button>
                  <Button type="button" variant="secondary" onClick={() => setResolvendo({ ...resolvendo, [o.id]: "" })}><CheckCircle2 size={14} /> Resolvida</Button>
                </div>
              ))}
            </div>
          );
        })}
        {!lista.length && !nova && <p className="text-slate-500">Nenhuma ocorrência.</p>}
      </div>
      {podeEditar && (nova ? (
        <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
          <select className="input" aria-label="Tipo de ocorrência" value={nova.tipo} onChange={(x) => setNova({ ...nova, tipo: x.target.value })}>
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
