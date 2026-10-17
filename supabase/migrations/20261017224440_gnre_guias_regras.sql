alter table public.gnre_guias drop constraint if exists gnre_guias_situacao_check;
alter table public.gnre_guias add constraint gnre_guias_situacao_check check (situacao in ('a_gerar', 'gerada', 'cancelada'));
comment on table public.gnre_guias is 'GNRE de cada NF-e interestadual com DIFAL, FCP ou ICMS-ST: valores, vencimento, conta a pagar e a guia gerada no portal';
create index if not exists gnre_guias_conta_idx on public.gnre_guias (conta_pagar_id);
create index if not exists gnre_guias_situacao_idx on public.gnre_guias (situacao, vencimento);
