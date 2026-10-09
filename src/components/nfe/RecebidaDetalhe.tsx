// Nota de fornecedor aberta: dados, itens, manifestação, processamento, marcadores, observação e ações
// (entrada no estoque, contas a pagar, reprocessar, NF de devolução de compra, excluir).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, PackagePlus, RefreshCw, Tags, Trash2, Undo2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { brl, dataBR, docFormat } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useInvalidate } from "@/lib/data";
import { numeroDaChave, situacaoRecebida } from "@/lib/notas";
import { EntradaEstoqueModal } from "@/components/EntradaEstoqueModal";
import { MotivoAcao } from "@/components/MotivoAcao";
import { Historico } from "@/components/Historico";
import { AplicarMarcadores, ChipsMarcadores, useMarcadores } from "./Marcadores";
import { DevolucaoModal } from "./DevolucaoModal";
import { LinhaDoTempo, useEvolucaoRecebidas } from "./Evolucao";
import { evolucaoRecebida } from "@/lib/evolucaoNota";

export type Recebida = {
  id: string; chave: string; emitente_nome: string; emitente_cnpj: string; valor_total: number; data_emissao: string;
  situacao: string; manifestacao: string | null; conta_pagar_id: string | null; estoque_lancado: boolean; processamento: string;
  processamento_msg: string | null; origem?: string; unidade_id?: string | null; marcadores?: string[]; observacao_interna?: string | null;
  finalidade?: string | null; nfe_completa?: boolean | null; fornecedor_id?: string | null;
};

