// Baixa todos os arquivos do Storage (fotos, documentos, anexos…) para $BACKUP_DIR/arquivos/<bucket>/
// e escreve o manifesto.json (o que tem no backup, com tamanho e SHA-256 de cada arquivo).
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cabecalhos, chaveServico, contarLinhasDump, mb, sha256Arquivo, URL_PROJETO } from "./comum.mjs";

const DIR = process.env.BACKUP_DIR;
const FORA = new Set(["backups"]); // os próprios backups não entram no backup
const k = await chaveServico();
const h = cabecalhos(k);

async function listar(bucket, prefixo = "") {
  const itens = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_PROJETO}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefixo, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`listar ${bucket}: HTTP ${r.status}`);
    const lote = await r.json();
    for (const x of lote) {
      const caminho = prefixo ? `${prefixo}/${x.name}` : x.name;
      if (x.id === null) itens.push(...(await listar(bucket, caminho))); // pasta
      else itens.push({ caminho, tamanho: x.metadata?.size ?? null });
    }
    if (lote.length < 1000) return itens;
  }
}

const rb = await fetch(`${URL_PROJETO}/storage/v1/bucket`, { headers: h });
if (!rb.ok) throw new Error(`listar buckets: HTTP ${rb.status}`);
const buckets = (await rb.json()).map((b) => b.id).filter((id) => !FORA.has(id));

const arquivos = [];
for (const bucket of buckets) {
  for (const a of await listar(bucket)) {
    const url = `${URL_PROJETO}/storage/v1/object/${bucket}/${a.caminho.split("/").map(encodeURIComponent).join("/")}`;
    let r;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      r = await fetch(url, { headers: h });
      if (r.ok) break;
      await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
    }
    if (!r.ok) throw new Error(`baixar ${bucket}/${a.caminho}: HTTP ${r.status}`);
    const destino = join(DIR, "arquivos", bucket, a.caminho);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, Buffer.from(await r.arrayBuffer()));
    arquivos.push({ bucket, caminho: a.caminho, bytes: (await stat(destino)).size, sha256: await sha256Arquivo(destino) });
  }
}

const banco = {};
for (const f of ["roles.sql", "schema.sql", "data.sql", "interno.sql"]) {
  const p = join(DIR, "banco", f);
  banco[f] = { bytes: (await stat(p)).size, sha256: await sha256Arquivo(p) };
}
const linhas = contarLinhasDump(await readFile(join(DIR, "banco", "data.sql"), "utf8"));
const totalLinhas = Object.values(linhas).reduce((s, n) => s + n, 0);
const totalArquivos = arquivos.reduce((s, a) => s + a.bytes, 0);

await writeFile(join(DIR, "manifesto.json"), JSON.stringify({
  projeto: process.env.PROJECT_REF, gerado_em: new Date().toISOString(), banco, linhas_por_tabela: linhas, buckets, arquivos,
}, null, 1));
await writeFile(join(DIR, "..", "resumo.json"), JSON.stringify({
  tabelas: Object.keys(linhas).length, linhas: totalLinhas, arquivos: arquivos.length,
}));
console.log(`Banco: ${Object.keys(linhas).length} tabelas, ${totalLinhas} linhas, ${mb(banco["data.sql"].bytes)} de dados`);
console.log(`Arquivos: ${arquivos.length} em ${buckets.length} pastas, ${mb(totalArquivos)}`);
