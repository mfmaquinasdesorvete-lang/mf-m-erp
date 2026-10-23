// Fretes → Gastos com frete: quanto a MF gastou com transportadora no ano, mês a mês e por transportadora (contas a
// pagar de frete + CT-e que ainda não viraram conta + pagamentos no banco sem conta), com o botão de enviar os XML dos
// CT-e antigos. As contas e o extrato vêm até de antes do ERP (importados do Tiny e dos bancos).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, FileText, Receipt, Truck } from "lucide-react";
import { Stat } from "@/components/ui";
import { ler } from "@/lib/data";
import { brl } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { gastosPorMes, gastosPorTransportadora, type ContaFrete, type CteFrete, type ExtratoFrete } from "@/lib/gastosFrete";
import { ImportarCteXml } from "@/components/fretes/ImportarCteXml";

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function GastosFrete({ podeImportar }: { podeImportar: boolean }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const de = `${ano}-01-01`, ate = `${ano}-12-31`;

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_pagar", "frete", ano],
    queryFn: async () => {
      const linhas = ((await ler(supabase.from("contas_pagar").select("id, emissao, vencimento, valor, status, descricao, fornecedores(nome, nome_fantasia)")
        .or("categoria.ilike.%frete%,descricao.ilike.%frete%,descricao.ilike.%ct-e%,descricao.ilike.%cte %,descricao.ilike.%transportadora%")
        .gte("vencimento", `${ano - 1}-11-01`).lte("vencimento", `${ano + 1}-02-28`).limit(5000))) ?? []) as unknown as {
        id: string; emissao: string | null; vencimento: string; valor: number; status: string; descricao: string | null; fornecedores: { nome: string; nome_fantasia: string | null } | null;
      }[];
      return linhas.map((c): ContaFrete => ({ id: c.id, data: c.emissao ?? c.vencimento, valor: c.valor, status: c.status, descricao: c.descricao, fornecedor: c.fornecedores?.nome_fantasia || c.fornecedores?.nome || null }))
        .filter((c) => (c.data ?? "") >= de && (c.data ?? "") <= ate);
    },
  });
  const { data: ctes = [] } = useQuery({
    queryKey: ["ctes", "gastos", ano],
    queryFn: async () => {
      const linhas = ((await ler(supabase.from("ctes").select("id, emissao, valor, mf_paga, fatura_id, situacao, emitente_nome, transportadoras(nome, nome_fantasia, matriz_id)")
        .gte("emissao", de).lte("emissao", ate).limit(5000))) ?? []) as unknown as {
        id: string; emissao: string | null; valor: number | null; mf_paga: boolean | null; fatura_id: string | null; situacao: string | null; emitente_nome: string | null;
        transportadoras: { nome: string; nome_fantasia: string | null } | null;
      }[];
      return linhas.map((c): CteFrete => ({ ...c, transportadora: c.transportadoras?.nome_fantasia || c.transportadoras?.nome || c.emitente_nome }));
    },
  });
  const { data: extrato = [] } = useQuery({
    queryKey: ["extrato_lancamentos", "frete", ano],
    queryFn: async () => ((await ler(supabase.from("extrato_lancamentos").select("id, data, valor, descricao, conta_pagar_id")
      .lt("valor", 0).is("conta_pagar_id", null).gte("data", de).lte("data", ate).limit(10000))) ?? []) as ExtratoFrete[],
  });

  const meses = useMemo(() => gastosPorMes(ano, contas, ctes, extrato), [ano, contas, ctes, extrato]);
  const porTransp = useMemo(() => gastosPorTransportadora(contas, ctes), [contas, ctes]);
  const soma = (k: "contas" | "ctes_sem_conta" | "banco_sem_conta" | "total") => Math.round(meses.reduce((s, m) => s + m[k], 0) * 100) / 100;
  const qtdCtes = meses.reduce((s, m) => s + m.qtd_ctes, 0);
  const mesesSemCte = meses.filter((m) => m.mes <= new Date().toISOString().slice(0, 7) && !m.qtd_ctes).map((m) => NOMES[Number(m.mes.slice(5)) - 1]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
          {Array.from({ length: anoAtual - 2023 }, (_, i) => anoAtual - i).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {podeImportar && <div className="ml-auto"><ImportarCteXml /></div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Gasto com frete em ${ano}`} valor={brl(soma("total"))} icon={Truck} tom="info" />
        <Stat label="Lançado no contas a pagar" valor={brl(soma("contas"))} icon={Receipt} />
        <Stat label="CT-e sem conta (falta lançar)" valor={brl(soma("ctes_sem_conta"))} sub={`${qtdCtes} CT-e no ano`} icon={FileText} />
        <Stat label="Pago no banco sem conta" valor={brl(soma("banco_sem_conta"))} icon={Banknote} />
      </div>

      {mesesSemCte.length > 0 && (
        <p className="rounded-cartao border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Meses sem nenhum CT-e no ERP: <b>{mesesSemCte.join(", ")}</b>. A SEFAZ só guarda os últimos 3 meses: os anteriores entram pelo
          botão <b>Enviar XML dos CT-e</b> (XML ou ZIP do portal de cada transportadora ou do contador) ou pela planilha na aba CT-e.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500">
            <th className="py-1">Mês</th><th className="text-right">Contas de frete</th><th className="text-right">Pagas</th><th className="text-right">CT-e</th>
            <th className="text-right">CT-e sem conta</th><th className="text-right">Banco sem conta</th><th className="text-right">Total</th>
          </tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t border-slate-100">
                <td className="py-1.5 capitalize">{NOMES[Number(m.mes.slice(5)) - 1]}</td>
                <td className="num text-right">{m.contas ? brl(m.contas) : "—"}</td>
                <td className="num text-right text-slate-500">{m.contas_pagas ? brl(m.contas_pagas) : "—"}</td>
                <td className="num text-right">{m.qtd_ctes || "—"}</td>
                <td className="num text-right">{m.ctes_sem_conta ? brl(m.ctes_sem_conta) : "—"}</td>
                <td className="num text-right">{m.banco_sem_conta ? brl(m.banco_sem_conta) : "—"}</td>
                <td className="num text-right font-semibold">{m.total ? brl(m.total) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {porTransp.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-fg">Por transportadora</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Transportadora / fornecedor</th><th className="text-right">Contas</th><th className="text-right">CT-e</th><th className="text-right">CT-e sem conta</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {porTransp.slice(0, 30).map((t) => (
                  <tr key={t.nome} className="border-t border-slate-100">
                    <td className="py-1.5">{t.nome}</td><td className="num text-right">{t.contas ? brl(t.contas) : "—"}</td><td className="num text-right">{t.qtd_ctes || "—"}</td>
                    <td className="num text-right">{t.ctes_sem_conta ? brl(t.ctes_sem_conta) : "—"}</td><td className="num text-right font-semibold">{brl(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-xs text-slate-500">Contas de frete: categoria "frete" ou descrição de frete, CT-e ou transportadora. Banco sem conta: saídas do extrato para
        transportadoras sem conta a pagar ligada. CT-e com fatura já estão nas contas, por isso não somam de novo.</p>
    </div>
  );
}