export function RecebidaDetalhe({ nota: n, leitura, onClose }: { nota: Recebida; leitura?: boolean; onClose: () => void }) {
  const { data: marcadores = [] } = useMarcadores();
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const [janela, setJanela] = useState<"marcadores" | "entrada" | "devolucao" | "excluir" | null>(null);
  const [obs, setObs] = useState(n.observacao_interna ?? "");
  const sit = situacaoRecebida(n);
  const { data: itens = [] } = useQuery({
    queryKey: ["nfe_recebidas", "itens", n.id],
    queryFn: async () => {
      const { data } = await supabase.from("nfe_recebidas").select("itens").eq("id", n.id).single();
      return (data?.itens ?? []) as { numero: number; codigo: string; descricao: string; ncm: string | null; cfop: string | null; unidade: string; quantidade: number; valor_unitario: number; valor_total: number }[];
    },
  });

  async function executar(body: Record<string, unknown>, ok: (r: any) => string, fechar = false) {
    setOcupado(true);
    try {
      const r = await callFunction("nfe-recebidas-sync", body);
      notify(ok(r));
      invalidate("nfe_recebidas", "fornecedores", "contas_pagar");
      if (fechar) onClose();
      return r;
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function baixarXml() {
    const r = await executar({ acao: "xml", chave: n.chave }, () => "XML baixado");
    if (!r?.xml) return;
    const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
    Object.assign(document.createElement("a"), { href: url, download: `${n.chave}.xml` }).click();
    URL.revokeObjectURL(url);
  }

  function manifestar(tipo: string) {
    let justificativa: string | undefined;
    if (tipo === "nao_realizada") {
      justificativa = prompt("Justificativa (mínimo 15 caracteres):") ?? undefined;
      if (!justificativa) return;
    }
    if (tipo !== "ciencia" && !confirm("Esta manifestação é definitiva junto à SEFAZ. Confirmar?")) return;
    executar({ acao: "manifestar", chave: n.chave, tipo, justificativa }, () => "Manifestação registrada", true);
  }

  async function salvarObs() {
    const { error } = await supabase.rpc("anotar_nota", { p_tabela: "nfe_recebidas", p_id: n.id, p_texto: obs });
    if (error) return notifyError(error);
    notify("Observação salva");
    invalidate("nfe_recebidas");
  }

  const ativa = n.situacao !== "cancelada";
  return (
    <Modal open onClose={onClose} title={`NF ${numeroDaChave(n.chave)} · ${n.emitente_nome}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${sit.cor}`}><sit.Icone size={18} aria-hidden /> {sit.rotulo}</span>
          {n.finalidade === "devolucao" && <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-semibold text-purple-800"><Undo2 size={12} /> devolução de cliente</span>}
          {n.estoque_lancado && <span className="text-xs font-semibold text-emerald-700">estoque lançado</span>}
          {n.conta_pagar_id && <span className="text-xs font-semibold text-emerald-700">contas a pagar lançadas</span>}
          <ChipsMarcadores ids={n.marcadores} todos={marcadores} />
          {!leitura && <Button type="button" variant="ghost" onClick={() => setJanela("marcadores")}><Tags size={15} /> Marcadores</Button>}
        </div>
        {n.processamento_msg && n.processamento !== "concluido" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{n.processamento_msg}</div>}

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Info rotulo="Emissão" valor={dataBR(n.data_emissao)} />
          <Info rotulo="Fornecedor" valor={n.emitente_nome} extra={docFormat(n.emitente_cnpj)} />
          <Info rotulo="Valor da nota" valor={brl(n.valor_total)} forte />
          <div className="rounded-lg border border-slate-200 p-2.5 sm:col-span-2">
            <div className="text-xs text-slate-500">Chave de acesso</div>
            <button type="button" onClick={() => navigator.clipboard?.writeText(n.chave).then(() => notify("Chave copiada"))} className="flex items-start gap-1 break-all text-left text-xs font-medium text-fg hover:text-brand"><Copy size={13} className="mt-0.5 shrink-0" /> {n.chave}</button>
          </div>
          <Field label="Manifestação">
            <select className="input py-1.5 text-sm" value={n.manifestacao ?? ""} disabled={leitura || ocupado || !ativa} onChange={(e) => e.target.value && manifestar(e.target.value)}>
              <option value="">Sem manifestação</option>
              <option value="ciencia">Ciência da operação</option>
              <option value="confirmacao">Confirmação da operação</option>
              <option value="desconhecimento">Desconhecimento</option>
              <option value="nao_realizada">Operação não realizada</option>
            </select>
          </Field>
        </div>

        {itens.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">NCM</th><th className="px-3 py-2">CFOP</th><th className="px-3 py-2 text-right">Qtd</th><th className="px-3 py-2 text-right">Unitário</th><th className="px-3 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((i) => (
                  <tr key={i.numero}>
                    <td className="px-3 py-2"><div className="font-medium text-fg">{i.descricao}</div><div className="text-xs text-slate-500">{i.codigo}</div></td>
                    <td className="px-3 py-2 text-xs">{i.ncm}</td><td className="px-3 py-2 text-xs">{i.cfop}</td>
                    <td className="px-3 py-2 text-right">{Number(i.quantidade)} {i.unidade}</td>
                    <td className="px-3 py-2 text-right">{brl(i.valor_unitario)}</td><td className="px-3 py-2 text-right">{brl(i.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">Os itens aparecem depois que o XML é lido (ciência da operação ou importação do XML).</p>}

        <Field label="Observação interna">
          <div className="flex gap-2">
            <input className="input" value={obs} disabled={leitura} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: chegou com 1 peça a menos, fornecedor avisado" />
            {!leitura && obs !== (n.observacao_interna ?? "") && <Button type="button" variant="secondary" onClick={salvarObs}>Salvar</Button>}
          </div>
        </Field>

        {!leitura && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" disabled={ocupado} onClick={baixarXml}><Download size={15} /> XML</Button>
            {ativa && ["pendente", "aguardando_xml", "aguardando_vinculo", "revisao"].includes(n.processamento) && (
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => executar({ acao: "processar", nfe_id: n.id }, (r) => `Situação: ${String(r.processamento).replace(/_/g, " ")}`, true)}><RefreshCw size={15} /> Processar de novo</Button>
            )}
            {ativa && !n.estoque_lancado && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => setJanela("entrada")}><PackagePlus size={15} /> Entrada no estoque</Button>}
            {ativa && !n.conta_pagar_id && n.finalidade !== "devolucao" && (
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => executar({ acao: "lancar_conta", nfe_id: n.id }, (r) => `${r.contas} parcela(s) lançada(s) em contas a pagar`, true)}>Lançar a pagar</Button>
            )}
            {ativa && n.finalidade !== "devolucao" && <Button type="button" variant="secondary" onClick={() => setJanela("devolucao")}><Undo2 size={15} /> NF de devolução</Button>}
            {!n.estoque_lancado && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => setJanela("excluir")}><Trash2 size={15} /> Excluir</Button>}
          </div>
        )}
        <EvolucaoRecebida n={n} />
        <Historico tabela="nfe_recebidas" id={n.id} />
      </div>

      {janela === "marcadores" && <AplicarMarcadores tabela="nfe_recebidas" notas={[n]} onClose={() => setJanela(null)} />}
      {janela === "entrada" && <EntradaEstoqueModal nota={n} onClose={() => setJanela(null)} />}
      {janela === "devolucao" && <DevolucaoModal origem={{ tipo: "recebida", id: n.id }} onClose={() => { setJanela(null); onClose(); }} />}
      {janela === "excluir" && (
        <MotivoAcao titulo="Excluir nota de fornecedor" rotulo="Excluir" perigo onClose={() => setJanela(null)}
          onConfirmar={async (motivo) => {
            const { error } = await supabase.rpc("excluir_nota", { p_tabela: "nfe_recebidas", p_id: n.id, p_motivo: motivo });
            if (error) throw error;
            notify("Nota excluída (fica guardada em Excluídas)");
            invalidate("nfe_recebidas");
            onClose();
          }}>
          <p>Para notas importadas por engano, duplicadas ou que não são da MF. A nota some das listas e do pacote do contador, fica guardada com o motivo e dá para restaurar.</p>
          <p>Se já tiver contas a pagar lançadas, cancele as contas antes. A busca na SEFAZ não traz de volta uma nota excluída; importar o XML de novo, sim.</p>
        </MotivoAcao>
      )}
    </Modal>
  );
}

function Info({ rotulo, valor, extra, forte }: { rotulo: string; valor: string; extra?: string; forte?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2.5">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={forte ? "text-base font-bold text-fg" : "font-medium text-fg"}>{valor}</div>
      {extra && <div className="text-xs text-slate-500">{extra}</div>}
    </div>
  );
}

/** Linha do tempo da nota de fornecedor: ciência, XML, fornecedor, estoque e conta a pagar. */
function EvolucaoRecebida({ n }: { n: Recebida }) {
  const { data } = useEvolucaoRecebidas();
  const e = evolucaoRecebida(n, data?.get(n.id));
  if (!e.historico && !e.etapas.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-500">Evolução</div>
      <LinhaDoTempo e={e} />
    </div>
  );
}
