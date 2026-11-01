// Pedidos ao ERP (Sobre o ERP Line → Pedidos): o checklist de tudo o que foi pedido em cada dia, com a situação de
// cada item (feito, fazendo, na fila, precisa de você), quem conferiu e quantas vezes o item mudou. Quantas vezes cada
// tela foi alterada ficou na aba própria (Sobre → Telas alteradas).
import { useMemo, useState } from "react";
import { CheckCircle2, Clock, ListChecks, UserCheck, Hourglass } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { BarraFiltros, type FiltroLigado, type SugestaoFiltro } from "@/components/filtros/BarraFiltros";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";

type Situacao = "feito" | "fazendo" | "fila" | "voce";
type ItemChecklist = {
  id: string; pedido_em: string; grupo: string; item: string; detalhe: string | null; tela: string | null;
  situacao: Situacao; ordem: number; conferido: boolean; conferido_em: string | null; alteracoes: number; versao: string | null;
};

const SITUACOES: Record<Situacao, { rotulo: string; classe: string; cor: string }> = {
  feito: { rotulo: "Feito", classe: "bg-emerald-100 text-emerald-800", cor: "bg-emerald-500" },
  fazendo: { rotulo: "Fazendo", classe: "bg-amber-100 text-amber-800", cor: "bg-amber-500" },
  fila: { rotulo: "Na fila", classe: "bg-slate-200 text-slate-700", cor: "bg-slate-400" },
  voce: { rotulo: "Precisa de você", classe: "bg-rose-100 text-rose-800", cor: "bg-red-500" },
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PedidosChecklist() {
  const invalidar = useInvalidate();
  const { data: itens = [], isLoading } = useRows<ItemChecklist>("pedidos_checklist", { order: "ordem", ascending: true });
  const dias = useMemo(() => [...new Set(itens.map((i) => i.pedido_em))].sort().reverse(), [itens]);
  const [dia, setDia] = useState("");
  const [situacao, setSituacao] = useState<Situacao | "">("");
  const [busca, setBusca] = useState("");
  const diaAtual = dia || dias[0] || "";

  const doDia = itens.filter((i) => i.pedido_em === diaAtual);
  const conta = (s: Situacao) => doDia.filter((i) => i.situacao === s).length;
  const termo = semAcento(busca.trim());
  const visiveis = doDia.filter((i) => (!situacao || i.situacao === situacao) && (!termo || semAcento(`${i.grupo} ${i.item} ${i.detalhe ?? ""}`).includes(termo)));
  const grupos = useMemo(() => {
    const m = new Map<string, ItemChecklist[]>();
    for (const i of visiveis) m.set(i.grupo, [...(m.get(i.grupo) ?? []), i]);
    return [...m.entries()];
  }, [visiveis]);

  async function conferir(i: ItemChecklist, v: boolean) {
    try {
      const { error } = await supabase.rpc("conferir_pedido_checklist", { p_id: i.id, p_conferido: v });
      if (error) throw error;
      invalidar("pedidos_checklist");
    } catch (e) { notifyError(e); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Pedidos do dia" valor={doDia.length} icon={ListChecks} sub={diaAtual ? dataBR(diaAtual) : "nenhum ainda"} />
        <Stat label="Feitos" valor={conta("feito")} icon={CheckCircle2} tom="bom" onClick={() => setSituacao(situacao === "feito" ? "" : "feito")} />
        <Stat label="Fazendo" valor={conta("fazendo")} icon={Clock} tom="atencao" onClick={() => setSituacao(situacao === "fazendo" ? "" : "fazendo")} />
        <Stat label="Na fila" valor={conta("fila")} icon={Hourglass} onClick={() => setSituacao(situacao === "fila" ? "" : "fila")} />
        <Stat label="Precisa de você" valor={conta("voce")} icon={UserCheck} tom="critico" onClick={() => setSituacao(situacao === "voce" ? "" : "voce")} />
      </div>

      {/* barra nova (01/11): a situação se escolhe nos cartões de cima e aparece em pílula; o dia vai para Filtros */}
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar no checklist"
        nFiltros={(situacao ? 1 : 0) + (dia && dia !== dias[0] ? 1 : 0)} onLimpar={() => { setBusca(""); setSituacao(""); setDia(""); }}
        ligados={[
          // a situação se escolhe nos cartões de cima (sem repetir na "Visão"): aqui fica à vista em pílula
          ...(situacao ? [{ rotulo: "Situação", valor: SITUACOES[situacao].rotulo, tirar: () => setSituacao("") }] : []),
          ...(dia && dia !== dias[0] ? [{ rotulo: "Dia", valor: dataBR(dia), tirar: () => setDia("") }] : []),
        ] satisfies FiltroLigado[]}
        sugestoes={[
          ...(Object.keys(SITUACOES) as Situacao[]).map((s) => ({ tipo: "Situação", rotulo: SITUACOES[s].rotulo, aplicar: () => setSituacao(s) })),
          ...dias.map((d) => ({ tipo: "Dia", rotulo: dataBR(d), aplicar: () => setDia(d) })),
        ] satisfies SugestaoFiltro[]}
        filtros={dias.length > 1 ? (
          <label className="text-xs font-semibold text-slate-600">Dia dos pedidos
            <select className="input w-auto" value={diaAtual} onChange={(e) => setDia(e.target.value)}>
              {dias.map((d) => <option key={d} value={d}>{dataBR(d)}</option>)}
            </select>
          </label>
        ) : undefined}
        resultado={<><b className="num text-fg">{visiveis.length}</b> {pl(visiveis.length, "item", "itens")} · {doDia.filter((i) => i.conferido).length} de {doDia.length} conferidos</>} />

      {isLoading && <p className="py-6 text-center text-slate-500">Carregando…</p>}
      {!isLoading && !doDia.length && <p className="py-6 text-center text-slate-500">Nenhum pedido registrado ainda.</p>}
      {grupos.map(([g, lista]) => (
        <Card key={g} className="p-4">
          <h3 className="mb-1 font-semibold text-fg">{g}</h3>
          <ul className="divide-y divide-slate-100">
            {lista.map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={i.conferido} onChange={(e) => conferir(i, e.target.checked)}
                  aria-label={`Conferido: ${i.item}`} />
                <div className={`min-w-0 flex-1 ${i.conferido ? "opacity-60" : ""}`}>
                  <span className={`text-sm font-medium text-fg ${i.conferido ? "line-through" : ""}`}>{i.item}</span>
                  {i.detalhe && <span className="block text-xs text-slate-500">{i.detalhe}</span>}
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-slate-500">
                    {i.alteracoes > 0 && <span>alterado {i.alteracoes} {pl(i.alteracoes, "vez", "vezes")}</span>}
                    {i.versao && <span>versão {i.versao}</span>}
                    {i.conferido_em && <span>conferido em {dataBR(i.conferido_em)}</span>}
                  </span>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${SITUACOES[i.situacao].classe}`}>{SITUACOES[i.situacao].rotulo}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

    </div>
  );
}
