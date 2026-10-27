// Configurações → Catálogo do WhatsApp e Google Shopping: links da lista de produtos (Meta e Google Merchant Center),
// vitrine e pendências.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "./ui";
import { useRows } from "@/lib/data";
import { SELECT_LISTA_PRODUTOS } from "@/lib/produtosLista";
import { notify } from "@/lib/notify";
import { pendenciaCatalogo, urlFeed, urlFeedGoogle, urlLoja } from "@/lib/catalogo";
import type { Produto } from "@/lib/types";

export function CatalogoConfig({ texto, onTexto }: { texto: string; onTexto: (v: string) => void }) {
  const { data: produtos = [] } = useRows<Produto>("produtos", { select: SELECT_LISTA_PRODUTOS, order: "descricao", ascending: true });
  const [passos, setPassos] = useState(false);
  const [passosGoogle, setPassosGoogle] = useState(false);
  const marcados = produtos.filter((p) => p.ativo && p.no_catalogo);
  const pendentes = marcados.filter((p) => pendenciaCatalogo({ foto: p.foto_caminho, preco: p.preco_venda }));
  const prontos = marcados.length - pendentes.length;

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><ShoppingBag size={18} className="text-brand" /> Catálogo do WhatsApp, Google Shopping e vitrine</h2>
      <p className="mb-3 text-sm text-slate-600">
        Os produtos marcados <b>Mostrar no catálogo</b> (em Estoque) vão para o catálogo do WhatsApp e para o Google Shopping com foto, preço
        e disponibilidade, e aparecem na vitrine do site. A Meta e o Google buscam a lista sozinhos e atualizam preço e estoque.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{marcados.length}</div><div className="text-xs text-slate-500">marcados</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-emerald-700">{prontos}</div><div className="text-xs text-slate-500">no catálogo</div></div>
        <div className="rounded-xl border border-slate-200 p-3"><div className={`num text-2xl font-bold ${pendentes.length ? "text-amber-700" : "text-fg"}`}>{pendentes.length}</div><div className="text-xs text-slate-500">faltando foto/preço</div></div>
      </div>
      {pendentes.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Não vão até corrigir: {pendentes.slice(0, 5).map((p) => `${p.descricao} (${pendenciaCatalogo({ foto: p.foto_caminho, preco: p.preco_venda })})`).join(", ")}
          {pendentes.length > 5 && "…"} · <Link to="/estoque" className="font-semibold underline">abrir Estoque</Link>
        </p>
      )}

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Frase de apresentação (aparece no topo da vitrine)</span>
        <input className="input" value={texto} onChange={(e) => onTexto(e.target.value)} />
      </label>

      <LinkCopiar rotulo="Link para colar no Gerenciador de Comércio da Meta (WhatsApp)" url={urlFeed()} />
      <LinkCopiar rotulo="Link para colar no Google Merchant Center (Google Shopping)" url={urlFeedGoogle()} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link to="/loja" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <ExternalLink size={15} /> Ver a vitrine
        </Link>
        <span className="self-center text-xs text-slate-500">{urlLoja()}</span>
      </div>

      <div className="rounded-xl border border-slate-200 p-3 text-sm">
        <button type="button" onClick={() => setPassos(!passos)} className="flex w-full items-center justify-between font-semibold text-fg">
          Como ligar no WhatsApp (uma vez só) <ChevronDown size={16} className={passos ? "rotate-180" : ""} />
        </button>
        {passos && <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
          <li>No computador, abra <b>business.facebook.com/commerce</b> (Gerenciador de Comércio) e entre no catálogo da MF (o mesmo ligado ao WhatsApp).</li>
          <li>Vá em <b>Catálogo → Fontes de dados → Adicionar itens → Feed de dados</b>.</li>
          <li>Escolha <b>Programado</b> (feed por URL), cole o link acima e escolha atualizar <b>a cada hora</b>. Moeda: <b>BRL</b>.</li>
          <li>Pronto: em alguns minutos os produtos aparecem. No app <b>WhatsApp Business → Ferramentas comerciais → Catálogo</b> confira se o catálogo é esse.</li>
          <li>Produtos que você cadastrou à mão no app continuam lá. Para não ficar repetido, apague os antigos que já estão no ERP.</li>
        </ol>}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm">
        <button type="button" onClick={() => setPassosGoogle(!passosGoogle)} className="flex w-full items-center justify-between font-semibold text-fg">
          Como trocar o Google Shopping do Tiny para o ERP (uma vez só) <ChevronDown size={16} className={passosGoogle ? "rotate-180" : ""} />
        </button>
        {passosGoogle && <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
          <li>Marque <b>Mostrar no catálogo</b> em todos os produtos que hoje são anunciados no Google (com foto e preço de venda).</li>
          <li>Abra <b>merchants.google.com</b>, entre na conta da loja e vá em <b>Produtos → Fontes de dados</b>. Veja a fonte que vem do Tiny e o <b>ID</b> de alguns produtos: se for o código (SKU), os anúncios continuam com o mesmo histórico, porque o ERP usa o SKU como ID.</li>
          <li>Clique em <b>Adicionar fonte de produtos → Adicionar produtos de um arquivo → Inserir um link</b>, cole o link do Google acima e escolha buscar <b>todo dia</b>. País <b>Brasil</b>, idioma <b>Português</b>.</li>
          <li>Espere os produtos aparecerem como <b>aprovados</b> (pode levar até 3 dias). Só então desligue a fonte do Tiny: assim os anúncios não param.</li>
          <li>Sob encomenda vai para o Google com a data de envio prevista (hoje + prazo de reposição do produto, ou 30 dias). A mesma previsão aparece na vitrine.</li>
        </ol>}
      </div>
    </div>
  );
}

function LinkCopiar({ rotulo, url }: { rotulo: string; url: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(url); setCopiado(true); notify("Link copiado"); setTimeout(() => setCopiado(false), 2500); }
    catch { notify("Selecione o link e copie manualmente", "erro"); }
  }
  return (
    <>
      <div className="mb-2 text-xs font-semibold text-slate-600">{rotulo}</div>
      <div className="mb-3 flex gap-2">
        <input className="input min-w-0 font-mono text-xs" readOnly value={url} aria-label={rotulo} onFocus={(e) => e.target.select()} />
        <Button type="button" variant="secondary" onClick={copiar}>{copiado ? <Check size={16} /> : <Copy size={16} />} Copiar</Button>
      </div>
    </>
  );
}
