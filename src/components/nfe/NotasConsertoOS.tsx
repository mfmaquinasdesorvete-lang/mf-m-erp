// OS de oficina → aba Notas: as NF-e da máquina que veio para conserto. Mostra a nota de entrada (a remessa do cliente
// com IE, ou a entrada que a MF emite por quem não tem IE) e a nota de volta (retorno de conserto 5916/6916), avisa quando
// a volta saiu como venda e abre a nota direta já preenchida (operação, cliente, máquina, série, valor e a chave da entrada).
// A regra fica em lib/consertoOS.ts.
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, FileInput, FileOutput } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { EmitirNfeModal, type InicialNota } from "@/components/EmitirNfe";
import { useRows } from "@/lib/data";
import { brl } from "@/lib/format";
import { notasDoConserto, type ClienteFiscal, type NotaMF, type NotaRecebida } from "@/lib/consertoOS";

type OSConserto = {
  id?: string; numero?: number | null; cliente_id?: string | null; produto_id?: string | null; equipamento?: string | null; numero_serie?: string | null;
  data_entrada?: string | null; created_at?: string | null; unidade_id?: string | null;
};

export function NotasConsertoOS({ os, cliente }: { os: OSConserto; cliente?: ClienteFiscal & { id: string; nome?: string | null; cpf_cnpj?: string | null } }) {
  const doc = (cliente?.cpf_cnpj ?? "").replace(/\D/g, "");
  const { data: emitidas = [], error: e1 } = useRows<NotaMF>("notas_fiscais", {
    select: "id, numero, chave, status, tipo_operacao, created_at, valor_total, payload, itens", key: ["conserto", os.cliente_id],
    filtro: (q) => q.eq("cliente_id", os.cliente_id).is("excluida_em", null), enabled: !!os.cliente_id,
  });
  const { data: recebidas = [], error: e2 } = useRows<NotaRecebida>("nfe_recebidas", {
    select: "id, chave, data_emissao, valor_total, itens", order: "data_emissao", key: ["conserto", doc],
    filtro: (q) => q.eq("emitente_cnpj", doc).is("excluida_em", null), enabled: !!doc,
  });
  const { data: produto } = useRows<{ id: string; preco_venda: number }>("produtos", {
    select: "id, preco_venda", key: ["conserto", os.produto_id], filtro: (q) => q.eq("id", os.produto_id), enabled: !!os.produto_id,
  });
  const [abrir, setAbrir] = useState<InicialNota | null>(null);
  if (!cliente || !os.cliente_id) return null;

  const r = notasDoConserto({ dataEntrada: (os.data_entrada ?? os.created_at ?? "").slice(0, 10), cliente, produtoId: os.produto_id, emitidas, recebidas });
  const entrada = r.entradas[0];
  const serie = os.numero_serie ? `, série ${os.numero_serie}` : "";
  const item = (valor: number) => [{ produto_id: os.produto_id ?? "", descricao: os.equipamento ?? "Máquina do cliente", quantidade: 1, valor_unitario: valor, numero_serie: os.numero_serie ?? null }];
  const valorMaquina = entrada?.valor || Number(produto?.[0]?.preco_venda ?? 0);
  const base = { unidade_id: os.unidade_id ?? null, cliente_id: os.cliente_id };
  const notaEntrada = () => setAbrir({ ...base, operacao: "entrada_conserto", itens: item(valorMaquina),
    obs: `Máquina do cliente recebida para conserto (OS #${os.numero ?? ""}${serie}). Retorna ao cliente com NF de retorno de conserto.` });
  const notaVolta = () => setAbrir({ ...base, operacao: "retorno_conserto", itens: item(valorMaquina), chave: entrada?.chave,
    obs: `Retorno da máquina do cliente após conserto (OS #${os.numero ?? ""}${serie}).${entrada ? ` NF de entrada: ${entrada.rotulo}.` : ""}` });

  const linha = (ok: boolean, titulo: string, texto: string) => (
    <li className="flex gap-2">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden /> : <CircleDashed size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />}
      <span><b className="text-fg">{titulo}</b> <span className="text-slate-600">{texto}</span></span>
    </li>
  );

  return (
    <Card className="mt-4 p-4">
      <p className="mb-1 font-bold text-fg">Notas da máquina (conserto)</p>
      <p className="mb-3 text-xs text-slate-500">A máquina é do cliente: entra e volta com nota, sem ICMS de venda. O conserto é cobrado à parte (serviço na nota de serviço acima e peça vendida em NF-e de venda).</p>
      {(e1 || e2) && <p className="mb-2 text-sm text-red-700">Não consegui ler as notas deste cliente.</p>}
      <ul className="space-y-2 text-sm">
        {linha(!!entrada, "1. Nota de entrada:", entrada ? `${entrada.rotulo} · ${brl(entrada.valor)}.`
          : r.emiteCliente ? "o cliente tem inscrição estadual, então é ele que emite a NF de remessa para conserto (CFOP 5915/6915) para a MF; ela chega sozinha em NF-e recebidas."
          : "o cliente não tem inscrição estadual: a MF emite a nota de entrada (CFOP 1915/2915).")}
        {linha(r.retorno.length > 0, "2. Nota de volta:", r.retorno.length ? `NF ${r.retorno.map((n) => n.numero).join(", ")} (retorno de conserto).`
          : "retorno de conserto (CFOP 5916/6916), citando a nota de entrada, com o mesmo valor da máquina.")}
      </ul>
      {r.comoVenda.length > 0 && (
        <p className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>A NF {r.comoVenda.map((n) => n.numero).join(", ")} desta máquina saiu como <b>venda</b> (CFOP 5101/5102), e não como retorno de conserto: ela conta como faturamento e
            tem ICMS e PIS/COFINS. Até 24 horas, cancele a nota. Depois disso, fale com o contador (cancelamento fora do prazo ou NF de estorno) antes de emitir o retorno.</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.passo === "emitir_retorno" && <Button type="button" onClick={notaVolta}><FileOutput size={16} aria-hidden /> Emitir a nota de volta</Button>}
        {(r.passo === "emitir_entrada" || r.passo === "pedir_remessa_cliente") && (
          <Button type="button" variant={r.passo === "emitir_entrada" ? "primary" : "secondary"} onClick={notaEntrada}>
            <FileInput size={16} aria-hidden /> {r.passo === "emitir_entrada" ? "Emitir a nota de entrada" : "O cliente não emitiu: emitir a entrada pela MF"}
          </Button>
        )}
      </div>
      {abrir && <EmitirNfeModal inicial={abrir} onClose={() => setAbrir(null)} />}
    </Card>
  );
}

