// Emissão de NF-e (modelo 55) via Focus NFe, pelo CNPJ da unidade (matriz SC ou filial SP).
// Usado pela função nfe-emitir (botão) e pelo agendamento nfe-processar (NF-e automática).
//
// ATENÇÃO: os impostos (lucro real) seguem as regras de _shared/nfe-impostos.ts e o cadastro
// de cada unidade e produto. Valide com o contador e teste em homologação antes da produção.
import { json } from "./cors.ts";
import { preencherTextoNfe, type CamposNfe } from "./textoNfe.ts";
import { HttpError, onlyDigits } from "./supabase.ts";
import { type AliquotasUf, type ConfigIbsCbs, type ItemBase, itemDoCadastro, itensTransferencia, itensVenda, type RegraTributaria } from "./nfe-impostos.ts";
import { aplicarRetornoDoEnvio, enviarNfe } from "./nfe-envio.ts";
import { codigoUnidade, focusProducao } from "./focusnfe.ts";
import { pendenciaCbenef } from "./nfe-conferencia.ts";
import { pendenciasTransferencia } from "./nfe-transferencia.ts";
import { type AjustesNfe, aplicarAjustes, conferirMotivo, faturamentoDoPedido, problemaIeDestinatario } from "./nfe-ajustes.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Distribui um valor (desconto/frete) entre os itens proporcionalmente, sem perder centavos. */
export function ratear(total: number, bases: number[]): number[] {
  const soma = bases.reduce((a, b) => a + b, 0);
  if (!total || !soma) return bases.map(() => 0);
  const partes = bases.map((b) => r2((total * b) / soma));
  partes[partes.length - 1] = r2(total - partes.slice(0, -1).reduce((a, b) => a + b, 0));
  return partes;
}

/** Alíquotas do IBS/CBS das Configurações da NF-e (2026: CBS 0,9% e IBS 0,1%). */
export const configIbsCbs = (cfg: any): ConfigIbsCbs => ({
  ativo: cfg?.ibs_cbs_ativo !== false,
  cbs: Number(cfg?.cbs_aliquota ?? 0.9), ibs_uf: Number(cfg?.ibs_uf_aliquota ?? 0.1), ibs_mun: Number(cfg?.ibs_mun_aliquota ?? 0),
});

/** Confere se a unidade tem o necessário para emitir. */
export function exigirEmitente(u: any) {
  const faltando = [onlyDigits(u?.cnpj).length !== 14 && "CNPJ", !u?.inscricao_estadual && "inscrição estadual", !u?.uf && "UF"].filter(Boolean);
  if (faltando.length) throw new HttpError(400, `preencha em Configurações → Unidades (${u?.nome ?? "unidade"}): ${faltando.join(", ")}`);
}

export const itemBase = (p: any, descricao: string, quantidade: number, valor: number, extra: Partial<ItemBase> = {}): ItemBase =>
  itemDoCadastro(p, descricao, quantidade, valor, extra);

/**
 * Para antes de enviar quando a SEFAZ da UF de quem emite exige o cBenef e ele falta (rejeição certa:
 * a nota não sai e o número fica perdido). `comoResolver` diz onde configurar.
 */
export function exigirCbenef(uf: string, items: Record<string, unknown>[], comoResolver: string) {
  const p = pendenciaCbenef(uf, items, comoResolver);
  if (p) throw new HttpError(400, p.texto);
}

export async function emitir(db: any, referencia: string, payload: Record<string, unknown>, nota: Record<string, unknown>) {
  const r = await enviarNfe(referencia, payload, await codigoUnidade(db, nota.unidade_id as string));
  const { data: gravada } = await db.from("notas_fiscais").insert({
    ...nota, ambiente: focusProducao() ? "producao" : "homologacao", referencia, status: r.status, mensagem: r.mensagem, payload, resposta: r.resposta, tentativas: 1,
  }).select().single();
  const data = await aplicarRetornoDoEnvio(db, gravada, r);
  const recusada = r.status === "erro" || data?.status === "erro" || data?.status === "denegada";
  return json(
    { ok: !recusada, nota: data, contingencia: r.status === "contingencia", ...(recusada ? { error: `NF-e não autorizada: ${data?.mensagem || r.mensagem || "sem motivo informado"}` } : {}) },
    recusada ? 422 : 200,
  );
}

/** Regras de tributação ativas desta unidade (ou de todas). */
export async function regrasDa(db: any, unidadeId: string): Promise<RegraTributaria[]> {
  const { data } = await db.from("regras_tributacao").select("*").eq("ativo", true);
  return (data ?? []).filter((r: RegraTributaria) => !r.unidade_id || r.unidade_id === unidadeId);
}
export const observacoes = (usadas: Set<RegraTributaria>) =>
  [...usadas].map((r) => r.observacao_nfe).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" ");


