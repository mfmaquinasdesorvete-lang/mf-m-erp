// Frete no pedido, direto e rápido: escolhe como fica o frete (4 opções) e, se for cobrar do cliente,
// cota com as transportadoras ali mesmo (WhatsApp com os dados prontos → digita o valor → "Usar"). Aparecem só as
// poucas que atendem o destino do cliente; as outras ficam na busca "outra transportadora" (tela curta no celular e tablet).
// O envio detalhado (volumes, coleta, rastreio, conferência) continua na aba "Frete e envio".
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, History, MessageCircle, Plus, Truck, X } from "lucide-react";
import { Button, chip } from "@/components/ui";
import { useRows, ler } from "@/lib/data";
import { brl, dataBR, whatsappLink, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useConfig } from "@/lib/useConfig";
import type { Cliente, Item, Produto, Transportadora } from "@/lib/types";
import { sugerirTransportadoras } from "@/lib/freteSugestao";
import { referenciasFrete, type FretePassado } from "@/lib/freteHistorico";

type Modo = "sem" | "cobrar" | "gratis" | "fob";
const MODOS: { value: Modo; label: string; dica: string }[] = [
  { value: "sem", label: "Sem frete", dica: "cliente retira ou não há transporte" },
  { value: "cobrar", label: "Cobrar do cliente", dica: "nós enviamos e o frete entra no pedido" },
  { value: "gratis", label: "Frete grátis", dica: "nós enviamos e pagamos (CIF)" },
  { value: "fob", label: "Cliente contrata", dica: "o cliente paga a transportadora (FOB)" },
];
const modoDe = (modalidade: number | null | undefined, frete: number) =>
  Number(modalidade) === 1 ? "fob" : Number(modalidade) === 0 ? (frete > 0 ? "cobrar" : "gratis") : "sem";

type Props = {
  pedido: { id?: string; status?: string; frete?: number | null; modalidade_frete?: number | null; transportadora_id?: string | null; valor_produtos?: number; itens: Item[] };
  cliente?: Cliente;
  produtos: Produto[];
  disabled: boolean;
  podeCotar: boolean;
  onChange: (patch: { frete?: number; modalidade_frete?: number; transportadora_id?: string | null }) => void;
};

