// Dinheiro que vai e vem entre as contas da própria MF, os sócios e as empresas ligadas (partes relacionadas),
// separado do resto como o combustível. Tudo puro (sem banco e sem tela). Testes em __tests__/partesRelacionadas.test.ts.
// Os CPFs e CNPJs ficam só no banco (tabela partes_relacionadas, cadastrada pela tela): nunca no código.

export type Parte = { id: string; nome: string; tipo: "socio" | "empresa"; documentos: string[]; nomes_extrato: string[]; ativo?: boolean };
/** A própria MF: razão social das unidades e os CNPJs (matriz e filial). */
export type Propria = { nomes: string[]; documentos: string[] };
export type Achado =
  | { grupo: "entre_contas"; como: "documento" | "nome" | "marcado" | "par" }
  | { grupo: "parte"; parte: string; como: "documento" | "nome" };

export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
/** Maiúsculas, sem acento e sem pontuação, com espaço nas pontas (para achar o nome como palavra inteira). */
const texto = (s: unknown) => ` ${String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
// "LTDA", "S/A"… saem do nome: o extrato às vezes mostra só "MF MAQUINAS"
const SUFIXOS = / (LTDA|ME|EPP|EIRELI|S A|SA|MEI)$/;
const semSufixo = (n: string) => { let t = texto(n).trim(); while (SUFIXOS.test(t)) t = t.replace(SUFIXOS, "").trim(); return t; };

/**
 * CPFs e CNPJs que aparecem na descrição: inteiros ("11.222.333/0001-81") ou mascarados pelo banco
 * ("•••.468.620-••", "***428550"). No mascarado ficam só os números à mostra (pelo menos 5).
 */
export function documentosNaDescricao(descricao: string | null | undefined): { digitos: string; mascarado: boolean }[] {
  const out: { digitos: string; mascarado: boolean }[] = [];
  for (const m of String(descricao ?? "").matchAll(/[\d*•][\d*•.\-/]{6,}[\d*•]/g)) {
    const t = m[0];
    if (/[*•]/.test(t)) {
      const visivel = (t.match(/\d+(?:[.\-/]\d+)*/g) ?? []).map(soDigitos).sort((a, b) => b.length - a.length)[0] ?? "";
      if (visivel.length >= 5) out.push({ digitos: visivel, mascarado: true });
    } else {
      const d = soDigitos(t);
      if (d.length === 11 || d.length === 14) out.push({ digitos: d, mascarado: false });
    }
  }
  return out;
}

const bateDocumento = (docs: string[], achados: { digitos: string; mascarado: boolean }[]) =>
  docs.map(soDigitos).filter((d) => d.length === 11 || d.length === 14)
    .some((d) => achados.some((a) => (a.mascarado ? d.includes(a.digitos) : d === a.digitos)));
// nome curto demais pegaria qualquer coisa
const bateNome = (nomes: string[], desc: string) => nomes.map(semSufixo).filter((n) => n.length >= 5).some((n) => desc.includes(` ${n} `));

/**
 * De quem é o lançamento: de um sócio ou empresa ligada (pelo CPF/CNPJ, senão pelo nome), da própria MF
 * (outra conta nossa) ou marcado como transferência na conciliação. Null = não é deste painel.
 * O sócio/empresa vem antes: um Pix da MF para a Soft Premium é da Soft Premium, não "entre contas".
 */
export function classificar(l: { descricao: string | null; status?: string | null }, partes: Parte[], propria: Propria): Achado | null {
  const docs = documentosNaDescricao(l.descricao);
  const desc = texto(l.descricao);
  const ativas = partes.filter((p) => p.ativo !== false);
  for (const p of ativas) if (bateDocumento(p.documentos, docs)) return { grupo: "parte", parte: p.id, como: "documento" };
  for (const p of ativas) if (bateNome([p.nome, ...p.nomes_extrato], desc)) return { grupo: "parte", parte: p.id, como: "nome" };
  if (bateDocumento(propria.documentos, docs)) return { grupo: "entre_contas", como: "documento" };
  if (bateNome(propria.nomes, desc)) return { grupo: "entre_contas", como: "nome" };
  if (l.status === "transferencia") return { grupo: "entre_contas", como: "marcado" };
  return null;
}

export const COMO: Record<Achado["como"], string> = {
  documento: "pelo CPF/CNPJ", nome: "pelo nome", marcado: "marcado como transferência", par: "mesmo valor entre duas contas",
};

/** CPF/CNPJ com os números do meio escondidos, para mostrar na tela: •••.468.620-•• / 47.538.812/••••-•• */
export function mascararDocumento(doc: string) {
  const d = soDigitos(doc);
  if (d.length === 11) return `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-••`;
  return d ? "•••" : "";
}

/** Recebido (entrou), enviado (saiu) e o saldo do ponto de vista da MF: positivo = a MF recebeu mais do que mandou. */
export function totais(lancs: { valor: number }[]) {
  let entrou = 0, saiu = 0;
  for (const l of lancs) { const v = Number(l.valor); if (v > 0) entrou += v; else saiu -= v; }
  return { entrou, saiu, saldo: entrou - saiu, n: lancs.length };
}
