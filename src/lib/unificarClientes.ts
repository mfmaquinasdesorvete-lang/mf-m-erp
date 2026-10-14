// Unificar por lógica: grupos de cadastros que são, com certeza, a mesma pessoa ou empresa.
//  * mesmo CPF/CNPJ; ou
//  * mesmo nome (sem o CNPJ do MEI no começo e sem LTDA/ME/EIRELI…) e mesmo telefone/WhatsApp ou mesmo e-mail; ou
//  * mesmo nome e mesma cidade, quando pelo menos um dos dois não tem CPF/CNPJ (nome com 2 palavras ou mais).
// Nunca junta cadastros com CPF/CNPJ diferentes (pessoa e empresa do mesmo dono continuam separadas).
// Usado na importação da base da My Frost e em "Arrumar cadastro" (unificar os grupos certos de uma vez).

export type Contatavel = {
  id: string; nome: string; cpf_cnpj?: string | null; telefone?: string | null; whatsapp?: string | null;
  celular?: string | null; email?: string | null; municipio?: string | null; codigo?: number | null;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** "12.345.678 JOSÉ DA SILVA ME" -> "jose da silva" */
export function chaveNome(nome: string) {
  return semAcento(String(nome ?? "").replace(/^[\d.\s/-]{8,}/, ""))
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltda|me|epp|eireli|mei|sa|s a|cia)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Telefone com DDD (os 8 últimos dígitos + o DDD), para casar "(48) 9 9999-0000" com "4899990000". */
export function chaveTelefone(v: unknown) {
  const d = dig(v).replace(/^0+/, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length >= 10 ? `${d.slice(0, 2)}:${d.slice(-8)}` : null;
}

export function gruposCertos<T extends Contatavel>(lista: T[]): T[][] {
  const pai = new Map<string, string>();
  const docs = new Map<string, Set<string>>(); // documentos de cada grupo (raiz)
  const achar = (x: string): string => {
    let r = x;
    while (pai.get(r) !== r) r = pai.get(r)!;
    while (pai.get(x) !== r) { const p = pai.get(x)!; pai.set(x, r); x = p; }
    return r;
  };
  const unir = (a: string, b: string) => {
    const ra = achar(a), rb = achar(b);
    if (ra === rb) return;
    const juntos = new Set([...docs.get(ra)!, ...docs.get(rb)!]);
    if (juntos.size > 1) return; // CPF/CNPJ diferentes: não é a mesma pessoa
    pai.set(rb, ra);
    docs.set(ra, juntos);
  };
  for (const c of lista) {
    pai.set(c.id, c.id);
    const d = dig(c.cpf_cnpj);
    docs.set(c.id, new Set(d.length === 11 || d.length === 14 ? [d] : []));
  }
  const indice = new Map<string, string>();
  const ver = (k: string | null, id: string) => {
    if (!k) return;
    const o = indice.get(k);
    if (o) unir(o, id); else indice.set(k, id);
  };
  for (const c of lista) {
    const d = dig(c.cpf_cnpj);
    if (d.length === 11 || d.length === 14) ver(`d:${d}`, c.id);
  }
  for (const c of lista) {
    const n = chaveNome(c.nome);
    if (n.length < 4) continue;
    for (const t of new Set([c.whatsapp, c.celular, c.telefone].map(chaveTelefone).filter(Boolean))) ver(`t:${n}|${t}`, c.id);
    const e = String(c.email ?? "").trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) ver(`e:${n}|${e}`, c.id);
  }
  for (const c of lista) {
    const n = chaveNome(c.nome);
    const cidade = semAcento(String(c.municipio ?? "")).trim();
    // mesmo nome e cidade só junta quem não tem documento com um grupo de no máximo um documento
    if (cidade && n.split(" ").length >= 2 && n.length >= 8 && !docs.get(c.id)!.size) ver(`c:${n}|${cidade}`, c.id);
  }
  // quem tem documento também entra no índice de nome + cidade, para receber os sem documento
  for (const c of lista) {
    const n = chaveNome(c.nome);
    const cidade = semAcento(String(c.municipio ?? "")).trim();
    if (cidade && n.split(" ").length >= 2 && n.length >= 8 && docs.get(c.id)!.size) {
      const k = `c:${n}|${cidade}`;
      const o = indice.get(k);
      if (o) unir(c.id, o);
    }
  }
  const grupos = new Map<string, T[]>();
  for (const c of lista) { const r = achar(c.id); grupos.set(r, [...(grupos.get(r) ?? []), c]); }
  return [...grupos.values()].filter((g) => g.length > 1);
}

/** Qual cadastro fica: o que tem CPF/CNPJ, depois o mais completo, depois o mais antigo (menor código). */
export function principalDoGrupo<T extends Contatavel>(g: T[]): T {
  const pontos = (c: T) => (dig(c.cpf_cnpj).length >= 11 ? 100 : 0)
    + [c.email, c.whatsapp || c.celular, c.telefone, c.municipio].filter((x) => String(x ?? "").trim()).length;
  return [...g].sort((a, b) => pontos(b) - pontos(a) || (a.codigo ?? 1e9) - (b.codigo ?? 1e9))[0];
}
