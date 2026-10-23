// Registros do Teste do giga: lista com filtros (período, modelo, NS, operador, resultado), planilha, PDF no formato do
// REG-006 (mesmas colunas do papel) e o detalhe de cada teste com o histórico do NS, reteste e anulação com motivo.
import { useMemo, useState } from "react";
import { Ban, CheckCircle2, FileDown, History, Printer, RotateCcw, XCircle } from "lucide-react";
import { Button, Field, Modal, Table } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { pedirTexto } from "@/components/Dialogos";
import { BotaoMarcadores, ChipsMarcadores, SelectMarcador, useMarcadores } from "@/components/nfe/Marcadores";
import { useConfig } from "@/lib/useConfig";
import { useUnidade } from "@/lib/unidade";
import { useInvalidate } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { comUnidade, pdfRegistroGiga } from "@/lib/pdf";
import { textoPadrao } from "@/lib/textosPadrao";
import {
  dataHoraBR, diaBrasil, falhas, filtrarTestes, fmtNum, historicoPorNs, linhaReg006, medidasAterramento, medidasTensao, normalizarNs,
  planilhaTestes, REG006, resultadoDe, rotuloTipo, type FiltroTestes, type Resultado, type TesteGiga,
} from "@/lib/testeGiga";
import { anularTesteGiga, CHAVES_GIGA } from "@/lib/testeGigaDados";
import type { ContextoGiga } from "./tipos";

const hojeBR = () => diaBrasil(new Date().toISOString());
const inicioDoMes = () => `${hojeBR().slice(0, 7)}-01`;

/** Aprovado/Reprovado de cada teste, com a cor. */
function Res({ r, medidas }: { r: Resultado; medidas?: string }) {
  return (
    <span className={`inline-flex flex-col ${r === "aprovado" ? "text-emerald-700" : "font-bold text-red-700"}`}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
        {r === "aprovado" ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}{r === "aprovado" ? "Aprovado" : "Reprovado"}
      </span>
      {medidas && <span className="num whitespace-nowrap text-2xs font-normal text-slate-500">{medidas}</span>}
    </span>
  );
}

/** Resultado geral (aprovada / reprovada) ou "anulado". */
export function SeloResultado({ t }: { t: TesteGiga }) {
  const r = resultadoDe(t);
  const [cor, Icone, texto] = t.anulado_em ? ["bg-slate-100 text-slate-500", Ban, "anulado"] as const
    : r === "aprovada" ? ["bg-emerald-50 text-emerald-700", CheckCircle2, "aprovada"] as const
    : ["bg-red-50 text-red-700", XCircle, "reprovada"] as const;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}><Icone size={12} aria-hidden /> {texto}</span>;
}

