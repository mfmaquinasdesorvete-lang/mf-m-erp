import { useEffect, useState } from "react";
import { Ban, Download, ExternalLink, FilePen, PackagePlus, RefreshCw, Send, Upload } from "lucide-react";
import { Badge, Button, PageHeader, Table, Tabs } from "@/components/ui";
import { EntradaEstoqueModal } from "@/components/EntradaEstoqueModal";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, docFormat } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { CartaCorrecaoModal, InutilizarModal, RegrasTributacao } from "@/components/FiscalAvancado";
import { ComplianceFiscal } from "@/components/ComplianceFiscal";
import { EmitirNfeModal } from "@/components/EmitirNfe";
import { ConfigNfe } from "@/components/ConfigNfe";

type Emitida = {
  id: string; referencia: string; status: string; numero: string | null; serie: string | null; chave: string | null;
  valor_total: number; xml_url: string | null; danfe_url: string | null; mensagem: string | null; created_at: string;
  pedido?: { numero: number; cliente?: { nome: string } } | null;
};
type Recebida = {
  id: string; chave: string; emitente_nome: string; emitente_cnpj: string; valor_total: number; data_emissao: string;
  situacao: string; manifestacao: string | null; conta_pagar_id: string | null;
  estoque_lancado: boolean; processamento: string; processamento_msg: string | null;
};

export default function NotasFiscais() {
  const { pode, papel } = usePerfil();
  const contador = papel === "contador";
  const [aba, setAba] = useState<"emitidas" | "recebidas" | "config" | "regras" | "compliance">("emitidas");
  return (
    <div>
      <PageHeader title="Notas fiscais" />
      <Tabs value={aba} onChange={setAba} options={[
        { value: "emitidas", label: "NF-e emitidas (vendas)" },
        ...(pode("nfe_recebidas") || contador ? [{ value: "recebidas" as const, label: "NF-e recebidas (fornecedores)" }] : []),
        { value: "config", label: "Configurações da NF-e" },
        { value: "regras", label: "Regras de tributação" },
        { value: "compliance", label: "Compliance fiscal" },
      ]} />
      {aba === "compliance" ? <ComplianceFiscal /> : aba === "config" ? <ConfigNfe podeEditar={papel === "admin"} irParaRegras={() => setAba("regras")} /> : aba === "regras" ? <RegrasTributacao podeEditar={pode("nfe_recebidas")} /> : aba === "recebidas" && (pode("nfe_recebidas") || contador) ? <Recebidas leitura={contador} /> : <Emitidas leitura={contador} />}
    </div>
  );
}

