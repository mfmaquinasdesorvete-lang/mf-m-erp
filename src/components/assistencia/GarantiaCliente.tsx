// Máquinas do cliente e a garantia de cada uma, na OS: quem atende o telefone vê na hora se a máquina está na
// garantia ou se o diagnóstico por vídeo chamada é cobrado (Configurações → Orçamentos e garantia).
// Vem do banco (maquinas_do_cliente): máquinas registradas, NF-e de venda emitidas para o cliente e a data do cadastro.
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff, Snowflake, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { mesAnoCompra } from "../../../supabase/functions/_shared/compra-maquina";
import { diasAte } from "@/lib/garantia";

export type MaquinaCliente = {
  fonte: "equipamento" | "nota" | "cadastro"; descricao: string; quantidade: number; data: string | null; garantia_ate: string | null;
  nota: string | null; numero_serie: string | null; equipamento_id: string | null; origem: string | null;
};

export function useMaquinasDoCliente(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: ["maquinas_do_cliente", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("maquinas_do_cliente", { p_cliente: clienteId });
      if (error) throw error;
      return (data ?? []) as MaquinaCliente[];
    },
  });
}

/** Na garantia hoje? (máquina vendida por outra empresa não tem garantia da MF) */
export const naGarantia = (m: Pick<MaquinaCliente, "garantia_ate" | "origem">, hoje: string) => !m.origem && !!m.garantia_ate && m.garantia_ate >= hoje;

function quando(m: MaquinaCliente) {
  if (m.fonte === "cadastro") return `comprou em ${mesAnoCompra(m.data)} (data do cadastro)`;
  const d = m.data ? dataBR(m.data) : "data não informada";
  if (m.fonte === "nota") return `${m.nota} de ${d}`;
  return m.origem ? `vendida pela ${m.origem} em ${d}` : `vendida em ${d}`;
}

export function GarantiaCliente({ clienteId, taxa, hoje, editavel, onUsar, onCobrarTaxa }: {
  clienteId: string; taxa: number; hoje: string; editavel: boolean;
  onUsar?: (m: MaquinaCliente) => void; onCobrarTaxa?: () => void;
}) {
  const { data: maquinas = [], isLoading, error } = useMaquinasDoCliente(clienteId);
  if (isLoading) return <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-500">Procurando as máquinas deste cliente…</div>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Não deu para ver as máquinas do cliente: {(error as Error).message}</div>;
  const dentro = maquinas.filter((m) => naGarantia(m, hoje)).length;
  const fora = maquinas.length - dentro;
  // todas na garantia (verde), algumas sim e outras não (amarelo: perguntar qual máquina), nenhuma (vermelho)
  const tom = !maquinas.length || !dentro ? "fora" : fora ? "misto" : "dentro";
  const valorTaxa = brl(taxa);
  const cor = {
    dentro: { caixa: "border-emerald-300 bg-emerald-50/60", icone: "bg-emerald-100 text-emerald-700", texto: "text-emerald-800" },
    misto: { caixa: "border-amber-300 bg-amber-50/70", icone: "bg-amber-100 text-amber-700", texto: "text-amber-900" },
    fora: { caixa: "border-red-300 bg-red-50/70", icone: "bg-red-100 text-red-700", texto: "text-red-800" },
  }[tom];

  return (
    <div className={`rounded-xl border p-3 ${cor.caixa}`}>
      <div className="flex flex-wrap items-start gap-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${cor.icone}`}>
          {tom === "dentro" ? <ShieldCheck size={19} /> : <ShieldOff size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`font-bold ${cor.texto}`}>
            {tom === "dentro" ? "Na garantia: diagnóstico sem custo (defeito de fabricação)"
              : tom === "misto" ? `Confira qual máquina: ${dentro} na garantia e ${fora} fora`
              : maquinas.length ? `Fora da garantia: diagnóstico por vídeo chamada ${valorTaxa}` : `Nenhuma máquina encontrada: sem comprovante, o diagnóstico por vídeo chamada é ${valorTaxa}`}
          </div>
          {tom !== "dentro" && (
            <div className={`text-sm ${cor.texto}`}>
              {tom === "misto" ? `Na máquina fora da garantia o diagnóstico por vídeo chamada é ${valorTaxa}.`
                : maquinas.length ? "Avise o cliente e cobre antes de atender." : "Procurei no cadastro, nas notas emitidas e na data do Tiny. Peça o número da nota ou a data da compra."}
            </div>
          )}
        </div>
        {tom !== "dentro" && editavel && onCobrarTaxa && (
          <button type="button" onClick={onCobrarTaxa}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-xs font-semibold hover:brightness-95 ${tom === "misto" ? "border-amber-300 text-amber-900" : "border-red-300 text-red-800"}`}>
            <Video size={14} /> Lançar {valorTaxa} de diagnóstico
          </button>
        )}
      </div>
      {maquinas.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {maquinas.map((m, i) => {
            const ok = naGarantia(m, hoje);
            const dias = m.garantia_ate ? diasAte(m.garantia_ate) : null;
            return (
              <li key={`${m.fonte}${m.equipamento_id ?? m.nota ?? ""}${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface/80 px-2.5 py-2 text-sm">
                <Snowflake size={14} className="shrink-0 text-sky-600" aria-hidden />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <b className="text-fg">{m.descricao}</b>{m.quantidade > 1 ? ` (${m.quantidade} un.)` : ""}{m.numero_serie ? ` · série ${m.numero_serie}` : ""}
                  <span className="block text-xs text-slate-600">{quando(m)}</span>
                </span>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {m.origem ? `outra empresa (${m.origem})`
                    : !m.garantia_ate ? "sem garantia registrada"
                    : ok ? `garantia até ${dataBR(m.garantia_ate)}${dias != null && dias <= 30 ? ` · faltam ${dias} ${dias === 1 ? "dia" : "dias"}` : ""}`
                    : `garantia acabou em ${dataBR(m.garantia_ate)}`}
                </span>
                {editavel && onUsar && (
                  <button type="button" onClick={() => onUsar(m)} className="whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold text-brand hover:bg-slate-100">Usar nesta OS</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
