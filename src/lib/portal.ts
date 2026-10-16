// Portal do representante (/portal): o que as funções portal_* do banco devolvem e as contas da tela.
// O banco filtra tudo pelo vendedor ligado ao login; aqui só se organiza e confere antes de mandar.
import { cnpjValido, cpfValido } from "./compliance";
import { digitos } from "./format";
import { emailValido } from "./mascaras";
import { resumoMeta } from "./metas";

/* ------------------------------- Tipos ------------------------------- */

export type SituacaoPedido = "orcamento" | "aprovado" | "faturado" | "entregue" | "cancelado";
export type SituacaoComissao = "prevista" | "liberada" | "paga";

export type AcessoPortal =
  | { vinculado: false }
  | { vinculado: true; vendedor_id: string; nome: string; percentual: number; base: "recebimento" | "faturamento"; tabela: string | null };

export type ResumoPortal = {
  hoje: string; mes: string;
  vendas: { mes: number; ano: number; pedidos_mes: number };
  meta_mes: number | null;
  comissoes: { a_receber: number; recebidas_ano: number; previstas: number };
  pedidos: { orcamentos: number; orcamentos_valor: number; aprovados: number; faturados: number; em_aberto_valor: number };
};

export type PedidoPortal = {
  id: string; numero: number; status: SituacaoPedido; criado_em: string; aprovado_em: string | null; total: number; via_portal: boolean;
  cliente: string | null; municipio: string | null; uf: string | null; itens: number;
  nf_numero: string | null; nf_serie: string | null; nf_em: string | null;
  rastreio: string | null; transportadora: string | null; envio_status: string | null; entrega_prevista: string | null; entregue_em: string | null;
};

export type DetalhePedidoPortal = {
  id: string; numero: number; status: SituacaoPedido; criado_em: string; aprovado_em: string | null; via_portal: boolean;
  cliente: string | null; municipio: string | null; uf: string | null; forma_pagamento: string | null; parcelas: number;
  valor_produtos: number; desconto: number; frete: number; total: number; observacoes: string | null;
  nf: { numero: string | null; serie: string | null; em: string } | null;
  envio: { status: string; rastreio: string | null; transportadora: string | null; entrega_prevista: string | null; entregue_em: string | null } | null;
  rastreio: string | null; transportadora: string | null;
  itens: { descricao: string; quantidade: number; valor_unitario: number; valor_total: number }[];
};

export type ComissaoPortal = {
  dia: string; pedido_numero: number | null; cliente: string | null; descricao: string;
  base: number; percentual: number; valor: number; situacao: SituacaoComissao; pago_em: string | null;
};

export type ClientePortal = {
  id: string; nome: string; nome_fantasia: string | null; municipio: string | null; uf: string | null;
  conferir: boolean; ultima_compra: string | null; total_ano: number;
};

export type FormaPortal = { id: string; nome: string; meio: string; parcelas: number; intervalo_dias: number; primeiro_em_dias: number; desconto_max: number };
export type ProdutoPortal = {
  id: string; descricao: string; sku: string | null; modelo: string | null; marca: string | null; unidade: string | null;
  preco: number; disponibilidade: "disponivel" | "sob_consulta";
};

/* ------------------------------ Rótulos ------------------------------ */

export const ROTULO_SITUACAO: Record<SituacaoPedido, string> = {
  orcamento: "Orçamento", aprovado: "Aprovado", faturado: "Faturado", entregue: "Entregue", cancelado: "Cancelado",
};
export const ROTULO_COMISSAO: Record<SituacaoComissao, string> = { prevista: "Prevista", liberada: "Liberada", paga: "Paga" };
/** O que cada situação da comissão quer dizer (texto curto da tela). */
export const AJUDA_COMISSAO: Record<SituacaoComissao, string> = {
  prevista: "pedido aprovado: sai quando o cliente pagar (ou quando a empresa lançar)",
  liberada: "já lançada: a empresa vai pagar",
  paga: "já paga para você",
};
const ROTULO_ENVIO: Record<string, string> = {
  cotacao: "Preparando o envio", aprovacao: "Preparando o envio", coleta: "Aguardando coleta", transito: "Em trânsito", entregue: "Entregue",
};
export const rotuloDisponibilidade = (d: ProdutoPortal["disponibilidade"]) => (d === "disponivel" ? "Disponível" : "Sob consulta");

/** Etapa do pedido na linha do tempo (1 orçamento … 4 entregue; 0 cancelado). */
export function etapaPedido(status: SituacaoPedido): number {
  return { orcamento: 1, aprovado: 2, faturado: 3, entregue: 4, cancelado: 0 }[status] ?? 0;
}

