-- Painel da Auditoria sem baixar o histórico inteiro: o banco conta as alterações e exclusões dos últimos dias
-- (por dia, por pessoa e por área) e devolve só as linhas que o painel mostra por inteiro (exclusões e mudanças de
-- valor). Antes a tela baixava os ~40 mil registros dos 30 dias (dezenas de MB) só para fazer essas contas.
-- Roda com as permissões de quem chama (as regras de acesso da auditoria continuam valendo).
create or replace function public.auditoria_painel(p_de timestamptz, p_tz text default 'America/Sao_Paulo')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select a.acao, a.tabela, coalesce(a.usuario_nome, 'sistema') as quem, (a.created_at at time zone p_tz)::date as dia
    from public.auditoria a
    where a.created_at >= p_de and a.acao in ('update', 'delete')
  )
  select jsonb_build_object(
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'total', d.total, 'exclusoes', d.exclusoes) order by d.dia)
      from (select dia, count(*) as total, count(*) filter (where acao = 'delete') as exclusoes from base group by dia) d), '[]'::jsonb),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object('nome', p.quem, 'n', p.n))
      from (select quem, count(*) as n from base group by quem) p), '[]'::jsonb),
    'tabelas', coalesce((select jsonb_agg(jsonb_build_object('tabela', t.tabela, 'n', t.n))
      from (select tabela, count(*) as n from base group by tabela) t), '[]'::jsonb),
    -- exclusões e alterações de campos de dinheiro (mesma regra de ehCampoDinheiro em src/lib/auditoriaBusca.ts)
    'linhas', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from public.auditoria a
      where a.created_at >= p_de
        and (a.acao = 'delete' or (a.acao = 'update' and exists (
          select 1 from unnest(coalesce(a.campos, array(select jsonb_object_keys(coalesce(a.depois, '{}'::jsonb))))) c
          where c ~ '^(valor|preco|saldo|custo)(_|$)' or c in ('desconto', 'frete', 'juros', 'multa', 'limite_credito'))))), '[]'::jsonb)
  )
$$;

revoke all on function public.auditoria_painel(timestamptz, text) from public, anon;
grant execute on function public.auditoria_painel(timestamptz, text) to authenticated;
