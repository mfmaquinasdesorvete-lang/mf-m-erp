// Correção de uma NF-e rejeitada antes de reenviar: só o que não muda valores nem impostos
// (natureza, informações complementares, dados do destinatário e NCM/CFOP/CEST/descrição dos itens).
import { HttpError, onlyDigits } from "./supabase.ts";

/** Campos do destinatário que podem ser corrigidos numa nota rejeitada. */
const CAMPOS_DEST = ["nome_destinatario", "inscricao_estadual_destinatario", "indicador_inscricao_estadual_destinatario", "logradouro_destinatario",
  "numero_destinatario", "complemento_destinatario", "bairro_destinatario", "municipio_destinatario", "uf_destinatario", "cep_destinatario",
  "telefone_destinatario", "email_destinatario"];

/** Aplica as correções permitidas ao payload enviado (nada que mude valores ou impostos). */
export function corrigirPayload(payload: any, alt: any) {
  const p = structuredClone(payload);
  const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  if (alt?.natureza_operacao !== undefined) {
    const v = texto(alt.natureza_operacao, 60);
    if (!v) throw new HttpError(400, "informe a natureza da operação");
    p.natureza_operacao = v;
  }
  if (alt?.informacoes_adicionais_contribuinte !== undefined) p.informacoes_adicionais_contribuinte = texto(alt.informacoes_adicionais_contribuinte, 2000) || undefined;
  for (const k of CAMPOS_DEST) {
    if (alt?.destinatario?.[k] === undefined) continue;
    let v: any = texto(alt.destinatario[k], 120);
    if (["cep_destinatario", "inscricao_estadual_destinatario", "telefone_destinatario"].includes(k)) v = onlyDigits(v);
    if (k === "uf_destinatario") v = v.toUpperCase();
    if (k === "indicador_inscricao_estadual_destinatario") {
      v = Number(v);
      if (![1, 2, 9].includes(v)) throw new HttpError(400, "indicador da IE: 1 contribuinte, 2 isento ou 9 não contribuinte");
    }
    p[k] = v === "" ? undefined : v;
  }
  if (p.indicador_inscricao_estadual_destinatario !== 1) delete p.inscricao_estadual_destinatario;
  for (const it of Array.isArray(alt?.itens) ? alt.itens : []) {
    const item = (p.items ?? []).find((x: any) => Number(x.numero_item) === Number(it.numero_item));
    if (!item) throw new HttpError(400, `item ${it.numero_item} não existe na nota`);
    if (it.descricao !== undefined) {
      const d = texto(it.descricao, 120);
      if (!d) throw new HttpError(400, `item ${it.numero_item}: informe a descrição`);
      item.descricao = d;
    }
    if (it.codigo_ncm !== undefined) {
      const ncm = onlyDigits(it.codigo_ncm);
      if (ncm.length !== 8) throw new HttpError(400, `item ${it.numero_item}: NCM com 8 dígitos`);
      item.codigo_ncm = ncm;
    }
    if (it.cfop !== undefined) {
      const cfop = onlyDigits(it.cfop);
      if (!/^[1-7]\d{3}$/.test(cfop)) throw new HttpError(400, `item ${it.numero_item}: CFOP com 4 dígitos`);
      item.cfop = cfop;
    }
    if (it.cest !== undefined) {
      const cest = onlyDigits(it.cest);
      if (cest && cest.length !== 7) throw new HttpError(400, `item ${it.numero_item}: CEST com 7 dígitos`);
      if (cest) item.cest = cest; else delete item.cest;
    }
  }
  p.data_emissao = new Date().toISOString();
  return p;
}

