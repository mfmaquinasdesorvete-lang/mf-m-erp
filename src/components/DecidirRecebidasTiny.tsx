// Recebimentos do Tiny → "Decidir": o que veio do Tiny sem achar a venda nem o cliente fica aqui para a pessoa ligar ao
// cliente (e, se quiser, a uma venda dele) ou descartar. Cada decisão passa por decidir_recebida_tiny (só financeiro).
import { useMemo, useState } from "react";
import { CheckCircle2, Link2, Trash2 } from "lucide-react";
import { confirmar } from "@/components/Dialogos";
import { ClienteBusca } from "@/components/ClienteBusca";
import { Button, Field } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { ClienteBuscavel } from "@/lib/buscaCliente";

type Recebida = { id: string; descricao: string; valor: number; valor_pago: number | null; data_pagamento: string | null; vencimento: string };
type VendaCliente = { id: string; numero: number; numero_externo: string | null; cliente_id: string; valor_total: number; created_at: string };

export function DecidirRecebidasTiny() {
  const invalidate = useInvalidate();
  const { data: contas = [], isLoading } = useRows<Recebida>("contas_receber", {
    select: "id, descricao, valor, valor_pago, data_pagamento, vencimento", order: "data_pagamento", key: ["decidir_tiny"],
    filtro: (q) => q.like("id_externo", "tiny:cr:%").is("cliente_id", null).eq("status", "pago"),
  });
  const { data: clientes = [], isLoading: carregandoClientes } = useRows<ClienteBuscavel>("clientes", {
    select: "id, codigo, nome, nome_fantasia, cpf_cnpj, municipio, uf, email, telefone, whatsapp", order: "nome", ascending: true,
  });
  const [escolha, setEscolha] = useState<Record<string, { cliente?: string; venda?: string }>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const clientesEscolhidos = useMemo(() => [...new Set(Object.values(escolha).map((e) => e.cliente).filter(Boolean))] as string[], [escolha]);
  const { data: vendas = [] } = useRows<VendaCliente>("pedidos", {
    select: "id, numero, numero_externo, cliente_id, valor_total, created_at", key: ["decidir_tiny", ...clientesEscolhidos],
    filtro: (q) => q.in("cliente_id", clientesEscolhidos.length ? clientesEscolhidos : ["00000000-0000-0000-0000-000000000000"]),
  });

  async function decidir(c: Recebida, acao: "ligar" | "descartar") {
    const e = escolha[c.id] ?? {};
    if (acao === "descartar" && !(await confirmar(`Descartar o recebimento "${c.descricao}" de ${brl(c.valor_pago ?? c.valor)}? Ele fica cancelado e sai desta lista.`, { titulo: "Descartar recebimento", ok: "Descartar", perigo: true }))) return;
    setOcupado(c.id);
    try {
      const { error } = await supabase.rpc("decidir_recebida_tiny", { p_id: c.id, p_acao: acao, p_cliente: e.cliente ?? null, p_pedido: e.venda || null });
      if (error) throw error;
      notify(acao === "ligar" ? "Recebimento ligado ao cliente." : "Recebimento descartado.");
      setEscolha((x) => { const { [c.id]: _, ...resto } = x; return resto; });
      invalidate("contas_receber", "auditoria");
    } catch (er) { notifyError(er); } finally { setOcupado(null); }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Carregando os recebimentos para decidir…</p>;
  if (!contas.length) {
    return <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden /> Nada para decidir: todo recebimento do Tiny achou a venda ou o cliente.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        {contas.length} {pl(contas.length, "recebimento", "recebimentos")} do Tiny sem venda e sem cliente
        ({brl(contas.reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0))}). Ligue cada um ao cliente ou descarte.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {contas.map((c) => {
          const e = escolha[c.id] ?? {};
          const doCliente = e.cliente ? vendas.filter((v) => v.cliente_id === e.cliente) : [];
          return (
            <li key={c.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 font-medium text-fg">{c.descricao}</span>
                <span className="whitespace-nowrap text-sm"><b>{brl(c.valor_pago ?? c.valor)}</b> · pago em {dataBR(c.data_pagamento ?? c.vencimento)}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
                <Field label="Cliente">
                  <ClienteBusca clientes={clientes} carregando={carregandoClientes} value={e.cliente} disabled={ocupado === c.id}
                    onChange={(id) => setEscolha((x) => ({ ...x, [c.id]: { cliente: id || undefined } }))} />
                </Field>
                <Field label="Venda (opcional)">
                  <select className="input" value={e.venda ?? ""} disabled={!e.cliente || ocupado === c.id}
                    onChange={(ev) => setEscolha((x) => ({ ...x, [c.id]: { ...e, venda: ev.target.value || undefined } }))}>
                    <option value="">Sem venda</option>
                    {doCliente.map((v) => (
                      <option key={v.id} value={v.id}>
                        Nº {v.numero}{v.numero_externo ? ` (Tiny ${v.numero_externo})` : ""} · {brl(v.valor_total)} · {dataBR(v.created_at)}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex gap-2">
                  <Button type="button" disabled={!e.cliente || ocupado === c.id} onClick={() => decidir(c, "ligar")}><Link2 size={16} aria-hidden /> Ligar</Button>
                  <Button type="button" variant="ghost" disabled={ocupado === c.id} onClick={() => decidir(c, "descartar")}><Trash2 size={16} aria-hidden /> Descartar</Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
