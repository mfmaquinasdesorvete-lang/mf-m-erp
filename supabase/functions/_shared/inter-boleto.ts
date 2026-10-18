// Boleto com Pix do Banco Inter (API Cobrança v3): monta o pedido de emissão a partir da conta a receber e do
// cadastro do cliente, e lê a resposta do Inter. Sem Deno nem rede: os testes (vitest) usam direto.
// Rotas (cdpj.partners.bancointer.com.br): POST /cobranca/v3/cobrancas → { codigoSolicitacao };
// GET /cobranca/v3/cobrancas/{codigo} → { cobranca, boleto, pix }; GET …/{codigo}/pdf → { pdf (base64) };
// POST …/{codigo}/cancelar { motivoCancelamento }; PUT /cobranca/v3/cobrancas/webhook { webhookUrl };
// o aviso (callback) chega como lista [{ codigoSolicitacao, situacao, … }]. Escopos boleto-cobranca.read/write.

export const ESCOPO_BOLETO = "boleto-cobranca.read boleto-cobranca.write";

export type ClienteBoleto = {
  nome?: string | null; tipo_pessoa?: string | null; cpf_cnpj?: string | null; email?: string | null; telefone?: string | null; whatsapp?: string | null;
  cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null;
  cobranca_diferente?: boolean | null; cobranca_cep?: string | null; cobranca_logradouro?: string | null; cobranca_numero?: string | null;
  cobranca_complemento?: string | null; cobranca_bairro?: string | null; cobranca_municipio?: string | null; cobranca_uf?: string | null;
};
export type RegrasBoleto = { multa_pct?: number | null; juros_mes_pct?: number | null; dias_baixa?: number | null; mensagem?: string | null };

/** Situações da cobrança no Inter */
export type SituacaoInter = "EM_PROCESSAMENTO" | "A_RECEBER" | "ATRASADO" | "RECEBIDO" | "MARCADO_RECEBIDO" | "CANCELADO" | "EXPIRADO" | "FALHA_EMISSAO" | "PROTESTO";
export const SITUACOES_INTER: SituacaoInter[] = ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "RECEBIDO", "MARCADO_RECEBIDO", "CANCELADO", "EXPIRADO", "FALHA_EMISSAO", "PROTESTO"];
/** Boleto que ainda pode ser pago */
export const BOLETO_EM_ABERTO: SituacaoInter[] = ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "PROTESTO"];
export const BOLETO_PAGO: SituacaoInter[] = ["RECEBIDO", "MARCADO_RECEBIDO"];

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const t = (v: unknown) => (v == null ? "" : String(v).trim());
const so = (v: unknown) => t(v).replace(/\D/g, "");
/** tira acentos e símbolos que o banco não imprime no boleto */
export const limparTexto = (v: unknown, max: number) =>
  t(v).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .,/&@()+-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Endereço que vai no boleto: o de cobrança quando o cliente tem um diferente e completo, senão o principal */
export function enderecoBoleto(c: ClienteBoleto) {
  const cob = { cep: c.cobranca_cep, logradouro: c.cobranca_logradouro, numero: c.cobranca_numero, complemento: c.cobranca_complemento, bairro: c.cobranca_bairro, municipio: c.cobranca_municipio, uf: c.cobranca_uf };
  const usaCobranca = !!c.cobranca_diferente && so(cob.cep).length === 8 && t(cob.logradouro) && t(cob.municipio) && t(cob.uf);
  return usaCobranca ? cob : { cep: c.cep, logradouro: c.logradouro, numero: c.numero, complemento: c.complemento, bairro: c.bairro, municipio: c.municipio, uf: c.uf };
}

/**
 * Pagador do boleto a partir do cadastro. Devolve o que falta (em português) quando o cadastro não basta:
 * o Inter exige CPF/CNPJ, nome, CEP, endereço, cidade e UF.
 */
