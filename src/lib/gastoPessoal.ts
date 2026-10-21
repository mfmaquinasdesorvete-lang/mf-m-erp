// Painel pessoal: lançar o gasto (ou a entrada) falando ou escrevendo, como "gastei 45,90 no almoço ontem no cartão Nubank".
// Daí saem o valor, a data, se entrou ou saiu, a conta e a categoria. Tudo é sugestão: a tela mostra os campos para conferir.
import { categoriaDe, type CATEGORIAS, type ContaPessoal } from "./pessoal";
import { dataDoTexto, valorDoTexto } from "./gastoRapido";

export type LancFalado = {
  valor: number | null; data: string; sentido: "saida" | "entrada"; conta_id: string | null;
  categoria: (typeof CATEGORIAS)[number]; descricao: string;
};

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// palavras que não dizem o que foi o gasto
const SOLTAS = new Set(["eu", "hoje", "ontem", "anteontem", "dia", "gastei", "paguei", "comprei", "recebi", "ganhei", "entrou", "caiu", "foi",
  "reais", "real", "pila", "conto", "cartao", "credito", "debito", "pix", "dinheiro", "especie"]);
// ligações que só saem das pontas ("pão de queijo" fica inteiro; "no almoço no" vira "almoço")
const LIGACOES = new Set(["com", "no", "na", "em", "de", "do", "da", "pelo", "pela", "o", "a", "um", "uma", "e"]);

export function interpretarLancPessoal(texto: string, hoje: string, contas: Pick<ContaPessoal, "id" | "nome" | "banco" | "tipo">[]): LancFalado {
  const t = sem(texto);
  const sentido = /\b(recebi|ganhei|entrou|caiu|pro.?labore|salario|reembolso)\b/.test(t) ? "entrada" : "saida";
  // conta: pelo nome dela ou do banco; "cartão/crédito" vai para o cartão e "dinheiro" para a conta em dinheiro
  const bate = (n: string | null | undefined) => { const x = sem(n).trim(); return x.length >= 3 && new RegExp(`\\b${escapar(x)}\\b`).test(t); };
  const conta = contas.find((c) => bate(c.nome)) ?? contas.find((c) => bate(c.banco))
    ?? (/\b(cartao|credito)\b/.test(t) ? contas.find((c) => c.tipo === "cartao") : undefined)
    ?? (/\b(dinheiro|especie)\b/.test(t) ? contas.find((c) => c.tipo === "dinheiro") : undefined);
  // descrição: as palavras do próprio texto (com acento), sem o valor, a data, os verbos e a conta
  const daConta = new Set([conta?.nome, conta?.banco].flatMap((n) => sem(n).split(/\s+/)).filter((w) => w.length >= 3));
  const chave = (p: string) => sem(p).replace(/[^a-z0-9$,.]/g, "").replace(/[.,]+$/, "");
  const palavras = texto.split(/\s+/).filter((p) => {
    const w = chave(p);
    return w && !/^(r\$)?[\d.,]+$/.test(w) && w !== "r$" && !SOLTAS.has(w) && !daConta.has(w);
  });
  while (palavras.length && LIGACOES.has(chave(palavras[0]))) palavras.shift();
  while (palavras.length && LIGACOES.has(chave(palavras[palavras.length - 1]))) palavras.pop();
  const d = palavras.join(" ").replace(/[.,;]+$/, "").trim();
  const descricao = (d ? d.charAt(0).toUpperCase() + d.slice(1) : texto.trim()).slice(0, 200);
  return { valor: valorDoTexto(texto), data: dataDoTexto(texto, hoje), sentido, conta_id: conta?.id ?? null, categoria: categoriaDe(t), descricao };
}
