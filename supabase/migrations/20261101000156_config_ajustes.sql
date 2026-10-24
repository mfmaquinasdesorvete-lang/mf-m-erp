-- Ajustes do negócio editáveis em Configurações (pedido de 24/10, .claude/configuravel): prazos e padrões (números) e
-- mensagens ao cliente (textos com variáveis). O catálogo (nome, explicação e valor padrão) fica no código, em
-- supabase/functions/_shared/ajustes.ts; aqui fica só o que a usuária mudou. Sem linha = vale o padrão.
create table if not exists public.config_ajustes (
  chave text primary key check (chave ~ '^[a-z0-9_]+$'),
  valor numeric,
  assunto text,
  texto text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  atualizado_nome text
);
alter table public.config_ajustes enable row level security;
drop policy if exists config_ajustes_ler on public.config_ajustes;
create policy config_ajustes_ler on public.config_ajustes for select to authenticated using ((select public.is_erp_user()));
revoke insert, update, delete on public.config_ajustes from anon, authenticated;

-- Gravar (só o administrador, como o resto de Configurações). Tudo nulo = voltar ao padrão (apaga a linha).
create or replace function public.config_ajuste_salvar(p_chave text, p_valor numeric default null, p_assunto text default null, p_texto text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_papel() then raise exception 'só o administrador muda as configurações'; end if;
  if p_chave is null or p_chave !~ '^[a-z0-9_]+$' then raise exception 'ajuste inválido'; end if;
  if length(coalesce(p_texto, '')) > 4000 or length(coalesce(p_assunto, '')) > 200 then raise exception 'texto grande demais'; end if;
  if p_valor is null and nullif(trim(coalesce(p_assunto, '')), '') is null and nullif(trim(coalesce(p_texto, '')), '') is null then
    delete from public.config_ajustes where chave = p_chave;
    return;
  end if;
  insert into public.config_ajustes (chave, valor, assunto, texto, atualizado_em, atualizado_por, atualizado_nome)
  values (p_chave, p_valor, nullif(trim(p_assunto), ''), nullif(trim(p_texto), ''), now(), auth.uid(),
          (select nome from public.usuarios_erp where user_id = auth.uid()))
  on conflict (chave) do update set valor = excluded.valor, assunto = excluded.assunto, texto = excluded.texto,
    atualizado_em = now(), atualizado_por = excluded.atualizado_por, atualizado_nome = excluded.atualizado_nome;
end $$;
revoke all on function public.config_ajuste_salvar(text, numeric, text, text) from public, anon;
grant execute on function public.config_ajuste_salvar(text, numeric, text, text) to authenticated;

-- Leitura no banco: o número que ela gravou ou o padrão (o MESMO de ajustes.ts; o teste ajustes.test.ts confere).
create or replace function public.cfg_num(p_chave text, p_padrao numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.config_ajustes where chave = p_chave), p_padrao)
$$;
revoke all on function public.cfg_num(text, numeric) from public, anon;
grant execute on function public.cfg_num(text, numeric) to authenticated, service_role;
