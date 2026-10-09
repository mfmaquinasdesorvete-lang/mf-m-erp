// Painel gerencial: para decidir. Vendas do ERP e do sistema anterior juntas, comparadas com o mês e o ano anteriores,
// curva ABC de produtos e clientes, clientes que pararam de comprar, tendências e onde a operação está travando.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Info, Receipt, TrendingUp, Users, XCircle } from "lucide-react";
import { Button, PageHeader, Section, Stat, Tabs } from "@/components/ui";
import { Area } from "@/components/Charts";
import { FichaCliente } from "@/components/FichaCliente";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje } from "@/lib/format";
import { ROTULO_SITUACAO } from "@/lib/fichaCliente";
import {
  carteira, clientesCompradores, curvaABC, estoqueParado, gargalos, indicadores, produtosVendidos, resumoABC, serieMensal, tendencias, vendasDaEmpresa,
  type Comparacao, type LinhaABC,
} from "@/lib/gerencial";
import type { Cliente } from "@/lib/types";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]}/${am.slice(2, 4)}`;
const NIVEL = { erro: { Icon: XCircle, cor: "text-red-600", borda: "border-red-200" }, alerta: { Icon: AlertTriangle, cor: "text-amber-600", borda: "border-amber-200" }, info: { Icon: Info, cor: "text-sky-600", borda: "border-slate-200" } };
type Aba = "abc_produtos" | "abc_clientes" | "clientes" | "tendencias" | "parado";

/** "▲ 12,5% vs mês passado" com seta e texto (não depende só da cor). */
function Variacao({ c, base }: { c: Comparacao; base: string }) {
  if (c.variacao === null) return <>{`${base}: sem vendas para comparar`}</>;
  const sobe = c.variacao >= 0;
  return (
    <span className={sobe ? "text-emerald-700" : "text-red-700"}>
      {sobe ? <ArrowUpRight size={13} className="inline" aria-hidden /> : <ArrowDownRight size={13} className="inline" aria-hidden />}
      {sobe ? " subiu " : " caiu "}{Math.abs(c.variacao).toLocaleString("pt-BR")}% {base}
    </span>
  );
}

export default function Gerencial() {
  const { filtrar } = useUnidade();
  const [aba, setAba] = useState<Aba>("abc_produtos");
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const dia = hoje();

  const { data: pedidos = [], isLoading: l1 } = useRows<any>("pedidos", { select: "id, numero, status, valor_total, created_at, aprovado_em, cliente_id, unidade_id, proposta_status, " +
    "itens:pedido_itens(produto_id, descricao, quantidade, valor_unitario, produto:produtos(sku)), notas:notas_fiscais(status, ambiente)", key: ["gerencial"] });
  const { data: notas = [], isLoading: l2 } = useRows<any>("notas_fiscais", { select: "id, numero, status, ambiente, finalidade, tipo_operacao, pedido_id, valor_total, created_at, payload, cliente_id, destinatario_nome, destinatario_doc, unidade_id", key: ["gerencial"] });
  const { data: clientes = [] } = useRows<Cliente>("clientes", { select: "id, codigo, tipo_pessoa, nome, nome_fantasia, cpf_cnpj, whatsapp, telefone, email, municipio, uf, observacoes, preferencias, contribuinte_icms, inscricao_estadual", key: ["gerencial"] });
  const { data: expedicoes = [] } = useRows<any>("expedicoes", { select: "status, created_at, unidade_id", key: ["gerencial"] });
  const { data: oss = [] } = useRows<any>("ordens_servico", { select: "status, data_entrada, unidade_id", key: ["gerencial"] });
  const { data: compras = [] } = useRows<any>("pedidos_compra", { select: "status, created_at, previsao_entrega, valor_total, unidade_id", key: ["gerencial"] });
  const { data: receber = [] } = useRows<any>("contas_receber", { select: "status, vencimento, valor, unidade_id", key: ["gerencial"] });
  const { data: pagar = [] } = useRows<any>("contas_pagar", { select: "status, vencimento, valor, unidade_id", key: ["gerencial"] });
  const { data: produtos = [] } = useRows<any>("produtos", { select: "id, sku, descricao, ativo, kit, fora_de_linha, sob_encomenda, estoque_atual, estoque_minimo, preco_custo, created_at", key: ["gerencial"] });

  const r = useMemo(() => {
    const vendas = vendasDaEmpresa(filtrar(pedidos), filtrar(notas), clientes);
    const doze = vendas.filter((v) => v.data.slice(0, 10) > new Date(Date.parse(dia) - 365 * 864e5).toISOString().slice(0, 10));
    const parado = estoqueParado(produtos, vendas, dia);
    const cart = carteira(vendas, dia);
    return {
      vendas, k: indicadores(vendas, dia), serie: serieMensal(vendas, dia, 12),
      abcProdutos: curvaABC(produtosVendidos(doze)), abcClientes: curvaABC(clientesCompradores(doze)),
      carteira: cart, tend: tendencias(vendas, dia), parado,
      gargalos: gargalos({ pedidos: filtrar(pedidos), expedicoes: filtrar(expedicoes), oss: filtrar(oss), compras: filtrar(compras), receber: filtrar(receber), pagar: filtrar(pagar), produtos, parado }, dia),
    };
  }, [pedidos, notas, clientes, expedicoes, oss, compras, receber, pagar, produtos, filtrar, dia]);

  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const parados = r.carteira.filter((c) => c.situacao === "em_risco" || c.situacao === "inativo");
  const contagem = (s: string) => r.carteira.filter((c) => c.situacao === s).length;

  return (
    <div>
      {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
      <PageHeader title="Painel gerencial"
        subtitle="Vendas do ERP e do sistema anterior (notas do Tiny) juntas, comparadas com o mês e o ano anteriores. Notas de teste, devoluções, remessas e transferências não entram." />
      {(l1 || l2) && <p className="mb-4 text-sm text-slate-500">Carregando as vendas…</p>}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={CalendarDays} tom="info" label={`Vendas do mês (até ${dataBR(dia).slice(0, 5)})`} valor={brl(r.k.mes.atual)}
          sub={<><Variacao c={r.k.mes} base="vs mesmo período do mês passado" /><br /><Variacao c={r.k.mesAnoAnterior} base="vs o mesmo mês do ano passado" /></>} />
        <Stat icon={TrendingUp} label={`Vendas no ano (${dia.slice(0, 4)})`} valor={brl(r.k.ano.atual)} sub={<Variacao c={r.k.ano} base="vs mesmo período do ano passado" />} />
        <Stat icon={Receipt} label="Últimos 12 meses" valor={brl(r.k.doze.atual)}
          sub={<><Variacao c={r.k.doze} base="vs 12 meses anteriores" /><br />{r.k.vendas.atual} vendas · ticket médio {brl(r.k.ticket.atual)}</>} />
        <Stat icon={Users} label="Clientes que compraram (12 meses)" valor={r.k.clientes.atual}
          sub={<><Variacao c={r.k.clientes} base="vs 12 meses anteriores" /><br />{r.k.novos.atual} novo(s) · {contagem("em_risco")} em risco · {contagem("inativo")} inativo(s)</>} />
      </div>

      <Section title="Onde a operação está travando" className="mb-5">
        {!r.gargalos.length ? <p className="text-sm text-slate-500">Nada travado agora.</p> : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {r.gargalos.map((g) => {
              const { Icon, cor, borda } = NIVEL[g.nivel];
              return (
                <li key={g.chave}>
                  <Link to={g.rota} className={`flex h-full gap-2.5 rounded-xl border ${borda} p-3 text-sm transition hover:shadow-pop`}>
                    <Icon size={18} className={`mt-0.5 shrink-0 ${cor}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-fg">{g.qtd} · {g.titulo}</span>
                      {g.valor ? <span className="block font-semibold text-slate-700">{brl(g.valor)}</span> : null}
                      <span className="block text-slate-600">{g.detalhe}</span>
                    </span>
                    <ArrowRight size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Vendas por mês: últimos 12 meses x ano anterior" className="mb-5">
        <Area dados={r.serie.map((s) => ({ rotulo: rotuloMes(s.mes), valores: [s.atual, s.anoAnterior] }))}
          series={[{ nome: "Últimos 12 meses", cor: "var(--serie-1)" }, { nome: "Mesmo mês do ano anterior", cor: "var(--serie-2)" }]} />
      </Section>

      <Tabs value={aba} onChange={setAba} options={[
        { value: "abc_produtos", label: "Curva ABC de produtos" },
        { value: "abc_clientes", label: "Curva ABC de clientes" },
        { value: "clientes", label: `Clientes parados (${parados.length})` },
        { value: "tendencias", label: "Tendências" },
        { value: "parado", label: `Estoque parado (${r.parado.length})` },
      ]} />

      {(aba === "abc_produtos" || aba === "abc_clientes") && (
        <TabelaABC linhas={aba === "abc_produtos" ? r.abcProdutos : r.abcClientes} tipo={aba === "abc_produtos" ? "produto" : "cliente"} verTodos={verTodos} setVerTodos={setVerTodos}
          abrir={aba === "abc_clientes" ? (chave) => { const c = porId.get(chave); if (c) setFicha(c); } : undefined} />
      )}

      {aba === "clientes" && (
        <Section title="Clientes que pararam de comprar (maiores primeiro)">
          <p className="mb-3 text-sm text-slate-600">Em risco: está demorando mais que o normal para voltar. Inativo: sem comprar há mais de 1 ano. Abra a ficha para ver o histórico e registrar o contato.</p>
          {!parados.length ? <p className="text-sm text-slate-500">Nenhum cliente parado.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Cliente</th><th className="hidden sm:table-cell">Situação</th><th className="text-right">Já comprou</th><th className="text-right">Última compra</th><th className="hidden text-right sm:table-cell">Costuma voltar</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(verTodos ? parados : parados.slice(0, 30)).map((c) => (
                    <tr key={c.cliente}>
                      <td className="py-1.5 font-medium">{c.nome}</td>
                      <td className="hidden sm:table-cell"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROTULO_SITUACAO[c.situacao].cor}`}>{c.situacao === "inativo" ? "Inativo" : "Em risco"}</span></td>
                      <td className="whitespace-nowrap text-right">{brl(c.total)} <span className="text-xs text-slate-500">({c.compras}×)</span></td>
                      <td className="whitespace-nowrap text-right">{dataBR(c.ultima)} <span className="text-xs text-slate-500">({c.semComprar} dias)</span></td>
                      <td className="hidden whitespace-nowrap text-right sm:table-cell">{c.intervaloMedio ? `a cada ${c.intervaloMedio} dias` : "—"}</td>
                      <td className="text-right">{c.clienteId && porId.get(c.clienteId) && <Button variant="ghost" onClick={() => setFicha(porId.get(c.clienteId!)!)}>Ficha</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parados.length > 30 && <Button variant="secondary" className="mt-3" onClick={() => setVerTodos(!verTodos)}>{verTodos ? "Mostrar menos" : `Mostrar todos (${parados.length})`}</Button>}
            </div>
          )}
        </Section>
      )}

      {aba === "tendencias" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {([["Produtos em alta", r.tend.subindo], ["Produtos em queda", r.tend.caindo]] as const).map(([titulo, lista]) => (
            <Section key={titulo} title={`${titulo}: últimos 90 dias x 90 dias anteriores`}>
              {!lista.length ? <p className="text-sm text-slate-500">Nenhum.</p> : (
                <ul className="space-y-2 text-sm">
                  {lista.map((t) => (
                    <li key={t.chave} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">{t.rotulo}</span>
                      <span className="shrink-0 whitespace-nowrap">
                        {brl(t.anterior)} → <b>{brl(t.atual)}</b>{" "}
                        <span className={t.atual >= t.anterior ? "text-emerald-700" : "text-red-700"}>{t.variacao === null ? "(novo)" : `(${t.variacao > 0 ? "+" : ""}${t.variacao.toLocaleString("pt-BR")}%)`}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ))}
        </div>
      )}

      {aba === "parado" && (
        <Section title={`Estoque sem venda há 6 meses · ${brl(r.parado.reduce((s, p) => s + p.valor, 0))} parados (a custo)`}>
          {!r.parado.length ? <p className="text-sm text-slate-500">Nenhum produto parado.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Produto</th><th className="text-right">Estoque</th><th className="text-right">Valor a custo</th><th className="text-right">Última venda</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(verTodos ? r.parado : r.parado.slice(0, 30)).map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5">{p.sku && <span className="mr-1.5 font-mono text-xs text-slate-500">{p.sku}</span>}{p.descricao}</td>
                      <td className="text-right">{p.estoque.toLocaleString("pt-BR")}</td>
                      <td className="whitespace-nowrap text-right font-semibold">{brl(p.valor)}</td>
                      <td className="whitespace-nowrap text-right">{p.ultimaVenda ? dataBR(p.ultimaVenda) : "nunca vendido"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.parado.length > 30 && <Button variant="secondary" className="mt-3" onClick={() => setVerTodos(!verTodos)}>{verTodos ? "Mostrar menos" : `Mostrar todos (${r.parado.length})`}</Button>}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function TabelaABC({ linhas, tipo, verTodos, setVerTodos, abrir }: {
  linhas: LinhaABC[]; tipo: "produto" | "cliente"; verTodos: boolean; setVerTodos: (v: boolean) => void; abrir?: (chave: string) => void;
}) {
  const resumo = resumoABC(linhas);
  const COR = { A: "bg-emerald-50 text-emerald-800", B: "bg-amber-50 text-amber-900", C: "bg-slate-100 text-slate-700" };
  return (
    <Section title={`Curva ABC de ${tipo === "produto" ? "produtos" : "clientes"} · últimos 12 meses`}>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {resumo.map((x) => (
          <div key={x.classe} className={`rounded-xl p-3 text-sm ${COR[x.classe]}`}>
            <div className="text-lg font-bold">Classe {x.classe}</div>
            <div>{x.itens} {tipo === "produto" ? "produto(s)" : "cliente(s)"} ({x.pctItens}%) fazem {x.pctValor}% das vendas · {brl(x.valor)}</div>
          </div>
        ))}
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {tipo === "produto" ? "Classe A: nunca pode faltar no estoque. Classe C: avalie se vale manter, comprar sob encomenda ou montar kit."
          : "Classe A: atendimento prioritário e contato frequente. Classe C: campanhas e ofertas para crescer."}
      </p>
      {!linhas.length ? <p className="text-sm text-slate-500">Sem vendas nos últimos 12 meses.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Classe</th><th>{tipo === "produto" ? "Produto" : "Cliente"}</th><th className="hidden text-right sm:table-cell">{tipo === "produto" ? "Quantidade" : "Compras"}</th><th className="text-right">Vendido</th><th className="hidden text-right sm:table-cell">% / acumulado</th>{abrir && <th />}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(verTodos ? linhas : linhas.slice(0, 30)).map((l) => (
                <tr key={l.chave}>
                  <td className="py-1.5"><span className={`rounded-md px-2 py-0.5 text-xs font-bold ${COR[l.classe]}`}>{l.classe}</span></td>
                  <td>{l.rotulo}</td>
                  <td className="hidden text-right sm:table-cell">{(tipo === "produto" ? l.quantidade : l.vezes).toLocaleString("pt-BR")}</td>
                  <td className="whitespace-nowrap text-right font-semibold">{brl(l.valor)}</td>
                  <td className="hidden whitespace-nowrap text-right sm:table-cell">{l.pct.toLocaleString("pt-BR")}% / {l.acumulado.toLocaleString("pt-BR")}%</td>
                  {abrir && <td className="text-right">{!l.chave.includes(":") && <Button variant="ghost" onClick={() => abrir(l.chave)}>Ficha</Button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {linhas.length > 30 && <Button variant="secondary" className="mt-3" onClick={() => setVerTodos(!verTodos)}>{verTodos ? "Mostrar menos" : `Mostrar todos (${linhas.length})`}</Button>}
        </div>
      )}
    </Section>
  );
}
