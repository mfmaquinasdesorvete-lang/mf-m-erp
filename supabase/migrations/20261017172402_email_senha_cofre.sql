-- Senha das caixas de e-mail no cofre (Supabase Vault), fora da tabela: email_contas.senha fica vazia ('') e
-- email_contas.senha_no_cofre marca que há senha guardada. Quem grava continua mandando a senha no campo senha
-- (Configurações → Caixa de e-mail → salvar): o gatilho guarda no cofre e apaga da linha. Só o servidor lê
-- (email_senha, permitida apenas ao service_role, usada pelas Edge Functions de e-mail). Ao remover a caixa, a
-- senha sai do cofre. Enquanto a senha antiga ainda estiver na linha, email_senha devolve a da linha.

alter table public.email_contas add column if not exists senha_no_cofre boolean not null default false;

create or replace function public.trg_email_senha_cofre()
returns trigger language plpgsql security definer set search_path = public, vault as $$
declare
  v_nome text;
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from vault.secrets where name = 'email_senha:' || old.id;
    return old;
  end if;
  if nullif(btrim(coalesce(new.senha, '')), '') is null then
    new.senha := '';
    return new;
  end if;
  v_nome := 'email_senha:' || new.id;
  select id into v_id from vault.secrets where name = v_nome;
  if v_id is null then
    perform vault.create_secret(new.senha, v_nome, 'Senha da caixa de e-mail do ERP');
  else
    perform vault.update_secret(v_id, new.senha);
  end if;
  new.senha := '';
  new.senha_no_cofre := true;
  return new;
end $$;
revoke execute on function public.trg_email_senha_cofre() from public, anon, authenticated;


create or replace trigger trg_email_senha_cofre before insert or update of senha on public.email_contas
  for each row execute function public.trg_email_senha_cofre();

create or replace trigger trg_email_senha_cofre_remover after delete on public.email_contas
  for each row execute function public.trg_email_senha_cofre();

create or replace function public.email_senha(p_conta uuid)
returns text language sql stable security definer set search_path = public, vault as $$
  select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'email_senha:' || p_conta limit 1),
                  (select nullif(senha, '') from public.email_contas where id = p_conta));
$$;
revoke execute on function public.email_senha(uuid) from public, anon, authenticated;
grant execute on function public.email_senha(uuid) to service_role;
