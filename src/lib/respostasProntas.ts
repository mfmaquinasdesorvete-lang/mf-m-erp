// Perguntas prontas do Perguntar à IA (Buscar do menu): as que a equipe mais faz — o que foi vendido hoje e na semana,
// quanto tem de saldo, peças faltando e frete demorando — respondem na hora, sem a IA, com o login de quem pergunta.
// Aqui ficam as regras (reconhecer a pergunta, o período, quem está faltando, o que está atrasado); a tela busca os dados.

export type Pronta = "vendas_hoje" | "vendas_semana" | "saldo" | "pecas_faltando" | "fretes_demorando";

export const PRONTAS: Record<Pronta, { rotulo: string; emoji: string }> = {
  vendas_hoje: { rotulo: "O que foi vendido hoje", emoji: "🛒" },
  vendas_semana: { rotulo: "O que foi vendido na semana", emoji: "📅" },
  saldo: { rotulo: "Quanto tem de saldo", emoji: "🏦" },
  pecas_faltando: { rotulo: "Peças faltando", emoji: "📦" },
  fretes_demorando: { rotulo: "Frete demorando", emoji: "🚚" },
};
export const ORDEM_PRONTAS = Object.keys(PRONTAS) as Pronta[];

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Reconhece a pergunta pronta no que a pessoa escreveu (ou null: vai para a IA). */
export function reconhecer(pergunta: string): Pronta | null {
  const t = sem(pergunta);
  if (/\bsaldo|quanto (tem|temos|ha) (no|nos|em) banco|dinheiro (em|no) (caixa|banco)/.test(t)) return "saldo";
  if (/(frete|entrega|envio|transportadora|rastreio).*(demor|atras|parad|nao chegou)|(demor|atras|parad).*(frete|entrega|envio)/.test(t)) return "fretes_demorando";
  if (/(peca|pecas|produto|produtos|estoque).*(falt|acab|abaixo|minimo|zerad|repor)|(falt|acab|repor).*(peca|pecas|produto|estoque)/.test(t)) return "pecas_faltando";
  if (/(vend|venda|vendas|faturou|faturamos|vendemos|vendi)/.test(t)) {
    if (/\bsemana\b/.test(t)) return "vendas_semana";
    if (/\bhoje\b/.test(t)) return "vendas_hoje";
  }
  return null;
}

/** Segunda-feira da semana do dia (aaaa-mm-dd); domingo conta na semana que termina nele. */
export function inicioDaSemana(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  const volta = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - volta);
  return d.toISOString().slice(0, 10);
}

/** Começo do dia no horário de Brasília, para filtrar data e hora gravadas em UTC. */
export const inicioDoDiaSP = (dia: string) => `${dia}T00:00:00-03:00`;

export type ProdutoEstoque = { id: string; descricao: string; sku: string | null; estoque_atual: number | null; estoque_minimo: number | null; kit?: boolean | null; sob_encomenda?: boolean | null };
/** Peças abaixo do mínimo (com mínimo cadastrado), as mais em falta primeiro; kit e sob encomenda ficam de fora. */
export function pecasFaltando<T extends ProdutoEstoque>(lista: T[]) {
  return lista
    .filter((p) => !p.kit && !p.sob_encomenda && Number(p.estoque_minimo) > 0 && (Number(p.estoque_atual) || 0) < Number(p.estoque_minimo))
    .map((p) => ({ ...p, falta: Number(p.estoque_minimo) - Math.max(0, Number(p.estoque_atual) || 0) }))
    .sort((a, b) => b.falta - a.falta || a.descricao.localeCompare(b.descricao));
}

export type EnvioPrazo = {
  id: string; status: string; entrega_prevista: string | null; coleta_prevista: string | null; coletado_em: string | null;
  entregue_em: string | null; aviso_atraso_em?: string | null;
};
/**
 * Frete demorando: ainda não entregue e (passou da entrega prevista, ou a coleta prevista passou sem coletar, ou está
 * na estrada há mais de 7 dias sem previsão). Devolve o motivo e há quantos dias.
 */
export function freteDemorando(e: EnvioPrazo, hojeDia: string): { motivo: string; dias: number } | null {
  if (e.entregue_em || ["entregue", "cancelado", "cotacao"].includes(e.status)) return null;
  const dias = (de: string) => Math.round((Date.parse(`${hojeDia}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 864e5);
  if (e.entrega_prevista && dias(e.entrega_prevista) > 0) return { motivo: "passou da entrega prevista", dias: dias(e.entrega_prevista) };
  if (!e.coletado_em && e.coleta_prevista && dias(e.coleta_prevista) > 0) return { motivo: "a transportadora ainda não coletou", dias: dias(e.coleta_prevista) };
  if (e.coletado_em && !e.entrega_prevista && dias(e.coletado_em) > 7) return { motivo: "na estrada sem previsão", dias: dias(e.coletado_em) };
  return null;
}

/** Soma em reais com centavos certos. */
export const somar = (valores: (number | string | null | undefined)[]) => Math.round(valores.reduce<number>((s, v) => s + (Number(v) || 0), 0) * 100) / 100;

/** Fala ou texto que é pergunta (e não acontecimento para anotar): termina com "?" ou começa como pergunta. */
export function ehPergunta(texto: string) {
  const t = sem(texto).trim().replace(/^(e|e ai|entao|me diz|me diga|ia)[,\s]+/, "");
  if (texto.trim().endsWith("?")) return true;
  return /^(o que|oque|que|quanto|quantos|quantas|quanta|qual|quais|quem|onde|quando|como|por que|porque|tem |existe|ha |mostra|me mostra|lista|listar|mostrar|cade)\b/.test(t);
}
