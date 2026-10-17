// Painel de Notas fiscais: quanto foi faturado em nota, quanto de imposto saiu destacado, o que entrou de fornecedores,
// por CFOP e por estado, e o que está travado (rejeitadas, na fila, notas de fornecedor a resolver).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Calculator, CircleCheck, CircleX, FileInput, FileText, FileWarning, Hourglass, Landmark, Percent, Plus, Receipt, Scale, ShieldCheck,
  TriangleAlert, Undo2,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brl, pl } from "@/lib/format";
import type { NotaEmitida } from "@/components/nfe/NotaDetalhe";
import { ProximasObrigacoes } from "@/components/contador/CalendarioObrigacoes";

// mesmos selects das listas de notas: o que já foi carregado serve aos dois
const SELECT_EMITIDAS = "*, pedido:pedidos(numero, cliente:clientes(nome, nome_fantasia)), transferencia:transferencias(numero, destino_id)";
const CAMPOS_RECEBIDA = "id, chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, situacao, manifestacao, nfe_completa, fornecedor_id, conta_pagar_id, estoque_lancado, processamento, processamento_msg, unidade_id, origem, marcadores, observacao_interna, finalidade";
type Recebida = { id: string; emitente_nome: string | null; valor_total: number; data_emissao: string | null; situacao: string; processamento: string; finalidade?: string | null; unidade_id?: string | null; excluida_em?: string | null };
type Nfse = { id: string; status: string; ambiente?: string; created_at: string; unidade_id?: string | null };

const IMPOSTOS: [string, string, (i: any) => number][] = [
  ["ICMS", "var(--serie-1)", (i) => Number(i.icms_valor ?? 0)],
  ["ICMS-ST", "var(--kpi-ciano)", (i) => Number(i.icms_valor_st ?? 0)],
  ["IPI", "var(--serie-2)", (i) => Number(i.ipi_valor ?? 0)],
  ["PIS", "var(--kpi-roxo)", (i) => Number(i.pis_valor ?? 0)],
  ["COFINS", "var(--kpi-rosa)", (i) => Number(i.cofins_valor ?? 0)],
  ["IBS", "var(--serie-3)", (i) => Number(i.ibs_valor ?? 0) || Number(i.ibs_uf_valor ?? 0) + Number(i.ibs_mun_valor ?? 0)],
  ["CBS", "var(--kpi-laranja)", (i) => Number(i.cbs_valor ?? 0)],
];
const real = (n: { ambiente?: string | null }) => n.ambiente !== "homologacao";
const venda = (n: NotaEmitida) => n.status === "autorizada" && real(n) && n.finalidade !== "devolucao";
const itensDe = (n: NotaEmitida): any[] => (Array.isArray(n.payload?.items) ? n.payload.items : []);