/** Onde está a entrega: entregue, situação do envio, rastreio ou nota emitida (null se ainda nada). */
export function situacaoEntrega(p: Pick<PedidoPortal, "status" | "envio_status" | "rastreio" | "nf_numero" | "entregue_em">): string | null {
  if (p.status === "cancelado") return null;
  if (p.status === "entregue" || p.envio_status === "entregue" || p.entregue_em) return "Entregue";
  if (p.envio_status && ROTULO_ENVIO[p.envio_status]) return ROTULO_ENVIO[p.envio_status];
  if (p.rastreio) return "Enviado";
  if (p.nf_numero) return "Nota emitida";
  return null;
}

/* ------------------------------ Pedidos ------------------------------ */

export type FiltroPedidos = "todos" | "abertos" | SituacaoPedido;
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "abertos" = orçamento, aprovado ou faturado (ainda não entregue nem cancelado). Busca por nº, cliente ou cidade. */
export function filtrarPedidos(lista: PedidoPortal[], filtro: FiltroPedidos, busca = "") {
  const termos = semAcento(busca.trim()).split(/\s+/).filter(Boolean);
  return lista.filter((p) => {
    const ok = filtro === "todos" || (filtro === "abertos" ? ["orcamento", "aprovado", "faturado"].includes(p.status) : p.status === filtro);
    if (!ok) return false;
    if (!termos.length) return true;
    const texto = semAcento(`${p.numero} ${p.cliente ?? ""} ${p.municipio ?? ""} ${p.nf_numero ?? ""}`);
    return termos.every((t) => texto.includes(t));
  });
}

/* ----------------------------- Comissões ----------------------------- */

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function totaisComissoes(linhas: ComissaoPortal[]) {
  const t = { prevista: 0, liberada: 0, paga: 0 };
  for (const l of linhas) t[l.situacao] = r2(t[l.situacao] + Number(l.valor));
  return t;
}

export type MesExtrato = { mes: string; linhas: ComissaoPortal[] } & Record<SituacaoComissao, number>;

