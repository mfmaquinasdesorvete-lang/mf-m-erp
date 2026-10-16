// Gastos que o financeiro acompanha à parte (combustível, compras em marketplaces, impostos, tarifas e funcionários):
// antes eram três telas no menu do Financeiro; agora uma só, com uma aba por tipo. Cada aba é a tela antiga embutida,
// com os mesmos filtros e a mesma exportação. Os endereços antigos (/combustivel etc.) abrem a aba certa daqui.
import { lazy, Suspense } from "react";
import { PageHeader, Tabs } from "@/components/ui";
import { useAbaUrl } from "@/lib/abaUrl";

const Combustivel = lazy(() => import("./Combustivel"));
const ComprasMarketplace = lazy(() => import("./ComprasMarketplace"));
const ImpostosTarifas = lazy(() => import("./ImpostosTarifas"));

export const ABAS_GASTOS = [
  { value: "combustivel", label: "Combustível", dica: "Abastecimentos pagos (extratos dos bancos e cartões), notas dos postos e postos no cadastro." },
  { value: "marketplaces", label: "Marketplaces", dica: "Compras no Mercado Livre, TikTok Shop, Shopee e Amazon: notas das lojas e pagamentos nos extratos." },
  { value: "impostos", label: "Impostos", dica: "Guias de imposto pagas, por esfera (federal, estadual, municipal e veículos), de todas as contas." },
  { value: "tarifas", label: "Tarifas", dica: "Tarifas de cartão, da OLIST, da InfinitePay e dos bancos, de todas as contas." },
  { value: "funcionarios", label: "Funcionários", dica: "Pagamentos aos funcionários, reconhecidos pelo nome do cadastro como aparece no Pix." },
] as const;
export type AbaGastos = (typeof ABAS_GASTOS)[number]["value"];

export default function GastosSeparados() {
  const [aba, setAba] = useAbaUrl<AbaGastos>("combustivel", ABAS_GASTOS.map((a) => a.value));
  const def = ABAS_GASTOS.find((a) => a.value === aba)!;
  return (
    <div>
      <PageHeader title="Gastos separados" subtitle="Combustível, marketplaces, impostos, tarifas e funcionários separados do resto, juntando todas as contas" />
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
