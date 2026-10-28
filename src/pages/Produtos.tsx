import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownUp, Boxes, FileSpreadsheet, History, IdCard, LayoutDashboard, ListChecks, PlugZap, RefreshCw, Wrench } from "lucide-react";
import { CrudPage, type FiltroCrud, type OrdemCrud } from "@/components/CrudPage";
import { DefinirLinha } from "@/components/comissoes/LinhasProduto";
import type { LinhaProduto } from "@/lib/comissao";
import { FotoProduto } from "@/components/FotoProduto";
import { FornecedoresProduto } from "@/components/FornecedoresProduto";
import { useMarcadores } from "@/components/nfe/Marcadores";
import { erroVariacao, opcoesPai, variacoesPorPai } from "@/lib/variacoes";
import { FORMATOS, faltaMedida, inteiroNaUnidade } from "@/lib/material";
import { pendenciaCatalogo, urlFotoProduto } from "@/lib/catalogo";
import { Badge, Button, Field, Modal, Table, Tabs } from "@/components/ui";
import { brl, hoje, pl, somarDias } from "@/lib/format";
import { useInvalidate, useRows, semUnificados } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { Produto } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { CampoUnidade, EtiquetaUnidade, useUnidade } from "@/lib/unidade";
import { RegistrarBaixa } from "@/components/fiscal/BaixaEstoque";
import { ImportarProdutos } from "@/components/ImportarProdutos";
import { ImportarKitsTiny } from "@/components/produtos/ImportarKitsTiny";
import { KitComponentesModal } from "@/components/KitComponentes";
import { estoqueKit } from "@/lib/kits";
import type { KitComponente } from "@/lib/types";
import { QualidadeProdutos } from "@/components/QualidadeProdutos";
import { ConferenciaEan } from "@/components/produtos/CodigosEan";
import { contextoEan, erroCodigoNovo, soDigitos, type ProdutoEan } from "@/lib/gtin";
import { useConfig } from "@/lib/useConfig";
import { avaliarAnuncio, correcaoAutomatica, slugDe, LIMITE_META, LIMITE_TITULO } from "@/lib/marketplace";
import { ContagemEstoque } from "@/components/ContagemEstoque";
import { CampoCategoriaProduto, CategoriasProdutos, opcoesCategoria, useCategoriasProduto } from "@/components/CategoriasProdutos";
import { DescricaoMudanca, type LinhaAuditoria } from "@/components/Historico";
import { parecidos, resumoMovimentos, sugerirMinimo, UNIDADES, type Movimento } from "@/lib/qualidadeProdutos";
import { vendidosPorProduto } from "@/lib/gerencial";
import { custoUnitario, margemBruta } from "@/lib/margem";
import { usePrecosPendentes } from "@/components/produtos/FormacaoPreco";
import { ListaImpostosMaquinas } from "@/components/produtos/ImpostosVenda";
import { configPreco, margemAlvo, precoSugerido } from "@/lib/precificacao";
import { pedirTexto } from "@/components/Dialogos";
import { useAbaUrl } from "@/lib/abaUrl";
import { useVisivel } from "@/lib/menu";
import { UnificarProdutosLista } from "@/components/produtos/UnificarProdutosLista";
import { DocumentosMaquina, GaleriaProduto } from "@/components/produtos/GaleriaProduto";
import { AssistenteIA } from "@/components/produtos/AssistenteIA";
import { DesenhoMedidas } from "@/components/produtos/DesenhoMedidas";
import { CampoNcm } from "@/components/produtos/SugerirNcm";
import { EditorEspecificacoes, EditorEtapas, SUGESTOES_ESPEC, SUGESTOES_PECA, type Especificacao } from "@/components/produtos/EditoresMaquina";
import { FichaProduto, UltimasCompras } from "@/components/produtos/FichaProduto";
import { ModelosMaquinas } from "@/components/produtos/ModelosMaquinas";
import { ManuaisMaquinas } from "@/components/produtos/ManuaisMaquinas";
import { FichaTecnica } from "@/components/producao/FichaTecnica";
import { ReceitasTornearia } from "@/components/producao/ReceitasTornearia";
import { ConferirItensNotas } from "@/components/compras/ConferirItensNotas";

const tipos = [
  { value: "maquina", label: "Máquina" },
  { value: "peca", label: "Peça de reposição (cliente compra)" },
  { value: "acessorio", label: "Acessório" },
  { value: "insumo", label: "Componente de produção (uso interno)" },
  { value: "servico", label: "Serviço (sem estoque)" },
];

const TIPOS_PRODUTO: Record<string, string> = { maquina: "Máquinas", peca: "Peças de reposição", acessorio: "Acessórios", insumo: "Componentes de produção", servico: "Serviços" };

/** Os três cadastros: máquinas, peças de reposição (catálogo, o cliente compra) e componentes para fabricar as máquinas. */
export type Cadastro = "maquinas" | "pecas" | "tornearia" | "componentes" | "servicos" | "todos";
const CADASTROS: { id: Cadastro; titulo: string; ajuda: string; cor: string; padrao: Record<string, unknown> }[] = [
  { id: "maquinas", titulo: "Máquinas", ajuda: "As máquinas que a MF fabrica e vende.", cor: "bg-fixo-emerald-600",
    padrao: { tipo: "maquina", vendavel: true, no_catalogo: false } },
  { id: "pecas", titulo: "Peças à venda", ajuda: "O que o cliente compra: vai para o catálogo e para os pedidos.", cor: "bg-fixo-blue-600",
    padrao: { tipo: "peca", vendavel: true, no_catalogo: true } },
  { id: "tornearia", titulo: "Tornearia (usinadas)", ajuda: "Peças usinadas na tornearia, com o marcador \"Tornearia\". A usinada que também vende aparece aqui e em Peças à venda.", cor: "bg-fixo-purple-600",
    padrao: { tipo: "insumo", vendavel: false, no_catalogo: false } },
  { id: "componentes", titulo: "Insumos", ajuda: "O que vai dentro das máquinas e é consumido na fábrica (ficha técnica). Peça à venda que também é usada na fábrica aparece aqui com a etiqueta \"também vende\".", cor: "bg-fixo-red-600",
    padrao: { tipo: "insumo", vendavel: false, no_catalogo: false } },
  { id: "servicos", titulo: "Serviços", ajuda: "Carga de gás, limpeza e lavagem, troca de compressor, reparo em mecânica… Não controlam estoque; na OS entram como mão de obra.", cor: "bg-fixo-cyan-700",
    padrao: { tipo: "servico", vendavel: true, no_catalogo: false, unidade: "UN", ncm: "00000000", gtin_isento: true } },
  { id: "todos", titulo: "Todos", ajuda: "Peças, componentes e serviços juntos. As máquinas ficam na tela Máquinas (menu Fábrica e estoque).", cor: "bg-fixo-slate-700", padrao: {} },
];
const txt = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base" });
const FILTROS_PRODUTO: FiltroCrud<Produto>[] = [
  { label: "Tipo", opcoes: Object.entries(TIPOS_PRODUTO).map(([v, label]) => ({ label, teste: (r: Produto) => r.tipo === v })) },
  { label: "Categoria", valor: (r) => r.categoria },
  { label: "Marca", valor: (r) => r.marca },
  { label: "Estoque", opcoes: [
    { label: "Com estoque", teste: (r) => Number(r.estoque_atual) > 0 },
    { label: "Sem estoque", teste: (r) => Number(r.estoque_atual) <= 0 },
    { label: "No mínimo ou abaixo", teste: (r) => Number(r.estoque_minimo) > 0 && Number(r.estoque_atual) <= Number(r.estoque_minimo) },
  ] },
  { label: "Situação", opcoes: [
    { label: "Ativos", teste: (r) => r.ativo !== false }, { label: "Inativos", teste: (r) => r.ativo === false },
    { label: "Fora de linha", teste: (r) => !!r.fora_de_linha }, { label: "Sob encomenda", teste: (r) => !!r.sob_encomenda },
  ] },
  { label: "Cadastro", opcoes: [
    { label: "Sem código (SKU)", teste: (r) => !String(r.sku ?? "").trim() },
    { label: "Sem categoria", teste: (r) => !String(r.categoria ?? "").trim() },
    { label: "Sem localização", teste: (r) => !String(r.localizacao ?? "").trim() },
    { label: "Sem fornecedor padrão", teste: (r) => !r.fornecedor_padrao_id },
    { label: "Preço abaixo do custo", teste: (r) => Number(r.preco_venda) > 0 && Number(r.preco_custo) > Number(r.preco_venda) },
  ] },
  // envio: peso e medidas entram na cotação de frete; medidas podem vir da embalagem padrão
  { label: "Frete", opcoes: [
    { label: "Sem peso", teste: (r) => !Number(r.peso_kg) },
    { label: "Sem medidas nem embalagem", teste: (r) => !r.embalagem_id && ![r.largura_cm, r.altura_cm, r.profundidade_cm].every((v) => Number(v) > 0) },
    { label: "Peso de 1 kg (conferir se é real)", teste: (r) => Number(r.peso_kg) === 1 },
    { label: "Unidade diferente de UN", teste: (r) => String(r.unidade ?? "").trim().toUpperCase() !== "UN" },
  ] },
  { label: "Fiscal", opcoes: [
    { label: "Sem NCM válido", teste: (r) => String(r.ncm ?? "").replace(/\D/g, "").length !== 8 },
    { label: "Sem preço de venda", teste: (r) => !Number(r.preco_venda) },
    { label: "Sem custo", teste: (r) => !Number(r.preco_custo) },
  ] },
];
const ORDENS_PRODUTO: OrdemCrud<Produto>[] = [
  { label: "descrição (A–Z)", comparar: (a, b) => txt(a.descricao, b.descricao) },
  { label: "SKU", comparar: (a, b) => txt(a.sku, b.sku) },
  { label: "maior estoque", comparar: (a, b) => Number(b.estoque_atual) - Number(a.estoque_atual) },
  { label: "menor estoque", comparar: (a, b) => Number(a.estoque_atual) - Number(b.estoque_atual) },
  { label: "maior preço", comparar: (a, b) => Number(b.preco_venda) - Number(a.preco_venda) },
  { label: "mais recentes", comparar: (a, b) => Date.parse((b as any).created_at ?? 0) - Date.parse((a as any).created_at ?? 0) },
];

/** Ativa/inativa vários produtos de uma vez (produto com movimentação não pode ser excluído). */
async function situacaoProdutos(ids: string[], ativo: boolean) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("produtos").update({ ativo }).in("id", ids.slice(i, i + 200));
    if (error) throw error;
  }
  return `${ids.length} ${pl(ids.length, "produto", "produtos")} ${ativo ? pl(ids.length, "ativado", "ativados") : pl(ids.length, "inativado", "inativados")}`;
}

/** Rota de cada cadastro no menu (Cadastros → Máquinas, Peças de reposição, Componentes de produção). */
export const ROTA_CADASTRO: Record<Cadastro, string> = { maquinas: "/produtos/maquinas", pecas: "/estoque", tornearia: "/produtos/tornearia", componentes: "/produtos/componentes", servicos: "/produtos/servicos", todos: "/produtos/todos" };

