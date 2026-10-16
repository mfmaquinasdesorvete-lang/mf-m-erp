// Metas de vendas (Vendas → Metas): administrador e financeiro veem e cadastram as metas da empresa, dos vendedores e
// das regiões; o vendedor vê só a própria meta, o realizado, a projeção e quanto falta por dia útil.
import { PageHeader } from "@/components/ui";
import { PainelMetas } from "@/components/metas/PainelMetas";
import { usePerfil } from "@/lib/auth";

export default function Metas() {
  const { tem } = usePerfil();
  return (
    <div>
      <PageHeader title="Metas de vendas"
        subtitle={tem("financeiro")
          ? "Meta x realizado do mês da empresa, de cada vendedor e de cada região, com a projeção pelos dias úteis e o mesmo mês do ano anterior."
          : "Sua meta do mês, quanto já vendeu, a projeção e quanto falta por dia útil."} />
      <PainelMetas />
    </div>
  );
}
