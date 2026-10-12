// WhatsApp oficial (Meta): a mensagem de cada etapa da régua vira um modelo (template) para aprovação, e os dados
// da conta viram os parâmetros do modelo na hora do envio. Código puro e sem imports: usado pela função whatsapp e pelo site.

/** As mesmas variáveis da régua (cobranca.ts). */
const VARIAVEIS = ["cliente", "descricao", "valor", "vencimento", "dias_atraso", "pagamento", "link", "empresa"];

/** Exemplo de cada variável (a Meta pede exemplos para aprovar o modelo). */
export const EXEMPLOS_WHATSAPP: Record<string, string> = {
  cliente: "Maria", descricao: "Pedido #1234 - parcela 1/3", valor: "R$ 1.250,00", vencimento: "15/10/2026", dias_atraso: "5",
  pagamento: "Pix copia e cola: 00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986",
  link: "https://erp.myfrost.ai/cliente/2f6c1a9e", empresa: "MF Máquinas",
};

/**
 * Texto do modelo a partir da mensagem da régua: {cliente}, {valor}… viram {{1}}, {{2}}… na ordem em que aparecem.
 * Regras da Meta: o texto não pode começar nem terminar com variável e tem até 1024 caracteres; o parâmetro não pode
 * ter quebra de linha (por isso {pagamento} vira só o Pix copia e cola, numa linha).
 */
export function modeloDaMensagem(mensagem: string): { texto: string; variaveis: string[] } {
  const variaveis: string[] = [];
  let texto = mensagem.replace(/\{(\w+)\}/g, (m, k: string) => {
    const nome = k === "pix" ? "pagamento" : k;
    if (!VARIAVEIS.includes(nome)) return m;
    let i = variaveis.indexOf(nome);
    if (i < 0) { variaveis.push(nome); i = variaveis.length - 1; }
    return `{{${i + 1}}}`;
  });
  texto = texto.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (/^\{\{\d+\}\}/.test(texto)) texto = `Olá! ${texto}`;
  if (/\{\{\d+\}\}[\s.!*_~]*$/.test(texto)) texto = `${texto}\n\nQualquer dúvida, é só responder esta mensagem.`;
  return { texto: texto.slice(0, 1024), variaveis };
}

/** Nome do modelo na Meta: só minúsculas, números e _, e muda quando o texto muda (a Meta não edita modelo aprovado). */
export function nomeModelo(etapa: { evento: string; dias: number }, texto: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const dias = etapa.dias < 0 ? `m${-etapa.dias}` : String(etapa.dias);
  return `mf_regua_${etapa.evento}_${dias}_${h.toString(36)}`;
}

/** Parâmetro do jeito que a Meta aceita: sem quebra de linha, sem espaços repetidos, nunca vazio. */
export function parametro(v: string | null | undefined, reserva = "—") {
  const t = String(v ?? "").replace(/\s*\n+\s*/g, " · ").replace(/[ \t]{2,}/g, " ").trim().slice(0, 1000);
  return t || reserva;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Valores das variáveis para a conta (recebe o que public.dados_cobranca() devolve, o nome do cliente e o Pix copia e cola). */
export function valoresCobranca(d: Record<string, any>, empresa?: string | null, pix?: string | null): Record<string, string> {
  return {
    cliente: parametro(String(d.cliente ?? "").trim().split(/\s+/)[0], "cliente"),
    descricao: parametro(d.descricao),
    valor: parametro(d.valor != null ? brl(Number(d.valor)) : null),
    vencimento: parametro(d.vencimento ? dataBR(String(d.vencimento)) : null),
    dias_atraso: parametro(d.dias_atraso != null ? String(d.dias_atraso) : null, "0"),
    pagamento: parametro(pix ? `Pix copia e cola: ${pix}` : d.pagamento, "fale com a gente para combinar o pagamento"),
    link: parametro(d.link, "fale com a gente"),
    empresa: parametro(empresa, "MF Máquinas"),
  };
}

/** Texto final (para mostrar no ERP o que o cliente recebeu). */
export function preencherModelo(texto: string, parametros: string[]) {
  return texto.replace(/\{\{(\d+)\}\}/g, (m, n) => parametros[Number(n) - 1] ?? m);
}
