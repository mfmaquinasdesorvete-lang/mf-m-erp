// Cliente da API v2 do Tiny / Olist ERP e conversão para os campos do ERP Line.
// Secret: TINY_API_TOKEN (Tiny → Configurações → Token API).
// O Tiny limita as consultas por minuto (o limite vem no header x-limit-api): as chamadas são espaçadas.

const BASE = "https://api.tiny.com.br/api2/";

export const tinyToken = () => Deno.env.get("TINY_API_TOKEN")?.replace(/\s+/g, "") || null;

/** codigo: código de erro do Tiny (2 token inválido, 6/11 excesso de consultas, 20 sem registros…). */
export class TinyErro extends Error {
  constructor(public codigo: number | null, mensagem: string) {
    super(mensagem);
  }
  get excessoDeConsultas() { return this.codigo === 6 || this.codigo === 11; }
  get tokenInvalido() { return this.codigo === 1 || this.codigo === 2 || this.codigo === 5 || this.codigo === 8; }
}

/** Espaça as chamadas para caber no limite por minuto do plano do Tiny. */
export class Ritmo {
  constructor(public limite = 30, public ultima = 0) {}
  async esperar() {
    const intervalo = 60_000 / Math.max(1, this.limite * 0.9);
    const falta = this.ultima + intervalo - Date.now();
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    this.ultima = Date.now();
  }
}

/**
 * Chama um endpoint da API v2 e devolve o `retorno`. Consulta sem registros (códigos 20/23) volta null.
 * O token vai no corpo do POST, não na URL (não aparece em logs).
 */
export async function tiny(endpoint: string, params: Record<string, string | number>, token: string, ritmo: Ritmo): Promise<any | null> {
  await ritmo.esperar();
  const corpo = new URLSearchParams({ token, formato: "json" });
  for (const [k, v] of Object.entries(params)) corpo.set(k, String(v));
  const res = await fetch(BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo,
    signal: AbortSignal.timeout(25_000),
  });
  const limite = Number(res.headers.get("x-limit-api"));
  if (limite > 0) ritmo.limite = limite;
  if (res.status === 429) throw new TinyErro(6, "limite de consultas por minuto do Tiny");
  if (!res.ok) throw new TinyErro(null, `Tiny respondeu HTTP ${res.status}`);
  const j = await res.json().catch(() => null);
  const r = j?.retorno;
  if (!r) throw new TinyErro(null, "resposta inesperada do Tiny");
  if (String(r.status).toUpperCase() === "OK") return r;
  const codigo = r.codigo_erro != null ? Number(r.codigo_erro) : null;
  if (codigo === 20 || codigo === 23) return null;
  const msg = (r.erros ?? []).map((e: any) => e?.erro ?? e).filter(Boolean).join(" | ") || `erro ${codigo ?? "desconhecido"} do Tiny`;
  throw new TinyErro(codigo, msg);
}

/* ------------------------------------ conversão ------------------------------------ */

export const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const digitos = (v: unknown) => txt(v).replace(/\D/g, "");

/** "31/12/2026" -> "2026-12-31" */
export function dataIso(v: unknown): string | null {
  const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(txt(v)) ? txt(v).slice(0, 10) : null;
}

/** HTML da descrição complementar -> texto simples para o catálogo. */
export function htmlParaTexto(html: unknown) {
  const s = String(html ?? "");
  if (!s) return "";
  return s.replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, 3000);
}

/** "30 dias", "3 meses", "1 ano" -> meses */
export function garantiaEmMeses(v: unknown): number | null {
  const s = txt(v).toLowerCase();
  const n = parseFloat(s.replace(",", "."));
  if (!s || !Number.isFinite(n)) return null;
  if (s.includes("ano")) return Math.round(n * 12);
  if (s.includes("dia")) return Math.max(1, Math.round(n / 30));
  return Math.round(n);
}

function unidadeMedida(v: unknown) {
  const u = txt(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!u || /^\d+$/.test(u) || u === "UNID" || u === "UND") return "UN";
  return u.slice(0, 6);
}

/** Classe do produto no Tiny: S simples, K kit, V com variações, F fabricado, M matéria-prima (mesma regra da planilha). */
function tipoProduto(classe: string, descricao: string, categoria: string) {
  if (classe === "F" || /^máquina|^my frost (a|top|slim|queen|prime|sb)\b/i.test(descricao) && /máquina/i.test(categoria)) return "maquina";
  if (classe === "M") return "insumo";
  if (/\bbatedor\b|acess[oó]rio/i.test(descricao + " " + categoria)) return "acessorio";
  return "peca";
}

const sim = (v: unknown) => v === true || /^s(im)?$/i.test(txt(v));

