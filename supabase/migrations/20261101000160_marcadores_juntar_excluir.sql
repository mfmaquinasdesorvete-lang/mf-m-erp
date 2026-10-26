-- Marcadores: quantos registros usam cada um, juntar repetidos e excluir (pedido de 26/10). Marcador é da usuária:
-- só ela (administrador) junta ou exclui, sempre pela tela, com a contagem à vista. Juntar soma o marcador de destino
-- em todos os registros que tinham o antigo (nada se perde); excluir tira o marcador dos registros. Nos dois casos o
-- marcador antigo fica desativado (escondido), não apagado (escolha dela em 26/10).
-- Os marcadores que o ERP põe sozinho pelo nome não podem ser excluídos nem juntados em outro.

create or replace function public.marcadores_tabelas()
returns text[] language sql immutable as $$
  select array['clientes', 'contas_pagar', 'contas_receber', 'embalagens', 'formas_pagamento', 'fornecedores', 'funcionarios',
               'linhas_produto', 'nfe_recebidas', 'notas_fiscais', 'ordens_producao', 'ordens_servico', 'pedidos', 'pedidos_compra',
               'produtos', 'propostas_tiny', 'testes_giga', 'transportadoras']
$$;

/** Nomes que o ERP usa sozinho (gatilhos e funções procuram o marcador pelo nome). */
create or replace function public.marcador_do_sistema(p_nome text)
returns boolean language sql immutable as $$
  select lower(btrim(coalesce(p_nome, ''))) in ('devolução', 'comprado por valor divergente')
$$;

create or replace function public.marcadores_uso()
returns table (id uuid, registros bigint) language plpgsql stable security definer set search_path = public as $$
declare t text; v_sql text := '';
begin
  if not public.is_erp_user() then raise exception 'sem permissão'; end if;
  foreach t in array public.marcadores_tabelas() loop
    v_sql := v_sql || case when v_sql = '' then '' else ' union all ' end || format('select unnest(marcadores) as id from public.%I', t);
  end loop;
  return query execute format('select m.id, count(u.id) from public.marcadores m left join (%s) u on u.id = m.id group by m.id', v_sql);
end $$;
revoke all on function public.marcadores_uso() from public, anon;
grant execute on function public.marcadores_uso() to authenticated;

create or replace function public.marcador_juntar(p_de uuid, p_para uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare t text; n int; total int := 0; v_de marcadores; v_para marcadores;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador junta marcadores'; end if;
  select * into v_de from marcadores where id = p_de;
  select * into v_para from marcadores where id = p_para;
  if v_de.id is null or v_para.id is null or p_de = p_para then raise exception 'escolha dois marcadores diferentes'; end if;
  if public.marcador_do_sistema(v_de.nome) then raise exception '"%" é usado pelo ERP: junte os outros nele, e não ele nos outros', v_de.nome; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  foreach t in array public.marcadores_tabelas() loop
    execute format('update public.%I set marcadores = (select array_agg(distinct x) from unnest(array_remove(marcadores, $1) || $2) x) where $1 = any(marcadores)', t)
      using p_de, p_para;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  update marcadores set ativo = false where id = p_de;
  return total;
end $$;
revoke all on function public.marcador_juntar(uuid, uuid) from public, anon;
grant execute on function public.marcador_juntar(uuid, uuid) to authenticated;

create or replace function public.marcador_excluir(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare t text; n int; total int := 0; v marcadores;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador exclui marcadores'; end if;
  select * into v from marcadores where id = p_id;
  if v.id is null then raise exception 'marcador não encontrado'; end if;
  if public.marcador_do_sistema(v.nome) then raise exception '"%" é usado pelo ERP e não pode ser excluído (pode ser desativado)', v.nome; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  foreach t in array public.marcadores_tabelas() loop
    execute format('update public.%I set marcadores = array_remove(marcadores, $1) where $1 = any(marcadores)', t) using p_id;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  update marcadores set ativo = false where id = p_id;
  return total;
end $$;
revoke all on function public.marcador_excluir(uuid) from public, anon;
grant execute on function public.marcador_excluir(uuid) to authenticated;