export function RegistrosGiga({ ctx, filtroInicial, onReteste }: { ctx: ContextoGiga; filtroInicial?: FiltroTestes | null; onReteste: (t: TesteGiga) => void }) {
  const { data: cfg } = useConfig();
  const { unidades, atual, nome: nomeUnidade } = useUnidade();
  const { data: marcadores = [] } = useMarcadores();
  const [f, setF] = useState<FiltroTestes>(() => ({ de: inicioDoMes(), ate: hojeBR(), ...(filtroInicial ?? {}) }));
  const [marcador, setMarcador] = useState("");
  const [aberto, setAberto] = useState<TesteGiga | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const set = (p: Partial<FiltroTestes>) => setF((x) => ({ ...x, ...p }));

  const lista = useMemo(() => filtrarTestes(ctx.testes, f).filter((t) => !marcador || t.marcadores?.includes(marcador)), [ctx.testes, f, marcador]);
  const operadores = useMemo(() => [...new Set(ctx.testes.map((t) => t.operador_nome))].sort((a, b) => a.localeCompare(b, "pt-BR")), [ctx.testes]);
  const numeroDe = useMemo(() => { const m = new Map(ctx.testes.map((t) => [t.id, t.numero])); return (id: string) => m.get(id); }, [ctx.testes]);
  const numeroOp = useMemo(() => { const m = new Map(ctx.ops.map((o) => [o.id, o.numero])); return (id: string | null | undefined) => (id ? m.get(id) ?? null : null); }, [ctx.ops]);

  const filtrosTexto = [
    f.de || f.ate ? `Período: ${f.de ? dataBR(f.de) : "início"} a ${f.ate ? dataBR(f.ate) : "hoje"}` : "Todo o período",
    f.produtoId && `Modelo: ${ctx.nomeMaquina(f.produtoId)}`, f.ns && `NS: ${normalizarNs(f.ns)}`, f.operador && `Operador: ${f.operador}`,
    f.resultado && `Resultado: ${f.resultado === "aprovada" ? "aprovadas" : "reprovadas"}`, f.anulados && "com os anulados",
    `${lista.length} ${pl(lista.length, "teste", "testes")}`,
  ].filter(Boolean).join(" · ");

  function exportar() {
    baixarPlanilha("teste-do-giga-reg-006", [{
      nome: "REG-006 Teste do giga",
      linhas: planilhaTestes([...lista].reverse(), { maquina: ctx.nomeMaquina, unidade: (id) => (id ? nomeUnidade(id) : ""), op: numeroOp, numeroDe }),
    }]).catch(notifyError);
  }
  async function imprimir() {
    if (!cfg) return;
    try {
      // no papel, a linha mais antiga vem primeiro
      const linhas = [...lista].reverse().map((t) => linhaReg006(t, ctx.nomeMaquina(t.produto_id), numeroDe));
      setPdf(await pdfRegistroGiga({ codigo: REG006.codigo, titulo: REG006.titulo, revisao: textoPadrao(cfg, "reg006_revisao"), filtros: filtrosTexto, linhas },
        comUnidade(cfg, unidades.find((u) => u.id === atual))));
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="space-y-3">
      <div className="cartao grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="De"><input type="date" className="input" value={f.de ?? ""} onChange={(e) => set({ de: e.target.value || undefined })} /></Field>
        <Field label="Até"><input type="date" className="input" value={f.ate ?? ""} onChange={(e) => set({ ate: e.target.value || undefined })} /></Field>
        <Field label="Modelo">
          <select className="input" value={f.produtoId ?? ""} onChange={(e) => set({ produtoId: e.target.value || undefined })}>
            <option value="">Todos</option>
            {ctx.maquinas.map((m) => <option key={m.id} value={m.id}>{ctx.nomeMaquina(m.id)}</option>)}
          </select>
        </Field>
        <Field label="NS"><input className="input uppercase placeholder:normal-case" value={f.ns ?? ""} placeholder="Número de série" onChange={(e) => set({ ns: e.target.value || undefined })} /></Field>
        <Field label="Operador">
          <select className="input" value={f.operador ?? ""} onChange={(e) => set({ operador: e.target.value || undefined })}>
            <option value="">Todos</option>
            {operadores.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Resultado">
          <select className="input" value={f.resultado ?? ""} onChange={(e) => set({ resultado: (e.target.value || "") as FiltroTestes["resultado"] })}>
            <option value="">Todos</option><option value="aprovada">Aprovadas</option><option value="reprovada">Reprovadas</option>
          </select>
        </Field>
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-3 lg:col-span-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4" checked={!!f.anulados} onChange={(e) => set({ anulados: e.target.checked })} /> Mostrar os anulados
          </label>
          <SelectMarcador valor={marcador} onChange={setMarcador} todos={marcadores} />
          <button type="button" className="link-acao text-sm"
            onClick={() => { setF({ de: inicioDoMes(), ate: hojeBR() }); setMarcador(""); }}>Limpar filtros</button>
          <span className="flex-1" />
          <Button variant="secondary" onClick={exportar} disabled={!lista.length}><FileDown size={16} /> Planilha</Button>
          <Button onClick={imprimir} disabled={!cfg}><Printer size={16} /> REG-006 (PDF)</Button>
        </div>
      </div>

      <p className="px-1 text-xs text-slate-500">{filtrosTexto}</p>

      {/* Celular: um cartão por teste */}
      <ul className="space-y-2 md:hidden">
        {lista.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => setAberto(t)} className={`cartao w-full p-3 text-left ${t.anulado_em ? "opacity-60" : ""}`}>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="num block font-bold text-fg">{t.numero_serie}</span>
                  <span className="block truncate text-xs text-slate-500">{ctx.nomeMaquina(t.produto_id)} · nº {t.numero}{(t.tentativa ?? 1) > 1 ? ` · ${t.tentativa}ª tentativa` : ""}</span>
                </span>
                <SeloResultado t={t} />
              </span>
              <span className="mt-2 grid grid-cols-3 gap-1 text-xs">
                {([["Funcional", t.funcional], ["Aterram.", t.aterramento], ["Tensão", t.tensao]] as const).map(([rotulo, r]) => (
                  <span key={rotulo} className="min-w-0"><span className="block text-2xs font-semibold uppercase tracking-wide text-slate-400">{rotulo}</span><Res r={r} /></span>
                ))}
              </span>
              <span className="mt-1.5 block text-xs text-slate-500">{dataHoraBR(t.testado_em)} · {t.operador_nome}</span>
              {!!t.marcadores?.length && <span className="mt-1.5 block"><ChipsMarcadores ids={t.marcadores} todos={marcadores} pequeno /></span>}
            </button>
          </li>
        ))}
        {!lista.length && <li className="py-8 text-center text-sm text-slate-500">Nenhum teste com estes filtros.</li>}
      </ul>

      <div className="hidden md:block">
        <Table empty={!lista.length}
          head={<>
            <th className="th">Nº</th><th className="th">Data</th><th className="th">Máquina / NS</th><th className="th">Operador</th>
            <th className="th">Funcional</th><th className="th">Cont. aterram.</th><th className="th">Tensão suport.</th><th className="th">Resultado</th>
          </>}>
          {lista.map((t) => (
            <tr key={t.id} className={`cursor-pointer hover:bg-slate-50/70 ${t.anulado_em ? "opacity-60" : ""}`} onClick={() => setAberto(t)}>
              <td className="td num text-slate-500">{t.numero}</td>
              <td className="td num whitespace-nowrap">{dataHoraBR(t.testado_em)}</td>
              <td className="td">
                <span className="num block font-bold text-fg">{t.numero_serie}</span>
                <span className="block text-xs text-slate-500">{ctx.nomeMaquina(t.produto_id)}{(t.tentativa ?? 1) > 1 ? ` · ${t.tentativa}ª tentativa` : ""}</span>
                {!!t.marcadores?.length && <span className="mt-1 block"><ChipsMarcadores ids={t.marcadores} todos={marcadores} pequeno /></span>}
              </td>
              <td className="td">{t.operador_nome}</td>
              <td className="td"><Res r={t.funcional} /></td>
              <td className="td"><Res r={t.aterramento} medidas={medidasAterramento(t)} /></td>
              <td className="td"><Res r={t.tensao} medidas={medidasTensao(t)} /></td>
              <td className="td"><SeloResultado t={t} />{!!t.divergencias?.length && <span className="mt-1 block text-2xs font-semibold text-amber-700">fora do limite</span>}</td>
            </tr>
          ))}
        </Table>
      </div>

      {aberto && <DetalheTeste t={aberto} ctx={ctx} onTrocar={setAberto} onClose={() => setAberto(null)}
        onReteste={(t) => { setAberto(null); onReteste(t); }} numeroOp={numeroOp} />}
      {pdf && <PdfViewer blob={pdf} nome={`REG-006-teste-do-giga-${hojeBR()}.pdf`} titulo="REG-006 · Teste do giga" onClose={() => setPdf(null)} />}
    </div>
  );
}

