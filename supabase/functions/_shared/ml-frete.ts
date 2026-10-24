// Frete pelo Mercado Envios (conta da MF no Mercado Livre): GET /users/{id}/shipping_options?zip_code&dimensions.
// É o preço que o Mercado Livre cobra do comprador para um pacote saindo do endereço da conta. Funções puras, testadas
// no Vitest; a chamada fica em functions/frete-cotar.
import type { VolumeFrete } from "./frete-cotar.ts";

/** Os volumes viram um pacote só (o Mercado Envios cota um pacote): maior largura e comprimento, alturas somadas. */
export function pacoteMl(volumes: VolumeFrete[]) {
  if (!volumes.length) return null;
  let largura = 0, comprimento = 0, altura = 0, peso = 0;
  for (const v of volumes) {
    largura = Math.max(largura, v.largura_cm);
    comprimento = Math.max(comprimento, v.comprimento_cm);
    altura += v.altura_cm * v.quantidade;
    peso += v.peso_kg * v.quantidade;
  }
  const c = (x: number) => Math.max(1, Math.ceil(x));
  // formato do Mercado Livre: altura x largura x comprimento (cm), peso em gramas
  return `${c(altura)}x${c(largura)}x${c(comprimento)},${Math.max(1, Math.round(peso * 1000))}`;
}

/** Dias úteis de hoje até a data (sem contar hoje). */
export function diasUteisAte(data: string, hoje: Date) {
  const fim = new Date(`${data.slice(0, 10)}T12:00:00Z`);
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12));
  let n = 0;
  while (d < fim && n < 60) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
  }
  return n;
}

export type OpcaoMl = { servico: string; valor: number; prazo: number | null; metodo: string };

/** Opções da resposta: o valor sem desconto de reputação (list_cost) e o prazo em dias úteis. */
export function lerOpcoesMl(resp: unknown, hoje = new Date()): OpcaoMl[] {
  const opcoes = (resp as { options?: unknown[] } | null)?.options;
  if (!Array.isArray(opcoes)) return [];
  return opcoes.flatMap((o) => {
    const x = o as { name?: string; list_cost?: number; cost?: number; shipping_method_id?: number; shipping_option_type?: string; estimated_delivery_time?: { date?: string } };
    const valor = Number(x.list_cost ?? x.cost);
    // retirada em agência não serve para o cliente da loja
    if (!(valor > 0) || (x.shipping_option_type && x.shipping_option_type !== "address")) return [];
    const data = x.estimated_delivery_time?.date;
    return [{ servico: x.name ?? "Normal", valor: Math.round(valor * 100) / 100, prazo: data ? diasUteisAte(data, hoje) : null, metodo: String(x.shipping_method_id ?? x.name ?? "") }];
  });
}
