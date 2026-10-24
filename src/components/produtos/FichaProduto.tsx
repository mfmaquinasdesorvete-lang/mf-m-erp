// Ficha do produto (como a do Tiny, mais clara): tudo de um produto numa janela só, em abas.
//  Geral: fotos e vídeos, dados principais, medidas desenhadas, campos adicionais e marcadores.
//  Fornecedores: quem vende, código deles, preço e prazo. Anúncios: Mercado Livre, loja, Google e nota do anúncio.
//  Custos: mudanças de custo e preço (com quem mudou) e as compras pelas notas, com o custo médio.
//  Nas máquinas: Máquina (especificações, etapas de produção, manuais e dicas), Clientes (quem tem, garantia e o
//  link da máquina para mandar pelo WhatsApp) e Assistência (OS do modelo, peças trocadas em garantia e o custo).
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, MessageCircle, Pencil, Ruler, ShieldCheck, Store, Wrench } from "lucide-react";
import { Button, Modal, Table, Tabs } from "../ui";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl, whatsappLink } from "@/lib/format";
import { urlFotoProduto, urlLoja } from "@/lib/catalogo";
import { avaliarAnuncio } from "@/lib/marketplace";
import { linkAnuncio } from "@/lib/mlAnuncios";
import { useAnunciosML } from "@/lib/useMercadoLivre";
import { CelulaEstoque, CelulaPreco, detalheSituacao, SituacaoChip } from "../mercadolivre/AnunciosMercadoLivre";
import { notify } from "@/lib/notify";
import { FornecedoresProduto } from "../FornecedoresProduto";
import { ChipsMarcadores, useMarcadores } from "../nfe/Marcadores";
import { DesenhoMedidas } from "./DesenhoMedidas";
import { DocumentosMaquina, GaleriaProduto } from "./GaleriaProduto";
import type { Especificacao } from "./EditoresMaquina";
import type { Produto } from "@/lib/types";
import { custoMedioCompras, linkMaquina, mensagemMaquina, pecasEmGarantia } from "@/lib/maquinas";
import { margemBruta } from "@/lib/margem";

type Aba = "geral" | "fornecedores" | "anuncios" | "custos" | "maquina" | "clientes" | "assistencia";
type ProdutoFicha = Produto & { especificacoes?: Especificacao[] | null; etapas_producao?: string[] | null; dicas_manutencao?: string | null; video_url?: string | null };
type LinhaCusto = { data: string; evento: "cadastro" | "alteracao" | "compra"; detalhe: string | null; quantidade: number | null; valor_unitario: number | null;
  preco_custo: number | null; preco_venda: number | null; saldo: number | null; usuario: string | null };

