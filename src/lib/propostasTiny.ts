// Propostas comerciais do Tiny (histórico): a planilha exportada em Vendas → Propostas comerciais (.xls/.xlsx ou .csv)
// ou a aba "Propostas" do backup da My Frost. Uma linha por item; a proposta é o ID do Tiny.
// As duas guardam valores, desconto, frete e condições (a My Frost com valores desde 22/10, depois do ok do advogado).
// As da My Frost (empresa anterior) entram só de quem já é cliente do ERP e sem ligar ao produto da MF: o banco confere.

export type EmpresaProposta = "mf" | "my_frost";
export const EMPRESA_PROPOSTA: Record<EmpresaProposta, string> = { mf: "MF Máquinas", my_frost: "My Frost (empresa anterior)" };

export type ItemPropostaTiny = {
  descricao: string; quantidade: number; valor_unitario?: number | null; produto_id?: string | null; tiny_produto_id?: string;
};

/** Como a proposta vem da planilha (antes de ir para o banco). */
export type PropostaLida = {
  tiny_id: string; numero: string; data: string | null; proximo_contato: string | null; situacao: string; vendedor: string;
  contato_id: string; nome: string; tipo_pessoa: string; cpf_cnpj: string; ie: string; cep: string; municipio: string; uf: string;
  endereco: string; numero_end: string; complemento: string; bairro: string; fone: string; celular: string; email: string;
  aos_cuidados: string; validade: string; prazo_entrega: string; observacoes: string; desconto: number; frete: number;
  itens: ItemPropostaTiny[];
};

/** Como fica no ERP (tabela propostas_tiny). */
export type DocumentoProposta = { titulo: string; url: string; origem: "drive" | "zapsign" | string; data?: string | null };
export type PropostaTiny = {
  id: string; empresa: EmpresaProposta; tiny_id: string; numero: number | null; data: string | null; proximo_contato: string | null;
  situacao: string | null; vendedor: string | null; cliente_id: string | null; contato_nome: string | null; aos_cuidados: string | null;
  unidade_id: string | null; validade_dias: number | null; prazo_entrega: string | null; observacoes: string | null;
  desconto: number | null; frete: number | null; total: number | null; itens: ItemPropostaTiny[];
  /** marcadores coloridos (public.marcadores) */
  marcadores?: string[] | null;
  /** proposta assinada pelo cliente: link do PDF no Drive ou da verificação no ZapSign */
  documentos?: DocumentoProposta[] | null;
  cliente?: { id: string; nome: string; nome_fantasia?: string | null; codigo?: number | null; cpf_cnpj?: string | null; municipio?: string | null; uf?: string | null; tags?: string[] | null } | null;
};

type Linha = Record<string, unknown>;

