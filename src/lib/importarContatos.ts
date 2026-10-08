// Lê uma planilha de clientes / fornecedores / transportadoras (.xlsx, .xls ou .csv) exportada do Tiny,
// de outro sistema ou do próprio ERP (botão Exportar) e converte para importar_contatos.
// As colunas são reconhecidas pelo nome do cabeçalho, sem depender da ordem.

export type TipoContato = "cliente" | "fornecedor" | "transportadora";
export type ContatoImportado = {
  id_externo: string; nome: string; fantasia: string; tipo_pessoa: string; cpf_cnpj: string; ie: string; contribuinte: string;
  email: string; fone: string; celular: string; cep: string; endereco: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string; obs: string; tipos: TipoContato[];
};
export type LeituraContatos = {
  itens: ContatoImportado[];
  ignorados: { linha: number; motivo: string }[];
  colunas: { campo: string; cabecalho: string }[];
};

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();
const txt = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** Campo -> nomes de coluna aceitos (já sem acento e em minúsculas). A ordem decide empates ("nome fantasia" antes de "nome"). */
const COLUNAS: [keyof ContatoImportado | "situacao" | "ignorar", string[]][] = [
  ["ignorar", ["ie isento", "codigo", "cod", "data de cadastro", "data cadastro", "recebe avisos por e mail", "limite de credito", "pessoa de contato"]],
  ["id_externo", ["id", "id tiny", "id externo"]],
  ["fantasia", ["nome fantasia", "fantasia", "apelido"]],
  ["nome", ["razao social", "nome razao social", "nome completo", "nome", "cliente", "fornecedor", "transportadora"]],
  ["tipo_pessoa", ["tipo pessoa", "tipo de pessoa", "pessoa", "tipo"]],
  ["cpf_cnpj", ["cnpj cpf", "cpf cnpj", "cnpj", "cpf", "documento", "cpf ou cnpj"]],
  ["ie", ["inscricao estadual", "ie rg", "insc estadual", "ie"]],
  ["contribuinte", ["contribuinte icms", "contribuinte", "indicador ie", "indicador de ie"]],
  ["email", ["e mail", "email", "e mail principal"]],
  ["celular", ["celular", "whatsapp", "whats", "fone celular"]],
  ["fone", ["fone", "telefone", "tel", "fone comercial"]],
  ["cep", ["cep"]],
  ["endereco", ["endereco", "logradouro", "rua"]],
  ["numero", ["numero", "nro", "n"]],
  ["complemento", ["complemento"]],
  ["bairro", ["bairro"]],
  ["cidade", ["cidade", "municipio"]],
  ["uf", ["uf", "estado"]],
  ["obs", ["observacoes", "observacao", "obs"]],
  ["tipos", ["tipos de contatos", "tipos de contato", "tipo de contato", "tipo contato", "tipos"]],
  ["situacao", ["situacao", "status"]],
];

function campoDoCabecalho(cab: string): string | null {
  const h = sem(cab);
  if (!h) return null;
  for (const [campo, nomes] of COLUNAS) if (nomes.some((n) => h === n)) return campo;
  for (const [campo, nomes] of COLUNAS) if (nomes.some((n) => n.length > 2 && h.startsWith(n + " "))) return campo;
  return null;
}

const UFS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
  goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB",
  parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
const uf = (v: unknown) => { const s = sem(v); return UFS[s] ?? (s.length === 2 ? s.toUpperCase() : txt(v)); };

/** "1", "1 - Contribuinte", "Não contribuinte (consumidor final)", "Isento de inscrição" -> 1 / 9 / 2 */
function contribuinte(v: unknown) {
  const s = sem(v);
  const n = s.match(/^[129]\b/);
  if (n) return n[0];
  if (/^nao contrib/.test(s)) return "9";
  if (/isent/.test(s)) return "2";
  return /contrib/.test(s) ? "1" : "";
}

/** Planilhas guardam CPF/CNPJ/CEP como número e perdem o zero da frente. */
function digitos(v: unknown, tamanhos: number[]) {
  const d = txt(v).replace(/\.0+$/, "").replace(/\D/g, "");
  for (const t of tamanhos) if (d.length === t - 1) return "0" + d;
  return d;
}

