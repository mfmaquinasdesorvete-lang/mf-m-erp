// No pedido, logo abaixo do cliente (como no Tiny): o que falta no cadastro (endereço, documento…) com "arrumar" ali mesmo,
// dados do cliente, últimas vendas, limite de crédito e a ficha 360, sem sair da venda.
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { FichaCliente } from "@/components/FichaCliente";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje } from "@/lib/format";
import { buscarCep } from "@/lib/cep";
import { creditoDoCliente, pendenciasDoCliente } from "@/lib/pendenciasCliente";
import type { Cliente } from "@/lib/types";

type Painel = "dados" | "vendas" | "credito" | "ficha" | null;
const ROTULO: Record<string, string> = { orcamento: "orçamento", aprovado: "aprovado", faturado: "faturado", entregue: "entregue", cancelado: "cancelado" };

export function AtalhosCliente({ cliente, pedidoId, podeEditar }: { cliente: Cliente; pedidoId?: string; podeEditar: boolean }) {
  const [aberto, setAberto] = useState<Painel>(null);
  const pend = pendenciasDoCliente(cliente);
  const graves = pend.filter((p) => p.grave);
  const link = "link-acao";
  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <button type="button" className={link} onClick={() => setAberto("dados")}>dados do cliente</button>
        <button type="button" className={link} onClick={() => setAberto("vendas")}>últimas vendas</button>
        <button type="button" className={link} onClick={() => setAberto("credito")}>limite de crédito</button>
        <button type="button" className={link} onClick={() => setAberto("ficha")}>ficha 360</button>
      </div>
      {pend.length > 0 && (
        <button type="button" onClick={() => setAberto("dados")}
          className={`flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs ${graves.length ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span><b>{graves.length ? "Arrumar antes da nota/entrega:" : "Cadastro incompleto:"}</b> {pend.map((p) => p.texto).join(", ")} · <u>arrumar</u></span>
        </button>
      )}
      {aberto === "dados" && <DadosCliente cliente={cliente} podeEditar={podeEditar} onClose={() => setAberto(null)} />}
      {aberto === "vendas" && <UltimasVendas cliente={cliente} pedidoId={pedidoId} onClose={() => setAberto(null)} />}
      {aberto === "credito" && <Credito cliente={cliente} onClose={() => setAberto(null)} />}
      {aberto === "ficha" && <FichaCliente cliente={cliente} onClose={() => setAberto(null)} />}
    </div>
  );
}

const CAMPOS: [keyof Cliente, string, string?][] = [
  ["cpf_cnpj", "CPF/CNPJ"], ["inscricao_estadual", "Inscrição estadual"], ["cep", "CEP", "numeric"], ["logradouro", "Rua"], ["numero", "Número"],
  ["complemento", "Complemento"], ["bairro", "Bairro"], ["municipio", "Cidade"], ["uf", "UF"], ["whatsapp", "WhatsApp", "tel"], ["telefone", "Telefone", "tel"], ["email", "E-mail", "email"],
];

/** Dados do cliente para conferir e arrumar ali mesmo (CEP preenche rua, bairro e cidade). */
function DadosCliente({ cliente, podeEditar, onClose }: { cliente: Cliente; podeEditar: boolean; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [c, setC] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS.map(([k]) => [k, String(cliente[k] ?? "")])));
  const [gravando, setGravando] = useState(false);
  const faltam = new Set(pendenciasDoCliente({ ...cliente, ...c }).map((p) => p.campo));
  const pend = pendenciasDoCliente({ ...cliente, ...c });
  async function cep(v: string) {
    setC((x) => ({ ...x, cep: v }));
    if (v.replace(/\D/g, "").length !== 8) return;
    const e = await buscarCep(v);
    if (e) setC((x) => ({ ...x, logradouro: x.logradouro || e.logradouro || "", bairro: x.bairro || e.bairro || "", municipio: e.municipio || x.municipio, uf: e.uf || x.uf }));
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setGravando(true);
    const mudou = Object.fromEntries(CAMPOS.map(([k]) => [k, c[k as string].trim() || null]).filter(([k, v]) => (cliente[k as keyof Cliente] ?? null) !== v));
    const { error } = Object.keys(mudou).length ? await supabase.from("clientes").update(mudou).eq("id", cliente.id) : { error: null };
    setGravando(false);
    if (error) return notifyError(error);
    notify(Object.keys(mudou).length ? "Cadastro do cliente atualizado" : "Nada mudou");
    invalidate("clientes");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`Dados do cliente · ${cliente.nome}`}>
      <form onSubmit={salvar} className="space-y-3">
        {pend.length ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"><b>Falta:</b> {pend.map((p) => p.texto).join(", ")}. Os campos estão marcados abaixo.</p>
        ) : <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} aria-hidden /> Cadastro completo para a nota e a entrega.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAMPOS.map(([k, rotulo, tipo]) => (
            <Field key={k} label={rotulo}>
              <input className={`input ${faltam.has(k as string) ? "ring-2 ring-amber-400" : ""}`} value={c[k as string]} disabled={!podeEditar}
                inputMode={tipo === "numeric" ? "numeric" : undefined} type={tipo === "email" ? "email" : tipo === "tel" ? "tel" : "text"}
                maxLength={k === "uf" ? 2 : 200} onChange={(e) => (k === "cep" ? void cep(e.target.value) : setC((x) => ({ ...x, [k]: k === "uf" ? e.target.value.toUpperCase() : e.target.value })))} />
            </Field>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          {podeEditar && <Button type="submit" disabled={gravando}>{gravando ? "Gravando…" : "Salvar no cadastro"}</Button>}
        </div>
      </form>
    </Modal>
  );
}

export function UltimasVendas({ cliente, pedidoId, onClose }: { cliente: Cliente; pedidoId?: string; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pedidos", "ultimas", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("id, numero, created_at, status, valor_total, itens:pedido_itens(descricao, quantidade)")
        .eq("cliente_id", cliente.id).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as { id: string; numero: number; created_at: string; status: string; valor_total: number; itens: { descricao: string; quantidade: number }[] }[];
    },
  });
  const outras = data.filter((v) => v.id !== pedidoId);
  return (
    <Modal open onClose={onClose} title={`Últimas vendas · ${cliente.nome}`}>
      {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : !outras.length ? <p className="text-sm text-slate-600">Primeira compra deste cliente.</p> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {outras.map((v) => (
            <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
              <span className="font-bold text-fg">#{v.numero}</span>
              <span className="text-slate-500">{dataBR(v.created_at.slice(0, 10))} · {ROTULO[v.status] ?? v.status}</span>
              <span className="num ml-auto font-semibold">{brl(Number(v.valor_total))}</span>
              <span className="w-full truncate text-xs text-slate-500">{(v.itens ?? []).map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Credito({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["contas_receber", "credito", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_receber").select("descricao, valor, vencimento").eq("cliente_id", cliente.id).eq("status", "aberto").order("vencimento");
      if (error) throw error;
      return (data ?? []) as { descricao: string; valor: number; vencimento: string }[];
    },
  });
  const cr = creditoDoCliente(cliente.limite_credito, data, hoje());
  const caixa = (rotulo: string, valor: string, cor = "text-fg") => (
    <div className="rounded-lg bg-surface p-3 ring-1 ring-slate-200"><span className="block text-xs text-slate-600">{rotulo}</span><span className={`num text-lg font-bold ${cor}`}>{valor}</span></div>
  );
  return (
    <Modal open onClose={onClose} title={`Crédito · ${cliente.nome}`}>
      {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {caixa("Limite", cr.limite == null ? "sem limite" : brl(cr.limite))}
            {caixa("Em aberto", brl(cr.aberto))}
            {caixa("Vencido", brl(cr.vencido), cr.vencido ? "text-red-600" : "text-emerald-700")}
            {caixa("Disponível", cr.disponivel == null ? "—" : brl(cr.disponivel), cr.disponivel === 0 ? "text-red-600" : "text-emerald-700")}
          </div>
          {cliente.condicao_pagamento && <p className="text-sm text-slate-600">Condição combinada: <b>{cliente.condicao_pagamento}</b></p>}
          {data.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {data.map((c, i) => (
                <li key={i} className="flex gap-3 px-3 py-2"><span className="min-w-0 flex-1 truncate">{c.descricao}</span>
                  <span className={`num ${c.vencimento < hoje() ? "font-semibold text-red-600" : "text-slate-500"}`}>{dataBR(c.vencimento)}</span>
                  <span className="num font-semibold">{brl(Number(c.valor))}</span></li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">O limite muda no cadastro do cliente (aba Financeiro).</p>
        </div>
      )}
    </Modal>
  );
}
