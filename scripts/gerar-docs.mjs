// Gera os documentos em Markdown da pasta docs/ a partir do código do ERP (a fonte da verdade).
// Rodar na raiz do repositório:  npx tsx scripts/gerar-docs.mjs
//
// Cada documento tem o seu gerador em scripts/docs/ e todos usam scripts/docs/base.mjs, que lê o menu
// (src/lib/menu.ts), as telas (src/lib/modulos.ts e src/lib/modulosDetalhe.ts), as permissões
// (src/lib/permissoes.ts) e os processos (src/lib/esquemas.ts). No fim sai o docs/README.md com a lista.
// O repositório é público: os documentos explicam o ERP e não levam dados da empresa.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { COMANDO, RAIZ, documento } from "./docs/base.mjs";
import { gerarModulos } from "./docs/modulos.mjs";
import { gerarGuiaPorPerfil } from "./docs/guia-por-perfil.mjs";

const modulos = gerarModulos();
const docs = [modulos, gerarGuiaPorPerfil(modulos)];

const pasta = join(RAIZ, "docs");
mkdirSync(pasta, { recursive: true });
for (const doc of docs) {
  writeFileSync(join(pasta, doc.arquivo), doc.texto);
  console.log(`docs/${doc.arquivo}: ${doc.texto.split("\n").length} linhas`);
}

const indice = documento();
indice.push("# Documentos do ERP Line", "");
indice.push(`> Gerado com o comando \`${COMANDO}\`, junto com os documentos abaixo. Não edite à mão.`, "");
indice.push("Documentos em português simples para a equipe ler e compartilhar. Todos saem do código do ERP, então ficam iguais ao sistema.", "");
for (const doc of docs) indice.push(`- [${doc.titulo}](${doc.arquivo}): ${doc.sobre}`);
writeFileSync(join(pasta, "README.md"), indice.texto());
console.log("docs/README.md: índice");
