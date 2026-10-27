// Painel de exceções: regras que apontam o que merece conferência.
import { avaliarCadastro } from "./qualidadeProdutos";
import type { Produto } from "./types";
import { pl } from "@/lib/format";
import { conferenciasAuditor, CORTE_AUDITOR, dadoIncompletoPedido } from "./auditorFinanceiro";
// Cada item é um INDÍCIO até alguém confirmar com documento ou extrato; nunca é prova sozinho.

export type Excecao = {
  chave: string; tipo: TipoExcecao; titulo: string; detalhe: string; valor?: number; data?: string; link: string; gravidade: "alta" | "media" | "baixa";
};
export type TipoExcecao =
  | "duplicidade" | "sem_documento" | "valor_redondo" | "alteracao" | "baixa_sem_extrato" | "extrato_pendente"
  | "pedido_cancelado" | "os_sem_cobranca" | "saldo_divergente" | "segregacao"
  | "recebimento_sem_origem" | "recebido_terceiros" | "recebido_a_menor" | "pagamento_fora_fluxo" | "cobranca_os_cancelada"
  | "parcelas_divergentes" | "nfe_sem_lancamento" | "acesso_sem_uso" | "administradores" | "checklist"
  | "produto_duplicado" | "produto_sem_custo" | "estoque_negativo" | "alteracao_produto"
  | "pedido_sem_vendedor" | "entregue_sem_nfe" | "desconto_alto" | "alteracao_pedido"
  | "venda_sem_recebimento" | "recebimento_sem_venda" | "taxa_cartao" | "despesa_fora_padrao" | "extrato_desatualizado" | "dado_incompleto";

export const TIPOS: Record<TipoExcecao, { rotulo: string; criterio: string }> = {
  duplicidade: { rotulo: "Possível duplicidade", criterio: "Contas a pagar do mesmo fornecedor com o mesmo valor e vencimento em até 5 dias, ou com o mesmo número de documento." },
  sem_documento: { rotulo: "Pagamento sem documento", criterio: "Conta paga desde 01/10/2026 sem número de documento, sem NF-e de fornecedor ligada e sem anexo (tarifas e juros bancários não entram). As anteriores aparecem num aviso só." },
  valor_redondo: { rotulo: "Valor redondo incomum", criterio: "Pagamento de R$ 5.000 ou mais, múltiplo de R$ 1.000, sem documento nem NF-e." },
  alteracao: { rotulo: "Alteração após o lançamento", criterio: "Valor, vencimento ou baixa alterados depois de lançados, estorno de baixa ou cancelamento de conta (últimos 90 dias)." },
  baixa_sem_extrato: { rotulo: "Baixa sem conferência no extrato", criterio: "Conta dada como paga há mais de 7 dias que não aparece em nenhuma linha conciliada do extrato." },
  extrato_pendente: { rotulo: "Lançamento do banco sem tratar", criterio: "Linha do extrato pendente há mais de 7 dias." },
  pedido_cancelado: { rotulo: "Pedido cancelado com parcela aberta", criterio: "Pedido cancelado que ainda tem parcela em aberto no contas a receber." },
  os_sem_cobranca: { rotulo: "OS concluída sem cobrança", criterio: "OS concluída fora da garantia com valor zero, ou com valor e sem conta a receber." },
  saldo_divergente: { rotulo: "Saldo diferente do banco", criterio: "O saldo informado pelo banco no arquivo é diferente do saldo calculado com o saldo inicial e as linhas importadas." },
  segregacao: { rotulo: "Mesma pessoa lançou e pagou", criterio: "Conta a pagar criada e dada como paga pelo mesmo usuário (revisão independente recomendada)." },
  recebimento_sem_origem: { rotulo: "Recebimento sem origem", criterio: "Conta a receber recebida sem pedido, OS, nota fiscal, número de documento ou anexo — e sem um pedido do ERP citado na descrição (ex.: \"pedido Tiny nº 580\")." },
  recebido_terceiros: { rotulo: "Recebido por conta de terceiros", criterio: "Recebimento que a descrição diz ser de terceiros (ex.: licenciamento): fica fora da receita da MF até o contador decidir como tratar." },
  recebido_a_menor: { rotulo: "Recebido a menor", criterio: "Parcela recebida por valor menor que o lançado (desconto ou baixa parcial). No cartão só acima de 15%, por causa da taxa." },
  pagamento_fora_fluxo: { rotulo: "Pagamento fora do fluxo", criterio: "Conta a pagar de R$ 2.000 ou mais lançada e paga no mesmo dia, sem NF-e de fornecedor ligada." },
  cobranca_os_cancelada: { rotulo: "Cobrança de OS cancelada", criterio: "Conta a receber em aberto ligada a uma OS que foi cancelada." },
  parcelas_divergentes: { rotulo: "Parcelas diferentes do pedido", criterio: "Pedido aprovado, faturado ou entregue cuja soma das parcelas (não canceladas) difere do valor do pedido, ou que não tem parcelas." },
  nfe_sem_lancamento: { rotulo: "NF de fornecedor sem lançamento", criterio: "NF-e de compra autorizada há mais de 15 dias sem contas a pagar ou sem entrada no estoque (o histórico do sistema anterior não entra)." },
  acesso_sem_uso: { rotulo: "Acesso sem uso", criterio: "Usuário ativo que não entra no ERP há mais de 90 dias: revogue se não precisa mais." },
  administradores: { rotulo: "Muitos administradores", criterio: "Mais de 2 usuários ativos com papel de administrador (acesso total)." },
  checklist: { rotulo: "Checklist: não conforme", criterio: "Item do checklist mensal marcado como não conforme por quem conferiu." },
  produto_duplicado: { rotulo: "Produto duplicado", criterio: "Código (SKU) repetido ou descrição igual escrita de outro jeito (Produtos → Qualidade do cadastro)." },
  produto_sem_custo: { rotulo: "Produto sem custo ou preço", criterio: "Produto ativo sem custo, vendável sem preço ou com preço abaixo do custo." },
  estoque_negativo: { rotulo: "Estoque negativo", criterio: "Saldo menor que zero: falta lançar entrada ou houve baixa errada." },
  pedido_sem_vendedor: { rotulo: "Venda sem vendedor", criterio: "Pedido aprovado, faturado ou entregue sem vendedor (a loja virtual não entra): sem comissão e sem dono da venda." },
  entregue_sem_nfe: { rotulo: "Entregue sem NF-e", criterio: "Pedido faturado ou entregue sem NF-e autorizada em produção (a nota de teste não vale)." },
  desconto_alto: { rotulo: "Desconto alto", criterio: "Pedido com desconto acima de 20% do valor dos itens: confira quem autorizou." },
  alteracao_pedido: { rotulo: "Pedido alterado depois de aprovado", criterio: "Vendedor, comissão, origem ou observação alterados, ou pedido reaberto, depois da aprovação (últimos 90 dias): confira o motivo." },
  venda_sem_recebimento: { rotulo: "Venda sem recebimento", criterio: "Pedido faturado ou entregue desde 01/10/2026 com parcela vencida há mais de 7 dias e não recebida (Configurações → Prazos e padrões)." },
  recebimento_sem_venda: { rotulo: "Recebimento sem venda", criterio: "Entrada no banco desde 01/10/2026 marcada como \"ignorar\", sem conta a receber, sem conta a pagar e sem transferência." },
  taxa_cartao: { rotulo: "Taxa do cartão", criterio: "Por conta e mês: bruto, taxas e líquido das vendas no cartão. Alerta quando a taxa efetiva passa da contratada (mais a tolerância) ou quando a taxa contratada não está cadastrada." },
  despesa_fora_padrao: { rotulo: "Despesa fora do padrão", criterio: "Total pago a um fornecedor (ou categoria) no mês bem acima da média dos 6 meses anteriores. Suspeita estatística, não prova." },
  extrato_desatualizado: { rotulo: "Extrato com buraco", criterio: "Conta bancária ativa com 7 dias seguidos ou mais sem extrato desde 01/10/2026: as conferências dela ficam com dado incompleto." },
  dado_incompleto: { rotulo: "Dado incompleto", criterio: "Integração ausente (não é divergência): dados que não vieram do sistema anterior e por isso não dá para conferir." },
  alteracao_produto: { rotulo: "Alteração de produto", criterio: "Código, unidade, tipo, custo ou preço de produto alterado à mão (últimos 90 dias): confira o motivo." },
};

