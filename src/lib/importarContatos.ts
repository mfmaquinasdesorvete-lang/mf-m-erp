// Lê uma planilha de clientes / fornecedores / transportadoras (.xlsx, .xls ou .csv) exportada do Tiny,
// de outro sistema ou do próprio ERP (botão Exportar) e converte para importar_contatos.
// As colunas são reconhecidas pelo nome do cabeçalho, sem depender da ordem.
import { dataDoCodigo } from "../../supabase/functions/_shared/compra-maquina";
import { abrirPlanilha } from "./planilha";

export type TipoContato = "cliente" | "fornecedor" | "transportadora";
export type ContatoImportado = {
  id_externo: string; nome: string; fantasia: string; tipo_pessoa: string; cpf_cnpj: string; ie: string; contribuinte: string;
  email: string; fone: string; celular: string; cep: string; endereco: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string; obs: string; tipos: TipoContato[];
  /** mês/ano da compra da máquina (AAAA-MM-DD); no Tiny ficava no "Código" do contato */
  compra_maquina: string;
  /** campos do cadastro do Tiny que antes ficavam de fora (vazio = a planilha não tinha) */
  cadastro_em: string; site: string; fone2: string; email_nfe: string; im: string; suframa: string; crt: string;
  nascimento: string; limite_credito: string; pessoas_contato: string; vendedor: string;
  cob_cep: string; cob_endereco: string; cob_numero: string; cob_complemento: string; cob_bairro: string; cob_cidade: string; cob_uf: string;
};
export type LeituraContatos = {
  itens: ContatoImportado[];
  ignorados: { linha: number; motivo: string }[];
  colunas: { campo: string; cabecalho: string }[];
  /** colunas da planilha que o ERP não usa (para conferir se ficou algo de fora) */
  naoUsadas: string[];
};

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();
const txt = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** Campo -> nomes de coluna aceitos (já sem acento e em minúsculas). A ordem decide empates ("nome fantasia" antes de "nome"). */
const COLUNAS: [keyof ContatoImportado | "situacao" | "ignorar", string[]][] = [
  ["compra_maquina", ["codigo", "cod", "compra da maquina", "data de compra da maquina"]],
  ["ignorar", ["ie isento", "recebe avisos por e mail"]],
  ["cadastro_em", ["data de cadastro", "data cadastro", "data de criacao", "data criacao", "data de inclusao", "cliente desde", "cadastrado em"]],
  ["id_externo", ["id", "id tiny", "id externo"]],
  ["fantasia", ["nome fantasia", "fantasia", "apelido"]],
  ["vendedor", ["vendedor", "nome do vendedor", "representante"]],
  ["nome", ["razao social", "nome razao social", "nome completo", "nome", "cliente", "fornecedor", "transportadora"]],
  ["tipo_pessoa", ["tipo pessoa", "tipo de pessoa", "pessoa", "tipo"]],
  ["cpf_cnpj", ["cnpj cpf", "cpf cnpj", "cnpj", "cpf", "documento", "cpf ou cnpj"]],
  ["im", ["inscricao municipal", "insc municipal", "im"]],
  ["suframa", ["inscricao suframa", "suframa"]],
  ["ie", ["inscricao estadual", "ie rg", "insc estadual", "ie"]],
  ["contribuinte", ["contribuinte icms", "contribuinte", "indicador ie", "indicador de ie"]],
  ["crt", ["regime tributario", "codigo de regime tributario", "crt"]],
  ["email_nfe", ["e mail para envio nfe", "e mail para envio da nfe", "e mail para envio nf e", "e mail nfe", "email nfe", "e mail para nf e", "e mail nf e"]],
  ["email", ["e mail", "email", "e mail principal"]],
  ["celular", ["celular", "whatsapp", "whats", "fone celular"]],
  ["fone2", ["fax", "fone 2", "telefone 2", "telefone adicional", "fone adicional"]],
  ["fone", ["fone", "telefone", "tel", "fone comercial"]],
  ["site", ["web site", "website", "site", "home page"]],
  ["nascimento", ["data nascimento", "data de nascimento", "nascimento"]],
  ["limite_credito", ["limite de credito", "limite credito"]],
  ["pessoas_contato", ["pessoa de contato", "pessoas de contato", "pessoas contato", "contatos"]],
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

/** Endereço de cobrança: "Endereço cobrança", "CEP de cobrança", "UF cobrança"… -> cob_<campo>. */
const COBRANCA: Record<string, keyof ContatoImportado> = {
  cep: "cob_cep", endereco: "cob_endereco", logradouro: "cob_endereco", numero: "cob_numero", complemento: "cob_complemento",
  bairro: "cob_bairro", cidade: "cob_cidade", municipio: "cob_cidade", uf: "cob_uf", estado: "cob_uf",
};

function campoDoCabecalho(cab: string): string | null {
  const h = sem(cab);
  if (!h) return null;
  if (/\bcobranca\b/.test(h)) {
    const base = h.replace(/\b(de|da|para)?\s*cobranca\b/, "").trim();
    return COBRANCA[base] ?? null;
  }
  // "E-mail para envio NFe" e parecidos não podem cair no e-mail principal
  if (/^e ?mail\b/.test(h) && /\bnf ?e\b/.test(h)) return "email_nfe";
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

/** "31/12/2020", "31/12/2020 10:15:00", "2020-12-31" ou número de série do Excel -> "2020-12-31"; o resto -> "". */
export function dataPlanilha(v: unknown): string {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = txt(v);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const [a, m, d] = br ? [+br[3], +br[2], +br[1]] : iso ? [+iso[1], +iso[2], +iso[3]] : [0, 0, 0];
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(a, m, 0)).getUTCDate()) return "";
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1.500,00", "1500.5", 1500 -> "1500.00"; vazio ou zero -> "". */
function valorPlanilha(v: unknown): string {
  if (typeof v === "number") return v > 0 ? v.toFixed(2) : "";
  const s = txt(v).replace(/[^\d,.-]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "";
}

/** Regime tributário (CRT): "1", "3 - Regime normal", "Simples Nacional" -> "1" / "2" / "3". */
function crt(v: unknown): string {
  const s = sem(v);
  const n = /^[123]\b/.exec(s);
  if (n) return n[0];
  if (/excesso/.test(s)) return "2";
  if (/simples/.test(s)) return "1";
  return /normal|real|presumido/.test(s) ? "3" : "";
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

/** "08/2023 - 05/2023": no Tiny alguém pôs datas (mês/ano) no nome fantasia; isso não é nome. */
export const soDatas = (s: string) => /^\s*\d{1,2}\/\d{2,4}(\s*[-–,;/e]\s*\d{1,2}\/\d{2,4})*\s*$/.test(s);

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
  const usadas = new Set(mapa.values());
  const naoUsadas = cab.filter((c, i) => txt(c) && !usadas.has(i) && campoDoCabecalho(c) !== "ignorar").map(txt);

  const itens: ContatoImportado[] = [];
  const ignorados: LeituraContatos["ignorados"] = [];
  linhas.slice(iCab + 1).forEach((r, k) => {
    const linha = iCab + k + 2;
    if (!r.some((c) => txt(c))) return;
    const fantasiaLida = txt(col(r, "fantasia"));
    // datas no nome fantasia vão para as observações (não se perdem)
    const datasFantasia = soDatas(fantasiaLida) ? fantasiaLida : "";
    const fantasia = datasFantasia ? "" : fantasiaLida;
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
      uf: uf(col(r, "uf")), tipos,
      obs: [txt(col(r, "obs")), datasFantasia && `Datas que estavam no nome fantasia (vindas do Tiny): ${datasFantasia}`].filter(Boolean).join("\n"),
      compra_maquina: dataDoCodigo(col(r, "compra_maquina")),
      cadastro_em: dataPlanilha(col(r, "cadastro_em")), site: txt(col(r, "site")), fone2: txt(col(r, "fone2")),
      email_nfe: txt(col(r, "email_nfe")).split(/[;, ]+/)[0] ?? "", im: txt(col(r, "im")), suframa: txt(col(r, "suframa")),
      crt: crt(col(r, "crt")), nascimento: tipoPessoa === "J" ? "" : dataPlanilha(col(r, "nascimento")),
      limite_credito: valorPlanilha(col(r, "limite_credito")), pessoas_contato: txt(col(r, "pessoas_contato")), vendedor: txt(col(r, "vendedor")),
      cob_cep: digitos(col(r, "cob_cep"), [8]), cob_endereco: txt(col(r, "cob_endereco")), cob_numero: txt(col(r, "cob_numero")).replace(/\.0+$/, ""),
      cob_complemento: txt(col(r, "cob_complemento")), cob_bairro: txt(col(r, "cob_bairro")), cob_cidade: txt(col(r, "cob_cidade")),
      cob_uf: txt(col(r, "cob_uf")) ? uf(col(r, "cob_uf")) : "",
    });
  });
  const colunas = [...mapa.entries()].map(([campo, i]) => ({ campo, cabecalho: cab[i] }));
  return { itens, ignorados, colunas, naoUsadas };
}

/** Abre o arquivo (a biblioteca de planilhas só é baixada quando alguém importa). */
export async function lerPlanilhaContatos(arquivo: File, padrao: TipoContato): Promise<LeituraContatos> {
  const XLSX = await import("xlsx");
  // CSV como texto puro: o "Código" 05/21 não vira data e o CPF não perde o zero
  const wb = await abrirPlanilha(XLSX, arquivo, { textoCru: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw: CPF/CNPJ vêm como número inteiro (sem virar "1,23E+13")
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  return converterContatos(linhas, padrao);
}
