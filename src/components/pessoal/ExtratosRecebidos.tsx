// Aba Extratos do painel pessoal: conta por conta, um quadradinho por mês dizendo se o extrato do banco já chegou
// (verde), se só tem lançamento digitado (âmbar) ou se está faltando (vermelho). Toque no mês para ver os dias.
import { useState } from "react";
import { CheckCircle2, CreditCard, FileUp, Landmark, Plug } from "lucide-react";
import { Button, Card, nomeMes } from "@/components/ui";
import { dataBR, hoje, pl } from "@/lib/format";
import { CORES_CONTA, NOME_TIPO_CONTA, type ContaPessoal, type LancPessoal } from "@/lib/pessoal";
import { extratosRecebidos, type MesExtrato, type Origem } from "@/lib/extratosRecebidos";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const NOME_ORIGEM: Record<Origem, string> = { pdf: "PDF", arquivo: "arquivo do banco", pluggy: "Meu Pluggy", digitado: "digitado" };
const COR: Record<MesExtrato["situacao"], string> = {
  extrato: "bg-emerald-600 text-white", digitado: "bg-amber-400 text-amber-950", falta: "bg-red-100 text-red-700 ring-1 ring-inset ring-red-300",
};

function textoMes(m: MesExtrato) {
  if (m.situacao === "falta") return `${nomeMes(m.mes)}: sem extrato`;
  const origem = m.origens.map((o) => NOME_ORIGEM[o]).join(" + ");
  const dias = m.de && m.ate ? ` · de ${dataBR(m.de)} a ${dataBR(m.ate)}` : "";
  return `${nomeMes(m.mes)}: ${m.situacao === "digitado" ? "só lançamentos digitados" : `extrato (${origem})`}${dias} · ${m.qtd} ${pl(m.qtd, "lançamento", "lançamentos")}${m.parcial ? " · faltam os últimos dias" : ""}`;
}

export function ExtratosRecebidos({ contas, lancs, onImportar, onPluggy }: { contas: ContaPessoal[]; lancs: LancPessoal[]; onImportar: () => void; onPluggy: () => void }) {
  const lista = extratosRecebidos(contas.filter((c) => c.ativa), lancs, hoje());
  const [sel, setSel] = useState<{ conta: string; mes: string } | null>(null);
  const mesHoje = hoje().slice(0, 7);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="mr-auto min-w-0 flex-1 basis-64">
          <h2 className="text-lg font-bold text-fg">De quais meses já veio o extrato</h2>
          <p className="text-sm text-slate-600">Cada quadradinho é um mês. Toque para ver de que dia a que dia o extrato chegou.</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-600" /> extrato do banco</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-600 ring-2 ring-amber-400" /> faltam os últimos dias</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> só digitado</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100 ring-1 ring-red-300" /> faltando</span>
          </div>
        </div>
        <Button variant="secondary" onClick={onImportar}><FileUp size={16} /> Importar extrato</Button>
        <Button variant="secondary" onClick={onPluggy}><Plug size={16} /> Meu Pluggy</Button>
      </Card>

      {lista.map(({ conta: c, meses, faltam, parciais, ultimo }) => {
        const anos = [...new Set(meses.map((m) => m.mes.slice(0, 4)))].sort().reverse();
        const aberto = sel?.conta === c.id ? meses.find((m) => m.mes === sel.mes) : undefined;
        const Icone = c.tipo === "cartao" ? CreditCard : Landmark;
        return (
          <Card key={c.id} className="p-4">
            <div className="mb-3 flex flex-wrap items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: CORES_CONTA[c.cor] ?? CORES_CONTA.sky }}><Icone size={18} aria-hidden /></span>
              <div className="mr-auto min-w-0 flex-1 basis-48">
                <div className="font-bold text-fg">{c.nome}</div>
                <div className="text-xs text-slate-500">{[NOME_TIPO_CONTA[c.tipo], c.banco].filter(Boolean).join(" · ")}{ultimo ? ` · extrato até ${dataBR(ultimo)}` : ""}</div>
              </div>
              {!meses.length ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">nenhum lançamento ainda</span>
                : !ultimo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">nenhum extrato importado ainda</span>
                : !faltam.length ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><CheckCircle2 size={13} aria-hidden /> todos os meses com extrato</span>
                : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{faltam.length} {pl(faltam.length, "mês sem extrato", "meses sem extrato")}</span>}
            </div>
            {meses.length > 0 && (
              <div className="space-y-1.5">
                {anos.map((ano) => (
                  <div key={ano} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-xs font-bold text-slate-500">{ano}</span>
                    <div className="grid flex-1 grid-cols-6 gap-1 sm:grid-cols-12">
                      {MESES.map((nome, i) => {
                        const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
                        const m = meses.find((x) => x.mes === ym);
                        if (!m) return <span key={ym} className="h-9 rounded-md bg-slate-50" aria-hidden />;
                        const atual = ym === mesHoje && m.situacao === "falta";
                        return (
                          <button key={ym} type="button" title={atual ? `${nomeMes(ym)}: mês em andamento` : textoMes(m)} aria-label={atual ? `${nomeMes(ym)}: mês em andamento` : textoMes(m)}
                            aria-pressed={sel?.conta === c.id && sel.mes === ym} onClick={() => setSel(sel?.conta === c.id && sel.mes === ym ? null : { conta: c.id, mes: ym })}
                            className={`h-9 rounded-md text-2xs font-bold ${atual ? "bg-slate-100 text-slate-500" : COR[m.situacao]} ${m.parcial ? "ring-2 ring-inset ring-amber-400" : ""} ${sel?.conta === c.id && sel.mes === ym ? "outline outline-2 outline-offset-1 outline-brand" : ""}`}>
                            {nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {aberto && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{aberto.mes === mesHoje && aberto.situacao === "falta" ? `${nomeMes(aberto.mes)}: mês em andamento, ainda sem lançamento.` : textoMes(aberto)}</p>}
            {faltam.length > 0 && <p className="mt-3 text-xs text-red-700"><b>Falta o extrato de:</b> {faltam.map(mesCurto).join(", ")}</p>}
            {parciais.length > 0 && <p className="mt-1 text-xs text-amber-800"><b>Extrato pela metade:</b> {parciais.map(mesCurto).join(", ")} (o extrato para antes do fim do mês: importe o resto)</p>}
          </Card>
        );
      })}
    </div>
  );
}
