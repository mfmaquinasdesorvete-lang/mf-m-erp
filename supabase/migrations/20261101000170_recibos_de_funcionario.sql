-- Recibos de funcionário (26/10): ficam só na área de Funcionários e só admin e financeiro leem (como o resto do RH).
-- É de funcionário o recibo de pagamento de conta da folha/pró-labore ou cujo recebedor está no cadastro de funcionários.
alter table public.recibos add column if not exists de_funcionario boolean not null default false;
comment on column public.recibos.de_funcionario is 'Recibo de pagamento a funcionário: aparece em Funcionários → Recibos e só admin e financeiro leem.';

-- gatilho security definer: quem emite o recibo (vendas, por exemplo) não lê funcionarios, mas a marca precisa sair certa
create or replace function public.trg_recibo_de_funcionario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.de_funcionario := new.tipo = 'pagamento' and (
    exists (select 1 from contas_pagar c where c.id = new.conta_pagar_id and c.categoria in ('folha', 'pró-labore'))
    or exists (select 1 from funcionarios f where lower(btrim(f.nome)) = lower(btrim(coalesce(new.recebedor_nome, ''))))
  );
  return new;
end $$;
drop trigger if exists trg_recibo_de_funcionario on public.recibos;
create trigger trg_recibo_de_funcionario before insert or update of tipo, conta_pagar_id, recebedor_nome on public.recibos
  for each row execute function public.trg_recibo_de_funcionario();

-- marca os que já existem
update public.recibos r set de_funcionario = r.tipo = 'pagamento' and (
  exists (select 1 from public.contas_pagar c where c.id = r.conta_pagar_id and c.categoria in ('folha', 'pró-labore'))
  or exists (select 1 from public.funcionarios f where lower(btrim(f.nome)) = lower(btrim(coalesce(r.recebedor_nome, ''))))
);

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recibos' and policyname = 'recibo_funcionario_restrito') then
    create policy "recibo_funcionario_restrito" on public.recibos as restrictive for all to authenticated
      using (not de_funcionario or (select public.tem_papel('financeiro')))
      with check (not de_funcionario or (select public.tem_papel('financeiro')));
  end if;
end $$;
