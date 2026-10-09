import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, PackageOpen, Plus, Send, Trash2, Truck } from "lucide-react";
import { Badge, Button, Field } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import type { Cliente, Item, Produto, Transportadora } from "@/lib/types";
import { useConfig } from "@/lib/useConfig";
import { EnvioForm } from "@/components/fretes/EnvioForm";
import { STATUS_ENVIO, type Envio } from "@/lib/fretes";

type Cotacao = {
  id: string; pedido_id: string; transportadora_id: string | null; transportadora_nome: string | null;
  valor: number; prazo_dias: number | null; observacoes: string | null; escolhida: boolean;
};

type PedidoFrete = {
  id: string; numero?: number; status?: string; cliente?: Cliente; itens: Item[]; valor_total?: number;
  transportadora_id?: string | null; codigo_rastreio?: string | null; enviado_em?: string | null; volumes?: number | null;
};

/** Frete do pedido: cotações das transportadoras, escolha e dados do envio. */
export function FreteVenda({ pedido, onAlterado }: { pedido: PedidoFrete; onAlterado: (patch: Record<string, unknown>) => void }) {
  const { pode } = usePerfil();
  const podeCotar = pode("cotar_frete");
  const invalidate = useInvalidate();
  const { data: cfg } = useConfig();
  const { data: transportadoras = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: cotacoes = [], refetch } = useQuery({
    queryKey: ["cotacoes_frete", pedido.id],
    queryFn: async () => ((await supabase.from("cotacoes_frete").select("*").eq("pedido_id", pedido.id).order("valor", { ascending: true })).data ?? []) as Cotacao[],
  });
  const [nova, setNova] = useState<{ transportadora_id: string; transportadora_nome: string; valor: string; prazo_dias: string; observacoes: string } | null>(null);
  const [cobrar, setCobrar] = useState(true);
  // envio padronizado (Fretes e envios): quando existe, as cotações e o rastreio ficam nele
  const { data: envios = [], refetch: recarregarEnvios } = useQuery({
    queryKey: ["envios", "pedido", pedido.id],
    queryFn: async () => ((await supabase.from("envios").select("*").eq("pedido_id", pedido.id).order("created_at", { ascending: true })).data ?? []) as Envio[],
  });
  const [envioAberto, setEnvioAberto] = useState<string | null>(null);
  const envioAtivo = envios.find((e) => e.status !== "cancelado");
  async function criarEnvio() {
    const { data, error } = await supabase.rpc("criar_envio_pedido", { p_pedido: pedido.id });
    if (error) return notifyError(error);
    await recarregarEnvios();
    setEnvioAberto(data as string);
  }
  const [envio, setEnvio] = useState({ codigo_rastreio: pedido.codigo_rastreio ?? "", enviado_em: pedido.enviado_em ?? hoje(), volumes: pedido.volumes ?? undefined });

  // Resumo da carga para a transportadora calcular
  const carga = pedido.itens.map((i) => ({ i, p: produtos.find((x) => x.id === i.produto_id) }));
  const peso = carga.reduce((s, { i, p }) => s + i.quantidade * Number(p?.peso_kg ?? 0), 0);
  const semPeso = carga.filter(({ p }) => !p?.peso_kg).length;
  const volumes = envio.volumes ?? carga.reduce((s, { i }) => s + Math.ceil(i.quantidade), 0);
  const medidas = carga.filter(({ p }) => p?.altura_cm).map(({ i, p }) => `${i.quantidade}x ${p!.altura_cm}×${p!.largura_cm}×${p!.profundidade_cm} cm`);
  const destino = [pedido.cliente?.municipio, pedido.cliente?.uf].filter(Boolean).join("/") || "a definir";
  const nome = (c: Cotacao) => transportadoras.find((t) => t.id === c.transportadora_id)?.nome ?? c.transportadora_nome ?? "—";
  const escolhida = cotacoes.find((c) => c.escolhida);
  const enviado = ["aprovado", "faturado", "entregue"].includes(pedido.status ?? "");

  const msgCotacao = [
    `Olá! Aqui é da *MF Máquinas*. Pode cotar este frete?`,
    `Origem: ${[cfg?.municipio, cfg?.uf].filter(Boolean).join("/") || "nossa fábrica"}`,
    `Destino: ${destino}${pedido.cliente?.cep ? ` (CEP ${pedido.cliente.cep})` : ""}`,
    `Mercadoria: ${pedido.itens.map((i) => `${i.quantidade}x ${i.descricao}`).join("; ")}`,
    peso ? `Peso total: ${peso.toLocaleString("pt-BR")} kg` : "",
    `Volumes: ${volumes}`,
    medidas.length ? `Medidas: ${medidas.join("; ")}` : "",
    pedido.valor_total ? `Valor da nota: ${brl(pedido.valor_total)}` : "",
    `Preciso do valor e do prazo de entrega. Obrigado!`,
  ].filter(Boolean).join("\n");

  async function adicionar() {
    if (!nova || !nova.valor || (!nova.transportadora_id && !nova.transportadora_nome.trim())) return notify("Informe a transportadora e o valor", "erro");
    const { error } = await supabase.from("cotacoes_frete").insert({
      pedido_id: pedido.id, transportadora_id: nova.transportadora_id || null, transportadora_nome: nova.transportadora_id ? null : nova.transportadora_nome.trim(),
      valor: Number(nova.valor), prazo_dias: nova.prazo_dias ? Number(nova.prazo_dias) : null, observacoes: nova.observacoes || null,
    });
    if (error) return notifyError(error);
    setNova(null);
    refetch();
  }

  async function escolher(c: Cotacao) {
    const { error } = await supabase.rpc("escolher_cotacao_frete", { p_cotacao: c.id, p_cobrar_cliente: cobrar });
    if (error) return notifyError(error);
    notify(pedido.status === "orcamento" && cobrar ? `Frete de ${brl(c.valor)} aplicado ao pedido` : "Transportadora escolhida");
    if (pedido.status === "orcamento" && cobrar) onAlterado({ frete: Number(c.valor), modalidade_frete: 0, transportadora_id: c.transportadora_id });
    else onAlterado({ transportadora_id: c.transportadora_id });
    refetch();
    invalidate("pedidos");
  }

  async function remover(c: Cotacao) {
    await supabase.from("cotacoes_frete").delete().eq("id", c.id);
    refetch();
  }

  async function salvarEnvio() {
    const { error } = await supabase.from("pedidos").update({
      codigo_rastreio: envio.codigo_rastreio || null, enviado_em: envio.enviado_em || null, volumes: volumes || null, peso_total_kg: peso || null,
    }).eq("id", pedido.id);
    if (error) return notifyError(error);
    notify("Dados do envio salvos");
    onAlterado({ codigo_rastreio: envio.codigo_rastreio, enviado_em: envio.enviado_em });
    invalidate("pedidos");
  }

  const transpEscolhida = transportadoras.find((t) => t.id === (escolhida?.transportadora_id ?? pedido.transportadora_id));
  const msgEnvio = [
    `Olá ${pedido.cliente?.nome.split(" ")[0] ?? ""}! Seu pedido #${pedido.numero ?? ""} da *MF Máquinas* foi despachado.`,
    `Transportadora: ${transpEscolhida?.nome ?? (escolhida ? nome(escolhida) : "—")}`,
    envio.codigo_rastreio ? `Código de rastreio: ${envio.codigo_rastreio}` : "",
    escolhida?.prazo_dias ? `Prazo estimado: ${escolhida.prazo_dias} dia(s) úteis` : "",
    `Qualquer dúvida, é só chamar!`,
  ].filter(Boolean).join("\n");

  const blocoEnvio = (
    <div className="rounded-xl border-2 border-brand/30 bg-brand-light/40 p-3 text-sm">
      {envioAberto && <EnvioForm envioId={envioAberto} onClose={() => { setEnvioAberto(null); recarregarEnvios(); invalidate("pedidos"); }} />}
      {envioAtivo ? (
        <div className="flex flex-wrap items-center gap-3">
          <PackageOpen size={18} className="text-brand" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-fg">Envio #{envioAtivo.numero} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_ENVIO[envioAtivo.status].cor}`}>{STATUS_ENVIO[envioAtivo.status].rotulo}</span></div>
            <div className="text-xs text-slate-600">{envioAtivo.qtd_volumes} volume(s) · {Number(envioAtivo.peso_total_kg).toLocaleString("pt-BR")} kg{envioAtivo.valor_aprovado != null ? ` · frete aprovado ${brl(envioAtivo.valor_aprovado)}` : ""}{envioAtivo.codigo_rastreio ? ` · rastreio ${envioAtivo.codigo_rastreio}` : ""}</div>
          </div>
          <Button type="button" onClick={() => setEnvioAberto(envioAtivo.id)}><Truck size={15} /> Abrir envio</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <PackageOpen size={18} className="text-brand" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-fg">Cotação padronizada</div>
            <div className="text-xs text-slate-600">Cria o envio já com CEPs, volumes e medidas das embalagens, valor, equipamento e modalidade. Cotações, coleta, rastreio e entrega ficam no painel de fretes.</div>
          </div>
          {podeCotar && <Button type="button" onClick={criarEnvio}><Plus size={15} /> Criar envio</Button>}
        </div>
      )}
    </div>
  );

  if (envioAtivo) return (
    <div className="space-y-4">
      {blocoEnvio}
      {cotacoes.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-500">Cotações registradas antes do envio</div>
          {cotacoes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-1.5 text-sm">
              <span className="flex-1">{nome(c)}{c.prazo_dias ? ` · ${c.prazo_dias} dia(s)` : ""}</span>
              <span className="font-semibold">{brl(c.valor)}</span>{c.escolhida && <Badge value="escolhida" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {blocoEnvio}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-4">
        <div><div className="text-xs text-slate-500">Destino</div><div className="font-semibold text-fg">{destino}</div></div>
        <div><div className="text-xs text-slate-500">Peso</div><div className="num font-semibold text-fg">{peso ? `${peso.toLocaleString("pt-BR")} kg` : "—"}</div>
          {semPeso > 0 && <div className="text-xs text-amber-700">{semPeso} item(ns) sem peso no cadastro</div>}</div>
        <div><div className="text-xs text-slate-500">Volumes</div><div className="num font-semibold text-fg">{volumes}</div></div>
        <div><div className="text-xs text-slate-500">Valor da mercadoria</div><div className="num font-semibold text-fg">{brl(pedido.valor_total)}</div></div>
      </div>

      {podeCotar && (
        <div>
          <div className="mb-2 text-sm font-bold text-fg">Pedir cotação</div>
          <div className="flex flex-wrap gap-2">
            {transportadoras.filter((t) => t.ativo && t.whatsapp).map((t) => (
              <a key={t.id} href={whatsappLink(t.whatsapp, msgCotacao)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                <MessageCircle size={15} /> {t.nome}
              </a>
            ))}
            {!transportadoras.some((t) => t.ativo && t.whatsapp) && (
              <p className="text-sm text-slate-500">Cadastre transportadoras com WhatsApp em <b>Fornecedores e fretes → Transportadoras</b>.</p>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-fg">Cotações recebidas</span>
          {pedido.status === "orcamento" && podeCotar && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} /> Cobrar o frete do cliente no pedido
            </label>
          )}
        </div>
        <div className="space-y-2">
          {cotacoes.map((c, k) => (
            <div key={c.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${c.escolhida ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}>
              <Truck size={18} className="text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg">{nome(c)} {k === 0 && cotacoes.length > 1 && <span className="ml-1 text-xs font-semibold text-emerald-700">menor preço</span>}</div>
                <div className="text-xs text-slate-500">{c.prazo_dias ? `${c.prazo_dias} dia(s)` : "prazo não informado"}{c.observacoes ? ` · ${c.observacoes}` : ""}</div>
              </div>
              <span className="num text-lg font-bold text-fg">{brl(c.valor)}</span>
              {c.escolhida ? <Badge value="escolhida" /> : podeCotar && <Button type="button" variant="secondary" onClick={() => escolher(c)}><CheckCircle2 size={15} /> Escolher</Button>}
              {podeCotar && !c.escolhida && <Button type="button" variant="ghost" aria-label="Remover cotação" onClick={() => remover(c)}><Trash2 size={15} /></Button>}
            </div>
          ))}
          {!cotacoes.length && !nova && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Nenhuma cotação ainda. Peça às transportadoras e registre aqui os valores que elas passarem.</p>}
        </div>

        {podeCotar && (nova ? (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5">
            <Field label="Transportadora" className="col-span-2">
              <select className="input" value={nova.transportadora_id} onChange={(e) => setNova({ ...nova, transportadora_id: e.target.value })}>
                <option value="">Outra (digitar)</option>
                {transportadoras.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Field>
            {!nova.transportadora_id && <Field label="Nome"><input className="input" placeholder="ex.: Correios" value={nova.transportadora_nome} onChange={(e) => setNova({ ...nova, transportadora_nome: e.target.value })} /></Field>}
            <Field label="Valor (R$)"><input className="input" type="number" step="0.01" min={0} value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} /></Field>
            <Field label="Prazo (dias)"><input className="input" type="number" min={0} value={nova.prazo_dias} onChange={(e) => setNova({ ...nova, prazo_dias: e.target.value })} /></Field>
            <Field label="Observação" className="col-span-2 sm:col-span-4"><input className="input" placeholder="ex.: coleta amanhã, seguro incluso" value={nova.observacoes} onChange={(e) => setNova({ ...nova, observacoes: e.target.value })} /></Field>
            <div className="col-span-2 flex items-end justify-end gap-2 sm:col-span-1">
              <Button type="button" variant="ghost" onClick={() => setNova(null)}>Cancelar</Button>
              <Button type="button" onClick={adicionar}>Salvar</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setNova({ transportadora_id: "", transportadora_nome: "", valor: "", prazo_dias: "", observacoes: "" })}>
            <Plus size={15} /> Registrar cotação
          </Button>
        ))}
      </div>

      {enviado && (
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-fg"><PackageOpen size={16} /> Envio</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Código de rastreio" className="col-span-2"><input className="input" value={envio.codigo_rastreio} disabled={!podeCotar} onChange={(e) => setEnvio({ ...envio, codigo_rastreio: e.target.value })} /></Field>
            <Field label="Data do envio"><input className="input" type="date" value={envio.enviado_em} disabled={!podeCotar} onChange={(e) => setEnvio({ ...envio, enviado_em: e.target.value })} /></Field>
            <Field label="Volumes"><input className="input" type="number" min={1} value={volumes} disabled={!podeCotar} onChange={(e) => setEnvio({ ...envio, volumes: Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {pedido.enviado_em && <span className="mr-auto self-center text-xs text-slate-500">Enviado em {dataBR(pedido.enviado_em)}</span>}
            {pedido.cliente?.whatsapp && (
              <a href={whatsappLink(pedido.cliente.whatsapp, msgEnvio)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                <Send size={15} /> Avisar cliente do envio
              </a>
            )}
            {podeCotar && <Button type="button" variant="secondary" onClick={salvarEnvio}>Salvar envio</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
