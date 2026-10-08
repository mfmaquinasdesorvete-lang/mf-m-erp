// Painel de exceções: regras que apontam o que merece conferência.
// Cada item é um INDÍCIO até alguém confirmar com documento ou extrato; nunca é prova sozinho.

export type Excecao = {
  chave: string; tipo: TipoExcecao; titulo: string; detalhe: string; valor?: number; data?: string; link: string; gravidade: "alta" | "media" | "baixa";
};
export type TipoExcecao =
  | "duplicidade" | "sem_documento" | "valor_redondo" | "alteracao" | "baixa_sem_extrato" | "extrato_pendente"
  | "pedido_cancelado" | "os_sem_cobranca" | "saldo_divergente" | "segregacao";

export const TIPOS: Record<TipoExcecao, { rotulo: string; criterio: string }> = {
  duplicidade: { rotulo: "Possível duplicidade", criterio: "Contas a pagar do mesmo fornecedor com o mesmo valor e vencimento em até 5 dias, ou com o mesmo número de documento." },
  sem_documento: { rotulo: "Pagamento sem documento", criterio: "Conta paga sem número de documento, sem NF-e de fornecedor ligada e sem anexo (tarifas e juros bancários não entram)." },
  valor_redondo: { rotulo: "Valor redondo incomum", criterio: "Pagamento de R$ 5.000 ou mais, múltiplo de R$ 1.000, sem documento nem NF-e." },
  alteracao: { rotulo: "Alteração após o lançamento", criterio: "Valor, vencimento ou baixa alterados depois de lançados, estorno de baixa ou cancelamento de conta (últimos 90 dias)." },
  baixa_sem_extrato: { rotulo: "Baixa sem conferência no extrato", criterio: "Conta dada como paga há mais de 7 dias que não aparece em nenhuma linha conciliada do extrato." },
  extrato_pendente: { rotulo: "Lançamento do banco sem tratar", criterio: "Linha do extrato pendente há mais de 7 dias." },
  pedido_cancelado: { rotulo: "Pedido cancelado com parcela aberta", criterio: "Pedido cancelado que ainda tem parcela em aberto no contas a receber." },
  os_sem_cobranca: { rotulo: "OS concluída sem cobrança", criterio: "OS concluída fora da garantia com valor zero, ou com valor e sem conta a receber." },
  saldo_divergente: { rotulo: "Saldo diferente do banco", criterio: "O saldo informado pelo banco no arquivo é diferente do saldo calculado com o saldo inicial e as linhas importadas." },
  segregacao: { rotulo: "Mesma pessoa lançou e pagou", criterio: "Conta a pagar criada e dada como paga pelo mesmo usuário (revisão independente recomendada)." },
};

type Conta = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  unidade_id?: string | null; conta_bancaria_id?: string | null; documento?: string | null; nfe_recebida_id?: string | null; fornecedor_id?: string | null;
  categoria?: string; pedido_id?: string | null; os_id?: string | null; created_at?: string;
};
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; status: string; descricao: string | null; conta_receber_id: string | null; conta_pagar_id: string | null };
type Auditoria = { id: number; tabela: string; registro_id: string | null; acao: string; usuario: string | null; usuario_nome: string | null; campos: string[] | null; antes: any; depois: any; motivo: string | null; origem: string; created_at: string };
type Banco = { id: string; nome: string; saldo_inicial: number; saldo_inicial_data: string };
type Importacao = { conta_bancaria_id: string; saldo_final: number | null; saldo_final_data: string | null; periodo_inicio: string | null; periodo_fim: string | null };

export type DadosAuditoria = {
  receber: Conta[]; pagar: Conta[]; lancamentos: Lanc[]; bancos: Banco[]; importacoes: Importacao[]; auditoria: Auditoria[];
  documentos: { entidade: string; entidade_id: string | null }[];
  pedidos: { id: string; numero: number; status: string }[];
  ordens: { id: string; numero: number; status: string; em_garantia: boolean; valor_total: number }[];
  fornecedores: { id: string; nome: string }[];
  hoje: string;
};

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

  // 2 e 3. pagamento sem documento / valor redondo
  const comAnexo = new Set(d.documentos.filter((x) => x.entidade === "conta_pagar").map((x) => x.entidade_id));
  for (const c of pagar.filter((c) => c.status === "pago")) {
    const semDoc = !c.documento && !c.nfe_recebida_id && !comAnexo.has(c.id) && !["tarifas bancárias", "juros e multas", "comissoes"].includes(c.categoria ?? "");
    if (semDoc) out.push({
      chave: `sem_documento:${c.id}`, tipo: "sem_documento", gravidade: Number(c.valor) >= 1000 ? "media" : "baixa", valor: Number(c.valor_pago ?? c.valor), data: c.data_pagamento ?? c.vencimento, link: "/financeiro",
      titulo: `${c.descricao}${forn(c.fornecedor_id) ? ` · ${forn(c.fornecedor_id)}` : ""}`, detalhe: `Pago em ${br(c.data_pagamento ?? c.vencimento)} · categoria ${c.categoria ?? "—"} · anexe a nota, o boleto ou o comprovante`,
    });
    if (semDoc && Number(c.valor) >= 5000 && Number(c.valor) % 1000 === 0) out.push({
      chave: `valor_redondo:${c.id}`, tipo: "valor_redondo", gravidade: "media", valor: Number(c.valor), data: c.data_pagamento ?? c.vencimento, link: "/financeiro",
      titulo: `${brl(Number(c.valor))} · ${c.descricao}`, detalhe: "Valor redondo e alto sem documento de suporte: confirme o que foi pago e a quem.",
    });
  }

  // 4. alterações após o lançamento (pelo histórico)
  const desde = new Date(Date.parse(d.hoje) - 90 * 864e5).toISOString().slice(0, 10);
  for (const a of d.auditoria) {
    if (a.origem !== "usuario" || a.created_at.slice(0, 10) < desde || !["contas_receber", "contas_pagar"].includes(a.tabela)) continue;
    const campos = a.campos ?? [];
    const estorno = a.antes?.status === "pago" && a.depois?.status && a.depois.status !== "pago";
    const cancel = a.depois?.status === "cancelado";
    const mudou = campos.some((c) => ["valor", "vencimento", "valor_pago", "data_pagamento"].includes(c)) && !(a.antes?.status === "aberto" && a.depois?.status === "pago");
    if (a.acao === "delete" || estorno || cancel || mudou) {
      const lista = a.tabela === "contas_receber" ? d.receber : d.pagar;
      const conta = lista.find((c) => c.id === a.registro_id);
      const oque = a.acao === "delete" ? "exclusão" : estorno ? "estorno da baixa" : cancel ? "cancelamento" : campos.filter((c) => ["valor", "vencimento", "valor_pago", "data_pagamento"].includes(c)).join(", ").replace(/_/g, " ");
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
      titulo: `Pedido #${p.numero} cancelado`, detalhe: `${abertas.length} parcela(s) ainda em aberto: cancele-as no financeiro ou reveja o pedido`,
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