/** Produto do Tiny (produto.obter) -> item de importar_produtos. null = não entra (serviço ou agrupador de variações). */
export function produtoParaItem(p: any, saldo: number | null) {
  const descricao = txt(p?.nome);
  if (!descricao) return null;
  const classe = txt(p.classe_produto).toUpperCase();
  if (classe === "V" || txt(p.tipoVariacao).toUpperCase() === "P") return null; // o "pai" não é um item físico
  if (txt(p.tipo).toUpperCase() === "S") return null; // serviço
  const categoria = txt(p.categoria).replace(/\s*>>\s*/g, " > ");
  const foto = [
    ...(p.anexos ?? []).map((a: any) => txt(a?.anexo)),
    ...(p.imagens_externas ?? []).map((i: any) => txt(i?.imagem_externa?.url)),
  ].find((u) => /^https?:\/\//.test(u)) ?? "";
  return {
    id_externo: txt(p.id),
    sku: txt(p.codigo),
    descricao,
    tipo: tipoProduto(classe, descricao, categoria),
    unidade: unidadeMedida(p.unidade),
    ncm: digitos(p.ncm),
    cest: digitos(p.cest),
    origem: Math.min(8, Math.max(0, parseInt(txt(p.origem)) || 0)),
    preco_venda: num(p.preco),
    preco_custo: num(p.preco_custo) || num(p.preco_custo_medio),
    estoque: saldo ?? 0,
    estoque_minimo: num(p.estoque_minimo),
    estoque_maximo: num(p.estoque_maximo),
    localizacao: txt(p.localizacao),
    codigo_barras: digitos(p.gtin),
    marca: txt(p.marca),
    categoria,
    observacoes: txt(p.obs),
    descricao_catalogo: htmlParaTexto(p.descricao_complementar),
    garantia_meses: garantiaEmMeses(p.garantia),
    peso_kg: num(p.peso_bruto) || num(p.peso_liquido),
    altura_cm: num(p.alturaEmbalagem),
    largura_cm: num(p.larguraEmbalagem),
    profundidade_cm: num(p.comprimentoEmbalagem),
    sob_encomenda: sim(p.sob_encomenda),
    kit: classe === "K",
    vendavel: true,
    ativo: !/^(i|e)$/i.test(txt(p.situacao)),
    foto,
    fornecedor: txt(p.nome_fornecedor),
    codigo_fornecedor: txt(p.codigo_pelo_fornecedor),
  };
}

/** Tipos do contato no Tiny -> onde ele entra no ERP. Sem tipo informado = cliente; só vendedor/funcionário = não entra. */
export function tiposContato(c: any): string[] | null {
  const lista = (c?.tipos_contato ?? []).map((t: any) => txt(t?.tipo ?? t)).filter(Boolean);
  if (!lista.length) return ["cliente"];
  const tipos = [
    lista.some((t: string) => /cliente/i.test(t)) && "cliente",
    lista.some((t: string) => /fornecedor/i.test(t)) && "fornecedor",
    lista.some((t: string) => /transport/i.test(t)) && "transportadora",
  ].filter(Boolean) as string[];
  return tipos.length ? tipos : null;
}

/** Contato do Tiny (contato.obter ou da pesquisa) -> item de importar_contatos. null = não entra. */
export function contatoParaItem(c: any) {
  const nome = txt(c?.nome);
  if (!nome || /^e/i.test(txt(c.situacao))) return null; // excluído
  const tipos = tiposContato(c);
  if (!tipos) return null;
  return {
    id_externo: txt(c.id), nome, fantasia: txt(c.fantasia), tipo_pessoa: txt(c.tipo_pessoa).toUpperCase(),
    cpf_cnpj: digitos(c.cpf_cnpj), ie: txt(c.ie), contribuinte: txt(c.contribuinte),
    email: txt(c.email).split(/[;, ]+/)[0] ?? "", fone: txt(c.fone), celular: txt(c.celular),
    cep: txt(c.cep), endereco: txt(c.endereco), numero: txt(c.numero), complemento: txt(c.complemento),
    bairro: txt(c.bairro), cidade: txt(c.cidade), uf: txt(c.uf), obs: txt(c.obs), tipos,
  };
}

/** Conta a receber/pagar da pesquisa do Tiny -> item de importar_contas. */
export function contaParaItem(c: any) {
  return {
    id_externo: txt(c?.id), nome: txt(c?.nome_cliente ?? c?.nome_fornecedor ?? c?.cliente?.nome), historico: txt(c?.historico),
    numero_doc: txt(c?.numero_doc), emissao: dataIso(c?.data_emissao), vencimento: dataIso(c?.data_vencimento),
    valor: num(c?.valor), saldo: c?.saldo == null || txt(c.saldo) === "" ? null : num(c.saldo),
  };
}
