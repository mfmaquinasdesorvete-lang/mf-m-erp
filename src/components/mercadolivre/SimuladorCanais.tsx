// Loja online e marketplace → Simulador: escolhe um produto e vê, em cada canal (loja por Pix, cartão e link; Mercado
// Livre Clássico e Premium), quanto fica para a MF, o preço mínimo, o preço para o lucro desejado e quanto dá para
// gastar em anúncio por venda. O custo vem do cadastro ou das compras; as taxas da loja das Configurações; a tarifa e o
// frete do Mercado Livre da API, na hora. "Como foi calculado" mostra cada conta e a fonte. Não grava nada.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calculator, RefreshCw } from "lucide-react";
import { Button, Card, Carregando, ErroLista, Field, Section, Vazio } from "@/components/ui";
import { brl } from "@/lib/format";
import { callFunction, supabase } from "@/lib/supabase";
import { useConfig } from "@/lib/useConfig";
import { configPreco } from "@/lib/precificacao";
import { lerValor } from "@/lib/auditoriaBusca";
import { ultimaAVista } from "@/lib/maquinas";
import { useHistoricoCustos } from "@/components/produtos/FichaProduto";
import { calcularCanal, type Canal, type Resultado } from "@/lib/simuladorCanais";
import { tarifaFixa } from "../../../supabase/functions/_shared/ml-novos";

type ProdutoSim = { id: string; sku: string | null; descricao: string; tipo: string; preco_venda: number; preco_custo: number | null; margem_desejada: number | null };
type Tarifas = {
  preco: number; categoria: { id: string; nome: string | null; fonte: string };
  tipos: { id: string; nome: string; pct: number | null; fixa: number; fonte: string }[];
  frete: { valor: number | null; desde: number; medidas: string; estimado: boolean; fonte: string };
  consultado_em: string; avisos: string[];
};
type FonteCusto = "cadastro" | "avista" | "ultima";

/** Imposto efetivo sobre a venda das peças (Lucro Real, saindo de SC), em % do preço, sem o IPI (cobrado à parte) e sem
 *  IRPJ/CSLL; e o crédito das compras com nota (ICMS de 12% + PIS/COFINS de 9,25% do custo). Passados pelo chat Fiscal
 *  em 27/10 e usados só na simulação, enquanto as Configurações estão com 0%. A apuração oficial é do contador. */
