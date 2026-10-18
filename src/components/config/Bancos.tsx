// Configurações → Bancos e extratos: o que faz o extrato chegar sozinho (Open Finance, API do Inter e OFX por e-mail).
// Saiu da tela Bancos e conciliação, que fica só com saldos e lançamentos. Quem cuida dos bancos (financeiro) também abre.
// No alto, o cadastro das contas bancárias (nova conta e editar), para ligar tudo daqui sem passar por outra tela.
import { useState } from "react";
import { Landmark, Pencil, Plus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useRows } from "@/lib/data";
import { hoje } from "@/lib/format";
import { EtiquetaUnidade, useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { OpenFinancePainel } from "@/components/financeiro/OpenFinance";
import { InterPainel } from "@/components/financeiro/Inter";
import { BANCOS, ContaBancariaModal, ExtratoPorEmail, type ContaBancaria, type Importacao } from "@/pages/Conciliacao";
import { CabecalhoSecao, secaoPorId } from "./comum";

export function ConfigBancos() {
  const { pode, tem } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { filtrar, padrao } = useUnidade();
  const { data: contasTodas = [], isLoading } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  const bancos = filtrar(contasTodas);
  const { data: importacoes = [] } = useRows<Importacao>("extrato_importacoes");
  const [editar, setEditar] = useState<Partial<ContaBancaria> | null>(null);
  const voltar = tem("admin") ? undefined : { to: "/conciliacao", rotulo: "Bancos e conciliação" };
  const nova = (banco = "unicred") => setEditar({ banco, tipo: banco === "infinitepay" ? "pagamentos" : "corrente", saldo_inicial: 0, saldo_inicial_data: hoje(), ativo: true, unidade_id: padrao ?? undefined });
  return (
    <div className="max-w-5xl">
      <CabecalhoSecao s={secaoPorId("bancos")!} voltar={voltar} />
      {!podeEditar ? (
        <Card className="p-4 text-sm text-slate-600">Só quem edita o financeiro liga o extrato automático.</Card>
      ) : (
        <>
          <ContasBancarias bancos={bancos} carregando={isLoading} onNova={nova} onEditar={setEditar} />
          {bancos.length > 0 && <OpenFinancePainel contas={bancos} />}
          <InterPainel contas={bancos} onNovaConta={() => nova("inter")} />
          {bancos.length > 0 && <ExtratoPorEmail bancos={bancos} importacoes={importacoes} onEditar={setEditar} />}
        </>
      )}
      {editar && <ContaBancariaModal conta={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}

/** Contas bancárias de cada unidade: cadastrar e editar aqui mesmo. */
function ContasBancarias({ bancos, carregando, onNova, onEditar }: {
  bancos: ContaBancaria[]; carregando: boolean; onNova: (banco?: string) => void; onEditar: (c: ContaBancaria) => void;
}) {
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-fg"><Landmark size={17} className="text-slate-500" aria-hidden /> Contas bancárias</h2>
          <p className="text-sm text-slate-500">Uma por conta de cada unidade (SC e SP), com o saldo do dia em que começa a conciliar. Depois ligue o extrato automático abaixo.</p>
        </div>
        <Button onClick={() => onNova()}><Plus size={16} aria-hidden /> Nova conta</Button>
      </div>
      {!carregando && !bancos.length && <p className="mt-3 text-sm text-slate-600">Nenhuma conta ainda. Cadastre a primeira (ex.: Banco Inter SC) com a unidade dona da conta.</p>}
      {bancos.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {bancos.map((b) => (
            <li key={b.id} className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${b.ativo ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
              <span className="min-w-0">
                <b className="block truncate text-fg">{b.nome}</b>
                <span className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                  {BANCOS[b.banco] ?? b.banco}{b.agencia ? ` · ag. ${b.agencia}` : ""}{b.numero ? ` · conta ${b.numero}` : ""}{!b.ativo && " · inativa"}<EtiquetaUnidade id={b.unidade_id} />
                </span>
              </span>
              <button type="button" onClick={() => onEditar(b)} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline"><Pencil size={12} aria-hidden /> Editar</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
