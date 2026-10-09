// Nota emitida aberta: dados, itens e impostos, marcadores, observação interna, histórico e as ações
// (atualizar, reenviar, corrigir e reenviar a rejeitada, carta de correção, cancelar, devolução, excluir).
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, FilePen, FlaskConical, RefreshCw, Send, Tags, Trash2, Undo2, Wrench } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { supabase, callFunction } from "@/lib/supabase";
import { brl, dataBR, docFormat } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useInvalidate } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { podeDevolverEmitida, podeExcluirEmitida, situacaoEmitida } from "@/lib/notas";
import { CartaCorrecaoModal } from "@/components/FiscalAvancado";
import { MotivoAcao } from "@/components/MotivoAcao";
import { Historico } from "@/components/Historico";
import { AplicarMarcadores, ChipsMarcadores, useMarcadores } from "./Marcadores";
import { DevolucaoModal } from "./DevolucaoModal";

export type NotaEmitida = {
  id: string; referencia: string; status: string; numero: string | null; serie: string | null; chave: string | null; valor_total: number;
  xml_url: string | null; danfe_url: string | null; mensagem: string | null; created_at: string; updated_at?: string | null;
  origem?: "erp" | "importada"; destinatario_nome?: string | null; destinatario_doc?: string | null; ambiente?: "producao" | "homologacao";
  finalidade?: string; tipo_operacao?: string; payload?: any; resposta?: any; marcadores?: string[]; observacao_interna?: string | null;
  historico_envios?: { referencia: string; mensagem: string | null; em: string }[]; nota_referenciada_id?: string | null; chave_referenciada?: string | null;
  estoque_lancado?: boolean; pedido_id?: string | null; unidade_id?: string | null;
  pedido?: { numero: number; cliente?: { nome: string; nome_fantasia?: string | null } } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function baixarXmlImportado(n: { id: string; chave: string | null; numero: string | null }) {
  const { data, error } = await supabase.from("notas_fiscais_xml").select("xml").eq("nota_id", n.id).maybeSingle();
  if (error || !data?.xml) return notifyError(error ?? new Error("XML não encontrado"));
  const url = URL.createObjectURL(new Blob([data.xml], { type: "application/xml" }));
  Object.assign(document.createElement("a"), { href: url, download: `${n.chave ?? n.numero}.xml` }).click();
  URL.revokeObjectURL(url);
}

export function NotaDetalhe({ nota: n, leitura, onClose }: { nota: NotaEmitida; leitura?: boolean; onClose: () => void }) {
  const { pode } = usePerfil();
  const { data: marcadores = [] } = useMarcadores();
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const [janela, setJanela] = useState<"marcadores" | "carta" | "cancelar" | "excluir" | "devolucao" | "corrigir" | null>(null);
  const [obs, setObs] = useState(n.observacao_interna ?? "");
  const sit = situacaoEmitida(n);
  const p = n.payload ?? {};
  const itens: any[] = p.items ?? [];
  const importada = n.origem === "importada";
  const teste = n.ambiente === "homologacao";
  const podeFiscal = !leitura && pode("emitir_nfe");
  const podeFin = !leitura && pode("nfe_recebidas");

  const { data: relacionadas = [] } = useQuery({
    queryKey: ["notas_fiscais", "relacionadas", n.id],
    queryFn: async () => {
      const ids = [n.nota_referenciada_id].filter(Boolean) as string[];
      const [{ data: devolucoes }, { data: origem }] = await Promise.all([
        supabase.from("notas_fiscais").select("id, numero, serie, status, valor_total, created_at").eq("nota_referenciada_id", n.id),
        ids.length ? supabase.from("notas_fiscais").select("id, numero, serie, status, valor_total, created_at").in("id", ids) : Promise.resolve({ data: [] as any[] }),
      ]);
      return [...(origem ?? []).map((x: any) => ({ ...x, papel: "original" })), ...(devolucoes ?? []).map((x: any) => ({ ...x, papel: "devolucao" }))];
    },
  });

  async function acao(body: Record<string, unknown>, ok: string) {
    setOcupado(true);
    try {
      const r = await callFunction("nfe-consultar", { nota_id: n.id, ...body });
      notify(r.nota?.status === "erro" ? `Rejeitada: ${r.nota.mensagem}` : ok, r.nota?.status === "erro" ? "erro" : "ok");
      invalidate("notas_fiscais", "pedidos");
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function salvarObs() {
    const { error } = await supabase.rpc("anotar_nota", { p_tabela: "notas_fiscais", p_id: n.id, p_texto: obs });
    if (error) return notifyError(error);
    notify("Observação salva");
    invalidate("notas_fiscais");
  }

  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => notify("Chave copiada"));
  const uf = p.uf_destinatario ?? "";
  const destinatario = n.pedido?.cliente?.nome ?? n.destinatario_nome ?? p.nome_destinatario ?? "—";
  const doc = n.destinatario_doc ?? p.cnpj_destinatario ?? p.cpf_destinatario ?? "";
  const soma = (k: string) => r2(itens.reduce((s, i) => s + Number(i[k] ?? 0), 0));

  return (
    <Modal open onClose={onClose} title={`NF-e ${n.numero ? `${n.numero}/${n.serie ?? ""}` : "(sem número)"}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${sit.cor}`}><sit.Icone size={18} aria-hidden /> {sit.rotulo}</span>
          {teste && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800"><FlaskConical size={12} /> teste · sem valor fiscal</span>}
          {n.finalidade === "devolucao" && <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-semibold text-purple-800"><Undo2 size={12} /> devolução {n.tipo_operacao === "entrada" ? "de venda (entrada)" : "de compra (saída)"}</span>}
          {importada && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">importada do sistema anterior</span>}
          <ChipsMarcadores ids={n.marcadores} todos={marcadores} />
          {!leitura && <Button type="button" variant="ghost" onClick={() => setJanela("marcadores")}><Tags size={15} /> Marcadores</Button>}
        </div>

        {n.status === "erro" && n.mensagem && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>Motivo da rejeição:</b> {n.mensagem}</div>
        )}

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Info rotulo="Emissão" valor={dataBR(n.created_at)} />
          <Info rotulo="Natureza da operação" valor={p.natureza_operacao ?? "—"} />
          <Info rotulo="Valor da nota" valor={brl(n.valor_total)} forte />
          <Info rotulo={n.tipo_operacao === "entrada" && n.finalidade !== "devolucao" ? "Emitente" : "Destinatário"} valor={destinatario}
            extra={[docFormat(doc), uf || p.municipio_destinatario ? `${p.municipio_destinatario ?? ""}${uf ? `/${uf}` : ""}` : ""].filter(Boolean).join(" · ")} />
          <Info rotulo="Pedido" valor={n.pedido?.numero != null ? `#${n.pedido.numero}` : "—"} />
          <div className="rounded-lg border border-slate-200 p-2.5">
            <div className="text-xs text-slate-500">Chave de acesso</div>
            {n.chave ? <button type="button" onClick={() => copiar(n.chave!)} className="flex items-start gap-1 break-all text-left text-xs font-medium text-fg hover:text-brand"><Copy size={13} className="mt-0.5 shrink-0" /> {n.chave}</button> : <span className="text-slate-400">—</span>}
          </div>
        </div>

        {relacionadas.length > 0 && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
            {relacionadas.map((r: any) => (
              <div key={r.id}>{r.papel === "original" ? "Devolução da NF" : "Devolução emitida:"} {r.numero ?? "(sem número)"} · {dataBR(r.created_at)} · {brl(r.valor_total)} · {situacaoEmitida(r).rotulo}</div>
            ))}
            {n.chave_referenciada && !relacionadas.some((r: any) => r.papel === "original") && <div>Nota referenciada: <span className="break-all">{n.chave_referenciada}</span></div>}
          </div>
        )}

        {itens.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">NCM</th><th className="px-3 py-2">CFOP</th><th className="px-3 py-2 text-right">Qtd</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">ICMS</th><th className="px-3 py-2 text-right">IPI</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((i, k) => (
                  <tr key={k}>
                    <td className="px-3 py-2"><div className="font-medium text-fg">{i.descricao}</div><div className="text-xs text-slate-500">{i.codigo_produto}</div></td>
                    <td className="px-3 py-2 text-xs">{i.codigo_ncm}</td>
                    <td className="px-3 py-2 text-xs">{i.cfop}</td>
                    <td className="px-3 py-2 text-right">{Number(i.quantidade_comercial)}</td>
                    <td className="px-3 py-2 text-right">{brl(i.valor_bruto)}</td>
                    <td className="px-3 py-2 text-right text-xs">{i.icms_valor ? brl(i.icms_valor) : "—"}</td>
                    <td className="px-3 py-2 text-right text-xs">{i.ipi_valor ? brl(i.ipi_valor) : i.valor_ipi_devolvido ? `${brl(i.valor_ipi_devolvido)} dev.` : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-xs text-slate-600">
                <tr><td className="px-3 py-2" colSpan={7}>
                  Produtos {brl(soma("valor_bruto"))} · ICMS {brl(soma("icms_valor"))} · IPI {brl(soma("ipi_valor") + soma("valor_ipi_devolvido"))} · PIS {brl(soma("pis_valor"))} · COFINS {brl(soma("cofins_valor"))}
                  {soma("icms_valor_uf_destino") > 0 && ` · DIFAL ${brl(soma("icms_valor_uf_destino"))}`}{soma("cbs_valor") > 0 && ` · CBS ${brl(soma("cbs_valor"))} · IBS ${brl(soma("ibs_valor"))}`}
                </td></tr>
              </tfoot>
            </table>
          </div>
        )}
        {p.informacoes_adicionais_contribuinte && <div className="text-sm"><span className="text-xs font-semibold uppercase text-slate-500">Informações complementares</span><p className="text-slate-700">{p.informacoes_adicionais_contribuinte}</p></div>}
        {(n.historico_envios?.length ?? 0) > 0 && (
          <div className="text-xs text-slate-500">Tentativas anteriores: {n.historico_envios!.map((h) => `${dataBR(h.em)} · ${h.mensagem ?? "sem mensagem"}`).join(" | ")}</div>
        )}

        <Field label="Observação interna (não vai na nota)">
          <div className="flex gap-2">
            <input className="input" value={obs} disabled={leitura} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: cliente pediu 2ª via por e-mail" />
            {!leitura && obs !== (n.observacao_interna ?? "") && <Button type="button" variant="secondary" onClick={salvarObs}>Salvar</Button>}
          </div>
        </Field>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {n.danfe_url && <a href={n.danfe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-light"><ExternalLink size={15} /> DANFE</a>}
          {n.xml_url && <a href={n.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-light"><Download size={15} /> XML</a>}
          {importada && <Button type="button" variant="ghost" onClick={() => baixarXmlImportado(n)}><Download size={15} /> XML</Button>}
          {!leitura && n.status === "processando" && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => acao({}, "Situação atualizada")}><RefreshCw size={15} /> Atualizar</Button>}
          {podeFiscal && n.status === "contingencia" && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => acao({ acao: "reenviar" }, "Nota reenviada")}><Send size={15} /> Reenviar</Button>}
          {podeFiscal && n.status === "erro" && !importada && <Button type="button" variant="secondary" onClick={() => setJanela("corrigir")}><Wrench size={15} /> Corrigir e reenviar</Button>}
          {podeFiscal && !importada && n.status === "autorizada" && <Button type="button" variant="secondary" onClick={() => setJanela("carta")}><FilePen size={15} /> Carta de correção</Button>}
          {podeFiscal && podeDevolverEmitida(n) && <Button type="button" variant="secondary" onClick={() => setJanela("devolucao")}><Undo2 size={15} /> NF de devolução</Button>}
          {podeFiscal && !importada && n.status === "autorizada" && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => setJanela("cancelar")}>Cancelar nota</Button>}
          {podeFin && podeExcluirEmitida(n) && <Button type="button" variant="ghost" className="!text-red-600" onClick={() => setJanela("excluir")}><Trash2 size={15} /> Excluir</Button>}
        </div>

        <Historico tabela="notas_fiscais" id={n.id} />
      </div>

      {janela === "marcadores" && <AplicarMarcadores tabela="notas_fiscais" notas={[n]} onClose={() => setJanela(null)} />}
      {janela === "carta" && <CartaCorrecaoModal nota={n} onClose={() => setJanela(null)} />}
      {janela === "devolucao" && <DevolucaoModal origem={{ tipo: "emitida", id: n.id }} onClose={() => { setJanela(null); onClose(); }} />}
      {janela === "corrigir" && <CorrigirNota nota={n} onClose={(ok) => { setJanela(null); if (ok) onClose(); }} />}
      {janela === "cancelar" && (
        <MotivoAcao titulo={`Cancelar NF-e ${n.numero}`} rotulo="Cancelar na SEFAZ" perigo minimo={15} campo="Justificativa (vai para a SEFAZ)"
          onConfirmar={(j) => acao({ acao: "cancelar", justificativa: j }, "NF-e cancelada")} onClose={() => setJanela(null)}>
          <p>Prazo legal: até 24 horas depois da autorização. Depois disso, corrija com carta de correção ou com NF de devolução.</p>
        </MotivoAcao>
      )}
      {janela === "excluir" && (
        <MotivoAcao titulo="Excluir nota" rotulo="Excluir" perigo onClose={() => setJanela(null)}
          onConfirmar={async (motivo) => {
            const { error } = await supabase.rpc("excluir_nota", { p_tabela: "notas_fiscais", p_id: n.id, p_motivo: motivo });
            if (error) throw error;
            notify("Nota excluída (fica guardada em Excluídas)");
            invalidate("notas_fiscais", "pedidos");
            onClose();
          }}>
          <p>A nota sai das listas, do contador e dos relatórios. Fica guardada com o seu nome e o motivo, e dá para restaurar em <b>Excluídas</b>.</p>
          {n.status === "erro" && n.numero && <p>Se o número {n.numero} não for usado por outra nota, inutilize a numeração (botão <b>Inutilizar numeração</b>).</p>}
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

const CAMPOS_DEST: [string, string, string?][] = [
  ["nome_destinatario", "Nome / razão social", "sm:col-span-2"], ["indicador_inscricao_estadual_destinatario", "Indicador da IE"],
  ["inscricao_estadual_destinatario", "Inscrição estadual"], ["logradouro_destinatario", "Logradouro", "sm:col-span-2"], ["numero_destinatario", "Número"],
  ["complemento_destinatario", "Complemento"], ["bairro_destinatario", "Bairro"], ["municipio_destinatario", "Município"], ["uf_destinatario", "UF"],
  ["cep_destinatario", "CEP"], ["telefone_destinatario", "Telefone"], ["email_destinatario", "E-mail", "sm:col-span-2"],
];

/** Nota rejeitada: corrige o que não muda valores e manda de novo para a SEFAZ (nova referência, mesma nota). */
function CorrigirNota({ nota, onClose }: { nota: NotaEmitida; onClose: (ok: boolean) => void }) {
  const p = nota.payload ?? {};
  const [natureza, setNatureza] = useState<string>(p.natureza_operacao ?? "");
  const [info, setInfo] = useState<string>(p.informacoes_adicionais_contribuinte ?? "");
  const [dest, setDest] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS_DEST.map(([k]) => [k, p[k] == null ? "" : String(p[k])])));
  const [itens, setItens] = useState<any[]>(() => (p.items ?? []).map((i: any) => ({ numero_item: i.numero_item, descricao: i.descricao ?? "", codigo_ncm: i.codigo_ncm ?? "", cfop: i.cfop ?? "", cest: i.cest ?? "" })));
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();
  const semPayload = !p.items?.length;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const alteracoes: Record<string, any> = {};
    if (natureza !== (p.natureza_operacao ?? "")) alteracoes.natureza_operacao = natureza;
    if (info !== (p.informacoes_adicionais_contribuinte ?? "")) alteracoes.informacoes_adicionais_contribuinte = info;
    const d = Object.fromEntries(Object.entries(dest).filter(([k, v]) => v !== (p[k] == null ? "" : String(p[k]))));
    if (Object.keys(d).length) alteracoes.destinatario = d;
    const its = itens.map((i, k) => {
      const o = p.items[k];
      const mud: Record<string, any> = { numero_item: i.numero_item };
      for (const c of ["descricao", "codigo_ncm", "cfop", "cest"]) if (i[c] !== (o[c] ?? "")) mud[c] = i[c];
      return mud;
    }).filter((x) => Object.keys(x).length > 1);
    if (its.length) alteracoes.itens = its;
    setOcupado(true);
    try {
      const r = await callFunction("nfe-consultar", { nota_id: nota.id, acao: "reenviar_corrigida", alteracoes });
      notify(r.nota?.status === "erro" ? `Rejeitada de novo: ${r.nota.mensagem}` : r.nota?.status === "autorizada" ? `NF-e ${r.nota.numero} autorizada` : "Nota reenviada para a SEFAZ", r.nota?.status === "erro" ? "erro" : "ok");
      invalidate("notas_fiscais", "pedidos");
      onClose(r.nota?.status !== "erro");
    } catch (err) {
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={() => onClose(false)} title="Corrigir e reenviar nota rejeitada" wide>
      {semPayload ? (
        <p className="text-sm text-slate-600">Esta tentativa não chegou a ser montada (faltava cadastro). Corrija o cadastro do cliente ou do produto e emita de novo pelo pedido.</p>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {nota.mensagem && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>Rejeição:</b> {nota.mensagem}</div>}
          <p className="text-sm text-slate-600">Valores, quantidades e impostos não mudam aqui (vêm do pedido). Se o erro estiver no cadastro, corrija também em Clientes ou Produtos para as próximas notas.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Natureza da operação" className="sm:col-span-3"><input className="input" maxLength={60} value={natureza} onChange={(e) => setNatureza(e.target.value)} /></Field>
            {CAMPOS_DEST.map(([k, rotulo, classe]) => (
              <Field key={k} label={rotulo} className={classe}>
                {k === "indicador_inscricao_estadual_destinatario" ? (
                  <select className="input" value={dest[k]} onChange={(e) => setDest({ ...dest, [k]: e.target.value })}>
                    <option value="1">1 · contribuinte (tem IE)</option><option value="2">2 · isento</option><option value="9">9 · não contribuinte</option>
                  </select>
                ) : <input className="input" value={dest[k]} onChange={(e) => setDest({ ...dest, [k]: e.target.value })} />}
              </Field>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">Descrição</th><th className="px-2 py-2">NCM</th><th className="px-2 py-2">CFOP</th><th className="px-2 py-2">CEST</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((i, k) => (
                  <tr key={k}>
                    <td className="px-2 py-1.5"><input className="input py-1" value={i.descricao} onChange={(e) => setItens(itens.map((x, j) => j === k ? { ...x, descricao: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5"><input className="input w-28 py-1" value={i.codigo_ncm} onChange={(e) => setItens(itens.map((x, j) => j === k ? { ...x, codigo_ncm: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5"><input className="input w-20 py-1" value={i.cfop} onChange={(e) => setItens(itens.map((x, j) => j === k ? { ...x, cfop: e.target.value } : x))} /></td>
                    <td className="px-2 py-1.5"><input className="input w-24 py-1" value={i.cest} onChange={(e) => setItens(itens.map((x, j) => j === k ? { ...x, cest: e.target.value } : x))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field label="Informações complementares"><textarea className="input min-h-[4rem]" value={info} onChange={(e) => setInfo(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>Voltar</Button>
            <Button disabled={ocupado}><Send size={16} /> {ocupado ? "Enviando…" : "Salvar e reenviar"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
