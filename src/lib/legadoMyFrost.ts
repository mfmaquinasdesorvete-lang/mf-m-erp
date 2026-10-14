// Backup do Tiny da My Frost Máquinas (a empresa anterior) → base de assistência e peças da MF.
// Lê a planilha consolidada (abas Contatos, Pedidos_venda_itens, Propostas e Produtos) e monta, por cliente:
//  * as máquinas que ele tem: pedidos entregues/faturados, propostas concluídas (muitas vendas só estão nelas) e as
//    etiquetas de modelo do cadastro ("MF - A 200"); proposta e pedido do mesmo modelo em até 120 dias = a mesma máquina;
//  * as peças e acessórios que comprou (data, item e quantidade, sem valores);
// e, à parte, as peças da My Frost que o catálogo da MF ainda não tem, com "compatível com máquinas My Frost" no nome.
// Valores de venda, notas fiscais, contas e caixa da My Frost ficam de fora: são de outro CNPJ.

export const ORIGEM = "My Frost";
// etiquetas do cadastro (chaves de tipos_contato); "parceiro" é a de técnico parceiro que o ERP já tem
export const TAG_HISTORICO = "my_frost";
export const TAG_DONO = "dono_my_frost";
export const TAG_TECNICO = "parceiro";
export const TIPOS_MYFROST = [
  { chave: TAG_HISTORICO, nome: "My Frost (histórico)", cor: "amber", ordem: 20 },
  { chave: TAG_DONO, nome: "Dono de máquina My Frost", cor: "sky", ordem: 21 },
];
export const SUFIXO_COMPATIVEL = "compatível com máquinas My Frost";
const JANELA_MESMA_MAQUINA = 120; // dias entre a proposta e o pedido da mesma máquina

export type MaquinaLegado = { ref: string; modelo: string; descricao: string; data: string | null; obs: string };
export type CompraLegado = { ref: string; data: string | null; documento: string; descricao: string; quantidade: number };
export type ClienteLegado = {
  ref: string; nome: string; fantasia: string; tipo_pessoa: "PF" | "PJ"; cpf_cnpj: string; ie: string; contribuinte: 1 | 2 | 9;
  email: string; telefone: string; celular: string; cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; municipio: string; uf: string; obs: string; tags: string[];
  grupo: "maquina" | "pecas" | "tecnico"; maquinas: MaquinaLegado[]; compras: CompraLegado[];
};
export type PecaLegado = {
  ref: string; sku: string; nome_original: string; descricao: string; unidade: string; ncm: string; origem: number;
  preco_venda: number; preco_custo: number; peso_kg: number; largura_cm: number; altura_cm: number; profundidade_cm: number;
  codigo_fabricante: string; vendas: number; ultima_venda: string | null; parecida: string | null;
};
export type LeituraLegado = {
  clientes: ClienteLegado[];
  pecas: PecaLegado[];
  maquinasPorModelo: [string, number][];
  foraDaImportacao: { rotulo: string; quantidade: number }[];
};
type Linha = Record<string, unknown>;

