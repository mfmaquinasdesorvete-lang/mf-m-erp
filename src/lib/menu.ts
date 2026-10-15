// Menu do ERP por área de trabalho (usado pelo menu lateral e pela escolha do que cada perfil vê, em Usuários).
import {
  ArrowLeftRight, BadgeCheck, BarChart3, Boxes, Calculator, ClipboardCheck, CreditCard, Factory, FileText, FolderTree, Fuel, Gauge, HandCoins, IdCard, Inbox, Landmark, LayoutDashboard,
  Package, PackageCheck, PackageSearch, Paperclip, PieChart, Scale, ScanBarcode, Settings, ShieldAlert, ShieldCheck, ShoppingCart, Store, Truck,
  Upload, UserCog, Users, Wallet, Workflow, Wrench,
} from "lucide-react";
import { usePerfil } from "./auth";
import { useConfig } from "./useConfig";
import { itemVisivel, type MenuOculto, type Tela } from "./permissoes";

export type Item = { to: string; tela: Tela; label: string; curto: string; icon: typeof Boxes; busca?: string };
export type Grupo = {
  id: string; titulo: string; itens: Item[];
  /** cor da área (a mesma dos botões coloridos) e ícone do bloco */
  cor?: string; icone?: typeof Boxes;
  /** ação direta da área (ex.: "+ Pedido" abre o pedido novo) */
  acao?: { label: string; dica: string; to: string; state?: Record<string, unknown>; tela: Tela };
};

