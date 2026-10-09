// Conferência do cadastro de clientes com a Receita (dados públicos do CNPJ): situação do CNPJ, inscrição
// estadual, endereço, telefone e e-mail. Preenche só o que está vazio; endereço diferente do cadastro não é
// trocado: os dois ficam (o da Receita em `receita`) e o cliente ganha a etiqueta "endereco_receita".
// Código puro: usado pela Edge Function (lote automático) e pela tela (ficha do cliente).

export type Endereco = { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null };
export type Inscricao = { numero: string; uf: string; ativa: boolean };
export type DadosReceita = {
  nome: string; fantasia: string | null; situacao: string | null; email: string | null; telefones: string[];
  endereco: Endereco; inscricoes: Inscricao[] | null; fonte: string; consultado_em?: string;
};
export type ClienteReceita = {
  nome: string; nome_fantasia?: string | null; email?: string | null; telefone?: string | null; whatsapp?: string | null;
  inscricao_estadual?: string | null; contribuinte_icms?: number | null; tags?: string[] | null;
} & Partial<Endereco>;

export const ETIQUETAS: Record<string, string> = {
  cnpj_irregular: "CNPJ baixado/inapto na Receita",
  ie_baixada: "Inscrição estadual baixada",
  endereco_receita: "Endereço diferente da Receita",
  fornecedor: "Também é fornecedor",
};

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const ou = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())
  .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Celular (com ou sem o 9 da frente) vira o número do WhatsApp: DDD + 9 dígitos. Fixo devolve null. */
