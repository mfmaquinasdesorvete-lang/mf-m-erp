// NF-e direta (sem pedido): cliente, operação e itens escolhidos na tela Notas fiscais → Emitir NF-e.
// Saída: mesmo cálculo de impostos da venda pelo pedido (itensVenda + regras de tributação + IBS/CBS).
// Entrada (tipo 0): a MF emite a nota de quem não emite (pessoa física, MEI, sem IE), com ou sem NF referenciada (nfe-entrada.ts).
// A nota guarda os itens (produto, quantidade, valor) para depois lançar a conta a receber e baixar o estoque.
import { HttpError, onlyDigits } from "./supabase.ts";
import { type AliquotasUf, itensVenda, type RegraTributaria } from "./nfe-impostos.ts";
import { configIbsCbs, emitir, exigirEmitente, itemBase, observacoes, ratear, regrasDa } from "./nfe-emissao.ts";
import { chaveValida, operacaoNota } from "./nfe-operacoes.ts";
import { itensEntrada } from "./nfe-entrada.ts";

export type NotaAvulsa = {
  unidade_id: string; cliente_id: string; operacao: string; natureza?: string | null;
  itens: { produto_id: string; descricao?: string | null; quantidade: number; valor_unitario: number }[];
  desconto?: number | null; frete?: number | null; modalidade_frete?: number | null; observacoes?: string | null;
  /** Chave (44 dígitos) da NF-e referenciada, opcional: ex. a nota de venda da máquina que volta para conserto. */
  chave_referenciada?: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Confere o que veio da tela antes de ir ao banco (erros em português, para o usuário). */
export function validarAvulsa(n: Partial<NotaAvulsa>) {
  if (!n?.unidade_id) throw new HttpError(400, "escolha a empresa que emite");
  if (!n.cliente_id) throw new HttpError(400, "escolha o cliente");
  if (!operacaoNota(String(n.operacao ?? ""))) throw new HttpError(400, "escolha o tipo de operação");
  if (!Array.isArray(n.itens) || !n.itens.length) throw new HttpError(400, "adicione ao menos um item");
  for (const i of n.itens) {
    if (!i.produto_id) throw new HttpError(400, "item sem produto");
    if (!(Number(i.quantidade) > 0)) throw new HttpError(400, "quantidade dos itens deve ser maior que zero");
    if (!(Number(i.valor_unitario) >= 0)) throw new HttpError(400, "valor dos itens não pode ser negativo");
  }
  if (Number(n.desconto ?? 0) < 0 || Number(n.frete ?? 0) < 0) throw new HttpError(400, "desconto e frete não podem ser negativos");
  if (String(n.chave_referenciada ?? "").trim() && !chaveValida(n.chave_referenciada)) {
    throw new HttpError(400, "chave da NF referenciada inválida: confira os 44 números (ou deixe em branco)");
  }
}

export async function emitirAvulsa(db: any, n: NotaAvulsa) {
  validarAvulsa(n);
  const op = operacaoNota(n.operacao)!;
  const ids = [...new Set(n.itens.map((i) => i.produto_id))];
  const [{ data: cfg }, { data: u }, { data: c }, { data: prods }, { data: ufsLista }] = await Promise.all([
    db.from("configuracoes").select("*").eq("id", 1).single(),
    db.from("unidades").select("*").eq("id", n.unidade_id).single(),
    db.from("clientes").select("*").eq("id", n.cliente_id).single(),
    db.from("produtos").select("*").in("id", ids),
    db.from("icms_uf").select("*"),
  ]);
  if (!u) throw new HttpError(404, "empresa não encontrada");
  if (!c) throw new HttpError(404, "cliente não encontrado");
  exigirEmitente(u);

  const doc = onlyDigits(c.cpf_cnpj);
  const faltando = [
    !c.nome && "nome", ![11, 14].includes(doc.length) && "CPF/CNPJ", !c.logradouro && "logradouro",
    !c.numero && "número", !c.bairro && "bairro", !c.municipio && "município", !c.uf && "UF",
    onlyDigits(c.cep).length !== 8 && "CEP",
  ].filter(Boolean);
  if (faltando.length) throw new HttpError(400, `cadastro do cliente incompleto: ${faltando.join(", ")}`);

  const produto = (id: string) => (prods ?? []).find((p: any) => p.id === id);
  const semProduto = n.itens.filter((i) => !produto(i.produto_id));
  if (semProduto.length) throw new HttpError(400, "produto não encontrado em algum item");
  const semNcm = n.itens.filter((i) => onlyDigits(produto(i.produto_id)?.ncm).length !== 8);
  if (semNcm.length) throw new HttpError(400, `produto(s) sem NCM válido: ${semNcm.map((i) => i.descricao || produto(i.produto_id)?.descricao).join(", ")}`);

  const interestadual = c.uf.toUpperCase() !== u.uf.toUpperCase();
  const contribuinte = c.tipo_pessoa === "PJ" && Number(c.contribuinte_icms) === 1;
  const brutos = n.itens.map((i) => r2(Number(i.quantidade) * Number(i.valor_unitario)));
  const descontos = ratear(Number(n.desconto ?? 0), brutos);
  const fretes = ratear(Number(n.frete ?? 0), brutos);
  const ufs: AliquotasUf = Object.fromEntries((ufsLista ?? []).map((x: any) => [x.uf, x]));
  const usadas = new Set<RegraTributaria>();
  const bases = n.itens.map((i, idx) => {
    const p = produto(i.produto_id);
    return itemBase(p, (i.descricao || p.descricao).trim(), Number(i.quantidade), Number(i.valor_unitario),
      { desconto: descontos[idx], frete: fretes[idx], ...(op.cfop ? { cfop: op.cfop } : {}) });
  });
  const regras = await regrasDa(db, u.id);
  // Remessa (conserto, garantia, bonificação, demonstração…) não é receita: sem regra própria, PIS/COFINS saem
  // sem valor (CST 49, outras operações de saída) e as regras feitas só para "Venda" não entram.
  const uOp = op.financeiro ? u : { ...u, pis_cst: "49", cofins_cst: "49" };
  const items = op.entrada
    ? itensEntrada(op, bases, {
      ufEmitente: u.uf, ufRemetente: c.uf, contribuinte, aliquotaInterna: Number(u.icms_aliquota_interna ?? 17), ipiEnquadramento: u.ipi_enquadramento,
      regras, unidade_id: u.id, usadas, ibsCbs: configIbsCbs(cfg), ibsCbsUnidade: { cst: u.ibs_cbs_cst, class_trib: u.ibs_cbs_class_trib },
    })
    : itensVenda(uOp, { uf: c.uf.toUpperCase(), contribuinte }, bases, ufs, { regras, unidade_id: u.id, usadas, ibsCbs: configIbsCbs(cfg), operacao: op.financeiro ? "venda" : "remessa" });
  const chaveRef = chaveValida(n.chave_referenciada);

  const totalProdutos = r2(brutos.reduce((a, b) => a + b, 0));
  const ipi = r2((items as any[]).reduce((s, i) => s + Number(i.ipi_valor ?? 0), 0));
  // ICMS desonerado abatido do total (indDeduzDeson = 1): a SEFAZ tira do valor da nota
  const abatido = r2((items as any[]).reduce((s, i) => s + (Number(i.icms_deducao_desoneracao) === 1 ? Number(i.icms_valor_desonerado ?? 0) : 0), 0));
  const valorTotal = r2(totalProdutos - Number(n.desconto ?? 0) + Number(n.frete ?? 0) + ipi - abatido);

  const payload = {
    natureza_operacao: (n.natureza ?? "").trim() || op.natureza || u.natureza_operacao,
    data_emissao: new Date().toISOString(),
    // entrada: a MF emite a nota de quem manda (tipo 0); a outra parte vai nos campos do destinatário
    tipo_documento: op.entrada ? 0 : 1,
    finalidade_emissao: 1,
    local_destino: interestadual ? 2 : 1,
    consumidor_final: contribuinte ? 0 : 1,
    presenca_comprador: op.entrada ? 9 : cfg.presenca_comprador,
    ...(chaveRef ? { notas_referenciadas: [{ chave_nfe: chaveRef }] } : {}),
    cnpj_emitente: onlyDigits(u.cnpj),
    nome_destinatario: c.nome,
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: c.tipo_pessoa === "PJ" ? Number(c.contribuinte_icms) : 9,
    ...(contribuinte && c.inscricao_estadual ? { inscricao_estadual_destinatario: onlyDigits(c.inscricao_estadual) } : {}),
    logradouro_destinatario: c.logradouro,
    numero_destinatario: c.numero,
    complemento_destinatario: c.complemento || undefined,
    bairro_destinatario: c.bairro,
    municipio_destinatario: c.municipio,
    uf_destinatario: c.uf.toUpperCase(),
    cep_destinatario: onlyDigits(c.cep),
    telefone_destinatario: onlyDigits(c.telefone || c.whatsapp) || undefined,
    email_destinatario: c.email || undefined,
    modalidade_frete: Number(n.modalidade_frete ?? 9),
    informacoes_adicionais_contribuinte: [n.observacoes, chaveRef ? `NF-e referenciada: ${chaveRef}` : "", observacoes(usadas), u.informacoes_complementares].filter(Boolean).join(" - "),
    items,
  };

  const referencia = `${op.entrada ? "entrada" : "direta"}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
  return await emitir(db, referencia, payload, {
    unidade_id: u.id, cliente_id: c.id, destinatario_nome: c.nome, destinatario_doc: doc, valor_total: valorTotal,
    tipo_operacao: op.entrada ? "entrada" : "saida", finalidade: "normal", operacao: op.id, ...(chaveRef ? { chave_referenciada: chaveRef } : {}),
    itens: n.itens.map((i) => ({ produto_id: i.produto_id, descricao: (i.descricao || produto(i.produto_id)?.descricao || "").trim(), quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })),
    observacao_interna: `${op.entrada ? "Nota de entrada" : "Nota direta"} · ${op.rotulo}`,
  });
}