const txt = (v: unknown) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const sem = (v: unknown) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const so = (v: unknown) => txt(v).replace(/\.0+$/, "").replace(/\D/g, "");
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = txt(v).replace(/^R\$\s*/, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
function data(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const m = txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = txt(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}
/** Texto que veio em HTML (descrição complementar, observações) vira texto corrido. */
const semHtml = (v: unknown) => txt(String(v ?? "").replace(/<br\s*\/?>|<\/(p|li|div)>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"));

/** Lê uma coluna pelo nome, sem ligar para acento, maiúscula ou espaço sobrando. */
function leitor(l: Linha) {
  const mapa = new Map(Object.keys(l).map((k) => [sem(k), k]));
  return (...nomes: string[]) => {
    for (const n of nomes) { const k = mapa.get(sem(n)); if (k !== undefined) return l[k]; }
    return "";
  };
}

/** Agrupa as linhas (uma por item) em propostas. */
export function montarPropostas(linhas: Linha[]): PropostaLida[] {
  const porId = new Map<string, PropostaLida>();
  for (const l of linhas) {
    const c = leitor(l);
    const id = so(c("ID"));
    if (!id) continue;
    let p = porId.get(id);
    if (!p) {
      p = {
        tiny_id: id, numero: so(c("Número da proposta", "Numero")), data: data(c("Data")), proximo_contato: data(c("Data proximo contato", "Data próximo contato")),
        situacao: txt(c("Situação")), vendedor: txt(c("Vendedor")), contato_id: so(c("ID contato")), nome: txt(c("Nome do contato")),
        tipo_pessoa: txt(c("Tipo de Pessoa")).toUpperCase(), cpf_cnpj: so(c("CPF/CNPJ")), ie: txt(c("RG/IE")), cep: so(c("CEP")),
        municipio: txt(c("Município")), uf: txt(c("UF")).toUpperCase(), endereco: txt(c("Endereço")), numero_end: txt(c("Endereço Nro")),
        complemento: txt(c("Complemento")), bairro: txt(c("Bairro")), fone: txt(c("Fone")), celular: txt(c("Celular")), email: txt(c("E-mail")),
        aos_cuidados: txt(c("Aos cuidados de")), validade: so(c("Validade")),
        prazo_entrega: txt(c("Descrição do Prazo de Entrega", "Prazo de Entrega")), observacoes: semHtml(c("Observações")),
        desconto: 0, frete: num(c("Frete")), itens: [],
      };
      (p as any)._desconto = txt(c("Desconto"));
      porId.set(id, p);
    }
    const descricao = txt(c("Descrição"));
    if (descricao) {
      p.itens.push({ descricao, quantidade: num(c("Quantidade")) || 1, valor_unitario: num(c("Valor unitário")), tiny_produto_id: so(c("ID produto")) });
    }
  }
  // desconto pode vir em valor ("150,00") ou em % ("5%") sobre os itens
  for (const p of porId.values()) {
    const d = String((p as any)._desconto ?? "");
    delete (p as any)._desconto;
    const sub = p.itens.reduce((s, i) => s + i.quantidade * Number(i.valor_unitario ?? 0), 0);
    p.desconto = /%\s*$/.test(d) ? Math.round(sub * num(d.replace("%", ""))) / 100 : num(d);
  }
  return [...porId.values()].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || Number(b.numero) - Number(a.numero));
}

/** No backup da My Frost vêm também as abas das notas, contatos e pedidos (para as notas fiscais: notasMyFrost.ts). */
export type AbasNotasBackup = { nfes: Linha[]; contatos: Linha[]; pedidos: Linha[] };
export type LeituraPropostas = { propostas: PropostaLida[]; doBackup: boolean; arquivos: string[]; vazios: string[]; abasNotas?: AbasNotasBackup };

/** Lê os arquivos (.xls/.xlsx/.csv) e junta as propostas (a mesma proposta em dois arquivos conta uma vez). */
export async function lerPropostasTiny(arquivos: File[]): Promise<LeituraPropostas> {
  const XLSX = await import("xlsx");
  const todas = new Map<string, PropostaLida>();
  let doBackup = false;
  let abasNotas: AbasNotasBackup | undefined;
  const vazios: string[] = []; // arquivos só com o cabeçalho (o filtro do Tiny não tinha proposta)
  for (const f of arquivos) {
    let wb;
    if (/\.csv$/i.test(f.name) || f.type === "text/csv") {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let texto: string;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { texto = new TextDecoder("windows-1252").decode(bytes); }
      // raw: as datas ficam como texto (dd/mm/aaaa), sem virar data americana
      wb = XLSX.read(texto.replace(/^﻿/, ""), { type: "string", raw: true });
    } else {
      wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    }
    const aba = wb.SheetNames.find((n) => sem(n) === "propostas") ?? wb.SheetNames.find((n) => /propost/i.test(n)) ?? wb.SheetNames[0];
    if (wb.SheetNames.some((n) => sem(n) === "contatos")) doBackup = true;
    const abaNotas = wb.SheetNames.find((n) => sem(n) === "nfes");
    if (doBackup && abaNotas) {
      const linhasDa = (nome: string) => {
        const a = wb.SheetNames.find((n) => sem(n) === nome);
        return a ? XLSX.utils.sheet_to_json<Linha>(wb.Sheets[a], { defval: "", raw: true }) : [];
      };
      abasNotas = { nfes: linhasDa("nfes"), contatos: linhasDa("contatos"), pedidos: linhasDa("pedidos_venda_itens") };
    }
    // as colunas vêm do cabeçalho: o Tiny exporta só o cabeçalho quando o filtro não tem nenhuma proposta
    const cabecalho = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, defval: "", blankrows: false })[0] ?? [];
    const colunas = new Set(cabecalho.map(sem));
    if (!colunas.has("id") || !colunas.has("numero da proposta") || !colunas.has("descricao")) {
      throw new Error(`"${f.name}" não parece a planilha de propostas do Tiny (precisa das colunas ID, Número da proposta e Descrição).`);
    }
    const linhas = XLSX.utils.sheet_to_json<Linha>(wb.Sheets[aba], { defval: "", raw: true });
    const lidas = montarPropostas(linhas);
    if (!lidas.length) { vazios.push(f.name); continue; }
    for (const p of lidas) todas.set(p.tiny_id, p);
  }
  if (!todas.size) throw new Error(arquivos.length > 1 ? "Nenhum dos arquivos tem proposta (só o cabeçalho)." : `"${arquivos[0]?.name}" não tem nenhuma proposta (só o cabeçalho).`);
  const propostas = [...todas.values()].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || Number(b.numero) - Number(a.numero));
  return { propostas, doBackup, arquivos: arquivos.map((f) => f.name).filter((n) => !vazios.includes(n)), vazios, abasNotas };
}

