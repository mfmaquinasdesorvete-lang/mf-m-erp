-- =====================================================================
-- Fornecedores conferidos na Receita como os clientes: completa o cadastro (só o que está vazio), marca CNPJ/IE
-- baixada e, quando o endereço é diferente, guarda os dois com a etiqueta "endereco_receita".
-- =====================================================================
alter table public.fornecedores add column if not exists tags text[] not null default '{}';
alter table public.fornecedores add column if not exists receita jsonb;
alter table public.fornecedores add column if not exists receita_situacao text;
alter table public.fornecedores add column if not exists ie_situacao text;
alter table public.fornecedores add column if not exists receita_em timestamptz;

create or replace function public.fornecedores_para_receita(p_limite int default 3)
returns setof public.fornecedores language sql stable security definer set search_path = public as $$
  select f.* from fornecedores f
   where length(regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g')) = 14
     and (f.receita_em is null or f.receita_em < now() - interval '90 days')
   order by f.receita_em nulls first, exists (select 1 from nfe_recebidas n where n.fornecedor_id = f.id) desc, f.created_at desc
   limit greatest(1, least(p_limite, 20))
$$;
revoke execute on function public.fornecedores_para_receita(int) from public, anon, authenticated;
