-- =====================================================================
-- Propostas do Tiny na tela de propostas: marcadores, próximo contato e situação
--  * propostas_tiny.marcadores (os mesmos marcadores coloridos das outras telas), marcados por marcar_registros;
--  * vendas e financeiro atualizam só o próximo contato, a situação e os marcadores (o resto vem do Tiny).
-- Somente acréscimos.
-- =====================================================================

alter table public.propostas_tiny add column if not exists marcadores uuid[] not null default '{}';
create index if not exists propostas_tiny_proximo_contato_idx on public.propostas_tiny (proximo_contato);

do $$ begin
  create policy propostas_tiny_atualizar on public.propostas_tiny for update to authenticated
    using (public.tem_algum_papel(array['vendas', 'financeiro'])) with check (public.tem_algum_papel(array['vendas', 'financeiro']));
exception when duplicate_object then null; end $$;
revoke all on public.propostas_tiny from anon, authenticated;
grant select on public.propostas_tiny to authenticated;
grant update (marcadores, proximo_contato, situacao) on public.propostas_tiny to authenticated;

-- Põe/tira marcadores. Roda com a permissão de quem chama: só muda o que a pessoa pode editar na tabela.
create or replace function public.marcar_registros(p_tabela text, p_ids uuid[], p_adicionar uuid[], p_remover uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if p_tabela not in ('clientes', 'fornecedores', 'produtos', 'transportadoras', 'funcionarios', 'embalagens', 'formas_pagamento',
                      'pedidos', 'ordens_servico', 'pedidos_compra', 'ordens_producao', 'contas_pagar', 'contas_receber', 'propostas_tiny') then
    raise exception 'esta tela não tem marcadores';
  end if;
  if coalesce(array_length(p_ids, 1), 0) not between 1 and 1000 then raise exception 'escolha de 1 a 1000 registros'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  execute format('update public.%I set marcadores = array(select distinct x from unnest(marcadores || $1) x where x <> all ($2)) where id = any ($3)', p_tabela)
    using coalesce(p_adicionar, '{}'::uuid[]), coalesce(p_remover, '{}'::uuid[]), p_ids;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.marcar_registros(text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.marcar_registros(text, uuid[], uuid[], uuid[]) to authenticated;
