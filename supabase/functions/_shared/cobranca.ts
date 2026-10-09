// Cobrança: Pix copia e cola (BR Code estático do Banco Central, com valor e identificador) e o texto das
// mensagens da régua com as variáveis preenchidas. Código puro: usado pelas Edge Functions (e-mail) e pelo site
// (WhatsApp e página do cliente).

export type PixDados = { chave: string; nome: string; cidade: string; valor?: number; txid?: string };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o padrão do Pix. */
export function crc16(texto: string) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Chave como o banco espera: CPF/CNPJ só com números, telefone com +55, e-mail em minúsculas, aleatória como está. */
export function normalizarChavePix(chave: string) {
  const c = chave.trim();
  if (c.includes("@")) return c.toLowerCase();
  if (/^\+?[\d\s().\-/]+$/.test(c)) {
    const d = c.replace(/\D/g, "");
    if (c.startsWith("+")) return `+${d}`;
    if (d.length === 11 || d.length === 14) return d; // CPF ou CNPJ
    if (d.length === 12 || d.length === 13) return `+${d}`; // celular já com 55
    return d;
  }
  return c;
}

/** Pix copia e cola (também é o conteúdo do QR Code). */
export function pixCopiaECola(p: PixDados) {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", normalizarChavePix(p.chave));
  const nome = semAcento(p.nome).replace(/[^A-Za-z0-9 .\-]/g, "").trim().slice(0, 25) || "RECEBEDOR";
  const cidade = semAcento(p.cidade).replace(/[^A-Za-z0-9 .\-]/g, "").trim().slice(0, 15) || "BRASIL";
  const txid = (p.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const corpo = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986")
    + (p.valor && p.valor > 0 ? campo("54", p.valor.toFixed(2)) : "") + campo("58", "BR") + campo("59", nome) + campo("60", cidade)
    + campo("62", campo("05", txid)) + "6304";
  return corpo + crc16(corpo);
}

export type VariaveisCobranca = {
  cliente?: string | null; descricao?: string | null; valor?: number | null; vencimento?: string | null; dias_atraso?: number | null;
  empresa?: string | null; link?: string | null; pix?: string | null; pagamento?: string | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Preenche {cliente} {descricao} {valor} {vencimento} {dias_atraso} {empresa} {link} {pix} {pagamento}; linhas que ficam vazias somem. */
export function preencherMensagem(modelo: string, v: VariaveisCobranca) {
  const primeiro = (v.cliente ?? "").trim().split(/\s+/)[0] ?? "";
  const pagamento = [v.pix ? `Pix copia e cola:\n${v.pix}` : "", v.pagamento ?? ""].filter(Boolean).join("\n\n");
  const valores: Record<string, string> = {
    cliente: primeiro, descricao: v.descricao ?? "", valor: v.valor != null ? brl(Number(v.valor)) : "",
    vencimento: v.vencimento ? dataBR(v.vencimento) : "", dias_atraso: v.dias_atraso != null ? String(v.dias_atraso) : "",
    empresa: v.empresa ?? "", link: v.link ?? "", pix: v.pix ?? "", pagamento,
  };
  return modelo.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m))
    .split("\n").filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())).join("\n").trim();
}

export const VARIAVEIS_COBRANCA = ["cliente", "descricao", "valor", "vencimento", "dias_atraso", "pagamento", "link", "empresa"];

/**
 * Dados de um e-mail da régua prontos para o modelo: assunto e texto com as variáveis preenchidas e o Pix copia
 * e cola (com o valor e o identificador da conta). Recebe o que public.dados_cobranca() gravou no aviso.
 */
export function prepararCobranca(d: Record<string, unknown>, empresa?: string) {
  const pix = d.pix && typeof d.pix === "object" && (d.pix as any).chave
    ? pixCopiaECola({ chave: String((d.pix as any).chave), nome: String((d.pix as any).nome ?? ""), cidade: String((d.pix as any).cidade ?? ""),
        valor: Number(d.valor ?? 0), txid: `MF${String(d.conta_id ?? "").replace(/-/g, "").slice(0, 20)}` })
    : null;
  const v: VariaveisCobranca = {
    cliente: d.cliente as string, descricao: d.descricao as string, valor: Number(d.valor ?? 0), vencimento: d.vencimento as string,
    dias_atraso: d.dias_atraso as number, empresa: empresa ?? null, link: (d.link as string) ?? null, pix,
    // no e-mail o Pix e os dados de pagamento vão em caixas próprias, fora do texto
    pagamento: null,
  };
  const semPagamento = (t: string) => t.replace(/\{pagamento\}/g, "").replace(/\{pix\}/g, "");
  return {
    ...d, pix_codigo: pix, assunto_final: preencherMensagem(String(d.assunto ?? ""), v),
    texto: preencherMensagem(semPagamento(String(d.mensagem ?? "")), { ...v, pix: null }).replace(/\*/g, ""),
  };
}
