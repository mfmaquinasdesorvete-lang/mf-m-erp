// Vendas do Mercado Livre depois da venda (fase A): a situação do envio no Mercado Livre (vem com cada venda), a NF-e
// anexada à venda e o rastreio dos envios por conta própria, com "Tentar de novo" e "Mandar agora". O envio fica na
// função mercadolivre (ação pos_venda, a cada 10 minutos); a fila e as tentativas ficam no banco.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2, RotateCcw, Send } from "lucide-react";
import { Button, Card, Table, chip } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import type { ContaML } from "@/lib/mlAnuncios";
import { COR_TOM, pedeAtencao, situacaoNota, situacaoRastreio, textoEnvio, textoModo, textoResumoPosVenda, type Etiqueta, type VendaML } from "@/lib/mlPosVenda";
import { LigarProduto, quando, type AnuncioLigar } from "./AnunciosMercadoLivre";

const COLUNAS = "id, ml_order_id, ml_pack_id, pedido_id, data_venda, comprador, total, logistica, situacao, pendencia, envio_status, envio_substatus, envio_modo, rastreio_ml, envio_atualizado_em, nota_enviada_em, nota_erro, nota_tentativas, rastreio_enviado_em, rastreio_erro, rastreio_tentativas, pedidos:pedidos(numero, codigo_rastreio)";
const LIMITE = 300;

type Filtro = "todas" | "atencao" | "fila";

function Selo({ e }: { e: Etiqueta }) {
  return (
    <span className="block">
      <span className={`inline-flex max-w-full rounded-full px-2 py-0.5 text-left text-xs font-semibold sm:whitespace-nowrap ${COR_TOM[e.tom]}`}>{e.texto}</span>
      {e.detalhe && <span className="mt-0.5 block max-w-[16rem] break-words text-xs text-slate-500">{e.detalhe}</span>}
    </span>
  );
}