const txt = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const sem = (v: unknown) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const so = (v: unknown) => txt(v).replace(/\.0+$/, "").replace(/\D/g, "");
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = txt(v);
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
/** "18/06/2021", Date ou número de série do Excel -> "2021-06-18" */
function data(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = txt(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}
const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");

// ---------------------------------------------------------------------------------------------------------------
// Modelos de máquina
// ---------------------------------------------------------------------------------------------------------------
const NOME_MODELO: [RegExp, string][] = [
  [/^a\s*200\s*(plus|p)$/, "A 200 Plus"], [/^a\s*200$/, "A 200"], [/^a\s*100$/, "A 100"], [/^top\s*300$/, "Top 300"],
  [/^top\s*200$/, "Top 200"], [/^slim$/, "Slim"], [/^quee[nm]$/, "Queen"], [/^p\s*765$/, "P 765"], [/^p\s*313$/, "P 313"],
  [/^p\s*386$/, "P 386"], [/^prime$/, "Prime"], [/^s\s*430$/, "S 430"], [/^(sb|sb\s*\/\s*asb|asb)$/, "SB"], [/^unic$/, "Unic"],
];
const nomeModelo = (s: string) => NOME_MODELO.find(([re]) => re.test(s.trim()))?.[1] ?? null;
const PECA = /\b(kit|anel|vedac|batedor|apoio|cubo|pistao|sanfona|pa|alavanca|redutor|mecanica|oring|manipulo|dosador)\b/;

/** "My Frost TOP 300 - Máquina de Sorvete…" -> "Top 300"; peça ou outro produto -> null. */
export function modeloMaquina(descricao: unknown): string | null {
  const d = sem(descricao);
  const m = d.match(/^my\s*frost\s*(a\s*100|a\s*200(?:\s*plus)?|top\s*[23]00|slim|queen|p\s*765|p\s*313|p\s*386|prime|s\s*430|sb|unic)\b/);
  if (!m || PECA.test(d)) return null;
  return nomeModelo(m[1]);
}

/** Etiquetas do cadastro no Tiny ("MF - A 200|MF - Top 300|Usada") -> modelos. */
export function modelosDasEtiquetas(tipos: unknown): string[] {
  return [...new Set(txt(tipos).split("|").map((t) => sem(t).match(/^mf\s*-\s*(.+)$/)?.[1] ?? "").map(nomeModelo).filter(Boolean) as string[])];
}

// ---------------------------------------------------------------------------------------------------------------
// Nome das peças: a marca vira "compatível com máquinas My Frost"
// ---------------------------------------------------------------------------------------------------------------
export function nomeCompativel(nome: string, max = 120): string {
  const original = txt(nome);
  if (/compat[ií]vel com m[aá]quinas my\s*frost/i.test(original)) return original;
  let s = original
    .replace(/\bexclusiv[oa]s?\s+my\s*frost\b/gi, "")
    .replace(/\bmy\s*frost\s+para\s+(?:a\s+|as\s+)?m[aá]quinas?(?:\s+de\s+sorvete)?\b/gi, "")
    .replace(/\b(?:d[aoe]s?|para|p\/)\s+(?:a\s+|as\s+)?(?:m[aá]quinas?(?:\s+de\s+sorvete)?\s+)?my\s*frost(?:\s+m[aá]quinas)?\b/gi, "")
    .replace(/\bmy\s*frost(?:\s+m[aá]quinas)?\b/gi, "")
    .replace(/\s+([,;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*[-–](\s*[-–])+\s*/g, " - ") // "Cachorrinho -  - Furação" -> "Cachorrinho - Furação"
    .replace(/\s+[-–]\s+\(/g, " (")           // "Pistão - (1uni)" -> "Pistão (1uni)"
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–,;:]+|[\s\-–,;:/]+$/g, "")
    .trim();
  if (!s) s = "Peça";
  const fim = ` - ${SUFIXO_COMPATIVEL}`;
  if (s.length + fim.length > max) s = s.slice(0, max - fim.length).replace(/[\s\-–,;:/]+$/, "");
  return s + fim;
}

// ---------------------------------------------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------------------------------------------
const PEDIDO_VALIDO = /^(entregue|enviado|faturado|preparando envio|pronto para envio)$/;
const PROPOSTA_VALIDA = /^conclu/;
const NAO_E_PRODUTO = /\b(taxa|frete|icms|moveis|balcao com gabinete)\b/;

type Evento = { data: string | null; qtd: number; doc: string };
type Base = { contato?: Linha; venda?: Linha; ids: Set<string>; doc: string; eventos: Map<string, { pedidos: Evento[]; propostas: Evento[] }>; compras: CompraLegado[]; tags: string[] };

/** Contato do Tiny (ou os dados do próprio pedido/proposta, quando o contato foi apagado) -> cadastro do ERP. */
function cadastro(b: Base): Omit<ClienteLegado, "ref" | "obs" | "tags" | "grupo" | "maquinas" | "compras"> {
  const c = b.contato;
  const v = b.venda ?? {};
  // o contato do Tiny vale primeiro; o que estiver vazio nele vem do pedido ou da proposta
  const g = (campoContato: string, campoVenda: string) => txt(c?.[campoContato]) || txt(v[campoVenda]);
  const doc = b.doc;
  const tipo: "PF" | "PJ" = doc.length === 11 ? "PF" : doc.length === 14 ? "PJ" : /fisic/.test(sem(c?.["Tipo pessoa"] ?? v["Tipo de Pessoa"])) ? "PF" : "PJ";
  const ieBruta = g("IE / RG", "RG/IE");
  const ie = tipo === "PF" && !/^isent/i.test(ieBruta) ? "" : ieBruta;
  const contrib = txt(c?.["Contribuinte"]);
  const contribuinte: 1 | 2 | 9 = contrib === "1" ? 1 : contrib === "2" ? 2 : contrib === "9" ? 9 : tipo === "PJ" && /\d{5,}/.test(ie) ? 1 : 9;
  const cep = so(g("CEP", "CEP"));
  return {
    nome: g("Nome", "Nome do contato"), fantasia: txt(c?.["Fantasia"]), tipo_pessoa: tipo, cpf_cnpj: doc, ie, contribuinte,
    email: (txt(c?.["E-mail"]) || txt(v["e-mail"]) || txt(v["E-mail"])).split(/[;, ]+/)[0] ?? "",
    telefone: g("Fone", "Fone"), celular: g("Celular", "Celular"),
    cep: cep.length === 7 ? "0" + cep : cep, logradouro: g("Endereço", "Endereço"), numero: g("Número", "Endereço Nro").replace(/\.0+$/, ""),
    complemento: g("Complemento", "Complemento"), bairro: g("Bairro", "Bairro"), municipio: g("Cidade", "Município"),
    uf: g("Estado", "UF").toUpperCase().slice(0, 2),
  };
}

const preenchidos = (l: Linha) => Object.values(l).filter((x) => txt(x)).length;

/** Monta tudo a partir das abas já lidas (cada aba = lista de linhas com o cabeçalho como chave). */
export function montarLegado(abas: Record<string, Linha[]>, catalogo: { sku: string | null; descricao: string }[] = []): LeituraLegado {
  const contatos = abas["Contatos"] ?? [];
  const pedidos = abas["Pedidos_venda_itens"] ?? [];
  const propostas = abas["Propostas"] ?? [];
  const produtos = abas["Produtos"] ?? [];
  if (!contatos.length || (!pedidos.length && !propostas.length)) {
    throw new Error("A planilha precisa das abas Contatos e Pedidos_venda_itens (ou Propostas) do backup do Tiny da My Frost.");
  }

  // um cliente por CPF/CNPJ (o Tiny tinha o mesmo cliente em mais de um contato); sem documento, pelo ID do contato
  const bases = new Map<string, Base>();
  const chaveDoContato = new Map<string, string>();
  const nova = (doc: string): Base => ({ ids: new Set(), doc, eventos: new Map(), compras: [], tags: [] });
  for (const c of contatos) {
    const id = txt(c["ID"]);
    if (!id) continue;
    const doc = so(c["CNPJ / CPF"]);
    const chave = doc.length === 11 || doc.length === 14 ? `doc:${doc}` : `id:${id}`;
    const b = bases.get(chave) ?? nova(chave.startsWith("doc:") ? doc : "");
    b.ids.add(id);
    if (!b.contato || preenchidos(c) > preenchidos(b.contato)) b.contato = c;
    b.tags.push(...txt(c["Tipos de Contatos"]).split("|").map(txt).filter(Boolean));
    bases.set(chave, b);
    chaveDoContato.set(id, chave);
  }
  const baseDaVenda = (l: Linha) => {
    const id = txt(l["ID contato"]);
    const doc = so(l["CPF/CNPJ"]);
    let chave = chaveDoContato.get(id) ?? (doc.length === 11 || doc.length === 14 ? `doc:${doc}` : `id:${id}`);
    if (!bases.has(chave) && doc.length >= 11 && bases.has(`doc:${doc}`)) chave = `doc:${doc}`;
    const b = bases.get(chave) ?? nova(chave.startsWith("doc:") ? doc : "");
    b.ids.add(id);
    if (!b.venda) b.venda = l;
    bases.set(chave, b);
    chaveDoContato.set(id, chave);
    return b;
  };
  const evento = (b: Base, modelo: string) => {
    const e = b.eventos.get(modelo) ?? { pedidos: [], propostas: [] };
    b.eventos.set(modelo, e);
    return e;
  };

  // pedidos: máquinas e peças
  const foraPedidos = { abertos: 0, cancelados: 0 };
  const vendasPorProduto = new Map<string, { n: number; ultima: string | null }>();
  const porPedido = new Map<string, number>();
  for (const l of pedidos) {
    const situacao = sem(l["Situação"]);
    const numero = txt(l["Número do pedido"]);
    const d = data(l["Data"]);
    const desc = txt(l["Descrição"]);
    if (!PEDIDO_VALIDO.test(situacao)) {
      if (situacao === "cancelado") foraPedidos.cancelados++; else foraPedidos.abertos++;
      continue;
    }
    const idProduto = txt(l["ID produto"]);
    if (idProduto && idProduto !== "0") {
      const v = vendasPorProduto.get(idProduto) ?? { n: 0, ultima: null };
      v.n++; if (d && (!v.ultima || d > v.ultima)) v.ultima = d;
      vendasPorProduto.set(idProduto, v);
    }
    const b = baseDaVenda(l);
    const qtd = Math.max(1, Math.round(num(l["Quantidade"])));
    const modelo = modeloMaquina(desc);
    if (modelo) { evento(b, modelo).pedidos.push({ data: d, qtd, doc: `pedido ${numero}` }); continue; }
    if (!desc || NAO_E_PRODUTO.test(sem(desc))) continue;
    const k = `p:${numero}`;
    const i = (porPedido.get(k) ?? 0) + 1;
    porPedido.set(k, i);
    b.compras.push({ ref: `${k}:${i}`, data: d, documento: `Pedido ${numero}`, descricao: desc, quantidade: num(l["Quantidade"]) || 1 });
  }

  // propostas concluídas: máquinas (e peças que não estão nos pedidos do mesmo cliente)
  const porProposta = new Map<string, number>();
  for (const l of propostas) {
    if (!PROPOSTA_VALIDA.test(sem(l["Situação"]))) continue;
    const numero = txt(l["Número da proposta"]);
    const d = data(l["Data"]);
    const desc = txt(l["Descrição"]);
    const b = baseDaVenda(l);
    const qtd = Math.max(1, Math.round(num(l["Quantidade"])));
    const modelo = modeloMaquina(desc);
    if (modelo) { evento(b, modelo).propostas.push({ data: d, qtd, doc: `proposta ${numero}` }); continue; }
    if (!desc || NAO_E_PRODUTO.test(sem(desc))) continue;
    const jaNoPedido = b.compras.some((x) => sem(x.descricao) === sem(desc) && (!x.data || !d || dias(x.data, d) <= JANELA_MESMA_MAQUINA));
    if (jaNoPedido) continue;
    const k = `o:${numero}`;
    const i = (porProposta.get(k) ?? 0) + 1;
    porProposta.set(k, i);
    b.compras.push({ ref: `${k}:${i}`, data: d, documento: `Proposta ${numero}`, descricao: desc, quantidade: num(l["Quantidade"]) || 1 });
  }

  // clientes
  const clientes: ClienteLegado[] = [];
  const porModelo = new Map<string, number>();
  for (const b of bases.values()) {
    const ref = [...b.ids].sort()[0];
    const tagsTiny = [...new Set(b.tags)];
    const maquinas: MaquinaLegado[] = [];
    // a etiqueta do cadastro só acrescenta modelo que não veio de venda ("MF - A 200" num cliente que comprou a A 200 Plus é a mesma)
    const familia = (m: string) => m.replace(/ Plus$/, "");
    const vendidos = new Set([...b.eventos.keys()].map(familia));
    const modelos = new Set([...b.eventos.keys(), ...modelosDasEtiquetas(tagsTiny.join("|")).filter((m) => !vendidos.has(familia(m)))]);
    for (const modelo of modelos) {
      const ev = b.eventos.get(modelo) ?? { pedidos: [], propostas: [] };
      // cada unidade do pedido é uma máquina; a proposta do mesmo modelo perto da data é a mesma venda
      const unidades: { data: string | null; docs: string[] }[] = [];
      for (const p of ev.pedidos) for (let i = 0; i < p.qtd; i++) unidades.push({ data: p.data, docs: [p.doc] });
      for (const p of ev.propostas) {
        for (let i = 0; i < p.qtd; i++) {
          const par = unidades.find((u) => !u.docs.some((x) => x.startsWith("proposta")) && (!u.data || !p.data || dias(u.data, p.data) <= JANELA_MESMA_MAQUINA));
          if (par) { par.docs.push(p.doc); if (p.data && (!par.data || p.data < par.data)) par.data = p.data; }
          else unidades.push({ data: p.data, docs: [p.doc] });
        }
      }
      if (!unidades.length) unidades.push({ data: null, docs: [] }); // só pela etiqueta do cadastro
      unidades.sort((a, c) => (a.data ?? "9").localeCompare(c.data ?? "9"));
      unidades.forEach((u, i) => {
        const origem = u.docs.length
          ? `Vendida pela My Frost Máquinas${u.data ? ` em ${dataBR(u.data)}` : ""} (${[...new Set(u.docs)].join(", ")}). Garantia da My Frost: 1 ano, já encerrada.`
          : "O cadastro da My Frost marcava este modelo; data da venda não informada.";
        maquinas.push({ ref: `${ref}:${sem(modelo).replace(/\s+/g, "")}:${i + 1}`, modelo, descricao: `My Frost ${modelo}`, data: u.data, obs: origem });
        porModelo.set(modelo, (porModelo.get(modelo) ?? 0) + 1);
      });
    }
    const tecnico = tagsTiny.some((t) => /tecnic/.test(sem(t)));
    const grupo = maquinas.length ? "maquina" : b.compras.length ? "pecas" : tecnico ? "tecnico" : null;
    if (!grupo) continue;
    const dados = cadastro(b);
    if (!dados.nome) continue;
    const obsTiny = txt(b.contato?.["Observações do contato"] ?? "") || txt(b.contato?.["Observações"] ?? "");
    const etiquetas = tagsTiny.filter((t) => !/^(cliente|outro)$/i.test(t));
    clientes.push({
      ...dados, ref, grupo, maquinas, compras: b.compras,
      tags: [TAG_HISTORICO, ...(maquinas.length ? [TAG_DONO] : []), ...(tecnico ? [TAG_TECNICO] : [])],
      obs: [
        "Cliente da My Frost Máquinas (empresa anterior), trazido do backup do Tiny.",
        etiquetas.length ? `Etiquetas no Tiny da My Frost: ${etiquetas.join(", ")}.` : "",
        obsTiny ? `Observação no Tiny da My Frost: ${obsTiny.slice(0, 400)}` : "",
      ].filter(Boolean).join("\n"),
    });
  }
  clientes.sort((a, c) => a.nome.localeCompare(c.nome, "pt-BR"));

  // peças da My Frost que ainda não estão no catálogo
  const skus = new Set(catalogo.map((p) => sem(p.sku ?? "")).filter(Boolean));
  const palavras = (s: string) => new Set(sem(s).replace(/my\s*frost|maquinas?|compativel com/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1));
  const indice = catalogo.map((p) => ({ nome: p.descricao, w: palavras(p.descricao) }));
  const parecida = (nome: string) => {
    const w = palavras(nome);
    let melhor: { nome: string; s: number } | null = null;
    for (const p of indice) {
      const comum = [...w].filter((x) => p.w.has(x)).length;
      const s = comum / Math.max(1, new Set([...w, ...p.w]).size);
      if (s >= 0.6 && (!melhor || s > melhor.s)) melhor = { nome: p.nome, s };
    }
    return melhor?.nome ?? null;
  };
  const pecas: PecaLegado[] = [];
  for (const p of produtos) {
    const id = txt(p["ID"]);
    const nome = txt(p["Descrição"]);
    const tipo = txt(p["Tipo do produto"]).toUpperCase();
    const cat = sem(p["Categoria"]);
    const vendas = vendasPorProduto.get(id);
    const ativo = sem(p["Situação"]) === "ativo";
    const ncm = so(p["Classificação fiscal"]);
    // só peças: fora máquinas, matéria-prima, ingredientes e caldas (NCM dos capítulos 01 a 24 é alimento) e acessórios
    if (!id || !nome || tipo === "M" || modeloMaquina(nome) || /ingrediente|escritorio|soft premium|calda|saborizante|maquinas my frost$/.test(cat)) continue;
    if ((ncm.length >= 2 && Number(ncm.slice(0, 2)) <= 24) || /\b(calda|batedor|carrinho|balcao|casquinha|degustacao)\b/.test(sem(nome))) continue;
    if (!ativo && !(vendas && vendas.ultima && vendas.ultima >= "2023-06-01")) continue;
    const sku = txt(p["Código (SKU)"]);
    if (sku && skus.has(sem(sku))) continue; // mesmo código: já está no catálogo
    const unidade = sem(p["Unidade"]).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "UN";
    pecas.push({
      ref: id, sku, nome_original: nome, descricao: nomeCompativel(nome), unidade: unidade === "PC" || unidade === "PCA" ? "PC" : unidade,
      ncm: ncm.length === 8 ? ncm : "", origem: Math.max(0, Math.min(8, parseInt(txt(p["Origem"]), 10) || 0)),
      preco_venda: num(p["Preço"]), preco_custo: num(p["Preço de custo"]), peso_kg: num(p["Peso bruto (Kg)"]) || num(p["Peso líquido (Kg)"]),
      largura_cm: num(p["Largura embalagem"]), altura_cm: num(p["Altura embalagem"]), profundidade_cm: num(p["Comprimento embalagem"]),
      codigo_fabricante: txt(p["Cód do Fornecedor"]), vendas: vendas?.n ?? 0, ultima_venda: vendas?.ultima ?? null, parecida: parecida(nome),
    });
  }
  pecas.sort((a, c) => c.vendas - a.vendas || a.descricao.localeCompare(c.descricao, "pt-BR"));

  const soOrcamento = contatos.filter((c) => /so orca/.test(sem(c["Tipos de Contatos"]))).length;
  return {
    clientes, pecas,
    maquinasPorModelo: [...porModelo.entries()].sort((a, c) => c[1] - a[1]),
    foraDaImportacao: [
      { rotulo: "notas fiscais da My Frost", quantidade: (abas["NFes"] ?? []).length },
      { rotulo: "contas a pagar da My Frost", quantidade: (abas["Contas_pagar_2026"] ?? []).length },
      { rotulo: "lançamentos de caixa da My Frost", quantidade: (abas["Caixa_2026"] ?? []).length },
      { rotulo: "itens de pedidos em aberto ou cancelados", quantidade: foraPedidos.abertos + foraPedidos.cancelados },
      { rotulo: "contatos só de orçamento", quantidade: soOrcamento },
    ].filter((x) => x.quantidade > 0),
  };
}

/** Abre o arquivo do backup (a biblioteca de planilhas só é baixada quando alguém importa). */
export async function lerBackupMyFrost(arquivo: File, catalogo: { sku: string | null; descricao: string }[]): Promise<LeituraLegado> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
  const abas: Record<string, Linha[]> = {};
  for (const nome of wb.SheetNames) abas[nome] = XLSX.utils.sheet_to_json<Linha>(wb.Sheets[nome], { defval: "", raw: true });
  return montarLegado(abas, catalogo);
}
