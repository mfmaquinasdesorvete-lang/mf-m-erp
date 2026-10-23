// Loja online e marketplace (Vendas → Loja online e marketplace): a aba Marketplace (qualidade dos cadastros para
// anunciar, antes a aba Anúncios de Produtos) e o Mercado Livre: o painel (tem pedido? quantos, quanto, em quanto tempo), os produtos da loja com o
// anúncio de cada um, os anúncios com o estoque e o preço que o ERP manda, as vendas depois da venda (envio, NF-e e rastreio), os ajustes do envio, a
// conta conectada e os outros marketplaces. Também recebe a volta do "Conectar" (/mercado-livre/retorno?code=…&state=…).
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { Button, Card, PageHeader, Tabs } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { textoResumoEnvio } from "@/lib/mlAnuncios";
import { concluirConexaoML, sincronizarAgora, useAnunciosML } from "@/lib/useMercadoLivre";
import { ContaMercadoLivre } from "@/components/mercadolivre/ContaMercadoLivre";
import { EnvioEstoquePreco } from "@/components/mercadolivre/EnvioEstoquePreco";
import { AnunciosMercadoLivre } from "@/components/mercadolivre/AnunciosMercadoLivre";
import { VendasMercadoLivre } from "@/components/mercadolivre/VendasMercadoLivre";
import { PainelMercadoLivre } from "@/components/mercadolivre/PainelMercadoLivre";
import { OutrosMarketplaces } from "@/components/mercadolivre/OutrosMarketplaces";
import { ProdutosLojaML } from "@/components/mercadolivre/ProdutosLojaML";
import { AuditoriaProdutos } from "@/components/produtos/AuditoriaProdutos";
import { useRows } from "@/lib/data";
import type { Produto } from "@/lib/types";

type Aba = "marketplace" | "painel" | "produtos" | "anuncios" | "vendas" | "envio" | "conta" | "outros";

export default function MercadoLivre() {
  const { tem, pode } = usePerfil();
  const navigate = useNavigate();
  const { search } = useLocation();
  // aba Marketplace (antes "Anúncios" em Produtos): a qualidade dos cadastros para anunciar
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const podeMudar = tem("financeiro", "marketplace");
  const veVendas = tem("vendas", "financeiro");
  const { conta, anuncios, carregando, erro } = useAnunciosML();
  const [aba, setAba] = useState<Aba | null>(() => (new URLSearchParams(search).get("aba") === "marketplace" ? "marketplace" : null));
  const [sincronizando, setSincronizando] = useState(false);
  const invalidar = useInvalidate();
  const conectando = useRetornoConexao();
  const atual: Aba = aba ?? (conta || carregando ? (veVendas ? "painel" : "anuncios") : "conta");
  const envioLigado = !!conta && (!!conta.enviar_estoque || !!conta.enviar_preco);
  const atencao = anuncios.filter((a) => a.situacao === "aguardando" || a.situacao === "erro").length;

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await sincronizarAgora();
      if (r.erro) notify(`${r.naFila} ${r.naFila === 1 ? "anúncio entrou" : "anúncios entraram"} na fila e ${r.naFila === 1 ? "vai" : "vão"} em até 5 minutos (${r.erro}).`, "erro");
      else notify(textoResumoEnvio(r.resultado));
    } catch (e) { notifyError(e); } finally {
      setSincronizando(false);
      invalidar("ml_anuncios");
    }
  }

  return (
    <div>
      <PageHeader
        title="Loja online e marketplace"
        subtitle="Na aba Marketplace, os cadastros prontos para anunciar. No Mercado Livre, os pedidos que entram e quanto vendeu; o ERP manda o estoque e o preço para os anúncios e, depois da venda, a NF-e e o rastreio."
        actions={conta && podeMudar ? (
          <Button onClick={sincronizar} disabled={sincronizando || !envioLigado} title={envioLigado ? "Manda agora estoque e preço de todos os anúncios ligados" : "Ligue antes o envio do estoque ou do preço"}>
            {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizar agora
          </Button>
        ) : null}
      />
      {conectando && (
        <Card className="mb-4 flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Conectando a conta do Mercado Livre…</Card>
      )}
      {conta && !envioLigado && atual === "anuncios" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O envio de estoque e preço está desligado. {podeMudar ? <>Ligue na aba <button type="button" className="font-semibold underline" onClick={() => setAba("envio")}>Envio de estoque e preço</button>.</> : "Peça ao financeiro para ligar."}
        </p>
      )}
      <Tabs value={atual} onChange={setAba} options={[
        { value: "marketplace" as const, label: "Marketplace" },
        ...(veVendas ? [{ value: "painel" as const, label: "Painel" }] : []),
        ...(veVendas || podeMudar ? [{ value: "produtos" as const, label: "Produtos" }] : []),
        { value: "anuncios", label: atencao ? `Anúncios (${atencao} para ver)` : "Anúncios" },
        ...(veVendas && conta ? [{ value: "vendas" as const, label: "Vendas e notas" }] : []),
        { value: "envio", label: "Envio de estoque e preço" },
        { value: "conta", label: conta ? "Conta" : "Conectar a conta" },
        { value: "outros", label: "Outros marketplaces" },
      ]} />
      {atual === "marketplace" && <AuditoriaProdutos produtos={produtos} podeEditar={pode("editar_produtos")} onAbrir={(p) => navigate(`/estoque?editar=${p.id}`)} />}
      {atual === "painel" && veVendas && <PainelMercadoLivre conta={conta} irConta={() => setAba("conta")} />}
      {atual === "produtos" && <ProdutosLojaML podeMudar={podeMudar} />}
      {atual === "anuncios" && <AnunciosMercadoLivre conta={conta} anuncios={anuncios} carregando={carregando} erro={erro} podeMudar={podeMudar} />}
      {atual === "vendas" && veVendas && <VendasMercadoLivre conta={conta} />}
      {atual === "envio" && <EnvioEstoquePreco conta={conta} podeMudar={podeMudar} irConta={() => setAba("conta")} />}
      {atual === "conta" && <ContaMercadoLivre conta={conta} />}
      {atual === "outros" && <OutrosMarketplaces conta={conta} irConta={() => setAba("conta")} />}
    </div>
  );
}

/** Volta do "Conectar": troca o código pelo acesso (função mercadolivre) e vai para a tela normal. */
function useRetornoConexao() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const feito = useRef(false);
  const [conectando, setConectando] = useState(false);
  useEffect(() => {
    if (!pathname.endsWith("/mercado-livre/retorno") || feito.current) return;
    feito.current = true;
    const q = new URLSearchParams(search);
    const code = q.get("code"), state = q.get("state");
    (async () => {
      setConectando(true);
      try {
        if (!code || !state) throw new Error(q.get("error") ? "O Mercado Livre não autorizou a conexão. Clique em Conectar de novo." : "Retorno do Mercado Livre incompleto: clique em Conectar de novo.");
        const r = await concluirConexaoML(code, state);
        notify(`Conta ${r.apelido} conectada. As vendas pagas já entram sozinhas no ERP.`);
      } catch (e) { notifyError(e); } finally {
        setConectando(false);
        invalidar("ml_contas", "ml_anuncios");
        navigate("/mercado-livre", { replace: true });
      }
    })();
  }, [pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps
  return conectando;
}
