// Anotações por voz (aberta pelo aviso "🎤 Fulano anotou…"): o que a equipe falou no botão do microfone, para quem
// confere marcar "Conferido" ou "Não achei". Quem confere: Configurações (voz_responsaveis; hoje a Évellem), a conta
// master na retaguarda (parada há mais de 2 dias) e a pessoa do lembrete. Os outros (ex.: o financeiro) só acompanham.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCheck, ExternalLink, Mic, Search, Wallet, X } from "lucide-react";
import { Button, Card, PageHeader, Stat, Tabs } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { useAbaUrl } from "@/lib/abaUrl";
import { supabase } from "@/lib/supabase";
import { brl, dataHoraBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { parada, ROTULO_SITUACAO, TIPOS, type AnotacaoVoz, type SituacaoVoz } from "@/lib/anotacoesVoz";

const ABAS = ["conferir", "feitas", "todas"] as const;
type Aba = (typeof ABAS)[number];
const COR: Record<SituacaoVoz, string> = {
  pendente: "bg-amber-100 text-amber-800", conferido: "bg-emerald-100 text-emerald-800", nao_achei: "bg-rose-100 text-rose-800",
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function useAnotacoesVoz() {
  return useQuery({
    queryKey: ["anotacoes_voz"],
    queryFn: async () => {
      const { data, error } = await supabase.from("anotacoes_voz").select("*").order("criado_em", { ascending: false }).limit(500);
      if (error) throw error;
      return data as AnotacaoVoz[];
    },
    refetchInterval: 60_000,
  });
}

export default function Anotacoes() {
  const { user_id, papel, master } = usePerfil();
  const { data: cfg } = useConfig();
  const { data: lista = [], isLoading } = useAnotacoesVoz();
  const [aba, setAba] = useAbaUrl<Aba>("conferir", ABAS);
  const [busca, setBusca] = useState("");
  const responsaveis = (cfg?.voz_responsaveis ?? []) as string[];
  const confereTudo = papel === "admin" || master || responsaveis.includes(user_id);
  const podeConferir = (a: AnotacaoVoz) => confereTudo || a.para_user_id === user_id;

  const semana = Date.now() - 7 * 864e5;
  const pendentes = lista.filter((a) => a.situacao === "pendente");
  const daSemana = lista.filter((a) => new Date(a.criado_em).getTime() >= semana);
  const pagamentos = daSemana.filter((a) => a.tipo === "pagamento_video");

  const visiveis = useMemo(() => {
    const t = semAcento(busca.trim());
    return lista
      .filter((a) => aba === "todas" || (aba === "conferir" ? a.situacao === "pendente" : a.situacao !== "pendente"))
      .filter((a) => !t || semAcento([a.resumo, a.fala, a.ref_rotulo, a.criado_por_nome, a.resposta].join(" ")).includes(t));
  }, [lista, aba, busca]);

  return (
    <div className="space-y-4">
      <PageHeader title="Anotações por voz"
        subtitle="O que a equipe falou no botão do microfone. A voz só anota: confira e marque Conferido ou Não achei." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Para conferir" valor={pendentes.length} icon={Mic} tom={pendentes.length ? "atencao" : "bom"} onClick={() => setAba("conferir")} />
        <Stat label="Paradas há mais de 2 dias" valor={pendentes.filter((a) => parada(a)).length} icon={AlertTriangle}
          tom={pendentes.some((a) => parada(a)) ? "critico" : "neutro"} sub="vão para a retaguarda" />
        <Stat label="Conferidas na semana" valor={daSemana.filter((a) => a.situacao === "conferido").length} icon={CheckCheck} tom="bom"
          sub={`${daSemana.length} ${pl(daSemana.length, "anotação", "anotações")} nos últimos 7 dias`} />
        <Stat label="Pagamentos anotados na semana" valor={pagamentos.length} icon={Wallet} tom="info"
          sub={`${pagamentos.filter((a) => a.situacao === "conferido").length} conferidos com o banco`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={aba} onChange={setAba} options={[
          { value: "conferir", label: `Para conferir (${pendentes.length})` }, { value: "feitas", label: "Conferidas" }, { value: "todas", label: "Todas" },
        ]} />
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, pedido, pessoa…" />
        </label>
      </div>

      {!confereTudo && <p className="text-sm text-slate-500">Você acompanha as anotações; quem confere é a responsável (e a retaguarda).</p>}

      <Card>
        {isLoading ? <p className="p-6 text-center text-sm text-slate-500">Carregando…</p>
          : !visiveis.length ? <p className="p-6 text-center text-sm text-slate-500">{aba === "conferir" ? "Nada para conferir. 🎉" : "Nenhuma anotação."}</p>
          : (
            <ul className="divide-y divide-slate-100">
              {visiveis.map((a) => <Linha key={a.id} a={a} pode={podeConferir(a)} />)}
            </ul>
          )}
      </Card>
    </div>
  );
}

function Linha({ a, pode }: { a: AnotacaoVoz; pode: boolean }) {
  const qc = useQueryClient();
  const [resposta, setResposta] = useState(a.resposta ?? "");
  const [salvando, setSalvando] = useState(false);
  const t = TIPOS[a.tipo] ?? TIPOS.outro;

  async function marcar(situacao: SituacaoVoz) {
    setSalvando(true);
    const { error } = await supabase.rpc("conferir_anotacao_voz", { p_id: a.id, p_situacao: situacao, p_resposta: resposta || null });
    setSalvando(false);
    if (error) { notifyError(error); return; }
    qc.invalidateQueries({ queryKey: ["anotacoes_voz"] });
    qc.invalidateQueries({ queryKey: ["notificacoes_ciencia"] });
    notify(situacao === "pendente" ? "Voltou para conferir" : `Marcada: ${ROTULO_SITUACAO[situacao]}`);
  }

  return (
    <li className={`space-y-2 px-4 py-3 ${parada(a) ? "bg-rose-50/60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-xs font-semibold text-slate-500">{t.emoji} {t.rotulo}</p>
          <p className="font-semibold text-fg">{a.resumo}</p>
          {a.ref_rotulo && (
            <p className="text-sm text-slate-600">
              {a.link ? <Link to={a.link} className="inline-flex items-center gap-1 hover:underline">{a.ref_rotulo} <ExternalLink className="h-3 w-3" /></Link> : a.ref_rotulo}
            </p>
          )}
          {a.valor ? <p className="text-sm text-slate-600">Valor falado: <b>{brl(a.valor)}</b></p> : null}
          <p className="mt-1 text-xs text-slate-500">
            🎤 {a.criado_por_nome ?? "—"} · {dataHoraBR(a.criado_em)}{parada(a) && <b className="text-rose-700"> · parada há mais de 2 dias</b>}
          </p>
          <p className="text-xs italic text-slate-400">“{a.fala}”</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR[a.situacao]}`}>{ROTULO_SITUACAO[a.situacao]}</span>
      </div>

      {a.situacao !== "pendente" && (
        <p className="text-xs text-slate-500">
          {ROTULO_SITUACAO[a.situacao]} por {a.conferido_por_nome ?? "—"} · {dataHoraBR(a.conferido_em)}{a.resposta && <> · <i>{a.resposta}</i></>}
        </p>
      )}

      {pode && (a.situacao === "pendente" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Observação" className="input min-w-0 flex-1 basis-48" value={resposta} onChange={(e) => setResposta(e.target.value)}
            placeholder={a.tipo === "pagamento_video" ? "Obs. (ex.: Pix de 22/10 no Inter)" : "Obs. (opcional)"} />
          <Button onClick={() => marcar("conferido")} disabled={salvando}><Check className="h-4 w-4" /> Conferido</Button>
          <Button variant="secondary" onClick={() => marcar("nao_achei")} disabled={salvando}><X className="h-4 w-4" /> Não achei</Button>
        </div>
      ) : (
        <button type="button" onClick={() => marcar("pendente")} disabled={salvando} className="link-discreto text-xs">
          Voltar para conferir
        </button>
      ))}
    </li>
  );
}
