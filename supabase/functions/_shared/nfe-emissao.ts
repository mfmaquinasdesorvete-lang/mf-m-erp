// Emissão de NF-e (modelo 55) via Focus NFe, pelo CNPJ da unidade (matriz SC ou filial SP).
// Usado pela função nfe-emitir (botão) e pelo agendamento nfe-processar (NF-e automática).
//
// ATENÇÃO: os impostos (lucro real) seguem as regras de _shared/nfe-impostos.ts e o cadastro
// de cada unidade e produto. Valide com o contador e teste em homologação antes da produção.
import { json } from "./cors.ts";
import { HttpError, onlyDigits } from "./supabase.ts";
import { type AliquotasUf, type ItemBase, itensTransferencia, itensVenda, type RegraTributaria } from "./nfe-impostos.ts";
import { enviarNfe } from "./nfe-envio.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Distribui um valor (desconto/frete) entre os itens proporcionalmente, sem perder centavos. */
function ratear(total: number, bases: number[]): number[] {
  const soma = bases.reduce((a, b) => a + b, 0);
  if (!total || !soma) return bases.map(() => 0);
  const partes = bases.map((b) => r2((total * b) / soma));
  partes[partes.length - 1] = r2(total - partes.slice(0, -1).reduce((a, b) => a + b, 0));
  return partes;
}

/** Confere se a unidade tem o necessário para emitir. */
function exigirEmitente(u: any) {
  const faltando = [onlyDigits(u?.cnpj).length !== 14 && "CNPJ", !u?.inscricao_estadual && "inscrição estadual", !u?.uf && "UF"].filter(Boolean);
  if (faltando.length) throw new HttpError(400, `preencha em Configurações → Unidades (${u?.nome ?? "unidade"}): ${faltando.join(", ")}`);
}

const itemBase = (p: any, descricao: string, quantidade: number, valor: number, extra: Partial<ItemBase> = {}): ItemBase => ({
  codigo: p.sku || p.id.slice(0, 8), descricao, ncm: onlyDigits(p.ncm), cest: p.cest ? onlyDigits(p.cest) : null,
  unidade: p.unidade, origem: Number(p.origem ?? 0), tipo: p.tipo, quantidade: Number(quantidade), valor_unitario: Number(valor),
  cfop: p.cfop || null, ipi_aliquota: p.ipi_aliquota == null ? null : Number(p.ipi_aliquota), ...extra,
});

async function emitir(db: any, referencia: string, payload: Record<string, unknown>, nota: Record<string, unknown>) {
  const r = await enviarNfe(referencia, payload);
  const { data } = await db.from("notas_fiscais").insert({
    ...nota, referencia, status: r.status, mensagem: r.mensagem, payload, resposta: r.resposta, tentativas: 1,
  }).select().single();
  return json({ ok: r.status !== "erro", nota: data, contingencia: r.status === "contingencia" }, r.status === "erro" ? 422 : 200);
}

/** Regras de tributação ativas desta unidade (ou de todas). */
async function regrasDa(db: any, unidadeId: string): Promise<RegraTributaria[]> {
  const { data } = await db.from("regras_tributacao").select("*").eq("ativo", true);
  return (data ?? []).filter((r: RegraTributaria) => !r.unidade_id || r.unidade_id === unidadeId);
}
const observacoes = (usadas: Set<RegraTributaria>) =>
  [...usadas].map((r) => r.observacao_nfe).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" ");


/** NF-e de venda de um pedido aprovado. */
export async function emitirPedido(db: any, pedidoId: string) {
  const [{ data: cfg }, { data: pedido }, { data: ufsLista }] = await Promise.all([
    db.from("configuracoes").select("*").eq("id", 1).single(),
    db.from("pedidos")
      .select("*, unidade:unidades(*), cliente:clientes(*), itens:pedido_itens(*, produto:produtos(*))")
      .eq("id", pedidoId)
      .single(),
    db.from("icms_uf").select("*"),
  ]);
  if (!pedido) throw new HttpError(404, "pedido não encontrado");
  if (!["aprovado", "entregue"].includes(pedido.status)) {
    throw new HttpError(400, "só é possível emitir NF-e de pedidos aprovados");
  }
  const u = pedido.unidade;
  exigirEmitente(u);

  const { data: existentes } = await db.from("notas_fiscais").select("status").eq("pedido_id", pedidoId);
  if (existentes?.some((n: any) => ["autorizada", "processando", "contingencia"].includes(n.status))) {
    throw new HttpError(400, "pedido já possui NF-e autorizada ou em processamento");
  }

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
  const brutos = pedido.itens.map((i: any) => Number(i.valor_total));
  const ufs: AliquotasUf = Object.fromEntries((ufsLista ?? []).map((x: any) => [x.uf, x]));
  const descontos = ratear(Number(pedido.desconto), brutos);
  const fretes = ratear(Number(pedido.frete), brutos);
  const usadas = new Set<RegraTributaria>();
  const items = itensVenda(u, { uf: c.uf.toUpperCase(), contribuinte }, pedido.itens.map((i: any, idx: number) =>
    itemBase(i.produto, i.numero_serie ? `${i.descricao} - Nº série ${i.numero_serie}` : i.descricao, i.quantidade, i.valor_unitario,
      { desconto: descontos[idx], frete: fretes[idx] })), ufs, { regras: await regrasDa(db, u.id), unidade_id: u.id, usadas });

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
    informacoes_adicionais_contribuinte: [`Pedido #${pedido.numero}`, pedido.observacoes, observacoes(usadas)].filter(Boolean).join(" - "),
    items,
  };

  // Cada tentativa usa uma referência nova, para poder reenviar após erro de validação.
  const referencia = `pedido-${pedido.numero}-${(existentes?.length ?? 0) + 1}`;
  return await emitir(db, referencia, payload, { pedido_id: pedidoId, unidade_id: u.id, valor_total: pedido.valor_total });
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

  const { data: existentes } = await db.from("notas_fiscais").select("status").eq("transferencia_id", transferenciaId);
  if (existentes?.some((n: any) => ["autorizada", "processando", "contingencia"].includes(n.status))) {
    throw new HttpError(400, "transferência já possui NF-e autorizada ou em processamento");
  }
  const inter = d.uf.toUpperCase() !== t.origem.uf.toUpperCase();
  const usadas = new Set<RegraTributaria>();
  const items = itensTransferencia(t.origem, d.uf.toUpperCase(), t.itens.map((i: any) =>
    itemBase(i.produto, i.numero_serie ? `${i.descricao} - Nº série ${i.numero_serie}` : i.descricao, i.quantidade,
      Number(i.custo_unitario) || Number(i.produto.preco_custo) || 0.01)), { regras: await regrasDa(db, t.origem_id), unidade_id: t.origem_id, usadas });
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
  if (!cfg?.nfe_automatica) return 0;
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
