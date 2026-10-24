// Aba Admissão e saída: o que falta no cadastro e na pasta de cada pessoa (na ativa: admissão; desligados: saída).
import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Documento } from "@/components/Anexos";
import { Tabs } from "@/components/ui";
import { useRows } from "@/lib/data";
import { pl } from "@/lib/format";
import { contarPorPasta } from "@/lib/pastaFuncionario";
import { desligada, faltaAdmissao, faltaSaida, type PessoaAdmissao } from "@/lib/admissaoFuncionario";

type Pessoa = PessoaAdmissao & { id: string; nome: string; apelido: string | null };

export function AdmissaoSaida({ lista }: { lista: Pessoa[] }) {
  const [quem, setQuem] = useState<"ativa" | "saida">("ativa");
  const [soPendentes, setSoPendentes] = useState(true);
  const { data: docs = [] } = useRows<Pick<Documento, "entidade_id" | "pasta">>("documentos", {
    select: "entidade_id, pasta", key: ["funcionario", "pasta"], filtro: (q) => q.eq("entidade", "funcionario"),
  });
  const contagem = useMemo(() => contarPorPasta(docs), [docs]);
  const linhas = useMemo(() => lista
    .filter((f) => (quem === "saida") === desligada(f))
    .map((f) => ({ f, falta: quem === "saida" ? faltaSaida(f, contagem.get(f.id)) : faltaAdmissao(f, contagem.get(f.id)) }))
    .sort((a, b) => b.falta.length - a.falta.length || a.f.nome.localeCompare(b.f.nome)), [lista, quem, contagem]);
  const pendentes = linhas.filter((l) => l.falta.length).length;
  const mostrar = soPendentes ? linhas.filter((l) => l.falta.length) : linhas;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={quem} onChange={setQuem} options={[{ value: "ativa", label: "Admissão (na ativa)" }, { value: "saida", label: "Saída (desligados)" }]} />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} /> Só quem tem pendência
        </label>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {pendentes
          ? `${pendentes} de ${linhas.length} ${pl(linhas.length, "pessoa", "pessoas")} com pendência. Complete na ficha (Equipe) ou guarde o documento na Pasta de documentos.`
          : `Tudo completo para ${pl(linhas.length, "a pessoa", "as pessoas")} ${quem === "ativa" ? "na ativa" : "desligadas"}.`}
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {mostrar.map(({ f, falta }) => (
          <li key={f.id} className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
            {falta.length ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />}
            <span className="min-w-[12rem] flex-1 font-semibold text-fg">{f.nome}</span>
            <span className="flex flex-[2] flex-wrap gap-1">
              {falta.length ? falta.map((x) => <span key={x} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">falta {x}</span>)
                : <span className="text-xs text-emerald-700">completo</span>}
            </span>
          </li>
        ))}
        {!mostrar.length && <li className="px-3 py-6 text-center text-sm text-slate-500">Ninguém aqui.</li>}
      </ul>
    </div>
  );
}