export function VendasMercadoLivre({ conta }: { conta: ContaML | null }) {
  const { papel } = usePerfil();
  const invalidar = useInvalidate();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ligar, setLigar] = useState<AnuncioLigar | null>(null);
  const emiteErp = !!conta?.emitir_nfe;

  const vendas = useQuery({
    queryKey: ["ml_pedidos", "pos_venda"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ml_pedidos").select(COLUNAS).order("data_venda", { ascending: false, nullsFirst: false }).limit(LIMITE);
      if (error) throw error;
      return (data ?? []) as unknown as VendaML[];
    },
    refetchInterval: 120_000,
  });
  const lista = vendas.data ?? [];
  const pedidos = useMemo(() => [...new Set(lista.map((v) => v.pedido_id).filter(Boolean) as string[])], [lista]);
  const notas = useQuery({
    queryKey: ["notas_fiscais", "ml_autorizadas", pedidos],
    enabled: pedidos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("notas_fiscais").select("pedido_id").eq("status", "autorizada").in("pedido_id", pedidos);
      if (error) throw error;
      return new Set((data ?? []).map((n: { pedido_id: string }) => n.pedido_id));
    },
  });
  const comNota = (v: VendaML) => !!v.pedido_id && !!notas.data?.has(v.pedido_id);

  const atencao = lista.filter((v) => pedeAtencao(v, emiteErp, comNota(v)));
  const naFila = lista.filter((v) => situacaoNota(v, emiteErp, comNota(v)).tom === "fila");
  const mostradas = filtro === "atencao" ? atencao : filtro === "fila" ? naFila : lista;

  async function mandarAgora() {
    setOcupado("tudo");
    try {
      const r = await callFunction<{ resultado?: Parameters<typeof textoResumoPosVenda>[0] }>("mercadolivre", { acao: "pos_venda" });
      notify(textoResumoPosVenda(r?.resultado));
    } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("ml_pedidos");
    }
  }

  async function tentarDeNovo(v: VendaML) {
    setOcupado(v.id);
    const { error } = await supabase.rpc("ml_tentar_de_novo", { p_ml_pedido: v.id });
    setOcupado(null);
    if (error) return notifyError(error);
    notify("Voltou para a fila: vai na próxima rodada (até 10 minutos) ou agora, em \"Mandar agora\".");
    invalidar("ml_pedidos");
  }

  /** Venda parada por anúncio sem produto: acha o anúncio dela e abre o "Ligar" ali mesmo. */
  async function ligarDaVenda(v: VendaML) {
    setOcupado(v.id);
    try {
      const { data, error } = await supabase.from("ml_pedidos").select("dados").eq("id", v.id).single();
      if (error) throw error;
      const itens = ((data?.dados as { itens?: { item_id?: string; variation_id?: string | null }[] } | null)?.itens ?? []).filter((i) => i.item_id);
      if (!itens.length) return notify("Não achei os itens desta venda. Use a aba Anúncios.", "erro");
      const r = await supabase.from("ml_anuncios").select("id, ml_item_id, variation_id, titulo, sku, produto_id").in("ml_item_id", itens.map((i) => i.item_id!));
      if (r.error) throw r.error;
      const lista = (r.data ?? []) as { id: string; ml_item_id: string; variation_id: string; titulo: string | null; sku: string | null; produto_id: string | null }[];
      const a = lista.find((x) => !x.produto_id && itens.some((i) => i.item_id === x.ml_item_id && (i.variation_id ?? "") === (x.variation_id ?? "")))
        ?? lista.find((x) => !x.produto_id);
      if (!a) { notify("Os anúncios desta venda já estão ligados: use \"Tentar de novo\"."); return; }
      setLigar({ anuncio_id: a.id, ml_item_id: a.ml_item_id, variation_id: a.variation_id || null, titulo: a.titulo, sku: a.sku });
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  async function mudarEmissor(ligar: boolean) {
    if (!conta) return;
    setOcupado("emissor");
    const { error } = await supabase.rpc("ml_configurar", { p_conta: conta.id, p_emitir_nfe: ligar });
    setOcupado(null);
    if (error) return notifyError(error);
    notify(ligar ? "Pronto: as NF-e autorizadas no ERP vão para as vendas do Mercado Livre." : "O ERP não manda mais a NF-e para o Mercado Livre.");
    invalidar("ml_contas", "ml_pedidos");
  }

  if (!conta) {
    return <Card className="p-4 text-sm text-slate-600">Conecte a conta do Mercado Livre (aba Conectar a conta) para ver as vendas, o envio e as notas.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-fg">{emiteErp ? "O ERP manda a NF-e para cada venda do Mercado Livre" : "A NF-e das vendas do Mercado Livre não vai pelo ERP"}</div>
          <p className="text-slate-600">
            {emiteErp
              ? "Assim que a nota do pedido é autorizada, o XML vai para a venda no Mercado Livre (a cada 10 minutos). No envio por conta própria, o rastreio da expedição também vai."
              : "Enquanto outro sistema (ex.: Tiny) emite a nota das vendas do Mercado Livre, é ele quem manda. Ligue quando o ERP passar a emitir."}
          </p>
        </div>
        {papel === "admin" && (
          <Button type="button" variant="secondary" disabled={ocupado === "emissor"} onClick={() => mudarEmissor(!emiteErp)}>
            {ocupado === "emissor" && <Loader2 size={15} className="animate-spin" />} {emiteErp ? "Desligar" : "Ligar: o ERP emite a NF-e"}
          </Button>
        )}
        <Button type="button" disabled={!!ocupado || conta.status !== "ativa"} onClick={mandarAgora}
          title={conta.status === "ativa" ? "Manda agora as NF-e e os rastreios da fila" : "A conta precisa estar ativa"}>
          {ocupado === "tudo" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Mandar agora
        </Button>
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar vendas">
        {([["todas", `Todas (${lista.length})`], ["atencao", `Pedem atenção (${atencao.length})`], ["fila", `NF-e na fila (${naFila.length})`]] as const).map(([v, t]) => (
          <button key={v} type="button" onClick={() => setFiltro(v)} aria-pressed={filtro === v}
            className={chip(filtro === v, "border-brand bg-brand-light text-brand")}>{t}</button>
        ))}
      </div>

      {vendas.error ? <Card className="p-4 text-sm text-red-700">Não deu para ler as vendas: {(vendas.error as Error).message}</Card> : (
        <Table empty={!vendas.isLoading && !mostradas.length} head={<>
          <th className="th">Venda</th><th className="th">Envio no Mercado Livre</th><th className="th">NF-e</th><th className="th">Rastreio</th><th className="th" />
        </>}>
          {mostradas.map((v) => {
            const envio = textoEnvio(v.envio_status, v.envio_substatus);
            const nota = situacaoNota(v, emiteErp, comNota(v));
            const rastreio = situacaoRastreio(v);
            const erro = nota.tom === "erro" || nota.tom === "atencao" || rastreio?.tom === "erro" || rastreio?.tom === "atencao";
            const codigo = v.rastreio_ml || v.pedidos?.codigo_rastreio;
            return (
              <tr key={v.id}>
                <td className="td">
                  <span className="font-semibold text-fg">{v.pedidos?.numero ? `Pedido #${v.pedidos.numero}` : "Sem pedido no ERP"}</span>
                  <span className="num block text-xs text-slate-500">ML {v.ml_pack_id || v.ml_order_id} · {quando(v.data_venda)}{v.total != null ? ` · ${brl(v.total)}` : ""}</span>
                  {v.comprador && <span className="block max-w-[16rem] truncate text-xs text-slate-500">{v.comprador}</span>}
                  {(v.situacao === "pendente" || v.situacao === "erro") && <span className="mt-0.5 block max-w-[16rem] text-xs text-amber-800">{v.pendencia ?? "A venda não entrou no ERP"}</span>}
                  {(v.situacao === "pendente" || v.situacao === "erro") && !v.pedido_id && /anúncio/i.test(v.pendencia ?? "") && (
                    <Button type="button" className="mt-1 !min-h-0 !py-1 text-xs" disabled={ocupado === v.id} onClick={() => ligarDaVenda(v)}>
                      {ocupado === v.id ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Ligar anúncio a um produto
                    </Button>
                  )}
                </td>
                <td className="td">
                  <Selo e={envio} />
                  <span className="mt-0.5 block text-xs text-slate-500">{textoModo(v.envio_modo, v.logistica)}</span>
                  {codigo && <span className="num block text-xs text-slate-500">Rastreio {codigo}</span>}
                </td>
                <td className="td"><Selo e={nota} /></td>
                <td className="td">{rastreio ? <Selo e={rastreio} /> : <span className="text-xs text-slate-500">pelo Mercado Livre</span>}</td>
                <td className="td text-right">
                  {erro && (
                    <Button type="button" variant="secondary" disabled={ocupado === v.id} onClick={() => tentarDeNovo(v)}>
                      {ocupado === v.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Tentar de novo
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {ligar && <LigarProduto anuncio={ligar} onClose={() => setLigar(null)} onPronto={() => { setLigar(null); invalidar("ml_pedidos", "ml_anuncios", "pedidos", "produtos"); }} />}
      {lista.length >= LIMITE && <p className="text-xs text-slate-500">Mostrando as {LIMITE} vendas mais recentes.</p>}
    </div>
  );
}
