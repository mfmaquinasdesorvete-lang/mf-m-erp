// Conferir a NF-e antes de emitir: a nota não vai sozinha para a SEFAZ. Mostra os itens do pedido e deixa mudar a
// descrição, a quantidade e o valor de cada um, o desconto, o frete e o texto da nota; só ao apertar "Emitir" ela é
// enviada. Os ajustes valem só para a nota (o pedido e o financeiro não mudam: se o total ficar diferente, avisa).
import { preencherTextoNfe } from "../../../supabase/functions/_shared/textoNfe";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { faturamentoDoPedido, MOTIVOS_NOTA_MENOR, problemaIeDestinatario } from "../../../supabase/functions/_shared/nfe-ajustes";

type Item = { id: string; descricao: string; quantidade: number; valor_unitario: number; numero_serie?: string | null };
type PedidoNfe = {
  id: string; numero: number; valor_total: number; desconto: number; frete: number; observacoes: string | null;
  cliente?: { nome: string; nome_fantasia?: string | null; cpf_cnpj: string | null; inscricao_estadual: string | null; contribuinte_icms: number | null; tipo_pessoa: string | null } | null; unidade?: { informacoes_complementares?: string | null; telefone?: string | null; whatsapp?: string | null } | null; vendedor?: string | null; forma_pagamento?: string | null; itens: Item[];
};

const num = (v: string) => Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

const camposDoPedido = (p: PedidoNfe) => ({
  pedido: p.numero, vendedor: p.vendedor, forma_pagamento: p.forma_pagamento,
  telefone: p.unidade?.whatsapp || p.unidade?.telefone, cliente: p.cliente?.nome_fantasia || p.cliente?.nome,
});