export function FreteRapido({ pedido, cliente, produtos, disabled, podeCotar, onChange }: Props) {
  const { data: cfg } = useConfig();
  const { data: transportadoras = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const frete = Number(pedido.frete || 0);
  const [modo, setModo] = useState<Modo>(() => modoDe(pedido.modalidade_frete, frete));
  const [cotando, setCotando] = useState(false);
  // mudou por fora (envio aprovado, cotação escolhida): acompanha; "cobrar" sem valor ainda não vira "grátis"
  useEffect(() => {
    const m = modoDe(pedido.modalidade_frete, frete);
    if (m !== modo && !(modo === "cobrar" && m === "gratis")) setModo(m);
  }, [pedido.modalidade_frete, frete]); // eslint-disable-line react-hooks/exhaustive-deps
  // texto do valor (aceita vírgula enquanto digita); acompanha quando o valor muda por fora (cotação usada)
  // "1.250,50" e "12,5" (vírgula decimal) ou "12.50" (ponto decimal do teclado do celular)
  const paraNum = (t: string) => Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "")) || 0;
  const [freteTxt, setFreteTxt] = useState(frete ? String(frete).replace(".", ",") : "");
  useEffect(() => { if (paraNum(freteTxt) !== frete) setFreteTxt(frete ? String(frete).replace(".", ",") : ""); }, [frete]); // eslint-disable-line react-hooks/exhaustive-deps
  const [precos, setPrecos] = useState<Record<string, { valor: string; prazo: string }>>({});
  const { data: salvas = [], refetch } = useQuery({
    queryKey: ["cotacoes_frete", pedido.id],
    enabled: !!pedido.id && cotando,
    queryFn: async () => ((await ler(supabase.from("cotacoes_frete").select("id, transportadora_id, transportadora_nome, valor, prazo_dias, escolhida").eq("pedido_id", pedido.id!).order("valor"))) ?? []) as
      { id: string; transportadora_id: string | null; transportadora_nome: string | null; valor: number; prazo_dias: number | null; escolhida: boolean }[],
  });

  // o que já cobramos de frete para este cliente, esta cidade ou este estado: sugestão na hora
  const { data: historico = [] } = useQuery({
    queryKey: ["pedidos", "fretes-historico"],
    enabled: modo === "cobrar" && !disabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const linhas = ((await ler(supabase.from("pedidos").select("id, frete, transportadora_id, created_at, cliente_id, cliente:clientes(uf, municipio)")
        .gt("frete", 0).neq("status", "cancelado").order("created_at", { ascending: false }).limit(1500))) ?? []) as unknown as
        { id: string; frete: number; transportadora_id: string | null; created_at: string; cliente_id: string | null; cliente: { uf: string | null; municipio: string | null } | null }[];
      return linhas.map((l) => ({ id: l.id, frete: Number(l.frete), transportadora_id: l.transportadora_id, data: l.created_at.slice(0, 10), cliente_id: l.cliente_id,
        uf: l.cliente?.uf ?? null, municipio: l.cliente?.municipio ?? null }));
    },
  });
  const refs = useMemo(() => referenciasFrete(historico.filter((h) => h.id !== pedido.id) as (FretePassado & { id: string })[],
    { cliente_id: cliente?.id, uf: cliente?.uf, municipio: cliente?.municipio }), [historico, pedido.id, cliente?.id, cliente?.uf, cliente?.municipio]);

  const ativas = transportadoras.filter((t) => t.ativo && !t.matriz_id).sort((a, b) => Number(!!b.whatsapp) - Number(!!a.whatsapp) || a.nome.localeCompare(b.nome));
  const [extras, setExtras] = useState<string[]>([]);
  const sugeridas = useMemo(() => sugerirTransportadoras(ativas, cliente?.uf, cliente?.municipio,
    [pedido.transportadora_id, ...salvas.map((c) => c.transportadora_id)].filter(Boolean) as string[]), [ativas, cliente?.uf, cliente?.municipio, pedido.transportadora_id, salvas]);
  const naLista = [...sugeridas, ...extras.map((id) => ativas.find((t) => t.id === id)).filter((t): t is Transportadora => !!t && !sugeridas.includes(t))];
  const outras = ativas.filter((t) => !naLista.includes(t));
  const nomeT = (id: string | null | undefined) => { const t = transportadoras.find((x) => x.id === id); return t ? (t.nome_fantasia?.trim() || t.nome) : ""; };

  // dados da carga para a transportadora
  const carga = useMemo(() => pedido.itens.map((i) => ({ i, p: produtos.find((x) => x.id === i.produto_id) })), [pedido.itens, produtos]);
  const peso = carga.reduce((s, { i, p }) => s + Number(i.quantidade) * Number(p?.peso_kg ?? 0), 0);
  const volumes = carga.reduce((s, { i }) => s + Math.ceil(Number(i.quantidade)), 0);
  const medidas = carga.filter(({ p }) => p?.altura_cm).map(({ i, p }) => `${i.quantidade}x ${p!.altura_cm}×${p!.largura_cm}×${p!.profundidade_cm} cm`);
  const valorNota = pedido.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
  const destino = [cliente?.municipio, cliente?.uf].filter(Boolean).join("/");
  const mensagem = [
    `Olá! Aqui é da *MF Máquinas*. Pode cotar este frete?`,
    `Origem: ${[cfg?.municipio, cfg?.uf].filter(Boolean).join("/") || "nossa fábrica"}`,
    `Destino: ${destino || "a definir"}${cliente?.cep ? ` (CEP ${cliente.cep})` : ""}`,
    `Mercadoria: ${pedido.itens.map((i) => `${i.quantidade}x ${i.descricao}`).join("; ")}`,
    peso ? `Peso total: ${peso.toLocaleString("pt-BR")} kg` : "",
    `Volumes: ${volumes}`,
    medidas.length ? `Medidas: ${medidas.join("; ")}` : "",
    valorNota ? `Valor da nota: ${brl(valorNota)}` : "",
    `Preciso do valor e do prazo de entrega. Obrigado!`,
  ].filter(Boolean).join("\n");

  function escolherModo(m: Modo) {
    setModo(m);
    if (m === "sem") onChange({ modalidade_frete: 9, frete: 0 });
    if (m === "gratis") onChange({ modalidade_frete: 0, frete: 0 });
    if (m === "fob") onChange({ modalidade_frete: 1, frete: 0 });
    if (m === "cobrar") { onChange({ modalidade_frete: 0 }); if (!frete && podeCotar) setCotando(true); }
  }

  async function usar(transportadoraId: string | null, valor: number, prazo: number | null, nomeLivre?: string) {
    if (!(valor > 0)) return notifyError(new Error("informe o valor do frete"));
    onChange({ frete: valor, modalidade_frete: 0, transportadora_id: transportadoraId });
    setModo("cobrar");
    // pedido já salvo: guarda a cotação (histórico e comparação no Fretes)
    if (pedido.id && pedido.status === "orcamento") {
      const { data, error } = await supabase.from("cotacoes_frete").insert({ pedido_id: pedido.id, transportadora_id: transportadoraId, transportadora_nome: transportadoraId ? null : nomeLivre ?? null,
        valor, prazo_dias: prazo }).select("id").single();
      if (error) { notifyError(error); return; }
      const { error: e2 } = await supabase.rpc("escolher_cotacao_frete", { p_cotacao: data.id, p_cobrar_cliente: true });
      if (e2) { notifyError(e2); return; }
      refetch();
    }
    notify(`Frete de ${brl(valor)}${transportadoraId ? ` (${nomeT(transportadoraId)})` : ""} no pedido`);
    setCotando(false);
  }

  return (
    <div className="col-span-2 rounded-xl border border-slate-200 p-3 sm:col-span-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Truck size={16} aria-hidden /> Frete</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Como fica o frete">
          {MODOS.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={modo === m.value} disabled={disabled} title={m.dica} onClick={() => escolherModo(m.value)}
              className={`${chip(modo === m.value, "border-modulo bg-modulo-escuro text-white")} disabled:opacity-60`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-600">{MODOS.find((m) => m.value === modo)?.dica}{pedido.transportadora_id ? ` · transportadora: ${nomeT(pedido.transportadora_id)}` : ""}</p>

      {modo === "cobrar" && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs font-semibold text-slate-600">Valor do frete (R$)
            <input className="input mt-1 w-36 text-right" inputMode="decimal" disabled={disabled} value={freteTxt} placeholder="0,00"
              onChange={(e) => { const t = e.target.value.replace(/[^\d,.]/g, ""); setFreteTxt(t); onChange({ frete: paraNum(t), modalidade_frete: 0 }); }} />
          </label>
          <label className="flex w-full flex-col text-xs font-semibold text-slate-600 sm:w-auto sm:min-w-48 sm:max-w-xs sm:flex-1">Transportadora
            <select className="input mt-1" disabled={disabled} value={pedido.transportadora_id ?? ""} onChange={(e) => onChange({ transportadora_id: e.target.value || null })}>
              <option value="">—</option>{ativas.map((t) => <option key={t.id} value={t.id}>{t.nome_fantasia?.trim() || t.nome}</option>)}
            </select>
          </label>
          {podeCotar && !disabled && <Button type="button" variant={cotando ? "ghost" : "secondary"} onClick={() => setCotando(!cotando)}>{cotando ? "Fechar cotação" : "Cotar frete"}</Button>}
        </div>
      )}

      {modo === "cobrar" && !disabled && refs.length > 0 && (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5 text-sm">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><History size={14} aria-hidden /> Fretes que já cobramos (toque para usar)</p>
          <ul className="space-y-1.5">
            {refs.map((r) => {
              const t = r.porTransportadora[0];
              return (
                <li key={r.onde} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 flex-1 basis-48 text-xs text-slate-600">
                    <b className="text-fg">{r.rotulo}</b> · {r.quantas} {pl(r.quantas, "vez", "vezes")}
                    {r.quantas > 1 ? ` · de ${brl(r.menor)} a ${brl(r.maior)}` : ""} · último {brl(r.ultimo.frete)} em {dataBR(r.ultimo.data)}
                    {t ? ` · mais usada: ${nomeT(t.transportadora_id)}` : ""}
                  </span>
                  <span className="flex gap-1.5">
                    <Button type="button" tamanho="mini" variant="secondary"
                      onClick={() => usar(r.ultimo.transportadora_id, r.ultimo.frete, null)}>Usar o último {brl(r.ultimo.frete)}</Button>
                    {r.quantas > 2 && r.mediana !== r.ultimo.frete && (
                      <Button type="button" tamanho="mini" variant="secondary"
                        onClick={() => usar(t?.transportadora_id ?? null, r.mediana, null)}>Usar o típico {brl(r.mediana)}</Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-2xs text-slate-500">É o que foi cobrado do cliente nas vendas; confirme com a transportadora se o peso for bem diferente.</p>
        </div>
      )}

      {cotando && modo === "cobrar" && !disabled && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="mb-2 text-xs text-slate-600">
            {destino || "Destino a definir"}{cliente?.cep ? ` · CEP ${cliente.cep}` : ""} · {peso ? `${peso.toLocaleString("pt-BR")} kg` : "sem peso cadastrado"} · {volumes} {pl(volumes, "volume", "volumes")} · nota {brl(valorNota)}.
            {" "}Peça pelo WhatsApp (a mensagem vai pronta), digite o valor que responderem e clique em <b>Usar</b>.
          </p>
          {!!salvas.length && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {salvas.map((c) => (
                <button key={c.id} type="button" onClick={() => usar(c.transportadora_id, Number(c.valor), c.prazo_dias, c.transportadora_nome ?? undefined)}
                  className={chip(!!c.escolhida, "border-emerald-300 bg-emerald-50 text-emerald-800")}>
                  {c.escolhida && <Check size={12} className="mr-1 inline" aria-hidden />}{nomeT(c.transportadora_id) || c.transportadora_nome} {brl(c.valor)}{c.prazo_dias ? ` · ${c.prazo_dias}d` : ""}
                </button>
              ))}
            </div>
          )}
          <ul className="divide-y divide-slate-200">
            {naLista.map((t) => {
              const v = precos[t.id] ?? { valor: "", prazo: "" };
              const zap = t.whatsapp || t.telefone;
              const extra = extras.includes(t.id) && !sugeridas.includes(t);
              return (
                <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 py-2 sm:flex sm:flex-wrap">
                  <span className="min-w-0 font-medium sm:flex-1 sm:basis-40">
                    <span className="block truncate">{t.nome_fantasia?.trim() || t.nome}</span>
                    {t.regioes ? <span className="block truncate text-xs font-normal text-slate-500">{t.regioes}</span> : null}
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    {zap ? <a className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" href={whatsappLink(zap, mensagem)} target="_blank" rel="noreferrer"><MessageCircle size={14} aria-hidden /> Pedir</a>
                      : <span className="px-2 text-xs text-slate-400">sem WhatsApp</span>}
                    {extra && <button type="button" aria-label={`Tirar ${t.nome} da lista`} className="botao-icone p-1" onClick={() => setExtras((x) => x.filter((id) => id !== t.id))}><X size={14} aria-hidden /></button>}
                  </span>
                  <span className="col-span-2 flex items-center gap-2">
                    <input className="input w-28 py-1 text-right" inputMode="decimal" placeholder="R$" aria-label={`Valor do frete na ${t.nome}`} value={v.valor}
                      onChange={(e) => setPrecos((x) => ({ ...x, [t.id]: { ...v, valor: e.target.value.replace(/[^\d,.]/g, "") } }))} />
                    <input className="input w-20 py-1" inputMode="numeric" placeholder="dias" aria-label={`Prazo da ${t.nome} em dias`} value={v.prazo}
                      onChange={(e) => setPrecos((x) => ({ ...x, [t.id]: { ...v, prazo: e.target.value.replace(/\D/g, "").slice(0, 3) } }))} />
                    <Button type="button" variant="secondary" className="!min-h-0 !py-1" disabled={!v.valor}
                      onClick={() => usar(t.id, paraNum(v.valor), v.prazo ? Number(v.prazo) : null)}>Usar</Button>
                  </span>
                </li>
              );
            })}
            {!naLista.length && <li className="py-2 text-xs text-slate-500">{ativas.length ? "Nenhuma transportadora cadastrada atende este destino: escolha outra abaixo ou digite o valor acima." : "Nenhuma transportadora cadastrada (Cadastros → Transportadoras). Digite o valor acima."}</li>}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {outras.length > 0 && (
              <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Plus size={14} className="shrink-0" aria-hidden />
                <select className="input py-1 text-sm" value="" aria-label="Pôr outra transportadora na cotação"
                  onChange={(e) => e.target.value && setExtras((x) => [...x, e.target.value])}>
                  <option value="">Outra transportadora ({outras.length})…</option>
                  {outras.map((t) => <option key={t.id} value={t.id}>{t.nome_fantasia?.trim() || t.nome}</option>)}
                </select>
              </label>
            )}
            <Button type="button" variant="ghost" className="!min-h-0 !py-1 text-xs"
              onClick={() => navigator.clipboard.writeText(mensagem).then(() => notify("Mensagem da cotação copiada: cole no WhatsApp ou no e-mail"), () => notify("Não deu para copiar", "erro"))}>
              <Copy size={14} aria-hidden /> Copiar a mensagem
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
