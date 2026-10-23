// Canais de venda online da MF: o Mercado Livre (conectado aqui), o Google Shopping (lista de produtos gerada pelo
// ERP) e os próximos marketplaces, com o que cada um precisa para conectar. As chaves de cada canal ficam no cofre
// do Supabase e quem cadastra é a administradora; a ligação de cada um é feita pelo chat dos marketplaces.
import { Check, Copy, ExternalLink, Plug, Store } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { notify } from "@/lib/notify";
import { urlFeedGoogle } from "@/lib/catalogo";
import type { ContaML } from "@/lib/mlAnuncios";

type Canal = { nome: string; cor: string; oQueFaz: string; precisa: string };

const PROXIMOS: Canal[] = [
  { nome: "Shopee", cor: "#ee4d2d", oQueFaz: "Pedidos, estoque e preço dos anúncios.", precisa: "Conta de vendedor e o app na Shopee Open Platform (Partner ID e chave)." },
  { nome: "Amazon", cor: "#ff9900", oQueFaz: "Pedidos, estoque e preço (Seller Central).", precisa: "Conta de vendedor profissional e o app na Selling Partner API." },
  { nome: "Magalu", cor: "#0086ff", oQueFaz: "Pedidos, estoque e preço (Magalu Marketplace).", precisa: "Conta de seller e o acesso à API do Magalu (ID Magalu)." },
  { nome: "TikTok Shop", cor: "#fe2c55", oQueFaz: "Pedidos e anúncios do TikTok Shop.", precisa: "Loja aprovada no TikTok Shop e o app no TikTok Shop Partner Center." },
];

export function OutrosMarketplaces({ conta, irConta }: { conta: ContaML | null; irConta: () => void }) {
  const ativo = conta?.status === "ativa";
  async function copiarFeed() {
    try { await navigator.clipboard.writeText(urlFeedGoogle()); notify("Endereço da lista copiado."); }
    catch { notify(urlFeedGoogle()); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Os canais onde a MF vende pela internet. Cada canal conectado traz os pedidos para o ERP e recebe o estoque e o preço daqui.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card className="flex flex-col gap-2 p-4">
          <Cabeca nome="Mercado Livre" cor="#ffe600" situacao={ativo ? "Conectado" : conta ? "Precisa de atenção" : "Não conectado"} ok={ativo} />
          <p className="text-sm text-slate-600">{ativo ? `Conta ${conta?.apelido ?? ""}: pedidos, NF-e, rastreio, estoque e preço.` : "Conecte a conta para os pedidos entrarem sozinhos."}</p>
          <div className="mt-auto"><Button type="button" variant="secondary" onClick={irConta}><Plug size={15} /> {conta ? "Ver a conta" : "Conectar"}</Button></div>
        </Card>
        <Card className="flex flex-col gap-2 p-4">
          <Cabeca nome="Google Shopping" cor="#4285f4" situacao="Lista gerada pelo ERP" ok />
          <p className="text-sm text-slate-600">O Google Merchant Center lê a lista de produtos da loja do ERP (preço, foto e disponibilidade) direto deste endereço.</p>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copiarFeed}><Copy size={15} /> Copiar endereço</Button>
            <Button type="button" variant="secondary" onClick={() => window.open(urlFeedGoogle(), "_blank", "noopener")}><ExternalLink size={15} /> Abrir a lista</Button>
          </div>
        </Card>
        {PROXIMOS.map((c) => (
          <Card key={c.nome} className="flex flex-col gap-2 p-4">
            <Cabeca nome={c.nome} cor={c.cor} situacao="Ainda não conectado" />
            <p className="text-sm text-slate-600">{c.oQueFaz}</p>
            <p className="text-xs text-slate-500"><span className="font-semibold">Para conectar:</span> {c.precisa} Peça a ligação no chat ERP Line – Marketplaces; as chaves você cadastra no cofre, nunca no chat.</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Cabeca({ nome, cor, situacao, ok }: { nome: string; cor: string; situacao: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 20%, transparent)`, color: cor }}><Store size={18} /></span>
      <span className="min-w-0 flex-1 font-semibold text-fg">{nome}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
        {ok && <Check size={12} />} {situacao}
      </span>
    </div>
  );
}
