-- Perfil "Só o giga": a pessoa entra e vê só o Teste do giga (REG-006). Lança e anula testes como o técnico,
-- sem acesso à assistência, à produção, ao estoque nem aos clientes.
set local lock_timeout = '10s';

alter table public.usuarios_erp drop constraint if exists usuarios_erp_papel_check, add constraint usuarios_erp_papel_check
  check (papel in ('admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao', 'marketplace', 'compras', 'representante', 'giga'));

-- só o giga não soma papéis (senão deixa de ser "só o giga")
do $$ begin
  alter table public.usuarios_erp add constraint usuarios_erp_giga_sozinho
    check (papel <> 'giga' or coalesce(cardinality(papeis_extras), 0) = 0);
exception when duplicate_object then null; end $$;

-- regras das tabelas do giga: quem é do giga lê e marca como o técnico
alter policy teste_giga_parametros_ler on public.teste_giga_parametros using (public.tem_algum_papel(array['tecnico', 'financeiro', 'giga']));
alter policy testes_giga_ler on public.testes_giga using (public.tem_algum_papel(array['tecnico', 'financeiro', 'giga']));
alter policy testes_giga_marcadores on public.testes_giga
  using (public.tem_algum_papel(array['tecnico', 'giga'])) with check (public.tem_algum_papel(array['tecnico', 'giga']));
alter policy giga_retestes_ler on public.giga_retestes using (public.tem_algum_papel(array['tecnico', 'financeiro', 'giga']));
alter policy giga_retestes_atualizar on public.giga_retestes
  using (public.tem_algum_papel(array['tecnico', 'giga'])) with check (public.tem_algum_papel(array['tecnico', 'giga']));

-- funções do giga: lançar, anular e a situação do nº de série aceitam o papel giga (mesmo corpo, só a lista de papéis)
do $$
declare f record; d text;
begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('teste_giga_lancar', 'teste_giga_anular', 'teste_giga_situacao') loop
    d := pg_get_functiondef(f.oid);
    if d like '%tem_algum_papel(array[''tecnico''])%' or d like '%tem_algum_papel(array[''tecnico'', ''financeiro'', ''vendas''])%' then
      d := replace(d, 'tem_algum_papel(array[''tecnico''])', 'tem_algum_papel(array[''tecnico'', ''giga''])');
      d := replace(d, 'tem_algum_papel(array[''tecnico'', ''financeiro'', ''vendas''])', 'tem_algum_papel(array[''tecnico'', ''financeiro'', ''vendas'', ''giga''])');
      execute d;
    end if;
  end loop;
end $$;
