// Auditor Financeiro (fase 1, AUD): conferências que cruzam venda, conta, extrato e taxa do cartão. Só leitura.
// Contas em centavos inteiros. Antes da data de corte os dados vieram do Tiny incompletos: o que falta ali é
// "dado incompleto" (integração ausente), um aviso só, nunca uma divergência por registro.
// Despesa fora do padrão é suspeita estatística, não prova. Puro (sem banco e sem tela): roda na tela (Auditoria
// financeira, via src/lib/auditorFinanceiro.ts) e na rodada diária do servidor (função auditor-diario).
// Testes em src/lib/__tests__/auditorFinanceiro.test.ts.
import { lerNumero } from "./ajustes.ts";

export type TipoAuditor =
  | "venda_sem_recebimento" | "recebimento_sem_venda" | "taxa_cartao" | "despesa_fora_padrao" | "extrato_desatualizado"
  | "dado_incompleto" | "extrato_conta_errada" | "extrato_atrasado";
/** Mesmo formato das exceções da Auditoria financeira (src/lib/auditoria.ts). */
export type AchadoAuditor = {
  chave: string; tipo: TipoAuditor; titulo: string; detalhe: string; valor?: number; data?: string; link: string; gravidade: "alta" | "media" | "baixa";
};

/** Desde quando o ERP é usado no dia a dia (decisão da usuária, 27/10/2026). */
export const CORTE_AUDITOR = "2026-10-01";

export type ContaAuditor = {
  id: string; descricao: string; valor: number; vencimento: string; status: string; data_pagamento: string | null; valor_pago: number | null;
  pedido_id?: string | null; forma_pagamento?: string | null; conta_bancaria_id?: string | null; fornecedor_id?: string | null; categoria?: string | null;
};
export type LancAuditor = {
  id: string; conta_bancaria_id: string; data: string; valor: number; status: string; descricao: string | null;
  conta_receber_id: string | null; conta_pagar_id: string | null; par_transferencia_id?: string | null; observacao?: string | null;
  /** "arquivo" (OFX/CSV importado) ou o nome da integração que trouxe a linha (ex.: "inter") */
  origem?: string | null; importacao_id?: string | null;
};
export type DadosAuditor = {
  receber: ContaAuditor[]; pagar: ContaAuditor[]; lancamentos: LancAuditor[];
  bancos: { id: string; nome: string; ativo?: boolean | null; banco?: string | null }[];
  importacoes: { id?: string; conta_bancaria_id: string; periodo_inicio: string | null; periodo_fim: string | null; arquivo?: string | null; created_at?: string | null }[];
  pedidos: { id: string; numero: number; status: string; valor_total?: number; origem?: string | null; created_at?: string | null; nf_outra_numero?: string | null }[];
  formas?: { meio: string; taxa_percentual: number | null; tarifa_fixa?: number | null; conta_bancaria_id: string | null; ativo?: boolean | null }[];
  fornecedores: { id: string; nome: string }[];
  hoje: string;
  corte?: string;
};

const cent = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const reais = (c: number) => c / 100;
const brl = (c: number) => reais(c).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const dia = (s: string) => Math.floor(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / 864e5);
const somaDias = (s: string, n: number) => new Date((dia(s) + n) * 864e5).toISOString().slice(0, 10);
const mesBR = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const pct = (x: number) => `${(Math.round(x * 100) / 100).toLocaleString("pt-BR")}%`;
const cartao = (forma?: string | null) => /cart/i.test(forma ?? "");
// só a tarifa do cartão (a OLIST também cobra Pix, boleto e lembretes, que não são taxa de cartão)
const TARIFA_CARTAO = /cart[aã]o|cr[eé]dito|d[eé]bito|\bmdr\b|antecipa/i;

/** Limites em Configurações → Prazos e padrões (catálogo em supabase/functions/_shared/ajustes.ts). */
export const limitesAuditor = () => ({
  diasRecebimento: lerNumero(null, "auditor_dias_recebimento"),
  toleranciaTaxa: lerNumero(null, "auditor_tolerancia_taxa"),
  foraPadraoPct: lerNumero(null, "auditor_fora_padrao_pct"),
  foraPadraoMinimo: lerNumero(null, "auditor_fora_padrao_minimo"),
  diasExtrato: lerNumero(null, "auditor_dias_extrato"),
  diasApi: lerNumero(null, "auditor_dias_api"),
});
type Limites = ReturnType<typeof limitesAuditor>;

