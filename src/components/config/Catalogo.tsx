// Configurações → Catálogo e vitrine: painel (quantos estão no catálogo, o que falta), prévia de como aparece na loja,
// link para os produtos, frase da vitrine, unidade da loja e o passo a passo do catálogo do WhatsApp.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, ImageOff, PackageSearch, ShoppingBag, Store, TriangleAlert } from "lucide-react";
import { Card, Indicador } from "@/components/ui";
import { CatalogoConfig } from "@/components/CatalogoConfig";
import { useRows } from "@/lib/data";
import { brl } from "@/lib/format";
import { pendenciaCatalogo, urlFotoProduto, urlLoja } from "@/lib/catalogo";
import { useUnidade } from "@/lib/unidade";
import type { Produto } from "@/lib/types";
import { BotaoSalvar, Bloco, CabecalhoSecao, secaoPorId, useCfgPagina } from "./comum";

const TIPO: Record<string, string> = { maquina: "Máquinas", acessorio: "Acessórios", peca: "Peças" };

export function ConfigCatalogo() {
  const s = secaoPorId("catalogo")!;
  const { unidades } = useUnidade();
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(["catalogo_texto", "loja_unidade_id"]);
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const [filtro, setFiltro] = useState("todos");
  const marcados = useMemo(() => produtos.filter((p) => p.ativo && p.no_catalogo), [produtos]);
  const prontos = marcados.filter((p) => !pendenciaCatalogo({ foto: p.foto_caminho, preco: p.preco_venda }));
  const pendentes = marcados.length - prontos.length;
  const semFoto = marcados.filter((p) => !p.foto_caminho).length;
  const tipos = [...new Set(prontos.map((p) => p.tipo))].filter((t) => TIPO[t]);
  const vitrine = prontos.filter((p) => filtro === "todos" || p.tipo === filtro).slice(0, 12);
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;

  return (
    <div className="max-w-6xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-catalogo" salvando={salvando} />} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Na vitrine" valor={prontos.length} icon={CheckCircle2} cor="verde" sub="com foto e preço" />
        <Indicador rotulo="Marcados" valor={marcados.length} icon={ShoppingBag} cor="azul" sub="Mostrar no catálogo" />
        <Indicador rotulo="Faltando algo" valor={pendentes} icon={TriangleAlert} cor={pendentes ? "ambar" : "neutro"} sub="não aparecem até corrigir" />
        <Indicador rotulo="Sem foto" valor={semFoto} icon={ImageOff} cor={semFoto ? "laranja" : "neutro"} sub="dos marcados" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link to="/loja" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 font-semibold text-brand-fg"><Store size={15} /> Abrir a vitrine</Link>
        <Link to="/produtos/pecas" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><PackageSearch size={15} /> Peças e acessórios</Link>
        <Link to="/produtos/maquinas" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><PackageSearch size={15} /> Máquinas</Link>
        <span className="self-center text-xs text-slate-500">No cadastro do produto: foto, preço e <b>Mostrar no catálogo</b>.</span>
      </div>

      <Card className="mb-5 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-fg">Como aparece na loja</h2>
          <a href={urlLoja()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><ExternalLink size={13} /> {urlLoja()}</a>
        </div>
        {cfg.catalogo_texto && <p className="mb-3 max-w-2xl text-sm text-slate-600">{cfg.catalogo_texto}</p>}
        {tipos.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {[["todos", "Todos"], ...tipos.map((t) => [t, TIPO[t]])].map(([v, r]) => (
              <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${filtro === v ? "bg-brand text-brand-fg" : "border border-slate-200 text-slate-600"}`}>{r}</button>
            ))}
          </div>
        )}
        {vitrine.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vitrine.map((p) => (
              <a key={p.id} href={urlLoja(p.id)} target="_blank" rel="noreferrer" className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-card hover:border-brand">
                <div className="aspect-square bg-white">{p.foto_caminho && <img src={urlFotoProduto(p.foto_caminho)} alt="" loading="lazy" className="h-full w-full object-contain p-2" />}</div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-sm font-semibold text-fg">{p.descricao}</span>
                  <span className="mt-auto text-base font-bold text-fg">{brl(p.preco_venda)}</span>
                </div>
              </a>
            ))}
          </div>
        ) : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Nenhum produto pronto para a vitrine ainda.</p>}
        {prontos.length > vitrine.length && <p className="mt-2 text-xs text-slate-500">Mostrando {vitrine.length} de {prontos.length}.</p>}
      </Card>

      <form id="form-catalogo" onSubmit={salvar} className="space-y-5">
        <Card className="p-4 sm:p-5"><CatalogoConfig texto={cfg.catalogo_texto ?? ""} onTexto={(v) => mudar({ catalogo_texto: v })} /></Card>
        {unidades.length > 1 && (
          <Bloco titulo="Loja virtual" descricao="Pedidos feitos pelos clientes na loja entram como orçamento nesta unidade.">
            <label className="block max-w-sm">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Unidade que recebe os pedidos da loja</span>
              <select className="input" value={cfg.loja_unidade_id ?? ""} onChange={set("loja_unidade_id")}>
                <option value="">Matriz (padrão)</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
          </Bloco>
        )}
      </form>
    </div>
  );
}