/** Extrato por mês (AAAA-MM), do mais recente para o mais antigo. Mês da comissão paga: o do pagamento. */
export function extratoPorMes(linhas: ComissaoPortal[], ano?: string): MesExtrato[] {
  const meses = new Map<string, MesExtrato>();
  for (const l of linhas) {
    const mes = mesDaComissao(l);
    if (ano && !mes.startsWith(ano)) continue;
    const m = meses.get(mes) ?? { mes, linhas: [], prevista: 0, liberada: 0, paga: 0 };
    m.linhas.push(l);
    m[l.situacao] = r2(m[l.situacao] + Number(l.valor));
    meses.set(mes, m);
  }
  return [...meses.values()]
    .map((m) => ({ ...m, linhas: [...m.linhas].sort((a, b) => b.dia.localeCompare(a.dia)) }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
}

export const mesDaComissao = (l: Pick<ComissaoPortal, "situacao" | "dia" | "pago_em">) =>
  (l.situacao === "paga" && l.pago_em ? l.pago_em : l.dia).slice(0, 7);

/** Anos que aparecem no extrato (mais recente primeiro). */
export const anosDoExtrato = (linhas: ComissaoPortal[]) => [...new Set(linhas.map((l) => mesDaComissao(l).slice(0, 4)))].sort().reverse();

/** Linhas da planilha (Excel) do extrato. */
export function planilhaComissoes(linhas: ComissaoPortal[]) {
  return [...linhas]
    .sort((a, b) => mesDaComissao(b).localeCompare(mesDaComissao(a)) || b.dia.localeCompare(a.dia))
    .map((l) => ({
      Mês: mesDaComissao(l).split("-").reverse().join("/"), Data: l.dia, Pedido: l.pedido_numero ?? "", Cliente: l.cliente ?? "",
      Referência: l.descricao, Base: Number(l.base), "%": Number(l.percentual), Comissão: Number(l.valor),
      Situação: ROTULO_COMISSAO[l.situacao], "Paga em": l.pago_em ?? "",
    }));
}

/* ------------------------------- Meta -------------------------------- */

/** Meta do mês e % atingido (mesma conta da tela de Metas: dias úteis, projeção e quanto falta por dia). */
export function metaDoMes(r: Pick<ResumoPortal, "meta_mes" | "vendas" | "mes" | "hoje">) {
  const meta = r.meta_mes == null ? null : Number(r.meta_mes);
  const realizado = Number(r.vendas.mes) || 0;
  return { meta, realizado, ...resumoMeta(meta, realizado, r.mes, r.hoje) };
}

/* ----------------------------- Orçamento ----------------------------- */

export type ItemOrcamento = { produto_id: string; descricao: string; preco: number; quantidade: number; disponibilidade?: ProdutoPortal["disponibilidade"] };

/** "1,5" → 1.5; vazio ou inválido → null. Até 3 casas, como o banco. */
export function lerQuantidade(txt: string | number | null | undefined): number | null {
  if (typeof txt === "number") return Number.isFinite(txt) && txt > 0 ? Math.round(txt * 1000) / 1000 : null;
  const bruto = String(txt ?? "").trim();
  // com vírgula: ponto é milhar (1.000,5); sem vírgula: ponto é decimal (1.5)
  const s = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 1000) / 1000;
  return n > 0 ? n : null;
}

/** Põe o produto no orçamento (se já estiver, soma a quantidade). */
export function adicionarItem(itens: ItemOrcamento[], p: Pick<ProdutoPortal, "id" | "descricao" | "preco" | "disponibilidade">, quantidade = 1): ItemOrcamento[] {
  const i = itens.findIndex((x) => x.produto_id === p.id);
  if (i < 0) return [...itens, { produto_id: p.id, descricao: p.descricao, preco: Number(p.preco), quantidade, disponibilidade: p.disponibilidade }];
  return itens.map((x, k) => (k === i ? { ...x, quantidade: Math.round((x.quantidade + quantidade) * 1000) / 1000 } : x));
}

/**
 * Totais do orçamento como o banco grava: cada item arredondado em centavos, desconto em % sobre o subtotal.
 * Erro quando falta item ou o desconto passa do máximo da forma de pagamento (o banco recusa do mesmo jeito).
 */
export function calcularOrcamento(itens: ItemOrcamento[], descontoPct: number, maximo: number) {
  const subtotal = r2(itens.reduce((s, i) => s + r2(i.quantidade * i.preco), 0));
  const pct = Math.round((Number(descontoPct) || 0) * 100) / 100;
  const desconto = r2((subtotal * pct) / 100);
  const total = r2(subtotal - desconto);
  let erro: string | null = null;
  if (!itens.length) erro = "Inclua ao menos um produto.";
  else if (itens.some((i) => !(i.quantidade > 0))) erro = "Confira as quantidades.";
  else if (!Number.isFinite(Number(descontoPct)) || pct < 0 || pct > 100) erro = "Desconto inválido.";
  else if (pct > maximo + 0.005) erro = maximo > 0 ? `Desconto acima do máximo de ${pctBR(maximo)} para esta forma de pagamento.` : "Sem desconto liberado para esta forma de pagamento.";
  return { subtotal, desconto, total, pct, erro };
}

export const pctBR = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("pt-BR")}%`;

/* --------------------------- Cliente novo ---------------------------- */

export type ClienteNovo = { nome: string; cpf_cnpj: string; municipio: string; uf: string; whatsapp: string; email: string };
const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

/** Celular com DDD no formato do WhatsApp (11 números), a mesma regra de public.whatsapp_de; null se não for celular. */
export function whatsappDe(v: string): string | null {
  let d = digitos(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (/^[1-9][0-9]9[0-9]{8}$/.test(d)) return d;
  if (/^[1-9][0-9][6-9][0-9]{7}$/.test(d)) return `${d.slice(0, 2)}9${d.slice(2)}`;
  return null;
}

/** Erros do cadastro mínimo (a mesma regra do banco). Vazio = pode gravar. */
export function errosClienteNovo(c: ClienteNovo): Partial<Record<keyof ClienteNovo, string>> {
  const e: Partial<Record<keyof ClienteNovo, string>> = {};
  if (c.nome.trim().length < 3) e.nome = "Informe o nome";
  const d = digitos(c.cpf_cnpj);
  if (!(d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false)) e.cpf_cnpj = d.length === 14 ? "CNPJ inválido" : d.length === 11 ? "CPF inválido" : "CPF (11 números) ou CNPJ (14)";
  if (c.municipio.trim().length < 2) e.municipio = "Informe a cidade";
  if (!UFS.includes(c.uf.trim().toUpperCase())) e.uf = "UF inválida";
  if (!whatsappDe(c.whatsapp)) e.whatsapp = "WhatsApp (celular) com DDD";
  if (c.email.trim() && !emailValido(c.email)) e.email = "E-mail inválido";
  return e;
}

/* ------------------------------ Convite ------------------------------ */

/** Mensagem com o acesso ao portal (copiar ou mandar pelo WhatsApp). */
export function textoConvite(a: { nome: string; email: string; senha: string; site: string }) {
  const primeiro = a.nome.trim().split(/\s+/)[0] || a.nome;
  return `Olá, ${primeiro}! Seu acesso ao Portal do representante da MF Máquinas:\n${a.site.replace(/\/$/, "")}/portal\n`
    + `E-mail: ${a.email.trim().toLowerCase()}\nSenha provisória: ${a.senha}\nNo primeiro acesso você cria a sua senha pessoal.`;
}

/** Mensagem de erro do banco em português da tela (a regra antiga do papel ainda sem "representante"). */
export function erroPortal(msg: string) {
  if (/usuarios_erp_papel_check|papel_check/.test(msg)) return "O banco ainda não aceita o papel representante: aplique a migração do portal do representante.";
  if (/function .*portal_.* does not exist|Could not find the function/i.test(msg)) return "O portal ainda não está no banco: aplique a migração do portal do representante.";
  return msg;
}
