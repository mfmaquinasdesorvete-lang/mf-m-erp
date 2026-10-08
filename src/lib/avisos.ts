// Avisos automáticos: tipos, fila e os mesmos modelos de texto usados pelas Edge Functions.
export { EXEMPLOS, htmlEmail, mensagemCliente, textoTelegram, type Empresa } from "../../supabase/functions/_shared/avisos-modelos";

export type AvisoTipo = {
  tipo: string; publico: "equipe" | "cliente"; titulo: string; descricao: string; papeis: string[]; ativo: boolean; ordem: number;
};
export type Aviso = {
  id: number; tipo: string; canal: "telegram" | "email"; destino: string; usuario_id: string | null; cliente_id: string | null;
  dados: Record<string, unknown>; status: "pendente" | "enviando" | "enviado" | "erro"; tentativas: number; erro: string | null;
  created_at: string; enviado_em: string | null;
};

/** Mesmo catálogo da migração 20261012000000_avisos.sql (usado na demonstração). */
export const TIPOS_PADRAO: AvisoTipo[] = ([
  ["resumo_diario", "equipe", "Resumo do dia (8h)", "Vendas e recebimentos de ontem, contas do dia, OS e o que precisa de atenção", ["vendas", "financeiro", "tecnico"]],
  ["pagamento_recebido", "equipe", "Pagamento recebido", "Conta a receber baixada como paga", ["vendas", "financeiro"]],
  ["pedido_aprovado", "equipe", "Venda aprovada", "Orçamento virou pedido", ["vendas", "financeiro"]],
  ["nfe_autorizada", "equipe", "Nota fiscal autorizada", "NF-e de venda autorizada pela SEFAZ", ["vendas", "financeiro"]],
  ["nfe_erro", "equipe", "Nota fiscal rejeitada", "A SEFAZ recusou a NF-e: precisa corrigir", ["vendas", "financeiro"]],
  ["os_nova", "equipe", "Nova OS", "Máquina entrou na assistência", ["tecnico"]],
  ["os_pronta", "equipe", "OS pronta", "Conserto concluído: avisar o cliente para retirar", ["vendas", "tecnico"]],
  ["nfe_fornecedor", "equipe", "Nota de fornecedor para conferir", "Chegou NF-e de compra que precisa de vínculo ou revisão", ["financeiro"]],
  ["compra_recebida", "equipe", "Peças recebidas", "Pedido de compra recebido (total ou parcial)", ["financeiro", "tecnico"]],
  ["estoque_minimo", "equipe", "Estoque no mínimo", "Um item chegou no estoque mínimo", ["financeiro", "tecnico"]],
  ["cli_os_recebida", "cliente", "Recebemos sua máquina", "Confirmação com o número da OS e o defeito informado", []],
  ["cli_os_pronta", "cliente", "Máquina pronta para retirar", "Conserto concluído, com o valor (ou \"coberto pela garantia\")", []],
  ["cli_cobranca_lembrete", "cliente", "Lembrete de vencimento", "Três dias antes do vencimento, com os dados para pagamento", []],
  ["cli_cobranca_vencida", "cliente", "Pagamento em atraso", "Aviso gentil no dia seguinte ao vencimento", []],
  ["cli_pagamento", "cliente", "Pagamento confirmado", "Agradecimento quando o pagamento é confirmado", []],
  ["cli_nfe", "cliente", "Nota fiscal emitida", "Link da DANFE quando a NF-e é autorizada", []],
  ["cli_pedido_enviado", "cliente", "Pedido enviado", "Transportadora e código de rastreio", []],
  ["cli_preventiva", "cliente", "Hora da manutenção preventiva", "Uma semana antes da data da preventiva", []],
  ["cli_garantia", "cliente", "Garantia acabando", "30 dias antes do fim da garantia da máquina", []],
] as const).map(([tipo, publico, titulo, descricao, papeis], i) => ({ tipo, publico, titulo, descricao, papeis: [...papeis], ativo: true, ordem: i + 1 }));

export const PAPEL_ROTULO: Record<string, string> = { admin: "Admin", vendas: "Vendas", financeiro: "Financeiro", tecnico: "Técnico" };
