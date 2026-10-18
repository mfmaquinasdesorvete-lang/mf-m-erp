set lock_timeout = '8s';

-- data de conclusão e última mudança do item
create or replace function public.trg_scrum_item()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'feito' and (tg_op = 'INSERT' or old.status is distinct from 'feito') then
    new.concluido_em := now();
  elsif new.status <> 'feito' then
    new.concluido_em := null;
  end if;
  return new;
end $$;
create trigger trg_scrum_item before insert or update on public.scrum_itens for each row execute function public.trg_scrum_item();
