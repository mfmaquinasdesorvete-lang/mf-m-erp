// Checklist da auditoria financeira, conferido a cada mês (competência).
// "alertas" liga o item às regras automáticas que ajudam a escolher a amostra; o item só fica OK depois de
// olhar documento e extrato. Os ids são fixos: mudar o texto não perde o que já foi respondido.
import type { TipoExcecao } from "./auditoria";

export type ItemChecklist = { id: string; texto: string; alertas?: TipoExcecao[] };
export type SecaoChecklist = { id: string; titulo: string; teste: string; itens: ItemChecklist[] };

export const CHECKLIST: SecaoChecklist[] = [
  {
    id: "receber", titulo: "Contas a receber",
    teste: "Selecione recebimentos no extrato e rastreie-os até o título e a venda; depois escolha títulos no ERP e confirme que o recebimento aparece no extrato.",
    itens: [
      { id: "r1", texto: "Cada parcela está vinculada ao pedido, ao cliente e ao documento de origem?", alertas: ["recebimento_sem_origem"] },
      { id: "r2", texto: "Valor, vencimento, condição de pagamento e cliente correspondem ao pedido aprovado?", alertas: ["parcelas_divergentes"] },
      { id: "r3", texto: "Alterações de vencimento, valor ou baixa têm usuário, data, motivo e aprovação?", alertas: ["alteracao"] },
      { id: "r4", texto: "Recebimentos estão conciliados com extrato, comprovante ou retorno bancário?", alertas: ["baixa_sem_extrato"] },
      { id: "r5", texto: "Estornos, descontos e baixas parciais estão documentados e autorizados?", alertas: ["recebido_a_menor", "alteracao"] },
      { id: "r6", texto: "Há títulos vencidos, duplicados ou recebidos sem identificação da origem?", alertas: ["duplicidade", "recebimento_sem_origem"] },
      { id: "r7", texto: "Boletos ou cobranças cancelados deixaram de aparecer como a receber?", alertas: ["pedido_cancelado", "cobranca_os_cancelada"] },
    ],
  },
  {
    id: "pagar", titulo: "Contas a pagar",
    teste: "Compare uma amostra de pagamentos do extrato bancário com o lançamento, o documento fiscal, a aprovação e o fornecedor cadastrado.",
    itens: [
      { id: "p1", texto: "Cada lançamento tem fornecedor, documento de suporte, vencimento e categoria?", alertas: ["sem_documento"] },
      { id: "p2", texto: "A despesa foi aprovada por alguém autorizado?", alertas: ["segregacao"] },
      { id: "p3", texto: "Pagamentos correspondem ao valor aprovado e ao beneficiário correto?", alertas: ["alteracao", "valor_redondo"] },
      { id: "p4", texto: "Há controle contra duplicidade de nota, fatura ou pagamento?", alertas: ["duplicidade"] },
      { id: "p5", texto: "Alterações de favorecido, valor ou vencimento ficam registradas?", alertas: ["alteracao"] },
      { id: "p6", texto: "Pagamentos urgentes, manuais ou fora do fluxo normal têm justificativa e aprovação?", alertas: ["pagamento_fora_fluxo"] },
      { id: "p7", texto: "Notas de fornecedores recebidas foram conferidas com o pedido de compra e o recebimento?", alertas: ["nfe_sem_lancamento"] },
    ],
  },
  {
    id: "caixa", titulo: "Caixa e conciliação bancária",
    teste: "Refaça a conciliação de uma conta e de um período escolhidos, partindo do extrato bancário.",
    itens: [
      { id: "c1", texto: "As contas bancárias e os caixas cadastrados no ERP estão completos e atualizados?" },
      { id: "c2", texto: "A conciliação é feita com periodicidade definida e, quando possível, por pessoa diferente de quem paga?", alertas: ["segregacao"] },
      { id: "c3", texto: "Diferenças entre ERP e extrato são investigadas, justificadas e resolvidas?", alertas: ["saldo_divergente", "baixa_sem_extrato"] },
      { id: "c4", texto: "Não há lançamentos pendentes antigos nem ajustes sem documentação?", alertas: ["extrato_pendente"] },
      { id: "c5", texto: "Saldos iniciais e finais conferem com os extratos?", alertas: ["saldo_divergente"] },
      { id: "c6", texto: "Transferências entre contas não foram registradas como receita ou despesa?" },
    ],
  },
  {
    id: "vinculo", titulo: "Vínculo com vendas, estoque e assistência",
    teste: "Siga uma venda e uma OS do registro de origem até estoque, nota fiscal, contas a receber e recebimento.",
    itens: [
      { id: "v1", texto: "Pedidos aprovados geram parcelas no valor e nas datas corretas?", alertas: ["parcelas_divergentes"] },
      { id: "v2", texto: "Cancelamentos de pedidos revertem as parcelas em aberto sem apagar a trilha?", alertas: ["pedido_cancelado"] },
      { id: "v3", texto: "OS concluídas geram cobrança quando aplicável e não cobram o que é garantia?", alertas: ["os_sem_cobranca", "cobranca_os_cancelada"] },
      { id: "v4", texto: "Os custos das peças baixadas em OS podem ser relacionados ao estoque e ao serviço?" },
      { id: "v5", texto: "Notas fiscais emitidas batem com os pedidos e os valores faturados?" },
      { id: "v6", texto: "Recebimento não é confundido com faturamento, nem pagamento com custo reconhecido?" },
    ],
  },
  {
    id: "categorias", titulo: "Categorias, competência e relatórios",
    teste: "Recalcule à mão alguns indicadores a partir dos lançamentos detalhados e compare com o relatório.",
    itens: [
      { id: "k1", texto: "As categorias financeiras são padronizadas e usadas do mesmo jeito?" },
      { id: "k2", texto: "Receitas, custos, despesas, impostos e transferências estão separados corretamente?" },
      { id: "k3", texto: "A data de competência é separada da data de pagamento ou recebimento quando precisa?" },
      { id: "k4", texto: "Os relatórios de margem usam os custos corretos e o mesmo período das receitas?" },
      { id: "k5", texto: "O fluxo de caixa projetado separa o previsto do já realizado?" },
      { id: "k6", texto: "Os indicadores mostram com clareza o período, os filtros e o critério de cálculo?" },
    ],
  },
  {
    id: "acesso", titulo: "Acesso e segregação de funções",
    teste: "Em equipe pequena, quando não dá para separar funções, faça uma revisão independente: alguém diferente confere pagamentos, alterações de cadastro e conciliações (o contador pode responder este checklist).",
    itens: [
      { id: "a1", texto: "Quem cadastra ou altera fornecedor não consegue aprovar e pagar sem um controle a mais?", alertas: ["segregacao"] },
      { id: "a2", texto: "Quem cria os lançamentos não é o único que os autoriza e concilia?", alertas: ["segregacao"] },
      { id: "a3", texto: "O acesso a dados financeiros e a configurações fiscais está limitado por perfil?", alertas: ["administradores"] },
      { id: "a4", texto: "Usuários desligados ou sem necessidade tiveram o acesso revogado?", alertas: ["acesso_sem_uso"] },
      { id: "a5", texto: "Contas compartilhadas e ações sem identificação individual são evitadas?" },
      { id: "a6", texto: "Existe revisão periódica de usuários, perfis e permissões?", alertas: ["acesso_sem_uso", "administradores"] },
    ],
  },
  {
    id: "produtos", titulo: "Cadastro de produtos e estoque",
    teste: "Para uma amostra de produtos, confira em Produtos → Qualidade do cadastro e na Contagem de estoque: código, unidade, custo com a NF de compra, mínimo e local, e se o saldo bate com a contagem física.",
    itens: [
      { id: "pr1", texto: "O código (SKU) é único e a descrição identifica o item sem ambiguidade?", alertas: ["produto_duplicado"] },
      { id: "pr2", texto: "Categoria e unidade de medida estão corretas e padronizadas?" },
      { id: "pr3", texto: "Custo, preço e fornecedor têm suporte documental (NF de compra, tabela de preço)?", alertas: ["produto_sem_custo"] },
      { id: "pr4", texto: "Estoque mínimo e localização fazem sentido para a operação?" },
      { id: "pr5", texto: "Alterações relevantes (código, unidade, custo, preço) têm usuário, data e justificativa?", alertas: ["alteracao_produto"] },
      { id: "pr6", texto: "O saldo no ERP pode ser rastreado às movimentações e às contagens físicas?", alertas: ["estoque_negativo"] },
      { id: "pr7", texto: "Produtos inativos preservam o histórico e não aparecem para novas vendas e compras?" },
    ],
  },
];

export const ITENS_CHECKLIST = CHECKLIST.flatMap((s) => s.itens.map((i) => ({ ...i, secao: s.titulo })));

export type SituacaoItem = "pendente" | "ok" | "nao_conforme" | "na";
export const SITUACOES: { valor: Exclude<SituacaoItem, "pendente">; rotulo: string; classe: string }[] = [
  { valor: "ok", rotulo: "Conforme", classe: "bg-emerald-600 text-white" },
  { valor: "nao_conforme", rotulo: "Não conforme", classe: "bg-red-600 text-white" },
  { valor: "na", rotulo: "Não se aplica", classe: "bg-slate-500 text-white" },
];
