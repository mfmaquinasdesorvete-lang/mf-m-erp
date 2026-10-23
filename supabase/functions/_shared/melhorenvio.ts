// Melhor Envio: cotação em várias transportadoras de uma vez (Correios sem contrato, Jadlog, Loggi, J&T, Azul Cargo,
// LATAM Cargo, Buslog…). Funções puras (testadas no Vitest); a chamada fica em functions/melhorenvio.
// API v2: POST {base}/api/v2/me/shipment/calculate com Bearer (token gerado no painel do Melhor Envio, permissão
// shipping-calculate), Accept/Content-Type JSON e User-Agent "aplicação (e-mail de contato)". Corpo: from/to com
// postal_code, products [{ id, width, height, length (cm), weight (kg), insurance_value, quantity }] e options
// (insurance_value, receipt, own_hand). Resposta: lista de serviços { id, name, price, custom_price, delivery_time,
// custom_delivery_time, company: { name }, error }.

export const BASE_ME = { producao: "https://melhorenvio.com.br", sandbox: "https://sandbox.melhorenvio.com.br" } as const;

type VolumeMe = { quantidade?: number | string | null; peso_kg?: number | string | null; largura_cm?: number | string | null; altura_cm?: number | string | null; comprimento_cm?: number | string | null };
export type EnvioMe = { cep_origem?: string | null; cep_destino?: string | null; valor_mercadoria?: number | string | null; volumes?: VolumeMe[] | null };

export type ServicoMe = { servico_id: number | null; servico: string; empresa: string; valor: number; prazo: number | null };

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const dig = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const volumesValidos = (e: EnvioMe) => (e.volumes ?? []).filter((v) => n(v.quantidade ?? 1) > 0);

/** O que falta no envio para o Melhor Envio cotar (CEPs e cada volume com peso e as 3 medidas). */
export function faltaParaCotarMe(e: EnvioMe) {
  const f: string[] = [];
  if (dig(e.cep_origem).length !== 8) f.push("CEP de origem");
  if (dig(e.cep_destino).length !== 8) f.push("CEP de destino");
  const vols = volumesValidos(e);
  if (!vols.length) f.push("volumes");
  else if (vols.some((v) => !(n(v.peso_kg) > 0) || !(n(v.largura_cm) > 0) || !(n(v.altura_cm) > 0) || !(n(v.comprimento_cm) > 0))) f.push("peso e medidas de cada volume");
  return f;
}

/** Corpo do cálculo: cada volume vira um "produto" com a quantidade; o seguro é o valor da mercadoria dividido. */
export function corpoCalculoMe(e: EnvioMe) {
  const vols = volumesValidos(e);
  const qtd = vols.reduce((s, v) => s + Math.round(n(v.quantidade ?? 1)), 0) || 1;
  const valor = Math.round(n(e.valor_mercadoria) * 100) / 100;
  return {
    from: { postal_code: dig(e.cep_origem) },
    to: { postal_code: dig(e.cep_destino) },
    products: vols.map((v, i) => ({
      id: String(i + 1),
      width: n(v.largura_cm), height: n(v.altura_cm), length: n(v.comprimento_cm), weight: n(v.peso_kg),
      insurance_value: Math.round((valor / qtd) * 100) / 100,
      quantity: Math.round(n(v.quantidade ?? 1)),
    })),
    options: { receipt: false, own_hand: false },
  };
}

/** Mensagem de erro do Melhor Envio ({ message } ou { errors: { campo: [..] } }). */
export function mensagemMe(r: unknown): string | null {
  const o = (r ?? {}) as Record<string, unknown>;
  if (o.errors && typeof o.errors === "object") {
    const lista = Object.values(o.errors as Record<string, unknown>).flat().filter((x) => typeof x === "string");
    if (lista.length) return (lista as string[]).join("; ");
  }
  const m = o.message ?? o.error;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

/** Serviços cotados (com preço), do mais barato ao mais caro, e os que não atendem com o motivo. */
export function lerCalculoMe(r: unknown): { servicos: ServicoMe[]; sem: { servico: string; empresa: string; motivo: string }[] } | { erro: string } {
  if (!Array.isArray(r)) return { erro: mensagemMe(r) ?? "o Melhor Envio respondeu fora do padrão" };
  const servicos: ServicoMe[] = [];
  const sem: { servico: string; empresa: string; motivo: string }[] = [];
  for (const x of r as Record<string, any>[]) {
    const servico = String(x?.name ?? "").trim();
    const empresa = String(x?.company?.name ?? "").trim();
    if (!servico && !empresa) continue;
    const valor = n(x.custom_price ?? x.price);
    if (x.error || !(valor > 0)) { sem.push({ servico, empresa, motivo: String(x.error ?? "sem preço para este envio") }); continue; }
    const prazo = n(x.custom_delivery_time ?? x.delivery_time);
    servicos.push({ servico_id: Number.isFinite(Number(x.id)) ? Number(x.id) : null, servico, empresa, valor: Math.round(valor * 100) / 100, prazo: prazo > 0 ? Math.round(prazo) : null });
  }
  servicos.sort((a, b) => a.valor - b.valor);
  return { servicos, sem };
}