function Emitidas({ leitura = false }: { leitura?: boolean }) {
  const { filtrar } = useUnidade();
  const { data: dataTodos = [], isLoading } = useRows<Emitida>("notas_fiscais", { select: "*, pedido:pedidos(numero, cliente:clientes(nome)), transferencia:transferencias(numero, destino_id)" });
  const data = filtrar(dataTodos);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [carta, setCarta] = useState<Emitida | null>(null);
  const [inutilizar, setInutilizar] = useState(false);
  const [emitir, setEmitir] = useState(false);
  const { pode } = usePerfil();
  const invalidate = useInvalidate();

  // Com os gatilhos da Focus ativos o status muda sozinho no banco; recarrega enquanto houver nota processando.
  const processando = data.some((n) => n.status === "processando" || n.status === "contingencia");
  useEffect(() => {
    if (!processando) return;
    const t = setInterval(() => invalidate("notas_fiscais", "pedidos"), 8000);
    return () => clearInterval(t);
  }, [processando]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(n: Emitida, body: Record<string, unknown>, ok: string) {
    setOcupado(n.id);
    try {
      const r = await callFunction("nfe-consultar", { nota_id: n.id, ...body });
      notify(r.nota?.status === "erro" ? `Rejeitada: ${r.nota.mensagem}` : ok, r.nota?.status === "erro" ? "erro" : "ok");
      invalidate("notas_fiscais", "pedidos");
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(null);
    }
  }

  function cancelar(n: Emitida) {
    const justificativa = prompt("Motivo do cancelamento (mínimo 15 caracteres). Prazo legal: até 24h após a autorização.");
    if (!justificativa) return;
    acao(n, { acao: "cancelar", justificativa }, "NF-e cancelada");
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">A NF-e de venda sai de um pedido aprovado: clique em <b>Emitir NF-e</b> e escolha o pedido.</p>
        <div className="flex flex-wrap gap-2">
          {pode("nfe_recebidas") && <Button variant="secondary" onClick={() => setInutilizar(true)}><Ban size={16} /> Inutilizar numeração</Button>}
          {!leitura && pode("emitir_nfe") && <Button onClick={() => setEmitir(true)}><Send size={16} /> Emitir NF-e</Button>}
        </div>
      </div>
      {emitir && <EmitirNfeModal onClose={() => setEmitir(false)} />}
      {data.some((n) => n.status === "contingencia") && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Contingência:</b> a SEFAZ ou a Focus não respondeu e há nota(s) na fila. O ERP reenvia sozinho a cada 15 minutos
          (e a Focus usa o ambiente de contingência SVC quando a SEFAZ do estado está fora). Você pode tentar agora em <b>Reenviar</b>.
        </div>
      )}
      {carta && <CartaCorrecaoModal nota={carta} onClose={() => setCarta(null)} />}
      {inutilizar && <InutilizarModal onClose={() => setInutilizar(false)} />}
      <Table
        empty={!isLoading && data.length === 0}
        head={<><th className="th">Data</th><th className="th">Pedido</th><th className="th">Cliente</th><th className="th">Nº / Série</th><th className="th">Status</th><th className="th text-right">Valor</th><th className="th" /></>}
      >
        {data.map((n) => {
          // nota de transferência só quando a transferência veio de fato (vínculo vazio = nota de pedido)
          const transf = (n as any).transferencia?.numero != null ? (n as any).transferencia : null;
          return (
          <tr key={n.id}>
            <td className="td">{dataBR(n.created_at)}</td>
            <td className="td">{transf ? `Transf. #${transf.numero}` : n.pedido?.numero != null ? `#${n.pedido.numero}` : "—"}<EtiquetaUnidade id={(n as any).unidade_id} /></td>
            <td className="td">{transf ? <NomeUnidade id={transf.destino_id} /> : n.pedido?.cliente?.nome ?? "—"}</td>
            <td className="td">{n.numero ? `${n.numero} / ${n.serie}` : "—"}</td>
            <td className="td"><Badge value={n.status} />{n.mensagem && <div className="mt-1 max-w-xs text-xs text-slate-500">{n.mensagem}</div>}</td>
            <td className="td text-right">{brl(n.valor_total)}</td>
            <td className="td">
              <div className="flex flex-wrap justify-end gap-1">
                {n.status === "processando" && (
                  <Button variant="secondary" disabled={ocupado === n.id} onClick={() => acao(n, {}, "Status atualizado")}>
                    <RefreshCw size={15} /> Atualizar
                  </Button>
                )}
                {n.danfe_url && <a href={n.danfe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm text-brand hover:bg-brand-light"><ExternalLink size={15} /> DANFE</a>}
                {n.xml_url && <a href={n.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm text-brand hover:bg-brand-light"><Download size={15} /> XML</a>}
                {!leitura && n.status === "contingencia" && (
                  <Button variant="secondary" disabled={ocupado === n.id} onClick={() => acao(n, { acao: "reenviar" }, "Nota reenviada")}><Send size={15} /> Reenviar</Button>
                )}
                {!leitura && n.status === "autorizada" && <Button variant="secondary" onClick={() => setCarta(n)}><FilePen size={15} /> Carta de correção</Button>}
                {!leitura && n.status === "autorizada" && <Button variant="ghost" className="!text-red-600" disabled={ocupado === n.id} onClick={() => cancelar(n)}>Cancelar</Button>}
              </div>
            </td>
          </tr>
          );
        })}
      </Table>
    </>
  );
}

function Recebidas({ leitura = false }: { leitura?: boolean }) {
  const { filtrar } = useUnidade();
  const { data: dataTodos = [], isLoading } = useRows<Recebida>("nfe_recebidas", { order: "data_emissao" });
  const data = filtrar(dataTodos);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [entrada, setEntrada] = useState<Recebida | null>(null);
  const invalidate = useInvalidate();

  async function executar(id: string, body: Record<string, unknown>, ok: (r: any) => string) {
    setOcupado(id);
    try {
      const r = await callFunction("nfe-recebidas-sync", body);
      notify(ok(r));
      invalidate("nfe_recebidas", "fornecedores", "contas_pagar");
      return r;
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(null);
    }
  }

  async function baixarXml(n: Recebida) {
    const r = await executar(n.id, { acao: "xml", chave: n.chave }, () => "XML baixado");
    if (!r?.xml) return;
    const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${n.chave}.xml` });
    a.click();
    URL.revokeObjectURL(url);
  }

  function manifestar(n: Recebida, tipo: string) {
    let justificativa: string | undefined;
    if (tipo === "nao_realizada") {
      justificativa = prompt("Justificativa (mínimo 15 caracteres):") ?? undefined;
      if (!justificativa) return;
    }
    if (tipo !== "ciencia" && !confirm("Esta manifestação é definitiva junto à SEFAZ. Confirmar?")) return;
    executar(n.id, { acao: "manifestar", chave: n.chave, tipo, justificativa }, () => "Manifestação registrada");
  }

  return (
    <>
      {leitura ? <p className="mb-3 text-sm text-slate-500">Os XML das notas de fornecedores vão no pacote do fechamento (Painel do contador).</p> : <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => executar("sync", { acao: "sincronizar" }, (r) => `${r.processadas} nota(s) sincronizada(s), ${r.automaticas} processada(s) automaticamente${r.avisos?.length ? `. Não buscou: ${r.avisos.join("; ")}` : ""}`)} disabled={ocupado === "sync"}>
          <RefreshCw size={16} className={ocupado === "sync" ? "animate-spin" : ""} /> Buscar notas na SEFAZ
        </Button>
        <label className={`inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-0 sm:py-2 ${ocupado === "xml" ? "pointer-events-none opacity-50" : ""}`}>
          <Upload size={16} /> {ocupado === "xml" ? "Importando…" : "Importar XML"}
          <input type="file" accept=".xml,text/xml,application/xml" multiple className="hidden" onChange={async (ev) => {
            const arquivos = Array.from(ev.target.files ?? []);
            ev.target.value = "";
            for (const f of arquivos) {
              await executar("xml", { acao: "importar_xml", xml: await f.text() },
                (r) => r.ja_existia ? `${f.name}: nota já estava no ERP` : `NF ${r.numero ?? ""} de ${r.emitente ?? "fornecedor"}: ${r.processamento === "concluido" ? "estoque e contas lançados" : r.processamento_msg ?? "importada"}`);
            }
          }} />
        </label>
        <p className="text-sm text-slate-500">
          Notas emitidas contra os CNPJs da MF (ou o XML que o fornecedor mandou). O ERP dá ciência, lê o XML, lança o contas a pagar e dá entrada no estoque
          sozinho. Só pede ajuda quando um item ainda não tem produto vinculado.
        </p>
      </div>}
      <Table
        empty={!isLoading && data.length === 0}
        head={<><th className="th">Emissão</th><th className="th">Fornecedor</th><th className="th">Situação</th><th className="th">Processamento</th><th className="th">Manifestação</th><th className="th text-right">Valor</th><th className="th" /></>}
      >
        {data.map((n) => (
          <tr key={n.id}>
            <td className="td">{dataBR(n.data_emissao)}</td>
            <td className="td">{n.emitente_nome}<EtiquetaUnidade id={(n as any).unidade_id} /><div className="text-xs text-slate-500">{docFormat(n.emitente_cnpj)}</div></td>
            <td className="td"><Badge value={n.situacao} /></td>
            <td className="td">
              <Badge value={n.processamento} />
              {n.processamento_msg && n.processamento !== "concluido" && (
                <div className="mt-1 max-w-xs text-xs text-slate-500">{n.processamento_msg}</div>
              )}
            </td>
            <td className="td">
              <select className="input w-auto py-1 text-xs" value={n.manifestacao ?? ""} disabled={leitura || ocupado === n.id || n.situacao === "cancelada"}
                onChange={(e) => e.target.value && manifestar(n, e.target.value)}>
                <option value="">Sem manifestação</option>
                <option value="ciencia">Ciência da operação</option>
                <option value="confirmacao">Confirmação da operação</option>
                <option value="desconhecimento">Desconhecimento</option>
                <option value="nao_realizada">Operação não realizada</option>
              </select>
            </td>
            <td className="td text-right">{brl(n.valor_total)}</td>
            <td className="td">
              {!leitura && <div className="flex flex-wrap justify-end gap-1">
                <Button variant="ghost" disabled={ocupado === n.id} onClick={() => baixarXml(n)}><Download size={15} /> XML</Button>
                {["pendente", "aguardando_xml"].includes(n.processamento) && (
                  <Button variant="ghost" title="Tentar processar agora" disabled={ocupado === n.id}
                    onClick={() => executar(n.id, { acao: "processar", nfe_id: n.id }, (r) => `Situação: ${r.processamento.replace(/_/g, " ")}`)}>
                    <RefreshCw size={15} />
                  </Button>
                )}
                {n.estoque_lancado ? (
                  <span className="px-2 py-2 text-xs text-green-700">Estoque lançado</span>
                ) : n.situacao !== "cancelada" && (
                  <Button variant="secondary" disabled={ocupado === n.id} onClick={() => setEntrada(n)}>
                    <PackagePlus size={15} /> Entrada no estoque
                  </Button>
                )}
                {n.conta_pagar_id ? (
                  <span className="px-2 py-2 text-xs text-green-700">Lançada no financeiro</span>
                ) : n.situacao !== "cancelada" && (
                  <Button variant="secondary" disabled={ocupado === n.id}
                    onClick={() => executar(n.id, { acao: "lancar_conta", nfe_id: n.id }, (r) => `${r.contas} parcela(s) lançada(s) em contas a pagar`)}>
                    Lançar a pagar
                  </Button>
                )}
              </div>}
            </td>
          </tr>
        ))}
      </Table>

      {entrada && <EntradaEstoqueModal nota={entrada} onClose={() => setEntrada(null)} />}
    </>
  );
}

function NomeUnidade({ id }: { id: string }) {
  const { nome } = useUnidade();
  return <>{nome(id)}</>;
}
