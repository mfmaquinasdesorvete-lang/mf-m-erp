// Teste do giga → Reteste: as máquinas vendidas desde 2023, antes do registro no ERP. Nenhum resultado é inventado:
// cada uma fica "sem ensaio registrado" até ser testada de verdade (na preventiva ou numa OS) e ligada ao teste,
// ou ser dispensada com o motivo (ex.: máquina desativada, cliente não localizado).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, ClipboardCheck, Link2, Search } from "lucide-react";
import { Button, Field, Indicador, Modal } from "@/components/ui";
import { pedirTexto } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { dataHoraBR, resultadoDe } from "@/lib/testeGiga";
import { contarRetestes, filtrarRetestes, ROTULO_RETESTE, testesParaLigar, type LinhaReteste, type SituacaoReteste } from "@/lib/gigaReteste";
import type { Preenchido } from "./LancarTeste";
import type { ContextoGiga } from "./tipos";

const SELECT = "id, situacao, motivo, teste_id, atualizado_em, equipamento:equipamentos(id, descricao, numero_serie, data_venda, origem, produto_id, cliente:clientes(id, nome, nome_fantasia, municipio, uf))";
const COR: Record<SituacaoReteste, string> = {
  pendente: "bg-amber-100 text-amber-800", testado: "bg-emerald-100 text-emerald-800", dispensado: "bg-slate-200 text-slate-700",
};

export function useRetestesGiga() {
  return useQuery({
    queryKey: ["giga_retestes"],
    queryFn: async (): Promise<LinhaReteste[]> => {
      const todas: LinhaReteste[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("giga_retestes").select(SELECT).range(de, de + 999);
        if (error) {
          if (["PGRST205", "42P01"].includes(error.code ?? "")) return [];
          throw error;
        }
        todas.push(...((data ?? []) as unknown as LinhaReteste[]));
        if ((data?.length ?? 0) < 1000) return todas;
      }
    },
  });
}

