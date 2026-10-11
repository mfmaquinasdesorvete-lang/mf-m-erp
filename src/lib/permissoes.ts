export type Papel = "admin" | "vendas" | "financeiro" | "tecnico" | "contador";

export const PAPEIS: { value: Papel; label: string; descricao: string }[] = [
  { value: "admin", label: "Administrador", descricao: "Acesso total, usuários e configurações" },
  { value: "vendas", label: "Vendas", descricao: "Pedidos, PDV, clientes, cobranças e NF-e das vendas" },
  { value: "financeiro", label: "Financeiro", descricao: "Contas a pagar/receber, notas fiscais, estoque, compras e fornecedores" },
  { value: "tecnico", label: "Técnico", descricao: "Assistência técnica, garantias, produção e compras de peças" },
  { value: "contador", label: "Contador", descricao: "Só consulta: notas fiscais, financeiro e o fechamento mensal (XML e planilhas)" },
];

/** Papéis que podem ser somados ao principal (admin e contador não se misturam). */
export const PAPEIS_ADICIONAIS: Papel[] = ["vendas", "financeiro", "tecnico"];

export const rotuloPapel = (p: string | null | undefined) => PAPEIS.find((x) => x.value === p)?.label ?? p ?? "";

export type Tela =
  | "painel" | "pedidos" | "assistencia" | "estoque" | "financeiro" | "notas"
  | "clientes" | "fornecedores" | "configuracoes" | "usuarios" | "garantias" | "relatorios" | "producao" | "email" | "comissoes" | "documentos" | "fluxo" | "margem" | "contador" | "conciliacao" | "auditoria" | "fretes";

/** Nome de cada tela na tabela de permissões (na ordem em que aparecem). */
export const TELAS_ROTULO: Record<Tela, string> = {
  painel: "Painel inicial", pedidos: "Vendas, orçamentos e PDV", fluxo: "Fluxo de pedidos", fretes: "Fretes e envios", comissoes: "Comissões",
  clientes: "Clientes", fornecedores: "Fornecedores e transportadoras", estoque: "Produtos e estoque", producao: "Produção, compras e cotações",
  assistencia: "Assistência técnica", garantias: "Garantias", financeiro: "Financeiro", conciliacao: "Conciliação bancária", margem: "Margem",
  relatorios: "Relatórios", notas: "Notas fiscais", contador: "Contador e fechamento", auditoria: "Auditoria", documentos: "Documentos",
  email: "E-mail", configuracoes: "Configurações", usuarios: "Usuários",
};

/** Telas que cada papel vê (admin vê todas). */
const TELAS: Record<Exclude<Papel, "admin">, Tela[]> = {
  vendas: ["painel", "fluxo", "fretes", "email", "comissoes", "documentos", "pedidos", "assistencia", "garantias", "producao", "estoque", "financeiro", "notas", "clientes", "fornecedores"],
  financeiro: ["painel", "contador", "conciliacao", "auditoria", "fluxo", "fretes", "margem", "email", "comissoes", "documentos", "pedidos", "assistencia", "garantias", "producao", "estoque", "financeiro", "notas", "relatorios", "clientes", "fornecedores"],
  contador: ["contador", "notas", "financeiro", "conciliacao", "auditoria", "documentos"],
  tecnico: ["painel", "documentos", "assistencia", "garantias", "producao", "estoque", "clientes"],
};

/** Ações de escrita (espelham as políticas do banco). */
export type Acao =
  | "editar_pedidos" | "editar_os" | "editar_produtos" | "movimentar_estoque" | "editar_fornecedores"
  | "editar_clientes" | "editar_financeiro" | "contas_pagar" | "emitir_nfe" | "nfe_recebidas"
  | "editar_equipamentos" | "editar_producao" | "receber_compras" | "editar_transportadoras" | "cotar_frete"
  | "emitir_nfse" | "cancelar_nfse" | "configurar_nfse";

export const ACOES_ROTULO: Record<Acao, string> = {
  editar_pedidos: "Criar e editar pedidos, orçamentos e vendas no PDV", editar_clientes: "Cadastrar e editar clientes",
  emitir_nfe: "Emitir NF-e", emitir_nfse: "Emitir NFS-e", cancelar_nfse: "Cancelar NFS-e", configurar_nfse: "Configurar a NFS-e",
  editar_os: "Abrir e editar ordens de serviço", editar_equipamentos: "Cadastrar equipamentos dos clientes",
  editar_produtos: "Cadastrar e editar produtos e preços", movimentar_estoque: "Movimentar estoque e contagem",
  editar_producao: "Produção, compras de peças e cotações", receber_compras: "Receber compras no estoque",
  editar_fornecedores: "Cadastrar e editar fornecedores", editar_transportadoras: "Cadastrar transportadoras", cotar_frete: "Cotar e aprovar frete",
  editar_financeiro: "Contas a receber, baixas e cobranças", contas_pagar: "Contas a pagar e pagamentos", nfe_recebidas: "NF-e de fornecedores (entrada)",
};

const ACOES: Record<Exclude<Papel, "admin">, Acao[]> = {
  vendas: ["editar_pedidos", "editar_clientes", "emitir_nfe", "emitir_nfse", "editar_equipamentos", "editar_transportadoras", "cotar_frete"],
  financeiro: [
    "editar_produtos", "movimentar_estoque", "editar_fornecedores", "editar_clientes",
    "editar_financeiro", "contas_pagar", "emitir_nfe", "nfe_recebidas", "editar_producao", "receber_compras", "editar_transportadoras",
    "emitir_nfse", "cancelar_nfse", "configurar_nfse",
  ],
  tecnico: ["editar_os", "editar_clientes", "editar_equipamentos", "editar_producao"],
  contador: [],
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
