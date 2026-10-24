// Página Crown Móveis (nome antigo da MF): quem trabalhou naquela época, com ou sem carteira, quanto recebeu
// (pagamentos antigos da tabela funcionario_pagamentos) e a pasta de documentos de cada um.
import { Fragment, useMemo, useState } from "react";
import { Banknote, ChevronDown, FileSignature, Users, UserX } from "lucide-react";
import { Indicador, nomeMes } from "@/components/ui";
import { PastaFuncionario } from "./PastaFuncionario";
import { useRows } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { resumoCrown, TIPOS_PAGAMENTO, type PagamentoAntigo } from "@/lib/crown";

type Pessoa = {
  id: string; nome: string; cargo: string | null; vinculo: string; situacao: string; ativo: boolean; epoca_crown?: boolean | null;
  data_admissao: string | null; data_desligamento: string | null; motivo_desligamento: string | null; observacoes: string | null;
};

export function CrownMoveis({ lista }: { lista: Pessoa[] }) {
  const { data: pagamentos = [] } = useRows<PagamentoAntigo & { id: string; origem: string | null }>("funcionario_pagamentos", { order: "competencia", ascending: true });
  const [filtro, setFiltro] = useState<"todos" | "com" | "sem">("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const r = useMemo(() => resumoCrown(lista, pagamentos), [lista, pagamentos]);
  const linhas = r.linhas
    .filter((l) => filtro === "todos" || (filtro === "com") === l.comCarteira)
    .sort((a, b) => b.total - a.total || a.f.nome.localeCompare(b.f.nome));

  const cartao = (id: typeof filtro, rotulo: string, valor: number, icon: typeof Users, cor: "azul" | "indigo" | "ambar", sub: string) => (
    <button type="button" aria-pressed={filtro === id} onClick={() => setFiltro(filtro === id ? "todos" : id)}
      className={`rounded-cartao text-left transition ${filtro === id ? "ring-2 ring-modulo" : "hover:brightness-110"}`}>
      <Indicador rotulo={rotulo} icon={icon} cor={cor} valor={String(valor)} sub={sub} />
    </button>
  );

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        Quem trabalhou na <b>Crown Móveis</b>, o nome da MF antes de virar MF Máquinas. Ficam aqui, fora da equipe atual,
        com o que cada um recebeu e os documentos.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cartao("todos", "Pessoas", r.pessoas, UserX, "azul", "da época da Crown")}
        {cartao("com", "Com carteira", r.comCarteira, FileSignature, "indigo", "registrados (CLT, aprendiz…)")}
        {cartao("sem", "Sem carteira", r.semCarteira, Users, "ambar", "por fora / autônomos")}
        <Indicador rotulo="Total pago" icon={Banknote} cor="laranja" valor={brl(r.total)} sub="planilhas, recibos e rescisões" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr><th className="px-3 py-2">Pessoa</th><th className="hidden px-2 py-2 sm:table-cell">Cargo</th><th className="px-2 py-2">Carteira</th>
              <th className="hidden px-2 py-2 sm:table-cell">Período</th><th className="px-2 py-2 text-right">Recebeu</th><th className="w-8" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <Fragment key={l.f.id}>
                <tr className={`cursor-pointer hover:bg-slate-50 ${aberto === l.f.id ? "bg-brand-light" : ""}`} onClick={() => setAberto(aberto === l.f.id ? null : l.f.id)}>
                  <td className="px-3 py-2 font-semibold text-fg">{l.f.nome}</td>
                  <td className="hidden px-2 py-2 text-slate-600 sm:table-cell">{l.f.cargo ?? "—"}</td>
                  <td className="px-2 py-2">{l.comCarteira ? "com carteira" : <span className="text-amber-700">sem carteira</span>}</td>
                  <td className="hidden px-2 py-2 text-slate-600 sm:table-cell">{l.f.data_admissao ? dataBR(l.f.data_admissao) : "?"} a {l.f.data_desligamento ? dataBR(l.f.data_desligamento) : "?"}</td>
                  <td className="px-2 py-2 text-right font-semibold">{l.total ? brl(l.total) : <span className="text-slate-400">—</span>}</td>
                  <td className="px-2 py-2"><ChevronDown size={16} className={`text-slate-500 transition-transform ${aberto === l.f.id ? "rotate-180" : ""}`} aria-hidden /></td>
                </tr>
                {aberto === l.f.id && (
                  <tr><td colSpan={6} className="bg-slate-50/50 px-3 py-3">
                    <p className="mb-2 text-xs text-slate-600">{[l.f.cargo, `${l.f.data_admissao ? dataBR(l.f.data_admissao) : "?"} a ${l.f.data_desligamento ? dataBR(l.f.data_desligamento) : "?"}`, l.f.motivo_desligamento && `saída: ${l.f.motivo_desligamento}`].filter(Boolean).join(" · ")}</p>
                    {l.f.observacoes && <p className="mb-2 text-xs text-slate-500">{l.f.observacoes}</p>}
                    {l.pagamentos.length ? (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-semibold text-slate-600">
                          {l.pagamentos.length} {pl(l.pagamentos.length, "pagamento", "pagamentos")} · {Object.entries(l.porTipo).map(([t, v]) => `${TIPOS_PAGAMENTO[t as keyof typeof TIPOS_PAGAMENTO]} ${brl(v!)}`).join(" · ")}
                        </p>
                        <ul className="grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                          {l.pagamentos.map((p, i) => (
                            <li key={`${p.competencia}-${p.tipo}-${i}`} className="flex justify-between gap-2 rounded bg-surface px-2 py-1">
                              <span>{nomeMes(p.competencia.slice(0, 7))} · {TIPOS_PAGAMENTO[p.tipo]}</span><b>{brl(p.valor)}</b>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : <p className="mb-3 text-xs text-slate-500">Nenhum pagamento achado nas planilhas e recibos.</p>}
                    <PastaFuncionario id={l.f.id} />
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!linhas.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Ninguém marcado como da época da Crown.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
