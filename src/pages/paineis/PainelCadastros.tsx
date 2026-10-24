// Painel de Cadastros: a base de clientes (novos, quem comprou, quem sumiu, onde estão) e a qualidade dos cadastros
// de clientes e produtos, que é o que faz a NF-e, a cobrança e o estoque saírem certos. Tocar num estado filtra a lista.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Factory, FileWarning, IdCard, Package, PackageX, ShieldAlert, ShoppingCart, Store, Truck, UserPlus, Users, UserX, Wrench,
} from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking, Rosca } from "@/components/Charts";
import { FichaCliente } from "@/components/FichaCliente";
import {
  AtalhosArea, baldes, CabecalhoPainel, CartaoPainel, dentro, FiltrosAtivos, frasePeriodo, intervalos, ListaAtencao, PERIODOS, usePeriodo, variacao,
  type Cartao, type ItemAtencao,
} from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { dataBR, digitos, somarDias, pl } from "@/lib/format";
import type { Cliente, Produto } from "@/lib/types";
import { vendasDaEmpresa } from "@/lib/gerencial";
import { SELECT_NOTAS_VENDAS, SELECT_PEDIDOS_VENDAS } from "@/lib/paineisProdutos";
import { FONTE_DESDE, desdeReal, type ClienteDesde } from "@/lib/clienteDesde";

const CORES = ["var(--serie-1)", "var(--serie-3)", "var(--serie-2)", "var(--kpi-roxo)", "var(--kpi-rosa)", "var(--kpi-ciano)", "var(--eixo-texto)"];
const tag = (c: Cliente, t: string) => (c.tags ?? []).includes(t);
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const nomeDe = (c: Cliente) => c.nome_fantasia?.trim() || c.nome;

