-- Banco mais rápido.
-- Aplicada em 22/10/2026: as partes 3 e 4 (índices) pelo Claude; as partes 1 e 2 pelo SQL Editor do Supabase
-- (a ferramenta do Claude trava em alter/drop). Pode rodar o arquivo inteiro de novo sem problema.
-- 1) Regras de acesso (RLS): tem_papel(), is_erp_user(), e_contador(), auth.uid() etc. eram conferidos de novo em
--    cada linha. Embrulhados em (select ...), o Postgres confere uma vez por consulta (ex.: clientes de 45 ms para 3 ms).
--    Só as funções sem coluna da linha nos argumentos; pode_ver_documento(nome) e afins ficam como estão.
do $$
declare
  p record;
  fn constant text := '\m((?:public\.)?(?:tem_papel|tem_algum_papel|is_erp_user|is_erp_admin|is_erp_master|e_contador|metas_meus_vendedores)\([^()]*\))';
  au constant text := '\m(auth\.(?:uid|jwt|role)\(\))';
  novo_using text;
  novo_check text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    novo_using := regexp_replace(regexp_replace(p.qual, fn, '(select \1)', 'g'), au, '(select \1)', 'g');
    novo_check := regexp_replace(regexp_replace(p.with_check, fn, '(select \1)', 'g'), au, '(select \1)', 'g');
    if novo_using is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, novo_using);
    end if;
    if novo_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, novo_check);
    end if;
  end loop;
end $$;

-- 2) Índices repetidos (o mesmo índice duas vezes só pesa na gravação)
drop index if exists public.nfe_custos_itens_produto_idx;
drop index if exists public.nfe_oc_baixas_pedido_idx;
drop index if exists public.notas_fiscais_cliente_idx;

-- 3) Auditoria (Atualizações/histórico): busca por ação ou tabela, das mais novas para as mais antigas
create index if not exists auditoria_acao_created_at_idx on public.auditoria (acao, created_at desc);
create index if not exists auditoria_tabela_created_at_idx on public.auditoria (tabela, created_at desc);

-- 4) Ligações entre tabelas (chaves estrangeiras) sem índice: abrir a ficha, apagar ou juntar ficava lendo a tabela toda
do $$
declare
  f record;
  nome text;
begin
  for f in
    select c.conrelid::regclass as tabela, c.conrelid, c.conkey,
           string_agg(quote_ident(a.attname), ', ' order by k.ord) as colunas,
           string_agg(a.attname, '_' order by k.ord) as nomes
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
      cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey)
     group by c.oid, c.conrelid, c.conkey
  loop
    nome := left(replace(f.tabela::text, 'public.', '') || '_' || f.nomes, 55) || '_fk_idx';
    execute format('create index if not exists %I on %s (%s)', nome, f.tabela, f.colunas);
  end loop;
end $$;

-- conferência: 0 regras sem o (select ...) e nenhum índice repetido
select
  (select count(*) from pg_policies where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') ~ '(tem_papel|is_erp_user|is_erp_admin|e_contador|auth\.uid)\('
      and coalesce(qual, '') || coalesce(with_check, '') !~* 'select (public\.)?(tem_papel|tem_algum_papel|is_erp_|e_contador|auth\.)') as regras_sem_ajuste,
  (select count(*) from pg_indexes where indexname in ('nfe_custos_itens_produto_idx', 'nfe_oc_baixas_pedido_idx', 'notas_fiscais_cliente_idx')) as indices_repetidos;
