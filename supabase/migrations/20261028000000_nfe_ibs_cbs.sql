-- =====================================================================
-- NF-e na Reforma Tributária (IBS/CBS) e tela "Configurações da NF-e".
--   * Cada item da NF-e leva o grupo IBS/CBS: CST e classificação tributária
--     (cClassTrib) da unidade; na venda, base, alíquotas e valores.
--     2026 é ano de teste: CBS 0,9% e IBS 0,1% (estadual), sem recolhimento.
--   * Transferência entre estabelecimentos do mesmo contribuinte: CST 410 /
--     cClassTrib 410002 (não incidência, LC 214/2025 art. 6º, II), sem valores.
--   * IPI com alíquota zero (TIPI 0%) sai com o CST próprio (51).
--   * Regras de tributação podem valer só para algumas UFs de destino e
--     trocar o CST/cClassTrib do IBS/CBS.
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================

alter table public.unidades
  add column if not exists ibs_cbs_cst text not null default '000',
  add column if not exists ibs_cbs_class_trib text not null default '000001',
  add column if not exists transf_ibs_cbs_cst text not null default '410',
  add column if not exists transf_ibs_cbs_class_trib text not null default '410002',
  add column if not exists ipi_cst_aliquota_zero text not null default '51',
  add column if not exists informacoes_complementares text;

alter table public.configuracoes
  add column if not exists ibs_cbs_ativo boolean not null default true,
  add column if not exists cbs_aliquota numeric(7,4) not null default 0.9,
  add column if not exists ibs_uf_aliquota numeric(7,4) not null default 0.1,
  add column if not exists ibs_mun_aliquota numeric(7,4) not null default 0;

alter table public.regras_tributacao
  add column if not exists ufs_destino text[],
  add column if not exists ibs_cbs_cst text,
  add column if not exists ibs_cbs_class_trib text;
