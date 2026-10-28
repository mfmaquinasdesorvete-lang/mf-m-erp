// Painel do contador → Dossiê da empresa: o que o ERP tem de cada mês desde a abertura da unidade (NF-e emitidas e
// recebidas com XML, NFS-e, CT-e, guias, folha, obrigações, fechamento e o extrato de cada conta), o que falta e de
// onde tirar, e o pacote do mês (XML + planilhas, o mesmo do fechamento). Só leitura. Regras em lib/dossie.ts.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Package } from "lucide-react";
import { Button, CampoMes, Card, Carregando, chip, ErroLista, nomeMes, RolagemLateral, Vazio } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { faixasDeMeses, mapaDossie, ROTULO_SITUACAO, type Celula, type LinhaDossie, type Situacao } from "@/lib/dossie";

const COR: Record<Situacao, string> = {
  tem: "bg-emerald-100 text-emerald-800", parcial: "bg-amber-100 text-amber-900", falta: "bg-red-100 text-red-800", nada: "text-slate-400",
};
const mesAtual = () => new Date().toISOString().slice(0, 7);

function Selo({ c }: { c: Celula }) {
  if (c.situacao === "nada") return <span className={COR.nada} aria-label="sem movimento">—</span>;
  const texto = c.situacao === "falta" ? "falta" : c.situacao === "parcial" ? `${c.completos}/${c.qtd}` : String(c.qtd);
  return <span className={`inline-block min-w-9 rounded-full px-2 py-0.5 text-center text-2xs font-bold ${COR[c.situacao]}`} title={ROTULO_SITUACAO[c.situacao]}>{texto}</span>;
}

