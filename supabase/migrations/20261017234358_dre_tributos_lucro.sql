-- DRE: linha própria para os tributos sobre o lucro (IRPJ e CSLL), depois do resultado antes dos tributos, como no
-- Tiny. O plano de contas ganha o grupo 'tributos' e as categorias IRPJ e CSLL (só se ainda não existirem).
set lock_timeout = '8s';
alter table public.categorias_financeiras drop constraint if exists categorias_financeiras_grupo_check;
alter table public.categorias_financeiras add constraint categorias_financeiras_grupo_check check (grupo = any (array[
  'receita', 'deducao', 'custo', 'despesa_operacional', 'receita_financeira', 'despesa_financeira', 'outros', 'tributos',
  'investimento', 'retirada', 'transferencia']));
insert into public.categorias_financeiras (nome, tipo, grupo, ordem, comportamento)
select v.nome, 'despesa', 'tributos', v.ordem, 'fixa'
  from (values ('IRPJ', 90), ('CSLL', 91)) v(nome, ordem)
 where not exists (select 1 from public.categorias_financeiras c where lower(c.nome) = lower(v.nome));
