// Boleto com Pix do Banco Inter na conta a receber: emitir (o cliente paga pelo código de barras ou pelo Pix do
// boleto), copiar a linha digitável e o Pix, ver o PDF, mandar no WhatsApp, atualizar e cancelar. A baixa da conta é
// sozinha quando o Inter avisa o pagamento (função inter → registrar_boleto_inter).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Barcode, Copy, FileText, Loader2, MessageCircle, RefreshCw, XCircle } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { pedirTexto } from "@/components/Dialogos";
import { PdfViewer } from "@/components/PdfViewer";
import { usePerfil } from "@/lib/auth";
import { ler, useInvalidate } from "@/lib/data";
import { brl, dataBR, dataHoraBR, hoje, somarDias, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { formatarLinha, pagadorInter, type ClienteBoleto } from "../../../supabase/functions/_shared/inter-boleto";

export type BoletoInter = {
  id: string; conta_receber_id: string | null; situacao: string; situacao_data: string | null; valor: number; vencimento: string;
  nosso_numero: string | null; linha_digitavel: string | null; pix_copia_cola: string | null; valor_recebido: number | null;
  origem_recebimento: "BOLETO" | "PIX" | null; baixa_em: string | null; motivo_cancelamento: string | null; erro: string | null;
  criado_nome: string | null; created_at: string;
};
type Conta = { id: string; descricao: string; valor: number; vencimento: string; status: string; cliente_id: string | null; cliente?: { nome: string; whatsapp?: string | null } | null };

const ABERTO = ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "PROTESTO"];
export const ROTULO_BOLETO: Record<string, string> = {
  EM_PROCESSAMENTO: "registrando no banco", A_RECEBER: "a receber", ATRASADO: "vencido", PROTESTO: "em protesto",
  RECEBIDO: "pago", MARCADO_RECEBIDO: "marcado como pago no Inter", CANCELADO: "cancelado", EXPIRADO: "expirado", FALHA_EMISSAO: "não emitido",
};
const COR: Record<string, string> = {
  A_RECEBER: "bg-sky-100 text-sky-800", EM_PROCESSAMENTO: "bg-slate-100 text-slate-700", ATRASADO: "bg-red-100 text-red-800", PROTESTO: "bg-red-100 text-red-800",
  RECEBIDO: "bg-emerald-100 text-emerald-800", MARCADO_RECEBIDO: "bg-emerald-100 text-emerald-800",
  CANCELADO: "bg-slate-100 text-slate-600", EXPIRADO: "bg-slate-100 text-slate-600", FALHA_EMISSAO: "bg-amber-100 text-amber-800",
};
export const boletoAberto = (b: Pick<BoletoInter, "situacao">) => ABERTO.includes(b.situacao);

/** Linha curta para a lista de contas: boleto emitido, pago ou com problema. */
export function SituacaoBoleto({ boletos }: { boletos: BoletoInter[] }) {
  const b = boletos.find(boletoAberto) ?? boletos.find((x) => x.situacao === "RECEBIDO");
  if (!b) return null;
  if (b.situacao === "RECEBIDO") return <span className="text-xs text-emerald-700"> · pago pelo boleto Inter{b.origem_recebimento === "PIX" ? " (Pix)" : ""}{b.erro ? <span className="text-amber-700"> · {b.erro}</span> : null}</span>;
  return <span className={`text-xs ${b.situacao === "ATRASADO" ? "text-red-700" : "text-sky-700"}`}> · boleto Inter {ROTULO_BOLETO[b.situacao]} (vence {dataBR(b.vencimento)})</span>;
}

const CAMPOS = "nome, tipo_pessoa, cpf_cnpj, email, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, municipio, uf, cobranca_diferente, cobranca_cep, cobranca_logradouro, cobranca_numero, cobranca_complemento, cobranca_bairro, cobranca_municipio, cobranca_uf";