/** Cara de cada banco na descrição do extrato: linha com a marca de um banco numa conta de outro é suspeita. */
const MARCAS: { banco: string; nome: string; re: RegExp }[] = [
  { banco: "infinitepay", nome: "InfinitePay", re: /·\s*mfmaquinas\b|\binfinite\s*pay\b|\bcloudwalk\b/i },
];

export function conferenciasAuditor(d: DadosAuditor, limites: Partial<Limites> = {}): AchadoAuditor[] {
  const lim = { ...limitesAuditor(), ...limites };
  const corte = d.corte ?? CORTE_AUDITOR;
  const out: AchadoAuditor[] = [];
  const nomeBanco = (id: string | null | undefined) => d.bancos.find((b) => b.id === id)?.nome ?? "Conta";

  // 1. venda sem recebimento: pedido faturado ou entregue depois do corte com parcela vencida e não recebida
  // (pedido sem nenhuma parcela fica em "Parcelas diferentes do pedido")
  const limiteVenc = somaDias(d.hoje, -lim.diasRecebimento);
  for (const p of d.pedidos) {
    if (!["faturado", "entregue"].includes(p.status) || (p.created_at ?? "").slice(0, 10) < corte || cent(p.valor_total) <= 0) continue;
    const parcelas = d.receber.filter((c) => c.pedido_id === p.id && c.status !== "cancelado");
    const vencidas = parcelas.filter((c) => c.status !== "pago" && c.vencimento < limiteVenc);
    if (!parcelas.length || !vencidas.length) continue;
    const recebido = parcelas.filter((c) => c.status === "pago").reduce((s, c) => s + cent(c.valor_pago ?? c.valor), 0);
    const emAberto = vencidas.reduce((s, c) => s + cent(c.valor), 0);
    const primeira = vencidas.map((c) => c.vencimento).sort()[0];
    out.push({
      chave: `venda_sem_recebimento:${p.id}`, tipo: "venda_sem_recebimento", gravidade: recebido === 0 ? "alta" : "media",
      valor: reais(emAberto), data: primeira, link: "/financeiro",
      titulo: `Pedido #${p.numero} ${p.status}: ${brl(emAberto)} vencido sem recebimento`,
      detalhe: `Pedido de ${brl(cent(p.valor_total))}; recebido ${brl(recebido)}. ${vencidas.length} ${vencidas.length === 1 ? "parcela vencida" : "parcelas vencidas"} desde ${br(primeira)}. ` +
        "Confira no extrato se o dinheiro entrou sem baixa ou se o cliente não pagou.",
    });
  }

  // 2. recebimento sem venda: entrada no banco depois do corte marcada como "ignorar", sem conta, sem transferência
  for (const l of d.lancamentos) {
    if (cent(l.valor) <= 0 || l.data < corte || l.status !== "ignorado" || l.conta_receber_id || l.conta_pagar_id || l.par_transferencia_id) continue;
    out.push({
      chave: `recebimento_sem_venda:${l.id}`, tipo: "recebimento_sem_venda", gravidade: cent(l.valor) >= 100000 ? "media" : "baixa",
      valor: reais(cent(l.valor)), data: l.data, link: "/conciliacao",
      titulo: `${nomeBanco(l.conta_bancaria_id)}: entrada de ${brl(cent(l.valor))} ignorada`,
      detalhe: `${br(l.data)} · "${l.descricao ?? ""}" · ${l.observacao ? `justificativa: ${l.observacao}` : "sem justificativa"}. ` +
        "Entrou dinheiro e não está ligado a venda, conta a receber nem transferência: é da MF?",
    });
  }

  // 3. bruto × taxa × líquido do cartão, por conta e por mês (desde o corte)
  const formas = (d.formas ?? []).filter((f) => f.ativo !== false && f.meio === "cartao" && f.conta_bancaria_id);
  const grupos = new Map<string, { conta: string; mes: string; bruto: number; liquido: number; tarifas: number; n: number }>();
  const grupo = (conta: string, mes: string) => {
    const k = `${conta}:${mes}`;
    if (!grupos.has(k)) grupos.set(k, { conta, mes, bruto: 0, liquido: 0, tarifas: 0, n: 0 });
    return grupos.get(k)!;
  };
  for (const c of d.receber) {
    if (c.status !== "pago" || !cartao(c.forma_pagamento) || !c.conta_bancaria_id || !c.data_pagamento || c.data_pagamento < corte) continue;
    const g = grupo(c.conta_bancaria_id, c.data_pagamento.slice(0, 7));
    g.bruto += cent(c.valor); g.liquido += cent(c.valor_pago ?? c.valor); g.n++;
  }
  for (const l of d.lancamentos) {
    if (l.data < corte || cent(l.valor) >= 0 || l.conta_pagar_id || !/tarifa|taxa/i.test(l.descricao ?? "") || !TARIFA_CARTAO.test(l.descricao ?? "")) continue;
    const k = `${l.conta_bancaria_id}:${l.data.slice(0, 7)}`;
    if (grupos.has(k)) grupos.get(k)!.tarifas += -cent(l.valor);
  }
  for (const g of grupos.values()) {
    if (g.bruto <= 0) continue;
    const taxa = g.bruto - g.liquido + g.tarifas;
    const efetiva = (taxa / g.bruto) * 100;
    const contratadas = formas.filter((f) => f.conta_bancaria_id === g.conta && Number(f.taxa_percentual) > 0).map((f) => Number(f.taxa_percentual));
    const esperada = contratadas.length ? Math.max(...contratadas) : null;
    if (esperada != null && efetiva <= esperada + lim.toleranciaTaxa) continue;
    const base = `${g.n} ${g.n === 1 ? "venda" : "vendas"} no cartão: bruto ${brl(g.bruto)}, taxas ${brl(taxa)}, líquido ${brl(g.bruto - taxa)} (taxa efetiva ${pct(efetiva)}).`;
    out.push({
      chave: `taxa_cartao:${g.conta}:${g.mes}`, tipo: "taxa_cartao", gravidade: esperada == null ? "baixa" : "media",
      valor: esperada == null ? reais(taxa) : reais(Math.round(taxa - (g.bruto * esperada) / 100)), data: `${g.mes}-01`, link: "/conciliacao",
      titulo: `${nomeBanco(g.conta)} ${mesBR(g.mes)}: taxa efetiva ${pct(efetiva)}`,
      detalhe: esperada == null
        ? `${base} Sem taxa contratada cadastrada na forma de pagamento dessa conta: não dá para dizer se está certa (dado incompleto).`
        : `${base} A taxa contratada é ${pct(esperada)}: cobraram a mais ou a baixa foi feita pelo valor errado.`,
    });
  }

  // 4. despesa fora do padrão: mês (desde o corte) bem acima da média dos 6 meses anteriores, por fornecedor
  // (ou categoria). Suspeita estatística: precisa de pelo menos 3 meses de histórico.
  const porChave = new Map<string, Map<string, number>>();
  for (const c of d.pagar) {
    if (c.status !== "pago") continue;
    const quando = (c.data_pagamento ?? c.vencimento).slice(0, 7);
    const k = c.fornecedor_id ? `f:${c.fornecedor_id}` : c.categoria ? `c:${c.categoria}` : null;
    if (!k) continue;
    const m = porChave.get(k) ?? new Map<string, number>();
    m.set(quando, (m.get(quando) ?? 0) + cent(c.valor_pago ?? c.valor));
    porChave.set(k, m);
  }
  const mesAnterior = (m: string, n: number) => { const [a, b] = m.split("-").map(Number); const t = a * 12 + b - 1 - n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  for (const [k, meses] of porChave) {
    for (const [mes, total] of meses) {
      if (mes < corte.slice(0, 7) || mes > d.hoje.slice(0, 7)) continue;
      const hist = [1, 2, 3, 4, 5, 6].map((n) => meses.get(mesAnterior(mes, n))).filter((v): v is number => v != null);
      if (hist.length < 3) continue;
      const media = Math.round(hist.reduce((s, v) => s + v, 0) / hist.length);
      if (total - media < cent(lim.foraPadraoMinimo) || total <= media * (1 + lim.foraPadraoPct / 100)) continue;
      const nome = k.startsWith("f:") ? d.fornecedores.find((f) => f.id === k.slice(2))?.nome ?? "Fornecedor" : `Categoria ${k.slice(2)}`;
      out.push({
        chave: `despesa_fora_padrao:${k}:${mes}`, tipo: "despesa_fora_padrao", gravidade: "baixa", valor: reais(total - media), data: `${mes}-01`, link: "/financeiro",
        titulo: `${nome} ${mesBR(mes)}: ${brl(total)} pagos (média ${brl(media)})`,
        detalhe: `Média dos ${hist.length} meses anteriores com pagamento: ${brl(media)}; este mês ${pct(media ? ((total - media) / media) * 100 : 100)} acima. ` +
          "É suspeita estatística, não prova: confira se foi compra maior, conta adiantada ou lançamento repetido.",
      });
    }
  }

  // 5. extrato desatualizado ou com buraco desde o corte (só contas ativas que já tiveram extrato)
  const ate = somaDias(d.hoje, -lim.diasExtrato);
  for (const b of d.bancos.filter((b) => b.ativo !== false)) {
    const dias = new Set<number>();
    for (const i of d.importacoes) if (i.conta_bancaria_id === b.id && i.periodo_inicio && i.periodo_fim)
      for (let x = dia(i.periodo_inicio); x <= dia(i.periodo_fim); x++) dias.add(x);
    for (const l of d.lancamentos) if (l.conta_bancaria_id === b.id) dias.add(dia(l.data));
    if (!dias.size) continue;
    const buracos: [number, number][] = [];
    let ini: number | null = null;
    for (let x = dia(corte); x <= dia(ate); x++) {
      if (!dias.has(x)) { if (ini == null) ini = x; } else if (ini != null) { buracos.push([ini, x - 1]); ini = null; }
    }
    if (ini != null) buracos.push([ini, dia(ate)]);
    const grandes = buracos.filter(([a, z]) => z - a + 1 >= lim.diasExtrato);
    if (!grandes.length) continue;
    const txt = (x: number) => br(new Date(x * 864e5).toISOString());
    const ultimo = Math.max(...dias);
    out.push({
      chave: `extrato_desatualizado:${b.id}:${txt(grandes[grandes.length - 1][0])}`, tipo: "extrato_desatualizado", gravidade: "media",
      data: new Date(ultimo * 864e5).toISOString().slice(0, 10), link: "/conciliacao",
      titulo: `${b.nome}: extrato com buraco desde ${br(corte)}`,
      detalhe: `Sem extrato em ${grandes.map(([a, z]) => (a === z ? txt(a) : `${txt(a)} a ${txt(z)}`)).join("; ")}. Último dia com extrato: ${txt(ultimo)}. ` +
        "Enquanto faltar, as conferências dessa conta ficam com dado incompleto. Se a conta não é mais usada, desative-a.",
    });
  }

  // 6. dado incompleto: pedidos do Tiny antes do corte sem parcelas (recebimentos não importados)
  const semParcela = d.pedidos.filter((p) => ["aprovado", "faturado", "entregue"].includes(p.status) && dadoIncompletoPedido(p, corte) &&
    !d.receber.some((c) => c.pedido_id === p.id && c.status !== "cancelado"));
  if (semParcela.length) out.push({
    chave: `dado_incompleto:pedidos_tiny:${corte}`, tipo: "dado_incompleto", gravidade: "baixa", link: "/pedidos",
    valor: reais(semParcela.reduce((s, p) => s + cent(p.valor_total), 0)),
    titulo: `${semParcela.length} ${semParcela.length === 1 ? "pedido do Tiny" : "pedidos do Tiny"} antes de ${br(corte)} sem parcelas no ERP`,
    detalhe: "Integração ausente, não divergência: os recebimentos desses pedidos não vieram do Tiny. Para conferir, é preciso importar os recebimentos (chat TIN).",
  });

  // 7. extrato na conta errada: arquivo importado numa conta que recebe pela API (depois que a API começou) ou
  // importação em que a maioria das linhas tem a cara de outro banco. Um achado por importação.
  const inicioApi = new Map<string, string>();
  for (const l of d.lancamentos) if (l.origem && l.origem !== "arquivo") {
    const atual = inicioApi.get(l.conta_bancaria_id);
    if (!atual || l.data < atual) inicioApi.set(l.conta_bancaria_id, l.data);
  }
  const porImportacao = new Map<string, LancAuditor[]>();
  for (const l of d.lancamentos) if (l.importacao_id && l.data >= corte) porImportacao.set(l.importacao_id, [...(porImportacao.get(l.importacao_id) ?? []), l]);
  for (const [imp, linhas] of porImportacao) {
    const conta = d.bancos.find((b) => b.id === linhas[0].conta_bancaria_id);
    if (!conta || conta.ativo === false) continue;
    const info = d.importacoes.find((i) => i.id === imp);
    const nomeArq = info?.arquivo ? `"${info.arquivo}"` : "um arquivo";
    const api = inicioApi.get(conta.id);
    const depoisDaApi = api ? linhas.filter((l) => l.data >= api) : [];
    const marca = MARCAS.filter((m) => m.banco !== conta.banco).map((m) => ({ m, n: linhas.filter((l) => m.re.test(l.descricao ?? "")).length }))
      .sort((a, b) => b.n - a.n)[0];
    const outroBanco = marca && marca.n >= 3 && marca.n * 2 >= linhas.length;
    if (!depoisDaApi.length && !outroBanco) continue;
    out.push({
      chave: `extrato_conta_errada:${imp}`, tipo: "extrato_conta_errada", gravidade: "alta", data: linhas.map((l) => l.data).sort()[0], link: "/conciliacao",
      valor: reais(linhas.reduce((s, l) => s + cent(l.valor), 0)),
      titulo: `${conta.nome}: ${nomeArq} pode ter entrado na conta errada`,
      detalhe: outroBanco
        ? `${marca!.n} de ${linhas.length} linhas têm a cara do ${marca!.m.nome}, mas a conta é ${conta.nome}. Confira e mova a importação para a conta certa (os saldos das duas contas ficam errados enquanto isso).`
        : `${depoisDaApi.length} de ${linhas.length} linhas importadas por arquivo depois de ${br(api!)}, quando o extrato dessa conta já chega sozinho pelo banco: pode ser arquivo de outra conta ou lançamento em dobro.`,
    });
  }

  // 8. extrato atrasado: conta que recebe pela API sem linha nova há mais de N dias (a integração pode ter parado)
  for (const [contaId, ] of inicioApi) {
    const conta = d.bancos.find((b) => b.id === contaId);
    if (!conta || conta.ativo === false) continue;
    const ultima = d.lancamentos.filter((l) => l.conta_bancaria_id === contaId && l.origem && l.origem !== "arquivo").map((l) => l.data).sort().pop()!;
    const dias = dia(d.hoje) - dia(ultima);
    if (dias <= lim.diasApi) continue;
    out.push({
      chave: `extrato_atrasado:${contaId}:${ultima}`, tipo: "extrato_atrasado", gravidade: "media", data: ultima, link: "/conciliacao",
      titulo: `${conta.nome}: extrato automático parado há ${dias} dias`,
      detalhe: `A última linha que chegou sozinha pelo banco é de ${br(ultima)}. Confira a conexão com o banco (Configurações → Bancos); sem ela as conferências dessa conta ficam com dado incompleto.`,
    });
  }

  return out;
}

/** Achados da rodada que ainda não tinham aparecido (pela chave) e o mais grave deles, para o resumo da manhã. */
export function resumoRodada(achados: AchadoAuditor[], jaVistas: Set<string>) {
  const peso = { alta: 0, media: 1, baixa: 2 };
  const novos = achados.filter((a) => !jaVistas.has(a.chave))
    .sort((a, b) => peso[a.gravidade] - peso[b.gravidade] || Math.abs(b.valor ?? 0) - Math.abs(a.valor ?? 0));
  const contar = (l: AchadoAuditor[]) => ({ alta: l.filter((a) => a.gravidade === "alta").length, media: l.filter((a) => a.gravidade === "media").length, baixa: l.filter((a) => a.gravidade === "baixa").length });
  return { novos, total: achados.length, novosPorGravidade: contar(novos), principal: novos[0]?.titulo ?? null };
}

/** Pedido do Tiny anterior ao corte: falta de parcela é integração ausente, não divergência. */
export const dadoIncompletoPedido = (p: { origem?: string | null; created_at?: string | null }, corte = CORTE_AUDITOR) =>
  p.origem === "tiny" && (p.created_at ?? "").slice(0, 10) < corte;
