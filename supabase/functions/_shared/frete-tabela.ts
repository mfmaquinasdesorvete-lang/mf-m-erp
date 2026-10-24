// Cotação pela tabela de frete negociada (Fretes → Tabelas de frete), para as transportadoras sem API. Funções puras,
// testadas no Vitest; quem lê as tabelas do banco é functions/frete-cotar.
// Conta, como nas tabelas das transportadoras (rodoviário fracionado):
//   peso taxado = maior entre o peso real e o cubado (m³ × fator de cubagem, 300 kg/m³ no rodoviário);
//   frete peso  = valor da faixa de peso (acima da última: + R$/kg excedente) ou peso × R$/kg;
//   + frete-valor (% da nota) + GRIS (% da nota, com mínimo) + pedágio (por fração de 100 kg) + taxa por CT-e
//   + taxa da cidade (TDA/TRT); no mínimo o frete mínimo; ICMS por fora: divide por (1 − alíquota).
import type { VolumeFrete } from "./frete-cotar.ts";

export type FaixaPeso = { ate_kg: number; valor: number };

export type TabelaFrete = {
  id: string; nome: string; transportadora: string;
  fator_cubagem: number; ad_valorem_pct: number; gris_pct: number; gris_minimo: number;
  pedagio_valor: number; pedagio_fracao_kg: number; taxa_despacho: number; frete_minimo: number;
  icms_por_fora: boolean; icms_interno_pct: number;
};

