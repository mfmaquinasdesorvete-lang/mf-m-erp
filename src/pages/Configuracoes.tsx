// Configurações: o painel (/configuracoes) e uma página para cada assunto (/configuracoes/empresa, /pedidos…).
import { Navigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui";
import { UnidadesConfig } from "@/components/UnidadesConfig";
import { CabecalhoSecao, secaoPorId, type SecaoId } from "@/components/config/comum";
import { PainelConfig } from "@/components/config/Painel";
import { ConfigEmpresa } from "@/components/config/Empresa";
import { ConfigRecebimentos } from "@/components/config/Recebimentos";
import { ConfigOrcamentos } from "@/components/config/Orcamentos";
import { ConfigDescontos } from "@/components/config/Descontos";
import { ConfigPedidos } from "@/components/config/Pedidos";
import { ConfigNotas } from "@/components/config/Notas";
import { ConfigCatalogo } from "@/components/config/Catalogo";
import { ConfigAvisos, ConfigComissoes, ConfigContador, ConfigDados, ConfigEmail } from "@/components/config/Pequenas";
import { ConfigCadastros } from "@/components/config/Cadastros";
import { ConfigBancos } from "@/components/config/Bancos";
import { ConfigCobranca } from "@/components/config/Cobranca";

function ConfigUnidades() {
  return (
    <div className="max-w-5xl">
      <CabecalhoSecao s={secaoPorId("unidades")!} />
      <Card className="p-4 sm:p-5"><UnidadesConfig /></Card>
    </div>
  );
}

const PAGINAS: Record<SecaoId, () => JSX.Element> = {
  empresa: ConfigEmpresa, unidades: ConfigUnidades, recebimentos: ConfigRecebimentos, bancos: ConfigBancos, orcamentos: ConfigOrcamentos, descontos: ConfigDescontos, comissoes: ConfigComissoes,
  pedidos: ConfigPedidos, notas: ConfigNotas, catalogo: ConfigCatalogo, cobranca: ConfigCobranca, avisos: ConfigAvisos, email: ConfigEmail, contador: ConfigContador, dados: ConfigDados, cadastros: ConfigCadastros,
};

export default function Configuracoes({ secaoFixa }: { secaoFixa?: SecaoId }) {
  const { secao: daRota } = useParams();
  const secao = secaoFixa ?? daRota;
  if (!secao) return <PainelConfig />;
  const s = secaoPorId(secao);
  if (!s) return <Navigate to="/configuracoes" replace />;
  const Pagina = PAGINAS[s.id];
  return <Pagina key={s.id} />;
}
