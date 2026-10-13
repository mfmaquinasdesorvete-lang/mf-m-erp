-- Perfis e expedição.
--  * configuracoes.menu_oculto: itens do menu escondidos por papel (Usuários → Perfis), ex.: {"vendas": ["/comissoes"]}.
--    Começa vazio (ninguém perde nada). Só esconde telas: o acesso aos dados continua pelas regras de cada papel.
--  * Papel "expedicao" (separar, conferir, embalar e despachar), como principal ou adicional.
--  * A expedição lê as NF-e (situação e DANFE) para saber se o pedido pode sair; as demais tabelas que ela usa
--    (pedidos, itens, produtos, clientes, expedições, transportadoras) já são lidas por qualquer usuário do ERP.
-- Aditiva: não apaga nem altera dados.

alter table public.configuracoes add column if not exists menu_oculto jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_menu_oculto_objeto') then
    alter table public.configuracoes add constraint configuracoes_menu_oculto_objeto check (jsonb_typeof(menu_oculto) = 'object');
  end if;

  -- papel principal: a regra antiga não tinha "expedicao"
  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check'
             and pg_get_constraintdef(oid) not like '%expedicao%') then
    alter table public.usuarios_erp drop constraint usuarios_erp_papel_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check') then
    alter table public.usuarios_erp add constraint usuarios_erp_papel_check
      check (papel in ('admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao'));
  end if;

  -- papéis adicionais
  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos'
             and pg_get_constraintdef(oid) not like '%expedicao%') then
    alter table public.usuarios_erp drop constraint usuarios_erp_papeis_extras_validos;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papeis_extras_validos') then
    alter table public.usuarios_erp add constraint usuarios_erp_papeis_extras_validos
      check (papeis_extras <@ array['vendas', 'financeiro', 'tecnico', 'expedicao']::text[]);
  end if;

  -- obrigação do código em duas etapas (se a segurança do acesso já estiver aplicada): aceita o papel novo
  if exists (select 1 from pg_constraint where conname = 'configuracoes_mfa_papeis_validos'
             and pg_get_constraintdef(oid) not like '%expedicao%') then
    alter table public.configuracoes drop constraint configuracoes_mfa_papeis_validos;
    alter table public.configuracoes add constraint configuracoes_mfa_papeis_validos
      check (mfa_papeis <@ array['admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao']::text[]);
  end if;

  -- a expedição vê as NF-e (situação, número e DANFE); continua sem emitir nem alterar
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notas_fiscais' and policyname = 'expedicao_select') then
    create policy "expedicao_select" on public.notas_fiscais for select to authenticated using (public.tem_papel('expedicao'));
  end if;
end $$;