/** Detalhe de um teste: medidas com os limites da época, histórico do NS, reteste e anulação. */
function DetalheTeste({ t, ctx, onClose, onTrocar, onReteste, numeroOp }: {
  t: TesteGiga; ctx: ContextoGiga; onClose: () => void; onTrocar: (t: TesteGiga) => void; onReteste: (t: TesteGiga) => void;
  numeroOp: (id: string | null | undefined) => number | null;
}) {
  const invalidar = useInvalidate();
  const { nome: nomeUnidade } = useUnidade();
  const [ocupado, setOcupado] = useState(false);
  const ns = normalizarNs(t.numero_serie);
  // histórico completo do NS (os anulados também, apagados)
  const todosDoNs = ctx.testes.filter((x) => normalizarNs(x.numero_serie) === ns).sort((a, b) => a.testado_em.localeCompare(b.testado_em) || a.numero - b.numero);
  const validosDoNs = historicoPorNs(ctx.testes).get(ns) ?? [];
  const ehUltimo = validosDoNs[validosDoNs.length - 1]?.id === t.id;
  const podeReteste = ctx.podeLancar && !t.anulado_em && ehUltimo && resultadoDe(t) === "reprovada";
  const par = (t.parametros ?? {}) as Record<string, number | string | null>;
  const lim = (campo: string, unidade: string, prefixo: string) => (par[campo] != null ? `${prefixo} ${fmtNum(Number(par[campo]))} ${unidade}` : null);
  const anterior = t.reteste_de ? ctx.testes.find((x) => x.id === t.reteste_de) : null;

  async function anular() {
    const motivo = await pedirTexto(`Anular o teste nº ${t.numero} (${t.numero_serie}). O lançamento fica no histórico, fora das contas. Motivo (mínimo 5 caracteres):`, "",
      { titulo: "Anular teste do giga", ok: "Anular", minimo: 5 });
    if (!motivo?.trim()) return;
    setOcupado(true);
    try {
      const n = await anularTesteGiga(t.id, motivo.trim());
      notify(`Teste nº ${n} anulado`);
      invalidar(...CHAVES_GIGA);
      onClose();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const linhaTeste = (rotulo: string, r: Resultado, medidas: string, limites: (string | null)[]) => (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-fg">{rotulo}</span><Res r={r} /></div>
      {medidas && <p className="num mt-1 text-sm text-slate-700">{medidas}</p>}
      {limites.some(Boolean) && <p className="mt-0.5 text-xs text-slate-500">Limites na hora do teste: {limites.filter(Boolean).join(" · ")}</p>}
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`Teste do giga nº ${t.numero} · ${t.numero_serie}`} wide>
      <div className="space-y-4 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-2">
          <SeloResultado t={t} />
          {(t.tentativa ?? 1) > 1 && <span className="text-sm text-slate-600">{t.tentativa}ª tentativa{anterior ? ` · reteste do nº ${anterior.numero}` : ""}</span>}
          <span className="flex-1" />
          {ctx.podeLancar && <BotaoMarcadores tabela="testes_giga" registro={t} nome={["teste", "testes"]} />}
        </div>
        {t.anulado_em && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <b>Anulado</b> em {dataHoraBR(t.anulado_em)}: {t.anulado_motivo}. Fica no histórico, fora das contas e do painel.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Item rotulo="Data e hora" valor={dataHoraBR(t.testado_em)} />
          <Item rotulo="Máquina" valor={ctx.nomeMaquina(t.produto_id)} />
          <Item rotulo="NS" valor={t.numero_serie} />
          <Item rotulo="Operador" valor={t.operador_nome} />
          <Item rotulo="OP" valor={t.ordem_producao_id ? `#${numeroOp(t.ordem_producao_id) ?? "?"}` : "—"} />
          <Item rotulo="Giga" valor={t.giga || "—"} />
          <Item rotulo="Unidade" valor={t.unidade_id ? nomeUnidade(t.unidade_id) : "—"} />
          <Item rotulo="Lançado por" valor={[t.criado_por_nome, t.criado_em && dataHoraBR(t.criado_em)].filter(Boolean).join(" · ") || "—"} />
        </dl>
        <div className="grid gap-2 md:grid-cols-3">
          {linhaTeste("Funcional", t.funcional, "", [])}
          {linhaTeste("Continuidade do aterramento", t.aterramento, medidasAterramento(t), [lim("aterramento_resistencia_max_ohm", "Ω", "máx."), lim("aterramento_corrente_a", "A", "corrente")])}
          {linhaTeste("Tensão suportável", t.tensao, medidasTensao(t), [lim("tensao_v", "V", "ensaio"), lim("tensao_tempo_s", "s", "tempo"), lim("tensao_fuga_max_ma", "mA", "fuga máx.")])}
        </div>
        {!!t.divergencias?.length && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>Fora do limite, marcado como aprovado:</b> {t.divergencias.join("; ")}</p>
        )}
        <div>
          <h3 className="mb-1 text-sm font-semibold">Observações</h3>
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{t.observacoes || "—"}</p>
        </div>

        {todosDoNs.length > 1 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><History size={15} aria-hidden /> Histórico do NS {t.numero_serie}</h3>
            <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {todosDoNs.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => onTrocar(x)} aria-current={x.id === t.id}
                    className={`linha-clicavel flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${x.id === t.id ? "bg-slate-50 font-semibold" : ""} ${x.anulado_em ? "opacity-60" : ""}`}>
                    <span className="num w-12 text-slate-500">nº {x.numero}</span>
                    <span className="num">{dataHoraBR(x.testado_em)}</span>
                    <SeloResultado t={x} />
                    <span className="text-xs text-slate-500">{falhas(x).length ? `reprovou em ${falhas(x).map(rotuloTipo).join(", ").toLowerCase()}` : ""}</span>
                    <span className="ml-auto text-xs text-slate-500">{x.operador_nome}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          {ctx.podeLancar && !t.anulado_em && <Button variant="ghost" className="!text-red-600" disabled={ocupado} onClick={anular}><Ban size={16} /> Anular lançamento</Button>}
          <span className="flex-1" />
          {podeReteste && <Button onClick={() => onReteste(t)}><RotateCcw size={16} /> Lançar reteste</Button>}
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="font-semibold text-fg">{valor}</dd>
    </div>
  );
}
