// Aba Pasta de documentos da área Funcionários: quantos documentos cada pessoa tem em cada divisão e a pasta dela.
import { useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { PastaFuncionario } from "./PastaFuncionario";
import type { Documento } from "@/components/Anexos";
import { useRows } from "@/lib/data";
import { pl } from "@/lib/format";
import { PASTAS, contarPorPasta } from "@/lib/pastaFuncionario";

type Pessoa = { id: string; nome: string; apelido: string | null; situacao: string; ativo: boolean };
/** Aba Pasta de documentos: quem tem o quê em cada divisão; clicar na pessoa abre a pasta dela. */
export function PastaDaEquipe({ lista }: { lista: Pessoa[] }) {
  const [comDesligados, setComDesligados] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const { data: docs = [] } = useRows<Pick<Documento, "entidade_id" | "pasta">>("documentos", {
    select: "entidade_id, pasta", key: ["funcionario", "pasta"], filtro: (q) => q.eq("entidade", "funcionario"),
  });
  const contagem = useMemo(() => contarPorPasta(docs), [docs]);
  const pessoas = comDesligados ? lista : lista.filter((f) => f.ativo && f.situacao !== "desligado");
  const atual = pessoas.find((f) => f.id === aberto);
  const semContrato = pessoas.filter((f) => f.situacao !== "desligado" && !contagem.get(f.id)?.contrato).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{semContrato ? `${semContrato} ${pl(semContrato, "pessoa", "pessoas")} da equipe sem contrato guardado.` : "Toda a equipe tem o contrato guardado."}</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={comDesligados} onChange={(e) => setComDesligados(e.target.checked)} /> Mostrar desligados</label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr><th className="px-3 py-2">Pessoa</th>{PASTAS.map((p) => <th key={p.value} className="px-2 py-2 text-center">{p.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pessoas.map((f) => {
              const c = contagem.get(f.id) ?? {};
              return (
                <tr key={f.id} className={`cursor-pointer hover:bg-slate-50 ${aberto === f.id ? "bg-brand-light" : ""}`} onClick={() => setAberto(aberto === f.id ? null : f.id)}>
                  <td className="px-3 py-2"><span className="font-semibold text-fg">{f.apelido?.trim() || f.nome}</span>{f.situacao === "desligado" && <span className="ml-1 text-xs text-slate-500">(desligado)</span>}</td>
                  {PASTAS.map((p) => <td key={p.value} className="px-2 py-2 text-center">{c[p.value] ? <span className="font-semibold text-emerald-700">{c[p.value]}</span> : <span className="text-slate-300">—</span>}</td>)}
                </tr>
              );
            })}
            {!pessoas.length && <tr><td colSpan={PASTAS.length + 1} className="px-3 py-6 text-center text-slate-500">Ninguém na equipe ainda. Cadastre em Equipe.</td></tr>}
          </tbody>
        </table>
      </div>
      {atual ? (
        <div className="mt-4">
          <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-fg"><FolderOpen size={18} /> Pasta de {atual.nome}</h2>
          <PastaFuncionario id={atual.id} />
        </div>
      ) : pessoas.length > 0 && <p className="mt-3 text-sm text-slate-500">Clique numa pessoa para abrir a pasta dela e guardar os documentos.</p>}
    </div>
  );
}
