// Todos os documentos anexados no ERP, com busca, e os documentos gerais da empresa.
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { PageHeader, Table } from "@/components/ui";
import { Anexos, ENTIDADES, IconeArquivo, abrirDocumento, apagarDocumento, tamanhoArquivo, type Documento } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, hoje } from "@/lib/format";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { noPeriodo, semanaAtual, SEM_PERIODO, type Periodo } from "@/lib/filtroLista";
import { usePerfil } from "@/lib/auth";

const GERAL = "00000000-0000-0000-0000-000000000000";

export default function Documentos() {
  const { data: docs = [], isLoading } = useRows<Documento>("documentos", {});
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  // abre na semana (pela data do anexo), como as outras listas
  const [periodo, setPeriodo] = useState<Periodo>(() => semanaAtual(hoje()));
  const invalidar = useInvalidate();
  const { user_id, papel } = usePerfil();
  const lista = useMemo(() => docs
    .filter((d) => (!tipo || d.entidade === tipo) && noPeriodo(d.created_at, periodo) && (!busca || d.nome.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [docs, busca, tipo, periodo]);

  return (
    <div>
      <PageHeader title="Documentos" subtitle="Tudo o que foi anexado no ERP: contratos, comprovantes, boletos, fotos, laudos." />
      <div className="mb-5">
        <Anexos entidade="geral" id={GERAL} titulo="Documentos da empresa (contrato social, alvarás, certidões…)" />
      </div>
      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar pelo nome do arquivo…" periodo={periodo} onPeriodo={setPeriodo} rotuloData="Anexado"
        filtros={<label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Onde</span>
          <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ENTIDADES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>}
        nFiltros={tipo ? 1 : 0} onLimpar={() => { setBusca(""); setTipo(""); setPeriodo(SEM_PERIODO); }} />
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">Arquivo</th><th className="th">Onde</th><th className="th">Tamanho</th><th className="th">Data</th><th className="th" /></>}>
        {lista.map((d) => (
          <tr key={d.id}>
            <td className="td"><button type="button" className="flex items-center gap-2 text-left font-medium hover:underline" onClick={() => abrirDocumento(d)}><IconeArquivo tipo={d.tipo} /> {d.nome}</button></td>
            <td className="td">{ENTIDADES[d.entidade] ?? d.entidade}</td>
            <td className="td">{tamanhoArquivo(d.tamanho)}</td>
            <td className="td">{dataBR(d.created_at)}</td>
            <td className="td text-right">{(d.created_by === user_id || papel === "admin") && (
              <button type="button" aria-label="Apagar" className="rounded p-1 text-slate-400 hover:text-red-600" onClick={async () => { if (await apagarDocumento(d)) invalidar("documentos"); }}><Trash2 size={16} /></button>
            )}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
