// Entradas grandes sem dono: o dinheiro acima de R$ 5 mil que entrou nas contas da MF e ainda não foi ligado a uma
// conta a receber. A dona escreve de quem é e o que foi; a anotação fica na própria linha do extrato (observacao).
import { useState } from "react";
import { CheckCircle2, CircleHelp } from "lucide-react";
import { PageHeader, Table } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { noPeriodoOuPendente, semanaAtual, SEM_PERIODO, type Periodo } from "@/lib/filtroLista";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";

const MINIMO = 5000;

type Linha = {
  id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null;
  status: string | null; conta_receber_id: string | null; observacao: string | null;
};

const identificada = (l: Linha) => !!l.conta_receber_id || !!l.observacao?.trim();

export default function EntradasGrandes() {
  const { data: linhas = [], isLoading } = useRows<Linha>("extrato_lancamentos", {
    select: "id, conta_bancaria_id, data, valor, descricao, status, conta_receber_id, observacao",
    order: "valor", ascending: false, key: ["entradas-grandes"],
    filtro: (q) => q.gt("valor", MINIMO).not("status", "in", "(ignorado,transferencia)"),
  });
  const { data: contas = [] } = useRows<{ id: string; nome: string }>("contas_bancarias", { select: "id, nome", order: "nome", ascending: true, key: ["nomes"] });
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "—";
  const [visao, setVisao] = useState<"falta" | "feitas" | "todas">("falta");
  const [conta, setConta] = useState("");
  const [busca, setBusca] = useState("");
  // abre na semana; a entrada ainda sem dono continua aparecendo mesmo se for de antes
  const [periodo, setPeriodo] = useState<Periodo>(() => semanaAtual(hoje()));

  const daConta = linhas.filter((l) => (!conta || l.conta_bancaria_id === conta) && noPeriodoOuPendente(l.data, periodo, !identificada(l)));
  const falta = daConta.filter((l) => !identificada(l));
  const feitas = daConta.filter(identificada);
  const termo = busca.trim().toLowerCase();
  const lista = (visao === "falta" ? falta : visao === "feitas" ? feitas : daConta)
    .filter((l) => !termo || `${l.descricao ?? ""} ${l.observacao ?? ""}`.toLowerCase().includes(termo));
  const soma = (ls: Linha[]) => ls.reduce((s, l) => s + Number(l.valor), 0);

  return (
    <div>
      <PageHeader title="Entradas acima de R$ 5 mil" subtitle="Todas as contas da MF: escreva de quem é e o que foi cada entrada que ainda não tem dono." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setVisao("falta")} className={`cartao flex items-center gap-3 p-4 text-left ${visao === "falta" ? "border-amber-400 ring-2 ring-amber-200" : ""}`}>
          <CircleHelp className="shrink-0 text-amber-600" size={28} />
          <span><span className="block text-2xl font-bold text-fg">{falta.length}</span>
            <span className="text-sm text-slate-600">falta identificar · {brl(soma(falta))}</span></span>
        </button>
        <button type="button" onClick={() => setVisao("feitas")} className={`cartao flex items-center gap-3 p-4 text-left ${visao === "feitas" ? "border-emerald-400 ring-2 ring-emerald-200" : ""}`}>
          <CheckCircle2 className="shrink-0 text-emerald-600" size={28} />
          <span><span className="block text-2xl font-bold text-fg">{feitas.length}</span>
            <span className="text-sm text-slate-600">já identificadas · {brl(soma(feitas))}</span></span>
        </button>
      </div>
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar nome ou anotação" periodo={periodo} onPeriodo={setPeriodo} rotuloData="Entrada"
        filtros={<label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Conta</span>
          <select className="input w-auto" value={conta} onChange={(e) => setConta(e.target.value)}>
            <option value="">Todas as contas</option>
            {contas.filter((c) => linhas.some((l) => l.conta_bancaria_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></label>}
        nFiltros={conta ? 1 : 0} onLimpar={() => { setBusca(""); setConta(""); setPeriodo(SEM_PERIODO); setVisao("falta"); }}
        direita={<span className="text-sm text-slate-500">{lista.length} entradas · {brl(soma(lista))}</span>} />
      <ChipsSituacao valor={visao} onChange={setVisao} opcoes={[
        { value: "falta", label: "Falta identificar", n: falta.length }, { value: "feitas", label: "Já identificadas", n: feitas.length }, { value: "todas", label: "Todas", n: daConta.length },
      ]} />
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">Data / conta</th><th className="th">Quem mandou (banco)</th><th className="th text-right">Valor</th><th className="th">De quem é e o que foi</th></>}>
        {lista.map((l) => (
          <tr key={l.id}>
            <td className="td whitespace-nowrap">{dataBR(l.data)}<div className="text-xs text-slate-500">{nomeConta(l.conta_bancaria_id)}</div></td>
            <td className="td">{l.descricao}{l.conta_receber_id && <div className="text-xs text-emerald-700">ligada a uma conta a receber</div>}</td>
            <td className="td whitespace-nowrap text-right font-semibold">{brl(Number(l.valor))}</td>
            <td className="td min-w-64"><Anotacao linha={l} /></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Anotacao({ linha }: { linha: Linha }) {
  const [texto, setTexto] = useState(linha.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const invalidate = useInvalidate();
  const mudou = texto.trim() !== (linha.observacao ?? "").trim();
  async function salvar() {
    if (!mudou) return;
    setSalvando(true);
    const { error } = await supabase.rpc("anotar_lancamento", { p_id: linha.id, p_texto: texto });
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Anotação salva");
    invalidate("extrato_lancamentos");
  }
  return (
    <div className="flex items-center gap-2">
      <input aria-label="Anotação da entrada" className="input flex-1" placeholder="Ex.: venda de máquina para..., empréstimo, aporte" value={texto}
        onChange={(e) => setTexto(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {salvando && <span className="text-xs text-slate-500">salvando…</span>}
    </div>
  );
}
