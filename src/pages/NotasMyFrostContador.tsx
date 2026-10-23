// Notas fiscais da My Frost (empresa anterior) para o contador: resumo por ano e por grupo (vendas, remessas,
// devoluções, estornos e canceladas), a lista das notas e a planilha para mandar a ele. Só a conta master abre (Retaguarda).
// Vem do backup de XML da My Frost (notas_legado): fica à parte das notas da MF.
import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button, Card, PageHeader, Table } from "@/components/ui";
import { ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { useRows } from "@/lib/data";
import { brl, dataBR } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { GRUPOS, grupoDaNota, linhasParaPlanilha, resumoParaPlanilha, resumoPorAno, type Grupo, type NotaMyFrostRelatorio } from "@/lib/relatorioNotasMyFrost";

type Linha = Omit<NotaMyFrostRelatorio, "cliente_nome"> & { cliente: { nome: string } | null };

const COR: Record<Grupo, string> = {
  Vendas: "text-emerald-700", Remessas: "text-sky-700", Devoluções: "text-amber-700", Estornos: "text-violet-700", Canceladas: "text-red-700",
};

export default function NotasMyFrostContador() {
  const { data: linhas = [], isLoading } = useRows<Linha>("notas_legado", {
    select: "id, numero, data, valor, natureza, situacao, tipo, chave, dest_doc, dest_nome, cartas_correcao, cliente:clientes(nome)",
    order: "data", ascending: true, key: ["notas-my-frost-contador"], filtro: (q) => q.eq("origem", "My Frost"),
  });
  const notas = useMemo<NotaMyFrostRelatorio[]>(() => linhas.map(({ cliente, ...n }) => ({ ...n, cliente_nome: cliente?.nome ?? null })), [linhas]);
  const resumo = useMemo(() => resumoPorAno(notas), [notas]);
  const [ano, setAno] = useState("todos");
  const [grupo, setGrupo] = useState<Grupo | "todos">("todos");
  const [baixando, setBaixando] = useState(false);

  const doAno = notas.filter((n) => ano === "todos" || (n.data ?? "").startsWith(ano));
  const lista = doAno.filter((n) => grupo === "todos" || grupoDaNota(n) === grupo);

  async function baixar() {
    setBaixando(true);
    try {
      await baixarPlanilha("notas-my-frost-contador", [
        { nome: "Resumo por ano", linhas: resumoParaPlanilha(resumo) },
        { nome: "Notas", linhas: linhasParaPlanilha(notas) },
      ]);
    } finally { setBaixando(false); }
  }

  return (
    <div>
      <PageHeader title="Notas da My Frost para o contador"
        subtitle="Empresa anterior (CNPJ 32.584.697/0001-81), pelo backup de XML: por ano e por tipo. Fica à parte das notas da MF." />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3 text-sm text-slate-600 sm:p-4">
        <FileText size={20} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1">
          {isLoading ? "Carregando…" : <>{notas.length} notas · válidas {resumo.total.validas.qtd} ({brl(resumo.total.validas.valor)}) · canceladas {resumo.total.grupos.Canceladas.qtd}.</>}
          {" "}Remessas são conserto, retorno, garantia, industrialização, exposição e outras saídas. A cancelada aparece com o valor, mas não soma nas válidas.
        </span>
        <Button disabled={baixando || !notas.length} onClick={baixar}>
          <Download size={16} aria-hidden /> {baixando ? "Montando…" : "Baixar planilha para o contador"}
        </Button>
      </Card>

      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Resumo por ano</h2>
      <Table empty={!isLoading && !resumo.anos.length}
        head={<><th className="th">Ano</th>{GRUPOS.map((g) => <th key={g} className="th text-right">{g}</th>)}<th className="th text-right">Válidas</th></>}>
        {[...resumo.anos, resumo.total].map((l) => (
          <tr key={l.ano} className={l.ano === "Total" ? "bg-slate-50 font-bold" : ""}>
            <td className="td">
              {l.ano === "Total" ? "Total" : <button type="button" className="link-acao" onClick={() => { setAno(l.ano); setGrupo("todos"); }}>{l.ano}</button>}
            </td>
            {GRUPOS.map((g) => (
              <td key={g} className="td whitespace-nowrap text-right">
                <span className={COR[g]}>{brl(l.grupos[g].valor)}</span>
                <div className="text-xs text-slate-500">{l.grupos[g].qtd} {l.grupos[g].qtd === 1 ? "nota" : "notas"}</div>
              </td>
            ))}
            <td className="td whitespace-nowrap text-right font-semibold">{brl(l.validas.valor)}<div className="text-xs font-normal text-slate-500">{l.validas.qtd} notas</div></td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">Notas</h2>
      <ChipsSituacao rotulo="Ano" valor={ano} onChange={(v) => setAno(v)} opcoes={[
        { value: "todos", label: "Todos os anos", n: notas.length },
        ...resumo.anos.map((l) => ({ value: l.ano, label: l.ano, n: l.validas.qtd + l.grupos.Canceladas.qtd })),
      ]} />
      <ChipsSituacao rotulo="Tipo" valor={grupo} onChange={(v) => setGrupo(v)} opcoes={[
        { value: "todos" as const, label: "Todos os tipos", n: doAno.length },
        ...GRUPOS.map((g) => ({ value: g, label: g, n: doAno.filter((n) => grupoDaNota(n) === g).length })),
      ]} />
      <p className="mb-2 text-sm text-slate-500">{lista.length} notas · {brl(lista.reduce((s, n) => s + Number(n.valor ?? 0), 0))}</p>
      <Table empty={!isLoading && !lista.length} limite={200}
        head={<><th className="th">Data / NF</th><th className="th">Tipo</th><th className="th">Destinatário</th><th className="th text-right">Valor</th></>}>
        {lista.map((n) => {
          const g = grupoDaNota(n);
          return (
            <tr key={n.id} className={g === "Canceladas" ? "text-slate-400" : ""}>
              <td className="td whitespace-nowrap">{dataBR(n.data)}<div className="text-xs text-slate-500">NF {n.numero} · {n.tipo === "entrada" ? "entrada" : "saída"}</div>
                {n.chave && <div className="select-all font-mono text-2xs text-slate-400" title="Chave de acesso (44 números)">{n.chave}</div>}</td>
              <td className="td"><span className={`font-semibold ${COR[g]}`}>{g === "Canceladas" ? "Cancelada" : g.replace(/s$/, "").replace(/õe$/, "ão")}</span>
                <div className="text-xs text-slate-500">{n.natureza}{n.cartas_correcao ? ` · ${n.cartas_correcao} carta(s) de correção` : ""}</div></td>
              <td className="td">{n.dest_nome || n.cliente_nome || "—"}<div className="text-xs text-slate-500">{n.dest_doc ?? ""}</div></td>
              <td className={`td whitespace-nowrap text-right font-semibold ${g === "Canceladas" ? "line-through" : ""}`}>{brl(Number(n.valor ?? 0))}</td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
