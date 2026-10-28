// Rodonaves (RTE): monta a simulação de cotação com os dados do envio e lê a resposta. Funções puras (testadas no
// Vitest); a chamada à API fica em functions/rodonaves.
// Endereços e campos conferidos no plugin público wc-rte-rodonaves-shipping (março/2026) e na documentação
// dev.rodonaves.com.br: token por usuário e senha (form-urlencoded, auth_type DEV, grant_type password) e Bearer nas
// chamadas; busca da cidade pelo CEP (CityId) e simula-cotacao com CNPJ do cliente da RTE, CEPs e cidades de origem e
// destino, valor da nota, peso total e volumes.

/** Servidores, na ordem em que a função tenta. Cada API da Rodonaves tem o seu token (dev.rodonaves.com.br →
 * Autenticação): a cotação usa o do quotation-apigateway. O 01wapi foi desligado pela Rodonaves (aviso "EoF 01wapi",
 * 10/10/2025) e fica só como último recurso. */
export const SERVIDORES_RTE = [
  { nome: "cotacao", token: "https://quotation-apigateway.rte.com.br/token", api: "https://quotation-apigateway.rte.com.br" },
  { nome: "rastreio", token: "https://tracking-apigateway.rte.com.br/token", api: "https://quotation-apigateway.rte.com.br" },
  { nome: "01wapi", token: "https://01wapi.rte.com.br/token", api: "https://01wapi.rte.com.br" },
] as const;

export const corpoToken = (usuario: string, senha: string) =>
  new URLSearchParams({ auth_type: "DEV", grant_type: "password", username: usuario, password: senha }).toString();

type VolumeRte = { quantidade?: number | string | null; peso_kg?: number | string | null; largura_cm?: number | string | null; altura_cm?: number | string | null; comprimento_cm?: number | string | null };
export type EnvioRte = { cep_origem?: string | null; cep_destino?: string | null; valor_mercadoria?: number | string | null; peso_total_kg?: number | string | null; volumes?: VolumeRte[] | null };

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const dig = (s?: string | null) => (s ?? "").replace(/\D/g, "");

/** O que falta no envio para a Rodonaves cotar. */
export function faltaParaCotarRte(e: EnvioRte, cnpj?: string | null) {
  const f: string[] = [];
  if (dig(cnpj).length !== 14) f.push("CNPJ da unidade");
  if (dig(e.cep_origem).length !== 8) f.push("CEP de origem");
  if (dig(e.cep_destino).length !== 8) f.push("CEP de destino");
  if (!(n(e.valor_mercadoria) > 0)) f.push("valor da mercadoria");
  if (!(pesoTotal(e) > 0)) f.push("peso");
  return f;
}

const pesoTotal = (e: EnvioRte) => n(e.peso_total_kg) || (e.volumes ?? []).reduce((s, v) => s + Math.max(n(v.quantidade ?? 1), 0) * n(v.peso_kg), 0);

/** Corpo do simula-cotacao. Medidas em centímetros e peso em kg, como o plugin manda. */
export function corpoSimulacao(e: EnvioRte, cnpj: string, origemCityId: number, destinoCityId: number) {
  return {
    CustomerTaxIdRegistration: dig(cnpj),
    OriginZipCode: dig(e.cep_origem),
    OriginCityId: origemCityId,
    DestinationZipCode: dig(e.cep_destino),
    DestinationCityId: destinoCityId,
    EletronicInvoiceValue: Math.round(n(e.valor_mercadoria) * 100) / 100,
    TotalWeight: Math.round(pesoTotal(e) * 1000) / 1000,
    Packs: (e.volumes ?? []).filter((v) => n(v.quantidade ?? 1) > 0).map((v) => ({
      AmountPackages: Math.round(n(v.quantidade ?? 1)),
      Weight: n(v.peso_kg),
      Length: n(v.comprimento_cm),
      Height: n(v.altura_cm),
      Width: n(v.largura_cm),
    })),
  };
}

/** Mensagem de erro que a RTE devolve ({ Message } ou [{ Message }]). */
export function mensagemRte(r: unknown): string | null {
  const x = Array.isArray(r) ? r[0] : r;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const m = o.Message ?? o.message ?? o.error_description ?? o.error;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return null;
}

/** Cidade da busca por CEP: { id, nome, uf } ou o motivo. */
export function lerCidade(r: unknown): { id: number; nome: string; uf: string } | { erro: string } {
  const x = (Array.isArray(r) ? r[0] : r) as Record<string, any> | null;
  const id = Number(x?.CityId ?? x?.cityId);
  if (x && id > 0) return { id, nome: String(x.CityDescription ?? x.cityDescription ?? ""), uf: String(x.UnitFederation?.Description ?? x.UnitFederation?.Initials ?? x.State ?? "") };
  return { erro: mensagemRte(r) ?? "CEP não encontrado na Rodonaves" };
}

/** Valor e prazo da simulação (Value e DeliveryTime; aceita variações de maiúscula). */
export function lerSimulacao(r: unknown): { valor: number; prazo: number | null } | { erro: string } {
  const x = (Array.isArray(r) ? r[0] : r) as Record<string, any> | null;
  const valor = Number(x?.Value ?? x?.value ?? x?.TotalValue ?? x?.FreightValue);
  if (x && Number.isFinite(valor) && valor > 0) {
    const prazo = Number(x.DeliveryTime ?? x.deliveryTime ?? x.Deadline);
    return { valor: Math.round(valor * 100) / 100, prazo: Number.isFinite(prazo) && prazo >= 0 ? Math.round(prazo) : null };
  }
  return { erro: mensagemRte(r) ?? "A Rodonaves não devolveu valor para este frete" };
}