const NOME_TIPO: Record<string, string> = { maquina: "Máquina", peca: "Peça de reposição", acessorio: "Acessório", insumo: "Componente de produção", servico: "Serviço" };
const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function FichaProduto({ produto, onClose, onEditar, podeEditar, custo }: { produto: ProdutoFicha; onClose: () => void; onEditar?: () => void; podeEditar: boolean;
  /** custo usado na margem (kit: soma dos componentes); sem ele, o do cadastro */ custo?: number }) {
  const maquina = produto.tipo === "maquina";
  const [aba, setAba] = useState<Aba>("geral");
  // código do item em cada fornecedor (das notas ligadas e dos fornecimentos), ao lado do nosso SKU
  const { data: codigosForn = [] } = useQuery({
    queryKey: ["fornecimentos", "codigos", produto.id],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from("produto_fornecedor").select("codigo_fornecedor, fornecedor:fornecedores(nome)").eq("produto_id", produto.id),
        supabase.from("fornecimentos").select("codigo_fornecedor, fornecedor:fornecedores(nome)").eq("produto_id", produto.id).eq("ativo", true),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const vistos = new Set<string>();
      return [...(a.data ?? []), ...(b.data ?? [])].flatMap((x) => {
        const cod = String(x.codigo_fornecedor ?? "").trim();
        const nome = (x.fornecedor as { nome?: string } | null)?.nome ?? "fornecedor";
        if (!cod || vistos.has(`${nome}|${cod}`)) return [];
        vistos.add(`${nome}|${cod}`);
        return [{ cod, nome }];
      });
    },
  });
  const abas: { value: Aba; label: string }[] = [
    { value: "geral", label: "Geral" },
    ...(maquina ? [{ value: "maquina" as Aba, label: "Máquina" }, { value: "clientes" as Aba, label: "Clientes" }, { value: "assistencia" as Aba, label: "Assistência" }] : []),
    ...(produto.tipo !== "servico" ? [{ value: "fornecedores" as Aba, label: "Fornecedores" }] : []),
    { value: "anuncios", label: "Anúncios" },
    { value: "custos", label: "Custos" },
  ];
  return (
    <Modal open onClose={onClose} title={produto.descricao} wide>
      {produto.subtitulo && <p className="-mt-1 mb-2 text-sm text-slate-600">{produto.subtitulo}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">{NOME_TIPO[produto.tipo] ?? produto.tipo}</span>
        {produto.sku && <span className="num rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">SKU {produto.sku}</span>}
        {codigosForn.map((c) => <span key={`${c.nome}|${c.cod}`} className="num rounded-full bg-sky-50 px-2.5 py-0.5 font-semibold text-sky-800" title={c.nome}>{c.nome.split(" ")[0]}: {c.cod}</span>)}
        {produto.ativo === false && <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-800">inativo</span>}
        {produto.fora_de_linha && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800">fora de linha</span>}
        {onEditar && podeEditar && <Button variant="secondary" className="ml-auto" onClick={onEditar}><Pencil size={14} /> Editar cadastro</Button>}
      </div>
      <Tabs value={aba} onChange={setAba} options={abas} />
      {aba === "geral" && <AbaGeral p={produto} podeEditar={podeEditar} custo={custo} />}
      {aba === "fornecedores" && <FornecedoresProduto produtoId={produto.id} podeEditar={podeEditar} />}
      {aba === "anuncios" && <AbaAnuncios p={produto} />}
      {aba === "custos" && <AbaCustos p={produto} />}
      {aba === "maquina" && <AbaMaquina p={produto} podeEditar={podeEditar} />}
      {aba === "clientes" && <AbaClientes p={produto} />}
      {aba === "assistencia" && <AbaAssistencia p={produto} />}
    </Modal>
  );
}

function Dado({ rotulo, valor, num }: { rotulo: string; valor: ReactNode; num?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className={`truncate text-sm font-semibold text-fg ${num ? "num" : ""}`}>{valor === null || valor === undefined || valor === "" ? <span className="font-normal text-slate-400">—</span> : valor}</dd>
    </div>
  );
}

function AbaGeral({ p, podeEditar, custo }: { p: ProdutoFicha; podeEditar: boolean; custo?: number }) {
  const { data: marcadores = [] } = useMarcadores();
  const { data: embalagem } = useQuery({
    queryKey: ["embalagens", "ficha", p.embalagem_id],
    enabled: !!p.embalagem_id,
    queryFn: async () => (await supabase.from("embalagens").select("descricao").eq("id", p.embalagem_id!).maybeSingle()).data as { descricao: string } | null,
  });
  const margem = margemBruta(p.preco_venda, custo ?? p.preco_custo);
  const campos = lista<Especificacao>(p.especificacoes);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="grid aspect-square w-full max-w-[260px] place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {p.foto_caminho ? <img src={urlFotoProduto(p.foto_caminho)} alt={p.descricao} className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">sem foto principal</span>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dado rotulo="Preço de venda" valor={brl(Number(p.preco_venda || 0))} num />
          <Dado rotulo="Custo" valor={brl(Number(p.preco_custo || 0))} num />
          <Dado rotulo="Margem bruta" valor={margem == null ? null : <span className={margem < 0 ? "text-red-600" : margem < 20 ? "text-amber-700" : "text-emerald-700"}>{margem.toFixed(1).replace(".", ",")}%</span>} />
          {p.tipo !== "servico" && <Dado rotulo="Estoque" valor={`${Number(p.estoque_atual || 0).toLocaleString("pt-BR")} ${p.unidade}`} num />}
          {p.tipo !== "servico" && <Dado rotulo="Mínimo / máximo" valor={`${Number(p.estoque_minimo || 0)} / ${Number(p.estoque_maximo || 0)}`} num />}
          <Dado rotulo="Categoria" valor={p.categoria} />
          <Dado rotulo="Marca" valor={p.marca} />
          <Dado rotulo="Modelo" valor={p.modelo} />
          <Dado rotulo="Código do fabricante" valor={p.codigo_fabricante} />
          <Dado rotulo="Código de barras" valor={p.codigo_barras || (p.gtin_isento ? "sem GTIN" : null)} num />
          <Dado rotulo="NCM" valor={p.ncm} num />
          <Dado rotulo="Localização" valor={p.localizacao} />
          <Dado rotulo="Garantia" valor={p.garantia_meses ? `${p.garantia_meses} ${pl(p.garantia_meses, "mês", "meses")}` : null} />
        </dl>
      </div>
      {(p.marcadores?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">Marcadores:</span><ChipsMarcadores ids={p.marcadores} todos={marcadores} /></div>
      )}
      <section>
        <h3 className="mb-2 text-sm font-bold text-fg">Fotos e vídeos</h3>
        <GaleriaProduto produtoId={p.id} podeEditar={podeEditar} fotoPrincipal={p.foto_caminho} />
        {p.video_url && <a href={p.video_url} target="_blank" rel="noreferrer" className="link-acao mt-2 inline-flex items-center gap-1 text-sm"><ExternalLink size={14} /> Vídeo no YouTube</a>}
      </section>
      {p.tipo !== "maquina" && p.tipo !== "servico" && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"><Ruler size={15} aria-hidden /> Desenho técnico</h3>
          <DocumentosMaquina produtoId={p.id} podeEditar={podeEditar} tipos={["desenho"]} />
        </section>
      )}
      {p.tipo !== "servico" && (
        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-bold text-fg">Dimensões e peso</h3>
            <DesenhoMedidas largura={p.largura_cm} altura={p.altura_cm} profundidade={p.profundidade_cm} peso={p.peso_kg} embalagem={embalagem?.descricao} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold text-fg">Campos adicionais</h3>
            {campos.length ? (
              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                {campos.map((c, i) => <div key={i} className="flex justify-between gap-3 px-3 py-1.5"><dt className="text-slate-500">{c.nome}</dt><dd className="text-right font-semibold text-fg">{c.valor}</dd></div>)}
              </dl>
            ) : <p className="text-xs text-slate-500">Nenhum. Em "Editar cadastro" dá para incluir (ex.: voltagem, part number, compatível com).</p>}
            {p.observacoes && <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>Observações internas:</b> {p.observacoes}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function AbaAnuncios({ p }: { p: ProdutoFicha }) {
  // o que o ERP manda para cada anúncio do Mercado Livre ligado a este produto (mesmo cálculo do envio)
  const { anuncios: ml, conta, carregando, erro } = useAnunciosML(p.id);
  const envioLigado = !!conta && (!!conta.enviar_estoque || !!conta.enviar_preco);
  const nota = avaliarAnuncio(p as never);
  const naLoja = !!p.no_catalogo && !!p.foto_caminho && Number(p.preco_venda) > 0 && p.ativo !== false;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
        <span className={`num rounded-lg px-2.5 py-1 text-lg font-bold ${nota.nota >= 90 ? "bg-emerald-100 text-emerald-800" : nota.nota >= 70 ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{nota.nota}/100</span>
        <div className="min-w-0 flex-1 text-sm">
          <b className="text-fg">Nota do anúncio</b>
          <span className="block text-xs text-slate-600">{nota.pendencias.length ? `Falta: ${nota.pendencias.map((x) => x.texto).join(" · ")}` : "Pronto para anunciar em qualquer marketplace."}</span>
        </div>
      </div>
      <section>
        <h3 className="mb-2 text-sm font-bold text-fg">Mercado Livre: o que o ERP manda</h3>
        {ml.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {ml.map((a) => (
              <li key={a.anuncio_id} className="grid gap-2 p-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <a href={linkAnuncio(a.ml_item_id)} target="_blank" rel="noreferrer" className="link-acao inline-flex items-center gap-1">{a.titulo || a.ml_item_id} <ExternalLink size={12} /></a>
                  <span className="num block text-xs text-slate-500">{a.ml_item_id}{a.variation_id ? ` · variação ${a.variation_id}` : ""}</span>
                  <span className="mt-1 block"><SituacaoChip s={a.situacao} /></span>
                  {detalheSituacao(a) && <span className={`mt-0.5 block text-xs ${a.situacao === "erro" ? "text-red-700" : "text-slate-500"}`}>{detalheSituacao(a)}</span>}
                </div>
                <div className="min-w-0"><span className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">Estoque</span><CelulaEstoque a={a} /></div>
                <div className="min-w-0"><span className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">Preço</span><CelulaPreco a={a} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
            {carregando ? "Carregando…" : erro ? "Sem acesso aos anúncios do Mercado Livre."
              : conta ? "Nenhum anúncio ligado a este produto. Em Vendas → Mercado Livre, \"Buscar anúncios\" liga pelo mesmo SKU; ou ligue na lista."
              : "Quando a conta do Mercado Livre estiver conectada, os anúncios com o mesmo SKU aparecem aqui com o estoque e o preço que o ERP manda."}
          </p>
        )}
        {ml.length > 0 && !envioLigado && <p className="mt-1 text-xs text-amber-800">O envio de estoque e preço está desligado (Vendas → Mercado Livre → Envio de estoque e preço).</p>}
      </section>
      <Table head={<><th className="th">Onde</th><th className="th">Situação</th><th className="th">Anúncio</th></>}>
        <tr>
          <td className="td font-semibold">Loja do site e catálogo do WhatsApp</td>
          <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${naLoja ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{naLoja ? "no ar" : p.no_catalogo ? "falta foto ou preço" : "fora do catálogo"}</span></td>
          <td className="td">{naLoja ? <a href={urlLoja(p.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><Store size={13} /> Abrir na loja</a> : <span className="text-xs text-slate-500">Marque "Mostrar no catálogo" no cadastro.</span>}</td>
        </tr>
        <tr>
          <td className="td font-semibold">Google Shopping</td>
          <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${naLoja && (p.codigo_barras || p.gtin_isento) ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{naLoja ? (p.codigo_barras || p.gtin_isento ? "na lista do Google" : "falta código de barras") : "fora"}</span></td>
          <td className="td text-xs text-slate-500">Vai junto com a loja (lista de produtos do Google gerada pelo ERP).</td>
        </tr>
      </Table>
      {p.titulo_anuncio && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <b className="text-fg">{p.titulo_anuncio}</b>
          {p.meta_descricao && <p className="mt-1 text-xs text-slate-600">{p.meta_descricao}</p>}
          {!!p.palavras_chave?.length && <p className="mt-1 text-xs text-slate-500">Palavras-chave: {p.palavras_chave.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

function AbaCustos({ p }: { p: ProdutoFicha }) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["historico_custos", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("historico_custos", { p_produto: p.id });
      if (error) throw error;
      return (data ?? []) as LinhaCusto[];
    },
  });
  const umAno = useMemo(() => `${Number(hoje().slice(0, 4)) - 1}${hoje().slice(4)}`, []); // um ano antes de hoje (Brasília)
  const ano = custoMedioCompras(data, umAno), tudo = custoMedioCompras(data);
  const ultima = data.find((l) => l.evento === "compra" && Number(l.valor_unitario) > 0);
  if (error) return <p className="text-sm text-red-600">Não deu para ler o histórico de custos: {(error as Error).message}</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao rotulo="Custo no cadastro" valor={brl(Number(p.preco_custo || 0))} />
        <Cartao rotulo="Última compra" valor={ultima ? brl(Number(ultima.valor_unitario)) : "—"} ajuda={ultima ? dataBR(String(ultima.data).slice(0, 10)) : "sem compra pelas notas"} />
        <Cartao rotulo="Custo médio (12 meses)" valor={ano ? brl(ano.medio) : "—"} ajuda={ano ? `${ano.compras} ${pl(ano.compras, "compra", "compras")} · ${ano.quantidade.toLocaleString("pt-BR")} ${p.unidade}` : "sem compra no último ano"} />
        <Cartao rotulo="Menor / maior pago" valor={tudo ? `${brl(tudo.menor)} / ${brl(tudo.maior)}` : "—"} />
      </div>
      {ultima && Number(p.preco_custo) > 0 && Math.abs(Number(ultima.valor_unitario) - Number(p.preco_custo)) / Number(p.preco_custo) > 0.05 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">A última compra ({brl(Number(ultima.valor_unitario))}) está {Number(ultima.valor_unitario) > Number(p.preco_custo) ? "acima" : "abaixo"} do custo do cadastro ({brl(Number(p.preco_custo))}). Confira na Formação de preço.</p>
      )}
      <Table empty={!isLoading && !data.length} head={<><th className="th">Quando</th><th className="th">O quê</th><th className="th text-right">Qtd.</th><th className="th text-right">Valor pago</th><th className="th text-right">Custo</th><th className="th text-right">Venda</th><th className="th text-right">Estoque</th></>}>
        {data.map((l, i) => (
          <tr key={i}>
            <td className="td whitespace-nowrap">{dataBR(String(l.data).slice(0, 10))}</td>
            <td className="td">
              <span className={`mr-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${l.evento === "compra" ? "bg-sky-100 text-sky-800" : l.evento === "cadastro" ? "bg-slate-100 text-slate-700" : "bg-violet-100 text-violet-800"}`}>
                {l.evento === "compra" ? "compra" : l.evento === "cadastro" ? "cadastro" : "mudança"}
              </span>
              <span className="text-xs text-slate-600">{l.detalhe ?? ""}{l.usuario ? ` · ${l.usuario}` : ""}</span>
            </td>
            <td className="td num text-right">{l.quantidade != null ? Number(l.quantidade).toLocaleString("pt-BR") : ""}</td>
            <td className="td num text-right">{l.valor_unitario != null ? brl(Number(l.valor_unitario)) : ""}</td>
            <td className="td num text-right">{l.preco_custo != null ? brl(Number(l.preco_custo)) : ""}</td>
            <td className="td num text-right">{l.preco_venda != null ? brl(Number(l.preco_venda)) : ""}</td>
            <td className="td num text-right">{l.saldo != null ? Number(l.saldo).toLocaleString("pt-BR") : ""}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-slate-500">As compras vêm das notas de fornecedor com o mesmo código de barras, SKU, código do fabricante ou código do fornecedor. As mudanças de custo e preço são registradas desde a auditoria do cadastro.</p>
    </div>
  );
}

function Cartao({ rotulo, valor, ajuda }: { rotulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="num text-base font-bold text-fg">{valor}</div>
      {ajuda && <div className="text-2xs text-slate-500">{ajuda}</div>}
    </div>
  );
}

function AbaMaquina({ p, podeEditar }: { p: ProdutoFicha; podeEditar: boolean }) {
  const espec = lista<Especificacao>(p.especificacoes), etapas = lista<string>(p.etapas_producao);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section>
        <h3 className="mb-2 text-sm font-bold text-fg">Especificações</h3>
        {espec.length ? (
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {espec.map((e, i) => <div key={i} className="flex justify-between gap-3 px-3 py-1.5"><dt className="text-slate-500">{e.nome}</dt><dd className="text-right font-semibold text-fg">{e.valor}</dd></div>)}
          </dl>
        ) : <p className="text-xs text-slate-500">Nenhuma ainda (voltagem, potência, produção por hora…). Preencha em "Editar cadastro".</p>}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-bold text-fg">Etapas de produção</h3>
        {etapas.length ? (
          <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {etapas.map((e, i) => <li key={i} className="flex gap-2 px-3 py-1.5"><span className="num w-5 text-xs font-bold text-slate-400">{i + 1}</span><span className="font-medium text-fg">{e}</span></li>)}
          </ol>
        ) : <p className="text-xs text-slate-500">Nenhuma etapa. Elas viram a lista de conferência de cada ordem de produção.</p>}
      </section>
      <section className="md:col-span-2">
        <h3 className="mb-2 text-sm font-bold text-fg">Manuais e documentos</h3>
        <DocumentosMaquina produtoId={p.id} podeEditar={podeEditar} />
      </section>
      <section className="md:col-span-2">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"><Wrench size={15} /> Dicas de manutenção</h3>
        {p.dicas_manutencao ? <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{p.dicas_manutencao}</p> : <p className="text-xs text-slate-500">Nenhuma dica ainda. O cliente lê estas dicas na página da máquina dele.</p>}
      </section>
    </div>
  );
}

type EquipFicha = { id: string; token: string | null; numero_serie: string | null; data_venda: string | null; garantia_ate: string | null; proxima_preventiva: string | null;
  cliente: { id: string; nome: string; nome_fantasia: string | null; whatsapp: string | null; telefone: string | null; municipio: string | null; uf: string | null } | null };

function AbaClientes({ p }: { p: ProdutoFicha }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["equipamentos", "ficha_produto", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipamentos")
        .select("id, token, numero_serie, data_venda, garantia_ate, proxima_preventiva, cliente:clientes(id, nome, nome_fantasia, whatsapp, telefone, municipio, uf)")
        .eq("produto_id", p.id).order("data_venda", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EquipFicha[];
    },
  });
  const dia = hoje();
  const emGarantia = data.filter((e) => e.garantia_ate && e.garantia_ate >= dia).length;
  async function copiar(token: string) {
    try { await navigator.clipboard.writeText(linkMaquina(token)); notify("Link da máquina copiado"); } catch { notify(linkMaquina(token)); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600"><b className="text-fg">{data.length}</b> {pl(data.length, "máquina", "máquinas")} deste modelo com clientes · <b className="text-emerald-700">{emGarantia}</b> em garantia.</p>
      <Table empty={!isLoading && !data.length} head={<><th className="th">Cliente</th><th className="th">Série</th><th className="th">Garantia</th><th className="th">Preventiva</th><th className="th">Enviar ao cliente</th></>}>
        {data.map((e) => {
          const nome = e.cliente?.nome_fantasia || e.cliente?.nome || "—";
          const fone = e.cliente?.whatsapp || e.cliente?.telefone;
          return (
            <tr key={e.id}>
              <td className="td"><span className="font-semibold text-fg">{nome}</span><span className="block text-xs text-slate-500">{[e.cliente?.municipio, e.cliente?.uf].filter(Boolean).join("/")}</span></td>
              <td className="td num">{e.numero_serie ?? "—"}</td>
              <td className="td">{e.garantia_ate ? <span className={e.garantia_ate >= dia ? "font-semibold text-emerald-700" : "text-slate-500"}>{e.garantia_ate >= dia ? "até " : "terminou "}{dataBR(e.garantia_ate)}</span> : "—"}</td>
              <td className="td">{e.proxima_preventiva ? <span className={e.proxima_preventiva < dia ? "font-semibold text-amber-700" : ""}>{dataBR(e.proxima_preventiva)}</span> : "—"}</td>
              <td className="td">
                {e.token ? (
                  <span className="flex flex-wrap gap-1">
                    {fone && <a href={whatsappLink(fone, mensagemMaquina(nome, p.descricao, e.token))} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"><MessageCircle size={13} /> Manuais</a>}
                    <Button type="button" tamanho="mini" variant="secondary" onClick={() => copiar(e.token!)}><Copy size={12} /> Link</Button>
                  </span>
                ) : "—"}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

type OsFicha = { id: string; numero: number; numero_serie: string | null; status: string; em_garantia: boolean; data_entrada: string; defeito_relatado: string | null;
  cliente: { nome: string; nome_fantasia: string | null } | null;
  itens: { descricao: string; quantidade: number; valor_unitario: number; produto: { preco_custo: number | null } | null }[] };

function AbaAssistencia({ p }: { p: ProdutoFicha }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["ordens_servico", "ficha_produto", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ordens_servico")
        .select("id, numero, numero_serie, status, em_garantia, data_entrada, defeito_relatado, excluida_em, cliente:clientes(nome, nome_fantasia), itens:os_itens(descricao, quantidade, valor_unitario, produto:produtos(preco_custo))")
        .eq("produto_id", p.id).order("data_entrada", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as (OsFicha & { excluida_em?: string | null })[]).filter((o) => !o.excluida_em);
    },
  });
  const g = pecasEmGarantia(data);
  const garantia = data.filter((o) => o.em_garantia).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao rotulo="OS deste modelo" valor={String(data.length)} />
        <Cartao rotulo="Em garantia" valor={String(garantia)} />
        <Cartao rotulo="Peças em garantia" valor={g.quantidade.toLocaleString("pt-BR")} />
        <Cartao rotulo="Custo da garantia" valor={brl(g.custo)} ajuda="peças pelo custo do cadastro" />
      </div>
      {g.pecas.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"><ShieldCheck size={15} /> Peças trocadas em garantia</h3>
          <Table head={<><th className="th">Peça</th><th className="th text-right">Qtd.</th><th className="th text-right">Custo</th></>}>
            {g.pecas.map((x) => <tr key={x.descricao}><td className="td">{x.descricao}</td><td className="td num text-right">{x.quantidade.toLocaleString("pt-BR")}</td><td className="td num text-right">{brl(x.custo)}</td></tr>)}
          </Table>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-bold text-fg">Ordens de serviço</h3>
        <Table empty={!isLoading && !data.length} head={<><th className="th">OS</th><th className="th">Entrada</th><th className="th">Cliente</th><th className="th">Defeito</th><th className="th">Situação</th></>}>
          {data.map((o) => (
            <tr key={o.id}>
              <td className="td num font-semibold">#{o.numero}</td>
              <td className="td whitespace-nowrap">{dataBR(o.data_entrada)}</td>
              <td className="td">{o.cliente?.nome_fantasia || o.cliente?.nome || "—"}{o.numero_serie ? <span className="num block text-xs text-slate-500">série {o.numero_serie}</span> : null}</td>
              <td className="td text-xs">{o.defeito_relatado ?? ""}</td>
              <td className="td">{o.status.replace(/_/g, " ")}{o.em_garantia && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-2xs font-semibold text-emerald-800">garantia</span>}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