export type DestinoTabela = {
  uf: string; cidade: string | null; cep_inicio: string | null; cep_fim: string | null; prazo_dias: number | null;
  faixas: FaixaPeso[]; excedente_kg: number | null; frete_kg: number | null;
  frete_minimo: number | null; ad_valorem_pct: number | null; taxa_extra: number | null;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;
export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Destino da tabela para o CEP: faixa de CEP (a mais estreita), depois a cidade, depois o estado inteiro. */
export function acharDestino(destinos: DestinoTabela[], d: { cep: string; cidade: string | null; uf: string | null }) {
  const uf = (d.uf ?? "").toUpperCase();
  const porCep = destinos
    .filter((x) => x.cep_inicio && x.cep_fim && d.cep >= x.cep_inicio && d.cep <= x.cep_fim)
    .sort((a, b) => (Number(a.cep_fim) - Number(a.cep_inicio)) - (Number(b.cep_fim) - Number(b.cep_inicio)));
  if (porCep.length) return porCep[0];
  const cidade = d.cidade ? semAcento(d.cidade) : "";
  const doEstado = destinos.filter((x) => x.uf === uf && !x.cep_inicio);
  return (cidade && doEstado.find((x) => x.cidade && semAcento(x.cidade) === cidade)) || doEstado.find((x) => !x.cidade) || null;
}

/** Alíquota de ICMS do frete: dentro do estado, a da tabela; entre estados, 7% saindo do Sul/Sudeste (menos ES) para
 * Norte, Nordeste, Centro-Oeste e ES, senão 12%. */
export function aliquotaIcms(ufOrigem: string, ufDestino: string, interno: number) {
  if (ufOrigem === ufDestino) return interno;
  const sulSudeste = ["SC", "RS", "PR", "SP", "RJ", "MG"];
  return sulSudeste.includes(ufOrigem) && !sulSudeste.includes(ufDestino) ? 7 : 12;
}

export function cubagemM3(volumes: VolumeFrete[]) {
  return volumes.reduce((s, v) => s + v.quantidade * v.largura_cm * v.altura_cm * v.comprimento_cm / 1_000_000, 0);
}

export type CotacaoTabela = { valor: number; prazo: number | null; peso_taxado: number; detalhe: Record<string, number> };

/** Frete pela tabela, ou null quando a tabela não atende o destino ou não tem preço para o peso. */
export function cotarPelaTabela(t: TabelaFrete, destinos: DestinoTabela[], carga: { volumes: VolumeFrete[]; peso_kg: number; valor_nf: number },
  destino: { cep: string; cidade: string | null; uf: string | null }, ufOrigem: string): CotacaoTabela | null {
  const dest = acharDestino(destinos, destino);
  if (!dest) return null;
  const peso = Math.max(n(carga.peso_kg), cubagemM3(carga.volumes) * (n(t.fator_cubagem) || 300));
  if (!(peso > 0)) return null;
  const faixas = [...(dest.faixas ?? [])].filter((f) => n(f.ate_kg) > 0).sort((a, b) => n(a.ate_kg) - n(b.ate_kg));
  let fretePeso: number;
  if (faixas.length) {
    const faixa = faixas.find((f) => peso <= n(f.ate_kg));
    if (faixa) fretePeso = n(faixa.valor);
    else {
      const ultima = faixas[faixas.length - 1];
      // acima da última faixa: o excedente por kg; sem excedente, o R$/kg da tabela; sem nenhum, não cota
      const porKg = dest.excedente_kg ?? dest.frete_kg;
      if (porKg == null) return null;
      fretePeso = n(ultima.valor) + (peso - n(ultima.ate_kg)) * n(porKg);
    }
  } else if (dest.frete_kg != null) fretePeso = peso * n(dest.frete_kg);
  else return null;

  const nf = n(carga.valor_nf);
  const adValorem = nf * n(dest.ad_valorem_pct ?? t.ad_valorem_pct) / 100;
  const gris = Math.max(nf * n(t.gris_pct) / 100, n(t.gris_minimo));
  const pedagio = n(t.pedagio_valor) > 0 ? Math.ceil(peso / (n(t.pedagio_fracao_kg) || 100)) * n(t.pedagio_valor) : 0;
  const taxas = n(t.taxa_despacho) + n(dest.taxa_extra);
  const minimo = n(dest.frete_minimo ?? t.frete_minimo);
  let total = Math.max(fretePeso + adValorem + gris + pedagio + taxas, minimo);
  let icms = 0;
  if (t.icms_por_fora) {
    const aliq = aliquotaIcms(ufOrigem.toUpperCase(), (destino.uf ?? "").toUpperCase(), n(t.icms_interno_pct));
    icms = total / (1 - aliq / 100) - total;
    total += icms;
  }
  return {
    valor: r2(total), prazo: dest.prazo_dias ?? null, peso_taxado: Math.round(peso * 1000) / 1000,
    detalhe: { frete_peso: r2(fretePeso), ad_valorem: r2(adValorem), gris: r2(gris), pedagio: r2(pedagio), taxas: r2(taxas), icms: r2(icms) },
  };
}

/** Faixas de peso das colunas da planilha: "até 10 kg", "10 kg", "0-10", "10kg" → 10. */
export function kgDaColuna(titulo: string): number | null {
  const t = semAcento(titulo);
  if (!/kg|\bate\b|\d+\s*a\s*\d+|\d+\s+\d+/.test(t) || /excedente|minimo|prazo|cep|valor|ad|gris/.test(t)) return null;
  const nums = (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  return nums.length ? nums[nums.length - 1] : null;
}

/** Número da planilha: 1234.5, "1.234,56", "R$ 12,50", "0,5%". */
export function numeroPlanilha(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[R$%\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

/** Colunas da planilha modelo (Fretes → Tabelas de frete → Baixar modelo). */
export const COLUNAS_MODELO = ["UF", "Cidade", "CEP inicial", "CEP final", "Prazo (dias úteis)", "até 10 kg", "até 20 kg", "até 30 kg", "até 50 kg", "até 100 kg",
  "Excedente R$/kg", "Frete R$/kg", "Frete mínimo", "Frete-valor %", "Taxa da cidade"];

/** Linhas da planilha viram destinos. Linha sem UF ou sem preço vai para os erros (com o número da linha). */
export function destinosDaPlanilha(linhas: Record<string, unknown>[]) {
  const destinos: DestinoTabela[] = [];
  const erros: string[] = [];
  linhas.forEach((l, i) => {
    let uf = "", cidade: string | null = null, cepI: string | null = null, cepF: string | null = null;
    const x: Partial<DestinoTabela> = {};
    const faixas: FaixaPeso[] = [];
    for (const [col, valor] of Object.entries(l)) {
      const c = semAcento(col);
      const txt = String(valor ?? "").trim();
      if (!txt) continue;
      if (c === "uf" || c === "estado") uf = txt.toUpperCase().slice(0, 2);
      else if (/^(cidade|municipio|destino|praca)/.test(c)) cidade = txt;
      else if (/^cep/.test(c)) {
        const cep = txt.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
        if (/final|fim|ate/.test(c)) cepF = cep; else cepI = cep;
      } else if (/prazo/.test(c)) x.prazo_dias = Math.round(numeroPlanilha(valor) ?? 0) || null;
      else if (/excedente/.test(c)) x.excedente_kg = numeroPlanilha(valor);
      else if (/minimo/.test(c)) x.frete_minimo = numeroPlanilha(valor);
      else if (/frete valor|ad valorem|advalorem|nf/.test(c)) x.ad_valorem_pct = numeroPlanilha(valor);
      else if (/taxa|tda|trt/.test(c)) x.taxa_extra = numeroPlanilha(valor);
      else if (/r kg|por kg|frete kg|frete peso/.test(c)) x.frete_kg = numeroPlanilha(valor);
      else {
        const kg = kgDaColuna(col);
        const v = numeroPlanilha(valor);
        if (kg && v != null) faixas.push({ ate_kg: kg, valor: v });
      }
    }
    const linha = i + 2;
    if (!/^[A-Z]{2}$/.test(uf)) { erros.push(`linha ${linha}: falta a UF`); return; }
    if (!faixas.length && x.frete_kg == null) { erros.push(`linha ${linha}: sem faixa de peso nem R$/kg`); return; }
    if ((cepI && !cepF) || (!cepI && cepF)) { erros.push(`linha ${linha}: CEP inicial e final vão juntos`); return; }
    destinos.push({
      uf, cidade, cep_inicio: cepI, cep_fim: cepF, prazo_dias: x.prazo_dias ?? null, faixas: faixas.sort((a, b) => a.ate_kg - b.ate_kg),
      excedente_kg: x.excedente_kg ?? null, frete_kg: x.frete_kg ?? null, frete_minimo: x.frete_minimo ?? null,
      ad_valorem_pct: x.ad_valorem_pct ?? null, taxa_extra: x.taxa_extra ?? null,
    });
  });
  return { destinos, erros };
}
