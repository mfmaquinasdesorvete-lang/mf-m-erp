// "Vendas do ano" no estilo painel escuro (o mesmo do "Quanto tem para pagar"), na Retaguarda (só a conta master):
// o total do ano no centro do anel, cada trimestre uma cor; à esquerda o mês, os últimos 12 meses, os clientes e o ano
// passado até hoje; à direita cada trimestre com quanto pesa e a comparação com o mesmo trimestre do ano passado.
// Tocar num trimestre mostra só ele. As vendas são as mesmas do Painel gerencial (ERP + notas antigas do Tiny).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Flower2, History, Leaf, Receipt, Snowflake, Sun, Users, type LucideIcon } from "lucide-react";
import { AnelEscuro, LinhaEscura, NumeroEscuro, QuadroEscuro, type FatiaAnel } from "@/components/painel/PainelEscuro";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje as hojeBR, pl } from "@/lib/format";
import { carteira, indicadores, trimestresDoAno, vendasDaEmpresa, type Comparacao } from "@/lib/gerencial";
import { SELECT_CLIENTES_VENDAS, SELECT_NOTAS_VENDAS, SELECT_PEDIDOS_VENDAS } from "@/lib/paineisProdutos";

type Trimestre = Comparacao & { trimestre: number };
type Indicadores = { mes: Comparacao; mesAnoAnterior: Comparacao; ano: Comparacao; doze: Comparacao; vendas: Comparacao; ticket: Comparacao; clientes: Comparacao; novos: Comparacao };

// cada trimestre com a sua cor (tom forte e o "neon" do fundo escuro) e a estação (verão, outono, inverno e primavera)
const TRI: { cor: string; neon: string; icone: LucideIcon }[] = [
  { cor: "#f97316", neon: "#fdba74", icone: Sun },
  { cor: "#06b6d4", neon: "#22d3ee", icone: Leaf },
  { cor: "#6366f1", neon: "#818cf8", icone: Snowflake },
  { cor: "#a855f7", neon: "#d8b4fe", icone: Flower2 },
];

/** "▲ 12,5% vs …" (com seta e palavra, não depende só da cor). */
export function textoVariacao(c: Comparacao, base: string) {
  if (c.variacao === null) return c.atual > 0 ? `novo: sem vendas ${base}` : `sem vendas ${base}`;
  const n = Math.abs(c.variacao).toLocaleString("pt-BR");
  return c.variacao >= 0 ? `▲ ${n}% a mais ${base}` : `▼ ${n}% a menos ${base}`;
}

