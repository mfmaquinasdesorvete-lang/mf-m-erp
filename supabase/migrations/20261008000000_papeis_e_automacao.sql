-- =====================================================================
-- 1) Permissões por papel (admin, vendas, financeiro, tecnico)
-- 2) Processamento automático das NF-e de fornecedores
--    (ciência -> XML -> entrada no estoque -> contas a pagar)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Papéis
-- ---------------------------------------------------------------------

-- Verdadeiro se o usuário logado tem um dos papéis informados (admin sempre pode).
create or replace function public.tem_papel(variadic p_papeis text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_erp
    where user_id = auth.uid() and ativo and (papel = 'admin' or papel = any(p_papeis))
  );
$$;

create or replace function public.meu_papel()
returns text
language sql stable security definer set search_path = public
as $$
  select papel from public.usuarios_erp where user_id = auth.uid() and ativo;
$$;

-- Mesma checagem com array comum (para chamadas via API/RPC: { p_papeis: [...] }; [] = só admin)
create or replace function public.tem_algum_papel(p_papeis text[])
returns boolean
language sql stable security definer set search_path = public
as $$ select public.tem_papel(variadic p_papeis); $$;

grant execute on function public.tem_papel(text[]) to authenticated;
grant execute on function public.tem_algum_papel(text[]) to authenticated;
grant execute on function public.meu_papel() to authenticated;

-- Recria as políticas de cada tabela conforme a matriz:
--   leitura  = quem vê a tela;  escrita = quem cadastra/altera;  exclusão = admin
create or replace function pg_temp.politicas(t text, leitura text[], escrita text[])
returns void language plpgsql as $$
declare
  r text := case when leitura is null then 'public.is_erp_user()'
                 else format('public.tem_papel(variadic %L::text[])', leitura) end;
  w text := format('public.tem_papel(variadic %L::text[])', escrita);
begin
  execute format('drop policy if exists "erp_select" on public.%I', t);
  execute format('drop policy if exists "erp_insert" on public.%I', t);
  execute format('drop policy if exists "erp_update" on public.%I', t);
  execute format('drop policy if exists "erp_delete" on public.%I', t);
  execute format('create policy "erp_select" on public.%I for select to authenticated using (%s)', t, r);
  execute format('create policy "erp_insert" on public.%I for insert to authenticated with check (%s)', t, w);
  execute format('create policy "erp_update" on public.%I for update to authenticated using (%s) with check (%s)', t, w, w);
  execute format('create policy "erp_delete" on public.%I for delete to authenticated using (public.is_erp_admin())', t);
end $$;

-- leitura null = todos os usuários do ERP
select pg_temp.politicas('configuracoes',      null,                                   '{}');
select pg_temp.politicas('clientes',           null,                                   '{vendas,financeiro,tecnico}');
select pg_temp.politicas('fornecedores',       null,                                   '{financeiro}');
select pg_temp.politicas('produtos',           null,                                   '{financeiro}');
select pg_temp.politicas('pedidos',            '{vendas,financeiro}',                  '{vendas}');
select pg_temp.politicas('pedido_itens',       '{vendas,financeiro}',                  '{vendas}');
select pg_temp.politicas('ordens_servico',     '{tecnico,vendas,financeiro}',          '{tecnico}');
select pg_temp.politicas('os_itens',           '{tecnico,vendas,financeiro}',          '{tecnico}');
select pg_temp.politicas('contas_receber',     '{financeiro,vendas}',                  '{financeiro}');
select pg_temp.politicas('contas_pagar',       '{financeiro}',                         '{financeiro}');
select pg_temp.politicas('nfe_recebidas',      '{financeiro}',                         '{financeiro}');
select pg_temp.politicas('produto_fornecedor', '{financeiro}',                         '{financeiro}');

-- Estoque: histórico, só leitura + inserção (movimento manual = financeiro)
drop policy if exists "erp_select" on public.estoque_movimentos;
drop policy if exists "erp_insert" on public.estoque_movimentos;
create policy "erp_select" on public.estoque_movimentos for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.estoque_movimentos for insert to authenticated with check (public.tem_papel('financeiro'));

-- Notas emitidas: só leitura (gravação pelas Edge Functions)
drop policy if exists "erp_select" on public.notas_fiscais;
create policy "erp_select" on public.notas_fiscais for select to authenticated using (public.tem_papel('vendas', 'financeiro'));