export function RetesteGiga({ ctx, onLancar }: { ctx: ContextoGiga; onLancar: (p: Preenchido) => void }) {
  const q = useRetestesGiga();
  const invalidar = useInvalidate();
  const [situacao, setSituacao] = useState<SituacaoReteste | "todas">("pendente");
  const [busca, setBusca] = useState("");
  const [ligar, setLigar] = useState<LinhaReteste | null>(null);
  const linhas = useMemo(() => q.data ?? [], [q.data]);
  const n = contarRetestes(linhas);
  const lista = useMemo(() => filtrarRetestes(linhas, situacao, busca), [linhas, situacao, busca]);
  const mostradas = lista.slice(0, 200);

  async function gravar(l: LinhaReteste, campos: { situacao: SituacaoReteste; motivo?: string | null; teste_id?: string | null }) {
    const { error } = await supabase.from("giga_retestes").update({ motivo: null, teste_id: null, ...campos }).eq("id", l.id);
    if (error) return notifyError(error);
    notify(campos.situacao === "testado" ? "Teste ligado à máquina" : campos.situacao === "dispensado" ? "Máquina dispensada do reteste" : "Voltou para a lista de reteste");
    invalidar("giga_retestes");
  }
  async function dispensar(l: LinhaReteste) {
    const motivo = await pedirTexto("Por que esta máquina não vai ser testada? (mínimo 5 caracteres)", "", { titulo: "Dispensar do reteste", ok: "Dispensar", minimo: 5 });
    if (motivo) await gravar(l, { situacao: "dispensado", motivo: motivo.trim() });
  }

  if (q.isLoading) return <p className="py-8 text-center text-slate-500">Carregando a lista de reteste…</p>;
  if (q.error) return <p className="py-8 text-center text-red-700">Não foi possível carregar a lista de reteste.</p>;

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        Máquinas vendidas desde 2023, antes do registro do giga no ERP. Elas ficam <b>sem ensaio registrado</b> até serem testadas de verdade:
        aproveite a preventiva ou a OS, lance o teste e ligue-o à máquina. Nada aqui conta como aprovado sem um teste gravado.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Indicador rotulo="Sem ensaio registrado" valor={String(n.pendente)} cor="ambar" />
        <Indicador rotulo="Testadas" valor={String(n.testado)} cor="verde" />
        <Indicador rotulo="Dispensadas" valor={String(n.dispensado)} cor="neutro" />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Situação" className="w-48">
          <select className="input" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoReteste | "todas")}>
            <option value="pendente">Sem ensaio registrado</option>
            <option value="testado">Testadas</option>
            <option value="dispensado">Dispensadas</option>
            <option value="todas">Todas</option>
          </select>
        </Field>
        <Field label="Buscar" className="min-w-0 flex-1">
          <span className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, cidade, UF, máquina ou nº de série" />
          </span>
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        {lista.length} {pl(lista.length, "máquina", "máquinas")}{lista.length > mostradas.length ? ` (mostrando as ${mostradas.length} primeiras; use a busca)` : ""} · a venda mais antiga primeiro
      </p>
      {!lista.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma máquina nesta situação.</p> : (
        <ul className="space-y-2">
          {mostradas.map((l) => {
            const e = l.equipamento;
            const cli = e?.cliente;
            const teste = l.teste_id ? ctx.testes.find((t) => t.id === l.teste_id) : null;
            return (
              <li key={l.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="min-w-0 [overflow-wrap:anywhere]">{e?.descricao || "Máquina"}</b>
                  <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${COR[l.situacao]}`}>{ROTULO_RETESTE[l.situacao]}</span>
                  {e?.origem && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-2xs font-semibold text-pink-800">vendida pela {e.origem}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-slate-600 [overflow-wrap:anywhere]">
                  {cli && <span>{cli.nome_fantasia?.trim() || cli.nome}</span>}
                  {cli?.municipio && <span>{cli.municipio}{cli.uf ? `/${cli.uf}` : ""}</span>}
                  {e?.data_venda && <span>venda {dataBR(e.data_venda)}</span>}
                  {e?.numero_serie && <span>série {e.numero_serie}</span>}
                </div>
                {l.situacao === "testado" && teste && (
                  <p className="mt-1 text-emerald-800">Teste nº {teste.numero} em {dataHoraBR(teste.testado_em)} · {resultadoDe(teste) === "aprovada" ? "aprovada" : "reprovada"}</p>
                )}
                {l.situacao === "dispensado" && l.motivo && <p className="mt-1 text-slate-600">Motivo: {l.motivo}</p>}
                {ctx.podeLancar && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {l.situacao === "pendente" ? <>
                      <Button className="!min-h-0 !px-2.5 !py-1 text-xs" onClick={() => onLancar({ produto_id: e?.produto_id ?? null, numero_serie: e?.numero_serie ?? null })}>
                        <ClipboardCheck size={14} /> Lançar teste
                      </Button>
                      <Button variant="secondary" className="!min-h-0 !px-2.5 !py-1 text-xs" onClick={() => setLigar(l)}><Link2 size={14} /> Ligar a um teste feito</Button>
                      <Button variant="ghost" className="!min-h-0 !px-2.5 !py-1 text-xs" onClick={() => dispensar(l)}><Ban size={14} /> Dispensar</Button>
                    </> : (
                      <Button variant="ghost" className="!min-h-0 !px-2.5 !py-1 text-xs" onClick={() => gravar(l, { situacao: "pendente" })}>Voltar para o reteste</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ligar && <LigarTeste linha={ligar} ctx={ctx} jaLigados={new Set(linhas.map((l) => l.teste_id).filter((x): x is string => !!x))}
        onClose={() => setLigar(null)} onLigar={async (id) => { await gravar(ligar, { situacao: "testado", teste_id: id }); setLigar(null); }} />}
    </div>
  );
}

function LigarTeste({ linha, ctx, jaLigados, onClose, onLigar }: {
  linha: LinhaReteste; ctx: ContextoGiga; jaLigados: Set<string>; onClose: () => void; onLigar: (testeId: string) => void;
}) {
  const produto = linha.equipamento?.produto_id ?? null;
  const [todosModelos, setTodosModelos] = useState(!produto);
  const opcoes = testesParaLigar(ctx.testes, todosModelos ? null : produto, jaLigados).slice(0, 50);
  return (
    <Modal open onClose={onClose} title="Ligar a um teste feito">
      <p className="mb-3 text-sm text-slate-600">Escolha o teste do giga feito nesta máquina ({linha.equipamento?.descricao || "máquina"}). Só aparecem testes válidos que ainda não foram ligados a outra máquina.</p>
      {produto && (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={todosModelos} onChange={(e) => setTodosModelos(e.target.checked)} /> Mostrar testes de todos os modelos
        </label>
      )}
      {!opcoes.length ? <p className="py-4 text-center text-sm text-slate-500">Nenhum teste disponível. Lance o teste primeiro em "Lançar teste".</p> : (
        <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {opcoes.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onLigar(t.id)} className="flex w-full flex-wrap items-center gap-x-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                <b>Nº {t.numero}</b><span>{dataHoraBR(t.testado_em)}</span><span>{ctx.nomeMaquina(t.produto_id)}</span><span>NS {t.numero_serie}</span>
                <span className={resultadoDe(t) === "aprovada" ? "text-emerald-700" : "font-semibold text-red-700"}>
                  {resultadoDe(t) === "aprovada" ? <><CheckCircle2 size={13} className="inline" aria-hidden /> aprovada</> : "reprovada"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
