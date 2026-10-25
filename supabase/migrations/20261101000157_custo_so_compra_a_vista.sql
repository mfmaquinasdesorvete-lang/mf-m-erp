-- Custo do produto só pela compra à vista (decisão da usuária em 25/10, pedido vindo do PRD): o preço de alguns itens
-- (compressores) muda muito conforme o prazo, e a formação de preço usa o custo à vista.
--  * compra_atualiza_custo(nota): à vista (escolhido na entrada ou lido do XML) ou cartão de crédito → atualiza;
--    a prazo ou "não informado" → não atualiza (a tela pede a escolha antes de confirmar a entrada).
--  * lancar_estoque_nfe_core e nf_custos_core passam a respeitar isso: a compra a prazo entra no estoque e fica no
--    histórico (nfe_custos_itens com custo_aplicado = false e historico_custos com "a prazo"), sem mudar produtos.preco_custo.
--  * nfe_condicao / nfe_condicao_salvar: ler e gravar "À vista / A prazo (dias)" na entrada da nota.
-- As duas funções são alteradas por troca de trecho no texto atual (o resto delas continua igual).

create or replace function public.compra_atualiza_custo(p_nfe uuid)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select public.condicao_compra(n.data_emissao, n.xml::text, n.condicao_pagamento, n.prazo_dias) in ('à vista', 'cartão de crédito')
                     from public.nfe_recebidas n where n.id = p_nfe), false)
$$;
revoke all on function public.compra_atualiza_custo(uuid) from public, anon;
grant execute on function public.compra_atualiza_custo(uuid) to authenticated, service_role;

do $$
declare d text; antes text; depois text;
begin
  d := pg_get_functiondef('public.lancar_estoque_nfe_core(uuid, jsonb)'::regprocedure);
  antes := 'if coalesce((v_item->>''atualizar_custo'')::boolean, true) then';
  depois := 'if coalesce((v_item->>''atualizar_custo'')::boolean, true) and public.compra_atualiza_custo(p_nfe) then';
  if position(depois in d) = 0 then
    if position(antes in d) = 0 then raise exception 'lancar_estoque_nfe_core mudou: confira o trecho do custo'; end if;
    execute replace(d, antes, depois);
  end if;

  d := pg_get_functiondef('public.nf_custos_core(uuid, jsonb, jsonb)'::regprocedure);
  antes := 'v_atualizar := coalesce((v->>''atualizar_custo'')::boolean, true);';
  depois := 'v_atualizar := coalesce((v->>''atualizar_custo'')::boolean, true) and public.compra_atualiza_custo(p_nfe);';
  if position(depois in d) = 0 then
    if position(antes in d) = 0 then raise exception 'nf_custos_core mudou: confira o trecho do custo'; end if;
    execute replace(d, antes, depois);
  end if;
end $$;

-- Ler: o que foi escolhido, o que o XML diz e o que vale.
create or replace function public.nfe_condicao(p_nfe uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n public.nfe_recebidas;
begin
  if not public.tem_papel('financeiro', 'compras') then raise exception 'sem permissão'; end if;
  select * into n from public.nfe_recebidas where id = p_nfe;
  if not found then return null; end if;
  return jsonb_build_object(
    'condicao_pagamento', n.condicao_pagamento, 'prazo_dias', n.prazo_dias,
    'pelo_xml', public.condicao_compra(n.data_emissao, n.xml::text, null, null),
    'vale', public.condicao_compra(n.data_emissao, n.xml::text, n.condicao_pagamento, n.prazo_dias),
    'atualiza_custo', public.compra_atualiza_custo(p_nfe));
end $$;
revoke all on function public.nfe_condicao(uuid) from public, anon;
grant execute on function public.nfe_condicao(uuid) to authenticated;

-- Gravar (nulo = volta a valer o XML).
create or replace function public.nfe_condicao_salvar(p_nfe uuid, p_condicao text, p_prazo integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_papel('financeiro', 'compras') then raise exception 'sem permissão'; end if;
  if p_condicao is not null and p_condicao not in ('a_vista', 'a_prazo') then raise exception 'escolha à vista ou a prazo'; end if;
  if p_prazo is not null and (p_prazo < 0 or p_prazo > 720) then raise exception 'prazo inválido'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  update public.nfe_recebidas
     set condicao_pagamento = p_condicao, prazo_dias = case when p_condicao = 'a_prazo' then p_prazo end
   where id = p_nfe and excluida_em is null;
  if not found then raise exception 'nota não encontrada'; end if;
end $$;
revoke all on function public.nfe_condicao_salvar(uuid, text, integer) from public, anon;
grant execute on function public.nfe_condicao_salvar(uuid, text, integer) to authenticated;
