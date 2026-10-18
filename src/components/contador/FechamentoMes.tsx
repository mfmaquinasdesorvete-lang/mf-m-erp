// Painel do contador → peças do fechamento do mês: resultado gerencial com comparação, conciliação dos bancos e a
// lista de pendências e divergências (valor, documento, quem resolve, caminho até a tela de origem e comentário).
// As regras ficam em lib/fechamentoMes.ts.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Landmark, MessageSquarePlus } from "lucide-react";
import { Button, Section } from "@/components/ui";
import { useRows, useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, pl } from "@/lib/format";
import { pedirTexto } from "@/components/Dialogos";
import { useCategorias } from "@/components/financeiro/CategoriaRateio";
import { dre, type LancDre } from "@/lib/dre";
import { extratoParaDre, type ContaBancariaDre, type LancExtratoDre } from "@/lib/dreExtrato";
import { soDigitos, type Parte } from "@/lib/partesRelacionadas";
import { mesesComparacao, variacao, type ConciliacaoConta, type Divergencia, type StatusMes } from "@/lib/fechamentoMes";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]}/${am.slice(2, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export const COR_STATUS: Record<StatusMes, string> = {
  aberto: "bg-slate-100 text-slate-700",
  com_pendencias: "bg-amber-100 text-amber-900",
  em_revisao: "bg-violet-100 text-violet-800",
  pronto: "bg-emerald-50 text-emerald-800",
  enviado: "bg-sky-100 text-sky-800",
  fechado: "bg-emerald-100 text-emerald-900",
};

const RESP: Record<Divergencia["responsavel"], string> = { financeiro: "Financeiro", fiscal: "Fiscal", contador: "Contador" };
const AREA: Record<Divergencia["area"], string> = { bancos: "Bancos", fiscal: "Notas fiscais", financeiro: "Financeiro" };

/** Pendências e divergências: primeiro as que impedem o fechamento; cada uma leva à tela de origem e aceita comentário. */
export function Divergencias({ lista, unidadeId, comp, meuNome }: { lista: Divergencia[]; unidadeId: string; comp: string; meuNome: string }) {
  const invalidar = useInvalidate();
  async function comentar(d: Divergencia) {
    const texto = await pedirTexto(`Comentário sobre "${d.titulo}" (vai para a conversa do mês):`, "");
    if (!texto?.trim()) return;
    const { error } = await supabase.from("contador_mensagens").insert({ unidade_id: unidadeId, competencia: comp, autor_nome: meuNome, texto: `[${d.titulo}] ${texto.trim()}` });
    if (error) return notifyError(error);
    notify("Comentário enviado na conversa do mês"); invalidar("contador_mensagens");
  }
  const bloqueiam = lista.filter((d) => d.bloqueia).length;
  return (
    <Section title={`Pendências e divergências${lista.length ? ` (${lista.length})` : ""}`}>
      {lista.length ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {bloqueiam ? <><b className="text-amber-800">{bloqueiam} {pl(bloqueiam, "impede", "impedem")} o fechamento</b> sem justificativa; </> : "Nenhuma impede o fechamento; "}
            {lista.length - bloqueiam} {pl(lista.length - bloqueiam, "pede", "pedem")} só conferência.
          </p>
          <ul className="divide-y divide-slate-100">
            {lista.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex items-start gap-x-3">
                  <span className="min-w-0 flex-1">
                    <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-2xs font-bold ${d.bloqueia ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>
                      {d.bloqueia ? "impede fechar" : "conferir"}
                    </span>
                    <span className="block text-sm font-semibold text-fg">{d.titulo}</span>
                    {d.detalhe && <span className="block text-xs text-slate-500">{d.detalhe}</span>}
                  </span>
                  {d.valor !== null && <span className="num shrink-0 whitespace-nowrap text-sm font-bold text-fg">{brl(d.valor)}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs text-slate-500">{AREA[d.area]} · resolve: <b>{RESP[d.responsavel]}</b></span>
                  <span className="ml-auto flex gap-1.5">
                    {d.link.startsWith("#")
                      ? <a href={d.link} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-sm font-semibold text-brand">Ver <ArrowRight size={14} aria-hidden /></a>
                      : <Link to={d.link} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-sm font-semibold text-brand">Abrir <ArrowRight size={14} aria-hidden /></Link>}
                    <Button type="button" variant="ghost" onClick={() => comentar(d)} className="!min-h-[34px] !px-2.5 !py-1 text-sm" aria-label={`Comentar: ${d.titulo}`}>
                      <MessageSquarePlus size={14} aria-hidden /> Comentar
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden /> Nada pendente neste mês: bancos conciliados, lançamentos aprovados e notas com financeiro.</p>}
    </Section>
  );
}

/** Conciliação dos bancos da unidade no mês: quanto do extrato já foi tratado em cada conta. */
export function ConciliacaoBancos({ contas }: { contas: ConciliacaoConta[] }) {
  const total = contas.reduce((s, c) => s + c.linhas, 0), feitas = contas.reduce((s, c) => s + c.tratadas, 0);
  return (
    <Section title="Conciliação dos bancos" actions={<Link to="/conciliacao" className="text-sm font-semibold text-brand">Bancos e conciliação →</Link>}>
      {contas.length ? (
        <>
          <p className="mb-3 text-sm text-slate-600"><b className="num text-fg">{total ? Math.round((feitas / total) * 100) : 0}%</b> do extrato do mês conciliado ({feitas} de {total} {pl(total, "linha", "linhas")}).</p>
          <ul className="space-y-2.5">
            {contas.map((c) => {
              const p = c.linhas ? Math.round((c.tratadas / c.linhas) * 100) : 100;
              return (
                <li key={c.id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-fg"><Landmark size={14} aria-hidden /> {c.nome}</span>
                    <span className="num text-xs text-slate-500">{c.tratadas}/{c.linhas} · {p}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.nome}: ${p}% conciliado`}>
                    <div className={`h-full rounded-full ${p === 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${p}%` }} />
                  </div>
                  {c.pendentes > 0 && (
                    <p className="mt-1 text-xs text-amber-800">
                      {c.pendentes} {pl(c.pendentes, "pendente", "pendentes")}{c.entradasPendentes ? ` · ${brl(c.entradasPendentes)} em entradas` : ""}{c.saidasPendentes ? ` · ${brl(c.saidasPendentes)} em saídas` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : <p className="text-sm text-slate-500">Nenhum extrato importado desta unidade no mês.</p>}
    </Section>
  );
}

type ContaDre = LancDre & { unidade_id?: string | null };

/**
 * Resultado gerencial do mês (DRE do ERP, por competência, com os extratos dos bancos) comparado com o mês anterior e
 * com o mesmo mês do ano anterior. É a visão do financeiro: não substitui o balancete do contador.
 */
export function ResultadoMes({ unidadeId, comp, contas }: { unidadeId: string; comp: string; contas: ContaDre[] }) {
  const { data: cats = [] } = useCategorias();
  const { data: extrato = [] } = useRows<LancExtratoDre>("extrato_lancamentos", {
    select: "id, conta_bancaria_id, data, valor, descricao, identificador, status, conta_receber_id, conta_pagar_id, par_transferencia_id", order: "data", ascending: true, key: ["dre"],
  });
  const { data: bancos = [] } = useRows<ContaBancariaDre>("contas_bancarias", { select: "id, ativo, unidade_id", order: "nome", ascending: true, key: ["dre"] });
  const { data: funcionarios = [] } = useRows<{ nome: string }>("funcionarios", { select: "id, nome, apelido, ativo", order: "nome", ascending: true, key: ["nomes"] });
  const { data: partes = [] } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });
  const { data: unidades = [] } = useRows<{ razao_social: string | null; cnpj: string | null }>("unidades", { select: "id, razao_social, cnpj", order: "nome", ascending: true, key: ["partes"] });
  const { anterior, anoAnterior } = mesesComparacao(comp);
  const meses = [anoAnterior, anterior, comp];
  const r = useMemo(() => {
    const daUnidade = contas.filter((c) => c.unidade_id === unidadeId);
    const doExtrato = extratoParaDre(extrato, bancos, daUnidade, {
      funcionarios, partes,
      propria: { nomes: [...new Set(unidades.map((u) => u.razao_social ?? "").filter(Boolean))], documentos: unidades.map((u) => soDigitos(u.cnpj)).filter(Boolean) },
    }).lancamentos.filter((l) => l.unidade_id === unidadeId);
    const d = dre([...daUnidade, ...doExtrato], cats, meses, "competencia");
    return meses.map((_, i) => d.resumo(i));
  }, [contas, extrato, bancos, funcionarios, partes, unidades, cats, unidadeId, meses.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ano, ant, atual] = r;
  // custos e despesas vêm negativos do DRE: aqui aparecem positivos, e a variação diz quanto subiram ou caíram
  const linhas: [string, (x: typeof atual) => number][] = [
    ["Receita", (x) => x.receita],
    ["Custos e impostos", (x) => 0 - x.custos], // 0 - x (e não -x) para não mostrar "-R$ 0,00"
    ["Despesas", (x) => 0 - x.despesas],
    ["Resultado", (x) => x.lucro],
  ];
  const vazio = (x: typeof atual) => !x.receita && !x.custos && !x.despesas;
  const comparar = (v: number, x: typeof atual, f: (x: typeof atual) => number) =>
    vazio(x) ? <span className="text-xs">sem lançamentos</span> : <><span className="whitespace-nowrap">{brl(f(x))}</span> <span className="whitespace-nowrap text-xs">({pct(variacao(v, f(x)))})</span></>;
  return (
    <Section title="Resultado do mês (gerencial)" actions={<Link to="/financeiro?aba=dre" className="text-sm font-semibold text-brand">DRE completo →</Link>}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5 md:mx-0">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">Resultado gerencial do mês comparado com o mês anterior e com o mesmo mês do ano anterior</caption>
          <thead>
            <tr className="text-xs text-slate-500">
              <th scope="col" className="th pl-4 text-left sm:pl-5 md:pl-0">Linha</th>
              <th scope="col" className="th text-right">{rotuloMes(comp)}</th>
              <th scope="col" className="th text-right">vs {rotuloMes(anterior)}</th>
              <th scope="col" className="th pr-4 text-right sm:pr-5 md:pr-0">vs {rotuloMes(anoAnterior)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map(([rot, f]) => {
              const v = f(atual), resultado = rot === "Resultado";
              return (
                <tr key={rot} className={resultado ? "font-bold" : ""}>
                  <th scope="row" className="py-2 pl-4 text-left font-semibold text-fg sm:pl-5 md:pl-0">{rot}</th>
                  <td className={`num whitespace-nowrap py-2 text-right ${resultado ? (v >= 0 ? "text-emerald-700" : "text-red-700") : "text-fg"}`}>{brl(v)}</td>
                  <td className="num py-2 text-right text-slate-600">{comparar(v, ant, f)}</td>
                  <td className="num py-2 pr-4 text-right text-slate-600 sm:pr-5 md:pr-0">{comparar(v, ano, f)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex gap-1.5 text-xs text-slate-500">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
        Base gerencial do ERP (contas e extratos, por competência). Não é o balancete: o resultado contábil e a base do IRPJ/CSLL são do contador.
      </p>
    </Section>
  );
}
