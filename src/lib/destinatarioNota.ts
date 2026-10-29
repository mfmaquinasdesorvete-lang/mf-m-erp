// Destinatário da NF-e recusada (tela Corrigir e reenviar): o que veio da Receita/SINTEGRA entra nos campos da nota e o
// que foi corrigido na nota pode ir também para o cadastro do cliente (29/10: ela não queria sair da nota para corrigir).
// Funções puras: a tela e os testes usam a mesma regra.

/** Campo da nota (payload da Focus) → campo do cadastro do cliente. */
const NOTA_CLIENTE: Record<string, string> = {
  nome_destinatario: "nome", inscricao_estadual_destinatario: "inscricao_estadual", logradouro_destinatario: "logradouro",
  numero_destinatario: "numero", complemento_destinatario: "complemento", bairro_destinatario: "bairro",
  municipio_destinatario: "municipio", uf_destinatario: "uf", cep_destinatario: "cep", telefone_destinatario: "telefone",
  email_destinatario: "email",
};

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** O que mudou nos campos do destinatário, já com os nomes do cadastro do cliente (só o que mudou). */
export function destinatarioParaCliente(dest: Record<string, string>, original: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  let mexeuIe = false;
  for (const [k, v] of Object.entries(dest)) {
    const antes = original[k] == null ? "" : String(original[k]);
    if (v === antes) continue;
    if (k === "indicador_inscricao_estadual_destinatario") { mexeuIe = true; continue; }
    const campo = NOTA_CLIENTE[k];
    if (!campo) continue;
    if (campo === "inscricao_estadual") mexeuIe = true;
    const valor = v.trim();
    patch[campo] = campo === "cep" ? digitos(valor) || null : campo === "uf" ? valor.toUpperCase() || null : valor || null;
  }
  // o cadastro fica igual ao que a nota manda: o indicador da nota vira o contribuinte_icms do cliente (com CNPJ, PJ:
  // a emissão só usa o contribuinte_icms de PJ)
  const ind = dest.indicador_inscricao_estadual_destinatario;
  if (mexeuIe && ["1", "2", "9"].includes(ind)) {
    patch.contribuinte_icms = Number(ind);
    if (ind !== "1" && patch.inscricao_estadual === undefined && original.inscricao_estadual_destinatario) patch.inscricao_estadual = null;
    if (digitos(original.cnpj_destinatario).length === 14) patch.tipo_pessoa = "PJ";
  }
  return patch;
}

/** Indicador que combina com a IE digitada: número → 1 (contribuinte), ISENTO → 2; vazia não muda o indicador. */
export const indicadorDaIe = (ie: string, atual: string) => (/^\s*isento\s*$/i.test(ie) ? "2" : /\d/.test(ie) ? "1" : atual);

/** Dados da Receita (completarPorCnpj, nomes do cadastro) → campos do destinatário da nota. A IE achada vira contribuinte. */
export function receitaParaDestinatario(r: Record<string, unknown>): Record<string, string> {
  const dest: Record<string, string> = {};
  for (const [nota, cliente] of Object.entries(NOTA_CLIENTE)) {
    const v = r[cliente];
    if (v != null && String(v).trim()) dest[nota] = cliente === "cep" ? digitos(v) : String(v).trim();
  }
  if (dest.inscricao_estadual_destinatario) dest.indicador_inscricao_estadual_destinatario = "1";
  // endereço novo da Receita: o complemento antigo não fica junto da rua nova
  if (dest.logradouro_destinatario) dest.complemento_destinatario = String(r.complemento ?? "").trim();
  if (dest.uf_destinatario) dest.uf_destinatario = dest.uf_destinatario.toUpperCase();
  return dest;
}
