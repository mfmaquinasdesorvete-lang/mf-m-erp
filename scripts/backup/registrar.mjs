// Guarda as partes do backup criptografado no bucket "backups", apaga as de mais de 7 dias e registra no ERP.
// Uso: node registrar.mjs ok <pasta com parte-000…> <nome>   |   node registrar.mjs erro
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { cabecalhos, chaveServico, mb, sha256Arquivo, URL_PROJETO } from "./comum.mjs";

const [modo, pasta, nome] = process.argv.slice(2);
const k = await chaveServico();
const h = cabecalhos(k);
const execucao = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const lerJson = async (p) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } };

async function registrar(linha) {
  const r = await fetch(`${URL_PROJETO}/rest/v1/backups_registro`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(linha),
  });
  if (!r.ok) throw new Error(`registrar no ERP: HTTP ${r.status}`);
}

if (modo === "erro") {
  await registrar({ status: "erro", detalhe: `O backup de hoje falhou no GitHub: ${execucao}` });
  process.exit(0);
}

const base = process.env.BACKUP_DIR ? join(process.env.BACKUP_DIR, "..") : pasta;
const resumo = (await lerJson(join(base, "resumo.json"))) ?? {};
const teste = await lerJson(join(base, "restauracao.json"));

// partes no bucket
const partes = (await readdir(pasta)).filter((f) => f.startsWith("parte-")).sort();
for (const p of partes) {
  const corpo = await readFile(join(pasta, p));
  const r = await fetch(`${URL_PROJETO}/storage/v1/object/backups/${nome}/${p}`, {
    method: "POST", headers: { ...h, "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: corpo,
  });
  if (!r.ok) throw new Error(`enviar ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
}
const inteiro = join(pasta, `${nome}.tar.gz.gpg`);
const tamanho = (await stat(inteiro)).size;
const sha256 = await sha256Arquivo(inteiro);

await registrar({
  status: "ok", pasta: nome, partes: partes.length, tamanho, sha256,
  tabelas: resumo.tabelas ?? null, linhas: resumo.linhas ?? null, arquivos: resumo.arquivos ?? null,
  restauracao_ok: teste ? !!teste.ok : null,
  detalhe: teste && !teste.ok ? `Teste de restauração: ${teste.motivo ?? `${teste.diferentes} tabela(s) com contagem diferente`}. ${execucao}` : null,
});
console.log(`Guardado: ${nome} (${partes.length} parte(s), ${mb(tamanho)})${teste ? `, restauração ${teste.ok ? "OK" : "com problema"}` : ""}`);

// guarda 7 dias no Supabase (a Hostinger guarda 30 + 1 por mês)
const r = await fetch(`${URL_PROJETO}/storage/v1/object/list/backups`, {
  method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 1000, offset: 0 }),
});
const pastas = r.ok ? (await r.json()).filter((x) => x.id === null && /^erp-\d{4}-\d{2}-\d{2}$/.test(x.name)).map((x) => x.name) : [];
const limite = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
for (const antiga of pastas.filter((p) => p.slice(4) < limite)) {
  const l = await fetch(`${URL_PROJETO}/storage/v1/object/list/backups`, {
    method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: antiga, limit: 1000, offset: 0 }),
  });
  const arquivos = l.ok ? (await l.json()).map((x) => `${antiga}/${x.name}`) : [];
  if (arquivos.length) {
    await fetch(`${URL_PROJETO}/storage/v1/object/backups`, {
      method: "DELETE", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: arquivos }),
    });
  }
}
