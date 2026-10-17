-- DRE pelas notas: o CMV usa o custo do produto na data da venda. Esta função devolve cada mudança do custo do
-- cadastro (da auditoria): quando mudou e qual era o custo antes. Na tela: custo na data = o "antes" da primeira
-- mudança depois da venda; sem mudança depois, o custo atual. Só leitura, para financeiro, contador e administrador.
create or replace function public.custos_anteriores_produtos()
returns table (produto_id uuid, alterado_em timestamptz, custo_antes numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tem_papel('financeiro', 'contador') then raise exception 'sem permissão'; end if;
  return query
  select a.registro_id::uuid, a.created_at, nullif(a.antes->>'preco_custo', '')::numeric
    from public.auditoria a
   where a.tabela = 'produtos' and a.acao = 'update' and 'preco_custo' = any (a.campos)
     and a.registro_id ~ '^[0-9a-f-]{36}$' and coalesce(a.antes->>'preco_custo', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
   order by a.registro_id, a.created_at;
end $$;
revoke execute on function public.custos_anteriores_produtos() from public, anon;
grant execute on function public.custos_anteriores_produtos() to authenticated;