export function tiposDoTexto(v: unknown, padrao: TipoContato): TipoContato[] | null {
  const s = sem(v);
  if (!s) return [padrao];
  const tipos = [
    /client/.test(s) && "cliente",
    /fornec/.test(s) && "fornecedor",
    /transport/.test(s) && "transportadora",
  ].filter(Boolean) as TipoContato[];
  return tipos.length ? tipos : null; // só vendedor/funcionário etc.: não entra
}

export function converterContatos(linhas: unknown[][], padrao: TipoContato): LeituraContatos {
  // o cabeçalho é a primeira linha (até a 10ª) que tem uma coluna de nome
  const iCab = linhas.slice(0, 10).findIndex((l) => l.some((c) => ["nome", "razao social"].includes(campoDoCabecalho(String(c ?? "")) ?? "") || campoDoCabecalho(String(c ?? "")) === "fantasia"));
  if (iCab < 0) throw new Error("Não achei a coluna com o nome (Nome ou Razão social) nas primeiras linhas da planilha.");
  const cab = linhas[iCab].map((c) => String(c ?? ""));
  const mapa = new Map<string, number>();
  cab.forEach((c, i) => {
    const campo = campoDoCabecalho(c);
    if (campo && campo !== "ignorar" && !mapa.has(campo)) mapa.set(campo, i);
  });
  const col = (r: unknown[], campo: string) => (mapa.has(campo) ? r[mapa.get(campo)!] : "");

  const itens: ContatoImportado[] = [];
  const ignorados: LeituraContatos["ignorados"] = [];
  linhas.slice(iCab + 1).forEach((r, k) => {
    const linha = iCab + k + 2;
    if (!r.some((c) => txt(c))) return;
    const fantasia = txt(col(r, "fantasia"));
    const nome = txt(col(r, "nome")) || fantasia;
    if (!nome) { ignorados.push({ linha, motivo: "sem nome" }); return; }
    if (/exclu/i.test(txt(col(r, "situacao")))) { ignorados.push({ linha, motivo: `${nome}: excluído` }); return; }
    const tipos = tiposDoTexto(col(r, "tipos"), padrao);
    if (!tipos) { ignorados.push({ linha, motivo: `${nome}: não é cliente, fornecedor nem transportadora` }); return; }
    const doc = digitos(col(r, "cpf_cnpj"), [11, 14]);
    const p = sem(col(r, "tipo_pessoa"));
    const tipoPessoa = doc.length === 11 ? "F" : doc.length === 14 ? "J"
      : /fisic|^f$|^pf$/.test(p) ? "F" : /jurid|^j$|^pj$/.test(p) ? "J" : "";
    const ie = txt(col(r, "ie"));
    itens.push({
      id_externo: txt(col(r, "id_externo")).replace(/\.0+$/, ""),
      nome, fantasia: fantasia === nome ? "" : fantasia, tipo_pessoa: tipoPessoa, cpf_cnpj: doc,
      // pessoa física: a coluna "IE / RG" do Tiny costuma trazer o RG
      ie: tipoPessoa === "F" && !/^isent/i.test(ie) ? "" : ie,
      contribuinte: contribuinte(col(r, "contribuinte")),
      email: txt(col(r, "email")).split(/[;, ]+/)[0] ?? "",
      fone: txt(col(r, "fone")), celular: txt(col(r, "celular")),
      cep: digitos(col(r, "cep"), [8]), endereco: txt(col(r, "endereco")), numero: txt(col(r, "numero")).replace(/\.0+$/, ""),
      complemento: txt(col(r, "complemento")), bairro: txt(col(r, "bairro")), cidade: txt(col(r, "cidade")),
      uf: uf(col(r, "uf")), obs: txt(col(r, "obs")), tipos,
    });
  });
  const colunas = [...mapa.entries()].map(([campo, i]) => ({ campo, cabecalho: cab[i] }));
  return { itens, ignorados, colunas };
}

/** Abre o arquivo (a biblioteca de planilhas só é baixada quando alguém importa). */
export async function lerPlanilhaContatos(arquivo: File, padrao: TipoContato): Promise<LeituraContatos> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", codepage: 1252 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw: CPF/CNPJ vêm como número inteiro (sem virar "1,23E+13")
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  return converterContatos(linhas, padrao);
}