type Conta = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  cliente_id?: string | null; forma_pagamento?: string | null;
  unidade_id?: string | null; conta_bancaria_id?: string | null; documento?: string | null; nfe_recebida_id?: string | null; fornecedor_id?: string | null;
  categoria?: string; pedido_id?: string | null; os_id?: string | null; nota_fiscal_id?: string | null; created_at?: string;
};
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; status: string; descricao: string | null; conta_receber_id: string | null; conta_pagar_id: string | null; par_transferencia_id?: string | null; observacao?: string | null };
type Auditoria = { id: number; tabela: string; registro_id: string | null; acao: string; usuario: string | null; usuario_nome: string | null; campos: string[] | null; antes: any; depois: any; motivo: string | null; origem: string; created_at: string };
type Banco = { id: string; nome: string; saldo_inicial: number; saldo_inicial_data: string; ativo?: boolean | null };
type Importacao = { conta_bancaria_id: string; saldo_final: number | null; saldo_final_data: string | null; periodo_inicio: string | null; periodo_fim: string | null };

export type DadosAuditoria = {
  receber: Conta[]; pagar: Conta[]; lancamentos: Lanc[]; bancos: Banco[]; importacoes: Importacao[]; auditoria: Auditoria[];
  documentos: { entidade: string; entidade_id: string | null }[];
  pedidos: { id: string; numero: number; status: string; valor_total?: number; valor_produtos?: number; desconto?: number; vendedor_id?: string | null; origem?: string | null;
    /** nº do pedido no Tiny (histórico importado): a descrição das contas cita esse número */
    numero_externo?: string | null;
    /** NF da venda emitida por outra empresa (empresa ligada): não é "sem NF-e" */
    nf_outra_numero?: string | null;
    created_at?: string | null;
    notas?: { status: string; ambiente?: string | null }[] }[];
  ordens: { id: string; numero: number; status: string; em_garantia: boolean; valor_total: number }[];
  fornecedores: { id: string; nome: string }[];
  recebidas?: { id: string; chave: string; emitente_nome: string; valor_total: number; data_emissao: string | null; situacao: string; processamento: string; conta_pagar_id: string | null; estoque_lancado: boolean }[];
  /** ultimo_acesso: null = nunca entrou; ausente = não se sabe (sem permissão), e a regra não olha esse usuário */
  usuarios?: { user_id: string; nome: string; papel: string; ativo: boolean; ultimo_acesso?: string | null; created_at?: string }[];
  produtos?: Produto[];
  /** formas de pagamento (taxa contratada do cartão) */
  formas?: { meio: string; taxa_percentual: number | null; tarifa_fixa?: number | null; conta_bancaria_id: string | null; ativo?: boolean | null }[];
  hoje: string;
  /** desde quando o ERP é usado no dia a dia; antes disso falta de dado é "dado incompleto" */
  corte?: string;
};

