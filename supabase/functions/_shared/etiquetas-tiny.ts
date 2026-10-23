// Tags do contato no Tiny ("tipos de contato" que a empresa cria, como "Garantia" ou "MF - A 200", e os marcadores):
// viram marcadores no cadastro do ERP, com o mesmo nome, para não se perderem na importação.
// Usado na importação pela API do Tiny (servidor) e na importação de planilha (tela): sem nada do Deno nem do navegador.

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Tipos que dizem onde o contato entra (cliente, fornecedor, transportadora) ou quem ele é na empresa: não são tags. */
const NAO_E_TAG = /^(clientes?|fornecedor(es)?|transportador(a|es)?|vendedor(es)?|funcionarios?|outros?)$/;

/** Só vendedor ou funcionário: não entra como cliente. */
export const soPessoalInterno = (tipos: string[]) => tipos.length > 0 && tipos.every((t) => /vendedor|funcionari/.test(sem(t)));

/** Tags do Tiny (sem repetir, sem os tipos de cadastro), na ordem em que vieram. */
export function etiquetasTiny(tipos: unknown[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const t of tipos) {
    const nome = String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const chave = sem(nome);
    if (!nome || NAO_E_TAG.test(chave) || vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push(nome);
  }
  return saida;
}
