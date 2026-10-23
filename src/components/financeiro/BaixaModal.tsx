// Registrar pagamento/recebimento: valor total, com juros/multa, com desconto ou parcial (o restante vira uma
// nova conta em aberto, ligada a esta). Tudo fica no histórico com o motivo. Paga depois do vencimento: mostra a multa e os
// juros (os do boleto, ou 2% + 1% ao mês) e põe o valor corrigido com um toque.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { calcularEncargos } from "@/lib/boleto";
import { aguardaAprovacao } from "@/lib/programacao";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, hoje, somarDias } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";

type ContaBancaria = { id: string; nome: string; unidade_id: string; ativo: boolean };

export function BaixaModal({ conta, tabela, onClose, valorInicial, dataInicial }: {
  conta: { id: string; descricao: string; valor: number; vencimento?: string; unidade_id?: string | null;
    boleto_multa_pct?: number | null; boleto_juros_mes_pct?: number | null; boleto_juros_dia?: number | null; revisao?: string | null };
  tabela: "contas_receber" | "contas_pagar"; onClose: () => void; valorInicial?: number; dataInicial?: string;
}) {
  const receber = tabela === "contas_receber";
  const [data, setData] = useState(dataInicial ?? hoje());
  const [valor, setValor] = useState(String(valorInicial ?? conta.valor));
  const [modo, setModo] = useState<"parcial" | "desconto">("parcial");
  const [restanteEm, setRestanteEm] = useState(conta.vencimento && conta.vencimento > hoje() ? conta.vencimento : somarDias(7));
  const { data: bancos = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  const daUnidade = bancos.filter((b) => b.ativo && (!conta.unidade_id || b.unidade_id === conta.unidade_id));
  const [banco, setBanco] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();
  const v = Number(valor) || 0;
  const diferenca = Math.round((Number(conta.valor) - v) * 100) / 100;
  const enc = conta.vencimento && data ? calcularEncargos(Number(conta.valor), conta.vencimento, data,
    { multaPct: conta.boleto_multa_pct ?? 2, jurosMesPct: conta.boleto_juros_mes_pct ?? 1, jurosDia: conta.boleto_juros_dia }) : null;

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("baixar_conta", {
        p_tabela: tabela, p_id: conta.id, p_data: data, p_valor: v, p_conta_bancaria: banco || null,
        p_restante_vencimento: diferenca > 0 && modo === "parcial" ? restanteEm : null,
      });
      if (error) throw error;
      notify(diferenca > 0 && modo === "parcial" ? `Baixa parcial registrada; ${brl(diferenca)} continuam em aberto` : "Baixa registrada");
      invalidate(tabela, "saldos_bancarios", "movimentos_realizados");
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }

  // conta a pagar sem a aprovação do fluxo: o banco recusa a baixa; avisa antes de preencher
  if (!receber && aguardaAprovacao({ ...conta, vencimento: conta.vencimento ?? "", status: "aberto" })) {
    return (
      <Modal open onClose={onClose} title={`Registrar pagamento — ${conta.descricao}`}>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Esta conta ainda não foi aprovada. O pagamento só pode ser registrado depois da aprovação.</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Link to="/aprovacoes" onClick={onClose} className="inline-flex min-h-toque items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg sm:min-h-0 sm:py-2">Abrir Aprovações</Link>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`${receber ? "Registrar recebimento" : "Registrar pagamento"} — ${conta.descricao}`}>
      <form onSubmit={confirmar} className="grid grid-cols-2 gap-3">
        <Field label={receber ? "Data do recebimento" : "Data do pagamento"}><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Field>
        <Field label={`Valor ${receber ? "recebido" : "pago"} (a conta é de ${brl(conta.valor)})`}>
          <input className="input" type="number" step="0.01" min={0.01} value={valor} onChange={(e) => setValor(e.target.value)} required />
        </Field>
        {enc && enc.dias > 0 && (
          <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="mr-auto">
              {enc.dias} {enc.dias === 1 ? "dia" : "dias"} de atraso: multa {brl(enc.multa)} + juros {brl(enc.juros)} = <b className="num">{brl(enc.total)}</b>
              <span className="block text-xs opacity-80">{conta.boleto_multa_pct != null || conta.boleto_juros_mes_pct != null || conta.boleto_juros_dia != null ? "multa e juros do boleto" : "multa de 2% e juros de 1% ao mês (padrão)"}</span>
            </span>
            {Math.abs(v - enc.total) > 0.005 && <Button type="button" variant="secondary" onClick={() => setValor(enc.total.toFixed(2))}>Usar {brl(enc.total)}</Button>}
          </div>
        )}
        {diferenca > 0 && (
          <fieldset className="col-span-2 space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <legend className="px-1 text-xs font-semibold text-slate-600">Faltam {brl(diferenca)}. O que fazer com a diferença?</legend>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={modo === "parcial"} onChange={() => setModo("parcial")} />
              <span><b>{receber ? "Recebimento" : "Pagamento"} parcial</b>: os {brl(diferenca)} continuam em aberto, numa conta nova que vence em
                <input type="date" className="input ml-1 inline-block w-auto py-1" value={restanteEm} onChange={(e) => setRestanteEm(e.target.value)} required={modo === "parcial"} disabled={modo !== "parcial"} />
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={modo === "desconto"} onChange={() => setModo("desconto")} />
              <span><b>Desconto</b>: a conta fica quitada com {brl(diferenca)} de desconto.</span>
            </label>
          </fieldset>
        )}
        {diferenca < 0 && <p className="col-span-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{brl(-diferenca)} a mais: fica registrado como juros/multa.</p>}
        <Field label={receber ? "Entrou em qual conta?" : "Saiu de qual conta?"} className="col-span-2">
          <select className="input" value={banco} onChange={(e) => setBanco(e.target.value)} required={daUnidade.length > 0}>
            <option value="">{daUnidade.length ? "Escolha a conta…" : "— (cadastre as contas em Bancos e conciliação)"}</option>
            {daUnidade.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </Field>
        <p className="col-span-2 text-xs text-slate-500">Anexe o comprovante em <b>Anexos</b> na própria conta. Importando o extrato em <b>Bancos e conciliação</b>, a baixa é feita sozinha com a data e o valor do banco.</p>
        <div className="col-span-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={ocupado}>{ocupado ? "Registrando…" : "Confirmar baixa"}</Button>
        </div>
      </form>
    </Modal>
  );
}
