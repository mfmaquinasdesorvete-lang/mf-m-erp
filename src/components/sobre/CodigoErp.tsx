// Sobre → Código (o lúdico do Fabiano): quantas linhas de código o ERP tem, em que técnica cada parte foi escrita e as
// ferramentas usadas. Contado nos arquivos na hora de montar o site: se atualiza sozinho a cada versão publicada.
import { useEffect, useState } from "react";
import { Clock, Code2, FileCode2, Layers, Printer, Rocket } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { Ranking, Rosca } from "@/components/Charts";
import type { DiaHistorico } from "@/lib/atualizacoes";
import type { HorasProjeto, TecnicaCodigo } from "@/lib/codigoErp";

const CODIGO: TecnicaCodigo[] = typeof __ERP_CODIGO__ !== "undefined" ? __ERP_CODIGO__ : [];
const HISTORICO: DiaHistorico[] = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];
const HORAS: HorasProjeto | null = typeof __ERP_HORAS__ !== "undefined" ? __ERP_HORAS__ : null;
const n = (v: number) => v.toLocaleString("pt-BR");

const FERRAMENTAS = [
  { nome: "React", faz: "monta as telas, peça por peça" },
  { nome: "TypeScript", faz: "JavaScript com conferência dos tipos: menos erro bobo" },
  { nome: "Vite", faz: "empacota o site em segundos" },
  { nome: "Tailwind CSS", faz: "cores, espaços e o encaixe no celular" },
  { nome: "Supabase · PostgreSQL", faz: "o banco de dados, com trava por usuário (RLS)" },
  { nome: "Deno", faz: "as funções na nuvem (NF-e, bancos, marketplaces)" },
  { nome: "React Query", faz: "busca e guarda os dados sem recarregar a página" },
  { nome: "jsPDF", faz: "cupons, recibos, propostas e relatórios em PDF" },
  { nome: "Vitest e Playwright", faz: "testes automáticos e o robô que clica nas telas" },
  { nome: "GitHub e Hostinger", faz: "guarda cada versão e publica o site" },
];

export function CodigoErp() {
  const total = CODIGO.reduce((s, t) => s + t.linhas, 0);
  const arquivos = CODIGO.reduce((s, t) => s + t.arquivos, 0);
  const mudancas = HISTORICO.reduce((s, d) => s + d.mudancas.length, 0);
  if (!CODIGO.length) return <Card className="p-6 text-center text-sm text-slate-500">A contagem aparece no site publicado (vem dos arquivos do código).</Card>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Só para curiosidade: o tamanho do ERP por dentro. Atualiza sozinho a cada versão publicada.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Linhas de código" valor={n(total)} icon={Code2} tom="bom" />
        <Stat label="Arquivos" valor={n(arquivos)} icon={FileCode2} />
        <Stat label="Se fosse impresso" valor={`${n(Math.round(total / 50))} páginas`} icon={Printer} sub="50 linhas por folha A4" />
        <Stat label="Mudanças publicadas" valor={n(mudancas)} icon={Rocket} sub={`em ${HISTORICO.length} dias de trabalho`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-fg"><Layers size={16} /> Linhas por técnica</h3>
          <div className={HORAS?.horas ? "grid items-center gap-4 sm:grid-cols-2" : ""}>
            <Rosca fatias={CODIGO.map((t) => ({ rotulo: t.tecnica, valor: t.linhas, cor: t.cor }))} total="linhas" formatar={n} />
            {!!HORAS?.horas && <HorasNoProjeto h={HORAS} />}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-fg"><Code2 size={16} /> Do maior para o menor</h3>
          <Ranking itens={CODIGO.map((t) => ({ rotulo: t.tecnica, valor: t.linhas, detalhe: `${n(t.arquivos)} arquivos · ${t.oQueFaz}` }))} formatar={(v) => `${n(v)} linhas`} />
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-fg">As ferramentas</h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FERRAMENTAS.map((f) => (
            <li key={f.nome} className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100"><b>{f.nome}</b><span className="block text-xs text-slate-500">{f.faz}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">PHP não é usado: o site é HTML e JavaScript servido pela Hostinger, e a parte do servidor (banco e funções) fica no Supabase.</p>
      </Card>
    </div>
  );
}

/** Horas no projeto desde o começo, ao lado de um relógio de ponteiros (marca a hora de agora). */
function HorasNoProjeto({ h }: { h: HorasProjeto }) {
  const desde = h.desde ? new Date(h.desde).toLocaleDateString("pt-BR") : "";
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-4 text-center ring-1 ring-slate-100">
      <Relogio />
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock size={13} /> Horas no projeto</p>
      <p className="num text-3xl font-bold text-fg">{n(h.horas)} h</p>
      <p className="text-xs text-slate-500">
        desde {desde} · {n(h.dias)} {h.dias === 1 ? "dia" : "dias"} de trabalho · {n(h.periodos)} {h.periodos === 1 ? "período" : "períodos"}
      </p>
      <p className="text-2xs text-slate-400">Pelos horários de cada envio do código (pausa de até 1h30 conta como o mesmo período).</p>
    </div>
  );
}

function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  const s = agora.getSeconds(), m = agora.getMinutes() + s / 60, hr = (agora.getHours() % 12) + m / 60;
  const ponteiro = (graus: number, comp: number, larg: number, cor: string) => (
    <line x1="50" y1="50" x2={50 + comp * Math.sin((graus * Math.PI) / 180)} y2={50 - comp * Math.cos((graus * Math.PI) / 180)}
      stroke={cor} strokeWidth={larg} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28" role="img" aria-label={`Relógio: ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}>
      <circle cx="50" cy="50" r="46" fill="rgb(var(--surface))" stroke="currentColor" strokeWidth="3" className="text-slate-300" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180, r1 = i % 3 === 0 ? 34 : 38;
        return <line key={i} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + 42 * Math.sin(a)} y2={50 - 42 * Math.cos(a)}
          stroke="currentColor" strokeWidth={i % 3 === 0 ? 3 : 1.5} strokeLinecap="round" className="text-slate-400" />;
      })}
      {ponteiro(hr * 30, 22, 4.5, "rgb(var(--fg))")}
      {ponteiro(m * 6, 32, 3, "rgb(var(--fg))")}
      {ponteiro(s * 6, 36, 1.5, "#ec4899")}
      <circle cx="50" cy="50" r="3" fill="#ec4899" />
    </svg>
  );
}
