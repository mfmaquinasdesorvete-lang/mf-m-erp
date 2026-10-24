// Fretes e protestos da My Frost (empresa anterior), só a conta master (o banco confere):
// - Fretes: CT-e, faturas, coletas e cotações das transportadoras, com o resumo por transportadora e por ano.
// - Protestos: cartas de anuência, quitações e avisos do cartório.
// Cada linha leva ao e-mail ou ao arquivo do Drive de onde veio.
import { useMemo, useState } from "react";
import { Table } from "@/components/ui";
import { ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { useRows } from "@/lib/data";
import { brl, dataBR } from "@/lib/format";

type Frete = {
  id: string; data: string | null; transportadora: string; tipo: string; numero: string | null; chave_cte: string | null;
  valor: number | null; remetente: string | null; destinatario: string | null; tomador: string | null; nf: string | null; link: string | null;
};
type Protesto = {
  id: string; data: string | null; tipo: string; credor: string | null; titulo: string | null; valor: number | null;
  cartorio: string | null; observacao: string | null; link: string | null;
};

const TIPO_FRETE: Record<string, string> = {
  cte: "CT-e", cte_cancelado: "CT-e cancelado", fatura: "Fatura", coleta: "Coleta", cotacao: "Cotação", cobranca: "Cobrança", boleto: "Boleto", outro: "Outro",
};
const TIPO_PROTESTO: Record<string, string> = {
  anuencia: "Carta de anuência", quitacao: "Quitação", aviso_cartorio: "Aviso do cartório", outro: "Outro",
};

const ano = (d: string | null) => (d ?? "").slice(0, 4) || "sem data";
// Fatura e CT-e do mesmo frete trazem o mesmo valor: a soma usa só o CT-e (a fatura entra quando não há CT-e com valor)
const somaValida = (l: Frete[]) => {
  const ctes = l.filter((f) => f.tipo === "cte" && f.valor != null);
  return (ctes.length ? ctes : l.filter((f) => f.tipo === "fatura")).reduce((s, f) => s + Number(f.valor ?? 0), 0);
};

function Origem({ link }: { link: string | null }) {
  return link ? <a href={link} target="_blank" rel="noopener noreferrer" className="link-acao">abrir</a> : <span className="text-slate-400">—</span>;
}

export function FretesProtestosMyFrost() {
  const [parte, setParte] = useState<"fretes" | "protestos">("fretes");
  return (
    <div>
      <ChipsSituacao rotulo="Parte" valor={parte} onChange={setParte} opcoes={[
        { value: "fretes" as const, label: "Fretes", n: 1 }, { value: "protestos" as const, label: "Protestos e anuências", n: 1 },
      ]} />
      {parte === "fretes" ? <Fretes /> : <Protestos />}
    </div>
  );
}

function Fretes() {
  const { data: fretes = [], isLoading } = useRows<Frete>("my_frost_fretes", { order: "data", ascending: false, key: ["my-frost-fretes"] });
  const [transp, setTransp] = useState("todas");
  const [anoSel, setAnoSel] = useState("todos");
  const transportadoras = useMemo(() => [...new Set(fretes.map((f) => f.transportadora))].sort(), [fretes]);
  const anos = useMemo(() => [...new Set(fretes.map((f) => ano(f.data)))].sort(), [fretes]);
  const daTransp = fretes.filter((f) => transp === "todas" || f.transportadora === transp);
  const lista = daTransp.filter((f) => anoSel === "todos" || ano(f.data) === anoSel);

  return (
    <div>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Resumo por transportadora</h2>
      <Table empty={!isLoading && !fretes.length}
        head={<><th className="th">Transportadora</th>{anos.map((a) => <th key={a} className="th text-right">{a}</th>)}<th className="th text-right">Total</th></>}>
        {transportadoras.map((t) => {
          const da = fretes.filter((f) => f.transportadora === t);
          return (
            <tr key={t}>
              <td className="td"><button type="button" className="link-acao" onClick={() => setTransp(t)}>{t}</button></td>
              {anos.map((a) => {
                const l = da.filter((f) => ano(f.data) === a);
                return <td key={a} className="td whitespace-nowrap text-right">{l.length ? <>{brl(somaValida(l))}<div className="text-xs text-slate-500">{l.length} registros</div></> : "—"}</td>;
              })}
              <td className="td whitespace-nowrap text-right font-semibold">{brl(somaValida(da))}<div className="text-xs font-normal text-slate-500">{da.length} registros</div></td>
            </tr>
          );
        })}
      </Table>
      <p className="mb-4 mt-1 text-xs text-slate-500">A soma usa o valor dos CT-e; a fatura só entra quando a transportadora não tem CT-e com valor. Registro sem valor não soma.</p>

      <ChipsSituacao rotulo="Transportadora" valor={transp} onChange={setTransp} opcoes={[
        { value: "todas", label: "Todas", n: fretes.length },
        ...transportadoras.map((t) => ({ value: t, label: t, n: fretes.filter((f) => f.transportadora === t).length })),
      ]} />
      <ChipsSituacao rotulo="Ano" valor={anoSel} onChange={setAnoSel} opcoes={[
        { value: "todos", label: "Todos os anos", n: daTransp.length },
        ...anos.map((a) => ({ value: a, label: a, n: daTransp.filter((f) => ano(f.data) === a).length })),
      ]} />
      <Table empty={!isLoading && !lista.length} limite={200}
        head={<><th className="th">Data</th><th className="th">Transportadora / tipo</th><th className="th">Remetente → destinatário</th><th className="th text-right">Valor</th><th className="th">Origem</th></>}>
        {lista.map((f) => (
          <tr key={f.id} className={f.tipo === "cte_cancelado" ? "text-slate-400" : ""}>
            <td className="td whitespace-nowrap">{f.data ? dataBR(f.data) : "—"}</td>
            <td className="td">{f.transportadora}<div className="text-xs text-slate-500">{TIPO_FRETE[f.tipo] ?? f.tipo}{f.numero ? ` ${f.numero}` : ""}{f.nf ? ` · NF ${f.nf}` : ""}</div>
              {f.chave_cte && <div className="select-all font-mono text-2xs text-slate-400" title="Chave do CT-e">{f.chave_cte}</div>}</td>
            <td className="td text-sm">{[f.remetente, f.destinatario].filter(Boolean).join(" → ") || "—"}{f.tomador && <div className="text-xs text-slate-500">paga: {f.tomador}</div>}</td>
            <td className="td whitespace-nowrap text-right font-semibold">{f.valor != null ? brl(Number(f.valor)) : "—"}</td>
            <td className="td"><Origem link={f.link} /></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Protestos() {
  const { data: itens = [], isLoading } = useRows<Protesto>("my_frost_protestos", { order: "data", ascending: false, key: ["my-frost-protestos"] });
  const [tipo, setTipo] = useState("todos");
  const lista = itens.filter((p) => tipo === "todos" || p.tipo === tipo);
  return (
    <div>
      <ChipsSituacao rotulo="Tipo" valor={tipo} onChange={setTipo} opcoes={[
        { value: "todos", label: "Todos", n: itens.length },
        ...Object.entries(TIPO_PROTESTO).map(([v, label]) => ({ value: v, label, n: itens.filter((p) => p.tipo === v).length })),
      ]} />
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">Data</th><th className="th">Tipo / credor</th><th className="th">Título</th><th className="th text-right">Valor</th><th className="th">Origem</th></>}>
        {lista.map((p) => (
          <tr key={p.id}>
            <td className="td whitespace-nowrap">{p.data ? dataBR(p.data) : "—"}</td>
            <td className="td">{p.credor || "—"}<div className="text-xs text-slate-500">{TIPO_PROTESTO[p.tipo] ?? p.tipo}{p.cartorio ? ` · ${p.cartorio}` : ""}</div></td>
            <td className="td text-sm">{p.titulo || "—"}{p.observacao && <div className="text-xs text-slate-500">{p.observacao}</div>}</td>
            <td className="td whitespace-nowrap text-right font-semibold">{p.valor != null ? brl(Number(p.valor)) : "—"}</td>
            <td className="td"><Origem link={p.link} /></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
