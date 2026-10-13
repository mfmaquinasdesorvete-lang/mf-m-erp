// Entregas e entregadores: quem leva cada pedido e o acerto do repasse (que vira conta paga no financeiro).
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { novoId, r2, totalPedido, type Entregador, type Estado } from "@/lib/sorveteria";

type Mudar = (f: (e: Estado) => Estado) => void;
const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : 0; };

export function Entregas({ estado, mudar }: { estado: Estado; mudar: Mudar }) {
  const [edit, setEdit] = useState<Partial<Entregador> | null>(null);
  const ativas = estado.pedidos.filter((p) => p.canal === "delivery" && p.situacao !== "cancelado" && p.producao && p.producao !== "entregue");
  const pendentes = (id: string) => estado.pedidos.filter((p) => p.entregador === id && p.producao === "entregue" && !p.acertado && p.situacao !== "cancelado");

  const atribuir = (pedidoId: string, entregador: string) =>
    mudar((e) => ({ ...e, pedidos: e.pedidos.map((p) => (p.id === pedidoId ? { ...p, entregador: entregador || null } : p)) }));

  function acertar(en: Entregador) {
    const pe = pendentes(en.id), valor = r2(pe.length * en.repasse);
    if (!pe.length || !window.confirm(`Acertar ${pe.length} entrega(s) com ${en.nome}: ${brl(valor)}?`)) return;
    const ids = new Set(pe.map((p) => p.id));
    mudar((e) => ({
      ...e, pedidos: e.pedidos.map((p) => (ids.has(p.id) ? { ...p, acertado: true } : p)),
      contas: [...e.contas, { id: novoId(), tipo: "pagar", desc: `Repasse ${en.nome} · ${pe.length} entrega(s)`, valor, venc: new Date().toISOString().slice(0, 10), pago: true, pagoEm: new Date().toISOString(), cat: "Entregadores" }],
    }));
    notify("Acerto registrado no financeiro.");
  }
  function salvar() {
    if (!edit?.nome?.trim()) return notify("Informe o nome.", "erro");
    const en: Entregador = { id: edit.id ?? novoId(), nome: edit.nome.trim(), tel: edit.tel ?? "", repasse: r2(edit.repasse ?? 0), ativo: edit.ativo ?? true };
    mudar((e) => ({ ...e, entregadores: edit.id ? e.entregadores.map((x) => (x.id === en.id ? en : x)) : [...e.entregadores, en] }));
    setEdit(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-bold">Entregas em andamento <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs">{ativas.length}</span></h2>
        <div className="space-y-2">
          {ativas.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nenhuma entrega em andamento.</p>}
          {ativas.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <b className="text-lg">#{p.numero}</b>
              <div className="min-w-0 flex-1"><b className="text-sm">{p.cliente?.nome}</b><p className="text-xs text-slate-500">{p.cliente?.endereco} {p.cliente?.bairro}</p></div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.producao === "pronto" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}`}>{p.producao === "pronto" ? "pronto p/ sair" : p.producao}</span>
              {p.situacao === "aberto" && p.pagarNaEntrega && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">receber {brl(totalPedido(p, estado.loja.gorjetaPct))}</span>}
              <select className="input w-44" aria-label={`Entregador do pedido ${p.numero}`} value={p.entregador ?? ""} onChange={(e) => atribuir(p.id, e.target.value)}>
                <option value="">Sem entregador</option>
                {estado.entregadores.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Entregadores</h2><Button type="button" onClick={() => setEdit({ ativo: true })}><Plus size={16} aria-hidden /> Entregador</Button></div>
        <Card className="divide-y divide-slate-100">
          {estado.entregadores.map((en) => {
            const pe = pendentes(en.id);
            return (
              <div key={en.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${en.ativo ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1"><b className="text-sm">{en.nome}</b><p className="text-xs text-slate-500">{en.tel} · repasse {brl(en.repasse)} por entrega</p></div>
                <span className="num text-sm"><b>{pe.length}</b> a acertar · {brl(r2(pe.length * en.repasse))}</span>
                <Button type="button" disabled={!pe.length} onClick={() => acertar(en)}>Acertar</Button>
                <Button type="button" variant="ghost" onClick={() => setEdit(en)}>Editar</Button>
              </div>
            );
          })}
          {estado.entregadores.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum entregador.</p>}
        </Card>
      </section>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar entregador" : "Novo entregador"}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nome"><input className="input" autoFocus value={edit.nome ?? ""} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="WhatsApp"><input className="input" inputMode="tel" value={edit.tel ?? ""} onChange={(e) => setEdit({ ...edit, tel: e.target.value })} /></Field>
              <Field label="Repasse por entrega (R$)"><input className="input" inputMode="decimal" value={edit.repasse ? String(edit.repasse).replace(".", ",") : ""} onChange={(e) => setEdit({ ...edit, repasse: num(e.target.value) })} /></Field>
            </div>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.ativo ?? true} onChange={(e) => setEdit({ ...edit, ativo: e.target.checked })} /> Ativo</label>}
            <div className="flex justify-end"><Button type="button" onClick={salvar}>Salvar</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