export function BoletoInterModal({ conta, boletos, onClose }: { conta: Conta; boletos: BoletoInter[]; onClose: () => void }) {
  const { tem } = usePerfil();
  const invalidar = useInvalidate();
  const lista = [...boletos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const atual = lista.find(boletoAberto) ?? lista.find((b) => b.situacao === "RECEBIDO" || b.situacao === "MARCADO_RECEBIDO") ?? null;
  const antigos = lista.filter((b) => b !== atual);
  const [vencimento, setVencimento] = useState(conta.vencimento >= hoje() ? conta.vencimento : somarDias(3));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const { data: cliente } = useQuery({
    queryKey: ["clientes", "boleto", conta.cliente_id],
    enabled: !!conta.cliente_id && !atual,
    queryFn: async () => (await ler(supabase.from("clientes").select(CAMPOS).eq("id", conta.cliente_id!).maybeSingle())) as ClienteBoleto | null,
  });
  const falta = conta.cliente_id ? (cliente ? pagadorInter(cliente).faltando : []) : ["cliente na conta"];

  const executar = async (acao: string, f: () => Promise<void>) => {
    setOcupado(acao);
    try { await f(); } catch (e) { notifyError(e); } finally { setOcupado(null); invalidar("boletos_inter", "contas_receber"); }
  };
  const emitir = () => executar("emitir", async () => {
    const r = await callFunction<{ boleto?: BoletoInter }>("inter", { acao: "boleto_emitir", conta_id: conta.id, vencimento });
    notify(r.boleto?.linha_digitavel ? "Boleto emitido no Inter" : "Boleto enviado ao Inter: a linha digitável chega em instantes (toque em Atualizar)");
  });
  const atualizar = (b: BoletoInter) => executar("atualizar", async () => {
    const r = await callFunction<{ resultado?: string }>("inter", { acao: "boleto_atualizar", id: b.id });
    notify(r.resultado === "baixa feita" ? "Boleto pago: baixa feita na conta" : "Boleto atualizado");
  });
  const verPdf = (b: BoletoInter) => executar("pdf", async () => {
    const r = await callFunction<{ pdf: string }>("inter", { acao: "boleto_pdf", id: b.id });
    const bytes = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0));
    setPdf(new Blob([bytes], { type: "application/pdf" }));
  });
  const cancelar = async (b: BoletoInter) => {
    const motivo = await pedirTexto("Por que cancelar este boleto? (vai para o Inter; mínimo 3 caracteres)", "", { titulo: "Cancelar boleto", ok: "Cancelar boleto", minimo: 3 });
    if (!motivo) return;
    await executar("cancelar", async () => {
      await callFunction("inter", { acao: "boleto_cancelar", id: b.id, motivo });
      notify("Boleto cancelado no Inter");
    });
  };
  const copiar = (texto: string, o: string) => navigator.clipboard.writeText(texto).then(() => notify(`${o} copiado`), () => notify("Não consegui copiar: selecione e copie à mão", "erro"));
  const mensagem = (b: BoletoInter) => [
    `Olá ${conta.cliente?.nome.split(" ")[0] ?? ""}! Segue o boleto da *MF Máquinas*:`,
    conta.descricao,
    `Valor: ${brl(b.valor)} · Vencimento: ${dataBR(b.vencimento)}`,
    b.linha_digitavel ? `\n*Linha digitável:*\n${formatarLinha(b.linha_digitavel)}` : "",
    b.pix_copia_cola ? `\n*Ou pague pelo Pix (copia e cola):*\n${b.pix_copia_cola}` : "",
  ].filter(Boolean).join("\n");

  return (
    <Modal open onClose={onClose} title={`Boleto com Pix · Banco Inter`}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">{conta.descricao} · <b className="num">{brl(conta.valor)}</b>{conta.cliente ? ` · ${conta.cliente.nome}` : ""}</p>

        {atual ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COR[atual.situacao] ?? ""}`}>{ROTULO_BOLETO[atual.situacao] ?? atual.situacao}</span>
              <span className="text-slate-600">vence {dataBR(atual.vencimento)} · <b className="num">{brl(atual.valor)}</b>{atual.nosso_numero ? ` · nosso número ${atual.nosso_numero}` : ""}</span>
            </div>
            {atual.situacao === "RECEBIDO" && (
              <p className="text-emerald-700">Pago em {dataBR(atual.situacao_data)} {atual.origem_recebimento === "PIX" ? "pelo Pix do boleto" : "pelo boleto"}: <b className="num">{brl(atual.valor_recebido ?? atual.valor)}</b>{atual.baixa_em ? " · baixa feita na conta" : ""}.</p>
            )}
            {atual.situacao === "MARCADO_RECEBIDO" && <p className="text-amber-800">Marcado como pago no Inter (recebido por fora): dê a baixa da conta no ERP com a forma e a data certas.</p>}
            {atual.erro && <p className="font-semibold text-amber-800">{atual.erro}</p>}
            {boletoAberto(atual) && (
              <>
                {atual.linha_digitavel ? (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Linha digitável</span>
                    <div className="flex items-start gap-2">
                      <code className="num min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-fg">{formatarLinha(atual.linha_digitavel)}</code>
                      <Button type="button" variant="secondary" onClick={() => copiar(atual.linha_digitavel!, "Linha digitável")}><Copy size={15} /> Copiar</Button>
                    </div>
                  </div>
                ) : <p className="text-slate-600">O banco ainda está registrando: a linha digitável aparece em instantes (toque em Atualizar).</p>}
                {atual.pix_copia_cola && (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Pix copia e cola do boleto</span>
                    <div className="flex items-start gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-fg" title={atual.pix_copia_cola}>{atual.pix_copia_cola}</code>
                      <Button type="button" variant="secondary" onClick={() => copiar(atual.pix_copia_cola!, "Pix copia e cola")}><Copy size={15} /> Copiar</Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Button type="button" variant="secondary" disabled={!!ocupado || !atual.linha_digitavel} onClick={() => verPdf(atual)}>
                    {ocupado === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} PDF do boleto
                  </Button>
                  {conta.cliente?.whatsapp && atual.linha_digitavel && (
                    <a href={whatsappLink(conta.cliente.whatsapp, mensagem(atual))} target="_blank" rel="noreferrer"
                      className="inline-flex min-h-toque items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-green-700 shadow-sm hover:bg-green-50 sm:min-h-0"><MessageCircle size={15} /> Enviar no WhatsApp</a>
                  )}
                  <Button type="button" variant="ghost" disabled={!!ocupado} onClick={() => atualizar(atual)}>
                    {ocupado === "atualizar" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar
                  </Button>
                  {tem("financeiro") && (
                    <Button type="button" variant="ghost" className="ml-auto text-red-700" disabled={!!ocupado} onClick={() => cancelar(atual)}>
                      <XCircle size={15} /> Cancelar boleto
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">Quando o cliente pagar (boleto ou Pix), o Inter avisa o ERP e a conta recebe a baixa sozinha na conta do Inter.</p>
              </>
            )}
          </div>
        ) : conta.status !== "aberto" ? (
          <p className="text-slate-600">Só conta em aberto recebe boleto.</p>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            {falta.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                Para emitir o boleto, complete no cadastro do cliente: <b>{falta.join(", ")}</b>.
              </p>
            )}
            <Field label="Vencimento do boleto">
              <input className="input" type="date" value={vencimento} min={hoje()} onChange={(e) => setVencimento(e.target.value)} required />
            </Field>
            {vencimento !== conta.vencimento && <p className="text-xs text-slate-500">A conta vence em {dataBR(conta.vencimento)}; o boleto sai com o vencimento escolhido (a conta continua com a data dela).</p>}
            <div className="flex justify-end">
              <Button type="button" disabled={!!ocupado || falta.length > 0 || !vencimento || vencimento < hoje()} onClick={emitir}>
                {ocupado === "emitir" ? <><Loader2 size={15} className="animate-spin" /> Emitindo no Inter…</> : <><Barcode size={15} /> Emitir boleto com Pix</>}
              </Button>
            </div>
          </div>
        )}

        {antigos.length > 0 && (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">Boletos anteriores desta conta ({antigos.length})</summary>
            <ul className="mt-1 space-y-1">
              {antigos.map((b) => (
                <li key={b.id}>
                  {dataHoraBR(b.created_at)} · {ROTULO_BOLETO[b.situacao] ?? b.situacao} · vence {dataBR(b.vencimento)} · {brl(b.valor)}
                  {b.criado_nome ? ` · por ${b.criado_nome}` : ""}{b.motivo_cancelamento ? ` · motivo: ${b.motivo_cancelamento}` : ""}{b.erro ? ` · ${b.erro}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {pdf && <PdfViewer blob={pdf} nome={`boleto-${conta.descricao.replace(/[^\w-]+/g, "-").slice(0, 40)}.pdf`} titulo="Boleto com Pix" onClose={() => setPdf(null)} />}
    </Modal>
  );
}