/** Valores das chaves do texto padrão da nota ({pedido}, {vendedor}, {forma_pagamento}, {telefone}, {cliente}). */
export const camposDoPedido = (p: any): CamposNfe => ({
  pedido: p.numero, vendedor: p.vendedor, forma_pagamento: p.forma_pagamento,
  telefone: p.unidade?.whatsapp || p.unidade?.telefone, cliente: p.cliente?.nome_fantasia || p.cliente?.nome,
});

/** NF-e de venda de um pedido aprovado (com os ajustes da conferência, se houver). */
export async function emitirPedido(db: any, pedidoId: string, ajustes?: AjustesNfe | null) {
  const [{ data: cfg }, { data: pedido }, { data: ufsLista }] = await Promise.all([
    db.from("configuracoes").select("*").eq("id", 1).single(),
    db.from("pedidos")
      .select("*, unidade:unidades(*), cliente:clientes(*), itens:pedido_itens(*, produto:produtos(*))")
      .eq("id", pedidoId)
      .single(),
    db.from("icms_uf").select("*"),
  ]);
  if (!pedido) throw new HttpError(404, "pedido não encontrado");
  try { pedido.itens = aplicarAjustes(pedido.itens, ajustes); } catch (e) { throw new HttpError(400, (e as Error).message); }
  if (ajustes?.desconto != null) { if (!(Number(ajustes.desconto) >= 0)) throw new HttpError(400, "desconto inválido"); pedido.desconto = Number(ajustes.desconto); }
  if (ajustes?.frete != null) { if (!(Number(ajustes.frete) >= 0)) throw new HttpError(400, "frete inválido"); pedido.frete = Number(ajustes.frete); }
  const { data: existentes } = await db.from("notas_fiscais").select("status, ambiente, valor_total").eq("pedido_id", pedidoId);
  const fat = faturamentoDoPedido(Number(pedido.valor_total), existentes ?? []);
  if (fat.emAndamento) throw new HttpError(400, "pedido já possui NF-e em processamento: aguarde a resposta da SEFAZ");
  // já tem NF-e: só a do restante (entrega parcial), escolhendo os itens na tela "Conferir a NF-e"
  if (fat.jaEmitido > 0) {
    if (fat.restante <= 0.009) throw new HttpError(400, "pedido já possui NF-e do valor todo");
    if (!ajustes) throw new HttpError(400, `o pedido já tem NF-e de R$ ${fat.jaEmitido.toFixed(2).replace(".", ",")}: emita o restante pela tela Conferir a NF-e`);
  }
  if (!["aprovado", "entregue"].includes(pedido.status) && !(fat.jaEmitido > 0 && pedido.status === "faturado")) {
    throw new HttpError(400, "só é possível emitir NF-e de pedidos aprovados");
  }
  const u = pedido.unidade;
  exigirEmitente(u);

  const c = pedido.cliente;
  const doc = onlyDigits(c.cpf_cnpj);
  const faltando = [
    !c.nome && "nome", ![11, 14].includes(doc.length) && "CPF/CNPJ", !c.logradouro && "logradouro",
    !c.numero && "número", !c.bairro && "bairro", !c.municipio && "município", !c.uf && "UF",
    onlyDigits(c.cep).length !== 8 && "CEP",
  ].filter(Boolean);
  if (faltando.length) throw new HttpError(400, `cadastro do cliente incompleto: ${faltando.join(", ")}`);

  const semNcm = pedido.itens.filter((i: any) => onlyDigits(i.produto?.ncm).length !== 8);
  if (semNcm.length) {
    throw new HttpError(400, `produto(s) sem NCM válido: ${semNcm.map((i: any) => i.descricao).join(", ")}`);
  }

  const interestadual = c.uf.toUpperCase() !== u.uf.toUpperCase();
  const contribuinte = c.tipo_pessoa === "PJ" && Number(c.contribuinte_icms) === 1;
  // IE errada é recusa certa da SEFAZ: avisa antes de gastar um envio
  const problemaIe = problemaIeDestinatario(doc, c.inscricao_estadual, contribuinte);
  if (problemaIe) throw new HttpError(400, `Antes de emitir: ${problemaIe}.`);
  const brutos = pedido.itens.map((i: any) => Number(i.valor_total));
  const ufs: AliquotasUf = Object.fromEntries((ufsLista ?? []).map((x: any) => [x.uf, x]));
  const descontos = ratear(Number(pedido.desconto), brutos);
  const fretes = ratear(Number(pedido.frete), brutos);
  const usadas = new Set<RegraTributaria>();
  const items = itensVenda(u, { uf: c.uf.toUpperCase(), contribuinte }, pedido.itens.map((i: any, idx: number) =>
    itemBase(i.produto, i.numero_serie ? `${i.descricao} - Nº série ${i.numero_serie}` : i.descricao, i.quantidade, i.valor_unitario,
      { desconto: descontos[idx], frete: fretes[idx] })), ufs, { regras: await regrasDa(db, u.id), unidade_id: u.id, usadas, ibsCbs: configIbsCbs(cfg) });
  exigirCbenef(u.uf, items, "Ponha o código na regra de tributação que dá esse CST (Notas fiscais → Regras de tributação), conforme o contador.");

  const payload = {
    natureza_operacao: u.natureza_operacao,
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: interestadual ? 2 : 1,
    consumidor_final: contribuinte ? 0 : 1,
    presenca_comprador: cfg.presenca_comprador,
    cnpj_emitente: onlyDigits(u.cnpj),
    nome_destinatario: c.nome,
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: c.tipo_pessoa === "PJ" ? Number(c.contribuinte_icms) : 9,
    ...(contribuinte && c.inscricao_estadual
      ? { inscricao_estadual_destinatario: onlyDigits(c.inscricao_estadual) }
      : {}),
    logradouro_destinatario: c.logradouro,
    numero_destinatario: c.numero,
    complemento_destinatario: c.complemento || undefined,
    bairro_destinatario: c.bairro,
    municipio_destinatario: c.municipio,
    uf_destinatario: c.uf.toUpperCase(),
    cep_destinatario: onlyDigits(c.cep),
    telefone_destinatario: onlyDigits(c.telefone || c.whatsapp) || undefined,
    email_destinatario: c.email || undefined,
    modalidade_frete: pedido.modalidade_frete,
    informacoes_adicionais_contribuinte: (ajustes?.informacoes != null
      ? [ajustes.informacoes.trim(), observacoes(usadas)]
      : [`Pedido #${pedido.numero}`, pedido.observacoes, observacoes(usadas), preencherTextoNfe(u.informacoes_complementares, camposDoPedido(pedido))]).filter(Boolean).join(" - "),
    items,
  };
  const valorNota = r2(pedido.itens.reduce((t: number, i: any) => t + Number(i.valor_total), 0) - Number(pedido.desconto || 0) + Number(pedido.frete || 0));
  let motivo: string | null = null;
  // a conta é contra o que falta faturar (o pedido todo, se ainda não tem NF-e)
  const base = fat.jaEmitido > 0 ? fat.restante : Number(pedido.valor_total);
  if (fat.jaEmitido > 0 && valorNota > base + 0.009) {
    throw new HttpError(400, `a NF-e (R$ ${valorNota.toFixed(2).replace(".", ",")}) passa do que falta faturar no pedido (R$ ${base.toFixed(2).replace(".", ",")})`);
  }
  if (ajustes) { try { motivo = conferirMotivo(valorNota, base, ajustes.motivo); } catch (e) { throw new HttpError(400, (e as Error).message); } }
  if (motivo) await db.from("pedido_ocorrencias").insert({ pedido_id: pedidoId, autor_nome: "Emissão de NF-e", texto: `NF-e de R$ ${valorNota.toFixed(2).replace(".", ",")} para ${fat.jaEmitido > 0 ? "o restante" : "pedido"} de R$ ${base.toFixed(2).replace(".", ",")}. Motivo: ${motivo}` });

  // Cada tentativa usa uma referência nova, para poder reenviar após erro de validação.
  const referencia = `pedido-${pedido.numero}-${(existentes?.length ?? 0) + 1}`;
  return await emitir(db, referencia, payload, { pedido_id: pedidoId, unidade_id: u.id, valor_total: ajustes ? valorNota : pedido.valor_total });
}