export default function PainelCadastros() {
  const navigate = useNavigate();
  const { podeVer } = usePerfil();
  // mesmos selects das telas de clientes, produtos e fornecedores: o que já foi carregado serve aos dois
  const { data: clientes = [], isLoading } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: fornecedores = [] } = useRows<{ id: string; ativo?: boolean }>("fornecedores", { order: "nome", ascending: true });
  const { data: pedidos = [] } = useRows<{ cliente_id: string; created_at: string; status: string }>("pedidos", { select: "cliente_id, created_at, status" });
  // vendas de verdade (as mesmas do Painel gerencial): pedidos aprovados + notas de venda importadas do sistema anterior,
  // com o cliente achado pelo CPF/CNPJ quando a nota não veio ligada ao cadastro
  const { data: pedidosV = [] } = useRows<any>("pedidos", { select: SELECT_PEDIDOS_VENDAS, key: ["gerencial"] });
  const { data: notasV = [] } = useRows<any>("notas_fiscais", { select: SELECT_NOTAS_VENDAS, key: ["gerencial"] });
  // "cliente novo" pela data real (cadastro no Tiny, compra da máquina, 1ª venda, proposta…): os cadastros trazidos do
  // Tiny e das planilhas têm a data da importação, que não é a data em que a pessoa virou cliente
  const { data: desdes = [] } = useRows<ClienteDesde>("clientes_desde", { select: "cliente_id, desde, fonte", order: "cliente_id", key: ["rodada"] });
  const [periodo, setPeriodo] = usePeriodo("cadastros");
  const [fUf, setFUf] = useState<string | null>(null);
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const per = PERIODOS.find((p) => p.id === periodo)!;

  const k = useMemo(() => {
    const { atual, anterior } = intervalos(periodo);
    const bs = baldes(periodo);
    const vendas = pedidos.filter((p) => !["orcamento", "cancelado"].includes(p.status));
    const todas = vendasDaEmpresa(pedidosV, notasV, clientes);
    const desde = new Map(desdes.map((d) => [d.cliente_id, d]));
    const novos = (f: [string, string]) => clientes.filter((c) => { const d = desde.get(c.id); return desdeReal(d) && dentro(d!.desde, f); });
    const semData = desdes.filter((d) => !desdeReal(d)).length;
    // todos que compraram (ERP + notas importadas) e só os do ERP novo
    const compraram = (f: [string, string]) => new Set(todas.filter((v) => dentro(v.data, f)).map((v) => v.cliente));
    const noErp = (f: [string, string]) => new Set(vendas.filter((p) => dentro(p.created_at, f)).map((p) => p.cliente_id));
    const ultimaCompra = new Map<string, string>();
    for (const v of todas) if (v.clienteId && (ultimaCompra.get(v.clienteId) ?? "") < v.data) ultimaCompra.set(v.clienteId, v.data);
    const seisMeses = somarDias(-180);
    const sumidos = [...ultimaCompra.entries()].filter(([, d]) => d.slice(0, 10) < seisMeses).length;

    const porUf = new Map<string, number>();
    for (const c of clientes) { const uf = c.uf || "Sem endereço"; porUf.set(uf, (porUf.get(uf) ?? 0) + 1); }
    const ufs = [...porUf.entries()].sort((a, b) => b[1] - a[1]);
    const principais = ufs.slice(0, 6);
    const outros = ufs.slice(6).reduce((s, [, n]) => s + n, 0);

    const pj = clientes.filter((c) => digitos(c.cpf_cnpj).length === 14);
    const total = clientes.length;
    const qualidade = [
      { rotulo: "CPF ou CNPJ", n: clientes.filter((c) => [11, 14].includes(digitos(c.cpf_cnpj).length)).length, base: total },
      { rotulo: "WhatsApp ou telefone", n: clientes.filter((c) => c.whatsapp || c.telefone).length, base: total },
      { rotulo: "E-mail", n: clientes.filter((c) => c.email).length, base: total },
      { rotulo: "Endereço completo (CEP, rua, cidade)", n: clientes.filter((c) => c.cep && c.logradouro && c.municipio && c.uf).length, base: total },
      { rotulo: "CNPJ conferido na Receita", n: pj.filter((c) => c.receita_em).length, base: pj.length },
    ];

    const ativos = produtos.filter((p) => p.ativo !== false);
    const vendaveis = ativos.filter((p) => p.vendavel !== false && p.tipo !== "insumo");
    const fisicos = ativos.filter((p) => !p.kit);
    const problemas = [
      { id: "sem_ncm", rotulo: "Sem NCM válido (NF-e é rejeitada)", lista: ativos.filter((p) => p.vendavel !== false && digitos(p.ncm).length !== 8) },
      { id: "abaixo_custo", rotulo: "Preço de venda abaixo do custo", lista: ativos.filter((p) => Number(p.preco_venda) > 0 && Number(p.preco_custo) > Number(p.preco_venda)) },
      { id: "preco_zerado", rotulo: "Sem preço de venda", lista: vendaveis.filter((p) => !Number(p.preco_venda)) },
      { id: "custo_zerado", rotulo: "Sem custo", lista: fisicos.filter((p) => !Number(p.preco_custo)) },
      { id: "sem_peso", rotulo: "Sem peso (frete)", lista: fisicos.filter((p) => p.tipo !== "insumo" && !Number(p.peso_kg)) },
      { id: "sem_foto", rotulo: "Sem foto no catálogo", lista: ativos.filter((p) => p.no_catalogo && !p.foto_caminho) },
    ].filter((x) => x.lista.length);

    // pela data real; importado sem data fica depois, pelo código
    const quando = (c: Cliente) => { const d = desde.get(c.id); return desdeReal(d) ? d!.desde : ""; };
    const recentes = clientes.filter((c) => !fUf || (c.uf || "Sem endereço") === fUf || (fUf === "Outros" && !principais.some(([u]) => u === (c.uf || "Sem endereço"))))
      .sort((a, b) => quando(b).localeCompare(quando(a)) || Number(b.codigo ?? 0) - Number(a.codigo ?? 0)).slice(0, 6)
      .map((c) => ({ c, d: desde.get(c.id) }));

    return {
      total, semData, novos: novos(atual).length, dNovos: variacao(novos(atual).length, novos(anterior).length),
      compraram: compraram(atual).size, dCompraram: variacao(compraram(atual).size, compraram(anterior).size),
      noErp: noErp(atual).size, dNoErp: variacao(noErp(atual).size, noErp(anterior).size), tendNoErp: bs.map((b) => noErp(b.atual).size),
      tendNovos: bs.map((b) => novos(b.atual).length), tendCompraram: bs.map((b) => compraram(b.atual).size),
      serie: bs.map((b) => ({ rotulo: b.rotulo, valores: [novos(b.atual).length, compraram(b.atual).size] })),
      sumidos, nuncaCompraram: clientes.filter((c) => !ultimaCompra.has(c.id)).length,
      ufs: outros > 0 ? [...principais, ["Outros", outros] as [string, number]] : principais,
      qualidade, problemas, produtosAtivos: ativos.length,
      irregulares: clientes.filter((c) => tag(c, "cnpj_irregular")), ieBaixada: clientes.filter((c) => tag(c, "ie_baixada")),
      semDoc: clientes.filter((c) => ![11, 14].includes(digitos(c.cpf_cnpj).length)).length,
      recentes,
    };
  }, [periodo, clientes, desdes, produtos, pedidos, pedidosV, notasV, fUf]);

  const fornecedoresAtivos = fornecedores.filter((f) => f.ativo !== false).length;
  const semNcm = k.problemas.find((p) => p.rotulo.startsWith("Sem NCM"))?.lista.length ?? 0;
  const abaixoCusto = k.problemas.find((p) => p.rotulo.startsWith("Preço de venda abaixo"))?.lista.length ?? 0;

  const cartoes: Cartao[] = [
    { id: "clientes", rotulo: "Clientes", valor: k.total.toLocaleString("pt-BR"), icone: Users, cor: "var(--kpi-roxo)",
      sub: `${k.nuncaCompraram.toLocaleString("pt-BR")} ainda sem nenhuma compra`, onClick: () => navigate("/clientes") },
    { id: "novos", rotulo: "Clientes novos", valor: k.novos, icone: UserPlus, cor: "var(--kpi-verde)", delta: k.dNovos, tendencia: k.tendNovos,
      sub: "pela data real: cadastro no Tiny, compra, 1ª venda ou proposta",
      titulo: k.semData ? `${k.semData.toLocaleString("pt-BR")} cadastros importados ainda sem a data do Tiny não contam como novos` : undefined },
    { id: "compraram", rotulo: "Compraram", valor: k.compraram, icone: Store, cor: "var(--kpi-azul)", delta: k.dCompraram, tendencia: k.tendCompraram,
      sub: "clientes diferentes: vendas do ERP + notas importadas do sistema anterior" },
    { id: "no_erp", rotulo: "No ERP novo", valor: k.noErp, icone: ShoppingCart, cor: "var(--kpi-verde)", delta: k.dNoErp, tendencia: k.tendNoErp,
      sub: "clientes com venda aprovada feita no ERP Line", onClick: () => navigate("/pedidos") },
    { id: "sumidos", rotulo: "Sumiram", valor: k.sumidos, icone: UserX, cor: "var(--kpi-laranja)", bomCair: true,
      sub: "compraram antes e nada nos últimos 6 meses", titulo: "Lista completa em Análises → Painel gerencial", onClick: () => navigate("/gerencial?aba=clientes") },
  ];

  const atencao: ItemAtencao[] = [
    k.irregulares.length > 0 && { icone: ShieldAlert, cor: "var(--kpi-rosa)", texto: `${k.irregulares.length} ${pl(k.irregulares.length, "cliente", "clientes")} com CNPJ irregular na Receita`, sub: k.irregulares.slice(0, 3).map(nomeDe).join(" · "), to: "/clientes" },
    k.ieBaixada.length > 0 && { icone: AlertTriangle, cor: "var(--kpi-laranja)", texto: `${k.ieBaixada.length} ${pl(k.ieBaixada.length, "cliente", "clientes")} com inscrição estadual baixada`, sub: "confira antes de emitir nota como contribuinte", to: "/clientes" },
    k.semDoc > 0 && { icone: FileWarning, cor: "var(--kpi-roxo)", texto: `${k.semDoc} ${pl(k.semDoc, "cliente", "clientes")} sem CPF ou CNPJ`, sub: "não dá para emitir NF-e para eles", to: "/clientes" },
    semNcm > 0 && { icone: FileWarning, cor: "var(--kpi-rosa)", texto: `${semNcm} ${pl(semNcm, "produto", "produtos")} sem NCM válido`, sub: "a NF-e é rejeitada", to: "/estoque" },
    abaixoCusto > 0 && { icone: PackageX, cor: "var(--kpi-rosa)", texto: `${abaixoCusto} ${pl(abaixoCusto, "produto", "produtos")} com preço abaixo do custo`, sub: "cada venda dá prejuízo", to: "/estoque" },
  ].filter(Boolean) as ItemAtencao[];

  const resumo = isLoading ? "Carregando…"
    : <>{k.total.toLocaleString("pt-BR")} clientes ({k.novos} {pl(k.novos, "novo", "novos")}{frasePeriodo(k.dNovos, periodo) ? `, ${frasePeriodo(k.dNovos, periodo)}` : ""}) · {k.produtosAtivos.toLocaleString("pt-BR")} produtos ativos · {fornecedoresAtivos} fornecedores.</>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <CabecalhoPainel icone={Users} area="Cadastros" titulo="Como está a base" resumo={resumo} periodo={periodo} onPeriodo={setPeriodo} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4 xl:grid-cols-5">
        {cartoes.map((c) => <CartaoPainel key={c.id} c={c} anterior={per.anterior} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title={fUf ? `Clientes · ${fUf}` : "Clientes mais recentes"} actions={<span className="text-xs text-slate-500">toque para abrir a ficha</span>}>
          {fUf && <div className="mb-3"><FiltrosAtivos filtros={[{ rotulo: "Estado", valor: fUf, limpar: () => setFUf(null) }]} onLimpar={() => setFUf(null)} /></div>}
          {k.recentes.length ? (
            <ul className="divide-y divide-slate-100">
              {k.recentes.map(({ c, d }) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setFicha(c)} className="linha-clicavel flex items-center gap-3 px-1 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-modulo/10 text-sm font-bold text-modulo-texto">{nomeDe(c).slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{nomeDe(c)}</span>
                      <span className="block truncate text-xs text-slate-500">{[c.municipio && `${c.municipio}/${c.uf ?? ""}`, desdeReal(d) ? `desde ${dataBR(d!.desde)} (${FONTE_DESDE[d!.fonte] ?? d!.fonte})` : "importado, sem a data do Tiny"].filter(Boolean).join(" · ") || "—"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-sm text-slate-500">Nenhum cliente aqui.</p>}
        </Section>
        <Section title="Cadastro dos clientes: o que está preenchido">
          <Ranking cor="var(--serie-3)" formatar={(v) => `${v}%`} onClicar={() => navigate("/clientes")}
            itens={k.qualidade.filter((q) => q.base).map((q) => ({ rotulo: q.rotulo, valor: pct(q.n, q.base), detalhe: `${q.n.toLocaleString("pt-BR")} de ${q.base.toLocaleString("pt-BR")}` }))} />
        </Section>
        <Section title="Precisa de atenção" className="md:col-span-2 xl:col-span-1">
          <ListaAtencao itens={atencao} vazio="Cadastros em ordem" />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Clientes novos x clientes que compraram" className="xl:col-span-3">
          <Colunas dados={k.serie} altura={250} formatar={(v) => `${v}`} inteiro vazio="Nenhum cliente novo nem venda no período."
            series={[{ nome: "Novos", cor: "var(--serie-3)" }, { nome: "Compraram", cor: "var(--serie-1)" }]} />
        </Section>
        <Section title="Onde estão os clientes" className="xl:col-span-2" actions={<span className="text-xs text-slate-500">toque para filtrar</span>}>
          <Rosca total="Clientes" formatar={(v) => `${v}`} ativo={fUf} onClicar={(i) => { const u = k.ufs[i][0]; setFUf(fUf === u ? null : u); }}
            fatias={k.ufs.map(([rotulo, valor], i) => ({ rotulo, valor, cor: CORES[i % CORES.length] }))} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Cadastro dos produtos: o que falta" className="xl:col-span-3"
          actions={<button type="button" onClick={() => navigate("/estoque?aba=qualidade")} className="link-modulo text-sm">Corrigir</button>}>
          {/* tocar numa linha abre a Qualidade do cadastro já naquele problema */}
          <Ranking cor="var(--kpi-rosa)" formatar={(v) => `${v} ${pl(v, "item", "itens")}`} vazio="Nenhum problema nos produtos ativos. ✅" onClicar={(i) => navigate(`/estoque?aba=qualidade&problema=${k.problemas[i]?.id ?? ""}`)}
            itens={k.problemas.map((p) => ({ rotulo: p.rotulo, valor: p.lista.length, detalhe: p.lista.slice(0, 3).map((x) => x.descricao).join(" · ") + (p.lista.length > 3 ? "…" : "") }))} />
          <p className="mt-2 text-xs text-slate-500">Toque numa linha para ver só aqueles itens e corrigir um por um.</p>
        </Section>
        <div className="space-y-3 xl:col-span-2">
          <h2 className="flex items-center gap-2 px-1 text-sm font-bold text-fg"><span className="h-4 w-1 rounded-full bg-modulo" aria-hidden />Ir para</h2>
          <AtalhosArea colunas="grid-cols-3" itens={[
            { rotulo: "Clientes", icone: Users, to: "/clientes", aviso: k.irregulares.length, tela: "clientes" },
            { rotulo: "Máquinas", icone: Factory, to: "/produtos/maquinas", tela: "estoque" },
            { rotulo: "Peças à venda", icone: Wrench, to: "/produtos/pecas", tela: "estoque" },
            { rotulo: "Tornearia", icone: Wrench, to: "/produtos/tornearia", tela: "estoque" },
            { rotulo: "Insumos", icone: Package, to: "/produtos/componentes", tela: "estoque" },
            { rotulo: "Fornecedores", icone: Store, to: "/fornecedores", tela: "fornecedores" },
            { rotulo: "Transportadoras", icone: Truck, to: "/transportadoras", tela: "fornecedores" },
            ...(podeVer("funcionarios") ? [{ rotulo: "Funcionários", icone: IdCard, to: "/funcionarios" }] : []),
          ]} />
        </div>
      </div>

      {ficha && <FichaCliente cliente={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
