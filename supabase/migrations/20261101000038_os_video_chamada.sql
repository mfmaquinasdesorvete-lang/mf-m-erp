-- OS de atendimento por vídeo chamada (ex.: o cliente comprou a peça e não sabe trocar): a máquina não vem à MF.
--  * atendimento: 'oficina' (a máquina entra na MF, como sempre) ou 'video' (vídeo chamada agendada);
--  * agendado_em: dia e hora marcados com o cliente;
--  * horas_tecnicas: quantas horas de técnico (o valor da hora é o de Configurações → Assistência, o mesmo do diagnóstico por vídeo).
alter table public.ordens_servico
  add column if not exists atendimento text not null default 'oficina',
  add column if not exists agendado_em timestamptz,
  add column if not exists horas_tecnicas numeric(6,2);
do $$ begin
  alter table public.ordens_servico add constraint ordens_servico_atendimento_chk check (atendimento in ('oficina', 'video'));
exception when duplicate_object then null; end $$;
create index if not exists ordens_servico_agendado_idx on public.ordens_servico (agendado_em) where agendado_em is not null;

-- vídeo chamada: o Pix da hora técnica vem antes do agendamento
alter table public.ordens_servico add column if not exists video_pago_em timestamptz;
