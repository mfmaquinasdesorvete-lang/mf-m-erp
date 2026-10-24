// Gastos que o financeiro acompanha à parte (combustível, compras em marketplaces e tarifas), uma aba por tipo.
// Desde 19/10 cada gasto mora na área dele: impostos pagos no Fiscal (/impostos-pagos), pagamentos aos funcionários
// em Funcionários (aba Pagamentos) e quiosques em My Frost Sorveterias. Os endereços antigos abrem o lugar novo.
import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageHeader, Tabs } from "@/components/ui";
import { useAbaUrl } from "@/lib/abaUrl";

const Combustivel = lazy(() => import("./Combustivel"));
const ComprasMarketplace = lazy(() => import("./ComprasMarketplace"));
const ImpostosTarifas = lazy(() => import("./ImpostosTarifas"));

export const ABAS_GASTOS = [
  { value: "combustivel", label: "Combustível", dica: "Abastecimentos pagos (extratos dos bancos e cartões), notas dos postos e postos no cadastro." },
  { value: "marketplaces", label: "Marketplaces", dica: "Compras no Mercado Livre, TikTok Shop, Shopee e Amazon: notas das lojas e pagamentos nos extratos." },
  { value: "tarifas", label: "Tarifas", dica: "Tarifas de cartão, da OLIST, da InfinitePay e dos bancos, de todas as contas." },
] as const;
export type AbaGastos = (typeof ABAS_GASTOS)[number]["value"];

/** Abas que mudaram de lugar em 19/10: o endereço antigo (/gastos?aba=…) abre a tela nova. */
export const NOVO_LUGAR: Record<string, string> = {
  impostos: "/impostos-pagos", funcionarios: "/funcionarios-pagamentos", quiosques: "/licenciados?aba=quiosques",
};

export default function GastosSeparados() {
  const pedida = new URLSearchParams(useLocation().search).get("aba") ?? "";
  if (NOVO_LUGAR[pedida]) return <Navigate to={NOVO_LUGAR[pedida]} replace />;
  return <Gastos />;
}

function Gastos() {
  const [aba, setAba] = useAbaUrl<AbaGastos>("combustivel", ABAS_GASTOS.map((a) => a.value));
  const def = ABAS_GASTOS.find((a) => a.value === aba)!;
  return (
    <div>
      <PageHeader title="Gastos separados" subtitle="Combustível, marketplaces e tarifas separados do resto, juntando todas as contas. Impostos estão no Fiscal, funcionários em Gestão e quiosques em My Frost Sorveterias" />
      <Tabs value={aba} onChange={setAba} options={ABAS_GASTOS.map(({ value, label }) => ({ value, label }))} />
      <p className="-mt-2 mb-4 text-sm text-slate-500">{def.dica}</p>
      <Suspense fallback={<div className="p-6 text-slate-500">Carregando…</div>}>
        {aba === "combustivel" ? <Combustivel embutido />
          : aba === "marketplaces" ? <ComprasMarketplace embutido />
          : <ImpostosTarifas key={aba} aba={aba} />}
      </Suspense>
    </div>
  );
}
