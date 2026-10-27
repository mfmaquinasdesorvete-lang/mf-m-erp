export type Papel = "admin" | "vendas" | "financeiro" | "tecnico" | "contador" | "expedicao" | "marketplace" | "compras" | "representante" | "giga";

export const PAPEIS: { value: Papel; label: string; descricao: string }[] = [
  { value: "admin", label: "Administrador", descricao: "Acesso total, usuários e configurações" },
  { value: "vendas", label: "Vendas", descricao: "Pedidos, PDV, clientes, cobranças e NF-e das vendas" },
  { value: "financeiro", label: "Financeiro", descricao: "Contas a pagar/receber, bancos, notas fiscais, fornecedores, relatórios e salários" },
  { value: "tecnico", label: "Técnico", descricao: "Assistência técnica, garantias, produção e compras de peças" },
  { value: "contador", label: "Contador", descricao: "Só consulta: notas fiscais, financeiro e o fechamento mensal (XML e planilhas)" },
  { value: "expedicao", label: "Expedição", descricao: "Separar, conferir, embalar e despachar os pedidos; etiquetas e DANFE" },
  { value: "marketplace", label: "Marketplaces", descricao: "Ajusta os cadastros dos produtos para os anúncios: título, descrição, fotos, EAN, categorias e medidas (sem preço, custo nem estoque)" },
  { value: "compras", label: "Compras", descricao: "Ordens de compra, cotações, necessidades, notas de fornecedor (custo, preço para aprovação, vínculo com a OC), fornecedores e estoque" },
  { value: "giga", label: "Só o giga", descricao: "Só a tela do Teste do giga (REG-006): lança e anula os testes das máquinas, sem ver o resto do ERP" },
  { value: "representante", label: "Representante (portal)", descricao: "Externo: só o portal, com os próprios pedidos, orçamentos, clientes da carteira e comissões" },
];

/** Papéis que podem ser somados ao principal (admin, contador e representante não se misturam). */
export const PAPEIS_ADICIONAIS: Papel[] = ["vendas", "financeiro", "tecnico", "expedicao", "marketplace", "compras"];

export const rotuloPapel = (p: string | null | undefined) => PAPEIS.find((x) => x.value === p)?.label ?? p ?? "";

export type Tela =
  | "painel" | "pedidos" | "assistencia" | "estoque" | "financeiro" | "notas"
  | "clientes" | "fornecedores" | "configuracoes" | "usuarios" | "garantias" | "relatorios" | "producao" | "email" | "comissoes" | "documentos" | "fluxo" | "margem" | "contador" | "conciliacao" | "auditoria" | "fretes" | "funcionarios"
  | "expedicao" | "implantacao" | "importar" | "mercadolivre" | "metas" | "testegiga" | "scrum";

/** Nome de cada tela na tabela de permissões (na ordem em que aparecem). */
export const TELAS_ROTULO: Record<Tela, string> = {
  painel: "Painel inicial", pedidos: "Vendas, orçamentos e PDV", mercadolivre: "Mercado Livre (anúncios, estoque e preço)", fluxo: "Fluxo de pedidos", expedicao: "Separação e embalagem", fretes: "Fretes e envios", comissoes: "Comissões", metas: "Metas de vendas",
  clientes: "Clientes", fornecedores: "Fornecedores e transportadoras", estoque: "Produtos e estoque", producao: "Produção, compras e cotações", testegiga: "Teste do giga (REG-006)",
  funcionarios: "Funcionários (RH)", assistencia: "Assistência técnica", garantias: "Garantias", financeiro: "Financeiro", conciliacao: "Conciliação bancária", margem: "Margem",
  relatorios: "Relatórios", notas: "Notas fiscais", contador: "Contador e fechamento", auditoria: "Auditoria", documentos: "Documentos",
  email: "E-mail", configuracoes: "Configurações", usuarios: "Usuários", implantacao: "Troca do Tiny (implantação)", importar: "Importar dados",
  scrum: "Scrum das equipes",
};

