// App de vendas no celular (erp.myfrost.ai/app/vendas): o que o vendedor faz na rua ou no WhatsApp — quanto vendeu no
// mês, os orçamentos que esperam resposta, achar o cliente e chamar, consultar preço e estoque e abrir um pedido.
import { diaLocal } from "./filtroLista";

export type PedidoApp = { id: string; numero: number; status: string; valor_total: number; created_at: string; aprovado_em?: string | null; vendedor_id?: string | null };

export const ROTULO_STATUS_APP: Record<string, string> = {
  orcamento: "Orçamento", aprovado: "Aprovado", faturado: "Faturado", entregue: "Entregue", cancelado: "Cancelado",
};

/** A venda conta no mês em que foi aprovada (orçamento e cancelado não são venda). */
const ehVenda = (p: PedidoApp) => ["aprovado", "faturado", "entregue"].includes(p.status);

/** Resumo do app: com `vendedorId`, só os pedidos daquele vendedor. */
export function resumoVendas(pedidos: PedidoApp[], hoje: string, vendedorId?: string | null) {
  const meus = vendedorId ? pedidos.filter((p) => p.vendedor_id === vendedorId) : pedidos;
  const mes = hoje.slice(0, 7);
  const d = new Date(`${mes}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const mesAnterior = d.toISOString().slice(0, 7);
  const diaDoMes = hoje.slice(8, 10);
  // o dia da venda em Brasília (às 22h de 31/10 ainda é outubro)
  const dataVenda = (p: PedidoApp) => diaLocal(p.aprovado_em ?? p.created_at);
  const soma = (l: PedidoApp[]) => Math.round(l.reduce((s, p) => s + Number(p.valor_total || 0), 0) * 100) / 100;
  const doMes = meus.filter((p) => ehVenda(p) && dataVenda(p).startsWith(mes));
  // mesmo período do mês passado (até o mesmo dia), para comparar sem esperar o mês acabar
  const antes = meus.filter((p) => ehVenda(p) && dataVenda(p).startsWith(mesAnterior) && dataVenda(p).slice(8, 10) <= diaDoMes);
  const orcamentos = meus.filter((p) => p.status === "orcamento");
  const aprovados = meus.filter((p) => p.status === "aprovado");
  const valor = soma(doMes);
  const anterior = soma(antes);
  return {
    valor, qtd: doMes.length, ticket: doMes.length ? Math.round((valor / doMes.length) * 100) / 100 : 0,
    variacao: anterior > 0 ? Math.round(((valor - anterior) / anterior) * 100) : null,
    orcamentos: orcamentos.length, valorOrcamentos: soma(orcamentos),
    aprovados: aprovados.length, valorAprovados: soma(aprovados),
    recentes: [...meus].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
  };
}

/** Número para o link do WhatsApp: só dígitos e com o 55 do Brasil. */
export function numeroWhatsApp(fone: string | null | undefined) {
  const d = (fone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

/** Busca sem acento e sem diferença de maiúscula; no documento, compara só os dígitos. */
export function combina(texto: string, busca: string) {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const b = norm(busca.trim());
  if (!b) return true;
  const dig = busca.replace(/\D/g, "");
  return b.split(/\s+/).every((p) => norm(texto).includes(p)) || (dig.length >= 4 && texto.replace(/\D/g, "").includes(dig));
}

/** Abre o app de vendas ao entrar pelo celular? Escolha guardada no aparelho; sem escolha, abre para quem é de vendas. */
export const CHAVE_APP_VENDAS = "mf-erp-abrir-app-vendas";
export const abrirAppVendas = (escolha: string | null, largura: number, papel: string) => abrirAppCelular(escolha, largura, papel, "vendas");

/** Regra de todos os apps de celular: tela larga nunca; escolha do aparelho vale; sem escolha, abre para o papel do app. */
export function abrirAppCelular(escolha: string | null, largura: number, papel: string, papelDoApp: string) {
  if (largura >= 768) return false;
  if (escolha === "1") return true;
  if (escolha === "0") return false;
  return papel === papelDoApp;
}
