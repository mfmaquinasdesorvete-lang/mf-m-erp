-- Marcadores coloridos (os mesmos das notas fiscais) em todos os cadastros e documentos:
-- clientes, fornecedores, produtos, transportadoras, funcionários, embalagens, formas de pagamento,
-- vendas/orçamentos, OS, ordens de compra, ordens de produção e contas a pagar/receber.
--  * marcar_registros: põe/tira marcadores em um ou vários registros (vale a permissão de editar da tabela);
--  * excluir_documento: tira da lista uma ordem de compra ou de produção feita errada, com motivo.
--    Fica guardada (cancelada) com quem, quando e por quê, e pode ser restaurada (restaurar_documento).
--    OC com mercadoria recebida e OP concluída não saem (o estoque já mexeu).

do $$
declare t text;
begin
  foreach t in array array['clientes', 'fornecedores', 'produtos', 'transportadoras', 'funcionarios', 'embalagens', 'formas_pagamento',
                           'pedidos', 'ordens_servico', 'pedidos_compra', 'ordens_producao', 'contas_pagar', 'contas_receber'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists marcadores uuid[] not null default ''{}''', t);
    end if;
  end loop;
end $$;

-- Põe/tira marcadores. Roda com a permissão de quem chama: só muda o que a pessoa pode editar na tabela.
create or replace function public.marcar_registros(p_tabela text, p_ids uuid[], p_adicionar uuid[], p_remover uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if p_tabela not in ('clientes', 'fornecedores', 'produtos', 'transportadoras', 'funcionarios', 'embalagens', 'formas_pagamento',
                      'pedidos', 'ordens_servico', 'pedidos_compra', 'ordens_producao', 'contas_pagar', 'contas_receber') then
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

-- Ordem de compra e de produção excluídas: somem das listas, mas ficam guardadas
alter table public.pedidos_compra
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid,
  add column if not exists excluida_motivo text,
  add column if not exists excluida_status text;
alter table public.ordens_producao
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid,
  add column if not exists excluida_motivo text,
  add column if not exists excluida_status text;
do $$ begin
  create policy "nao_excluida" on public.pedidos_compra as restrictive for select to authenticated using (excluida_em is null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "nao_excluida" on public.ordens_producao as restrictive for select to authenticated using (excluida_em is null);
exception when duplicate_object then null; end $$;

create or replace function public.excluir_documento(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_numero text;
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'escreva o motivo da exclusão (pelo menos 5 letras)'; end if;
  if p_tabela = 'pedidos_compra' then
    select status, numero::text into v_status, v_numero from pedidos_compra where id = p_id and excluida_em is null for update;
    if not found then raise exception 'ordem de compra não encontrada'; end if;
    if v_status in ('parcial', 'recebido')
       or exists (select 1 from pedido_compra_itens where pedido_compra_id = p_id and coalesce(quantidade_recebida, 0) > 0) then
      raise exception 'a OC #% já teve mercadoria recebida: o estoque mexeu, não dá para excluir (cancele o saldo)', v_numero;
    end if;
    update pedidos_compra set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = btrim(p_motivo),
           excluida_status = status, status = 'cancelado' where id = p_id;
  elsif p_tabela = 'ordens_producao' then
    select status, numero::text into v_status, v_numero from ordens_producao where id = p_id and excluida_em is null for update;
    if not found then raise exception 'ordem de produção não encontrada'; end if;
    if v_status = 'concluida'
       or exists (select 1 from estoque_movimentos where referencia_tipo = 'producao' and referencia_id = p_id) then
      raise exception 'a OP #% já foi concluída: o estoque mexeu, não dá para excluir', v_numero;
    end if;
    update ordens_producao set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = btrim(p_motivo),
           excluida_status = status, status = 'cancelada' where id = p_id;
  else
    raise exception 'este documento não pode ser excluído por aqui';
  end if;
  insert into auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_id::text, 'update', auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), array['excluida_em', 'status'],
          jsonb_build_object('status', v_status), jsonb_build_object('excluida_em', now(), 'status', case when p_tabela = 'pedidos_compra' then 'cancelado' else 'cancelada' end), btrim(p_motivo), 'usuario');
end $$;
revoke execute on function public.excluir_documento(text, uuid, text) from public, anon;
grant execute on function public.excluir_documento(text, uuid, text) to authenticated;

create or replace function public.restaurar_documento(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro', 'tecnico');
  if p_tabela = 'pedidos_compra' then
    update pedidos_compra set status = coalesce(excluida_status, 'cotacao'), excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null;
  elsif p_tabela = 'ordens_producao' then
    update ordens_producao set status = coalesce(excluida_status, 'planejada'), excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null;
  else
    raise exception 'este documento não pode ser restaurado por aqui';
  end if;
  if not found then raise exception 'documento excluído não encontrado'; end if;
  insert into auditoria (tabela, registro_id, acao, usuario, usuario_nome, campos, antes, depois, motivo, origem)
  values (p_tabela, p_id::text, 'update', auth.uid(), (select nome from usuarios_erp where user_id = auth.uid()), array['excluida_em'],
          null, jsonb_build_object('excluida_em', null), 'restaurada', 'usuario');
end $$;
revoke execute on function public.restaurar_documento(text, uuid) from public, anon;
grant execute on function public.restaurar_documento(text, uuid) to authenticated;

-- Excluídas (para consultar e restaurar)
create or replace function public.documentos_excluidos()
returns table (tabela text, id uuid, numero text, descricao text, excluida_em timestamptz, excluida_motivo text, excluida_por text)
language sql stable security definer set search_path = public as $$
  select 'pedidos_compra', c.id, c.numero::text, coalesce(f.nome, 'sem fornecedor'), c.excluida_em, c.excluida_motivo, coalesce(u.email, '')
    from pedidos_compra c left join fornecedores f on f.id = c.fornecedor_id left join auth.users u on u.id = c.excluida_por
   where c.excluida_em is not null and public.tem_papel('financeiro', 'tecnico')
  union all
  select 'ordens_producao', o.id, o.numero::text, coalesce(p.descricao, ''), o.excluida_em, o.excluida_motivo, coalesce(u.email, '')
    from ordens_producao o left join produtos p on p.id = o.produto_id left join auth.users u on u.id = o.excluida_por
   where o.excluida_em is not null and public.tem_papel('financeiro', 'tecnico')
  order by 5 desc
$$;
revoke execute on function public.documentos_excluidos() from public, anon;
grant execute on function public.documentos_excluidos() to authenticated;
