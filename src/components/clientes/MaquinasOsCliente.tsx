// Ficha do cliente → Máquinas e OS: as máquinas dele (cadastrar, editar, histórico) e as ordens de serviço, com
// "Abrir OS" já preenchido com o cliente e a máquina. As máquinas são as mesmas da tela Garantias.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Pencil, Plus, Snowflake, Wrench } from "lucide-react";
import { Button } from "@/components/ui";
import { useRows } from "@/lib/data";
import { brl, dataBR } from "@/lib/format";
import { situacaoGarantia } from "@/lib/garantia";
import type { Equipamento } from "@/lib/types";
import { EquipamentoModal, HistoricoModal } from "@/pages/Garantias";

type OsResumo = { id: string; numero: number; cliente_id: string; equipamento: string | null; numero_serie: string | null; status: string; data_entrada: string | null; defeito_relatado: string | null; valor_total: number | null };
const GARANTIA = { em_garantia: ["Em garantia", "bg-emerald-100 text-emerald-800"], vence_logo: ["Garantia vence logo", "bg-amber-100 text-amber-800"], fora_garantia: ["Fora da garantia", "bg-slate-200 text-slate-700"] } as const;

export function MaquinasOsCliente({ clienteId, salvarAntes, podeEditar }: { clienteId: string | null; salvarAntes: () => Promise<string | null>; podeEditar: boolean }) {
  const navigate = useNavigate();
  const { data: equipamentos = [] } = useRows<Equipamento>("equipamentos", { order: "data_venda", ascending: false });
  const { data: ordens = [] } = useRows<OsResumo>("ordens_servico", { select: "id, numero, cliente_id, equipamento, numero_serie, status, data_entrada, defeito_relatado, valor_total", order: "numero", ascending: false, key: ["ficha-cliente"] });
  const [editar, setEditar] = useState<Partial<Equipamento> | null>(null);
  const [historico, setHistorico] = useState<Equipamento | null>(null);
  const maquinas = clienteId ? equipamentos.filter((e) => e.cliente_id === clienteId) : [];
  const doCliente = clienteId ? ordens.filter((o) => o.cliente_id === clienteId) : [];

  async function novaMaquina() {
    const id = clienteId ?? (await salvarAntes());
    if (id) setEditar({ cliente_id: id });
  }
  async function abrirOS(e?: Equipamento) {
    const id = clienteId ?? (await salvarAntes());
    if (!id) return;
    navigate("/assistencia", { state: { novaOS: e
      ? { cliente_id: id, produto_id: e.produto_id, equipamento_id: e.id, equipamento: e.descricao, numero_serie: e.numero_serie, em_garantia: situacaoGarantia(e.garantia_ate) !== "fora_garantia", maquina_origem: e.origem ?? null }
      : { cliente_id: id } } });
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-semibold text-fg"><Snowflake size={16} /> Máquinas do cliente ({maquinas.length})</h4>
          {podeEditar && <Button type="button" variant="secondary" onClick={novaMaquina}><Plus size={15} /> Cadastrar máquina</Button>}
        </div>
        {!maquinas.length ? <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">Nenhuma máquina ligada a este cliente. As vendas aprovadas entram sozinhas; as antigas, cadastre aqui.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {maquinas.map((e) => {
              const g = GARANTIA[situacaoGarantia(e.garantia_ate) as keyof typeof GARANTIA] ?? GARANTIA.fora_garantia;
              return (
                <li key={e.id} className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><b className="block truncate">{e.descricao}</b>
                      <span className="text-xs text-slate-500">{e.numero_serie ? `Série ${e.numero_serie} · ` : ""}{e.data_venda ? `comprada em ${dataBR(e.data_venda)}` : "sem data"}{e.origem ? ` · ${e.origem}` : ""}</span></div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-bold ${g[1]}`}>{g[0]}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button type="button" variant="ghost" className="!min-h-0 !py-1 text-xs" onClick={() => abrirOS(e)}><Wrench size={13} /> Abrir OS</Button>
                    <Button type="button" variant="ghost" className="!min-h-0 !py-1 text-xs" onClick={() => setHistorico(e)}><History size={13} /> Histórico</Button>
                    {podeEditar && <Button type="button" variant="ghost" className="!min-h-0 !py-1 text-xs" onClick={() => setEditar(e)}><Pencil size={13} /> Editar</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-semibold text-fg"><Wrench size={16} /> Ordens de serviço ({doCliente.length})</h4>
          <Button type="button" variant="secondary" onClick={() => abrirOS()}><Plus size={15} /> Nova OS</Button>
        </div>
        {!doCliente.length ? <p className="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">Nenhuma OS deste cliente ainda.</p> : (
          <ul className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200">
            {doCliente.map((o) => (
              <li key={o.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-slate-50" onClick={() => navigate("/assistencia", { state: { abrir: o.id } })}>
                  <span className="min-w-0"><b>OS #{o.numero}</b> · {o.equipamento ?? "—"}{o.data_entrada ? ` · ${dataBR(o.data_entrada)}` : ""}
                    {o.defeito_relatado && <span className="block truncate text-xs text-slate-500">{o.defeito_relatado}</span>}</span>
                  <span className="shrink-0 text-right text-xs"><span className="rounded-md bg-slate-200 px-2 py-0.5 font-semibold capitalize text-slate-700">{o.status.replace(/_/g, " ")}</span>
                    {o.valor_total ? <span className="num mt-0.5 block text-slate-500">{brl(o.valor_total)}</span> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editar && <EquipamentoModal inicial={editar} onClose={() => setEditar(null)} />}
      {historico && <HistoricoModal equipamento={historico} onClose={() => setHistorico(null)} />}
    </div>
  );
}