export function Dossie() {
  const { unidades } = useUnidade();
  const { tem, papel } = usePerfil();
  const pode = tem("financeiro") || papel === "contador";
  const ativas = unidades.filter((u) => u.ativo !== false);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const unidade = ativas.find((u) => u.id === unidadeId) ?? ativas.find((u) => u.matriz) ?? ativas[0];
  const [desde, setDesde] = useState<string | null>(null);
  const inicio = desde ?? unidade?.aberta_em?.slice(0, 7) ?? "2022-01";
  const fim = mesAtual();
  const [baixando, setBaixando] = useState<string | null>(null);

  const { data: contas = [] } = useRows<{ id: string; nome: string; unidade_id: string | null }>("contas_bancarias", { select: "id, nome, unidade_id", order: "nome", ascending: true, enabled: pode });
  const consulta = useQuery({
    queryKey: ["dossie_empresa", unidade?.id, inicio],
    enabled: pode && !!unidade,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dossie_empresa", { p_unidade: unidade!.id, p_desde: `${inicio}-01` });
      if (error) throw error;
      return (data ?? []) as LinhaDossie[];
    },
  });
  const contasDaUnidade = useMemo(() => contas.filter((c) => c.unidade_id === unidade?.id), [contas, unidade?.id]);
  const mapa = useMemo(() => mapaDossie(consulta.data ?? [], contasDaUnidade, inicio, fim), [consulta.data, contasDaUnidade, inicio, fim]);
  const pendencias = mapa.colunas.filter((c) => mapa.resumo[c.tipo].falta.length || mapa.resumo[c.tipo].parcial.length || (c.tipo.startsWith("extrato:") && c.primeiro && c.primeiro > inicio));

  if (!pode) return <Card className="p-4 text-sm text-slate-600">Só o contador, o financeiro e o administrador veem o dossiê da empresa.</Card>;
  if (!unidade) return <Vazio titulo="Nenhuma unidade cadastrada." texto="Cadastre a empresa em Configurações → Empresa." />;

  async function pacote(mes: string) {
    setBaixando(mes);
    try {
      const r = await callFunction<{ url: string | null; arquivos: number; faltando: string[] }>("contador-pacote", { acao: "gerar", competencia: mes, unidade_id: unidade!.id, enviar_email: false });
      if (r.url) window.open(r.url, "_blank", "noopener");
      notify(`Pacote de ${nomeMes(mes)} com ${r.arquivos} arquivos${r.faltando.length ? `; ${r.faltando.length} XML não encontrados (lista no LEIA-ME)` : ""}`);
    } catch (e) { notifyError(e); } finally { setBaixando(null); }
  }

  function baixarMapa() {
    baixarPlanilha(`dossie-${unidade!.codigo}-${inicio}-a-${fim}`, [
      { nome: "Mapa", linhas: mapa.meses.map((m) => ({ Mês: m.mes, ...Object.fromEntries(mapa.colunas.map((c) => {
        const x = m.celulas[c.tipo];
        return [c.rotulo, x.situacao === "nada" ? "" : x.situacao === "falta" ? "falta" : x.situacao === "parcial" ? `parcial (${x.completos} de ${x.qtd})` : x.qtd];
      })) })) },
      { nome: "O que falta", linhas: pendencias.map((c) => ({
        Documento: c.rotulo, "Falta": faixasDeMeses(mapa.resumo[c.tipo].falta),
        "Só em parte": faixasDeMeses(mapa.resumo[c.tipo].parcial), "Em parte quer dizer": c.parcial ?? "",
        "Primeiro mês no ERP": c.primeiro ?? "nenhum", "De onde tirar": c.onde,
      })) },
    ]);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Tudo o que o ERP tem da empresa, mês a mês, desde a abertura: para uma fiscalização, para o contador, o advogado, o banco ou os sócios.
        Verde é completo, amarelo é em parte e vermelho é o que falta. O traço quer dizer que pode não ter havido movimento no mês.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {ativas.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Unidade">
            {ativas.map((u) => <button key={u.id} type="button" className={chip(u.id === unidade.id)} onClick={() => { setUnidadeId(u.id); setDesde(null); }}>{u.nome}</button>)}
          </div>
        )}
        <CampoMes rotulo="Desde" value={inicio} max={fim} onChange={(v) => v && setDesde(v)} />
        <Button onClick={baixarMapa} disabled={!consulta.data} className="ml-auto"><FileDown size={16} aria-hidden /> Baixar o mapa</Button>
      </div>
      {!unidade.aberta_em && <p className="text-xs text-amber-800">A data de abertura desta unidade não está cadastrada: escolha o mês em "Desde".</p>}

      {consulta.isLoading ? <Carregando linhas={6} /> : consulta.error ? <ErroLista erro={consulta.error} onTentar={() => consulta.refetch()} /> : (
        <>
          <Card className="p-4">
            <p className="font-bold text-fg">{mapa.completos} de {mapa.meses.length} meses completos</p>
            {pendencias.length ? (
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {pendencias.map((c) => {
                  const r = mapa.resumo[c.tipo];
                  return (
                    <li key={c.tipo} className="py-2">
                      <p className="font-semibold text-fg">{c.rotulo}</p>
                      {r.falta.length > 0 && <p className="text-red-800">Falta: {faixasDeMeses(r.falta)}</p>}
                      {r.parcial.length > 0 && <p className="text-amber-900">Em parte ({c.parcial}): {faixasDeMeses(r.parcial)}</p>}
                      {c.tipo.startsWith("extrato:") && c.primeiro && c.primeiro > inicio && <p className="text-slate-600">O ERP tem desde {c.primeiro.slice(5)}/{c.primeiro.slice(0, 4)}; antes disso, se a conta já existia.</p>}
                      <p className="text-xs text-slate-500">De onde tirar: {c.onde}</p>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-1 text-sm text-emerald-800">Nada faltando no período.</p>}
          </Card>

          {/* computador: a grade inteira */}
          <Card className="hidden p-2 md:block"><RolagemLateral>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="sticky left-0 bg-surface py-2 pr-3">Mês</th>
                  {mapa.colunas.map((c) => <th key={c.tipo} className="px-2 text-center font-semibold">{c.rotulo}</th>)}
                  <th className="pl-2"><span className="sr-only">Pacote</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mapa.meses.map((m) => (
                  <tr key={m.mes}>
                    <td className="sticky left-0 bg-surface py-1.5 pr-3 font-semibold text-fg">{m.mes.slice(5)}/{m.mes.slice(0, 4)}</td>
                    {mapa.colunas.map((c) => <td key={c.tipo} className="num px-2 text-center"><Selo c={m.celulas[c.tipo]} /></td>)}
                    <td className="pl-2 text-right">
                      <Button variant="ghost" tamanho="mini" carregando={baixando === m.mes} disabled={!!baixando && baixando !== m.mes} onClick={() => pacote(m.mes)}
                        aria-label={`Baixar o pacote de ${nomeMes(m.mes)}`}><Package size={13} aria-hidden /> Pacote</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RolagemLateral></Card>

          {/* celular: um cartão por mês com o que falta */}
          <ul className="space-y-2 md:hidden">
            {mapa.meses.map((m) => {
              const faltas = mapa.colunas.filter((c) => m.celulas[c.tipo].situacao === "falta").map((c) => c.rotulo);
              const partes = mapa.colunas.filter((c) => m.celulas[c.tipo].situacao === "parcial").map((c) => c.rotulo);
              return (
                <li key={m.mes} className="cartao p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-fg">{nomeMes(m.mes)}</p>
                    <Button variant="ghost" tamanho="mini" carregando={baixando === m.mes} disabled={!!baixando && baixando !== m.mes} onClick={() => pacote(m.mes)}
                      aria-label={`Baixar o pacote de ${nomeMes(m.mes)}`}><Package size={13} aria-hidden /> Pacote</Button>
                  </div>
                  {faltas.length ? <p className="mt-1 text-sm text-red-800">Falta: {faltas.join(", ")}</p> : null}
                  {partes.length ? <p className="text-sm text-amber-900">Em parte: {partes.join(", ")}</p> : null}
                  {!faltas.length && !partes.length && <p className="mt-1 text-sm text-emerald-800">Completo</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