// Menu por área de trabalho: cada área é um bloco separado (abre só a área em uso).
// "busca" são outros nomes que as pessoas usam para achar a tela (campo Buscar no menu).
export const grupos: Grupo[] = [
  {
    id: "inicio", titulo: "",
    itens: [
      { to: "/", tela: "painel", label: "Início", curto: "Início", icon: LayoutDashboard, busca: "painel dashboard resumo" },
      { to: "/email", tela: "email", label: "Caixa de e-mail", curto: "E-mail", icon: Inbox, busca: "email mensagens" },
    ],
  },
  {
    id: "vendas", titulo: "Vendas", cor: "from-[#10b981] to-[#059669]", icone: ShoppingCart,
    acao: { label: "Venda", dica: "Nova venda ou orçamento", to: "/pedidos", state: { novo: true }, tela: "pedidos" },
    itens: [
      { to: "/painel/vendas", tela: "pedidos", label: "Painel de vendas", curto: "Painel", icon: LayoutDashboard, busca: "dashboard indicadores gráficos conversão funil canal vendedor" },
      { to: "/pedidos", tela: "pedidos", label: "Vendas e orçamentos", curto: "Vendas", icon: ShoppingCart, busca: "pedido orçamento proposta venda" },
      { to: "/comissoes", tela: "comissoes", label: "Comissões", curto: "Comissões", icon: HandCoins, busca: "vendedor representante linha de produtos linhas comissionamento alíquota" },
    ],
  },
  {
    // cadastros de pessoas e serviços usados em várias áreas
    id: "cadastros", titulo: "Cadastros", cor: "from-[#a855f7] to-[#6d28d9]", icone: Users,
    itens: [
      { to: "/clientes", tela: "clientes", label: "Clientes", curto: "Clientes", icon: Users, busca: "cadastro contato cpf cnpj painel dos cadastros base" },
      { to: "/tecnicos", tela: "assistencia", label: "Técnicos", curto: "Técnicos", icon: UserCog, busca: "técnico parceiro assistência região cidade estado atende quem atendeu" },
      { to: "/fornecedores", tela: "fornecedores", label: "Fornecedores", curto: "Fornec.", icon: Store, busca: "fornecedor peças compra cotação" },
      { to: "/produtos/servicos", tela: "estoque", label: "Serviços", curto: "Serviços", icon: Wrench, busca: "serviço carga de gás limpeza lavagem troca de compressor reparo mecânica mão de obra visita" },
    ],
  },
  {
    id: "logistica", titulo: "Logística", cor: "from-[#a855f7] to-[#6d28d9]", icone: Truck,
    itens: [
      { to: "/fluxo", tela: "fluxo", label: "Fluxo de pedidos", curto: "Fluxo", icon: Workflow, busca: "expedição separar embalar despachar entrega quadro" },
      { to: "/expedicao", tela: "expedicao", label: "Separação e embalagem", curto: "Expedição", icon: PackageCheck, busca: "expedição separar conferir embalar despachar lista de separação picking etiqueta volume" },
      { to: "/fretes", tela: "fretes", label: "Fretes e envios", curto: "Fretes", icon: PackageSearch, busca: "frete cotação transportadora coleta rastreio entrega comprovante ocorrência cte painel" },
      { to: "/transportadoras", tela: "fornecedores", label: "Transportadoras", curto: "Transp.", icon: Truck, busca: "transportadora frete coleta cotação" },
      { to: "/embalagens", tela: "fretes", label: "Embalagens", curto: "Embal.", icon: Package, busca: "caixa engradado palete medidas peso cubagem" },
    ],
  },
  {
    id: "posvenda", titulo: "Assistência", cor: "from-[#14b8a6] to-[#0e7490]", icone: Wrench,
    acao: { label: "OS", dica: "Abrir ordem de serviço", to: "/assistencia", state: { novaOS: {} }, tela: "assistencia" },
    itens: [
      { to: "/painel/posvenda", tela: "assistencia", label: "Painel da assistência", curto: "Painel", icon: LayoutDashboard, busca: "dashboard indicadores gráficos técnico conserto tempo garantia preventiva pós-venda" },
      { to: "/assistencia", tela: "assistencia", label: "Ordens de serviço", curto: "OS", icon: Wrench, busca: "os ordem de serviço conserto técnico assistência técnica" },
      { to: "/garantias", tela: "garantias", label: "Garantias e preventivas", curto: "Garantias", icon: ShieldCheck, busca: "preventiva manutenção equipamento" },
    ],
  },
  {
    id: "producao", titulo: "Fábrica e estoque", cor: "from-[#f97316] to-[#dc2626]", icone: Factory,
    itens: [
      { to: "/painel/producao", tela: "producao", label: "Painel da fábrica", curto: "Painel", icon: LayoutDashboard, busca: "dashboard indicadores gráficos produção estoque mínimo peça faltando compras" },
      { to: "/estoque", tela: "estoque", label: "Produtos e estoque", curto: "Produtos", icon: Boxes, busca: "produto máquina peça de reposição componente insumo inventário ncm categoria kit contagem estoque painel das máquinas painel dos produtos" },
      { to: "/produtos/maquinas", tela: "estoque", label: "Máquinas", curto: "Máquinas", icon: Factory, busca: "máquina sorvete milk shake produto acabado modelos ficha manuais garantia" },
      { to: "/producao", tela: "producao", label: "Produção e compras", curto: "Produção", icon: Factory, busca: "ordem de produção pedido de compra fábrica ficha técnica" },
      { to: "/transferencias", tela: "estoque", label: "Transferências SC ↔ SP", curto: "Transf.", icon: ArrowLeftRight, busca: "matriz filial" },
    ],
  },
  {
    id: "financeiro", titulo: "Financeiro", cor: "from-[#f59e0b] to-[#ea580c]", icone: Wallet,
    acao: { label: "Conta", dica: "Lançar conta a pagar", to: "/financeiro", state: { aba: "pagar", nova: true }, tela: "financeiro" },
    itens: [
      { to: "/painel/financeiro", tela: "financeiro", label: "Painel do financeiro", curto: "Painel", icon: LayoutDashboard, busca: "dashboard indicadores gráficos saldo caixa inadimplência despesas categoria" },
      { to: "/financeiro", tela: "financeiro", label: "Contas a pagar e receber", curto: "Contas", icon: Wallet, busca: "boleto pix pagamento recebimento cobrança parcela dre fluxo de caixa recibo contas fixas" },
      { to: "/aprovacoes", tela: "financeiro", label: "Aprovações", curto: "Aprovar", icon: BadgeCheck, busca: "aprovação revisão alçada segunda revisão devolver rejeitar pendência documento contador validar" },
      { to: "/conciliacao", tela: "conciliacao", label: "Bancos e conciliação", curto: "Bancos", icon: Landmark, busca: "extrato ofx caixa saldo pix recebidos infinitepay nubank inter cartão" },
      { to: "/combustivel", tela: "financeiro", label: "Combustível (postos)", curto: "Combust.", icon: Fuel, busca: "posto gasolina diesel etanol abastecimento veículo carro gasto" },
      { to: "/auditoria", tela: "auditoria", label: "Auditoria financeira", curto: "Auditoria", icon: ShieldAlert, busca: "checklist exceções histórico alterações" },
    ],
  },
  {
    id: "notas", titulo: "Fiscal", cor: "from-[#0ea5e9] to-[#2563eb]", icone: FileText,
    acao: { label: "NF-e", dica: "Emitir nota fiscal", to: "/notas", state: { emitir: true }, tela: "notas" },
    itens: [
      { to: "/painel/notas", tela: "notas", label: "Painel fiscal", curto: "Painel", icon: LayoutDashboard, busca: "painel de notas dashboard indicadores gráficos impostos cfop faturamento rejeitada" },
      { to: "/notas", tela: "notas", label: "Notas fiscais", curto: "Notas", icon: FileText, busca: "nf nfe xml danfe sefaz tributação ibs cbs icms focus emitir emitida recebida fornecedor" },
      { to: "/contador", tela: "contador", label: "Painel do contador", curto: "Contador", icon: Calculator, busca: "fechamento contabilidade" },
      { to: "/analista-fiscal", tela: "contador", label: "Analista fiscal", curto: "Analista", icon: Scale, busca: "imposto economia auditoria fiscal lucro real presumido crédito pis cofins icms ipi irpj csll planejamento" },
    ],
  },
  {
    id: "analises", titulo: "Gestão", cor: "from-[#6366f1] to-[#4338ca]", icone: BarChart3,
    itens: [
      { to: "/gerencial", tela: "relatorios", label: "Painel gerencial", curto: "Gerencial", icon: Gauge, busca: "decisão curva abc clientes inativos parados tendência gargalos comparativo ano anterior" },
      { to: "/relatorios", tela: "relatorios", label: "Relatórios", curto: "Relatórios", icon: BarChart3, busca: "faturamento dre fluxo de caixa" },
      { to: "/margem", tela: "margem", label: "Margem de contribuição", curto: "Margem", icon: PieChart, busca: "lucro custo rentabilidade" },
      { to: "/implantacao", tela: "implantacao", label: "Troca do Tiny", curto: "Implantação", icon: ClipboardCheck, busca: "implantação plano virada tiny etapas prazos uso do erp checklist" },
      { to: "/funcionarios", tela: "funcionarios", label: "Funcionários", curto: "Equipe", icon: IdCard, busca: "funcionário rh equipe colaborador salário folha admissão técnico cargo setor" },
      { to: "/documentos", tela: "documentos", label: "Documentos", curto: "Docs", icon: Paperclip, busca: "anexos arquivos" },
    ],
  },
];