export function PainelVendasAno({ k, trimestres, hoje, clientes, onClientes }: {
  k: Indicadores; trimestres: Trimestre[]; hoje: string;
  /** situação da carteira (12 meses) e o que abrir ao tocar em Clientes */
  clientes: { emRisco: number; inativos: number }; onClientes?: () => void;
}) {
  const [tri, setTri] = useState<string>("");
  const ano = hoje.slice(0, 4), anoAnt = String(Number(ano) - 1);
  const comecados = trimestres.filter((t) => t.atual > 0 || t.trimestre <= Math.ceil(Number(hoje.slice(5, 7)) / 3));
  const fatias: FatiaAnel<string>[] = comecados.map((t) => ({
    id: String(t.trimestre), rotulo: `${t.trimestre}º trimestre`, valor: t.atual, cor: TRI[t.trimestre - 1].cor, neon: TRI[t.trimestre - 1].neon,
    dica: `${t.trimestre}º trimestre: ${brl(t.atual)}`,
  }));
  const daVez = tri ? trimestres.find((t) => String(t.trimestre) === tri) : undefined;
  const pct = (v: number) => (k.ano.atual ? Math.round((v / k.ano.atual) * 100) : 0);

  return (
    <QuadroEscuro rotulo={`Vendas do ano ${ano}`} titulo="Vendas" destaque={`do ano ${ano}`}
      filtro={daVez ? { texto: `${daVez.trimestre}º trimestre`, onLimpar: () => setTri("") } : undefined} className="mb-5">
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
        {/* celular: o anel primeiro, no centro */}
        <div className="order-1 min-w-0 lg:order-2">
          <AnelEscuro fatias={fatias} escolhida={tri} onEscolher={setTri}
            rotulo={`Vendas do ano ${brl(k.ano.atual)}: ${fatias.map((f) => `${f.rotulo} ${brl(f.valor)}`).join(", ")}`}
            centro={daVez
              ? { rotulo: `${daVez.trimestre}º trimestre`, valor: brl(daVez.atual), sub: textoVariacao(daVez, `que em ${anoAnt}`) }
              : { rotulo: `Vendas em ${ano}`, valor: brl(k.ano.atual), sub: textoVariacao(k.ano, `que em ${anoAnt}`) }} />
        </div>

        <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
          <NumeroEscuro icone={CalendarDays} rotulo={`Este mês (até ${dataBR(hoje).slice(0, 5)})`} valor={brl(k.mes.atual)}
            sub={textoVariacao(k.mes, "vs mês passado").replace(" a mais", "").replace(" a menos", "")} de="#34d399" ate="#059669" aceso={k.mes.atual > 0} />
          <NumeroEscuro icone={Receipt} rotulo="Últimos 12 meses" valor={brl(k.doze.atual)}
            sub={`${k.vendas.atual} ${pl(k.vendas.atual, "venda", "vendas")} · ticket ${brl(k.ticket.atual)}`} de="#60a5fa" ate="#2563eb" aceso />
          <NumeroEscuro icone={Users} rotulo="Clientes (12 meses)" valor={k.clientes.atual}
            sub={`${k.novos.atual} ${pl(k.novos.atual, "novo", "novos")} · ${clientes.emRisco + clientes.inativos} ${pl(clientes.emRisco + clientes.inativos, "parado", "parados")}`}
            de="#fb923c" ate="#ea580c" aceso onClick={onClientes} title={`${clientes.emRisco} em risco e ${clientes.inativos} ${pl(clientes.inativos, "inativo", "inativos")}${onClientes ? " · toque para ver os clientes parados" : ""}`} />
          <NumeroEscuro icone={History} rotulo={`${anoAnt} até ${dataBR(hoje).slice(0, 5)}`} valor={brl(k.ano.anterior)}
            sub="mesmo período" de="#94a3b8" ate="#475569" />
        </div>

        <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Por trimestre">
          {comecados.map((t) => {
            const id = String(t.trimestre), ativo = tri === id, c = TRI[t.trimestre - 1];
            return (
              <li key={id} className="min-w-0">
                <LinhaEscura icone={c.icone} rotulo={`${t.trimestre}º trimestre`} valor={brl(t.atual)} pct={pct(t.atual)} cor={c.cor} neon={c.neon}
                  ativo={ativo} apagado={!!tri && !ativo} onClick={() => setTri(ativo ? "" : id)} title="Toque para ver só este trimestre"
                  detalhes={<>
                    <span>{pct(t.atual)}% do ano</span>
                    <span className={t.variacao == null ? "" : t.variacao >= 0 ? "font-semibold text-[#6ee7b7]" : "font-semibold text-[#fda4af]"}>
                      {textoVariacao(t, `que em ${anoAnt}`)}
                    </span>
                  </>} />
              </li>
            );
          })}
        </ul>
      </div>
    </QuadroEscuro>
  );
}

/** O painel com os dados: as vendas do Painel gerencial (mesma consulta, a tela que abrir depois já acha carregado). */
export function VendasDoAno() {
  const navigate = useNavigate();
  const { filtrar } = useUnidade();
  const dia = hojeBR();
  const { data: pedidos = [], isLoading: l1 } = useRows<any>("pedidos", { select: SELECT_PEDIDOS_VENDAS, key: ["gerencial"] });
  const { data: notas = [], isLoading: l2 } = useRows<any>("notas_fiscais", { select: SELECT_NOTAS_VENDAS, key: ["gerencial"] });
  const { data: clientes = [] } = useRows<any>("clientes", { select: SELECT_CLIENTES_VENDAS, key: ["gerencial"] });
  const r = useMemo(() => {
    const vendas = vendasDaEmpresa(filtrar(pedidos), filtrar(notas), clientes);
    const cart = carteira(vendas, dia);
    return {
      k: indicadores(vendas, dia), trimestres: trimestresDoAno(vendas, dia),
      emRisco: cart.filter((c) => c.situacao === "em_risco").length, inativos: cart.filter((c) => c.situacao === "inativo").length,
    };
  }, [pedidos, notas, clientes, filtrar, dia]);
  if (l1 || l2) return <p className="mb-5 text-sm text-slate-500">Carregando as vendas do ano…</p>;
  return <PainelVendasAno k={r.k} trimestres={r.trimestres} hoje={dia} clientes={{ emRisco: r.emRisco, inativos: r.inativos }}
    onClientes={r.emRisco + r.inativos ? () => navigate("/gerencial?aba=clientes") : undefined} />;
}