export function pagadorInter(c: ClienteBoleto | null | undefined) {
  const faltando: string[] = [];
  if (!c) return { faltando: ["cliente na conta"] };
  const doc = so(c.cpf_cnpj);
  const end = enderecoBoleto(c);
  if (doc.length !== 11 && doc.length !== 14) faltando.push("CPF ou CNPJ");
  if (!t(c.nome)) faltando.push("nome");
  if (so(end.cep).length !== 8) faltando.push("CEP");
  if (!t(end.logradouro)) faltando.push("endereço (rua)");
  if (!t(end.municipio)) faltando.push("cidade");
  const uf = t(end.uf).toUpperCase();
  if (!UFS.has(uf)) faltando.push("UF");
  if (faltando.length) return { faltando };
  const fone = so(c.whatsapp || c.telefone).replace(/^55(?=\d{10,11}$)/, "");
  const email = t(c.email).split(/[;,\s]+/).find((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) ?? "";
  return {
    faltando,
    pagador: {
      cpfCnpj: doc,
      tipoPessoa: doc.length === 14 ? "JURIDICA" : "FISICA",
      nome: limparTexto(c.nome, 100),
      endereco: limparTexto(end.logradouro, 100),
      numero: limparTexto(end.numero, 10),
      complemento: limparTexto(end.complemento, 30),
      bairro: limparTexto(end.bairro, 60),
      cidade: limparTexto(end.municipio, 60),
      uf,
      cep: so(end.cep),
      ...(email && email.length <= 50 ? { email } : {}),
      ...(fone.length >= 10 ? { ddd: fone.slice(0, 2), telefone: fone.slice(2).slice(-9) } : {}),
    },
  };
}

/** "Seu número" do boleto (até 15 caracteres): o número da conta no ERP, que volta no aviso do Inter */
export const seuNumero = (contaId: string, tentativa = 0) =>
  (contaId.replace(/-/g, "").slice(0, 12) + (tentativa ? `-${tentativa}` : "")).toUpperCase().slice(0, 15);

/** Pedido de emissão do boleto com Pix. */
export function corpoCobranca(p: {
  contaId: string; tentativa?: number; valor: number; vencimento: string; pagador: Record<string, unknown>; regras?: RegrasBoleto; descricao?: string | null;
}) {
  const valor = r2(p.valor);
  if (!(valor >= 2.5)) throw new Error("O Inter só emite boleto a partir de R$ 2,50.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) throw new Error("Vencimento inválido.");
  const multa = Number(p.regras?.multa_pct ?? 0);
  const juros = Number(p.regras?.juros_mes_pct ?? 0);
  const dias = Math.min(60, Math.max(0, Math.round(Number(p.regras?.dias_baixa ?? 30))));
  const linhas = [limparTexto(p.descricao, 78), ...t(p.regras?.mensagem).split(/\r?\n/).map((l) => limparTexto(l, 78))].filter(Boolean).slice(0, 5);
  return {
    seuNumero: seuNumero(p.contaId, p.tentativa),
    valorNominal: valor,
    dataVencimento: p.vencimento,
    numDiasAgenda: dias,
    pagador: p.pagador,
    ...(multa > 0 ? { multa: { codigo: "PERCENTUAL", taxa: r2(multa) } } : {}),
    ...(juros > 0 ? { mora: { codigo: "TAXAMENSAL", taxa: r2(juros) } } : {}),
    ...(linhas.length ? { mensagem: Object.fromEntries(linhas.map((l, i) => [`linha${i + 1}`, l])) } : {}),
    formasRecebimento: ["BOLETO", "PIX"],
  };
}

export type CobrancaInter = {
  cobranca?: { codigoSolicitacao?: string; seuNumero?: string; situacao?: string; dataSituacao?: string; valorTotalRecebido?: string | number; origemRecebimento?: string; motivoCancelamento?: string; dataVencimento?: string; valorNominal?: number };
  boleto?: { nossoNumero?: string; codigoBarras?: string; linhaDigitavel?: string };
  pix?: { txid?: string; pixCopiaECola?: string };
};

/** Resposta do Inter → campos do boleto no ERP (tabela boletos_inter) */
export function lerCobranca(r: CobrancaInter) {
  const c = r.cobranca ?? {};
  const situacao = SITUACOES_INTER.includes(t(c.situacao) as SituacaoInter) ? (t(c.situacao) as SituacaoInter) : "EM_PROCESSAMENTO";
  const recebido = Number(t(c.valorTotalRecebido).replace(",", "."));
  const data = t(c.dataSituacao).slice(0, 10);
  return {
    situacao,
    situacao_data: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    valor_recebido: Number.isFinite(recebido) && recebido > 0 ? r2(recebido) : null,
    origem_recebimento: ["BOLETO", "PIX"].includes(t(c.origemRecebimento)) ? t(c.origemRecebimento) : null,
    motivo_cancelamento: t(c.motivoCancelamento) || null,
    nosso_numero: t(r.boleto?.nossoNumero) || null,
    linha_digitavel: so(r.boleto?.linhaDigitavel) || null,
    codigo_barras: so(r.boleto?.codigoBarras) || null,
    txid: t(r.pix?.txid) || null,
    pix_copia_cola: t(r.pix?.pixCopiaECola) || null,
  };
}

/** Códigos que vieram no aviso do Inter (o aviso não é assinado: o ERP consulta cada um direto no Inter antes de dar baixa) */
export function codigosDoAviso(corpo: unknown): string[] {
  const lista = Array.isArray(corpo) ? corpo : corpo && typeof corpo === "object" ? [corpo] : [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(lista.map((x) => t((x as Record<string, unknown>)?.codigoSolicitacao)).filter((c) => uuid.test(c)))].slice(0, 200);
}

/** Linha digitável com os espaços e pontos de sempre (47 números) */
export function formatarLinha(l: string | null | undefined) {
  const d = so(l);
  if (d.length !== 47) return d;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}
