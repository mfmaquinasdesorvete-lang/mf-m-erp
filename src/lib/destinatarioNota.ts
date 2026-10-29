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
  for (const [k, v] of Object.entries(dest)) {
    const antes = original[k] == null ? "" : String(original[k]);
    if (v === antes) continue;
    if (k === "indicador_inscricao_estadual_destinatario") {
      if (["1", "2", "9"].includes(v)) patch.contribuinte_icms = Number(v);
      continue;
    }
    const campo = NOTA_CLIENTE[k];
    if (!campo) continue;
    const valor = v.trim();
    patch[campo] = campo === "cep" ? digitos(valor) || null : campo === "uf" ? valor.toUpperCase() || null : valor || null;
  }
  // IE preenchida marca o cliente como contribuinte; "ISENTO" como isento
  if (typeof patch.inscricao_estadual === "string" && patch.contribuinte_icms === undefined) {
    patch.contribuinte_icms = /^isento$/i.test(patch.inscricao_estadual) ? 2 : 1;
  }
  return patch;
}

/** Dados da Receita (completarPorCnpj, nomes do cadastro) → campos do destinatário da nota. A IE achada vira contribuinte. */
export function receitaParaDestinatario(r: Record<string, unknown>): Record<string, string> {
  const dest: Record<string, string> = {};
  for (const [nota, cliente] of Object.entries(NOTA_CLIENTE)) {
    const v = r[cliente];
    if (v != null && String(v).trim()) dest[nota] = cliente === "cep" ? digitos(v) : String(v).trim();
  }
  if (dest.inscricao_estadual_destinatario) dest.indicador_inscricao_estadual_destinatario = "1";
  if (dest.uf_destinatario) dest.uf_destinatario = dest.uf_destinatario.toUpperCase();
  return dest;
}
