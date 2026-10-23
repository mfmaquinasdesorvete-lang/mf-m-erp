// Impostos pagos (Fiscal): as guias de imposto pagas, por esfera, juntando todas as contas. Era a aba Impostos de
// Gastos separados (Financeiro); desde 19/10 fica na área Fiscal, ao lado de Parcelamentos e do Analista fiscal.
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui";

const ImpostosTarifas = lazy(() => import("./ImpostosTarifas"));

export default function ImpostosPagos() {
  return (
    <div>
      <PageHeader title="Impostos pagos" subtitle="Guias pagas por esfera (federal, estadual, municipal e veículos), de todas as contas" />
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        Parcelas de impostos em atraso ou renegociados ficam em <Link to="/parcelamentos" className="link-acao">Parcelamentos</Link>.
      </p>
      <Suspense fallback={<div className="p-6 text-slate-500">Carregando…</div>}>
        <ImpostosTarifas aba="impostos" />
      </Suspense>
    </div>
  );
}