/** NF-e de transferência: destinatário é a outra unidade da MF (mesma raiz de CNPJ). */
export async function emitirTransferencia(db: any, transferenciaId: string) {
  const { data: t } = await db.from("transferencias")
    .select("*, origem:unidades!transferencias_origem_id_fkey(*), destino:unidades!transferencias_destino_id_fkey(*), itens:transferencia_itens(*, produto:produtos(*))")
    .eq("id", transferenciaId).single();
  if (!t) throw new HttpError(404, "transferência não encontrada");
  if (!["enviada", "recebida"].includes(t.status)) throw new HttpError(400, "envie a transferência antes de emitir a nota");
  exigirEmitente(t.origem);
  exigirEmitente(t.destino);
  const d = t.destino;
  const faltando = [!d.logradouro && "logradouro", !d.numero && "número", !d.bairro && "bairro", !d.municipio && "município", onlyDigits(d.cep).length !== 8 && "CEP"].filter(Boolean);
  if (faltando.length) throw new HttpError(400, `endereço da ${d.nome} incompleto: ${faltando.join(", ")}`);
  const semNcm = t.itens.filter((i: any) => onlyDigits(i.produto?.ncm).length !== 8);
  if (semNcm.length) throw new HttpError(400, `produto(s) sem NCM válido: ${semNcm.map((i: any) => i.descricao).join(", ")}`);

  const { data: existentes } = await db.from("notas_fiscais").select("status, ambiente").eq("transferencia_id", transferenciaId);
  if (existentes?.some((n: any) => n.ambiente !== "homologacao" && ["autorizada", "processando", "contingencia"].includes(n.status))) {
    throw new HttpError(400, "transferência já possui NF-e autorizada ou em processamento");
  }
  const inter = d.uf.toUpperCase() !== t.origem.uf.toUpperCase();
  const { data: cfg } = await db.from("configuracoes").select("*").eq("id", 1).single();
  const usadas = new Set<RegraTributaria>();
  // valor = custo (LC 87/1996, art. 13, § 4º): o da transferência ou, se vazio, o do cadastro
  const custos = t.itens.map((i: any) => ({ descricao: i.descricao, custo: Number(i.custo_unitario) || Number(i.produto?.preco_custo) || 0 }));
  const items = itensTransferencia(t.origem, d.uf.toUpperCase(), t.itens.map((i: any, k: number) =>
    itemBase(i.produto, i.numero_serie ? `${i.descricao} - Nº série ${i.numero_serie}` : i.descricao, i.quantidade, custos[k].custo || 0.01)),
    { regras: await regrasDa(db, t.origem_id), unidade_id: t.origem_id, usadas, ibsCbs: configIbsCbs(cfg) });
  // conferência antes de enviar: o que daria rejeição certa (ex.: SC sem cBenef no CST 41) para aqui, sem gastar número
  const erros = pendenciasTransferencia({ origem: t.origem, itens: items, custos }).filter((p) => p.nivel === "erro");
  if (erros.length) throw new HttpError(400, erros.map((p) => p.texto).join(" "));
  const payload = {
    natureza_operacao: "Transferência de mercadoria",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: inter ? 2 : 1,
    consumidor_final: 0,
    presenca_comprador: 9,
    cnpj_emitente: onlyDigits(t.origem.cnpj),
    nome_destinatario: d.razao_social || d.nome,
    cnpj_destinatario: onlyDigits(d.cnpj),
    indicador_inscricao_estadual_destinatario: 1,
    inscricao_estadual_destinatario: onlyDigits(d.inscricao_estadual),
    logradouro_destinatario: d.logradouro,
    numero_destinatario: d.numero,
    complemento_destinatario: d.complemento || undefined,
    bairro_destinatario: d.bairro,
    municipio_destinatario: d.municipio,
    uf_destinatario: d.uf.toUpperCase(),
    cep_destinatario: onlyDigits(d.cep),
    modalidade_frete: 0,
    informacoes_adicionais_contribuinte: [`Transferência #${t.numero} entre estabelecimentos da mesma empresa`, t.observacoes, observacoes(usadas)].filter(Boolean).join(" - "),
    items,
  };
  const valor = items.reduce((s: number, i: any) => s + Number(i.valor_bruto), 0);
  return await emitir(db, `transf-${t.numero}-${(existentes?.length ?? 0) + 1}`, payload,
    { transferencia_id: transferenciaId, unidade_id: t.origem_id, valor_total: r2(valor) });
}

/**
 * NF-e automática: pedidos aprovados sem nota (de qualquer canal) têm a nota emitida.
 * Só tenta uma vez por pedido: se der erro, fica para alguém corrigir o cadastro e emitir pelo botão.
 */
export async function emitirAutomaticas(db: any) {
  const { data: cfg } = await db.from("configuracoes").select("nfe_automatica").eq("id", 1).single();
  // em homologação a nota sairia só como teste (sem valor fiscal): a automática espera a produção
  if (!cfg?.nfe_automatica || !focusProducao()) return 0;
  const { data: pedidos } = await db.from("pedidos").select("id, notas:notas_fiscais(id)").eq("status", "aprovado").order("aprovado_em").limit(20);
  let n = 0;
  for (const p of pedidos ?? []) {
    if (p.notas?.length) continue;
    try { await emitirPedido(db, p.id); n++; } catch (e) {
      await db.from("notas_fiscais").insert({ pedido_id: p.id, referencia: `pedido-auto-${p.id}`, status: "erro", mensagem: `NF-e automática: ${(e as Error).message}` });
    }
  }
  return n;
}