export function whatsappDoTelefone(t: string | null | undefined): string | null {
  let d = dig(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") return d;
  if (d.length === 10 && /[6-9]/.test(d[2])) return d.slice(0, 2) + "9" + d.slice(2); // celular antigo, sem o 9
  return null;
}

/** BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/<cnpj>): dados da Receita, sem inscrição estadual. */
export function daBrasilApi(j: any): DadosReceita | null {
  if (!j?.razao_social) return null;
  return {
    nome: String(j.razao_social), fantasia: ou(j.nome_fantasia) ? titulo(String(j.nome_fantasia)) : null,
    situacao: ou(j.descricao_situacao_cadastral)?.toUpperCase() ?? null, email: ou(j.email)?.toLowerCase() ?? null,
    telefones: [j.ddd_telefone_1, j.ddd_telefone_2].map(dig).filter((t) => t.length >= 10),
    endereco: {
      cep: dig(j.cep) || null, logradouro: ou([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" ")) ? titulo([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" ")) : null,
      numero: ou(j.numero), complemento: ou(j.complemento), bairro: ou(j.bairro) ? titulo(j.bairro) : null,
      municipio: ou(j.municipio) ? titulo(j.municipio) : null, uf: ou(j.uf),
    },
    inscricoes: null, fonte: "BrasilAPI",
  };
}

/** CNPJ.ws público (https://publica.cnpj.ws/cnpj/<cnpj>): Receita + inscrições estaduais. */
export function doCnpjWs(j: any): DadosReceita | null {
  const e = j?.estabelecimento;
  if (!j?.razao_social || !e) return null;
  return {
    nome: String(j.razao_social), fantasia: ou(e.nome_fantasia) ? titulo(String(e.nome_fantasia)) : null,
    situacao: ou(e.situacao_cadastral)?.toUpperCase() ?? null, email: ou(e.email)?.toLowerCase() ?? null,
    telefones: [[e.ddd1, e.telefone1], [e.ddd2, e.telefone2]].map(([a, b]) => dig(`${a ?? ""}${b ?? ""}`)).filter((t) => t.length >= 10),
    endereco: {
      cep: dig(e.cep) || null, logradouro: ou([e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ")) ? titulo([e.tipo_logradouro, e.logradouro].filter(Boolean).join(" ")) : null,
      numero: ou(e.numero), complemento: ou(e.complemento), bairro: ou(e.bairro) ? titulo(e.bairro) : null,
      municipio: ou(e.cidade?.nome) ? titulo(e.cidade.nome) : null, uf: ou(e.estado?.sigla),
    },
    inscricoes: (e.inscricoes_estaduais ?? []).map((i: any) => ({ numero: dig(i.inscricao_estadual), uf: String(i.estado?.sigla ?? ""), ativa: i.ativo !== false }))
      .filter((i: Inscricao) => i.numero),
    fonte: "CNPJ.ws",
  };
}

const norm = (s: string | null | undefined) => semAcento(String(s ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(rua|r|avenida|av|rodovia|rod|estrada|est|travessa|tv|alameda|al|praca|pc|sn|s n)\b/g, " ").replace(/\s+/g, " ").trim();

/** O endereço do cadastro é outro lugar? (CEP diferente, ou mesma cidade com rua/número diferentes) */
export function enderecoDiferente(c: Partial<Endereco>, r: Endereco) {
  const cepC = dig(c.cep), cepR = dig(r.cep);
  if (!c.logradouro && !cepC && !c.municipio) return false; // cadastro sem endereço: não é diferente, é vazio
  if (cepC && cepR && cepC !== cepR) return true;
  if (norm(c.municipio) && norm(r.municipio) && norm(c.municipio) !== norm(r.municipio)) return true;
  if (norm(c.logradouro) && norm(r.logradouro) && !norm(r.logradouro).includes(norm(c.logradouro)) && !norm(c.logradouro).includes(norm(r.logradouro))) return true;
  if (dig(c.numero) && dig(r.numero) && dig(c.numero) !== dig(r.numero)) return true;
  return false;
}

/**
 * Nome com a primeira letra de cada palavra maiúscula e o resto minúsculo (como o initcap do banco):
 * "SORVETERIA DO JOÃO LTDA" → "Sorveteria do João Ltda"; ME, EPP, EIRELI e MEI continuam em maiúsculas.
 */
export function nomeProprio(s: string): string;
export function nomeProprio(s: string | null | undefined): string | null | undefined;
export function nomeProprio(s: string | null | undefined) {
  if (!s || !s.trim()) return s;
  return s.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())
    .replace(/ (De|Da|Do|Das|Dos|E|Em|Na|No|Nas|Nos)(?= )/g, (m) => m.toLowerCase())
    .replace(/\b(Epp|Eireli)\b/g, (m) => m.toUpperCase())
    .replace(/ (Me|Mei)$/, (m) => m.toUpperCase());
}

/**
 * Razão social de MEI vem com o CNPJ (ou o CPF) junto do nome: "52.431.268 BRUNO JOSE SALM", "ICARO SANTOS 12345678909".
 * Devolve só o nome; `original` é o texto como veio (para guardar nas observações).
 */
export function separarNomeMei(nome: string | null | undefined): { nome: string; original: string | null } {
  const n = String(nome ?? "").trim();
  const m = n.match(/^\d{2}[.\s]?\d{3}[.\s]?\d{3}\s+(.+)$/) ?? n.match(/^(.+?)\s+\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/);
  return m ? { nome: m[1].trim(), original: n } : { nome: n, original: null };
}

/** Nome "como chamamos" para MEI ("52.431.268 BRUNO JOSE SALM" → "Bruno Jose Salm"). */
export function nomeSemCnpj(nome: string) {
  const { original, nome: limpo } = separarNomeMei(nome);
  return original ? nomeProprio(limpo) : null;
}

/**
 * O que fazer com o cliente depois de consultar a Receita: campos vazios a preencher, etiquetas e situações.
 * Nunca troca o que já está preenchido.
 */
export function conciliarCliente(c: ClienteReceita, r: DadosReceita) {
  const atualizar: Record<string, unknown> = {};
  const vazio = (v: unknown) => v == null || String(v).trim() === "";
  if (vazio(c.nome_fantasia)) {
    const f = r.fantasia ?? nomeSemCnpj(c.nome) ?? nomeSemCnpj(r.nome);
    if (f) atualizar.nome_fantasia = f;
  }
  if (vazio(c.email) && r.email) atualizar.email = r.email;
  const fixo = r.telefones.find((t) => !whatsappDoTelefone(t)) ?? r.telefones[0];
  if (vazio(c.telefone) && fixo) atualizar.telefone = fixo;
  if (vazio(c.whatsapp)) {
    const w = r.telefones.map(whatsappDoTelefone).find(Boolean) ?? whatsappDoTelefone(c.telefone);
    if (w) atualizar.whatsapp = w;
  }
  const semEndereco = vazio(c.logradouro) && vazio(c.cep) && vazio(c.municipio);
  const diferente = !semEndereco && enderecoDiferente(c, r.endereco);
  if (semEndereco) {
    for (const k of ["cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf"] as const) if (r.endereco[k]) atualizar[k] = r.endereco[k];
  } else {
    // mesmo endereço: completa só os pedaços que faltam (bairro, CEP, UF…)
    if (!diferente) for (const k of ["cep", "numero", "complemento", "bairro", "municipio", "uf"] as const) if (vazio(c[k]) && r.endereco[k]) atualizar[k] = r.endereco[k];
  }

  // inscrição estadual: a do cadastro está ativa? o cadastro não tem e a Receita tem uma ativa no estado?
  const uf = String(c.uf ?? r.endereco.uf ?? "");
  let ie_situacao: string | null = null;
  if (r.inscricoes) {
    const ieC = dig(c.inscricao_estadual);
    if (ieC) {
      const achou = r.inscricoes.filter((i) => i.numero === ieC || i.numero.replace(/^0+/, "") === ieC.replace(/^0+/, ""));
      ie_situacao = achou.some((i) => i.ativa) ? "ativa" : achou.length ? "baixada" : r.inscricoes.length ? "nao_encontrada" : "sem_ie";
    } else {
      const ativa = r.inscricoes.find((i) => i.ativa && (!uf || i.uf === uf)) ?? null;
      if (ativa) {
        atualizar.inscricao_estadual = ativa.numero;
        atualizar.contribuinte_icms = 1;
        ie_situacao = "ativa";
      } else ie_situacao = r.inscricoes.length ? "baixada" : "sem_ie";
    }
  }

  const situacao = r.situacao;
  const irregular = !!situacao && situacao !== "ATIVA";
  // sem informação de IE nesta consulta (BrasilAPI), a etiqueta de IE de antes continua
  const refeitas = ["cnpj_irregular", "endereco_receita", ...(r.inscricoes ? ["ie_baixada"] : [])];
  const tags = new Set((c.tags ?? []).filter((t) => !refeitas.includes(t)));
  if (irregular) tags.add("cnpj_irregular");
  if (ie_situacao === "baixada") tags.add("ie_baixada");
  if (diferente) tags.add("endereco_receita");
  return { atualizar, tags: [...tags].sort(), receita_situacao: situacao, ie_situacao, endereco_diferente: diferente };
}

/** Grupos de possíveis cadastros repetidos: mesmo nome (sem o CNPJ do MEI), mesmo WhatsApp/telefone ou mesmo e-mail. */
export function possiveisDuplicados<T extends { id: string; nome: string; nome_fantasia?: string | null; cpf_cnpj?: string | null; whatsapp?: string | null; telefone?: string | null; email?: string | null }>(lista: T[]) {
  const chaveNome = (n: string) => norm(n.replace(/^[\d.\s/-]{8,}/, "")).replace(/\b(ltda|me|epp|eireli|mei|sa|s a)\b/g, "").replace(/\s+/g, " ").trim();
  const pai = new Map<string, string>();
  const achar = (x: string): string => (pai.get(x) === x ? x : (pai.set(x, achar(pai.get(x)!)), pai.get(x)!));
  for (const c of lista) pai.set(c.id, c.id);
  const unir = (a: string, b: string) => { const ra = achar(a), rb = achar(b); if (ra !== rb) pai.set(rb, ra); };
  const indice = new Map<string, string>();
  const ver = (k: string | null, id: string) => { if (!k) return; const o = indice.get(k); if (o) unir(o, id); else indice.set(k, id); };
  for (const c of lista) {
    const n = chaveNome(c.nome);
    if (n.length >= 8 && n.split(" ").length >= 2) ver(`n:${n}`, c.id);
    const doc = dig(c.cpf_cnpj);
    if (doc.length >= 11) ver(`d:${doc}`, c.id);
    for (const t of [c.whatsapp, c.telefone]) { const d = dig(t); if (d.length >= 10) ver(`t:${d.slice(-8)}:${d.slice(0, 2)}`, c.id); }
    const e = String(c.email ?? "").trim().toLowerCase();
    if (e.includes("@")) ver(`e:${e}`, c.id);
  }
  const grupos = new Map<string, T[]>();
  for (const c of lista) { const r = achar(c.id); grupos.set(r, [...(grupos.get(r) ?? []), c]); }
  return [...grupos.values()].filter((g) => g.length > 1);
}
