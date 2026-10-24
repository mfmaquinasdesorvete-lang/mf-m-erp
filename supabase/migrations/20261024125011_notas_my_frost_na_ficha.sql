-- Notas fiscais da My Frost (empresa anterior) na Ficha 360 do cliente (pedido da usuária, 24/10, com o ok do advogado):
-- a equipe vê, na ficha de cada cliente, as notas que a My Frost emitiu para ele (número, data, tipo, valor e a chave de
-- 44 dígitos), com a tarja "Dados fornecidos pela My Frost para fins de manutenção e atendimento ao cliente".
-- A tabela notas_legado continua só da conta master (Retaguarda → My Frost): a equipe lê só pela função, um cliente por vez.
create or replace function public.notas_my_frost_do_cliente(p_cliente uuid)
returns table (id uuid, numero text, data date, valor numeric, natureza text, chave text, situacao text)
language sql stable security definer set search_path = public as $$
  select n.id, n.numero, n.data, n.valor, n.natureza, n.chave, n.situacao
    from notas_legado n
   where public.is_erp_user() and n.origem = 'My Frost' and n.cliente_id = p_cliente
   order by n.data desc nulls last, n.numero desc;
$$;
revoke all on function public.notas_my_frost_do_cliente(uuid) from public, anon;
grant execute on function public.notas_my_frost_do_cliente(uuid) to authenticated;
