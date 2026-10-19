// Sobre → Telas: quantas vezes cada tela foi alterada (contado no histórico do código a cada versão publicada), com
// indicadores, a tela que mais mudou, as mudanças publicadas por dia e a lista com busca e ordem.
import { useMemo, useState } from "react";
import { CalendarDays, Flame, History, LayoutGrid, Sparkles } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { dataBR, pl } from "@/lib/format";
import type { AlteracaoTela, DiaHistorico } from "@/lib/atualizacoes";

const TELAS: AlteracaoTela[] = typeof __ERP_TELAS__ !== "undefined" ? __ERP_TELAS__ : [];
const HISTORICO: DiaHistorico[] = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("sv-SE"); };
type Ordem = "vezes" | "recente" | "nome";

export function TelasAlteradas() {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("vezes");
  const [periodo, setPeriodo] = useState<"tudo" | "7">("tudo");
  const total = TELAS.reduce((s, t) => s + t.vezes, 0);
  const semana = diasAtras(7);
  const daSemana = TELAS.filter((t) => t.ultima >= semana);
  const campea = TELAS[0];
  const porDia = useMemo(() => HISTORICO.slice(-30).map((d) => ({ rotulo: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7), valores: [d.mudancas.length] })), []);

  const termo = semAcento(busca.trim());
  const lista = TELAS.filter((t) => (!termo || semAcento(`${t.tela} ${t.arquivo}`).includes(termo)) && (periodo === "tudo" || t.ultima >= semana))
    .sort((a, b) => (ordem === "vezes" ? b.vezes - a.vezes : ordem === "recente" ? b.ultima.localeCompare(a.ultima) || b.vezes - a.vezes : a.tela.localeCompare(b.tela)));
  const max = Math.max(1, ...TELAS.map((t) => t.vezes));

  if (!TELAS.length) return <Card className="p-6 text-center text-sm text-slate-500">A contagem aparece no site publicado (vem do histórico do código).</Card>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Telas" valor={TELAS.length} icon={LayoutGrid} sub="arquivos de tela do ERP" onClick={() => setPeriodo("tudo")} />
        <Stat label="Alterações" valor={total.toLocaleString("pt-BR")} icon={History} sub={`média de ${(total / TELAS.length).toFixed(1).replace(".", ",")} por tela`} />
        <Stat label="Mais alterada" valor={campea.tela} icon={Flame} tom="atencao" sub={`${campea.vezes} ${pl(campea.vezes, "vez", "vezes")}`} onClick={() => setBusca(campea.tela)} />
        <Stat label="Mexidas em 7 dias" valor={daSemana.length} icon={Sparkles} tom="bom" sub="clique para ver só elas" onClick={() => setPeriodo(periodo === "7" ? "tudo" : "7")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-fg"><Flame size={16} /> As 12 telas que mais mudaram</h3>
          <Ranking itens={TELAS.slice(0, 12).map((t) => ({ rotulo: t.tela, valor: t.vezes, detalhe: `última em ${dataBR(t.ultima)}` }))} formatar={(v) => `${v}×`}
            onClicar={(i) => setBusca(TELAS[i].tela)} ativo={busca || null} />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-fg"><CalendarDays size={16} /> Mudanças publicadas por dia</h3>
          <Colunas dados={porDia} series={[{ nome: "Mudanças", cor: "var(--serie-2)" }]} formatar={(v) => String(Math.round(v))} inteiro altura={250} vazio="Sem histórico nesta montagem." />
          <p className="mt-2 text-xs text-slate-500">Últimos {porDia.length} dias de trabalho. Cada mudança publicada pode mexer em várias telas.</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="input min-w-0 flex-1" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tela" aria-label="Buscar tela" />
          <select className="input w-auto" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordem">
            <option value="vezes">Mais alteradas</option><option value="recente">Mexidas por último</option><option value="nome">Nome</option>
          </select>
          <select className="input w-auto" value={periodo} onChange={(e) => setPeriodo(e.target.value as "tudo" | "7")} aria-label="Período">
            <option value="tudo">Todas</option><option value="7">Últimos 7 dias</option>
          </select>
        </div>
        <p className="mb-2 text-sm text-slate-500">{lista.length} {pl(lista.length, "tela", "telas")}. Atualiza sozinho a cada versão publicada.</p>
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((t) => (
            <li key={t.arquivo} className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium" title={t.arquivo}>{t.tela}</span>
                <span className="shrink-0 text-xs text-slate-500"><b className="text-fg">{t.vezes}</b>× · {dataBR(t.ultima)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${(t.vezes / max) * 100}%`, background: "var(--serie-1)" }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
