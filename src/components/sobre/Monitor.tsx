// Sobre → Monitor (só o administrador): a saúde do ERP de relance — o backup, as automações agendadas (rodou na hora?
// falhou?), as respostas das funções — e o registro das execuções dos comandos. O resumo do que está parado, as chaves e
// certificados e as filas que travam o trabalho ficam no Painel gerencial (SaudeGerencial).
// O vigia (pg_cron erp-vigiar-sistema) confere o mesmo de hora em hora e avisa no sino; esta tela mostra o porquê.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ClipboardPlus, DatabaseBackup, Inbox, RefreshCw, Server } from "lucide-react";
import { Button, Card, Stat } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { pl } from "@/lib/format";
import {
  AUTOMACOES, FILAS, SITUACAO_AUTO, agendaEmPortugues, diagnosticoMonitor, diasDesde, resumoSaude, situacaoAutomacao, situacaoBackup,
  type Saude,
} from "@/lib/monitor";
import { ExecucaoModal, RegistroExecucoes, type InicialExecucao } from "./Execucoes";
import { Chaves } from "./Chaves";

export const haQuanto = (iso: string | null, agora: string) => {
  if (!iso) return "nunca";
  const min = Math.round((new Date(agora).getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};

/** A saúde do sistema (só o administrador lê): a mesma leitura no Monitor e no Painel gerencial. */
export function useSaude() {
  return useQuery({
    queryKey: ["saude_sistema"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saude_sistema"); if (error) throw error; return data as Saude; },
    // a conta leva de 2 a 8 s no banco: a cada 5 min basta (o vigia de hora em hora avisa no sino o que parar)
    refetchInterval: 300_000,
    staleTime: 60_000,
  });
}

/**
 * Gestão → Painel gerencial (só o administrador): o que está parado ("Tem coisa parada"), as chaves e certificados que
 * vencem e as filas que travam o trabalho. Saíram do Sobre → Monitor, que ficou com as automações e o backup.
 */
export function SaudeGerencial() {
  const q = useSaude();
  const [execucao, setExecucao] = useState<InicialExecucao | null>(null);
  const s = q.data;
  const resumo = useMemo(() => (s ? resumoSaude(s, s.agora) : null), [s]);
  if (q.isError) return <Card className="mb-5 p-4 text-sm text-red-800">Não deu para ler a saúde do sistema: {(q.error as Error).message}</Card>;
  if (!s || !resumo) return <Card className="mb-5 p-4 text-sm text-slate-500">Conferindo o que está parado…</Card>;
  const registrarVerificacao = () => setExecucao({
    comando: "MONITOR", alvo: "automacoes", situacao: "em_andamento",
    entrada: "MONITOR automações (verificação no Painel gerencial)",
    diagnostico: diagnosticoMonitor(s, s.agora),
  });
  return (
    <div className="mb-5 space-y-4">
      <Semaforo nivel={resumo.nivel} problemas={resumo.problemas} onAtualizar={() => q.refetch()} atualizando={q.isFetching} onRegistrar={registrarVerificacao} />
      <Chaves lista={s.vencimentos ?? []} />
      <Filas s={s} />
      {execucao && <ExecucaoModal inicial={execucao} onClose={() => setExecucao(null)} />}
    </div>
  );
}

export function Monitor() {
  const q = useSaude();
  const [execucao, setExecucao] = useState<InicialExecucao | null>(null);
  const s = q.data;
  const resumo = useMemo(() => (s ? resumoSaude(s, s.agora) : null), [s]);
  const autos = useMemo(() => (s ? [...s.automacoes].sort((a, b) =>
    SITUACAO_AUTO[situacaoAutomacao(a, s.agora)].grave - SITUACAO_AUTO[situacaoAutomacao(b, s.agora)].grave
    || (AUTOMACOES[a.nome]?.nome ?? a.nome).localeCompare(AUTOMACOES[b.nome]?.nome ?? b.nome)) : []), [s]);

  const registrarVerificacao = () => s && setExecucao({
    comando: "MONITOR", alvo: "automacoes", situacao: "em_andamento",
    entrada: "MONITOR automações (verificação na tela Monitor)",
    diagnostico: diagnosticoMonitor(s, s.agora),
  });

  return (
    <div className="space-y-4">
      {q.isError && <Card className="p-4 text-sm text-red-800">Não deu para ler a saúde do sistema: {(q.error as Error).message}</Card>}
      {!s || !resumo ? (!q.isError && <Card className="p-4 text-sm text-slate-500">Conferindo as automações…</Card>) : (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-4 text-sm text-slate-700">
            <span className="min-w-0 flex-1">O resumo do que está parado, as chaves e certificados e as filas que travam o trabalho ficam em Gestão → Painel gerencial.</span>
            <Link to="/gerencial" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">Abrir <ArrowRight size={12} aria-hidden /></Link>
            <Button type="button" tamanho="mini" variant="secondary" onClick={registrarVerificacao}>
              <ClipboardPlus size={14} aria-hidden /> Registrar verificação
            </Button>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Automações em dia" valor={`${resumo.contagem.ok} de ${s.automacoes.length}`} icon={Activity}
              tom={resumo.contagem.falhou + resumo.contagem.atrasada ? "critico" : resumo.contagem.instavel ? "atencao" : "bom"}
              sub={resumo.contagem.falhou + resumo.contagem.atrasada ? `${resumo.contagem.falhou + resumo.contagem.atrasada} parada(s) ou com falha` : resumo.contagem.aguardando ? `${resumo.contagem.aguardando} esperando a 1ª rodada` : "todas rodaram na hora"} />
            <Stat label="Funções (6 horas)" valor={s.chamadas ? `${s.chamadas.ok} ok` : "—"} icon={Server}
              tom={!s.chamadas ? "neutro" : s.chamadas.erro >= 3 ? "critico" : s.chamadas.erro ? "atencao" : "bom"}
              sub={s.chamadas ? (s.chamadas.erro ? `${s.chamadas.erro} com erro` : "nenhuma com erro") : "sem leitura"} />
            <Stat label="Filas com itens" valor={s.filas.filter((f) => f.qtd).length} icon={Inbox}
              tom={s.filas.some((f) => f.qtd && FILAS[f.chave]?.grave) ? "critico" : s.filas.some((f) => f.qtd) ? "atencao" : "bom"} sub={`de ${s.filas.length} filas conferidas`} />
            <BackupStat s={s} />
          </div>

          <BackupCartao s={s} />

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 p-4">
              <Activity size={18} className="text-sky-700" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-fg">Automações agendadas</h2>
                <p className="text-xs text-slate-600">Horários de Brasília. "Atrasada": passou de duas vezes o intervalo sem rodar. O agendador só garante a chamada; as respostas estão em "Funções".</p>
              </div>
            </div>
            <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
              {autos.map((a) => {
                const sit = SITUACAO_AUTO[situacaoAutomacao(a, s.agora)];
                const def = AUTOMACOES[a.nome];
                return (
                  <li key={a.nome} className="flex min-w-0 flex-col gap-1.5 bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sit.ponto}`} aria-hidden />
                      <h3 className="min-w-0 flex-1 font-bold text-fg">{def?.nome ?? a.nome}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${sit.cor}`}>{sit.nome}</span>
                    </div>
                    {def && <p className="text-sm text-slate-600">{def.texto}</p>}
                    <p className="text-xs text-slate-600">
                      {agendaEmPortugues(a.agenda)} · última {haQuanto(a.ultima, s.agora)}
                      {a.falhas_24h ? ` · ${a.falhas_24h} ${pl(a.falhas_24h, "falha", "falhas")} em 24 h` : ""}
                      {!a.falhas_24h && a.falhas_7d ? ` · ${a.falhas_7d} em 7 dias` : ""}
                    </p>
                    {a.ultimo_erro && (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-semibold text-red-700">Último erro ({haQuanto(a.ultimo_erro_em, s.agora)})</summary>
                        <p className="mt-1 whitespace-pre-line break-words rounded bg-slate-50 p-2 font-mono text-slate-700">{a.ultimo_erro}</p>
                      </details>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <span className="font-mono text-2xs text-slate-500">{a.nome}</span>
                      {def?.tela && <Link to={def.tela} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">Abrir <ArrowRight size={12} aria-hidden /></Link>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

        </>
      )}

      <RegistroExecucoes onNova={setExecucao} />
      {execucao && <ExecucaoModal inicial={execucao} onClose={() => setExecucao(null)} />}
    </div>
  );
}

function Filas({ s }: { s: Saude }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 p-4">
        <Inbox size={18} className="text-sky-700" aria-hidden />
        <h2 className="font-bold text-fg">Filas que travam o trabalho</h2>
      </div>
      <ul className="divide-y divide-slate-100">
        {s.filas.map((f) => {
          const def = FILAS[f.chave];
          const cor = !f.qtd ? "bg-emerald-500" : def?.grave ? "bg-red-500" : "bg-amber-500";
          return (
            <li key={f.chave} className="flex flex-wrap items-center gap-3 p-4">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg">{def?.nome ?? f.chave}</div>
                <div className="text-xs text-slate-600">{def?.texto}{f.qtd && f.desde ? ` · a mais antiga ${haQuanto(f.desde, s.agora)}` : ""}</div>
              </div>
              <div className="num text-right text-lg font-bold text-fg">
                {f.qtd}{f.chave === "extrato" && f.total ? <span className="block text-xs font-normal text-slate-600">de {f.total} ({Math.round((f.qtd / f.total) * 100)}%)</span> : null}
              </div>
              {def?.tela && f.qtd > 0 && <Link to={def.tela} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">Resolver <ArrowRight size={12} aria-hidden /></Link>}
            </li>
          );
        })}
      </ul>
      {s.chamadas?.ultimo_erro && <p className="border-t border-slate-100 p-4 text-xs text-slate-600">Último erro de função: <span className="font-mono">{s.chamadas.ultimo_erro}</span></p>}
      <p className="border-t border-slate-100 p-4 text-xs text-slate-500">Histórico do agendador: {s.historico_linhas.toLocaleString("pt-BR")} linhas guardadas.</p>
    </Card>
  );
}

function Semaforo({ nivel, problemas, onAtualizar, atualizando, onRegistrar }: {
  nivel: "ok" | "atencao" | "critico"; problemas: string[]; onAtualizar: () => void; atualizando: boolean; onRegistrar: () => void;
}) {
  const estilo = nivel === "critico" ? "bg-fixo-rose-800" : nivel === "atencao" ? "bg-fixo-amber-700" : "bg-fixo-emerald-700";
  const Icone = nivel === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <Card className="overflow-hidden">
      <div className={`flex flex-wrap items-start gap-3 ${estilo} p-4 text-white sm:p-5`}>
        <Icone size={28} className="shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{nivel === "ok" ? "Tudo rodando" : nivel === "critico" ? "Tem coisa parada" : "Atenção"}</h2>
          {problemas.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm opacity-95">{problemas.slice(0, 8).map((p) => <li key={p} className="break-words">{p}</li>)}</ul>
          ) : <p className="text-sm opacity-90">Automações em dia, funções respondendo, filas vazias e backup guardado.</p>}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" onClick={onAtualizar} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25">
            <RefreshCw size={14} className={atualizando ? "animate-spin" : ""} aria-hidden /> Conferir agora
          </button>
          <button type="button" onClick={onRegistrar} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-fixo-slate-900 hover:bg-fixo-slate-200">
            <ClipboardPlus size={14} aria-hidden /> Registrar verificação
          </button>
        </div>
      </div>
    </Card>
  );
}

function BackupStat({ s }: { s: Saude }) {
  const b = situacaoBackup(s.backup, s.agora);
  return <Stat label="Backup" valor={b.ok ? "Em dia" : b.dias === null ? "Sem cópia" : `${b.dias} dias`} icon={DatabaseBackup} tom={b.ok ? "bom" : "critico"} sub={b.ok ? "cópia nas últimas 30 h" : "sem cópia guardada"} />;
}

/** Backup parado: a causa vista e o caminho para resolver (os secrets quem coloca é a empresa, no GitHub). */
function BackupCartao({ s }: { s: Saude }) {
  const b = situacaoBackup(s.backup, s.agora);
  if (b.ok) return null;
  const ult = s.backup.ultimo;
  const link = ult?.detalhe?.match(/https:\/\/github\.com\/\S+/)?.[0];
  return (
    <Card className="border-red-300 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <DatabaseBackup size={22} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <h2 className="text-base font-bold text-red-800">Backup: {b.texto}</h2>
          {ult && <p className="text-slate-700">Último registro: {new Date(ult.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ({diasDesde(ult.em, s.agora)} {pl(diasDesde(ult.em, s.agora), "dia", "dias")}), {ult.status}.
            {link && <> <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 underline">Ver no GitHub</a></>}</p>}
          <p className="font-semibold text-fg">Para voltar a guardar (no GitHub do ERP → Settings → Secrets and variables → Actions):</p>
          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
            <li><b>BACKUP_CHAVE</b>: uma frase longa (16 caracteres ou mais) que só a empresa sabe. Guarde a frase também fora do GitHub: sem ela a cópia não abre.</li>
            <li><b>SUPABASE_ACCESS_TOKEN</b>: gere uma chave nova no Supabase (Account → Access Tokens) e troque a antiga.</li>
            <li>Em Actions → "Backup diário" → <b>Run workflow</b>. Em uns 5 minutos o Monitor fica verde.</li>
          </ol>
          <p className="text-xs text-slate-500">O vigia avisa o administrador todo dia (urgente, com ciência) até a cópia voltar a ser guardada.</p>
        </div>
      </div>
    </Card>
  );
}