/** Origem escrita na descrição da conta: "pedido Tiny nº 580" (um pedido que existe no ERP) ou "por conta de terceiros". */
export function origemNoTexto(descricao: string | null | undefined, pedidos: { id: string; numero: number; numero_externo?: string | null }[]):
  { tipo: "pedido"; pedido: { id: string; numero: number }; citado: string } | { tipo: "pedido_ausente"; citado: string } | { tipo: "terceiros" } | null {
  const d = String(descricao ?? "");
  if (/por conta de terceiros/i.test(d)) return { tipo: "terceiros" };
  const m = d.match(/pedido\s+(tiny\s+)?n[ºo°.]?\s*(\d+)/i);
  if (!m) return null;
  const num = m[2];
  const achados = m[1] ? pedidos.filter((p) => p.numero_externo === num) : pedidos.filter((p) => p.numero_externo === num || String(p.numero) === num);
  return achados.length === 1 ? { tipo: "pedido", pedido: achados[0], citado: num } : { tipo: "pedido_ausente", citado: num };
}

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 864e5;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.slice(0, 10).split("-").reverse().join("/");

export function calcularExcecoes(d: DadosAuditoria): Excecao[] {
  const out: Excecao[] = [];
  const forn = (id?: string | null) => d.fornecedores.find((f) => f.id === id)?.nome ?? "";
  const ativas = (l: Conta[]) => l.filter((c) => c.status !== "cancelado");

  // 1. duplicidade nas contas a pagar
  const pagar = ativas(d.pagar);
  for (let i = 0; i < pagar.length; i++) for (let j = i + 1; j < pagar.length; j++) {
    const a = pagar[i], b = pagar[j];
    const mesmoTerceiro = a.fornecedor_id ? a.fornecedor_id === b.fornecedor_id : !b.fornecedor_id && a.descricao.trim().toLowerCase() === b.descricao.trim().toLowerCase();
    if (!mesmoTerceiro) continue;
    const mesmoDoc = !!a.documento && a.documento.trim().toLowerCase() === (b.documento ?? "").trim().toLowerCase();
    const mesmoValorData = Number(a.valor) === Number(b.valor) && diasEntre(a.vencimento, b.vencimento) <= 5;
    if (!mesmoDoc && !mesmoValorData) continue;
    const [x, y] = [a.id, b.id].sort();
    out.push({
      chave: `duplicidade:${x}:${y}`, tipo: "duplicidade", gravidade: "alta", valor: Number(a.valor), data: a.vencimento, link: "/financeiro",
      titulo: `${forn(a.fornecedor_id) || a.descricao}: ${brl(Number(a.valor))} duas vezes`,
      detalhe: `"${a.descricao}" (venc. ${br(a.vencimento)}, ${a.status}) e "${b.descricao}" (venc. ${br(b.vencimento)}, ${b.status})${mesmoDoc ? ` · mesmo documento ${a.documento}` : ""}`,
    });
  }

  // 1b. duplicidade nas contas a receber (mesmo cliente, valor e vencimento em até 5 dias, fora do mesmo parcelamento)
  const receber = ativas(d.receber);
  for (let i = 0; i < receber.length; i++) for (let j = i + 1; j < receber.length; j++) {
    const a = receber[i], b = receber[j];
    if (!a.cliente_id || a.cliente_id !== b.cliente_id || Number(a.valor) !== Number(b.valor) || diasEntre(a.vencimento, b.vencimento) > 5) continue;
    if (a.pedido_id && a.pedido_id === b.pedido_id) continue;
    const [x, y] = [a.id, b.id].sort();
    out.push({
      chave: `duplicidade:${x}:${y}`, tipo: "duplicidade", gravidade: "media", valor: Number(a.valor), data: a.vencimento, link: "/financeiro",
      titulo: `A receber: ${brl(Number(a.valor))} duas vezes do mesmo cliente`,
      detalhe: `"${a.descricao}" (venc. ${br(a.vencimento)}, ${a.status}) e "${b.descricao}" (venc. ${br(b.vencimento)}, ${b.status})`,
    });
  }

  // 2 e 3. pagamento sem documento / valor redondo
  const comAnexo = new Set(d.documentos.filter((x) => x.entidade === "conta_pagar").map((x) => x.entidade_id));
  const corte = d.corte ?? CORTE_AUDITOR;
  let antigasSemDoc = 0;
  for (const c of pagar.filter((c) => c.status === "pago")) {
    const semDoc = !c.documento && !c.nfe_recebida_id && !comAnexo.has(c.id) && !["tarifas bancárias", "juros e multas", "comissoes"].includes(c.categoria ?? "");
    // antes do corte quase nada tem comprovante (veio do Tiny): um aviso só, senão seriam milhares
    const antiga = (c.data_pagamento ?? c.vencimento) < corte;
    if (semDoc && antiga) antigasSemDoc++;
    if (semDoc && !antiga) out.push({
      chave: `sem_documento:${c.id}`, tipo: "sem_documento", gravidade: Number(c.valor) >= 1000 ? "media" : "baixa", valor: Number(c.valor_pago ?? c.valor), data: c.data_pagamento ?? c.vencimento, link: "/financeiro",
      titulo: `${c.descricao}${forn(c.fornecedor_id) ? ` · ${forn(c.fornecedor_id)}` : ""}`, detalhe: `Pago em ${br(c.data_pagamento ?? c.vencimento)} · categoria ${c.categoria ?? "—"} · anexe a nota, o boleto ou o comprovante`,
    });
    if (semDoc && Number(c.valor) >= 5000 && Number(c.valor) % 1000 === 0) out.push({
      chave: `valor_redondo:${c.id}`, tipo: "valor_redondo", gravidade: "media", valor: Number(c.valor), data: c.data_pagamento ?? c.vencimento, link: "/financeiro",
      titulo: `${brl(Number(c.valor))} · ${c.descricao}`, detalhe: "Valor redondo e alto sem documento de suporte: confirme o que foi pago e a quem.",
    });
  }

  if (antigasSemDoc) out.push({
    chave: `dado_incompleto:sem_documento:${corte}`, tipo: "dado_incompleto", gravidade: "baixa", link: "/financeiro",
    titulo: `${antigasSemDoc} ${pl(antigasSemDoc, "conta paga", "contas pagas")} antes de ${br(corte)} sem documento`,
    detalhe: "Vieram do sistema anterior sem comprovante: não dá para conferir uma a uma. Anexe só as que o contador pedir.",
  });

  // 4. alterações após o lançamento (pelo histórico)
  const desde = new Date(Date.parse(d.hoje) - 90 * 864e5).toISOString().slice(0, 10);
  for (const a of d.auditoria) {
    if (a.origem !== "usuario" || a.created_at.slice(0, 10) < desde || !["contas_receber", "contas_pagar"].includes(a.tabela)) continue;
    const campos = a.campos ?? [];
    const estorno = a.antes?.status === "pago" && a.depois?.status && a.depois.status !== "pago";
    const cancel = a.depois?.status === "cancelado";
    const VIGIADOS = ["valor", "vencimento", "valor_pago", "data_pagamento", "fornecedor_id", "cliente_id", "conta_bancaria_id"];
    const mudou = campos.some((c) => VIGIADOS.includes(c)) && !(a.antes?.status === "aberto" && a.depois?.status === "pago" && !campos.some((c) => ["fornecedor_id", "cliente_id"].includes(c)));
    if (a.acao === "delete" || estorno || cancel || mudou) {
      const lista = a.tabela === "contas_receber" ? d.receber : d.pagar;
      const conta = lista.find((c) => c.id === a.registro_id);
      const nomeCampo = (c: string) => (["fornecedor_id", "cliente_id"].includes(c) ? "favorecido" : c === "conta_bancaria_id" ? "conta bancária" : c.replace(/_/g, " "));
      const oque = a.acao === "delete" ? "exclusão" : estorno ? "estorno da baixa" : cancel ? "cancelamento" : campos.filter((c) => VIGIADOS.includes(c)).map(nomeCampo).join(", ");
      out.push({
        chave: `alteracao:${a.id}`, tipo: "alteracao", gravidade: estorno || a.acao === "delete" ? "alta" : "media", data: a.created_at.slice(0, 10), link: "/auditoria",
        valor: Number(conta?.valor ?? a.antes?.valor ?? 0) || undefined,
        titulo: `${a.tabela === "contas_receber" ? "A receber" : "A pagar"}: ${conta?.descricao ?? "conta"} · ${oque}`,
        detalhe: `${a.usuario_nome ?? "usuário"} em ${new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${a.motivo ? ` · motivo: ${a.motivo}` : " · sem motivo informado"}`,
      });
    }
  }

  // 5. baixa sem linha conciliada no extrato (só onde já há extrato importado cobrindo a data)
  const conciliadas = new Set(d.lancamentos.filter((l) => l.status === "conciliado").flatMap((l) => [l.conta_receber_id, l.conta_pagar_id]).filter(Boolean));
  const cobre = (banco: string | null | undefined, data: string) => d.importacoes.some((i) => i.conta_bancaria_id === banco && (i.periodo_inicio ?? "") <= data && data <= (i.periodo_fim ?? ""));
  const temExtrato = d.importacoes.length > 0;
  for (const [tabela, lista] of [["receber", ativas(d.receber)], ["pagar", pagar]] as const) {
    for (const c of lista) {
      if (c.status !== "pago" || !c.data_pagamento || diasEntre(c.data_pagamento, d.hoje) < 7 || conciliadas.has(c.id)) continue;
      if (["comissoes"].includes(c.categoria ?? "")) continue;
      const semConta = !c.conta_bancaria_id;
      if (!(semConta ? temExtrato && c.data_pagamento >= (d.bancos.map((b) => b.saldo_inicial_data).sort()[0] ?? "9999") : cobre(c.conta_bancaria_id, c.data_pagamento))) continue;
      out.push({
        chave: `baixa_sem_extrato:${c.id}`, tipo: "baixa_sem_extrato", gravidade: "media", valor: Number(c.valor_pago ?? c.valor), data: c.data_pagamento, link: "/conciliacao",
        titulo: `${tabela === "receber" ? "Recebimento" : "Pagamento"}: ${c.descricao}`,
        detalhe: semConta ? `Baixado em ${br(c.data_pagamento)} sem conta bancária: em qual banco entrou/saiu?` : `Baixado em ${br(c.data_pagamento)}, mas não está no extrato importado dessa conta.`,
      });
    }
  }

  // 6. extrato pendente há mais de 7 dias
  for (const l of d.lancamentos) {
    if (l.status !== "pendente" || diasEntre(l.data, d.hoje) < 7) continue;
    out.push({
      chave: `extrato_pendente:${l.id}`, tipo: "extrato_pendente", gravidade: Math.abs(Number(l.valor)) >= 1000 ? "media" : "baixa", valor: Number(l.valor), data: l.data, link: "/conciliacao",
      titulo: `${d.bancos.find((b) => b.id === l.conta_bancaria_id)?.nome ?? "Banco"}: ${l.descricao ?? ""}`, detalhe: `${br(l.data)} · ${brl(Number(l.valor))} ainda sem ligação com conta, transferência ou despesa`,
    });
  }

  // 7. pedido cancelado com parcela aberta
  for (const p of d.pedidos.filter((p) => p.status === "cancelado")) {
    const abertas = d.receber.filter((c) => c.pedido_id === p.id && c.status === "aberto");
    if (abertas.length) out.push({
      chave: `pedido_cancelado:${p.id}`, tipo: "pedido_cancelado", gravidade: "alta", valor: abertas.reduce((s, c) => s + Number(c.valor), 0), link: "/financeiro",
      titulo: `Pedido #${p.numero} cancelado`, detalhe: `${abertas.length} ${pl(abertas.length, "parcela", "parcelas")} ainda em aberto: cancele-as no financeiro ou reveja o pedido`,
    });
  }

  // 8. OS concluída sem cobrança
  for (const o of d.ordens.filter((o) => ["concluida", "entregue"].includes(o.status) && !o.em_garantia)) {
    const temConta = d.receber.some((c) => c.os_id === o.id && c.status !== "cancelado");
    if (Number(o.valor_total) === 0 || !temConta) out.push({
      chave: `os_sem_cobranca:${o.id}`, tipo: "os_sem_cobranca", gravidade: Number(o.valor_total) > 0 ? "alta" : "media", valor: Number(o.valor_total) || undefined, link: "/assistencia",
      titulo: `OS #${o.numero}`, detalhe: Number(o.valor_total) === 0 ? "Concluída fora da garantia com valor zero: era cortesia ou faltou cobrar?" : "Tem valor, mas não gerou conta a receber",
    });
  }

  // 9. saldo do banco diferente do calculado
  for (const b of d.bancos) {
    const ult = d.importacoes.filter((i) => i.conta_bancaria_id === b.id && i.saldo_final != null && i.saldo_final_data)
      .sort((x, y) => y.saldo_final_data!.localeCompare(x.saldo_final_data!))[0];
    if (!ult) continue;
    const calc = Number(b.saldo_inicial) + d.lancamentos.filter((l) => l.conta_bancaria_id === b.id && l.data >= b.saldo_inicial_data && l.data <= ult.saldo_final_data!).reduce((s, l) => s + Number(l.valor), 0);
    const dif = Math.round((Number(ult.saldo_final) - calc) * 100) / 100;
    if (dif) out.push({
      chave: `saldo_divergente:${b.id}:${ult.saldo_final_data}`, tipo: "saldo_divergente", gravidade: "alta", valor: dif, data: ult.saldo_final_data!, link: "/conciliacao",
      titulo: `${b.nome}: diferença de ${brl(dif)}`, detalhe: `Banco informa ${brl(Number(ult.saldo_final))} em ${br(ult.saldo_final_data!)}; pelo saldo inicial e pelas linhas importadas dá ${brl(calc)}. Falta importar algum período ou o saldo inicial está errado.`,
    });
  }

  // 10. mesma pessoa lançou e pagou
  const criou = new Map(d.auditoria.filter((a) => a.tabela === "contas_pagar" && a.acao === "insert" && a.origem === "usuario").map((a) => [a.registro_id, a.usuario]));
  for (const a of d.auditoria) {
    if (a.tabela !== "contas_pagar" || a.acao !== "update" || a.origem !== "usuario" || a.depois?.status !== "pago" || a.antes?.status === "pago") continue;
    if (!a.usuario || criou.get(a.registro_id) !== a.usuario) continue;
    const c = d.pagar.find((x) => x.id === a.registro_id);
    if (!c || Number(c.valor) < 1000) continue;
    out.push({
      chave: `segregacao:${c.id}`, tipo: "segregacao", gravidade: "baixa", valor: Number(c.valor), data: a.created_at.slice(0, 10), link: "/financeiro",
      titulo: `${c.descricao} · ${a.usuario_nome ?? "usuário"}`, detalhe: "Lançou e deu baixa sozinho(a). Em equipe pequena é normal: peça para outra pessoa conferir com o comprovante.",
    });
  }

  // 11. recebimento sem origem identificada
  const anexoReceber = new Set(d.documentos.filter((x) => x.entidade === "conta_receber").map((x) => x.entidade_id));
  for (const c of receber.filter((c) => c.status === "pago")) {
    if (c.pedido_id || c.os_id || c.nota_fiscal_id || c.documento || anexoReceber.has(c.id)) continue;
    // a origem pode estar escrita na descrição (histórico do Tiny e da Olist): pedido citado que existe no ERP basta
    const o = origemNoTexto(c.descricao, d.pedidos);
    if (o?.tipo === "pedido") continue;
    if (o?.tipo === "terceiros") {
      out.push({
        chave: `recebido_terceiros:${c.id}`, tipo: "recebido_terceiros", gravidade: "baixa", valor: Number(c.valor_pago ?? c.valor),
        data: c.data_pagamento ?? c.vencimento, link: "/financeiro", titulo: c.descricao,
        detalhe: `Recebido em ${br(c.data_pagamento ?? c.vencimento)} por conta de terceiros: a origem está identificada; falta o contador dizer como lançar (fora da receita da MF).`,
      });
      continue;
    }
    out.push({
      chave: `recebimento_sem_origem:${c.id}`, tipo: "recebimento_sem_origem", gravidade: Number(c.valor) >= 1000 ? "media" : "baixa", valor: Number(c.valor_pago ?? c.valor),
      data: c.data_pagamento ?? c.vencimento, link: "/financeiro", titulo: c.descricao,
      detalhe: o?.tipo === "pedido_ausente"
        ? `Recebido em ${br(c.data_pagamento ?? c.vencimento)}: a descrição cita o pedido nº ${o.citado}, que não está no ERP. Traga o pedido ou ligue a conta à venda certa.`
        : `Recebido em ${br(c.data_pagamento ?? c.vencimento)} sem pedido, OS, nota, documento ou anexo: de onde veio esse dinheiro?`,
    });
  }

  // 12. recebido a menor (desconto ou baixa parcial)
  for (const c of receber.filter((c) => c.status === "pago" && c.valor_pago != null)) {
    const dif = Math.round((Number(c.valor) - Number(c.valor_pago)) * 100) / 100;
    const cartao = /cart/i.test(c.forma_pagamento ?? "");
    if (dif <= 0.01 || (cartao && dif <= Number(c.valor) * 0.15)) continue;
    out.push({
      chave: `recebido_a_menor:${c.id}`, tipo: "recebido_a_menor", gravidade: dif >= 500 ? "media" : "baixa", valor: dif, data: c.data_pagamento ?? c.vencimento, link: "/financeiro",
      titulo: `${c.descricao}: ${brl(dif)} a menos`, detalhe: `Lançado ${brl(Number(c.valor))}, recebido ${brl(Number(c.valor_pago))}. Desconto, taxa ou baixa parcial: quem autorizou?`,
    });
  }

  // 13. pagamento fora do fluxo (lançado e pago no mesmo dia)
  for (const c of pagar.filter((c) => c.status === "pago" && c.created_at && c.data_pagamento && !c.nfe_recebida_id)) {
    if (Number(c.valor) < 2000 || c.created_at!.slice(0, 10) !== c.data_pagamento!.slice(0, 10)) continue;
    out.push({
      chave: `pagamento_fora_fluxo:${c.id}`, tipo: "pagamento_fora_fluxo", gravidade: "baixa", valor: Number(c.valor_pago ?? c.valor), data: c.data_pagamento!, link: "/financeiro",
      titulo: `${c.descricao}${forn(c.fornecedor_id) ? ` · ${forn(c.fornecedor_id)}` : ""}`, detalhe: "Lançado e pago no mesmo dia: era urgente? Registre a justificativa e quem aprovou.",
    });
  }

  // 14. cobrança de OS cancelada
  for (const c of d.receber.filter((c) => c.os_id && c.status === "aberto")) {
    const o = d.ordens.find((x) => x.id === c.os_id);
    if (o?.status !== "cancelada") continue;
    out.push({
      chave: `cobranca_os_cancelada:${c.id}`, tipo: "cobranca_os_cancelada", gravidade: "alta", valor: Number(c.valor), data: c.vencimento, link: "/financeiro",
      titulo: `OS #${o.numero} cancelada com cobrança aberta`, detalhe: `"${c.descricao}" ainda aparece como a receber: cancele a conta ou reveja a OS.`,
    });
  }

  // 15. parcelas diferentes do valor do pedido
  for (const p of d.pedidos.filter((p) => ["aprovado", "faturado", "entregue"].includes(p.status) && Number(p.valor_total ?? 0) > 0)) {
    const parcelas = d.receber.filter((c) => c.pedido_id === p.id && c.status !== "cancelado");
    const soma = Math.round(parcelas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;
    const dif = Math.round((soma - Number(p.valor_total)) * 100) / 100;
    if (parcelas.length && Math.abs(dif) <= 0.05) continue;
    if (!parcelas.length && dadoIncompletoPedido(p, corte)) continue; // aviso único em "dado incompleto"
    out.push({
      chave: `parcelas_divergentes:${p.id}`, tipo: "parcelas_divergentes", gravidade: "media", valor: parcelas.length ? dif : Number(p.valor_total), link: "/financeiro",
      titulo: `Pedido #${p.numero}`, detalhe: parcelas.length
        ? `Pedido de ${brl(Number(p.valor_total))}, parcelas somam ${brl(soma)} (diferença de ${brl(dif)}).`
        : `Pedido de ${brl(Number(p.valor_total))} sem nenhuma parcela no contas a receber.`,
    });
  }

  // 16. NF de fornecedor sem lançamento
  for (const n of d.recebidas ?? []) {
    if (n.situacao !== "autorizada" || ["ignorada", "concluido"].includes(n.processamento) || !n.data_emissao || diasEntre(n.data_emissao, d.hoje) < 15) continue;
    if (n.conta_pagar_id && n.estoque_lancado) continue;
    const falta = [!n.conta_pagar_id && "contas a pagar", !n.estoque_lancado && "entrada no estoque"].filter(Boolean).join(" e ");
    out.push({
      chave: `nfe_sem_lancamento:${n.id}`, tipo: "nfe_sem_lancamento", gravidade: Number(n.valor_total) >= 1000 ? "media" : "baixa", valor: Number(n.valor_total), data: n.data_emissao.slice(0, 10), link: "/notas",
      titulo: `NF ${n.chave.slice(25, 34).replace(/^0+/, "")} · ${n.emitente_nome}`, detalhe: `Emitida em ${br(n.data_emissao)} e ainda sem ${falta}. Confira com o pedido de compra e o que chegou.`,
    });
  }

  // 17 e 18. acessos
  const usuarios = (d.usuarios ?? []).filter((u) => u.ativo);
  for (const u of usuarios) {
    if (u.ultimo_acesso === undefined) continue;
    const ultimo = u.ultimo_acesso ?? u.created_at;
    if (!ultimo || diasEntre(ultimo, d.hoje) <= 90) continue;
    out.push({
      chave: `acesso_sem_uso:${u.user_id}`, tipo: "acesso_sem_uso", gravidade: u.papel === "admin" ? "media" : "baixa", data: ultimo.slice(0, 10), link: "/usuarios",
      titulo: `${u.nome} (${u.papel})`, detalhe: u.ultimo_acesso ? `Último acesso em ${br(u.ultimo_acesso)}. Se não precisa mais, desative o usuário.` : "Nunca entrou no ERP. Se não precisa, desative o usuário.",
    });
  }
  const admins = usuarios.filter((u) => u.papel === "admin");
  if (admins.length > 2) out.push({
    chave: `administradores:${admins.map((u) => u.user_id).sort().join(",")}`, tipo: "administradores", gravidade: "baixa", link: "/usuarios",
    titulo: `${admins.length} administradores ativos`, detalhe: `${admins.map((u) => u.nome).join(", ")}: administrador vê e muda tudo. Deixe só quem precisa.`,
  });

  // 19 a 22. cadastro de produtos (resumo; o detalhe está em Produtos → Qualidade do cadastro)
  if (d.produtos?.length) {
    const q = avaliarCadastro(d.produtos, { comFornecedor: new Set(), movimentos: [], hoje: d.hoje });
    const itens = (...ids: string[]) => [...new Map(q.filter((x) => ids.includes(x.id)).flatMap((x) => x.itens).map((i) => [i.produto.id, i])).values()];
    const dup = itens("sku_duplicado", "descricao_parecida");
    if (dup.length) out.push({
      chave: "produto_duplicado", tipo: "produto_duplicado", gravidade: "media", link: "/estoque",
      titulo: `${dup.length} ${pl(dup.length, "produto", "produtos")} com código repetido ou descrição quase igual`, detalhe: dup.slice(0, 4).map((i) => i.produto.descricao).join("; ") + (dup.length > 4 ? "…" : ""),
    });
    const custo = itens("custo_zerado", "preco_zerado", "abaixo_custo");
    if (custo.length) out.push({
      chave: "produto_sem_custo", tipo: "produto_sem_custo", gravidade: "baixa", link: "/estoque",
      titulo: `${custo.length} ${pl(custo.length, "produto", "produtos")} sem custo, sem preço ou abaixo do custo`, detalhe: "Margem e valor do estoque ficam errados enquanto não forem preenchidos.",
    });
    for (const i of itens("estoque_negativo")) out.push({
      chave: `estoque_negativo:${i.produto.id}`, tipo: "estoque_negativo", gravidade: "media", link: "/estoque",
      titulo: i.produto.descricao, detalhe: `${i.detalhe}: investigue a entrada que faltou antes de ajustar`,
    });
  }
  const CAMPOS_PRODUTO = ["sku", "unidade", "tipo", "preco_custo", "preco_venda"];
  for (const a of d.auditoria) {
    if (a.tabela !== "produtos" || a.acao !== "update" || a.origem !== "usuario" || a.created_at.slice(0, 10) < desde) continue;
    const campos = (a.campos ?? []).filter((c) => CAMPOS_PRODUTO.includes(c));
    if (!campos.length) continue;
    const prod = d.produtos?.find((p) => p.id === a.registro_id);
    const nomes: Record<string, string> = { sku: "código", unidade: "unidade", tipo: "tipo", preco_custo: "custo", preco_venda: "preço" };
    out.push({
      chave: `alteracao_produto:${a.id}`, tipo: "alteracao_produto", gravidade: "baixa", data: a.created_at.slice(0, 10), link: "/estoque",
      titulo: `${prod?.descricao ?? "Produto"} · ${campos.map((c) => `${nomes[c]} ${a.antes?.[c] ?? "vazio"} → ${a.depois?.[c] ?? "vazio"}`).join(", ")}`,
      detalhe: `${a.usuario_nome ?? "usuário"} em ${new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${a.motivo ? ` · motivo: ${a.motivo}` : " · sem motivo"}`,
    });
  }

  // 23 a 26. vendas
  for (const p of d.pedidos.filter((p) => ["aprovado", "faturado", "entregue"].includes(p.status))) {
    if (!p.vendedor_id && p.origem !== "loja" && "vendedor_id" in p) out.push({
      chave: `pedido_sem_vendedor:${p.id}`, tipo: "pedido_sem_vendedor", gravidade: "baixa", valor: Number(p.valor_total ?? 0), link: "/pedidos",
      titulo: `Pedido #${p.numero} sem vendedor`, detalhe: "Abra o pedido e escolha o vendedor (fica registrado com o motivo).",
    });
    if (p.status !== "aprovado" && p.notas && !p.nf_outra_numero && !p.notas.some((n) => n.status === "autorizada" && n.ambiente !== "homologacao")) out.push({
      chave: `entregue_sem_nfe:${p.id}`, tipo: "entregue_sem_nfe", gravidade: "alta", valor: Number(p.valor_total ?? 0), link: "/pedidos",
      titulo: `Pedido #${p.numero} ${p.status} sem NF-e`, detalhe: p.notas.some((n) => n.ambiente === "homologacao")
        ? "Só tem nota de teste (homologação, sem valor fiscal). Emita a NF-e de produção." : "Mercadoria saiu sem nota fiscal: emita a NF-e.",
    });
    const itens = Number(p.valor_produtos ?? 0), desc = Number(p.desconto ?? 0);
    if (itens > 0 && desc / itens > 0.2) out.push({
      chave: `desconto_alto:${p.id}`, tipo: "desconto_alto", gravidade: "media", valor: desc, link: "/pedidos",
      titulo: `Pedido #${p.numero}: desconto de ${Math.round((desc / itens) * 100)}%`, detalhe: `${brl(desc)} sobre ${brl(itens)} em itens. Confira quem autorizou.`,
    });
  }
  const CAMPOS_PEDIDO = ["vendedor_id", "comissao_percentual", "origem", "observacoes", "status"];
  for (const a of d.auditoria) {
    if (a.tabela !== "pedidos" || a.acao !== "update" || !a.motivo || a.created_at.slice(0, 10) < desde) continue;
    const reaberto = /^Reaberto:/.test(a.motivo);
    if (!reaberto && !(a.campos ?? []).some((c) => CAMPOS_PEDIDO.includes(c))) continue;
    const ped = d.pedidos.find((p) => p.id === a.registro_id);
    out.push({
      chave: `alteracao_pedido:${a.id}`, tipo: "alteracao_pedido", gravidade: reaberto ? "media" : "baixa", data: a.created_at.slice(0, 10), link: "/pedidos",
      titulo: `Pedido #${ped?.numero ?? "?"} ${reaberto ? "reaberto" : "alterado depois de aprovado"}`,
      detalhe: `${a.usuario_nome ?? "usuário"} em ${new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${reaberto ? a.motivo : `motivo: ${a.motivo}`}`,
    });
  }

  out.push(...conferenciasAuditor({
    receber: d.receber, pagar: d.pagar, lancamentos: d.lancamentos, bancos: d.bancos, importacoes: d.importacoes, pedidos: d.pedidos,
    formas: d.formas, fornecedores: d.fornecedores, hoje: d.hoje, corte,
  }));

  const peso = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => peso[a.gravidade] - peso[b.gravidade] || (b.data ?? "").localeCompare(a.data ?? ""));
}

/** Contas vencidas por faixa de atraso. */
export function faixasAtraso(contas: { status: string; vencimento: string; valor: number }[], hoje: string) {
  const faixas = [{ rotulo: "1 a 30 dias", max: 30 }, { rotulo: "31 a 60", max: 60 }, { rotulo: "61 a 90", max: 90 }, { rotulo: "mais de 90", max: Infinity }]
    .map((f) => ({ ...f, qtd: 0, valor: 0 }));
  for (const c of contas) {
    if (c.status !== "aberto" || c.vencimento >= hoje) continue;
    const d = diasEntre(c.vencimento, hoje);
    const f = faixas.find((x) => d <= x.max)!;
    f.qtd++; f.valor += Number(c.valor);
  }
  return faixas;
}