/** O que vai para o banco. Na My Frost o item não leva o produto do Tiny (o cadastro de produtos é da MF). */
export function paraEnvio(p: PropostaLida, empresa: EmpresaProposta) {
  if (empresa === "mf") return p;
  return { ...p, itens: p.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario })) };
}

// ---------------------------------------------------------------------------------------------------------------
// Situação como no Tiny
// ---------------------------------------------------------------------------------------------------------------
export type GrupoSituacao = "fechada" | "aberta" | "perdida";
export function grupoSituacao(s: string | null | undefined): GrupoSituacao {
  const x = sem(s);
  if (/conclu|faturad|vendid/.test(x)) return "fechada";
  if (/nao aprov|cancel|recus|perdid/.test(x)) return "perdida";
  return "aberta";
}
export const ROTULO_GRUPO: Record<GrupoSituacao, string> = { fechada: "Viraram venda", aberta: "Em aberto", perdida: "Não fecharam" };

/** Cor do selo da situação (só as cores que mudam com o tema). */
export function corSituacao(s: string | null | undefined) {
  const x = sem(s);
  if (/conclu/.test(x)) return "bg-emerald-100 text-emerald-800";
  if (/nao aprov|cancel|recus/.test(x)) return "bg-red-100 text-red-800";
  if (/^aprov/.test(x)) return "bg-sky-100 text-sky-800";
  if (/aguard|pendent|enviad/.test(x)) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

/** As situações do Tiny, na ordem das abas da tela de propostas. */
export const SITUACOES_TINY = ["Em aberto", "Rascunho", "Pendente", "Aguardando", "Aprovado", "Não aprovado", "Concluído", "Modelo"] as const;
export const ROTULO_ABA_SITUACAO: Record<string, string> = {
  "Em aberto": "Em aberto", Rascunho: "Rascunhos", Pendente: "Pendentes", Aguardando: "Aguardando", Aprovado: "Aprovadas",
  "Não aprovado": "Não aprovadas", "Concluído": "Concluídas", Modelo: "Modelos",
};
/** Situação escrita de qualquer jeito (com ou sem acento, plural) vira uma das do Tiny. */
export function situacaoPadrao(s: string | null | undefined): string {
  const x = sem(s);
  if (!x) return "Em aberto";
  if (/nao aprov|recus|cancel/.test(x)) return "Não aprovado";
  if (/conclu|faturad|vendid/.test(x)) return "Concluído";
  if (/^aprov/.test(x)) return "Aprovado";
  if (/rascunh/.test(x)) return "Rascunho";
  if (/pendent/.test(x)) return "Pendente";
  if (/aguard|enviad/.test(x)) return "Aguardando";
  if (/modelo/.test(x)) return "Modelo";
  if (/aberto/.test(x)) return "Em aberto";
  return txt(s);
}
/** Próximo contato de uma proposta ainda em aberto: atrasado, hoje ou mais para frente. */
export function contatoDaProposta(p: { proximo_contato: string | null; situacao: string | null }, hoje: string): "atrasado" | "hoje" | "futuro" | null {
  if (!p.proximo_contato || grupoSituacao(p.situacao) !== "aberta" || situacaoPadrao(p.situacao) === "Modelo") return null;
  const d = p.proximo_contato.slice(0, 10);
  return d < hoje ? "atrasado" : d === hoje ? "hoje" : "futuro";
}

export const subtotalProposta = (p: { itens: ItemPropostaTiny[] }) => p.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario ?? 0), 0);
export const nomeCliente = (p: PropostaTiny) => p.cliente?.nome_fantasia?.trim() || p.cliente?.nome || p.contato_nome || "—";

/** Data da planilha (dd/mm/aaaa, aaaa-mm-dd, número de série do Excel ou Date) → aaaa-mm-dd. */
export { data as dataDaPlanilha };
