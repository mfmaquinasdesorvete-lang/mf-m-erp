// Trava de publicação durante a cópia do banco: enquanto o backup copia a estrutura e os dados, nenhum chat publica
// mudança no banco (uma coluna nova no meio da cópia fez a restauração de 23/10 falhar). Usa a mesma trava dos chats
// (publicacao_comecar / publicacao_terminar); se outro chat estiver publicando, espera e tenta de novo.
// Uso: node trava.mjs pegar <arquivo onde guardar o id>   |   node trava.mjs soltar <arquivo com o id>
import { readFile, writeFile } from "node:fs/promises";
import { cabecalhos, chaveServico, URL_PROJETO } from "./comum.mjs";

const [acao, arquivo] = process.argv.slice(2);
const h = { ...cabecalhos(await chaveServico()), "Content-Type": "application/json" };
const rpc = (nome, corpo) => fetch(`${URL_PROJETO}/rest/v1/rpc/${nome}`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
const ESPERA = 30_000, TENTATIVAS = 40; // até 20 minutos (a trava de quem sumiu vence sozinha em 20)

if (acao === "pegar") {
  for (let i = 1; i <= TENTATIVAS; i++) {
    const r = await rpc("publicacao_comecar", { p_chat: "Backup diário", p_o_que: "cópia do banco (estrutura e dados)" });
    if (r.ok) {
      await writeFile(arquivo, String(await r.json()));
      console.log("Trava de publicação: pegou");
      process.exit(0);
    }
    const msg = await r.text();
    if (!/Outro chat est/.test(msg)) throw new Error(`trava de publicação: HTTP ${r.status}`);
    console.log(`Trava de publicação: outro chat publicando, tentativa ${i} de ${TENTATIVAS}`);
    await new Promise((ok) => setTimeout(ok, ESPERA));
  }
  // não deixa de fazer o backup: copia assim mesmo e o teste de restauração mostra se deu problema
  console.log("::warning::Trava de publicação ocupada há 20 minutos: copiando sem a trava");
  process.exit(0);
}

if (acao === "soltar") {
  const id = (await readFile(arquivo, "utf8").catch(() => "")).trim().replace(/"/g, "");
  if (!id) process.exit(0);
  const r = await rpc("publicacao_terminar", { p_id: id });
  console.log(`Trava de publicação: ${r.ok ? "solta" : `não soltou (HTTP ${r.status}; vence sozinha em 20 minutos)`}`);
}
