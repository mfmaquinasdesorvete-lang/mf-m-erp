// Analista fiscal → DIFAL por estado: para onde a MF vende a quem não é contribuinte de ICMS (o DIFAL é dela),
// quanto de DIFAL isso dá (estimado) x o que saiu destacado nas notas e as guias pagas a outros estados.
// Os dados vêm do XML das notas (difal_vendas_interestaduais); as contas ficam em lib/difal.ts.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileDown, MapPinned, Receipt, ShieldAlert } from "lucide-react";
import { Button, Card, Indicador } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { difalPorEstado, GRUPOS_DIFAL, guiasOutrosEstados, type LinhaDifal } from "@/lib/difal";

type ContaImposto = Parameters<typeof guiasOutrosEstados>[0][number];

export function DifalPorEstado({ contas }: { contas: ContaImposto[] }) {
  const { filtrar } = useUnidade();
  const { data: todas = [], isLoading, error } = useQuery({
    queryKey: ["difal_vendas_interestaduais"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("difal_vendas_interestaduais");
      if (error) throw error;
      return (data ?? []) as LinhaDifal[];
    },
  });
  const linhas = useMemo(() => filtrar(todas), [filtrar, todas]);
  const r = useMemo(() => difalPorEstado(linhas, hoje()), [linhas]);
  const guias = useMemo(() => guiasOutrosEstados(contas), [contas]);
  const maior = Math.max(1, ...r.estados.map((e) => e.estimado12));
  const semDestaque = r.total.notas > 0 && r.total.destacado === 0;

  function baixar() {
    baixarPlanilha("difal-por-estado", [
      { nome: "Por estado", linhas: r.estados.map((e) => ({
        Estado: e.uf, "Notas (12 meses)": e.notas12, "Valor (12 meses)": e.valor12, "DIFAL estimado (12 meses)": e.estimado12, "Meses com venda (12 meses)": e.meses12,
        "Notas (tudo)": e.notas, "Valor (tudo)": e.valor, "DIFAL estimado (tudo)": e.estimado, "DIFAL destacado nas notas": e.destacado,
        "Isento ou IE baixada: notas": e.outrosNotas, "Isento ou IE baixada: DIFAL estimado": e.outrosEstimado,
      })) },
      { nome: "Notas", linhas: linhas.map((l) => ({
        Grupo: GRUPOS_DIFAL[l.grupo].rotulo, Estado: l.uf, NF: l.numero, Data: l.emissao ? dataBR(l.emissao) : "", Valor: Number(l.valor),
        "DIFAL destacado": Number(l.difal_destacado), "DIFAL estimado": Number(l.difal_estimado),
      })) },
    ]);
  }

  if (error) return <Card className="p-4 text-sm text-red-700">Não consegui ler as notas: {(error as Error).message}</Card>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Vendas para <b>outro estado</b> a quem <b>não é contribuinte de ICMS</b> (pessoa física ou empresa sem IE): a MF paga a diferença
        entre a alíquota do estado de destino e a da nota (DIFAL, EC 87/2015 e LC 190/2022). Sem inscrição no estado, é uma guia (GNRE) por nota,
        antes de a mercadoria sair; o ERP lança a GNRE em Contas a pagar quando a nota sai autorizada.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Indicador rotulo="DIFAL estimado · 12 meses" icon={MapPinned} cor="azul" valor={isLoading ? "…" : brl(r.total.estimado12)}
          sub={`${r.total.notas12} ${pl(r.total.notas12, "nota", "notas")} · ${brl(r.total.valor12)} vendidos`} />
        <Indicador rotulo="Destacado nas notas" icon={Receipt} cor={semDestaque ? "vermelho" : "verde"} valor={isLoading ? "…" : brl(r.total.destacado)}
          sub={`de ${brl(r.total.estimado)} estimados desde a 1ª nota`} />
        <Indicador rotulo="Guias pagas a outros estados" icon={Receipt} cor={guias.valor < r.total.estimado / 2 ? "ambar" : "verde"} valor={brl(guias.valor)}
          sub={`${guias.quantidade} ${pl(guias.quantidade, "guia", "guias")} em Contas a pagar`} />
      </div>

      {semDestaque && (
        <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>Nenhuma dessas notas tem o DIFAL destacado e as guias pagas a outros estados somam bem menos do que o estimado. Leve ao contador:
            se o DIFAL não foi recolhido, o caminho legal é a <b>denúncia espontânea</b> em cada estado (imposto com juros, sem a multa de autuação).</span>
        </p>
      )}

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-fg">Por estado <span className="text-xs font-normal text-slate-500">(barra: DIFAL estimado nos últimos 12 meses)</span></p>
          <Button variant="ghost" onClick={baixar} disabled={!linhas.length}><FileDown size={16} aria-hidden /> Baixar planilha</Button>
        </div>
        {isLoading ? <p className="text-sm text-slate-500">Lendo as notas…</p> : !r.estados.length ? <p className="text-sm text-slate-500">Nenhuma venda a não contribuinte de outro estado.</p> : (
          <ul className="space-y-2">
            {r.estados.map((e) => (
              <li key={e.uf} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
                <span className="row-span-2 grid h-9 w-10 place-items-center rounded-lg bg-sky-600 text-sm font-bold text-white">{e.uf}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(e.estimado12 ? 3 : 0, (e.estimado12 / maior) * 100)}%` }} />
                </div>
                <p className="flex flex-wrap justify-between gap-x-3 text-xs text-slate-600">
                  <span><b className="num text-fg">{brl(e.estimado12)}</b> em 12 meses · {e.notas12} {pl(e.notas12, "nota", "notas")} · {e.meses12} {pl(e.meses12, "mês", "meses")} com venda</span>
                  <span className="num">desde o início: {brl(e.estimado)} ({e.notas} {pl(e.notas, "nota", "notas")}){e.outrosNotas ? ` + ${brl(e.outrosEstimado)} a conferir` : ""}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-2 font-bold text-fg">Quem recebeu</p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {r.grupos.map((g) => (
            <li key={g.grupo} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-fg">{GRUPOS_DIFAL[g.grupo].rotulo}</p>
              <p className="num text-lg font-bold text-fg">{brl(g.estimado)}</p>
              <p className="text-xs text-slate-500">{g.notas} {pl(g.notas, "nota", "notas")} · {brl(g.valor)} · {GRUPOS_DIFAL[g.grupo].dica}</p>
            </li>
          ))}
        </ul>
      </Card>

      <p className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
        <span>Estimativa: base do ICMS de cada item × (alíquota interna + FCP do estado, pela tabela atual do ERP) − ICMS destacado. A alíquota de cada época
          e o recolhimento oficial são do contador. Inscrição de substituto tributário no estado (Convênio ICMS 236/2021) troca a guia por nota por uma guia
          por mês: vale onde a MF vende todo mês para não contribuintes.</span>
      </p>
    </div>
  );
}
