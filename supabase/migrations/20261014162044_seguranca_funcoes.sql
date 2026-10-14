-- Higiene de segurança apontada pelo verificador do Supabase (auditoria de 14/10/2026):
--  * quem não está logado (anon) não executa funções internas do ERP. Continuam liberadas só as das páginas
--    públicas (loja, proposta, cotação, ficha cadastral, área do cliente, primeiro acesso) e as que as regras
--    de acesso (RLS) usam para conferir o papel;
--  * as funções sem caminho de busca fixo passam a ter (evita que alguém troque uma tabela por outra com o mesmo nome).
-- Nada é apagado: só permissões e configuração das funções.

do $$
declare f record; n_anon int := 0; n_path int := 0;
begin
  -- 1) gatilhos e funções internas: fora do alcance de quem não está logado
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public'
       and has_function_privilege('anon', p.oid, 'execute')
       and (pg_get_function_result(p.oid) = 'trigger'
            or p.proname in ('gerar_sugestoes_preco', 'kit_composicao', 'margem_alvo_produto', 'preco_sugerido',
                             'rateio_valido', 'unidade_matriz', 'exigir_papel', 'tem_algum_papel', 'meu_papel'))
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    n_anon := n_anon + 1;
  end loop;

  -- quem está logado continua usando as funções internas que a tela chama
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public'
       and p.proname in ('gerar_sugestoes_preco', 'kit_composicao', 'margem_alvo_produto', 'preco_sugerido',
                         'rateio_valido', 'unidade_matriz', 'exigir_papel', 'tem_algum_papel', 'meu_papel')
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;

  -- 2) caminho de busca fixo nas funções que não tinham
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', f.assinatura);
    n_path := n_path + 1;
  end loop;

  raise notice 'funções fechadas para anon: %, com caminho fixo: %', n_anon, n_path;
end $$;
