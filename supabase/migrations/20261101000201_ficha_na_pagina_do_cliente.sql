-- Ficha cadastral na página do cliente (/cliente/<link>, aba "Meus dados") e o caminho de volta: no fim da assinatura
-- (/ficha/<código>) o botão "Ver minha página" leva à página do cliente.

-- Situação da ficha do cliente: a assinada mais recente, senão o link ainda válido, senão nenhuma.
-- Sem security definer: só é chamada de dentro de area_cliente (que já roda como dona do banco).
create or replace function public.area_cliente_ficha(p_cliente uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('status', 'assinado', 'assinado_em', a.assinado_em, 'token', case when a.canal = 'link' then a.token end)
       from clientes_assinaturas a where a.cliente_id = p_cliente and a.status = 'assinado' order by a.assinado_em desc limit 1),
    (select jsonb_build_object('status', 'pendente', 'token', a.token, 'expira_em', a.expira_em)
       from clientes_assinaturas a where a.cliente_id = p_cliente and a.canal = 'link' and a.status = 'pendente' and a.expira_em > now()
      order by a.created_at desc limit 1),
    jsonb_build_object('status', 'nenhuma'))
$$;
revoke execute on function public.area_cliente_ficha(uuid) from public, anon;

do $$
declare
  v text := pg_get_functiondef('public.area_cliente(uuid)'::regprocedure);
  w text := pg_get_functiondef('public.ficha_cadastral_publica(uuid)'::regprocedure);
begin
  if position('public.area_cliente_ficha(c.id)' in v) = 0 then
    if position($a$'propostas', coalesce(($a$ in v) = 0 then raise exception 'area_cliente mudou: pôr a ficha à mão'; end if;
    execute replace(v, $a$'propostas', coalesce(($a$, $n$'ficha', public.area_cliente_ficha(c.id),
    'propostas', coalesce(($n$);
  end if;
  if position($a$'pagina'$a$ in w) = 0 then
    if position($a$'nome', a.nome, 'assinado_em'$a$ in w) = 0 then raise exception 'ficha_cadastral_publica mudou: pôr a página à mão'; end if;
    execute replace(w, $a$'nome', a.nome, 'assinado_em'$a$,
      $n$'pagina', (select coalesce(nullif(btrim(portal_link), ''), portal_token::text) from clientes where id = a.cliente_id),
    'nome', a.nome, 'assinado_em'$n$);
  end if;
end $$;
