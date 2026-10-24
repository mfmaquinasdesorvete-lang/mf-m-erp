-- Época Crown Móveis (nome antigo da MF), pedido de 24/10: marca quem trabalhou naquela época e guarda o que
-- cada um recebeu (os extratos do ERP só começam em 2024). Mesmo acesso de funcionarios: só admin e financeiro.
alter table public.funcionarios add column if not exists epoca_crown boolean not null default false;
comment on column public.funcionarios.epoca_crown is 'Trabalhou na época da Crown Móveis (antes de virar MF); aparece na página Crown.';

create table if not exists public.funcionario_pagamentos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  competencia date not null,
  tipo text not null check (tipo in ('salario', 'adiantamento', 'por_fora', 'rescisao', 'decimo', 'ferias', 'outro')),
  valor numeric(12, 2) not null check (valor > 0),
  origem text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.funcionario_pagamentos is 'Pagamentos antigos a funcionários (antes dos extratos do ERP), lidos de planilhas, recibos e rescisões.';
create index if not exists funcionario_pagamentos_funcionario on public.funcionario_pagamentos (funcionario_id, competencia);

alter table public.funcionario_pagamentos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'funcionario_pagamentos' and policyname = 'rh_pagamentos') then
    create policy "rh_pagamentos" on public.funcionario_pagamentos for all to authenticated
      using ((select public.tem_papel('financeiro'))) with check ((select public.tem_papel('financeiro')));
  end if;
end $$;
revoke all on public.funcionario_pagamentos from anon;
grant select, insert, update, delete on public.funcionario_pagamentos to authenticated;