export function ConferirNfe({ pedidoId, onClose, onEmitida }: { pedidoId: string; onClose: () => void; onEmitida?: () => void }) {
  const [p, setP] = useState<PedidoNfe | null>(null);
  const [itens, setItens] = useState<{ id: string; descricao: string; quantidade: string; valor: string }[]>([]);
  const [desconto, setDesconto] = useState("0");
  const [frete, setFrete] = useState("0");
  const [info, setInfo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState("");
  // entrega parcial: o que já tem NF-e autorizada; esta nota é do restante
  const [jaEmitido, setJaEmitido] = useState(0);

  useEffect(() => {
    supabase.from("notas_fiscais").select("status, ambiente, valor_total").eq("pedido_id", pedidoId).then(({ data, error }) => {
      if (error) return notifyError(error);
      setJaEmitido(faturamentoDoPedido(0, data ?? []).jaEmitido);
    });
    supabase.from("pedidos").select("id, numero, valor_total, desconto, frete, observacoes, vendedor, forma_pagamento, cliente:clientes(nome, nome_fantasia, cpf_cnpj, inscricao_estadual, contribuinte_icms, tipo_pessoa), unidade:unidades(informacoes_complementares, telefone, whatsapp), " +
      "itens:pedido_itens(id, descricao, quantidade, valor_unitario, numero_serie)").eq("id", pedidoId).single()
      .then(({ data, error }) => {
        if (error) return notifyError(error);
        const d = data as unknown as PedidoNfe;
        setP(d);
        setItens(d.itens.map((i) => ({ id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), valor: String(i.valor_unitario).replace(".", ",") })));
        setDesconto(String(d.desconto ?? 0).replace(".", ","));
        setFrete(String(d.frete ?? 0).replace(".", ","));
        setInfo([`Pedido #${d.numero}`, d.observacoes, preencherTextoNfe(d.unidade?.informacoes_complementares, camposDoPedido(d))].filter(Boolean).join(" - "));
      });
  }, [pedidoId]);

  const total = useMemo(() => r2(itens.reduce((s, i) => s + num(i.quantidade) * num(i.valor), 0) - num(desconto) + num(frete)), [itens, desconto, frete]);
  // a conta é contra o que falta faturar (o pedido todo, se ainda não tem NF-e)
  const base = p ? Math.max(0, r2(Number(p.valor_total) - jaEmitido)) : 0;
  const mudou = !!p && !jaEmitido && Math.abs(total - base) > 0.009;
  // nota menor que a venda: só nos casos que a lei permite, com o motivo registrado no pedido
  const menor = !!p && total < base - 0.009;
  const passou = !!p && jaEmitido > 0 && total > base + 0.009;
  // IE errada = recusa certa da SEFAZ: avisa aqui, antes de gastar um envio
  const problemaIe = p?.cliente ? problemaIeDestinatario(p.cliente.cpf_cnpj, p.cliente.inscricao_estadual, p.cliente.tipo_pessoa === "PJ" && Number(p.cliente.contribuinte_icms) === 1) : null;
  const set = (k: number, campo: "descricao" | "quantidade" | "valor", v: string) => setItens((l) => l.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));

  async function emitir() {
    if (!p) return;
    if (itens.some((i) => !(num(i.quantidade) > 0) || num(i.valor) < 0 || !i.descricao.trim())) return notify("Confira os itens: descrição, quantidade maior que zero e valor", "erro");
    if (menor && !motivo) return notify("A NF-e ficou menor que o pedido: escolha o motivo", "erro");
    if (passou) return notify(`A NF-e passa do que falta faturar (${brl(base)}): ajuste os itens`, "erro");
    setEnviando(true);
    try {
      if (!(await confirmarSeTeste())) return;
      const ajustes = {
        itens: itens.map((i) => ({ id: i.id, descricao: i.descricao.trim(), quantidade: num(i.quantidade), valor_unitario: num(i.valor) })),
        desconto: num(desconto), frete: num(frete), informacoes: info, motivo: menor ? motivo : undefined,
      };
      await callFunction("nfe-emitir", { pedido_id: p.id, ajustes });
      notify("NF-e enviada para a SEFAZ. Acompanhe em Notas fiscais.");
      onEmitida?.();
      onClose();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }

  return (
    <Modal open onClose={onClose} title={p ? `Conferir a NF-e do pedido #${p.numero}` : "Conferir a NF-e"} wide>
      {!p ? <p className="py-6 text-center text-slate-500">Carregando…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">A nota só vai para a SEFAZ quando você apertar <b>Emitir NF-e</b>. Confira e ajuste o que precisar
            {p.cliente?.nome ? <> · cliente <b>{p.cliente.nome}</b></> : null}.</p>
          {jaEmitido > 0 && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Este pedido já tem NF-e de <b>{brl(jaEmitido)}</b> (entrega parcial). Esta nota é do restante: <b>{brl(base)}</b>.
              Deixe só os itens que faltam sair, com as quantidades que faltam.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="p-2">Descrição na nota</th><th className="w-24 p-2">Qtd.</th><th className="w-32 p-2">Valor unit.</th><th className="w-28 p-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="p-2"><input className="input" value={i.descricao} onChange={(e) => set(k, "descricao", e.target.value)} aria-label={`Descrição do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input text-right" inputMode="decimal" value={i.quantidade} onChange={(e) => set(k, "quantidade", e.target.value)} aria-label={`Quantidade do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input text-right" inputMode="decimal" value={i.valor} onChange={(e) => set(k, "valor", e.target.value)} aria-label={`Valor do item ${k + 1}`} /></td>
                    <td className="p-2 text-right font-semibold">{brl(num(i.quantidade) * num(i.valor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Desconto (R$)"><input className="input text-right" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} /></Field>
            <Field label="Frete (R$)"><input className="input text-right" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></Field>
            <div className="rounded-xl bg-slate-50 p-3 text-right">
              <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Total da nota</span>
              <span className="text-xl font-extrabold text-fg">{brl(total)}</span>
            </div>
          </div>
          <Field label="Informações complementares (vão impressas na nota)">
            <textarea className="input min-h-[70px]" value={info} onChange={(e) => setInfo(e.target.value)} />
          </Field>
          {problemaIe && (
            <p className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>Antes de emitir: {problemaIe}. Em Clientes, abra o cadastro e toque na lupa ao lado de Inscrição estadual.</span>
            </p>
          )}
          {menor && (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p>A NF-e precisa mostrar o valor real da venda. Nota abaixo do valor vendido só nos casos abaixo,
                e o motivo fica registrado nas ocorrências do pedido. Fora disso é crime contra a ordem tributária (Lei 8.137/1990, art. 1º).</p>
              <Field label="Motivo da nota menor que o pedido">
                <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="">Escolha…</option>
                  {Object.entries(MOTIVOS_NOTA_MENOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
          {passou && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">A nota ({brl(total)}) passa do que falta faturar ({brl(base)}): tire os itens que já saíram na outra NF-e.</p>}
          {mudou && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>O total da nota ({brl(total)}) ficou diferente do pedido ({brl(Number(p.valor_total))}). O pedido e as parcelas do financeiro não mudam sozinhos.
                A nota precisa mostrar o valor real da venda: se o preço mudou, ajuste também o pedido.</span>
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={emitir} disabled={enviando || (menor && !motivo) || passou || !!problemaIe}><FileText size={16} /> {enviando ? "Enviando…" : "Emitir NF-e"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
