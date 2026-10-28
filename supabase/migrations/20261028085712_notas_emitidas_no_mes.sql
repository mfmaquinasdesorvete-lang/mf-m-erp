-- NF-e emitidas de uma unidade num mês pela data de emissão do XML (sem XML, pela data em que entrou no ERP).
-- Usada pelo pacote do contador: nota antiga importada agora fica no mês em que foi emitida, não no da importação.
create or replace function public.notas_emitidas_no_mes(p_unidade uuid, p_competencia text)
returns setof uuid language sql stable security invoker set search_path = public as $$
  select n.id from notas_fiscais n left join notas_fiscais_xml x on x.nota_id = n.id
   where n.unidade_id = p_unidade
     and coalesce(substring(left(x.xml, 6000) from '<dhEmi>([0-9]{4}-[0-9]{2})'), to_char(n.created_at at time zone 'UTC', 'YYYY-MM')) = p_competencia
$$;
revoke execute on function public.notas_emitidas_no_mes(uuid, text) from public, anon;
grant execute on function public.notas_emitidas_no_mes(uuid, text) to authenticated, service_role;
