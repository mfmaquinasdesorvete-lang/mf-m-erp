// Divisões da pasta de documentos de cada funcionário (coluna documentos.pasta).

export const PASTAS = [
  { value: "contrato", label: "Contrato", dica: "Contrato de trabalho, aditivos, ficha de registro" },
  { value: "exames", label: "Exames", dica: "ASO de admissão, periódico, demissional" },
  { value: "ferias", label: "Férias", dica: "Aviso e recibo de férias" },
  { value: "holerites", label: "Holerites", dica: "Recibos de pagamento do mês" },
  { value: "atestados", label: "Atestados", dica: "Atestados médicos e declarações" },
  { value: "ponto", label: "Ponto", dica: "Folha de ponto do mês" },
  { value: "outros", label: "Outros", dica: "Documentos pessoais, certificados e o que mais precisar" },
] as const;
export type Pasta = (typeof PASTAS)[number]["value"];

/** Divisão do anexo; o que veio sem divisão (os de antes da pasta) ou com uma desconhecida cai em "Outros". */
export const pastaDo = (d: { pasta?: string | null }): Pasta =>
  (PASTAS.find((p) => p.value === d.pasta)?.value ?? "outros");

/** Quantos documentos cada pessoa tem em cada divisão. */
export function contarPorPasta(docs: { entidade_id: string | null; pasta?: string | null }[]) {
  const m = new Map<string, Partial<Record<Pasta, number>>>();
  for (const d of docs) {
    if (!d.entidade_id) continue;
    const c = m.get(d.entidade_id) ?? {};
    const p = pastaDo(d);
    c[p] = (c[p] ?? 0) + 1;
    m.set(d.entidade_id, c);
  }
  return m;
}

/** Nome sem acento, minúsculo e com um espaço só (para casar pasta com pessoa). */
export const normalizarNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[–—_]/g, " ").replace(/\s+/g, " ").trim();

/** Divisão pelo nome da subpasta ("Férias", "ferias", "ASO"…); null quando não é uma divisão. */
export function pastaDoNomeDaPasta(nome: string): Pasta | null {
  const n = normalizarNome(nome);
  const achou = PASTAS.find((p) => normalizarNome(p.label) === n || p.value === n);
  if (achou) return achou.value;
  if (/^(aso|exame)/.test(n)) return "exames";
  if (/^(holerite|recibo|pagamento)/.test(n)) return "holerites";
  if (/^(atestado)/.test(n)) return "atestados";
  if (/^(contrato|admiss)/.test(n)) return "contrato";
  return null;
}

type PessoaImport = { id: string; nome: string; apelido?: string | null };
export type ItemImportacao = { indice: number; pessoaId: string; pessoa: string; pasta: Pasta; nome: string };

/**
 * Importar pasta: cada arquivo vem com o caminho dentro da pasta escolhida
 * ("ERP – Pastas dos funcionários/<Pessoa>/<Divisão>/arquivo.pdf"). A pessoa é a primeira pasta do caminho que tem o
 * nome (ou o apelido) de alguém do cadastro; a divisão é a pasta seguinte (sem ela, ou com nome desconhecido, "Outros").
 * O que já está guardado (mesma pessoa, divisão e nome de arquivo) fica de fora, para poder importar de novo sem repetir.
 */
export function planejarImportacao(
  arquivos: { caminho: string }[], pessoas: PessoaImport[], jaGuardados: { entidade_id: string | null; nome: string; pasta?: string | null }[],
) {
  const porNome = new Map<string, PessoaImport>();
  for (const p of pessoas) {
    porNome.set(normalizarNome(p.nome), p);
    if (p.apelido?.trim() && !porNome.has(normalizarNome(p.apelido))) porNome.set(normalizarNome(p.apelido), p);
  }
  const guardado = new Set(jaGuardados.map((d) => `${d.entidade_id}|${pastaDo(d)}|${d.nome}`));
  const itens: ItemImportacao[] = [];
  const semPessoa = new Set<string>();
  let repetidos = 0;
  arquivos.forEach((a, indice) => {
    const partes = a.caminho.split("/").filter(Boolean);
    const nome = partes[partes.length - 1] ?? "";
    if (!nome || nome.startsWith(".") || /^(desktop\.ini|thumbs\.db)$/i.test(nome)) return;
    const pastas = partes.slice(0, -1);
    const i = pastas.findIndex((p) => porNome.has(normalizarNome(p)));
    if (i < 0) {
      // a pasta da pessoa é a última do caminho que não é uma divisão
      const nomes = pastas.filter((p) => !pastaDoNomeDaPasta(p));
      semPessoa.add(nomes[nomes.length - 1] ?? "(sem pasta)");
      return;
    }
    const pessoa = porNome.get(normalizarNome(pastas[i]))!;
    const pasta = (pastas[i + 1] && pastaDoNomeDaPasta(pastas[i + 1])) || "outros";
    if (guardado.has(`${pessoa.id}|${pasta}|${nome}`)) { repetidos++; return; }
    guardado.add(`${pessoa.id}|${pasta}|${nome}`);
    itens.push({ indice, pessoaId: pessoa.id, pessoa: pessoa.nome, pasta, nome });
  });
  return { itens, semPessoa: [...semPessoa].sort(), repetidos };
}
