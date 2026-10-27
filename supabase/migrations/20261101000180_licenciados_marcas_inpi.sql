set lock_timeout = '8s';
-- My Frost Sorveterias (pedido de 27/10): acompanhar as marcas no INPI (My Frost Sorveterias e Yozzy): processo, situação,
-- último despacho, prazo para responder (exigência, oposição, indeferimento: 60 dias da RPI) e a última conferência da
-- RPI (sai toda terça). Como as lojas: cada linha é de quem a criou e só essa pessoa lê; nada entra na MF. Sem apagar:
-- marca que não segue fica como arquivada.
create table if not exists public.licenciados_marcas (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  marca text not null default 'myfrost' check (marca in ('myfrost', 'yozzy')),
  processo text check (processo is null or length(processo) <= 30),
  classe text check (classe is null or length(classe) <= 30),
  titular text check (titular is null or length(titular) <= 160),
  situacao text not null default 'exame' check (situacao in ('deposito', 'oposicao', 'exame', 'exigencia', 'deferida', 'concedida', 'indeferida', 'recurso', 'arquivada')),
  publicada_em date,
  fim_oposicao date,
  ultimo_despacho text check (ultimo_despacho is null or length(ultimo_despacho) <= 300),
  despacho_em date,
  prazo_resposta date,
  conferida_em date,
  observacoes text check (observacoes is null or length(observacoes) <= 4000),
  criado_em timestamptz not null default now()
);
comment on table public.licenciados_marcas is 'My Frost Sorveterias: marcas no INPI (processo, situação, despacho, prazos), só o dono lê';

alter table public.licenciados_marcas enable row level security;
revoke all on public.licenciados_marcas from anon, public;
grant select, insert, update on public.licenciados_marcas to authenticated;
drop policy if exists licenciados_marcas_ler on public.licenciados_marcas;
drop policy if exists licenciados_marcas_criar on public.licenciados_marcas;
drop policy if exists licenciados_marcas_mudar on public.licenciados_marcas;
create policy licenciados_marcas_ler on public.licenciados_marcas for select to authenticated using (dono = auth.uid());
create policy licenciados_marcas_criar on public.licenciados_marcas for insert to authenticated with check (dono = auth.uid());
create policy licenciados_marcas_mudar on public.licenciados_marcas for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
