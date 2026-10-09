// Indicadores do mês dos fretes, separados por tipo de serviço (econômico não se mistura com expresso) e com o
// total à parte; abaixo, o recorte escolhido por destino, por transportadora e por rota.
// As contas ficam em src/lib/fretes.ts (funções puras, testadas).
import { useState, type ReactNode } from "react";
import { Table } from "@/components/ui";
import { brl } from "@/lib/format";
import {
  doServico, indicadoresPorServico, porDestino, porRota, porTransportadora, rotuloServico,
  type DadosIndicadores, type Envio, type Metricas, type Segmento,
} from "@/lib/fretes";

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const dias = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia${v >= 0.95 && v < 1.05 ? "" : "s"}`);
const reais = (v: number | null) => (v == null ? "—" : brl(v));

function Variacao({ m }: { m: Metricas }) {
  if (m.variacaoReais == null) return <span className="text-slate-400">—</span>;
  const ruim = m.variacaoReais > 0.005;
  return (
    <span className={ruim ? "font-semibold text-red-700" : m.variacaoReais < -0.005 ? "text-emerald-700" : ""}>
      {m.variacaoReais > 0 ? "+" : ""}{brl(m.variacaoReais)} <span className="text-xs">({m.variacaoPct != null && m.variacaoPct > 0 ? "+" : ""}{pct(m.variacaoPct)})</span>
      {m.divergentes > 0 && <span className="block text-[11px] text-red-700">{m.divergentes} divergente(s)</span>}
    </span>
  );
}

const sub = "block text-[11px] font-normal text-slate-500";

// cabeçalhos quebram linha para a tabela caber sem rolar
const Th = ({ children }: { children: ReactNode }) => <th className="th !whitespace-normal">{children}</th>;
const ocorrenciasSub = (m: Metricas) => `avaria ${pct(m.avariaPct)} · reentrega ${pct(m.reentregaPct)}`;

function LinhaServico({ rotulo, m, total }: { rotulo: string; m: Metricas; total?: boolean }) {
  return (
    <tr className={total ? "bg-slate-50 font-semibold" : ""}>
      <td className="td" data-label="Serviço">{rotulo}<span className={sub}>{total ? "todos os serviços · " : ""}{m.envios} envio(s)</span></td>
      <td className="td num" data-label="Custo médio">{reais(m.custoMedio)}<span className={sub}>{m.comCusto} com valor</span></td>
      <td className="td num" data-label="Faturado − aprovado"><Variacao m={m} /></td>
      <td className="td num" data-label="No prazo">{pct(m.noPrazoPct)}<span className={sub}>{m.noPrazo} de {m.comPrazo}</span></td>
      <td className="td num" data-label="Dias para cotar">{dias(m.tempoCotacaoDias)}<span className={sub}>coletar: {dias(m.tempoColetaDias)}</span></td>
      <td className="td num" data-label="Ocorrência">{pct(m.ocorrenciaPct)}<span className={sub}>{ocorrenciasSub(m)}</span></td>
      <td className="td num" data-label="Com comprovante">{pct(m.comprovantePct)}</td>
      <td className="td num" data-label="Frete / venda">{pct(m.freteSobreVenda)}
        <span className={sub}>{m.margemAposFrete != null ? `margem ${pct(m.margemAposFrete)}${m.pedidosComCusto < m.pedidos ? ` (${m.pedidosComCusto} de ${m.pedidos} pedidos)` : ""}`
          : m.pedidos ? "margem: sem custo dos itens" : "sem pedido"}</span></td>
    </tr>
  );
}

function TabelaGrupo({ titulo, primeira, grupos, transportadora }: { titulo: string; primeira: string; grupos: Segmento[]; transportadora?: boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <Table empty={!grupos.length}
        head={<><Th>{primeira}</Th><Th>Envios</Th><Th>Custo médio</Th><Th>Faturado − aprovado</Th><Th>No prazo</Th>
          {transportadora && <Th>Dias para coletar</Th>}<Th>Ocorrência</Th>{transportadora && <Th>Com comprovante</Th>}</>}>
        {grupos.map((g) => (
          <tr key={g.chave}>
            <td className="td font-semibold" data-label={primeira}>{g.rotulo}</td>
            <td className="td num" data-label="Envios">{g.m.envios}</td>
            <td className="td num" data-label="Custo médio">{reais(g.m.custoMedio)}</td>
            <td className="td num" data-label="Faturado − aprovado"><Variacao m={g.m} /></td>
            <td className="td num" data-label="No prazo">{pct(g.m.noPrazoPct)}</td>
            {transportadora && <td className="td num" data-label="Dias para coletar">{dias(g.m.tempoColetaDias)}</td>}
            <td className="td num" data-label="Ocorrência">{pct(g.m.ocorrenciaPct)}{transportadora && <span className={sub}>{ocorrenciasSub(g.m)}</span>}</td>
            {transportadora && <td className="td num" data-label="Com comprovante">{pct(g.m.comprovantePct)}</td>}
          </tr>
        ))}
      </Table>
    </div>
  );
}

export function IndicadoresMes({ envios, dados, nomeTransp, rotuloMes }: { envios: Envio[]; dados: DadosIndicadores; nomeTransp: (e: Envio) => string; rotuloMes: string }) {
  const [servico, setServico] = useState("todos");
  const r = indicadoresPorServico(envios, dados);
  const recorte = doServico(envios, r.servicos.some((s) => s.chave === servico) ? servico : "todos");
  const atual = r.servicos.find((s) => s.chave === servico);

  if (!envios.length) return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nenhum envio em {rotuloMes} com estes filtros.</p>;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Por tipo de serviço · {rotuloMes}</h3>
        <Table head={<><Th>Serviço</Th><Th>Custo médio</Th><Th>Faturado − aprovado</Th><Th>No prazo</Th>
          <Th>Dias para cotar</Th><Th>Ocorrência</Th><Th>Com comprovante</Th><Th>Frete / venda</Th></>}>
          {r.servicos.map((s) => <LinhaServico key={s.chave} rotulo={s.rotulo} m={s.m} />)}
          <LinhaServico rotulo="Total do mês" m={r.total} total />
        </Table>
        <p className="mt-2 text-xs text-slate-500">
          Custo = frete faturado (CT-e) ou, sem ele, o aprovado. Faturado − aprovado: divergente quando passa de R$ 1,00 ou 2%. No prazo = entregue até a entrega prevista
          (ou o prazo combinado). Dias para cotar = criação do envio → primeira cotação; para coletar = aprovação → coleta. Frete / venda e margem após o frete: só o frete pago
          pela MF, sobre o valor do pedido; a margem usa o custo dos produtos quando todos os itens do pedido têm custo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">Detalhar:</span>
        {[{ chave: "todos", rotulo: "Todos os serviços", n: r.total.envios }, ...r.servicos.map((s) => ({ chave: s.chave, rotulo: s.rotulo, n: s.m.envios }))].map((s) => (
          <button key={s.chave} type="button" onClick={() => setServico(s.chave)}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${(atual ? servico : "todos") === s.chave ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:bg-slate-100"}`}>
            {s.rotulo} ({s.n})
          </button>
        ))}
      </div>
      <p className="-mt-3 text-xs text-slate-500">{atual ? `Só ${rotuloServico(atual.chave === "nao_informado" ? null : atual.chave).toLowerCase()}: não se mistura com os outros serviços.` : "Todos os serviços juntos: compare com cuidado (preços de econômico e expresso são diferentes)."}</p>

      <TabelaGrupo titulo="Por transportadora" primeira="Transportadora" grupos={porTransportadora(recorte, dados, nomeTransp)} transportadora />
      <TabelaGrupo titulo="Por destino (UF · região)" primeira="Destino" grupos={porDestino(recorte, dados)} />
      <TabelaGrupo titulo="Por rota (UF de origem → UF de destino)" primeira="Rota" grupos={porRota(recorte, dados)} />
    </div>
  );
}
