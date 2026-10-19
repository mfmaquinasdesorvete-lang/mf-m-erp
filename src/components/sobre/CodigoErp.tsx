// Sobre → Código (o lúdico do Fabiano): quantas linhas de código o ERP tem, em que técnica cada parte foi escrita e as
// ferramentas usadas. Contado nos arquivos na hora de montar o site: se atualiza sozinho a cada versão publicada.
import { Code2, FileCode2, Layers, Printer, Rocket } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { Ranking, Rosca } from "@/components/Charts";
import type { DiaHistorico } from "@/lib/atualizacoes";
import type { TecnicaCodigo } from "@/lib/codigoErp";

const CODIGO: TecnicaCodigo[] = typeof __ERP_CODIGO__ !== "undefined" ? __ERP_CODIGO__ : [];
const HISTORICO: DiaHistorico[] = typeof __ERP_HISTORICO__ !== "undefined" ? __ERP_HISTORICO__ : [];
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
          <Rosca fatias={CODIGO.map((t) => ({ rotulo: t.tecnica, valor: t.linhas, cor: t.cor }))} total="linhas" formatar={n} />
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