/** Telas que cada papel vê (admin vê todas). O Scrum das equipes é de todos da empresa (não do contador nem do representante). */
const TELAS: Record<Exclude<Papel, "admin">, Tela[]> = {
  // metas: o vendedor vê só a própria (o banco filtra); administrador e financeiro veem e cadastram todas
  // cada papel só com o que é dele (revisão de 27/10): vendas sem produção e compras, fornecedores, assistência e financeiro
  vendas: ["painel", "fluxo", "expedicao", "fretes", "email", "comissoes", "metas", "documentos", "pedidos", "mercadolivre", "estoque", "notas", "clientes", "scrum"],
  // financeiro vê só o que é de financeiro (pedido de 27/10): a área Financeiro (contas, bancos e conciliação,
  // aprovações, auditoria), as notas fiscais, os fornecedores, relatórios e margem, e os funcionários (salários)
  financeiro: ["conciliacao", "auditoria", "margem", "financeiro", "notas", "relatorios", "fornecedores", "funcionarios"],
  contador: ["contador", "notas", "financeiro", "conciliacao", "auditoria", "documentos"],
  // técnico: só as OS (assistência), as garantias e o teste do giga
  tecnico: ["assistencia", "garantias", "testegiga"],
  // expedição: só separar e embalar e o fluxo dos pedidos
  expedicao: ["expedicao", "fluxo"],
  // só os cadastros dos produtos (lista, qualidade, marketplace e anúncios, categorias, tabelas de preço para consulta)
  // e os anúncios do Mercado Livre (o que vai de estoque e preço, exceções e aprovar preço travado)
  marketplace: ["estoque", "documentos", "mercadolivre", "scrum"],
  // área de Compras (OC, cotações, necessidades, reposição), notas de fornecedor, fornecedores, produtos e estoque
  compras: ["producao", "notas", "fornecedores", "estoque", "documentos", "scrum"],
  // externo: nenhuma tela do ERP; só o portal (/portal), que lê e grava pelas funções portal_* do banco
  // só o Teste do giga (REG-006)
  giga: ["testegiga"],
  representante: [],
};

/** Ações de escrita (espelham as políticas do banco). */
export type Acao =
  | "editar_pedidos" | "editar_os" | "editar_produtos" | "movimentar_estoque" | "editar_fornecedores"
  | "editar_clientes" | "editar_financeiro" | "contas_pagar" | "emitir_nfe" | "nfe_recebidas"
  | "editar_equipamentos" | "editar_producao" | "receber_compras" | "editar_transportadoras" | "cotar_frete"
  | "emitir_nfse" | "cancelar_nfse" | "configurar_nfse" | "expedir" | "lancar_teste_giga";

export const ACOES_ROTULO: Record<Acao, string> = {
  editar_pedidos: "Criar e editar pedidos, orçamentos e vendas no PDV", editar_clientes: "Cadastrar e editar clientes",
  expedir: "Separar, conferir, embalar e despachar pedidos",
  emitir_nfe: "Emitir NF-e", emitir_nfse: "Emitir NFS-e", cancelar_nfse: "Cancelar NFS-e", configurar_nfse: "Configurar a NFS-e",
  editar_os: "Abrir e editar ordens de serviço", editar_equipamentos: "Cadastrar equipamentos dos clientes",
  editar_produtos: "Cadastrar e editar produtos e preços", movimentar_estoque: "Movimentar estoque e contagem",
  editar_producao: "Produção, compras de peças e cotações", receber_compras: "Receber compras no estoque",
  lancar_teste_giga: "Lançar e anular testes do giga (REG-006)",
  editar_fornecedores: "Cadastrar e editar fornecedores", editar_transportadoras: "Cadastrar transportadoras", cotar_frete: "Cotar e aprovar frete",
  editar_financeiro: "Contas a receber, baixas e cobranças", contas_pagar: "Contas a pagar e pagamentos", nfe_recebidas: "NF-e de fornecedores (entrada)",
};

