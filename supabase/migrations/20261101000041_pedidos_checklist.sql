-- Checklist dos pedidos feitos ao ERP (Sobre → Pedidos): cada pedido da conversa vira um item com a situação
-- (feito, fazendo, na fila, precisa de você), quem conferiu e quantas vezes o item mudou.
create table if not exists public.pedidos_checklist (
  id uuid primary key default gen_random_uuid(),
  pedido_em date not null default current_date,
  grupo text not null,
  item text not null,
  detalhe text,
  tela text,
  situacao text not null default 'fila' check (situacao in ('feito', 'fazendo', 'fila', 'voce')),
  ordem int not null default 0,
  conferido boolean not null default false,
  conferido_em timestamptz,
  conferido_por uuid,
  alteracoes int not null default 0,
  versao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pedidos_checklist_dia on public.pedidos_checklist (pedido_em desc, ordem);

-- cada mudança de texto ou situação soma 1 (conferir não conta)
create or replace function public.pedidos_checklist_contar() returns trigger language plpgsql as $$
begin
  if (new.item, new.detalhe, new.situacao, new.grupo, new.tela) is distinct from (old.item, old.detalhe, old.situacao, old.grupo, old.tela) then
    new.alteracoes = old.alteracoes + 1;
  end if;
  new.updated_at = now();
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'pedidos_checklist_contar') then
    create trigger pedidos_checklist_contar before update on public.pedidos_checklist
      for each row execute function public.pedidos_checklist_contar();
  end if;
end $$;

alter table public.pedidos_checklist enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pedidos_checklist' and policyname = 'pedidos_checklist_ler') then
    create policy pedidos_checklist_ler on public.pedidos_checklist for select to authenticated using (true);
  end if;
end $$;

-- marcar/desmarcar como conferido (qualquer usuário logado; fica registrado quem e quando)
create or replace function public.conferir_pedido_checklist(p_id uuid, p_conferido boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'entre no ERP para conferir'; end if;
  update pedidos_checklist set conferido = p_conferido,
    conferido_em = case when p_conferido then now() end,
    conferido_por = case when p_conferido then auth.uid() end
   where id = p_id;
end $$;
revoke execute on function public.conferir_pedido_checklist(uuid, boolean) from public, anon;
grant execute on function public.conferir_pedido_checklist(uuid, boolean) to authenticated;
