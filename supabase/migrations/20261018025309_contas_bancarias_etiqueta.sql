-- Selo no cartão da conta bancária (Bancos e conciliação): ex.: de quem é a conta. Opcional, até 30 letras.
alter table public.contas_bancarias add column if not exists etiqueta text;
alter table public.contas_bancarias drop constraint if exists contas_bancarias_etiqueta_tamanho;
alter table public.contas_bancarias add constraint contas_bancarias_etiqueta_tamanho check (etiqueta is null or char_length(etiqueta) between 1 and 30);
comment on column public.contas_bancarias.etiqueta is 'Selo mostrado no cartão da conta em Bancos e conciliação (ex.: de quem é a conta). Opcional, até 30 letras.';
