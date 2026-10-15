// Configurações → Bancos e extratos: o que faz o extrato chegar sozinho (Open Finance, API do Inter e OFX por e-mail).
// Saiu da tela Bancos e conciliação, que fica só com saldos e lançamentos. Quem cuida dos bancos (financeiro) também abre.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { OpenFinancePainel } from "@/components/financeiro/OpenFinance";
import { InterPainel } from "@/components/financeiro/Inter";
import { ContaBancariaModal, ExtratoPorEmail, type ContaBancaria, type Importacao } from "@/pages/Conciliacao";
import { CabecalhoSecao, secaoPorId } from "./comum";

export function ConfigBancos() {
  const { pode, tem } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { filtrar } = useUnidade();
  const { data: contasTodas = [], isLoading } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  const bancos = filtrar(contasTodas);
  const { data: importacoes = [] } = useRows<Importacao>("extrato_importacoes");
  const [editar, setEditar] = useState<Partial<ContaBancaria> | null>(null);
  const voltar = tem("admin") ? undefined : { to: "/conciliacao", rotulo: "Bancos e conciliação" };
  return (
    <div className="max-w-5xl">
      <CabecalhoSecao s={secaoPorId("bancos")!} voltar={voltar} />
      {!podeEditar ? (
        <Card className="p-4 text-sm text-slate-600">Só quem edita o financeiro liga o extrato automático.</Card>
      ) : !isLoading && !bancos.length ? (
        <Card className="p-4 text-sm text-slate-600">Cadastre primeiro as contas em <Link to="/conciliacao" className="font-semibold text-brand hover:underline">Bancos e conciliação</Link> (botão Nova conta).</Card>
      ) : (
        <>
          <OpenFinancePainel contas={bancos} />
          <InterPainel contas={bancos} />
          <ExtratoPorEmail bancos={bancos} importacoes={importacoes} onEditar={setEditar} />
        </>
      )}
      {editar && <ContaBancariaModal conta={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}
