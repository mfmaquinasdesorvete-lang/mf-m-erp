// Cadastros → Formas de pagamento (como no Tiny): nome, meio, condição (parcelas, intervalo, 1º vencimento) e custo
// (taxa % e tarifa por parcela). As vendas e as contas fixas escolhem daqui.
import { CrudPage, type FiltroCrud } from "@/components/CrudPage";
import { useRows } from "@/lib/data";
import { MEIOS, condicao, type FormaPagamento } from "@/lib/formasPagamento";
import { brl } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const FILTROS: FiltroCrud<FormaPagamento>[] = [
  { label: "Situação", opcoes: [{ label: "Ativas", teste: (r) => r.ativo }, { label: "Inativas", teste: (r) => !r.ativo }] },
  { label: "Uso", opcoes: [{ label: "Recebimento (vendas)", teste: (r) => r.uso !== "pagar" }, { label: "Pagamento (contas a pagar)", teste: (r) => r.uso !== "receber" }] },
  { label: "Meio", valor: (r) => MEIOS.find(([k]) => k === r.meio)?.[1] ?? r.meio },
];

async function situacao(ids: string[], ativo: boolean) {
  const { error } = await supabase.from("formas_pagamento").update({ ativo }).in("id", ids);
  if (error) throw error;
  return `${ids.length} forma(s) ${ativo ? "ativada(s)" : "inativada(s)"}`;
}

export default function FormasPagamento() {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { data: contas = [] } = useRows<{ id: string; nome: string }>("contas_bancarias", { order: "nome", ascending: true });
  return (
    <CrudPage<FormaPagamento>
      title="Formas de pagamento"
      table="formas_pagamento"
      plural="formas de pagamento"
      order="ordem"
      readOnly={!podeEditar}
      filtros={FILTROS}
      acoesLote={podeEditar ? [{ label: "Inativar", executar: (ids) => situacao(ids, false) }, { label: "Ativar", executar: (ids) => situacao(ids, true) }] : []}
      defaults={{ nome: "", meio: "pix", uso: "ambos", parcelas: 1, intervalo_dias: 30, primeiro_em_dias: 0, taxa_percentual: 0, tarifa_fixa: 0, ativo: true, ordem: 100 }}
      searchKeys={["nome", "meio", "observacoes"]}
      beforeSave={(r) => ({
        ...r, nome: String(r.nome ?? "").trim(), conta_bancaria_id: r.conta_bancaria_id || null,
        ...Object.fromEntries(["parcelas", "intervalo_dias", "primeiro_em_dias", "taxa_percentual", "tarifa_fixa", "ordem"].map((k) => [k, r[k] === "" || r[k] == null ? 0 : Number(String(r[k]).replace(",", "."))])),
      })}
      fields={[
        { name: "nome", label: "Nome (como aparece na venda)", required: true, placeholder: "Ex.: Boleto 30/60/90", span: 2 },
        { name: "meio", label: "Meio", type: "select", options: MEIOS.map(([value, label]) => ({ value, label })) },
        { name: "uso", label: "Usar em", type: "select", options: [{ value: "ambos", label: "Vendas e contas a pagar" }, { value: "receber", label: "Só vendas / recebimentos" }, { value: "pagar", label: "Só contas a pagar" }] },
        { name: "c", label: "Condição", type: "secao" },
        { name: "parcelas", label: "Parcelas", type: "number", span: 1 },
        { name: "intervalo_dias", label: "Intervalo entre parcelas (dias)", type: "number", span: 1 },
        { name: "primeiro_em_dias", label: "1º vencimento em (dias; 0 = à vista)", type: "number", span: 2 },
        { name: "t", label: "Custo (entra na margem)", type: "secao" },
        { name: "taxa_percentual", label: "Taxa (%)", type: "number", span: 1, ajuda: "Ex.: cartão 3,5%" },
        { name: "tarifa_fixa", label: "Tarifa por parcela (R$)", type: "number", span: 1, ajuda: "Ex.: boleto R$ 2,50" },
        { name: "conta_bancaria_id", label: "Cai na conta", type: "select", span: 2, options: [{ value: "", label: "—" }, ...contas.map((c) => ({ value: c.id, label: c.nome }))] },
        { name: "ordem", label: "Ordem na lista", type: "number", span: 1 },
        { name: "ativo", label: "Ativa", type: "checkbox", span: 1 },
        { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
      ]}
      columns={[
        { label: "Forma", render: (r) => <><div className="font-semibold">{r.nome}</div><div className="text-xs text-slate-500">{MEIOS.find(([k]) => k === r.meio)?.[1] ?? r.meio}{r.ativo ? "" : " · inativa"}</div></> },
        { label: "Condição", render: (r) => condicao(r) },
        { label: "Custo", render: (r) => [Number(r.taxa_percentual) ? `${Number(r.taxa_percentual).toLocaleString("pt-BR")}%` : "", Number(r.tarifa_fixa) ? `${brl(r.tarifa_fixa)}/parcela` : ""].filter(Boolean).join(" + ") || "—" },
        { label: "Usar em", render: (r) => (r.uso === "ambos" ? "vendas e pagar" : r.uso === "receber" ? "vendas" : "contas a pagar") },
      ]}
    />
  );
}
