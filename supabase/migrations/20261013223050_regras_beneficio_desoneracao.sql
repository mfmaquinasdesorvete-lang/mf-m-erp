-- Regras de tributação: o que faltava para emitir como o Tiny emite na matriz SC.
--   * icms_reducao_por_aliquota: redução da base por alíquota, ex.: {"17": 48.23, "12": 26.66, "7": 26.57}
--     (RICMS/SC, Anexo 2, art. 9, I: máquinas industriais do Anexo 1, Seção VI). Alíquota fora da lista = sem redução.
--   * codigo_beneficio: código de benefício fiscal da UF (cBenef), ex.: SC820028. SC exige nos CST com benefício.
--   * icms_desonerar / icms_motivo_desoneracao / icms_abater_desonerado: informar o ICMS desonerado (vICMSDeson),
--     o motivo (motDesICMS, 9 = outros) e se ele é abatido do total da nota (indDeduzDeson, NT 2023.004).
--   * ipi_destacar: false = não destacar IPI (a nota sai sem o grupo do IPI).
-- Só acrescenta colunas e restrições; nenhuma regra existente muda de comportamento.

alter table public.regras_tributacao add column if not exists icms_reducao_por_aliquota jsonb;
alter table public.regras_tributacao add column if not exists codigo_beneficio text;
alter table public.regras_tributacao add column if not exists icms_desonerar boolean not null default false;
alter table public.regras_tributacao add column if not exists icms_motivo_desoneracao text;
alter table public.regras_tributacao add column if not exists icms_abater_desonerado boolean not null default false;
alter table public.regras_tributacao add column if not exists ipi_destacar boolean;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'regras_tributacao_codigo_beneficio_check') then
    alter table public.regras_tributacao add constraint regras_tributacao_codigo_beneficio_check
      check (codigo_beneficio is null or codigo_beneficio ~ '^[A-Z0-9]{8,10}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'regras_tributacao_motivo_desoneracao_check') then
    alter table public.regras_tributacao add constraint regras_tributacao_motivo_desoneracao_check
      check (icms_motivo_desoneracao is null or icms_motivo_desoneracao ~ '^[0-9]{1,2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'regras_tributacao_reducao_por_aliquota_check') then
    alter table public.regras_tributacao add constraint regras_tributacao_reducao_por_aliquota_check
      check (icms_reducao_por_aliquota is null or jsonb_typeof(icms_reducao_por_aliquota) = 'object');
  end if;
end $$;
