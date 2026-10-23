// Linhas de código do ERP por técnica (Sobre → Código): contadas nos arquivos do repositório na hora de montar o site,
// então o número se atualiza sozinho a cada versão publicada. Arquivo puro (testado).

export type TecnicaCodigo = { tecnica: string; arquivos: number; linhas: number; cor: string; oQueFaz: string };

const TECNICAS: { tecnica: string; cor: string; oQueFaz: string; casa: (c: string) => boolean }[] = [
  { tecnica: "Testes automáticos (Vitest)", cor: "#22c55e", oQueFaz: "Conferem as contas e as regras sozinhos antes de cada publicação.", casa: (c) => /(__tests__\/|\.test\.tsx?$|^tests?\/)/.test(c) },
  { tecnica: "Funções na nuvem (Deno · TypeScript)", cor: "#a855f7", oQueFaz: "Conversam com Focus NF-e, bancos, InfinitePay, Mercado Livre e e-mail.", casa: (c) => c.startsWith("supabase/functions/") && /\.tsx?$/.test(c) },
  { tecnica: "Banco de dados (SQL · PostgreSQL)", cor: "#0ea5e9", oQueFaz: "Tabelas, travas de segurança por usuário e cálculos dentro do Supabase.", casa: (c) => c.endsWith(".sql") },
  { tecnica: "Telas (React · TSX)", cor: "#ec4899", oQueFaz: "Tudo o que aparece na tela: botões, listas, painéis e janelas.", casa: (c) => c.endsWith(".tsx") },
  { tecnica: "Regras e cálculos (TypeScript)", cor: "#f97316", oQueFaz: "Impostos, comissões, conciliação, PDFs e o caminho dos dados.", casa: (c) => c.endsWith(".ts") },
  { tecnica: "Visual (CSS · Tailwind)", cor: "#eab308", oQueFaz: "Cores, letras, claro e escuro e o encaixe no celular.", casa: (c) => c.endsWith(".css") },
  { tecnica: "HTML", cor: "#ef4444", oQueFaz: "A página que o navegador abre e carrega o ERP.", casa: (c) => c.endsWith(".html") },
  { tecnica: "JavaScript", cor: "#facc15", oQueFaz: "Scripts de apoio da montagem do site.", casa: (c) => /\.(c|m)?js$/.test(c) },
  { tecnica: "Automação (GitHub Actions · YAML)", cor: "#64748b", oQueFaz: "Rotinas que rodam sozinhas: backup, publicação das funções.", casa: (c) => /\.ya?ml$/.test(c) },
  { tecnica: "Scripts (Shell)", cor: "#14b8a6", oQueFaz: "Comandos de manutenção.", casa: (c) => c.endsWith(".sh") },
  { tecnica: "Documentação (Markdown)", cor: "#94a3b8", oQueFaz: "Manuais, migrações e instruções.", casa: (c) => c.endsWith(".md") },
];

/** Arquivos que não são código escrito (imagens, travas de versão das bibliotecas) ficam de fora. */
export const ehCodigo = (caminho: string) => !/(package-lock\.json|deno\.lock|\.(png|jpe?g|webp|gif|ico|svg|pdf|woff2?|ttf|zip|xlsx?))$/i.test(caminho);

/** Junta os arquivos por técnica, da que tem mais linhas para a que tem menos. */
export function contarCodigo(arquivos: { caminho: string; linhas: number }[]): TecnicaCodigo[] {
  const m = new Map<string, TecnicaCodigo>();
  for (const a of arquivos) {
    if (!ehCodigo(a.caminho)) continue;
    const t = TECNICAS.find((x) => x.casa(a.caminho));
    if (!t) continue;
    const atual = m.get(t.tecnica) ?? { tecnica: t.tecnica, cor: t.cor, oQueFaz: t.oQueFaz, arquivos: 0, linhas: 0 };
    atual.arquivos += 1;
    atual.linhas += a.linhas;
    m.set(t.tecnica, atual);
  }
  return [...m.values()].sort((a, b) => b.linhas - a.linhas);
}

/** Linhas de um texto (a última linha sem quebra também conta). */
export const linhasDoTexto = (t: string) => (t ? t.split("\n").length - (t.endsWith("\n") ? 1 : 0) : 0);

export type HorasProjeto = { horas: number; periodos: number; dias: number; desde: string | null };

/**
 * Horas de trabalho no projeto, estimadas pelos horários dos envios do código (git): envios com menos de 1h30 de
 * intervalo são o mesmo período de trabalho, e cada período ganha 30 min pelo começo (antes do 1º envio).
 */
export function horasNoProjeto(datas: string[], pausaMin = 90, inicioMin = 30): HorasProjeto {
  const t = datas.map((d) => Date.parse(d)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!t.length) return { horas: 0, periodos: 0, dias: 0, desde: null };
  let ms = 0, periodos = 1, ini = t[0], ant = t[0];
  for (const x of t.slice(1)) {
    if (x - ant > pausaMin * 60_000) { ms += ant - ini + inicioMin * 60_000; periodos++; ini = x; }
    ant = x;
  }
  ms += ant - ini + inicioMin * 60_000;
  const dias = new Set(t.map((x) => new Date(x).toISOString().slice(0, 10))).size;
  return { horas: Math.round(ms / 3_600_000), periodos, dias, desde: new Date(t[0]).toISOString() };
}