-- Itens são regravados ao editar orçamento/OS em aberto
drop policy "erp_delete" on public.pedido_itens;
drop policy "erp_delete" on public.os_itens;
create policy "erp_delete" on public.pedido_itens for delete to authenticated using (
  public.tem_papel('vendas') and exists (select 1 from public.pedidos p where p.id = pedido_id and p.status = 'orcamento')
);
create policy "erp_delete" on public.os_itens for delete to authenticated using (
  public.tem_papel('tecnico') and exists (
    select 1 from public.ordens_servico o where o.id = os_id and o.status not in ('concluida', 'entregue', 'cancelada')
  )
);

-- Usuários: cada um lê o próprio cadastro; admin vê e altera todos
drop policy if exists "usuarios_select" on public.usuarios_erp;
create policy "usuarios_select" on public.usuarios_erp for select to authenticated
  using (user_id = auth.uid() or public.is_erp_admin());

-- Regras de negócio também conferem o papel
create or replace function public.exigir_papel(variadic p_papeis text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tem_papel(variadic p_papeis) then raise exception 'sem permissão para esta ação'; end if;
end $$;

do $$
begin
  -- troca a checagem genérica pela checagem de papel nas RPCs existentes
  execute replace(pg_get_functiondef('public.aprovar_pedido(uuid)'::regprocedure),
    'if not public.is_erp_user() then raise exception ''acesso negado''; end if;',
    'perform public.exigir_papel(''vendas'');');
  execute replace(pg_get_functiondef('public.cancelar_pedido(uuid)'::regprocedure),
    'if not public.is_erp_user() then raise exception ''acesso negado''; end if;',
    'perform public.exigir_papel(''vendas'');');
  execute replace(pg_get_functiondef('public.concluir_os(uuid, date)'::regprocedure),
    'if not public.is_erp_user() then raise exception ''acesso negado''; end if;',
    'perform public.exigir_papel(''tecnico'');');
end $$;

-- ---------------------------------------------------------------------
-- Processamento automático das NF-e de fornecedores
-- ---------------------------------------------------------------------
alter table public.produtos add column codigo_barras text;
create index produtos_codigo_barras_idx on public.produtos (codigo_barras) where codigo_barras is not null;

alter table public.configuracoes
  add column entrada_automatica_estoque boolean not null default true,
  add column conta_pagar_automatica boolean not null default true;

-- pendente: aguardando primeira tentativa | aguardando_xml: SEFAZ ainda não liberou o XML
-- aguardando_vinculo: há itens sem produto vinculado | revisao: operação que não é compra (ex.: remessa p/ conserto)
-- concluido: estoque (e contas) lançados | ignorada: cancelada/desconhecida
alter table public.nfe_recebidas
  add column processamento text not null default 'pendente'
    check (processamento in ('pendente', 'aguardando_xml', 'aguardando_vinculo', 'revisao', 'concluido', 'ignorada')),
  add column processamento_msg text,
  add column tentativas int not null default 0,
  add column processado_em timestamptz;

update public.nfe_recebidas set processamento = 'concluido' where estoque_lancado;
update public.nfe_recebidas set processamento = 'ignorada' where situacao = 'cancelada' and not estoque_lancado;

create index nfe_recebidas_processamento_idx on public.nfe_recebidas (processamento)
  where processamento in ('pendente', 'aguardando_xml');

-- Núcleo da entrada de estoque (sem checagem de usuário): usado pela RPC e pelo processamento automático.
alter function public.lancar_estoque_nfe(uuid, jsonb) rename to lancar_estoque_nfe_core;
revoke execute on function public.lancar_estoque_nfe_core(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lancar_estoque_nfe_core(uuid, jsonb) to service_role;

do $$
begin
  execute replace(pg_get_functiondef('public.lancar_estoque_nfe_core(uuid, jsonb)'::regprocedure),
    '  if not public.is_erp_user() then raise exception ''acesso negado''; end if;' || chr(10), '');
end $$;

create or replace function public.marcar_nfe_concluida()
returns trigger language plpgsql as $$
begin
  -- qualquer lançamento de estoque conclui o processamento da nota
  if new.estoque_lancado and not old.estoque_lancado then
    new.processamento := 'concluido';
    new.processamento_msg := null;
    new.processado_em := now();
  end if;
  return new;
end $$;

create trigger trg_nfe_recebida_concluida
before update on public.nfe_recebidas
for each row execute function public.marcar_nfe_concluida();

create or replace function public.lancar_estoque_nfe(p_nfe uuid, p_itens jsonb)
returns int
language plpgsql security definer set search_path = public
as $$
begin
  perform public.exigir_papel('financeiro');
  return public.lancar_estoque_nfe_core(p_nfe, p_itens);
end $$;

revoke execute on function public.lancar_estoque_nfe(uuid, jsonb) from public, anon;
grant execute on function public.lancar_estoque_nfe(uuid, jsonb) to authenticated;
