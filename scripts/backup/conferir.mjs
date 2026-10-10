// Confere o banco restaurado: cada tabela do backup tem que ter o mesmo número de linhas.
// Uso: node conferir.mjs <url do banco de teste> <arquivo de resultado> <segundos>
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [url, saida, segundos] = process.argv.slice(2);
const manifesto = JSON.parse(await readFile(join(process.env.BACKUP_DIR, "manifesto.json"), "utf8"));
const esperado = Object.fromEntries(Object.entries(manifesto.linhas_por_tabela).filter(([t]) => !/^(cron|net|supabase_functions)\./.test(t)));
const nomes = Object.keys(esperado);
const sql = nomes.map((t) => {
  const [s, n] = t.split(".");
  return `select '${t}', count(*) from "${s}"."${n}"`;
}).join(" union all ") || "select 'nada', 0";
const out = execFileSync("psql", ["--no-psqlrc", "-At", "-F", "\t", "-d", url, "-c", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const achado = Object.fromEntries(out.trim().split("\n").filter(Boolean).map((l) => { const [t, n] = l.split("\t"); return [t, Number(n)]; }));
const diferentes = nomes.filter((t) => achado[t] !== esperado[t]);
const linhas = nomes.reduce((s, t) => s + esperado[t], 0);
const ok = diferentes.length === 0;
await writeFile(saida, JSON.stringify({ ok, tabelas: nomes.length, linhas, diferentes: diferentes.length, segundos: Number(segundos) }));
// só nomes de tabela e totais no log (repositório público)
console.log(`Teste de restauração: ${ok ? "OK" : "DIFERENTE"} (${nomes.length} tabelas, ${linhas} linhas, ${segundos}s)`);
if (!ok) console.log(`Tabelas com contagem diferente: ${diferentes.slice(0, 10).join(", ")}`);
process.exit(ok ? 0 : 1);
