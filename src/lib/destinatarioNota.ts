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

/** Valor comparável: só dígitos no CEP, telefone e IE; e-mail em minúsculas; UF em maiúsculas. */
function comparavel(k: string, v: unknown) {
  const s = String(v ?? "").trim();
  if (["cep_destinatario", "telefone_destinatario", "inscricao_estadual_destinatario"].includes(k)) return /^isento$/i.test(s) ? "ISENTO" : digitos(s);
  if (k === "email_destinatario") return s.toLowerCase();
  if (k === "uf_destinatario") return s.toUpperCase();
  return s;
}

/** Cadastro do cliente no formato dos campos do destinatário da nota (o indicador é o que a emissão usaria). */
export function clienteComoDestinatario(c: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [nota, cliente] of Object.entries(NOTA_CLIENTE)) out[nota] = c[cliente] ?? "";
  out.indicador_inscricao_estadual_destinatario = c.tipo_pessoa === "PJ" ? Number(c.contribuinte_icms ?? 9) : 9;
  out.cnpj_destinatario = c.cpf_cnpj;
  return out;
}

/** O que está diferente entre os campos do destinatário e o cadastro do cliente (`original` no formato da nota, ver
 *  clienteComoDestinatario), já com os nomes do cadastro. */
export function destinatarioParaCliente(dest: Record<string, string>, original: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  let mexeuIe = false;
  for (const [k, v] of Object.entries(dest)) {
    if (comparavel(k, v) === comparavel(k, original[k])) continue;
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
    // não contribuinte: a IE sai do cadastro; isento mantém o ISENTO do cadastro
    if (ind === "9" && patch.inscricao_estadual === undefined && original.inscricao_estadual_destinatario) patch.inscricao_estadual = null;
    if (ind === "2" && patch.inscricao_estadual === null) delete patch.inscricao_estadual;
    if (digitos(original.cnpj_destinatario).length === 14) patch.tipo_pessoa = "PJ";
  }
  return patch;
}

/** Só os campos que a pessoa mexeu nesta tela (comparando com a nota de antes): o resto da nota pode estar mais velho
 *  que o cadastro (ela pode ter corrigido em Clientes depois) e não pode voltar para lá. */
export function editadosNaTela(dest: Record<string, string>, antes: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(dest).filter(([k, v]) => comparavel(k, v) !== comparavel(k, antes[k])));
}

/** Nomes dos campos do cadastro, para a pessoa ver o que vai mudar. */
export const ROTULO_CADASTRO: Record<string, string> = {
  nome: "nome", inscricao_estadual: "inscrição estadual", contribuinte_icms: "contribuinte", tipo_pessoa: "pessoa jurídica",
  logradouro: "rua", numero: "número", complemento: "complemento", bairro: "bairro", municipio: "cidade", uf: "UF", cep: "CEP",
  telefone: "telefone", email: "e-mail",
};

/** Indicador que combina com a IE digitada: número → 1 (contribuinte), ISENTO → 2; vazia não muda o indicador. */
export const indicadorDaIe = (ie: string, atual: string) => (/^\s*isento\s*$/i.test(ie) ? "2" : /\d/.test(ie) ? "1" : atual);

/** Dados da Receita (completarPorCnpj, nomes do cadastro) → campos do destinatário da nota. A IE achada vira contribuinte.
 *  `atual`: os campos de agora (o complemento só acompanha quando a rua ou o CEP mudam). */
export function receitaParaDestinatario(r: Record<string, unknown>, atual: Record<string, string> = {}): Record<string, string> {
  const dest: Record<string, string> = {};
  for (const [nota, cliente] of Object.entries(NOTA_CLIENTE)) {
    const v = r[cliente];
    if (v != null && String(v).trim()) dest[nota] = cliente === "cep" ? digitos(v) : String(v).trim();
  }
  if (dest.inscricao_estadual_destinatario) dest.indicador_inscricao_estadual_destinatario = "1";
  // endereço novo da Receita: o complemento antigo não fica junto da rua nova (mesma rua e CEP: o complemento fica)
  const ruaNova = dest.logradouro_destinatario && comparavel("logradouro_destinatario", dest.logradouro_destinatario).toLowerCase() !== comparavel("logradouro_destinatario", atual.logradouro_destinatario).toLowerCase();
  const cepNovo = dest.cep_destinatario && dest.cep_destinatario !== digitos(atual.cep_destinatario);
  if (ruaNova || cepNovo) dest.complemento_destinatario = String(r.complemento ?? "").trim();
  else delete dest.complemento_destinatario;
  if (dest.uf_destinatario) dest.uf_destinatario = dest.uf_destinatario.toUpperCase();
  return dest;
}
