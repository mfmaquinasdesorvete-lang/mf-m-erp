export type Papel = "admin" | "vendas" | "financeiro" | "tecnico" | "contador";

export const PAPEIS: { value: Papel; label: string; descricao: string }[] = [
  { value: "admin", label: "Administrador", descricao: "Acesso total, usuários e configurações" },
  { value: "vendas", label: "Vendas", descricao: "Pedidos, clientes, cobranças e NF-e das vendas" },
  { value: "financeiro", label: "Financeiro", descricao: "Contas a pagar/receber, notas fiscais, estoque e fornecedores" },
  { value: "tecnico", label: "Técnico", descricao: "Ordens de serviço da assistência técnica" },
  { value: "contador", label: "Contador", descricao: "Só consulta: notas fiscais, financeiro e o fechamento mensal (XML e planilhas)" },
];

export type Tela =
  | "painel" | "pedidos" | "assistencia" | "estoque" | "financeiro" | "notas"
  | "clientes" | "fornecedores" | "configuracoes" | "usuarios" | "garantias" | "relatorios" | "producao" | "email" | "comissoes" | "documentos" | "fluxo" | "margem" | "contador" | "conciliacao" | "auditoria" | "fretes";

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
  | "editar_equipamentos" | "editar_producao" | "receber_compras" | "editar_transportadoras" | "cotar_frete";

const ACOES: Record<Exclude<Papel, "admin">, Acao[]> = {
  vendas: ["editar_pedidos", "editar_clientes", "emitir_nfe", "editar_equipamentos", "editar_transportadoras", "cotar_frete"],
  financeiro: [
    "editar_produtos", "movimentar_estoque", "editar_fornecedores", "editar_clientes",
    "editar_financeiro", "contas_pagar", "emitir_nfe", "nfe_recebidas", "editar_producao", "receber_compras", "editar_transportadoras",
  ],
  tecnico: ["editar_os", "editar_clientes", "editar_equipamentos", "editar_producao"],
  contador: [],
};

export const podeVer = (papel: Papel | null | undefined, tela: Tela) =>
  papel === "admin" || (!!papel && TELAS[papel].includes(tela));

export const pode = (papel: Papel | null | undefined, acao: Acao) =>
  papel === "admin" || (!!papel && ACOES[papel].includes(acao));