export default function PainelNotas() {
  const navigate = useNavigate();
  const { pode, papel, tem } = usePerfil();
  // calendário de obrigações: quem marca e acompanha (financeiro, contador e administrador)
  const veObrigacoes = tem("financeiro") || papel === "contador";
  const veRecebidas = pode("nfe_recebidas") || papel === "contador";
  const { filtrar } = useUnidade();
  const { data: emTodas = [], isLoading } = useRows<NotaEmitida & { excluida_em?: string | null }>("notas_fiscais", { select: SELECT_EMITIDAS });
  const { data: recTodas = [] } = useRows<Recebida>("nfe_recebidas", { select: CAMPOS_RECEBIDA, order: "data_emissao" });
  const { data: nfseTodas = [] } = useQuery({
    queryKey: ["nfse", "todas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nfse").select("*, os:ordens_servico!nfse_os_id_fkey(numero)").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Nfse[];
    },
  });
  // notas de serviço feitas fora do ERP (Tiny, prefeitura, Emissor Nacional) também contam
  const { data: nfseForaTodas = [] } = useRows<{ unidade_id: string; tipo: string; situacao: string; data_emissao: string }>("nfse_importadas", {
    select: "unidade_id, tipo, situacao, data_emissao", order: "data_emissao", key: ["painel"],
  });
  const [periodo, setPeriodo] = usePeriodo("notas");
  const [fCfop, setFCfop] = useState<string | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;

  const emitidas = useMemo(() => filtrar(emTodas).filter((n) => !n.excluida_em), [emTodas, filtrar]);
  const recebidas = useMemo(() => (veRecebidas ? filtrar(recTodas).filter((n) => !n.excluida_em) : []), [recTodas, filtrar, veRecebidas]);
  const nfse = filtrar(nfseTodas);
  const nfseFora = filtrar(nfseForaTodas).filter((n) => n.tipo === "emitida" && n.situacao === "normal");

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const bs = baldes(periodo);
    const vendasEm = (f: [string, string]) => emitidas.filter((n) => venda(n) && dentro(n.created_at, f));
    const comprasEm = (f: [string, string]) => recebidas.filter((n) => n.situacao !== "cancelada" && n.finalidade !== "devolucao" && dentro(n.data_emissao, f));
    const soma = (l: { valor_total: number }[]) => l.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);
    const vAtual = vendasEm(atual), vAnt = vendasEm(anterior);
    const cAtual = comprasEm(atual);

    // itens das notas do período (com o filtro de CFOP, quando escolhido)
    const itens = vAtual.flatMap((n) => itensDe(n).map((i) => ({ ...i, uf: n.payload?.uf_destinatario as string | undefined })));
    const doCfop = fCfop ? itens.filter((i) => String(i.cfop) === fCfop) : itens;
    const impostos = IMPOSTOS.map(([rotulo, cor, f]) => ({ rotulo, cor, valor: doCfop.reduce((s, i) => s + f(i), 0) })).filter((x) => x.valor > 0);
    const totalImpostos = impostos.reduce((s, x) => s + x.valor, 0);
    const baseItens = doCfop.reduce((s, i) => s + Number(i.valor_bruto ?? 0), 0);
    const semDetalhe = vAtual.filter((n) => !itensDe(n).length).length;

    const agrupar = <T,>(l: T[], chave: (x: T) => string, valor: (x: T) => number) => {
      const m = new Map<string, { valor: number; qtd: number }>();
      for (const x of l) { const c = chave(x); const v = m.get(c) ?? { valor: 0, qtd: 0 }; v.valor += valor(x); v.qtd++; m.set(c, v); }
      return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor);
    };
    const cfops = agrupar(itens, (i) => String(i.cfop ?? "—"), (i) => Number(i.valor_bruto ?? 0));
    const ufs = agrupar(vAtual.filter((n) => !fCfop || itensDe(n).some((i) => String(i.cfop) === fCfop)), (n) => n.payload?.uf_destinatario ?? "—", (n) => Number(n.valor_total));
    const fornecedores = agrupar(cAtual, (n) => n.emitente_nome ?? "—", (n) => Number(n.valor_total));

    const doPeriodo = emitidas.filter((n) => real(n) && dentro(n.created_at, atual));
    return {
      faturado: soma(vAtual), dFaturado: variacao(soma(vAtual), soma(vAnt)), qtd: vAtual.length, dQtd: variacao(vAtual.length, vAnt.length),
      tendFat: bs.map((b) => soma(vendasEm(b.atual))), tendQtd: bs.map((b) => vendasEm(b.atual).length),
      compras: soma(cAtual), qtdCompras: cAtual.length, tendCompras: bs.map((b) => soma(comprasEm(b.atual))),
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: veRecebidas ? [soma(vendasEm(b.atual)), soma(comprasEm(b.atual))] : [soma(vendasEm(b.atual))] })),
      impostos, totalImpostos, cargaPct: baseItens ? (totalImpostos / baseItens) * 100 : 0, semDetalhe,
      cfops: cfops.slice(0, 7), ufs: ufs.slice(0, 6), fornecedores: fornecedores.slice(0, 6),
      situacao: {
        autorizadas: doPeriodo.filter((n) => n.status === "autorizada" && n.finalidade !== "devolucao").length,
        rejeitadas: emitidas.filter((n) => real(n) && n.status === "erro").length,
        fila: emitidas.filter((n) => real(n) && ["processando", "contingencia"].includes(n.status)).length,
        canceladas: doPeriodo.filter((n) => ["cancelada", "denegada"].includes(n.status)).length,
        devolucoes: doPeriodo.filter((n) => n.finalidade === "devolucao").length,
      },
      aResolver: recebidas.filter((n) => n.situacao !== "cancelada" && ["pendente", "aguardando_xml", "aguardando_vinculo", "revisao"].includes(n.processamento)),
      nfseNoPeriodo: nfse.filter((n) => n.status === "autorizada" && n.ambiente !== "homologacao" && dentro(n.created_at, atual)).length
        + nfseFora.filter((n) => dentro(n.data_emissao, atual)).length,
      nfseRejeitadas: nfse.filter((n) => n.status === "rejeitada").length,
    };
  }, [periodo, emitidas, recebidas, nfse, nfseFora, fCfop, veRecebidas]);

  const cartoes: Cartao[] = [
    { id: "fat", rotulo: "Faturado em NF-e", valor: brl(k.faturado), sub: `${k.qtd} ${pl(k.qtd, "nota", "notas")} de venda ${pl(k.qtd, "autorizada", "autorizadas")}`, icone: Receipt, cor: "var(--kpi-azul)", delta: k.dFaturado, tendencia: k.tendFat,
      onClick: () => navigate("/notas", { state: { aba: "emitidas", filtro: "autorizadas" } }) },
    { id: "imp", rotulo: "Impostos destacados", valor: brl(k.totalImpostos), icone: Percent, cor: "var(--kpi-roxo)",
      sub: k.totalImpostos ? `${k.cargaPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% sobre os produtos${k.semDetalhe ? ` · ${k.semDetalhe} ${pl(k.semDetalhe, "nota", "notas")} ${pl(k.semDetalhe, "importada", "importadas")} sem o detalhe` : ""}` : "nenhum imposto destacado no período" },
    ...(veRecebidas ? [{ id: "comp", rotulo: "Compras (NF-e de fornecedores)", valor: brl(k.compras), sub: `${k.qtdCompras} ${pl(k.qtdCompras, "nota", "notas")} ${pl(k.qtdCompras, "recebida", "recebidas")}`, icone: FileInput, cor: "var(--kpi-laranja)", tendencia: k.tendCompras,
      onClick: () => navigate("/notas", { state: { aba: "recebidas" } }) } as Cartao] : []),
    { id: "nfse", rotulo: "NFS-e (serviços)", valor: k.nfseNoPeriodo, sub: k.nfseRejeitadas ? `${k.nfseRejeitadas} ${pl(k.nfseRejeitadas, "rejeitada", "rejeitadas")} para corrigir` : "notas de serviço autorizadas", icone: FileText, cor: "var(--kpi-ciano)",
      onClick: () => navigate("/notas", { state: { aba: "nfse" } }) },
  ];

  const atencao: ItemAtencao[] = [
    k.situacao.rejeitadas > 0 && { icone: TriangleAlert, cor: "var(--kpi-rosa)", texto: `${k.situacao.rejeitadas} NF-e ${pl(k.situacao.rejeitadas, "rejeitada", "rejeitadas")} pela Sefaz`, sub: "abra, leia o motivo e use Corrigir e reenviar", to: "/notas", state: { aba: "emitidas", filtro: "pendentes" } },
    k.situacao.fila > 0 && { icone: Hourglass, cor: "var(--kpi-laranja)", texto: `${k.situacao.fila} NF-e processando ou na fila de contingência`, to: "/notas", state: { aba: "emitidas", filtro: "pendentes" } },
    k.aResolver.length > 0 && { icone: FileWarning, cor: "var(--kpi-roxo)", texto: `${k.aResolver.length} ${pl(k.aResolver.length, "nota", "notas")} de fornecedor a resolver`, sub: "vincular produtos, conferir e lançar", to: "/notas", state: { aba: "recebidas", filtro: "pendentes" } },
    k.nfseRejeitadas > 0 && { icone: TriangleAlert, cor: "var(--kpi-rosa)", texto: `${k.nfseRejeitadas} NFS-e ${pl(k.nfseRejeitadas, "rejeitada", "rejeitadas")} pela prefeitura`, to: "/notas", state: { aba: "nfse" } },
  ].filter(Boolean) as ItemAtencao[];

  const resumo = isLoading ? "Carregando…" : k.qtd
    ? <>{k.qtd} {pl(k.qtd, "nota", "notas")} de venda somando {brl(k.faturado)}{frasePeriodo(k.dFaturado, periodo) ? ` · ${frasePeriodo(k.dFaturado, periodo)}` : ""}. Impostos destacados: {brl(k.totalImpostos)}.</>
    : <>Nenhuma NF-e de venda autorizada {periodo === "hoje" ? "hoje" : "no período"}.</>;

  const situacoes: { rotulo: string; n: number; icone: typeof Receipt; cor: string; filtro: string }[] = [
    { rotulo: "Autorizadas", n: k.situacao.autorizadas, icone: CircleCheck, cor: "var(--kpi-verde)", filtro: "autorizadas" },
    { rotulo: "Rejeitadas", n: k.situacao.rejeitadas, icone: TriangleAlert, cor: "var(--kpi-rosa)", filtro: "pendentes" },
    { rotulo: "Na fila", n: k.situacao.fila, icone: Hourglass, cor: "var(--kpi-laranja)", filtro: "pendentes" },
    { rotulo: "Canceladas", n: k.situacao.canceladas, icone: CircleX, cor: "var(--eixo-texto)", filtro: "canceladas" },
    { rotulo: "Devoluções", n: k.situacao.devolucoes, icone: Undo2, cor: "var(--kpi-roxo)", filtro: "devolucoes" },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={FileText} area="Notas fiscais" titulo="Como estão as notas" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo}
        acoes={pode("emitir_nfe") && (
          <button type="button" onClick={() => navigate("/notas", { state: { emitir: true } })}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-3.5 text-sm font-bold text-modulo-texto shadow hover:bg-white/90">
            <Plus size={16} /> Emitir NF-e
          </button>
        )} />

      {fCfop && <FiltrosAtivos filtros={[{ rotulo: "CFOP", valor: fCfop, limpar: () => setFCfop(null) }]} onLimpar={() => setFCfop(null)} />}

      <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${cartoes.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      {veObrigacoes && <ProximasObrigacoes />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title={veRecebidas ? "Notas de venda x notas de fornecedores" : "Notas de venda"} className="xl:col-span-3">
          <Colunas dados={k.serie} altura={250} vazio="Nenhuma nota no período."
            series={veRecebidas ? [{ nome: "Vendas (saída)", cor: "var(--serie-1)" }, { nome: "Compras (entrada)", cor: "var(--serie-2)" }] : [{ nome: "Vendas (saída)", cor: "var(--serie-1)" }]} />
        </Section>
        <Section title={fCfop ? `Impostos destacados · CFOP ${fCfop}` : "Impostos destacados"} className="xl:col-span-2">
          {k.impostos.length
            ? <Rosca total="Impostos" fatias={k.impostos} />
            : <p className="py-10 text-center text-sm text-slate-500">Nenhum imposto destacado no período.</p>}
        </Section>
      </div>

      <Section title="Situação das NF-e">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {situacoes.map((s) => (
            <button key={s.rotulo} type="button" onClick={() => navigate("/notas", { state: { aba: "emitidas", filtro: s.filtro } })}
              className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${s.cor} 16%, transparent)`, color: s.cor }}><s.icone size={19} /></span>
              <span className="min-w-0"><span className="num block text-xl font-bold leading-none text-fg">{s.n}</span><span className="mt-1 block text-xs text-slate-500">{s.rotulo}</span></span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Autorizadas, canceladas e devoluções: no período. Rejeitadas e na fila: todas as que estão paradas agora.</p>
      </Section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Por CFOP" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          <Ranking ativo={fCfop} onClicar={(i) => { const c = k.cfops[i][0]; setFCfop(fCfop === c ? null : c); }} vazio="Nenhuma nota com itens no período."
            itens={k.cfops.map(([cfop, v]) => ({ rotulo: cfop, valor: v.valor, detalhe: `${v.qtd} ${pl(v.qtd, "item", "itens")}` }))} />
        </Section>
        <Section title="Para onde vendemos (UF)">
          <Ranking cor="var(--serie-2)" vazio="Nenhuma nota no período."
            itens={k.ufs.map(([uf, v]) => ({ rotulo: uf === "—" ? "Sem UF na nota" : uf, valor: v.valor, detalhe: `${v.qtd} ${pl(v.qtd, "nota", "notas")}` }))} />
        </Section>
        <Section title="Precisa de atenção" className="md:col-span-2 xl:col-span-1">
          <ListaAtencao itens={atencao} vazio="Nenhuma nota travada" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {veRecebidas && (
          <Section title="Maiores fornecedores (notas recebidas)" className="xl:col-span-3">
            <Ranking cor="var(--serie-2)" vazio="Nenhuma nota de fornecedor no período."
              itens={k.fornecedores.map(([nome, v]) => ({ rotulo: nome, valor: v.valor, detalhe: `${v.qtd} ${pl(v.qtd, "nota", "notas")}` }))} />
          </Section>
        )}
        <div className={`space-y-3 ${veRecebidas ? "xl:col-span-2" : "xl:col-span-5"}`}>
          <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
          <AtalhosArea colunas={veRecebidas ? "grid-cols-3" : undefined} itens={[
            { rotulo: "NF-e emitidas", icone: Receipt, to: "/notas", state: { aba: "emitidas" }, aviso: k.situacao.rejeitadas + k.situacao.fila },
            ...(veRecebidas ? [{ rotulo: "NF-e de fornecedores", icone: FileInput, to: "/notas", state: { aba: "recebidas", filtro: "pendentes" }, aviso: k.aResolver.length }] : []),
            { rotulo: "NFS-e", icone: FileText, to: "/notas", state: { aba: "nfse" }, aviso: k.nfseRejeitadas },
            { rotulo: "Pendências fiscais", icone: ShieldCheck, to: "/notas", state: { aba: "compliance" } },
            { rotulo: "Painel do contador", icone: Calculator, to: "/contador", tela: "contador" },
            { rotulo: "Analista fiscal", icone: Scale, to: "/analista-fiscal", tela: "contador" },
          ]} />
          <div className="flex items-start gap-2 rounded-2xl border border-slate-200/80 bg-surface p-3 text-xs text-slate-500 shadow-card">
            <Landmark size={16} className="mt-0.5 shrink-0 text-modulo-texto" aria-hidden />
            Impostos destacados são os que saíram nas notas (débitos). A apuração do mês, com os créditos das compras, fica no Painel do contador e no Analista fiscal.
          </div>
        </div>
      </div>
    </div>
  );
}
