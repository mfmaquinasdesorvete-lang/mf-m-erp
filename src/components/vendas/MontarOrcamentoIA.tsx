// "Montar com IA" no orçamento: cola a conversa do cliente (ou dita pelo 🎤 do teclado) e a função ia-orcamento devolve
// os produtos do catálogo com a quantidade e o cliente do cadastro que parece ser o dele. A pessoa marca o que usar; os
// itens entram com o preço da tabela do pedido (a IA não dá preço) e o resto vai para as observações.
import { useState } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { callFunction } from "@/lib/supabase";
import { observacaoDoPedido, type ClienteFalado, type ItemConferido } from "../../../supabase/functions/_shared/ia-orcamento";

type Achado = { id: string; nome: string; codigo: number | null; cidade: string | null; motivo: string };
type Resposta = { cliente: ClienteFalado; clientes: Achado[]; itens: ItemConferido[]; nao_achados: string[]; pagamento: string | null; observacao: string | null };
export type OrcamentoIA = { cliente_id: string | null; itens: { produto_id: string; quantidade: number }[]; observacao: string };

export function MontarOrcamentoIA({ temCliente, onAplicar, onClose }: {
  temCliente: boolean; onAplicar: (o: OrcamentoIA) => void; onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Resposta | null>(null);
  const [usar, setUsar] = useState<Set<string>>(new Set());
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [clienteId, setClienteId] = useState<string>("");
  const [comObs, setComObs] = useState(true);

  async function ler() {
    setOcupado(true); setErro(null); setR(null);
    try {
      const resp = await callFunction<Resposta>("ia-orcamento", { texto: texto.trim() });
      setR(resp);
      setUsar(new Set(resp.itens.map((i) => i.produto_id)));
      setQtd(Object.fromEntries(resp.itens.map((i) => [i.produto_id, i.quantidade])));
      // cliente já marcado só quando bate o CPF/CNPJ ou o telefone (nome parecido a pessoa escolhe)
      const certo = resp.clientes.find((c) => c.motivo !== "nome parecido");
      setClienteId(!temCliente && certo ? certo.id : "");
    } catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }

  const alternar = (id: string) => setUsar((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const obs = r ? observacaoDoPedido(r) : "";
  const falado = r ? [r.cliente.nome, r.cliente.cpf_cnpj, r.cliente.telefone, r.cliente.cidade].filter(Boolean).join(" · ") : "";

  function aplicar() {
    if (!r) return;
    onAplicar({
      cliente_id: clienteId || null,
      itens: r.itens.filter((i) => usar.has(i.produto_id)).map((i) => ({ produto_id: i.produto_id, quantidade: qtd[i.produto_id] ?? i.quantidade })),
      observacao: comObs ? obs : "",
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Montar orçamento com IA">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Cole a conversa do cliente ou escreva o que ele quer. A IA acha os produtos no catálogo e o cliente no cadastro; o preço vem da tabela do pedido.</p>
        <Field label="O que o cliente pediu">
          <textarea className="input min-h-[110px]" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={6000} autoFocus
            placeholder="Ex.: Oi, aqui é da Gelato Nobre. Quero 2 bicos estrela e 1 correia da A 200, pago no Pix" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500">No celular dá para falar: toque no campo e use o 🎤 do teclado.</p>
          <Button className="ml-auto" onClick={ler} disabled={ocupado || texto.trim().length < 6}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {ocupado ? "Lendo…" : "Ler com IA"}
          </Button>
        </div>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{erro}</p>}

        {r && (
          <div className="space-y-3" aria-live="polite">
            {!temCliente && (
              <div className="rounded-xl ring-1 ring-slate-200 p-3">
                <p className="font-semibold text-fg">Cliente</p>
                {falado && <p className="text-xs text-slate-500">Na conversa: {falado}</p>}
                {r.clientes.length === 0 ? (
                  <p className="mt-1 text-slate-600">Não achei no cadastro: escolha ou cadastre no campo Cliente.</p>
                ) : (
                  <div className="mt-1 space-y-1">
                    {r.clientes.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2">
                        <input type="radio" name="cliente-ia" checked={clienteId === c.id} onChange={() => setClienteId(c.id)} />
                        <span className="min-w-0 flex-1"><b>{c.nome}</b>{c.codigo ? ` (nº ${c.codigo})` : ""}{c.cidade ? ` · ${c.cidade}` : ""} · <span className="text-slate-500">{c.motivo}</span></span>
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                      <input type="radio" name="cliente-ia" checked={clienteId === ""} onChange={() => setClienteId("")} /> Nenhum desses
                    </label>
                  </div>
                )}
              </div>
            )}

            {!r.itens.length ? <p className="text-slate-500">A IA não achou produtos do catálogo nisso.</p> : (
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {r.itens.map((i) => (
                  <li key={i.produto_id} className="flex items-start gap-2.5 px-3 py-2">
                    <input type="checkbox" className="mt-1" aria-label={`Usar ${i.descricao}`} checked={usar.has(i.produto_id)} onChange={() => alternar(i.produto_id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold text-fg">{i.descricao}</span>
                      {i.como_pediu && <span className="block text-xs text-slate-500">Pediu: “{i.como_pediu}”</span>}
                    </span>
                    <input className="input w-16 text-right" inputMode="numeric" aria-label={`Quantidade de ${i.descricao}`}
                      value={qtd[i.produto_id] ?? i.quantidade}
                      onChange={(e) => setQtd((q) => ({ ...q, [i.produto_id]: Math.min(999, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) }))} />
                  </li>
                ))}
              </ul>
            )}

            {r.nao_achados.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Não achei no catálogo: {r.nao_achados.join("; ")}
              </p>
            )}
            {obs && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-1" checked={comObs} onChange={(e) => setComObs(e.target.checked)} />
                <span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Juntar nas observações do pedido</span>
                  <span className="block whitespace-pre-line">{obs}</span></span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={aplicar} disabled={!usar.size && !clienteId && !(comObs && obs)}>Usar no orçamento</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