const IMPOSTO_LOJA = 25, IMPOSTO_ML = 27, CREDITO_COMPRAS = 21.25;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pctTxt = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function SimuladorCanais() {
  const { data: cfgBruta } = useConfig();
  const cfg = useMemo(() => configPreco(cfgBruta?.precificacao), [cfgBruta]);
  const produtos = useQuery({
    queryKey: ["produtos", "simulador"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("id, sku, descricao, tipo, preco_venda, preco_custo, margem_desejada")
        .eq("ativo", true).eq("no_catalogo", true).gt("preco_venda", 0).order("descricao");
      if (error) throw error;
      return (data ?? []) as ProdutoSim[];
    },
  });
  const [id, setId] = useState("");
  const p = produtos.data?.find((x) => x.id === id) ?? null;
  const [fonteCusto, setFonteCusto] = useState<FonteCusto>("cadastro");
  const [imposto, setImposto] = useState("");
  const [impostoML, setImpostoML] = useState("");
  const [credito, setCredito] = useState(true);
  const [lucroDesejado, setLucroDesejado] = useState("");
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const historico = useHistoricoCustos(id);

  // preço que está no Mercado Livre (anúncio ligado) ou o da proposta
  const precoML = useQuery({
    queryKey: ["ml_anuncios", "simulador", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: a } = await supabase.from("ml_anuncios").select("ml_item_id, ml_anuncios_envio(preco_ml)").eq("produto_id", id).limit(1).maybeSingle();
      const doAnuncio = num((a as any)?.ml_anuncios_envio?.preco_ml ?? (a as any)?.ml_anuncios_envio?.[0]?.preco_ml);
      if (doAnuncio > 0) return { valor: doAnuncio, fonte: `preço do anúncio ${(a as any).ml_item_id}` };
      const { data: pr } = await supabase.from("ml_propostas").select("preco").eq("produto_id", id).maybeSingle();
      if (num(pr?.preco) > 0) return { valor: num(pr!.preco), fonte: "preço da proposta de anúncio" };
      return null;
    },
  });
  const ml = precos.ml ?? (precoML.data ? String(precoML.data.valor.toFixed(2)).replace(".", ",") : "");
  const precoMLnum = lerValor(ml) ?? (p ? num(p.preco_venda) : 0);
  const tarifas = useQuery({
    // a tarifa % é da categoria; o preço só muda a tarifa fixa (calculada aqui) e o frete: consulta ao escolher o produto
    // e de novo no botão, com o preço que estiver no campo
    queryKey: ["ml_anuncios", "simulador_tarifas", id],
    enabled: !!id && precoMLnum > 0 && !precoML.isLoading,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => (await callFunction<{ resultado: Tarifas }>("mercadolivre", { acao: "simular_canais", produto_id: id, preco: precoMLnum })).resultado,
  });

  // ao trocar de produto, volta ao padrão: imposto das Configurações e o lucro desejado do produto (ou do tipo)
  useEffect(() => { setPrecos({}); setImposto(""); setImpostoML(""); setLucroDesejado(""); }, [id]);

  const custos = useMemo(() => {
    const l = historico.data ?? [];
    const av = ultimaAVista(l);
    const ult = l.find((x) => x.evento === "compra" && Number(x.valor_unitario) > 0);
    return {
      cadastro: { valor: num(p?.preco_custo), fonte: "custo do cadastro do produto" },
      avista: av ? { valor: av.valor, fonte: `última compra à vista (${av.detalhe})` } : null,
      ultima: ult ? { valor: num(ult.valor_unitario), fonte: `última compra (${String(ult.detalhe ?? "").trim() || "nota de entrada"})` } : null,
    };
  }, [historico.data, p]);
  const custoBase = (fonteCusto !== "cadastro" && custos[fonteCusto]) || custos.cadastro;
  // crédito de imposto das compras com nota: o custo de verdade é menor que o da nota
  const custo = credito && custoBase.valor > 0
    ? { valor: Math.round(custoBase.valor * (1 - CREDITO_COMPRAS / 100) * 100) / 100, fonte: `${custoBase.fonte}, menos ${pctTxt(CREDITO_COMPRAS)} de crédito de ICMS e PIS/COFINS da compra (sugestão do chat Fiscal)` }
    : custoBase;

  // imposto: o digitado aqui; senão o das Configurações; com 0% lá, o efetivo que o chat Fiscal passou
  const impPadrao = (pctSugerido: number) => (cfg.impostos_pct > 0 ? { v: cfg.impostos_pct, o: "Configurações → Formação de preço → impostos" } : { v: pctSugerido, o: "imposto efetivo sugerido pelo chat Fiscal (Configurações estão com 0%)" });
  const impLoja = imposto.trim() ? { v: lerValor(imposto) ?? 0, o: "digitado aqui (não grava)" } : impPadrao(IMPOSTO_LOJA);
  const impML = impostoML.trim() ? { v: lerValor(impostoML) ?? 0, o: "digitado aqui (não grava)" } : impPadrao(IMPOSTO_ML);
  const lucroPadrao = p ? (p.margem_desejada != null ? { v: num(p.margem_desejada), o: "do produto" } : cfg.margens[p.tipo] != null ? { v: num(cfg.margens[p.tipo]), o: "do tipo, nas Configurações" } : { v: cfg.margem_padrao, o: "padrão das Configurações" }) : { v: 0, o: "" };
  const lucroPct = lerValor(lucroDesejado) ?? lucroPadrao.v;

  const canais = useMemo(() => {
    if (!p) return [] as { canal: Canal; padrao: number; fontePreco: string }[];
    const imp = { nome: "Imposto sobre a venda", pct: impLoja.v, fonte: `${impLoja.o}; SC e empresas` };
    const impM = { nome: "Imposto sobre a venda", pct: impML.v, fonte: `${impML.o}; consumidor de outros estados (com DIFAL)` };
    const meio = (id: "pix" | "credito" | "link", nome: string) => ({
      canal: { id, nome, percentuais: [imp, { nome: "Taxa do pagamento", pct: cfg.taxas_meio[id] ?? 0, fonte: `Configurações → Formação de preço → taxa ${nome.split(" · ")[1].toLowerCase()}` }] },
      padrao: num(p.preco_venda), fontePreco: "preço de venda do cadastro (o da loja)",
    });
    const lista: { canal: Canal; padrao: number; fontePreco: string }[] = [meio("pix", "Loja · Pix ou boleto"), meio("credito", "Loja · Cartão de crédito"), meio("link", "Loja · Link de pagamento")];
    for (const t of tarifas.data?.tipos ?? []) {
      lista.push({
        canal: {
          id: t.id, nome: `Mercado Livre · ${t.nome}`,
          percentuais: [impM, { nome: `Tarifa do ${t.nome}`, pct: t.pct ?? 0, fonte: t.fonte }],
          fixa: { valor: tarifaFixa, fonte: "tabela do Mercado Livre (abaixo de R$ 79)" },
          frete: tarifas.data!.frete.valor ? { valor: tarifas.data!.frete.valor, desde: tarifas.data!.frete.desde, fonte: `${tarifas.data!.frete.fonte}${tarifas.data!.frete.estimado ? ", caixa média (sem medidas no cadastro)" : `, caixa ${tarifas.data!.frete.medidas}`}` } : undefined,
        },
        padrao: precoMLnum, fontePreco: precos.ml ? "digitado aqui" : precoML.data?.fonte ?? "preço da loja (sem anúncio nem proposta)",
      });
    }
    return lista;
  }, [p, impLoja.v, impLoja.o, impML.v, impML.o, cfg, tarifas.data, precoMLnum, precos.ml, precoML.data]);

  return (
    <Section title="Simulador de canais" actions={id ? (
      <Button type="button" variant="secondary" carregando={tarifas.isFetching} onClick={() => tarifas.refetch()} title="Consulta de novo a tarifa e o frete do Mercado Livre">
        <RefreshCw size={15} /> Consultar o Mercado Livre
      </Button>
    ) : undefined}>
      <p className="mb-3 text-sm text-slate-600">
        Escolha um produto e veja quanto fica para a MF em cada canal, o preço mínimo (lucro zero), o preço para o lucro desejado e quanto dá para gastar em anúncio por venda.
        Nada aqui muda preço ou anúncio.
      </p>
      {produtos.error ? <ErroLista erro={produtos.error} onTentar={() => produtos.refetch()} /> : produtos.isLoading ? <Carregando linhas={3} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Produto" className="sm:col-span-2">
            <select className="input" value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Escolha…</option>
              {(produtos.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.descricao}{x.sku ? ` (${x.sku})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Custo usado" dica={custo.valor ? `${brl(custo.valor)} · ${custo.fonte}` : "sem custo: preencha no cadastro"}>
            <select className="input" value={fonteCusto} onChange={(e) => setFonteCusto(e.target.value as FonteCusto)} disabled={!p}>
              <option value="cadastro">Custo do cadastro</option>
              <option value="avista" disabled={!custos.avista}>Última compra à vista{custos.avista ? "" : " (nenhuma)"}</option>
              <option value="ultima" disabled={!custos.ultima}>Última compra{custos.ultima ? "" : " (nenhuma)"}</option>
            </select>
          </Field>
          <Field label="Lucro desejado (%)" dica={lucroDesejado.trim() ? "só nesta simulação" : lucroPadrao.o}>
            <input className="input num" inputMode="decimal" placeholder={pctTxt(lucroPadrao.v)} value={lucroDesejado} onChange={(e) => setLucroDesejado(e.target.value)} disabled={!p} />
          </Field>
          <Field label="Imposto na loja (%)" dica={imposto.trim() ? "só nesta simulação" : "SC e empresas"}>
            <input className="input num" inputMode="decimal" placeholder={pctTxt(impLoja.v)} value={imposto} onChange={(e) => setImposto(e.target.value)} disabled={!p} />
          </Field>
          <Field label="Imposto no Mercado Livre (%)" dica={impostoML.trim() ? "só nesta simulação" : "consumidor de outros estados"}>
            <input className="input num" inputMode="decimal" placeholder={pctTxt(impML.v)} value={impostoML} onChange={(e) => setImpostoML(e.target.value)} disabled={!p} />
          </Field>
          <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2 lg:self-end lg:pb-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={credito} onChange={(e) => setCredito(e.target.checked)} disabled={!p} />
            <span>Abater do custo o crédito das compras com nota ({pctTxt(CREDITO_COMPRAS)}: ICMS 12% e PIS/COFINS 9,25%)</span>
          </label>
        </div>
      )}

      {p && !cfg.impostos_pct && (
        <p className="mt-3 flex items-start gap-1.5 rounded-cartao bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> O imposto sobre a venda está em 0% nas Configurações. Aqui entra o imposto efetivo que o chat Fiscal passou ({IMPOSTO_LOJA}% na loja, {IMPOSTO_ML}% no Mercado Livre); dá para digitar outro. IRPJ e CSLL ficam de fora.
        </p>
      )}

      {!p ? (
        !produtos.isLoading && <Vazio titulo="Escolha um produto para simular" texto="Aparecem os produtos da loja (ativos, no catálogo e com preço)." />
      ) : (
        <div className="mt-4 space-y-3">
          {tarifas.error && <p className="text-sm text-red-700">Não deu para consultar o Mercado Livre: {(tarifas.error as Error).message}. A loja aparece; o Mercado Livre volta quando a consulta responder.</p>}
          {tarifas.isLoading && <p className="text-sm text-slate-500">Consultando a tarifa e o frete no Mercado Livre…</p>}
          {tarifas.data?.avisos.map((a) => <p key={a} className="text-xs text-amber-800">{a}</p>)}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {canais.map(({ canal, padrao, fontePreco }) => {
              const chave = canal.id.startsWith("gold") ? "ml" : canal.id;
              const texto = precos[chave] ?? String(padrao.toFixed(2)).replace(".", ",");
              const preco = lerValor(texto) ?? 0;
              return (
                <CartaoCanal key={canal.id} nome={canal.nome} preco={texto} fontePreco={chave === "ml" ? fontePreco : precos[chave] ? "digitado aqui" : fontePreco}
                  onPreco={(v) => setPrecos((x) => ({ ...x, [chave]: v }))} r={preco > 0 ? calcularCanal(canal, preco, custo.valor, custo.fonte, lucroPct) : null} lucroPct={lucroPct} />
              );
            })}
          </div>
          {tarifas.data && (
            <p className="text-xs text-slate-500">
              Mercado Livre: {tarifas.data.categoria.nome ?? tarifas.data.categoria.id} ({tarifas.data.categoria.fonte}), consultado às {new Date(tarifas.data.consultado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
              Os dois tipos de anúncio do Mercado Livre usam o mesmo preço.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function CartaoCanal({ nome, preco, fontePreco, onPreco, r, lucroPct }: { nome: string; preco: string; fontePreco: string; onPreco: (v: string) => void; r: Resultado | null; lucroPct: number }) {
  const negativo = !!r && r.lucro < 0;
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"><Calculator size={15} aria-hidden /> {nome}</h3>
      <Field label="Preço de venda" dica={fontePreco}>
        <input className="input num" inputMode="decimal" value={preco} onChange={(e) => onPreco(e.target.value)} aria-label={`Preço de venda em ${nome}`} />
      </Field>
      {!r ? <p className="mt-2 text-sm text-slate-500">Digite um preço.</p> : (
        <>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-sm text-slate-600">Lucro por venda</span>
            <span className={`num text-xl font-bold ${negativo ? "text-red-700" : "text-emerald-700"}`}>{brl(r.lucro)} <span className="text-sm font-semibold">({pctTxt(r.margemPct)})</span></span>
          </div>
          {negativo && <p className="text-xs font-semibold text-red-700">Prejuízo neste preço.</p>}
          <dl className="mt-2 space-y-1 text-sm">
            <Par rotulo="Preço mínimo (lucro zero)" valor={r.precoMinimo != null ? brl(r.precoMinimo) : "—"} />
            <Par rotulo={`Preço para ${pctTxt(lucroPct)} de lucro`} valor={r.precoComLucro != null ? brl(r.precoComLucro) : "não fecha"} />
            <Par rotulo="Verba de anúncio por venda" valor={r.anuncio.verba > 0 ? brl(r.anuncio.verba) : "nenhuma"} />
            <Par rotulo="ACoS máximo · ROAS mínimo" valor={r.anuncio.acosPct != null ? `${pctTxt(r.anuncio.acosPct)} · ${r.anuncio.roas?.toLocaleString("pt-BR")}` : "—"} />
          </dl>
          <details className="mt-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-fg">Como foi calculado</summary>
            <ul className="mt-1.5 space-y-1">
              <li><b className="text-fg">Preço</b> {brl(r.preco)} · {fontePreco}</li>
              {r.linhas.map((l) => (
                <li key={l.nome}><b className="text-fg">− {l.nome}</b> {brl(l.valor)} ({l.conta}) · {l.fonte}</li>
              ))}
              <li><b className="text-fg">= Lucro</b> {brl(r.lucro)}</li>
              <li>Preço mínimo: preço × (1 − soma dos %) = custo + tarifa fixa (abaixo de R$ 79) + frete grátis (a partir de R$ 79).</li>
              <li>Verba de anúncio: o lucro que passa de {pctTxt(lucroPct)} do preço. ACoS = verba ÷ preço; ROAS = preço ÷ verba.</li>
            </ul>
          </details>
        </>
      )}
    </Card>
  );
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="flex justify-between gap-2"><dt className="text-slate-600">{rotulo}</dt><dd className="num font-semibold text-fg">{valor}</dd></div>;
}