/**
 * Telas que saíram da lista do menu mas continuam com endereço (abertas por botões dentro das telas, pela engrenagem
 * de Configurações ou pela busca do menu). Ficam aqui para a busca, os atalhos e as permissões por perfil.
 */
export const itensForaDoMenu: Item[] = [
  // PDV: fica no cartão próprio do acesso rápido
  { to: "/pdv", tela: "pedidos", label: "PDV (venda de balcão)", curto: "PDV", icon: ScanBarcode, busca: "pdv balcão caixa venda rápida cupom comprovante troco leitor código de barras" },
  { to: "/configuracoes", tela: "configuracoes", label: "Configurações", curto: "Ajustes", icon: Settings, busca: "empresa marca logo cores unidades recebimentos pix taxas orçamento garantia comissão catálogo avisos telegram backup" },
  { to: "/importar", tela: "importar", label: "Importar dados", curto: "Importar", icon: Upload, busca: "importar planilha xml zip tiny extrato ofx my frost kits propostas contatos produtos" },
  { to: "/usuarios", tela: "usuarios", label: "Usuários e permissões", curto: "Usuários", icon: UserCog, busca: "acesso senha permissões papel perfil" },
  { to: "/formas-pagamento", tela: "financeiro", label: "Formas de pagamento", curto: "Pagto.", icon: CreditCard, busca: "pix boleto cartão parcelas taxa condição de pagamento" },
  { to: "/configuracoes/cadastros", tela: "configuracoes", label: "Categorias e marcadores", curto: "Categ.", icon: FolderTree, busca: "categoria subcategoria marcador etiqueta tag cor organizar cadastro" },
  { to: "/painel/cadastros", tela: "clientes", label: "Painel dos clientes", curto: "Pn. clientes", icon: LayoutDashboard, busca: "painel dos cadastros clientes novos sumidos qualidade" },
  { to: "/painel/maquinas", tela: "estoque", label: "Painel das máquinas", curto: "Pn. máq.", icon: LayoutDashboard, busca: "máquina modelo vendidas estoque montagem garantia" },
  { to: "/painel/produtos", tela: "estoque", label: "Painel dos produtos", curto: "Pn. prod.", icon: LayoutDashboard, busca: "produto peça mais vendidos curva abc parado giro margem reposição vai faltar" },
  { to: "/produtos/pecas", tela: "estoque", label: "Peças de reposição", curto: "Peças", icon: Wrench, busca: "peça reposição catálogo cliente compra" },
  { to: "/produtos/componentes", tela: "estoque", label: "Componentes de produção", curto: "Compon.", icon: Package, busca: "componente produção insumo matéria-prima ficha técnica fábrica" },
];