export default function Produtos({ cadastroFixo }: { cadastroFixo?: Cadastro } = {}) {
  const { data: produtosTodos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: cfgProd } = useConfig();
  /** Anúncio ao salvar: palavras-chave em lista, endereço válido e o que ficou vazio preenchido no padrão (só produtos que vendem). */
  function anuncioAoSalvar(r: Record<string, any>) {
    const palavras = Array.isArray(r.palavras_chave) ? r.palavras_chave : String(r.palavras_chave ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const base = { ...r, palavras_chave: palavras, slug: r.slug ? slugDe(r.slug) || null : null };
    if (!r.descricao || r.tipo === "insumo" || r.vendavel === false) return { palavras_chave: palavras, slug: base.slug };
    const usados = new Set(produtosTodos.filter((p) => p.id !== r.id && p.slug && p.ativo !== false).map((p) => p.slug as string));
    if (base.slug && usados.has(base.slug)) base.slug = null;
    const auto = correcaoAutomatica(base as any, usados, Number(cfgProd?.garantia_meses_padrao) || 3);
    const { descricao: _nome, ...semNome } = auto;   // o nome só muda se a pessoa mudar (ou pela auditoria)
    return { palavras_chave: semNome.palavras_chave ?? palavras, slug: semNome.slug ?? base.slug, titulo_anuncio: semNome.titulo_anuncio ?? (r.titulo_anuncio || null),
      meta_descricao: semNome.meta_descricao ?? (r.meta_descricao || null), descricao_anuncio: semNome.descricao_anuncio ?? (r.descricao_anuncio || null),
      ...(semNome.marca ? { marca: semNome.marca } : {}) };
  }
  const navigate = useNavigate();
  const { pode, papel, tem } = usePerfil();
  const vis = useVisivel();
  // o aviso "Preços para revisar" abre direto na aba (…?aba=precos)
  const [busca] = useSearchParams();
  // Máquinas ganham as abas Ficha técnica e Manuais (?aba=ficha&maquina=<id> abre a ficha daquela máquina)
  // Preços e Tabelas de preço foram para a Gestão de preços (/precos) e Anúncios para a Loja online e marketplace
  // (/mercado-livre?aba=marketplace) em 23/10; os endereços antigos levam para lá.
  type AbaProdutos = "produtos" | "receita" | "ficha" | "manuais" | "impostos" | "qualidade" | "contagem" | "categorias";
  const abasValidas: readonly AbaProdutos[] = cadastroFixo === "maquinas"
    ? ["produtos", "ficha", "manuais", "impostos", "qualidade", "contagem", "categorias"]
    : cadastroFixo === "tornearia" ? ["produtos", "receita", "qualidade", "contagem", "categorias"]
    : ["produtos", "qualidade", "contagem", "categorias"];
  const [aba, setAba] = useAbaUrl<AbaProdutos>("produtos", abasValidas);
  useEffect(() => {
    const antiga = busca.get("aba");
    if (antiga === "precos") navigate("/precos", { replace: true });
    else if (antiga === "tabelas") navigate("/precos?aba=tabelas", { replace: true });
    else if (antiga === "auditoria") navigate("/mercado-livre?aba=marketplace", { replace: true });
  }, [busca, navigate]);
  const [fichaDe, setFichaDe] = useState<string | undefined>(() => busca.get("maquina") ?? undefined);
  const { data: precosPendentes = 0 } = usePrecosPendentes();
  const { data: categorias = [] } = useCategoriasProduto();
  const [editarAgora, setEditarAgora] = useState<Produto | null>(null);
  // ?editar=<id> abre o cadastro daquele produto (ex.: "abrir" na aba Marketplace da loja online)
  const editarId = busca.get("editar");
  useEffect(() => {
    if (!editarId || !produtosTodos.length) return;
    const p = produtosTodos.find((x) => x.id === editarId);
    if (p) setEditarAgora({ ...p });
  }, [editarId, produtosTodos]);
  const [ficha, setFicha] = useState<Produto | null>(null);
  const [itensNotas, setItensNotas] = useState(false);
  // só as saídas contam no consumo (giro e última saída): não baixa a tabela inteira de movimentos
  const { data: movimentos = [] } = useRows<Movimento>("estoque_movimentos", { select: "produto_id, tipo, quantidade, created_at", key: ["saidas"], filtro: (q) => q.eq("tipo", "saida") });
  const { data: codigosForn = [] } = useRows<{ produto_id: string; codigo_fornecedor: string; fator_conversao: number; fornecedor: { nome: string } | null }>(
    "produto_fornecedor", { select: "produto_id, codigo_fornecedor, fator_conversao, fornecedor:fornecedores(nome)", order: "produto_id" });
  const { data: fornecedoresTodos = [] } = useRows<{ id: string; nome: string }>("fornecedores", { order: "nome", ascending: true });
  const fornecedores = semUnificados(fornecedoresTodos);
  const { data: embalagens = [] } = useRows<{ id: string; descricao: string; ativo: boolean }>("embalagens", { order: "descricao", ascending: true });
  const [movimentar, setMovimentar] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<Produto | null>(null);
  const [importar, setImportar] = useState(false);
  const [importarKits, setImportarKits] = useState(false);
  /** Unificar os marcados na lista: a janela devolve a mensagem quando termina (ou "Nada mudou"). */
  const [unificando, setUnificando] = useState<{ lista: Produto[]; fim: (mensagem: string) => void } | null>(null);
  const [definindoLinha, setDefinindoLinha] = useState<{ ids: string[]; fim: (mensagem: string) => void } | null>(null);
  const { data: linhas = [] } = useRows<LinhaProduto>("linhas_produto", { order: "nome", ascending: true });
  // fornecedores de cada produto (como no Tiny): o padrão, os do cadastro de fornecimento e os das notas de entrada
  const { data: fornecimentos = [] } = useRows<{ produto_id: string; codigo_fornecedor: string | null; fornecedor: { nome: string } | null }>(
    "fornecimentos", { select: "produto_id, codigo_fornecedor, fornecedor:fornecedores(nome)", order: "produto_id" });
  const fornecedoresDoProduto = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const por = (id: string, nome?: string | null) => { if (!nome?.trim()) return; const s0 = m.get(id) ?? new Set<string>(); s0.add(nome.trim()); m.set(id, s0); };
    for (const x of fornecimentos) por(x.produto_id, x.fornecedor?.nome);
    for (const x of codigosForn) por(x.produto_id, x.fornecedor?.nome);
    return m;
  }, [fornecimentos, codigosForn]);
  const nomeFornecedor = useMemo(() => new Map(fornecedoresTodos.map((f) => [f.id, f.nome])), [fornecedoresTodos]);
  const filtrosProduto = useMemo<FiltroCrud<Produto>[]>(() => [...FILTROS_PRODUTO,
    { label: "Linha", valor: (r) => linhas.find((l) => l.id === r.linha_id)?.nome ?? null },
    { label: "Fornecedor", valores: (r) => [r.fornecedor_padrao_id ? nomeFornecedor.get(r.fornecedor_padrao_id) : null, ...(fornecedoresDoProduto.get(r.id) ?? [])] }],
  [linhas, fornecedoresDoProduto, nomeFornecedor]);
  const [kitAberto, setKitAberto] = useState<Produto | null>(null);
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: fichas = [] } = useRows<{ produto_id: string; componente_id: string }>("produto_componentes", { select: "produto_id, componente_id", order: "produto_id" });
  // cada cadastro tem a sua entrada no menu; "Todos" (/estoque) mostra tudo
  // a tela de abertura (Produtos e estoque) é a das peças à venda
  const cadastro: Cadastro = cadastroFixo ?? "pecas";
  const escolherCadastro = (c: Cadastro) => navigate(ROTA_CADASTRO[c]);
  const [verSugestao, setVerSugestao] = useState(false);
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  // códigos de cada fornecedor (das notas ligadas e dos fornecimentos): aparecem na lista e entram na busca
  const codigosFornecedor = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of [...codigosForn, ...fornecimentos]) {
      const c = f.codigo_fornecedor?.trim();
      if (c && !(m.get(f.produto_id) ?? []).includes(c)) m.set(f.produto_id, [...(m.get(f.produto_id) ?? []), c]);
    }
    return m;
  }, [codigosForn, fornecimentos]);
  const variacoes = useMemo(() => variacoesPorPai(produtos), [produtos]);
  const nomePai = useMemo(() => new Map(produtos.filter((p) => p.agrupador).map((p) => [p.id, p.descricao])), [produtos]);
  const textoVariacao = (r: Produto) => r.agrupador ? `Pai · ${variacoes.get(r.id)?.length ?? 0} ${pl(variacoes.get(r.id)?.length ?? 0, "variação", "variações")}`
    : r.produto_pai_id ? `Variação ${r.variacao ?? ""} de ${nomePai.get(r.produto_pai_id) ?? "outro produto"}`.replace("  ", " ") : "";
  const textoFornecedor = (r: Produto) => { const c = codigosFornecedor.get(r.id); return c?.length ? `Forn. ${c.join(", ")}` : ""; };
  const { unidades, atual } = useUnidade();
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const saldoPor = useMemo(() => new Map(saldos.map((s) => [`${s.produto_id}|${s.unidade_id}`, Number(s.quantidade)])), [saldos]);
  const saldo = (p: string, u: string) => saldoPor.get(`${p}|${u}`) ?? 0;
  // vendidos nos últimos 3 meses (pedidos aprovados + notas do sistema anterior), da unidade escolhida
  const desde3m = useMemo(() => somarDias(-89), []);
  const { data: pedidos3m = [] } = useQuery({
    queryKey: ["pedidos", "vendidos-3m", desde3m],
    queryFn: async () => {
      // o pedido conta na data da aprovação: busca os criados até 1 ano antes
      const { data, error } = await supabase.from("pedidos")
        .select("id, numero, status, valor_total, created_at, aprovado_em, unidade_id, itens:pedido_itens(produto_id, descricao, quantidade, valor_unitario)")
        .gte("created_at", new Date(Date.parse(desde3m) - 365 * 864e5).toISOString())
        .or(`aprovado_em.gte.${desde3m},created_at.gte.${desde3m}`);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: notas3m = [] } = useQuery({
    queryKey: ["notas_fiscais", "vendidos-3m", desde3m],
    queryFn: async () => {
      const { data, error } = await supabase.from("notas_fiscais")
        // da nota só interessam os itens (o JSON inteiro é pesado)
        .select("id, numero, status, ambiente, finalidade, tipo_operacao, pedido_id, valor_total, created_at, unidade_id, itens_nota:payload->items")
        .gte("created_at", desde3m);
      if (error) throw error;
      return ((data ?? []) as any[]).map(({ itens_nota, ...n }) => ({ ...n, payload: { items: itens_nota ?? [] } }));
    },
  });
  const vendidos3m = useMemo(() => {
    const daUnidade = (x: { unidade_id?: string | null }) => !atual || x.unidade_id === atual;
    return vendidosPorProduto(pedidos3m.filter(daUnidade), notas3m.filter(daUnidade), produtos, desde3m);
  }, [pedidos3m, notas3m, produtos, atual, desde3m]);
  // componentes da ficha técnica das máquinas: são da produção (mesmo os que também vendemos como reposição)
  const naProducao = useMemo(() => new Set(fichas.map((f) => f.componente_id)), [fichas]);
  const { data: marcadoresTodos = [] } = useMarcadores();
  const idTornearia = useMemo(() => marcadoresTodos.find((m) => m.ativo !== false && m.nome.trim().toLowerCase() === "tornearia")?.id, [marcadoresTodos]);
  const doCadastro = useMemo(() => ({
    maquinas: (r: Produto) => r.tipo === "maquina",
    pecas: (r: Produto) => r.tipo === "peca" || r.tipo === "acessorio",
    tornearia: (r: Produto) => !!idTornearia && (r.marcadores ?? []).includes(idTornearia),
    componentes: (r: Produto) => r.tipo === "insumo" || (r.tipo !== "maquina" && r.tipo !== "servico" && naProducao.has(r.id)),
    servicos: (r: Produto) => r.tipo === "servico",
    // as máquinas têm tela própria (Máquinas): ficam fora de "Todos"
    todos: (r: Produto) => r.tipo !== "maquina",
  }), [naProducao, idTornearia]);
  const contagem = (c: Cadastro) => contagens[c];
  const [verInativos, setVerInativos] = useState(false);
  // a contagem da aba é do que a lista mostra (sem os inativos, a não ser que se peça para vê-los)
  const contagens = useMemo(() => Object.fromEntries((Object.keys(doCadastro) as Cadastro[]).map((c) => [c, produtos.filter((p) => doCadastro[c](p) && (verInativos || p.ativo !== false)).length])) as Record<Cadastro, number>,
    [produtos, doCadastro, verInativos]);
  const inativos = produtos.filter((p) => doCadastro[cadastro](p) && p.ativo === false).length;
  const ehMaquinas = cadastro === "maquinas";
  const atualCad = CADASTROS.find((c) => c.id === cadastro)!;
  const podeMover = pode("editar_produtos") && tem("financeiro");
  const sugeridos = useMemo(() => produtos.filter((p) => p.tipo === "peca" && p.vendavel === false && p.ativo !== false), [produtos]);
  const invalidar = useInvalidate();

  /** Move os selecionados para outro cadastro (o banco pede o motivo quando o produto já foi movimentado). */
  async function moverPara(ids: string[], tipo: string, nome: string) {
    const motivo = (await pedirTexto(`Mover ${ids.length} ${pl(ids.length, "produto", "produtos")} para "${nome}". Motivo (fica no histórico):`, "Separação dos cadastros: máquinas, peças de reposição e componentes"))?.trim();
    if (!motivo) return "Nada mudou";
    const extra = tipo === "insumo" ? { vendavel: false, no_catalogo: false } : {};
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("produtos").update({ tipo, motivo_alteracao: motivo, ...extra }).in("id", ids.slice(i, i + 200));
      if (error) throw error;
    }
    return `${ids.length} ${pl(ids.length, "produto", "produtos")} agora em ${nome}`;
  }
  async function catalogo(ids: string[], no: boolean) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("produtos").update({ no_catalogo: no }).in("id", ids.slice(i, i + 200));
      if (error) throw error;
    }
    // só aparece na loja e no WhatsApp com foto e preço de venda: avisa quem ainda não vai aparecer
    const faltando = no ? produtosTodos.filter((p) => ids.includes(p.id) && pendenciaCatalogo({ foto: p.foto_caminho, preco: p.preco_venda })) : [];
    const aviso = faltando.length ? `. ${faltando.length} ainda não aparece(m) na loja: ${faltando.slice(0, 3).map((p) => `${p.descricao} (${pendenciaCatalogo({ foto: p.foto_caminho, preco: p.preco_venda })})`).join("; ")}` : "";
    return `${ids.length} ${pl(ids.length, "produto", "produtos")} ${no ? "no catálogo" : "fora do catálogo"}${aviso}`;
  }
  // o aviso de estoque mínimo mostra só o que é desta tela (as máquinas na tela Máquinas, o resto em Produtos)
  const baixos = produtos.filter((p) => p.ativo && !p.fora_de_linha && Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo) && doCadastro[cadastro](p));
  const consumo = useMemo(() => resumoMovimentos(movimentos, hoje()), [movimentos]);
  const unidadesUsadas = [...new Set(produtos.map((p) => String(p.unidade ?? "").toUpperCase()))].filter((u) => u && !UNIDADES.some(([c]) => c === u));
  const opcoesUnidade = [...UNIDADES.map(([v, l]) => ({ value: v, label: `${v} - ${l}` })), ...unidadesUsadas.map((u) => ({ value: u, label: `${u} (fora do padrão)` }))];


  const NOME_CADASTRO: Record<string, string> = { maquina: "Máquina", peca: "Peça de reposição", acessorio: "Acessório", insumo: "Componente de produção", servico: "Serviço" };
  /** Selos do produto (inativo, produção, catálogo…) — iguais na tabela e no cartão do celular. */
  const selos = (r: Produto) => (<>
    {cadastro === "componentes" && r.tipo !== "insumo" && <span className="mr-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-2xs font-semibold text-sky-800" title="Também é peça de reposição: o cliente compra">também vende</span>}
    {cadastro !== "componentes" && naProducao.has(r.id) && <span className="mr-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-2xs font-semibold text-orange-800" title="Vai na ficha técnica de alguma máquina">usada na produção</span>}
    {(r.tipo === "insumo" || r.vendavel === false) && <span className="mr-1 inline-flex items-center rounded-md border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-2xs font-black uppercase tracking-wide text-amber-900" title="Não aparece no pedido: só para a produção e a assistência">uso interno</span>}
    {(r.ativo === false || r.fora_de_linha) && <span className="mr-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-2xs font-semibold text-slate-700">{r.ativo === false ? "inativo" : "fora de linha"}</span>}
    {r.no_catalogo && (pendenciaCatalogo({ foto: r.foto_caminho, preco: r.preco_venda })
      ? <span className="text-xs font-semibold text-amber-700">catálogo: {pendenciaCatalogo({ foto: r.foto_caminho, preco: r.preco_venda })}</span>
      : <span className="text-xs font-semibold text-emerald-700">no catálogo ✓</span>)}
  </>);
  /** Estoque do produto: quantidade (vermelho se negativo ou no mínimo) e o saldo de cada unidade. */
  const estoque = (r: Produto) => {
    if (r.tipo === "servico") return { texto: "serviço", detalhe: "sem estoque", alerta: false };
    if (r.kit) {
      const montaveis = estoqueKit(r.id, comps, (id) => (atual ? saldo(id, atual) : Number(produtos.find((p) => p.id === id)?.estoque_atual ?? 0)));
      return { texto: `${montaveis} ${pl(montaveis, "kit", "kits")}`, detalhe: "pelos componentes", alerta: false };
    }
    const qtd = atual ? saldo(r.id, atual) : Number(r.estoque_atual);
    return {
      texto: `${qtd} ${r.unidade ?? ""}`.trim(),
      detalhe: !atual && unidades.length > 1 ? unidades.map((u) => `${u.codigo} ${saldo(r.id, u.id)}`).join(" · ") : "",
      alerta: qtd < 0 || (Number(r.estoque_minimo) > 0 && qtd <= Number(r.estoque_minimo)),
    };
  };
  /** Margem bruta sobre o preço de venda (só com custo e preço preenchidos). */
  const custo = (r: Produto) => custoUnitario(r, { produtos, comps });   // kit: soma dos componentes
  const margem = (r: Produto) => {
    const m = margemBruta(r.preco_venda, custo(r));
    return m == null ? null : Math.round(m);
  };
  /** Celular: nome (com o NCM pequeno ao lado) e foto em cima; custo, venda, estoque e vendidos em 3 meses numa faixa
   *  baixa embaixo (eram 4 caixas grandes, 23/10). Serviço não tem NCM nem estoque: no lugar do estoque vai a margem. */
  const cartaoProduto = (r: Produto, abrir: () => void) => {
    const e = estoque(r), c = custo(r), m = margem(r), v = vendidos3m.get(r.id);
    const ncm = String(r.ncm ?? "").replace(/\D/g, "");
    const servico = r.tipo === "servico";
    return (
      <div>
        <button type="button" onClick={abrir} className="flex w-full items-start gap-3 pr-8 text-left">
          {r.foto_caminho
            ? <img src={urlFotoProduto(r.foto_caminho)} alt="" className="h-11 w-11 shrink-0 rounded-cartao object-cover ring-1 ring-slate-200" />
            : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-cartao bg-slate-100 text-slate-400">{servico ? <Wrench size={18} /> : <Boxes size={18} />}</span>}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug text-fg [overflow-wrap:anywhere]">
              {r.descricao}{" "}
              {!servico && (
                <span className={`inline-block whitespace-nowrap rounded px-1 align-middle text-2xs font-medium leading-4 ${ncm.length === 8 && !/^0+$/.test(ncm) ? "bg-slate-100 text-slate-500" : "bg-red-50 text-red-600"}`}>
                  {ncm && !/^0+$/.test(ncm) ? `NCM ${ncm}` : "sem NCM"}
                </span>
              )}
            </span>
            {r.subtitulo && <span className="block text-xs text-slate-600 [overflow-wrap:anywhere]">{r.subtitulo}</span>}
            <span className="mt-0.5 block text-xs text-slate-500 [overflow-wrap:anywhere]">
              {[r.vendavel !== false && (NOME_CADASTRO[r.tipo] ?? r.tipo), r.sku, textoVariacao(r), r.codigo_fabricante && `Fab. ${r.codigo_fabricante}`, textoFornecedor(r), r.marca, r.modelo, r.categoria].filter(Boolean).join(" · ") || "sem código"}
            </span>
          </span>
        </button>
        {r.vendavel === false && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="text-xs leading-snug">
              <b className="font-semibold uppercase tracking-wide">{NOME_CADASTRO[r.tipo] ?? r.tipo} · não vende</b>
              <span className="block">Não aparece no pedido.</span>
            </span>
          </div>
        )}
        {(r.ativo === false || r.fora_de_linha || r.no_catalogo || naProducao.has(r.id) || (cadastro === "componentes" && r.tipo !== "insumo")) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">{selos(r)}</div>
        )}
        <dl className="mt-2.5 grid grid-cols-4 divide-x divide-slate-100 rounded-cartao border border-slate-100 py-1.5 text-center">
          <div className="min-w-0 px-1">
            <dt className="text-2xs text-slate-500">Custo</dt>
            <dd className={`truncate text-xs font-bold tabular-nums ${c ? "" : "text-amber-600"}`}>{c ? brl(c) : "sem custo"}</dd>
          </div>
          <div className="min-w-0 px-1">
            <dt className="text-2xs text-slate-500">Venda</dt>
            {/* insumo que não vende (MDF, tubo, chapa): só o custo importa, sem preço nem margem */}
            {r.tipo === "insumo" && r.vendavel === false
              ? <dd className="truncate text-xs text-slate-500">não vende</dd>
              : <dd className="truncate text-xs font-bold tabular-nums">{brl(r.preco_venda)}</dd>}
            {m !== null && !servico && !(r.tipo === "insumo" && r.vendavel === false) && <dd className={`text-2xs ${m < 0 ? "font-semibold text-red-600" : "text-slate-500"}`}>{m}%</dd>}
          </div>
          {/* serviço não tem estoque: no lugar dele, a margem (a faixa fica com 4 números, como nas peças) */}
          {servico ? (
            <div className="min-w-0 px-1">
              <dt className="text-2xs text-slate-500">Margem</dt>
              <dd className={`truncate text-xs font-bold tabular-nums ${m !== null && m < 0 ? "text-red-600" : ""}`}>{m !== null ? `${m}%` : "—"}</dd>
            </div>
          ) : (
            <div className="min-w-0 px-1">
              <dt className="text-2xs text-slate-500">Estoque</dt>
              <dd className={`truncate text-xs font-bold tabular-nums ${e.alerta ? "text-red-600" : ""}`}>{e.texto}</dd>
            </div>
          )}
          <div className="min-w-0 px-1">
            <dt className="text-2xs text-slate-500" title="Vendidos nos últimos 3 meses">Vendidos 3m</dt>
            <dd className="truncate text-xs font-bold tabular-nums">{v ? `${v.quantidade} ${r.unidade ?? ""}`.trim() : "0"}</dd>
          </div>
        </dl>
      </div>
    );
  };
  // cadastro: o que só aparece depois de salvo (galeria, fornecedores, histórico) e o que só vale para o que vende
  // (medidas de frete, catálogo, anúncio); o componente de produção que não vende tem o cadastro curto
  const salvo = (r: Record<string, any>) => !!r.id;
  // componente novo que não vende: sem medidas, catálogo nem anúncio (a tela de Peças já abre com "Mostrar no catálogo")
  const vende = (r: Record<string, any>) => r.tipo !== "insumo" || !!r.vendavel || (!!r.id && !!r.no_catalogo);
  // cadastro novo mais curto para o kit (custo e estoque saem das peças) e para o componente de fabricação (não vende)
  const fabrica = (r: Record<string, any>) => r.tipo === "insumo" && !r.vendavel;
  const kitNovo = (r: Record<string, any>) => !!r.kit && !r.id;
  const fabricaNovo = (r: Record<string, any>) => fabrica(r) && !r.id;
  const abasProdutos = [
    { value: "produtos" as const, label: ehMaquinas ? "Máquinas" : "Produtos" },
    // Tornearia: a receita de cada peça usinada (insumos, fornecedor, desenho, custo), fora da ficha das máquinas
    ...(cadastro === "tornearia" ? [{ value: "receita" as const, label: "Peças (receita)" }] : []),
    ...(ehMaquinas ? [{ value: "ficha" as const, label: "Ficha técnica" }, { value: "manuais" as const, label: "Manuais" }, { value: "impostos" as const, label: "Impostos" }] : []),
    { value: "qualidade" as const, label: "Qualidade" },
    { value: "categorias" as const, label: "Categorias" },
    ...(pode("movimentar_estoque") ? [{ value: "contagem" as const, label: "Contagem" }] : []),
  ];
  return (
    <>
      {/* celular: as abas viram uma lista de escolha (5 abas ocupavam meia tela) */}
      <label className="mb-3 block md:hidden">
        <span className="sr-only">Seção</span>
        <select className="input font-semibold" value={aba} onChange={(e) => { setAba(e.target.value as typeof aba); setEditarAgora(null); }}>
          {abasProdutos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <div className="hidden md:block">
        <Tabs value={aba} onChange={(a) => { setAba(a); setEditarAgora(null); }} options={abasProdutos} />
      </div>
      {aba === "receita" ? (
        <ReceitasTornearia />
      ) : aba === "ficha" ? (
        <FichaTecnica inicial={fichaDe} />
      ) : aba === "manuais" ? (
        <ManuaisMaquinas produtos={produtosTodos} podeEditar={pode("editar_produtos") || tem("tecnico")} aoFicha={(id) => { setFichaDe(id); setAba("ficha"); }} />
      ) : aba === "impostos" ? (
        <ListaImpostosMaquinas produtos={produtos.filter((p) => p.tipo === "maquina")} custo={custo} />
      ) : aba === "categorias" ? (
        <CategoriasProdutos produtos={produtos} podeEditar={pode("editar_produtos")} />
      ) : aba === "qualidade" ? (
        <QualidadeProdutos produtos={produtos} inicial={busca.get("problema")} podeEditar={pode("editar_produtos")} onCorrigir={(p) => { setAba("produtos"); setEditarAgora({ ...p }); }} />
      ) : aba === "contagem" ? (
        <ContagemEstoque produtos={produtos} podeEditar={pode("movimentar_estoque")} />
      ) : <>
      {verSugestao && <SugestaoComponentes produtos={sugeridos} onClose={() => setVerSugestao(false)} onMover={async (ids) => {
        try { notify(await moverPara(ids, "insumo", "Componentes de produção")); invalidar("produtos"); setVerSugestao(false); } catch (e) { notifyError(e); }
      }} />}

      <CrudPage<Produto>
        key={cadastro}
        // produto novo: passo a passo (o básico, compra, preço, catálogo, anúncio…), com "Salvar agora" para pular o resto
        passoAPasso
        // kit novo: logo depois de salvar, abre a escolha das peças (o custo e o estoque do kit saem delas)
        aoSalvar={(p, novo) => { if (novo && p.kit) { setKitAberto(p); notify("Agora escolha as peças do kit"); } }}
        // a tela começa pelo título; avisos, tipo de cadastro e sugestões vêm logo abaixo dele
        aposTitulo={<>
          {/* avisos discretos numa linha só (pedido de 24/10): tocar abre a lista */}
          {((podeMover && precosPendentes > 0) || baixos.length > 0) && (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-800 sm:mb-3">
              {podeMover && precosPendentes > 0 && (
                <button type="button" onClick={() => navigate("/precos")} title="O custo mudou e o preço ficou abaixo da margem desejada"
                  className="inline-flex items-center gap-1 hover:underline">
                  <AlertTriangle size={13} aria-hidden /> {precosPendentes} {pl(precosPendentes, "preço", "preços")} para revisar
                </button>
              )}
              {baixos.length > 0 && (
                <button type="button" onClick={() => navigate("/estoque?aba=qualidade&problema=abaixo_minimo")}
                  title={`${baixos.slice(0, 8).map((p) => `${p.descricao} (${Number(p.estoque_atual)})`).join(", ")}${baixos.length > 8 ? "…" : ""}`}
                  className="inline-flex items-center gap-1 hover:underline">
                  <AlertTriangle size={13} aria-hidden /> {baixos.length} {pl(baixos.length, "item", "itens")} no estoque mínimo
                </button>
              )}
            </div>
          )}

          {!ehMaquinas && <div className="faixa-chips mb-2 sm:mb-3 sm:gap-2" role="tablist" aria-label="Cadastro de produtos">
            {CADASTROS.filter((c) => c.id !== "maquinas").map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={cadastro === c.id} onClick={() => escolherCadastro(c.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm ${cadastro === c.id ? "border-transparent text-white shadow-card " + c.cor : "border-slate-200 bg-surface text-fg hover:border-slate-300"}`}>
                {c.titulo}
                <span className={`num rounded-full px-1.5 text-xs leading-5 ${cadastro === c.id ? "bg-white/25" : "bg-slate-100 text-slate-600"}`}>{contagem(c.id)}</span>
              </button>
            ))}
          </div>}
          <p className="mb-3 hidden text-sm text-slate-600 sm:block">
            {ehMaquinas ? <>As máquinas que a MF fabrica e vende, separadas dos produtos. Peças, componentes e serviços ficam em <Link to="/estoque" className="link-acao">Produtos e estoque</Link>.</> : atualCad.ajuda}
          </p>
          {ehMaquinas && <ModelosMaquinas produtos={produtosTodos} aoAbrir={setFicha} />}
          {podeMover && sugeridos.length > 0 && (cadastro === "componentes" || cadastro === "pecas" || cadastro === "todos") && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
              <Boxes size={18} className="shrink-0" />
              <span className="min-w-0 flex-1"><b>Sugestão de separação:</b> {sugeridos.length} {pl(sugeridos.length, "produto", "produtos")} estão como peça de reposição mas marcados <b>"não vende"</b> (o cliente não compra). Pelo jeito são componentes de produção.</span>
              <Button variant="secondary" onClick={() => setVerSugestao(true)}>Conferir e mover</Button>
            </div>
          )}
        </>}
        anexos="produto"
        title={cadastro === "todos" ? "Produtos e estoque" : atualCad.titulo}
        // inativos só aparecem quando se pede (botão "Mostrar inativos")
        filtroBase={(r: Produto) => doCadastro[cadastro](r) && (verInativos || r.ativo !== false)}
        readOnly={!pode("editar_produtos")}
        semNovo={!tem("financeiro")}
        table="produtos"
        marcadores={["produto", "produtos"]}
        order="descricao"
        defaults={{ tipo: "peca", unidade: "UN", origem: 0, preco_custo: 0, preco_venda: 0, estoque_minimo: 0, estoque_maximo: 0, ativo: true, vendavel: true, sob_encomenda: false, fora_de_linha: false, descricao: "", no_catalogo: false, ...atualCad.padrao }}
        searchKeys={["descricao", "sku", "ncm", "marca", "modelo", "categoria", "codigo_barras", "codigo_fabricante", "codigos_alternativos"]}
        buscaExtra={textoFornecedor}
        editarAgora={editarAgora}
        filtros={filtrosProduto}
        ordens={ORDENS_PRODUTO}
        podeExcluir={papel === "admin"}
        plural="produtos"
        acoesLote={pode("editar_produtos") ? [
          // perfil Marketplaces: ativar, inativar e mudar de cadastro ficam com o financeiro
          ...(tem("financeiro") ? [{ label: "Inativar", executar: (ids: string[]) => situacaoProdutos(ids, false) },
            { label: "Ativar", executar: (ids: string[]) => situacaoProdutos(ids, true) }] : []),
          ...(tem("financeiro") && cadastro !== "maquinas" ? [{ label: "Mover para Máquinas", executar: (ids: string[]) => moverPara(ids, "maquina", "Máquinas") }] : []),
          ...(tem("financeiro") && cadastro !== "pecas" ? [{ label: "Mover para Peças de reposição", executar: (ids: string[]) => moverPara(ids, "peca", "Peças de reposição") }] : []),
          ...(tem("financeiro") && cadastro !== "componentes" ? [{ label: "Mover para Componentes de produção", executar: (ids: string[]) => moverPara(ids, "insumo", "Componentes de produção") }] : []),
          ...(cadastro === "pecas" ? [{ label: "Pôr no catálogo", executar: (ids: string[]) => catalogo(ids, true) }, { label: "Tirar do catálogo", executar: (ids: string[]) => catalogo(ids, false) }] : []),
          ...(podeMover ? [{ label: "Unificar", executar: (ids: string[]) => ids.length < 2
            ? Promise.resolve("Marque 2 ou mais cadastros repetidos para unificar")
            : new Promise<string>((fim) => setUnificando({ lista: produtosTodos.filter((p) => ids.includes(p.id)), fim })) }] : []),
          ...(tem("financeiro") ? [{ label: "Definir linha", executar: (ids: string[]) => new Promise<string>((fim) => setDefinindoLinha({ ids, fim })) }] : []),
        ] : []}
        exportExtra={(r) => ({ "Estoque total": Number(r.estoque_atual), ...Object.fromEntries(unidades.map((u) => [`Estoque ${u.codigo}`, saldo(r.id, u.id)])) })}
        extraActions={<>
          {inativos > 0 && <Button variant="ghost" aria-pressed={verInativos} onClick={() => setVerInativos(!verInativos)}>{verInativos ? "Esconder inativos" : `Mostrar inativos (${inativos})`}</Button>}
          {/* os painéis saíram da lista do menu: ficam a um clique daqui */}
          {ehMaquinas ? <Button variant="secondary" onClick={() => navigate("/painel/maquinas")}><LayoutDashboard size={16} /> Painel das máquinas</Button>
            : <Button variant="secondary" onClick={() => navigate("/painel/produtos")}><LayoutDashboard size={16} /> Painel dos produtos</Button>}
          {!ehMaquinas && <Button variant="secondary" onClick={() => navigate("/estoque/giro")}><RefreshCw size={16} /> Giro de estoque</Button>}
          {ehMaquinas && vis.ve("testegiga", "/teste-giga") && <Button variant="secondary" onClick={() => navigate("/teste-giga")}><PlugZap size={16} /> Teste do giga (REG-006)</Button>}
          {pode("editar_produtos") && <>
            {tem("financeiro") && <Button variant="secondary" onClick={() => setImportar(true)}><FileSpreadsheet size={16} /> Importar do Tiny</Button>}
            {tem("financeiro") && <Button variant="secondary" onClick={() => setImportarKits(true)}><Boxes size={16} /> Kits do Tiny</Button>}
            {tem("financeiro", "tecnico") && <Button variant="secondary" onClick={() => setItensNotas(true)}><ListChecks size={16} /> Itens das notas de fornecedor</Button>}
          </>}
        </>}
        // estrela no bloco "Fornecedores deste produto" → o select "Fornecedor preferencial" acompanha
        onFieldChange={(nome, valor) => (nome === "fornecedores_produto" && valor ? Promise.resolve({ fornecedor_padrao_id: valor }) : Promise.resolve(null))}
        beforeSave={(r) => {
          // estoque_atual só muda por movimentação, nunca pela edição do cadastro
          const { estoque_atual: _ignorado, fornecedores_produto: _preferido, ...resto } = r;
          // variação: o pai tem de ser um produto pai (a regra fica aqui, não em gatilho no banco)
          const erroVar = erroVariacao({ id: r.id, agrupador: !!r.agrupador, produto_pai_id: r.produto_pai_id || null }, produtosTodos);
          if (erroVar) throw new Error(`Variação: ${erroVar}`);
          // código de barras: só dígitos; código novo tem que ser válido e de um produto só
          const ean = soDigitos(r.codigo_barras);
          if (ean && r.gtin_isento) throw new Error("Código de barras: informe o código ou marque \"Sem GTIN\", não os dois");
          if (ean && ean !== soDigitos(produtosTodos.find((p) => p.id === r.id)?.codigo_barras)) {
            const erro = erroCodigoNovo({ id: r.id ?? "" }, ean, contextoEan(produtosTodos as ProdutoEan[]));
            if (erro) throw new Error(`Código de barras ${ean}: ${erro}`);
          }
          return {
            ...resto,
            codigo_barras: ean || null,
            origem: Number(r.origem),
            preco_custo: Number(r.preco_custo || 0),
            preco_venda: Number(r.preco_venda || 0),
            estoque_minimo: Number(r.estoque_minimo || 0),
            estoque_maximo: Number(r.estoque_maximo || 0),
            garantia_meses: r.garantia_meses === "" || r.garantia_meses == null ? null : Number(r.garantia_meses),
            ipi_aliquota: r.ipi_aliquota === "" || r.ipi_aliquota == null ? null : Number(r.ipi_aliquota),
            margem_desejada: r.margem_desejada === "" || r.margem_desejada == null ? null : Number(String(r.margem_desejada).replace(",", ".")),
            material_formato: r.material_formato || null,
            ...Object.fromEntries(["peso_kg", "altura_cm", "largura_cm", "profundidade_cm", "material_comprimento_mm", "material_largura_mm", "material_espessura_mm"].map((k) => [k, r[k] === "" || r[k] == null ? null : Number(r[k])])),
            fornecedor_padrao_id: r.fornecedor_padrao_id || null,
            produto_pai_id: r.produto_pai_id || null,
            ...(r.agrupador ? { vendavel: false } : {}), // o produto pai não vende sozinho
            linha_id: r.linha_id || null,
            embalagem_id: r.embalagem_id || null,
            foto_caminho: r.foto_caminho || null,
            prazo_reposicao_dias: r.prazo_reposicao_dias === "" || r.prazo_reposicao_dias == null ? null : Number(r.prazo_reposicao_dias),
            compra_minima: r.compra_minima === "" || r.compra_minima == null ? null : Number(r.compra_minima),
            motivo_alteracao: String(r.motivo_alteracao ?? "").trim() || null,
            video_url: String(r.video_url ?? "").trim() || null,
            ...(Array.isArray(r.especificacoes) ? { especificacoes: (r.especificacoes as Especificacao[]).map((e) => ({ nome: String(e.nome ?? "").trim(), valor: String(e.valor ?? "").trim() })).filter((e) => e.nome && e.valor) } : {}),
            ...(Array.isArray(r.etapas_producao) ? { etapas_producao: (r.etapas_producao as string[]).map((e) => String(e).trim()).filter(Boolean) } : {}),
            ...anuncioAoSalvar(r),
            ...(!r.id && r.tipo === "insumo" && !r.vendavel ? { no_catalogo: false } : {}), // componente novo não vai ao catálogo
          };
        }}
        fields={cadastro === "servicos" ? [
          // serviço: cadastro curto (sem estoque, catálogo, anúncio nem medidas)
          { name: "descricao", label: "Nome do serviço", span: 3, required: true, placeholder: "Ex.: Carga de gás (serviço), Limpeza e lavagem (serviço)" },
          { name: "sku", label: "Código", span: 1, placeholder: "Ex.: SV-GAS" },
          { name: "unidade", label: "Unidade", type: "select", options: [{ value: "UN", label: "UN - serviço" }, { value: "H", label: "H - hora" }, { value: "VISITA", label: "Visita" }] },
          { name: "preco_venda", label: "Preço cobrado do cliente", type: "number" },
          { name: "preco_custo", label: "Custo (técnico, gás, terceiro)", type: "number" },
          { name: "ativo", label: "Ativo", type: "checkbox", span: 1 },
          { name: "observacoes", label: "O que está incluído (aparece para a equipe)", type: "textarea", span: 4, placeholder: "Ex.: recolhimento do gás, vácuo, carga de R404A até 1 kg e teste de vazamento" },
          {
            name: "motivo_alteracao", label: "Motivo da alteração (ao mudar preço ou custo já preenchidos)", type: "custom", span: 4,
            render: (v, set, row) => row.id
              ? <input aria-label="Motivo da alteração" className="input" value={v ?? ""} onChange={(e) => set(e.target.value)} placeholder="Ex.: reajuste da tabela de serviços" />
              : <span className="text-xs text-slate-500">no cadastro novo não precisa</span>,
          },
        ] : [
          { name: "tipo", label: "Tipo", type: "select", options: tipos },
          { name: "descricao", label: "Descrição", span: 3, required: true, placeholder: "Tipo + marca + modelo + característica. Ex.: Motor do batedor WEG 1/2 CV 220V" },
          { name: "sku", label: "Meu código / SKU (único, não reaproveite)", span: 1 },
          { name: "unidade", label: "Unidade de medida", type: "select", options: opcoesUnidade },
          { name: "categoria", label: "Categoria", type: "custom", span: 1,
            render: (v, set) => <CampoCategoriaProduto valor={v} onChange={set} opcoes={opcoesCategoria(categorias, produtos)} produtos={produtos} podeEditar={pode("editar_produtos")} /> },
          { name: "vendavel", label: "Pode vender (aparece no pedido)", type: "checkbox", span: 1 },
          { name: "kit", mostrar: (r) => !fabrica(r) && r.tipo !== "maquina", label: "É um kit (várias peças vendidas juntas)", type: "checkbox", span: 1 },
          { name: "marca", label: "Marca", span: 1 },
          { name: "modelo", label: "Modelo", span: 1 },
          {
            name: "conferencia", label: "Já cadastrados parecidos", type: "custom", span: 4,
            render: (_v, _s, row) => {
              const iguais = parecidos(row, produtos);
              return iguais.length ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Confira antes de criar outro: {iguais.slice(0, 4).map((o) => `${o.descricao}${o.sku ? ` (${o.sku})` : ""}${o.ativo === false ? " · inativo" : ""}`).join("; ")}
                </div>
              ) : <span className="text-xs text-emerald-700">nenhum produto com o mesmo código ou a mesma descrição</span>;
            },
          },
          {
            name: "aviso_tipo", mostrar: (r) => kitNovo(r) || fabricaNovo(r), label: "Cadastro curto", type: "custom", span: 4,
            render: (_v, _s, row) => <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{row.kit
              ? "Kit: o custo e o estoque saem das peças dele. Aqui vão só o preço, o fiscal e a foto; ao salvar, abre a escolha das peças."
              : "Componente de fabricação (não vende): só o custo, o fiscal, de quem se compra e o estoque. Preço, catálogo e anúncio não entram."}</p>,
          },
          { name: "secao_preco", mostrar: (r) => !fabricaNovo(r), label: "Custo e preço", type: "secao", ajuda: "O custo é o valor do item na NF do fornecedor (atualizado sozinho na entrada da nota). O preço sugerido sai do custo e da margem." },

          { name: "preco_custo", mostrar: (r) => !kitNovo(r), label: "Custo de compra", type: "number" },
          { name: "custo_kit", mostrar: kitNovo, label: "Custo", type: "custom", span: 1,
            render: () => <span className="text-sm text-slate-600">soma das peças do kit (escolhidas ao salvar)</span> },
          { name: "ultimas_compras", mostrar: salvo, label: "2 últimas compras (pelas notas)", type: "custom", span: 2,
            render: (_v, _s, row) => row.id ? <UltimasCompras produtoId={row.id} /> : <span className="text-xs text-slate-500">aparece depois de salvar</span> },
          {
            // componente de produção que não se vende: venda = custo (o banco também garante)
            name: "preco_venda", mostrar: (r) => !fabrica(r), label: "Preço de venda", type: "custom", span: 1,
            render: (v, set, row) => row.tipo === "insumo" && !row.vendavel
              ? <span className="text-sm text-slate-700"><b className="num">{brl(Number(row.preco_custo || 0))}</b> <span className="text-xs text-slate-500">· igual ao custo (componente de produção)</span></span>
              : <input aria-label="Preço de venda" className="input num" type="number" step="0.01" min="0" inputMode="decimal" value={v ?? ""}
                  onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />,
          },
          { name: "margem_desejada", mostrar: (r) => !fabrica(r), label: "Margem desejada (%) — vazio usa a da categoria ou do tipo", type: "number", span: 2 },
          {
            name: "preco_sugerido_info", mostrar: (r) => !fabrica(r), label: "Preço sugerido", type: "custom", span: 2,
            render: (_v, _s, row) => {
              const cfgPreco = configPreco(cfgProd?.precificacao);
              const alvo = margemAlvo({ tipo: row.tipo, categoria: row.categoria, margem_desejada: row.margem_desejada === "" ? null : row.margem_desejada }, cfgPreco, categorias);
              const sug = precoSugerido(Number(row.preco_custo || 0), alvo.margem, cfgPreco);
              if (!sug) return <span className="text-xs text-slate-500">preencha o custo para calcular</span>;
              return (
                <span className="text-sm">
                  <b>{brl(sug)}</b> <span className="text-xs text-slate-500">· margem {String(alvo.margem).replace(".", ",")}% {alvo.origem}</span>
                </span>
              );
            },
          },
          {
            name: "margem_info", mostrar: (r) => !fabrica(r), label: "Margem bruta", type: "custom", span: 1,
            render: (_v, _s, row) => {
              // kit: custo pela soma dos componentes (o mesmo da lista)
              const m = margemBruta(row.preco_venda, custo(row as Produto));
              if (m == null) return <span className="text-xs text-slate-500">—</span>;
              return <span className={`text-sm font-semibold ${m < 0 ? "text-red-600" : m < 20 ? "text-amber-700" : "text-emerald-700"}`}>{m.toFixed(1).replace(".", ",")}%</span>;
            },
          },
          { name: "ipi_aliquota", mostrar: (r) => !fabrica(r), label: "IPI (%) — TIPI do NCM", type: "number", span: 1 },
          {
            name: "motivo_alteracao", mostrar: salvo, label: "Motivo da alteração (obrigatório ao mudar código, unidade, tipo, custo ou preço já preenchidos)", type: "custom", span: 4,
            render: (v, set, row) => row.id
              ? <input aria-label="Motivo da alteração" className="input" value={v ?? ""} onChange={(e) => set(e.target.value)} placeholder="Ex.: reajuste do fornecedor na NF 1234" />
              : <span className="text-xs text-slate-500">no cadastro novo não precisa</span>,
          },
          { name: "secao_fiscal", label: "Dados fiscais (NF-e)", type: "secao", ajuda: "O NCM é obrigatório para emitir a nota; o botão ao lado sugere pelo nome. O resto pode ficar vazio (usa o padrão)." },

          { name: "ncm", label: "NCM (8 dígitos)", type: "custom", span: 2, render: (v, set, row) => <CampoNcm valor={v} onChange={set} produtoId={row.id} /> },
          {
            name: "origem", label: "Origem da mercadoria", type: "select", span: 4,
            options: [
              { value: 0, label: "0 - Nacional" },
              { value: 1, label: "1 - Estrangeira (importação direta)" },
              { value: 2, label: "2 - Estrangeira (adquirida no mercado interno)" },
              { value: 3, label: "3 - Nacional, conteúdo de importação > 40% e ≤ 70%" },
              { value: 4, label: "4 - Nacional, processos produtivos básicos" },
              { value: 5, label: "5 - Nacional, conteúdo de importação ≤ 40%" },
              { value: 6, label: "6 - Estrangeira (importação direta), sem similar nacional" },
              { value: 7, label: "7 - Estrangeira (mercado interno), sem similar nacional" },
              { value: 8, label: "8 - Nacional, conteúdo de importação > 70%" },
            ],
          },
          { name: "cest", label: "CEST", span: 1 },
          { name: "cfop", mostrar: salvo, label: "CFOP (vazio = padrão)", span: 1 },
          { name: "icms_situacao", mostrar: salvo, label: "CSOSN/CST (vazio = padrão)", span: 1 },
          { name: "secao_compra", mostrar: (r) => !kitNovo(r), label: "Compra e estoque", type: "secao", ajuda: "De quem se compra, em quanto tempo chega e quanto ter guardado. O estoque mínimo deve cobrir o consumo durante o prazo do fornecedor." },

          { name: "custo_fabrica", mostrar: fabricaNovo, label: "Custo de compra", type: "custom", span: 1,
            render: (_v, _s, row, setCampo) => <input aria-label="Custo de compra" className="input num" type="number" step="0.01" min="0" inputMode="decimal"
              value={row.preco_custo ?? ""} onChange={(e) => setCampo("preco_custo", e.target.value === "" ? null : Number(e.target.value))} /> },
          {
            name: "fornecedor_padrao_id", label: "Fornecedor preferencial", type: "select", span: 2,
            options: [{ value: "", label: "—" }, ...fornecedores.map((f) => ({ value: f.id, label: f.nome }))],
          },
          { name: "prazo_reposicao_dias", label: "Prazo de entrega (dias)", type: "number", span: 1 },
          { name: "compra_minima", label: "Compra mínima (embalagem)", type: "number", span: 1 },
          { name: "estoque_minimo", label: "Estoque mínimo", type: "number" },
          { name: "estoque_maximo", label: "Estoque máximo", type: "number" },
          {
            name: "sugestao_minimo", mostrar: salvo, label: "Mínimo sugerido pelo consumo", type: "custom", span: 2,
            render: (_v, _s, row) => {
              const saidas = consumo.get(row.id)?.saidas180 ?? 0;
              const s = sugerirMinimo(saidas, row.prazo_reposicao_dias);
              return s
                ? <span className="text-sm text-slate-700"><b>{s}</b> · consumo de {Math.round((saidas / 6) * 10) / 10}/mês × prazo de {Number(row.prazo_reposicao_dias || 15)} dias + 50% de folga</span>
                : <span className="text-xs text-slate-500">sem saídas nos últimos 180 dias</span>;
            },
          },
          {
            name: "fornecedores_produto", mostrar: salvo, label: "Fornecedores deste produto (preço, prazo e preferido)", type: "custom", span: 4,
            render: (_v, set, row) => <FornecedoresProduto produtoId={row.id} podeEditar={pode("editar_produtos") && tem("financeiro", "tecnico")} aoMudarPreferido={set} />,
          },
          {
            name: "codigos_fornecedor", mostrar: salvo, label: "Código do item em cada fornecedor (aprendido na entrada da NF-e)", type: "custom", span: 4,
            render: (_v, _s, row) => {
              const lista = codigosForn.filter((c) => c.produto_id === row.id);
              return lista.length
                ? <div className="text-sm text-slate-700">{lista.map((c) => `${c.fornecedor?.nome ?? "fornecedor"}: ${c.codigo_fornecedor}${Number(c.fator_conversao) !== 1 ? ` (1 = ${Number(c.fator_conversao)} ${row.unidade ?? ""})` : ""}`).join(" · ")}</div>
                : <span className="text-xs text-slate-500">nenhum ainda: ao dar entrada de uma NF do fornecedor e vincular o item, o código fica guardado aqui</span>;
            },
          },
          { name: "secao_material", mostrar: (r) => r.tipo === "insumo" || !!r.material_formato, label: "Como vem (barra, tubo ou chapa)", type: "secao",
            ajuda: "Para o material que se compra inteiro e se corta em peças: com as medidas, a receita da peça calcula quanto vai em cada uma e a sobra (aproveitamento)." },
          { name: "material_formato", label: "Formato", type: "select", span: 2,
            options: [{ value: "", label: "— não é cortado em peças —" }, ...FORMATOS.map((x) => ({ value: x.v, label: x.rotulo }))] },
          { name: "material_comprimento_mm", mostrar: (r) => !!r.material_formato, label: "Comprimento inteiro (mm)", type: "number", span: 1, placeholder: "Ex.: 6000" },
          { name: "material_largura_mm", mostrar: (r) => r.material_formato === "chapa", label: "Largura da chapa (mm)", type: "number", span: 1, placeholder: "Ex.: 1250" },
          { name: "material_espessura_mm", mostrar: (r) => !!r.material_formato, label: "Espessura ou diâmetro (mm)", type: "number", span: 1,
            ajuda: "Só precisa quando é comprado por kg (o peso sai das medidas)" },
          { name: "material_resumo", mostrar: (r) => !!r.material_formato, label: "Material inteiro", type: "custom", span: 3,
            render: (_v, _s, row) => {
              const falta = faltaMedida(row);
              const inteiro = inteiroNaUnidade(row);
              if (falta) return <span className="text-xs text-amber-800">Falta {falta} para calcular o aproveitamento.</span>;
              const custoInteiro = inteiro != null ? Number(row.preco_custo || 0) * inteiro : 0;
              return <span className="text-sm text-slate-700">1 {row.material_formato} = <b className="num">{String(inteiro).replace(".", ",")} {row.unidade ?? "UN"}</b>{custoInteiro > 0 ? <> · custa <b className="num">{brl(custoInteiro)}</b></> : ""}</span>;
            } },
          { name: "secao_codigos", label: "Códigos, variação e situação", type: "secao", ajuda: "Opcional: código de barras, código do fabricante, variação (ex.: 3 Sabores), garantia e onde fica guardado. Dá para salvar sem isso." },

          { name: "subtitulo", mostrar: (r) => !fabricaNovo(r), label: "Subtítulo (aparece abaixo do nome)", span: 4, placeholder: "Ex.: Compatível com máquinas de sorvete expresso Top 200 e Top 300" },
          { name: "codigo_fabricante", label: "Código do fabricante (peça original)", span: 1, placeholder: "Ex.: TYA2446ZES, CFW300A06P0S2NB20" },
          { name: "codigo_barras", mostrar: (r) => !fabricaNovo(r), label: "Código de barras (EAN)" },
          { name: "gtin_isento", mostrar: (r) => !fabricaNovo(r), label: "Sem GTIN/EAN (produto próprio, sem código de barras)", type: "checkbox", span: 4 },
          { name: "conferencia_ean", mostrar: (r) => !fabricaNovo(r), label: "Conferência do código de barras", type: "custom", span: 3, render: (_v, _s, row) => <ConferenciaEan row={row} produtos={produtosTodos} /> },
          { name: "codigos_alternativos", label: "Códigos alternativos (separados por vírgula)", span: 3, placeholder: "Código antigo, código do Tiny, EAN da caixa…" },
          { name: "agrupador", mostrar: (r) => !fabricaNovo(r), label: "Produto pai (tem variações; não vende sozinho)", type: "checkbox", span: 2 },
          { name: "produto_pai_id", mostrar: (r) => !fabricaNovo(r), label: "É variação de", type: "select", span: 1, options: [{ value: "", label: "— não é variação —" }, ...opcoesPai(produtos)] },
          { name: "variacao", mostrar: (r) => !fabricaNovo(r), label: "Variação (o que muda)", span: 1, placeholder: "Ex.: 3 Sabores, A 200" },
          { name: "linha_id", mostrar: (r) => !fabricaNovo(r), label: "Linha de produtos (comissão)", type: "select", span: 1,
            options: [{ value: "", label: "Sem linha" }, ...linhas.filter((l) => l.ativo).map((l) => ({ value: l.id, label: l.nome }))] },
          { name: "garantia_meses", mostrar: (r) => !fabricaNovo(r), label: "Garantia (meses, vazio = padrão)", type: "number" },
          { name: "localizacao", label: "Localização (depósito/prateleira)", span: 1 },
          { name: "sob_encomenda", mostrar: (r) => !fabricaNovo(r), label: "Sob encomenda", type: "checkbox", span: 1 },
          { name: "fora_de_linha", label: "Fora de linha (não compra mais; vende até acabar)", type: "checkbox", span: 2 },
          { name: "ativo", mostrar: salvo, label: "Ativo", type: "checkbox", span: 1 },
          { name: "observacoes", label: "Observações internas", type: "textarea", span: 4 },
          { name: "secao_medidas", mostrar: vende, label: "Peso e medidas (frete)", type: "secao", ajuda: "Peso e medidas da peça embalada: entram na cotação de frete e nos anúncios." },

          { name: "peso_kg", label: "Peso (kg) p/ frete", type: "number", span: 1 },
          { name: "altura_cm", label: "Altura (cm)", type: "number", span: 1 },
          { name: "largura_cm", label: "Largura (cm)", type: "number", span: 1 },
          { name: "profundidade_cm", label: "Profundidade (cm)", type: "number", span: 1 },
          {
            name: "desenho_medidas", label: "Medidas e peso (desenho)", type: "custom", span: 4,
            render: (_v, _s, row) => <DesenhoMedidas largura={row.largura_cm} altura={row.altura_cm} profundidade={row.profundidade_cm} peso={row.peso_kg}
              embalagem={embalagens.find((e) => e.id === row.embalagem_id)?.descricao} />,
          },
          { name: "embalagem_id", label: "Embalagem padrão (envio)", type: "select", span: 2, ajuda: "As medidas da embalagem entram na cotação de frete (cubagem)",
            options: [{ value: "", label: "— sem embalagem —" }, ...embalagens.filter((e) => e.ativo).map((e) => ({ value: e.id, label: e.descricao }))] },
          { name: "secao_catalogo", mostrar: vende, label: "Catálogo do WhatsApp e vitrine", type: "secao", ajuda: "Produtos marcados aparecem no catálogo do WhatsApp e na vitrine, com foto e preço de venda." },
          { name: "no_catalogo", label: "Mostrar no catálogo", type: "checkbox", span: 1 },
          { name: "foto_caminho", label: "Foto principal", type: "custom", span: 3, render: (v, set) => <FotoProduto valor={v} onChange={set} /> },
          {
            name: "galeria", mostrar: salvo, label: "Fotos e vídeos (galeria)", type: "custom", span: 4,
            render: (_v, _s, row, setCampo) => <GaleriaProduto produtoId={row.id} podeEditar={pode("editar_produtos") || tem("tecnico")}
              fotoPrincipal={row.foto_caminho} aoEscolherPrincipal={(url) => setCampo("foto_caminho", url)} />,
          },
          { name: "video_url", label: "Link do vídeo (YouTube)", span: 4, placeholder: "https://www.youtube.com/watch?v=…" },
          {
            name: "aviso_catalogo", label: "Na loja e no WhatsApp", type: "custom", span: 4,
            render: (_v, _s, row) => {
              if (!row.no_catalogo) return <span className="text-xs text-slate-500">Não aparece (marque "Mostrar no catálogo").</span>;
              const falta = pendenciaCatalogo({ foto: row.foto_caminho, preco: Number(String(row.preco_venda ?? "").replace(",", ".")) });
              return falta
                ? <span className="block rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Ainda não aparece: {falta}. {falta.includes("preço") ? "Preencha o preço de venda (acima)." : "Envie uma foto."}</span>
                : <span className="text-xs font-semibold text-emerald-700">Aparece na loja e no catálogo do WhatsApp ✓</span>;
            },
          },
          { name: "descricao_catalogo", label: "Texto de venda (o cliente lê no WhatsApp)", type: "textarea", span: 4 },
          { name: "secao_anuncio", mostrar: vende, label: "Nome e anúncio (marketplace e Google)", type: "secao", ajuda: "O último passo: o título certo para o Mercado Livre, a Shopee e a loja, e o texto para o Google achar (SEO). O assistente de IA ajuda; o que ficar vazio o ERP preenche no padrão ao salvar." },
          {
            name: "assistente_ia", label: "Assistente de IA", type: "custom", span: 4,
            render: (_v, _s, row, setCampo) => <AssistenteIA row={row} setCampo={setCampo} produtos={produtosTodos} garantiaPadrao={Number(cfgProd?.garantia_meses_padrao) || 3} />,
          },
          {
            name: "anuncio_nota", label: "Pronto para anunciar?", type: "custom", span: 4,
            render: (_v, _s, row) => {
              const a = avaliarAnuncio({ ...row, ...anuncioAoSalvar(row) } as any);
              return (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`num rounded-lg px-2 py-1 font-bold ${a.nota >= 90 ? "bg-emerald-100 text-emerald-800" : a.nota >= 70 ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{a.nota}/100</span>
                  {a.pendencias.length ? <span className="text-xs text-slate-600">Falta: {a.pendencias.map((x) => x.texto).join(" · ")}</span> : <span className="text-xs font-semibold text-emerald-700">pronto para anunciar</span>}
                </div>
              );
            },
          },
          {
            name: "titulo_anuncio", label: "Título do anúncio (até 60 letras)", type: "custom", span: 4,
            render: (v, set) => (
              <div className="relative">
                <input aria-label="Título do anúncio" className="input pr-14" value={v ?? ""} maxLength={120} onChange={(e) => set(e.target.value)} placeholder="O que é + para que serve + marca. Ex.: Parafuso de Chave para Máquina de Sorvete My Frost" />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold ${String(v ?? "").length > LIMITE_TITULO ? "text-red-600" : "text-slate-400"}`}>{String(v ?? "").length}/{LIMITE_TITULO}</span>
              </div>
            ),
          },
          { name: "slug", label: "Endereço da página (slug)", span: 2, placeholder: "parafuso-de-chave-para-maquina-de-sorvete" },
          {
            name: "palavras_chave", label: "Palavras-chave (separadas por vírgula)", type: "custom", span: 2,
            render: (v, set) => <input aria-label="Palavras-chave" className="input" value={Array.isArray(v) ? v.join(", ") : (v ?? "")} onChange={(e) => set(e.target.value)} placeholder="parafuso, chave extratora, peça para máquina de sorvete" />,
          },
          {
            name: "meta_descricao", label: "Descrição para o Google (até 160 letras)", type: "custom", span: 4,
            render: (v, set) => (
              <div className="relative">
                <input aria-label="Descrição para o Google" className="input pr-16" value={v ?? ""} maxLength={300} onChange={(e) => set(e.target.value)} />
                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold ${String(v ?? "").length > LIMITE_META ? "text-red-600" : "text-slate-400"}`}>{String(v ?? "").length}/{LIMITE_META}</span>
              </div>
            ),
          },
          { name: "descricao_anuncio", label: "Texto do anúncio (sem telefone, e-mail ou link: os marketplaces proíbem)", type: "textarea", span: 4 },
          { name: "secao_campos", mostrar: salvo, label: "Ficha técnica e campos adicionais", type: "secao",
            ajuda: "Nome e valor (ex.: Voltagem: 220 V; Part number; Compatível com). Saem na ficha do produto, na página da máquina do cliente e ajudam o anúncio." },
          {
            name: "especificacoes", label: "Campos adicionais", type: "custom", span: 4,
            render: (v, set, row) => <EditorEspecificacoes valor={v} onChange={set} sugestoes={row.tipo === "maquina" ? SUGESTOES_ESPEC : SUGESTOES_PECA} />,
          },
          // peça e insumo: o desenho técnico (PDF, foto ou link) que aparece em toda OP dela (tornearia e mecânica)
          { name: "desenho_tecnico", mostrar: (r) => r.tipo !== "maquina" && r.tipo !== "servico", label: "Desenho técnico (aparece na OP da tornearia e da mecânica)", type: "custom" as const, span: 4 as const,
            render: (_v: any, _s: any, row: Record<string, any>) => row.tipo === "maquina" || row.tipo === "servico" ? <span className="text-xs text-slate-500">Só para peças e insumos.</span>
              : <DocumentosMaquina produtoId={row.id} podeEditar={pode("editar_produtos") || pode("editar_producao")} tipos={["desenho"]} /> },
          ...(cadastro === "maquinas" || cadastro === "todos" ? [
            { name: "secao_maquina", mostrar: (r: Record<string, any>) => salvo(r) && r.tipo === "maquina", label: "Máquina: etapas de produção, manuais e dicas", type: "secao" as const,
              ajuda: "As etapas viram a lista de conferência de cada OP; os manuais e as dicas o cliente recebe pelo link da máquina dele." },
            { name: "etapas_producao", label: "Etapas de produção", type: "custom" as const, span: 4 as const,
              render: (v: any, set: (x: any) => void, row: Record<string, any>) => row.tipo === "maquina" ? <EditorEtapas valor={v} onChange={set} /> : <span className="text-xs text-slate-500">Só para máquinas.</span> },
            { name: "dicas_manutencao", label: "Dicas de manutenção (o cliente lê na página da máquina)", type: "textarea" as const, span: 4 as const },
            { name: "documentos_maquina", label: "Manuais (máquina, elétrico) e dicas em PDF", type: "custom" as const, span: 4 as const,
              render: (_v: any, _s: any, row: Record<string, any>) => row.tipo === "maquina" ? <DocumentosMaquina produtoId={row.id} podeEditar={pode("editar_produtos") || tem("tecnico")} /> : <span className="text-xs text-slate-500">Só para máquinas.</span> },
          ] : []),
        ]}
        columns={[
          {
            label: "Produto",
            render: (r) => (
              <div className="flex items-center gap-3">
                {r.foto_caminho && <img src={urlFotoProduto(r.foto_caminho)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0">
                  <div className="font-medium">{r.descricao}</div>
                  <div className="text-xs text-slate-500">{[r.sku, textoVariacao(r), r.codigo_fabricante && `Fab. ${r.codigo_fabricante}`, textoFornecedor(r), r.marca, r.modelo, r.categoria].filter(Boolean).join(" · ")}</div>
                  {r.vendavel === false && (
                    <span className="my-0.5 mr-1 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-2xs font-semibold text-amber-800" title="Não aparece no pedido">
                      <AlertTriangle size={12} /> não vende
                    </span>
                  )}
                  {selos(r)}
                </div>
              </div>
            ),
          },
          { label: "Cadastro", render: (r) => NOME_CADASTRO[r.tipo] ?? r.tipo },
          {
            label: "Venda",
            className: "text-right",
            render: (r) => {
              const c = custo(r), m = margem(r);
              return (
                <span>
                  {r.tipo === "insumo" && r.vendavel === false ? <span className="text-slate-500">não vende</span> : brl(r.preco_venda)}
                  <span className={`block text-xs ${c ? "text-slate-500" : "text-amber-600"}`}>{c ? `custo ${brl(c)}` : "sem custo"}</span>
                  {m !== null && !(r.tipo === "insumo" && r.vendavel === false) && <span className={`block whitespace-nowrap text-xs ${m < 0 ? "font-semibold text-red-600" : "text-slate-500"}`}>margem {m}%</span>}
                </span>
              );
            },
          },
          {
            label: "Estoque",
            className: "text-right",
            render: (r) => {
              const e = estoque(r), v = vendidos3m.get(r.id);
              return (
                <span>
                  <span className={e.alerta ? "font-semibold text-red-600" : "font-semibold"}>{e.texto}</span>
                  {e.detalhe && <span className="block whitespace-nowrap text-xs text-slate-500">{e.detalhe}</span>}
                  <span className="block text-xs text-slate-500" title="Vendidos nos últimos 3 meses">{v ? `vendeu ${v.quantidade} em 3 meses` : "sem venda em 3 meses"}</span>
                </span>
              );
            },
          },
          { label: "NCM", render: (r) => r.ncm ?? <span className="text-red-500">sem NCM</span> },
        ]}
        cartaoCelular={cartaoProduto}
        rowActions={(r) => (
          <>
            <button type="button" className="botao-icone h-9 w-9" title="Ficha do produto" aria-label={`Ficha de ${r.descricao}`} onClick={() => setFicha(r)}><IdCard size={16} /></button>
            {pode("movimentar_estoque") && r.tipo !== "servico" && (
              <button type="button" className="botao-icone h-9 w-9" title="Movimentar estoque" aria-label="Movimentar estoque" onClick={() => setMovimentar(r)}><ArrowDownUp size={16} /></button>
            )}
            <button type="button" className="botao-icone h-9 w-9" title="Histórico" aria-label="Histórico" onClick={() => setHistorico(r)}><History size={16} /></button>
            {r.kit && <button type="button" className="botao-icone h-9 w-9" title="Componentes do kit" aria-label="Componentes do kit" onClick={() => setKitAberto(r)}><Boxes size={16} /></button>}
          </>
        )}
      />

      </>}

      <MovimentoModal produto={movimentar} onClose={() => setMovimentar(null)} />
      <HistoricoModal produto={historico} onClose={() => setHistorico(null)} />
      {ficha && <FichaProduto produto={ficha} custo={custo(ficha)} podeEditar={pode("editar_produtos") || tem("tecnico")} onClose={() => setFicha(null)}
        onEditar={() => { const p = ficha; setFicha(null); setEditarAgora({ ...p }); }} />}
      {importar && <ImportarProdutos onClose={() => setImportar(false)} />}
      {importarKits && <ImportarKitsTiny onClose={() => setImportarKits(false)} />}
      {itensNotas && <ConferirItensNotas onClose={() => setItensNotas(false)} />}
      {unificando && <UnificarProdutosLista produtos={unificando.lista} onFim={(m) => { unificando.fim(m); setUnificando(null); }} />}
      {definindoLinha && <DefinirLinha ids={definindoLinha.ids} onFim={(m) => { definindoLinha.fim(m); setDefinindoLinha(null); }} />}
      {kitAberto && <KitComponentesModal kit={kitAberto} podeEditar={pode("editar_produtos")} onClose={() => setKitAberto(null)} />}
    </>
  );
}

function MovimentoModal({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [documento, setDocumento] = useState("");
  const [serie, setSerie] = useState("");
  // saída que não é venda (perda, quebra, uso interno, sucata…) vai pela baixa com motivo fiscal
  const [baixaFiscal, setBaixaFiscal] = useState(false);
  const [gravando, setGravando] = useState(false); // clique duplo não lança duas vezes
  const invalidate = useInvalidate();
  const { padrao, nome } = useUnidade();
  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const saldoAqui = Number(saldos.find((s) => s.produto_id === produto?.id && s.unidade_id === unidadeId)?.quantidade ?? 0);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!produto || gravando) return;
    setGravando(true);
    try {
      const qtd = Number(quantidade);
      // Ajuste informa o saldo final desejado; gravamos a diferença.
      const valor = tipo === "ajuste" ? qtd - saldoAqui : qtd;
      if (!valor) return notify("Nada a ajustar", "erro");
      const { error } = await supabase.from("estoque_movimentos").insert({
        produto_id: produto.id, tipo, quantidade: valor, motivo: motivo.trim(), documento: documento.trim() || null,
        numero_serie: serie || null, referencia_tipo: "manual", unidade_id: unidadeId,
      });
      if (error) throw error;
      notify("Estoque atualizado");
      invalidate("produtos", "estoque_movimentos", "estoque_unidade");
      setQuantidade(""); setMotivo(""); setDocumento(""); setSerie("");
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setGravando(false);
    }
  }

  return (
    <Modal open={!!produto} onClose={onClose} title={`Movimentar: ${produto?.descricao ?? ""}`}>
      <p className="mb-3 text-sm text-slate-600">Saldo em {nome(unidadeId)}: <b>{saldoAqui} {produto?.unidade}</b></p>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><CampoUnidade value={unidadeId} onChange={setUnidadeId} label="Unidade" /></div>
        <Field label="Tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="entrada">Entrada (compra, devolução)</option>
            <option value="saida">Saída (perda, uso interno)</option>
            <option value="ajuste">Ajuste de inventário (saldo final)</option>
          </select>
        </Field>
        {tipo === "saida" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
            Saída que não é venda (quebra, defeito, obsolescência, furto, uso interno, manutenção da fábrica, sucata ou amostra) vai pela
            <b> baixa com motivo fiscal</b>: ela mostra o documento que a lei pede para a perda virar despesa dedutível no Lucro Real.
            <div className="mt-2"><Button type="button" onClick={() => setBaixaFiscal(true)}>Fazer a baixa com motivo fiscal</Button></div>
          </div>
        )}
        {tipo !== "saida" && <>
        <Field label={tipo === "ajuste" ? "Saldo correto" : "Quantidade"}>
          <input className="input" type="number" step="any" min={tipo === "ajuste" ? 0 : 0.001} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
        </Field>
        <Field label="Motivo (obrigatório)" className="sm:col-span-2">
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3}
            placeholder={tipo === "ajuste" ? "Ex.: contagem física da prateleira 3" : "Ex.: devolução de cliente"} />
        </Field>
        <Field label="Documento de referência"><input className="input" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF, pedido, OS…" /></Field>
        <Field label="Nº de série (opcional)"><input className="input" value={serie} onChange={(e) => setSerie(e.target.value)} /></Field>
        {tipo === "ajuste" && <p className="text-xs text-slate-500 sm:col-span-2">Para conferir várias peças de uma vez, use a aba Contagem de estoque: ela mostra as divergências e pede a justificativa de cada uma.</p>}
        </>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          {tipo !== "saida" && <Button disabled={gravando}>{gravando ? "Gravando…" : "Confirmar"}</Button>}
        </div>
      </form>
      {baixaFiscal && produto && <RegistrarBaixa produtoInicial={produto as never} onClose={() => { setBaixaFiscal(false); onClose(); }} />}
    </Modal>
  );
}