const ACOES: Record<Exclude<Papel, "admin">, Acao[]> = {
  vendas: ["editar_pedidos", "editar_clientes", "emitir_nfe", "emitir_nfse", "editar_equipamentos", "editar_transportadoras", "cotar_frete", "expedir"],
  financeiro: [
    "editar_produtos", "movimentar_estoque", "editar_fornecedores", "editar_clientes",
    "editar_financeiro", "contas_pagar", "emitir_nfe", "nfe_recebidas", "editar_producao", "receber_compras", "editar_transportadoras",
    "emitir_nfse", "cancelar_nfse", "configurar_nfse", "expedir",
  ],
  tecnico: ["editar_os", "editar_clientes", "editar_equipamentos", "editar_producao", "lancar_teste_giga"],
  contador: [],
  expedicao: ["expedir"],
  // o banco segura preço, custo, estoque, fornecedor, tipo e ativar/desativar (perfil_marketplace)
  marketplace: ["editar_produtos"],
  // produto: o banco deixa mudar só marcadores, mínimo/máximo, prazo, compra mínima e fornecedor padrão; preço e custo
  // passam pela nota (custo) e pela aprovação (preço)
  compras: ["editar_producao", "receber_compras", "nfe_recebidas", "editar_fornecedores"],
  giga: ["lancar_teste_giga"],
  representante: [],
};

/** Papel principal + adicionais (sem admin, que já vê tudo). */
const papeisDe = (papel: Papel | null | undefined, extras?: readonly string[] | null) =>
  [papel, ...(extras ?? [])].filter((p): p is Exclude<Papel, "admin"> => !!p && p !== "admin" && p in TELAS);

export const podeVer = (papel: Papel | null | undefined, tela: Tela, extras?: readonly string[] | null) =>
  papel === "admin" || papeisDe(papel, extras).some((p) => TELAS[p].includes(tela));

export const pode = (papel: Papel | null | undefined, acao: Acao, extras?: readonly string[] | null) =>
  papel === "admin" || papeisDe(papel, extras).some((p) => ACOES[p].includes(acao));

/** Tem algum destes papéis (principal ou adicional)? Admin sempre tem. */
export const temPapel = (papel: Papel | null | undefined, extras: readonly string[] | null | undefined, ...papeis: Papel[]) =>
  papel === "admin" || (!!papel && papeis.includes(papel)) || (extras ?? []).some((p) => papeis.includes(p as Papel));

/** Para a tabela "o que cada papel pode": telas que vê e ações que faz. */
export const telasDoPapel = (p: Papel): Tela[] => (p === "admin" ? (Object.keys(TELAS_ROTULO) as Tela[]) : TELAS[p]);
export const acoesDoPapel = (p: Papel): Acao[] => (p === "admin" ? (Object.keys(ACOES_ROTULO) as Acao[]) : ACOES[p]);

/** Itens do menu escondidos por papel (Usuários → Perfis): { vendas: ["/comissoes", …] }. Só esconde: o que o papel não acessa continua fora. */
/** Itens escondidos por papel (Usuários → Perfis). "admin" vale para o administrador que não é a conta master. */
export type MenuOculto = Partial<Record<Papel, string[]>>;

/**
 * A pessoa vê este item? Admin vê tudo o que a master não escondeu dele (a master vê tudo: menu.ts). Para os demais, basta um dos papéis (principal ou adicional)
 * ter a tela e não ter escondido o item (`to`).
 */
export const itemVisivel = (papel: Papel | null | undefined, extras: readonly string[] | null | undefined, tela: Tela, to: string | undefined, oculto: MenuOculto) =>
  papel === "admin" ? !(to && (oculto.admin ?? []).includes(to)) : papeisDe(papel, extras).some((p) => TELAS[p].includes(tela) && !(to && ((oculto[p] ?? []).includes(to) || (OCULTO_FIXO[p] ?? []).includes(to))));

/** Representante externo: entra só no portal (/portal). */
export const ehRepresentante = (papel: Papel | string | null | undefined) => papel === "representante";

/** Papéis internos (telas do ERP), sem o representante: para a tabela de perfis. */
export const PAPEIS_INTERNOS = PAPEIS.filter((p) => p.value !== "representante");

/** Itens que o papel nunca vê, mesmo estando numa tela dele (o Marketplaces cuida do cadastro, não do estoque). */
const OCULTO_FIXO: MenuOculto = {
  marketplace: ["/transferencias"],
  // Compras fica na tela de Compras e nas notas de fornecedor: sem as ordens de produção, o painel das notas
  // emitidas e as transferências entre unidades
  compras: ["/producao", "/painel/notas", "/transferencias"],
  // a lista de entre contas e sócios é só do administrador, do financeiro e do contador (a própria tela bloqueia)
  vendas: ["/partes-relacionadas"],
};
