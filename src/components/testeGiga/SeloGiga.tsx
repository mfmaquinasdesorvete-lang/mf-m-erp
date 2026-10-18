// Rastreabilidade do teste do giga (REG-006): o teste do NS na ficha da máquina, na Ficha 360 e na OP.
// Lê só o resumo (teste_giga_situacao). Sem a mudança do banco ou sem permissão, não mostra nada.
import { useNavigate } from "react-router-dom";
import { CheckCircle2, CircleDashed, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { normalizarNs, nsDaOp, seloGiga, type SituacaoNs } from "@/lib/testeGiga";
import { useSituacaoGiga } from "@/lib/testeGigaDados";

const COR = {
  aprovada: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reprovada: "border-red-200 bg-red-50 text-red-700",
  sem: "border-slate-200 bg-slate-50 text-slate-600",
} as const;
const ICONE = { aprovada: CheckCircle2, reprovada: XCircle, sem: CircleDashed } as const;

/** Etiqueta do teste do giga de um NS (aprovada, reprovada aguardando reteste ou sem teste). */
export function SeloTesteGiga({ s, mostrarSem = true }: { s: SituacaoNs | null | undefined; mostrarSem?: boolean }) {
  const selo = seloGiga(s);
  if (selo.tom === "sem" && !mostrarSem) return null;
  const Icone = ICONE[selo.tom];
  return (
    <span title={selo.detalhe} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${COR[selo.tom]}`}>
      <Icone size={12} aria-hidden className="shrink-0" /><span className="truncate">{selo.texto}</span>
      <span className="sr-only">. {selo.detalhe}</span>
    </span>
  );
}

/** Teste do giga de uma máquina (pelo NS), com o rótulo e o detalhe (nº do teste, operador). Some se não der para ler. */
export function TesteGigaDoNs({ ns, rotulo, className = "" }: { ns: string | null | undefined; rotulo: string; className?: string }) {
  const { data } = useSituacaoGiga([ns]);
  if (!ns?.trim() || !data) return null;
  const s = data.get(normalizarNs(ns));
  const selo = seloGiga(s);
  return (
    <p className={`flex flex-wrap items-center gap-2 text-sm text-slate-600 ${className}`}>
      {rotulo} <SeloTesteGiga s={s} />{selo.tom !== "sem" && <span className="text-xs text-slate-500">{selo.detalhe}</span>}
    </p>
  );
}

/** Na OP: cada NS com o teste do giga e o botão para lançar o teste (técnico ou administrador). */
export function TesteGigaDaOp({ numerosSerie, produtoId, opId }: { numerosSerie: string | null | undefined; produtoId: string | null | undefined; opId: string }) {
  const navigate = useNavigate();
  const { pode } = usePerfil();
  const ns = nsDaOp(numerosSerie);
  const { data, isLoading } = useSituacaoGiga(ns);
  if (data === null) return null; // banco sem a mudança ou sem permissão
  const lancar = (n?: string) => navigate("/teste-giga?aba=lancar", { state: { giga: { produto_id: produtoId, ordem_producao_id: opId, numero_serie: n ?? "" } } });
  const aprovadas = ns.filter((n) => data?.get(n)?.aprovado_numero != null).length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <PlugZap size={16} className="text-modulo-texto" aria-hidden /> Teste do giga (REG-006)
          {ns.length > 0 && <span className="font-normal text-slate-500">· {aprovadas} de {ns.length} {ns.length === 1 ? "aprovada" : "aprovadas"}</span>}
        </h3>
        {pode("lancar_teste_giga") && <Button type="button" variant="secondary" onClick={() => lancar()}><PlugZap size={15} /> Lançar teste</Button>}
      </div>
      {!ns.length ? (
        <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">Preencha o nº de série das máquinas (acima) para acompanhar o teste do giga de cada uma.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {ns.map((n) => {
            const s = data?.get(n);
            const falta = s?.aprovado_numero == null;
            return (
              <li key={n} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="num min-w-[5rem] font-semibold text-fg">{n}</span>
                {isLoading ? <span className="text-xs text-slate-500">carregando…</span> : <SeloTesteGiga s={s} />}
                {s?.aprovado_operador && <span className="text-xs text-slate-500">{s.aprovado_operador}</span>}
                <span className="flex-1" />
                {falta && pode("lancar_teste_giga") && !isLoading && (
                  <button type="button" onClick={() => lancar(n)} className="text-xs font-semibold text-brand hover:underline">
                    {s?.testes ? "Lançar reteste" : "Lançar teste"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