function HistoricoModal({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const { pode } = usePerfil();
  // alterações do cadastro (custo, preço, código…) com quem, quando e o motivo; sem as mudanças de saldo
  const { data: alteracoes = [] } = useQuery({
    queryKey: ["auditoria", "produto", produto?.id],
    enabled: !!produto && pode("editar_produtos"),
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria").select("*").eq("tabela", "produtos").eq("registro_id", produto!.id)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as LinhaAuditoria[]).filter((l) => l.acao !== "update" || (l.campos ?? []).some((c) => c !== "estoque_atual"));
    },
  });
  const { data = [] } = useQuery({
    queryKey: ["estoque_movimentos", produto?.id],
    enabled: !!produto,
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque_movimentos")
        .select("*").eq("produto_id", produto!.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Modal open={!!produto} onClose={onClose} title={`Histórico: ${produto?.descricao ?? ""}`} wide>
      {alteracoes.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold">Alterações do cadastro (custo, preço, código…)</h3>
          <Table head={<><th className="th">Quando</th><th className="th">Quem</th><th className="th">O que mudou</th><th className="th">Motivo</th></>}>
            {alteracoes.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap text-sm">{new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="td text-sm">{l.usuario_nome ?? "sistema"}{l.origem === "sistema" && <div className="text-xs text-slate-500">automático</div>}</td>
                <td className="td text-sm"><DescricaoMudanca l={{ ...l, campos: (l.campos ?? []).filter((c) => c !== "estoque_atual") }} /></td>
                <td className="td text-sm text-amber-700">{l.motivo ?? ""}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <h3 className="mb-2 text-sm font-semibold">Movimentações de estoque</h3>
      <Table empty={data.length === 0} head={<><th className="th">Data</th><th className="th">Tipo</th><th className="th text-right">Qtd</th><th className="th">Motivo</th><th className="th">Documento</th><th className="th">Série</th></>}>
        {data.map((m: any) => (
          <tr key={m.id}>
            <td className="td">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
            <td className="td"><Badge value={m.tipo} /><EtiquetaUnidade id={m.unidade_id} /></td>
            <td className="td text-right">{m.tipo === "saida" ? "-" : m.tipo === "entrada" ? "+" : ""}{Number(m.quantidade)}</td>
            <td className="td">{m.motivo}</td>
            <td className="td">{m.documento}</td>
            <td className="td">{m.numero_serie}</td>
          </tr>
        ))}
      </Table>
    </Modal>
  );
}

/** Confere a lista sugerida (todos marcados) e move para Componentes de produção. */
function SugestaoComponentes({ produtos, onClose, onMover }: { produtos: Produto[]; onClose: () => void; onMover: (ids: string[]) => Promise<void> }) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(produtos.map((p) => p.id)));
  const [ocupado, setOcupado] = useState(false);
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal open onClose={onClose} title="Mover para Componentes de produção">
      <p className="mb-3 text-sm text-slate-600">Estão como peça de reposição, mas marcados "não vende". Desmarque o que for mesmo peça que o cliente compra.</p>
      <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {produtos.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={marcados.has(p.id)} onChange={() => alternar(p.id)} />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.descricao}</span><span className="text-xs text-slate-500">{[p.sku, p.categoria].filter(Boolean).join(" · ")}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-sm text-slate-600">{marcados.size} de {produtos.length} {pl(produtos.length, "marcado", "marcados")}</span>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={ocupado || !marcados.size} onClick={async () => { setOcupado(true); await onMover([...marcados]); setOcupado(false); }}>
          {ocupado ? "Movendo…" : `Mover ${marcados.size} para Componentes`}
        </Button>
      </div>
    </Modal>
  );
}