/** Área de uma rota (para abrir o bloco certo). */
// área (cor e menu aberto) das telas que não estão na lista do menu
const AREA_FORA: [string, string][] = [
  ["/produtos/servicos", "cadastros"], ["/produtos/", "producao"], ["/pdv", "vendas"], ["/painel/maquinas", "producao"], ["/painel/produtos", "producao"], ["/painel/cadastros", "vendas"],
  ["/formas-pagamento", "financeiro"], ["/configuracoes", "admin"], ["/usuarios", "admin"], ["/importar", "admin"],
];
export const grupoDaRota = (path: string) =>
  grupos.find((g) => g.id !== "inicio" && g.itens.some((i) => i.to !== "/" && (path === i.to || path.startsWith(i.to + "/"))))?.id
  ?? AREA_FORA.find(([r]) => path === r || path.startsWith(r.endsWith("/") ? r : r + "/"))?.[1] ?? null;

export const todosItens = [...grupos.flatMap((g) => g.itens), ...itensForaDoMenu];

/**
 * O que a pessoa logada vê: a tela tem de estar entre as do papel (principal ou adicional) e não pode estar
 * escondida para esse papel em Usuários → Perfis (configuracoes.menu_oculto). Rota fora do menu segue só o papel.
 */
export function useVisivel() {
  const { papel, papeis_extras } = usePerfil();
  const { data: cfg } = useConfig();
  const oculto = (cfg?.menu_oculto ?? {}) as MenuOculto;
  const ve = (tela: Tela, to?: string) => itemVisivel(papel, papeis_extras, tela, to && todosItens.some((i) => i.to === to) ? to : undefined, oculto);
  return { ve, item: (i: { tela: Tela; to: string }) => ve(i.tela, i.to) };
}
