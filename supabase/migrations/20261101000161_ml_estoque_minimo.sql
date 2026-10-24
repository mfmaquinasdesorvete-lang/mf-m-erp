-- Mercado Livre: mínimo de estoque no anúncio. Com o estoque zerado (contagem de 24/10) o anúncio iria a 0 e o
-- Mercado Livre pausaria; com o mínimo, o anúncio de produto ativo mostra pelo menos isso (pedido da usuária em
-- 24/10: "pelo menos uma para que fique online"). Vazio ou 0 = sem mínimo (o anúncio segue o estoque).
alter table public.ml_contas add column if not exists estoque_minimo integer;

create or replace function public.ml_configurar_envio(p_conta uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_antes ml_contas;
  v_depois ml_contas;
  v_tabela uuid;
  v_ajuste numeric;
  v_seg int;
  v_max int;
  v_min int;
  v_trava numeric;
begin
  if not public.tem_algum_papel(array['financeiro', 'marketplace']) then
    raise exception 'só o administrador, o financeiro ou marketplaces mudam o envio para o Mercado Livre';
  end if;
  p := coalesce(p, '{}'::jsonb);
  select * into v_antes from ml_contas where id = p_conta for update;
  if v_antes.id is null then raise exception 'conta do Mercado Livre não encontrada'; end if;

  v_tabela := case when p ? 'preco_tabela_id' then nullif(p->>'preco_tabela_id', '')::uuid else v_antes.preco_tabela_id end;
  if p ? 'preco_tabela_id' and v_tabela is not null and not exists (select 1 from tabelas_preco where id = v_tabela and ativo) then
    raise exception 'tabela de preço não encontrada ou desativada';
  end if;
  v_ajuste := case when p ? 'preco_ajuste' then coalesce(nullif(p->>'preco_ajuste', '')::numeric, 0) else v_antes.preco_ajuste end;
  if v_ajuste not between -50 and 300 then raise exception 'o ajuste do preço vai de −50%% a +300%%'; end if;
  v_seg := case when p ? 'estoque_seguranca' then coalesce(round(nullif(p->>'estoque_seguranca', '')::numeric), 0)::int else v_antes.estoque_seguranca end;
  if v_seg < 0 then raise exception 'o estoque de segurança não pode ser negativo'; end if;
  v_max := case when p ? 'estoque_maximo' then nullif(round(nullif(p->>'estoque_maximo', '')::numeric), 0)::int else v_antes.estoque_maximo end;
  if v_max is not null and v_max < 0 then raise exception 'o limite de estoque não pode ser negativo'; end if;
  v_min := case when p ? 'estoque_minimo' then nullif(round(nullif(p->>'estoque_minimo', '')::numeric), 0)::int else v_antes.estoque_minimo end;
  if v_min is not null and v_min < 0 then raise exception 'o mínimo no anúncio não pode ser negativo'; end if;
  if v_min is not null and v_max is not null and v_min > v_max then raise exception 'o mínimo no anúncio não pode passar do limite'; end if;
  v_trava := case when p ? 'trava_preco' then coalesce(nullif(p->>'trava_preco', '')::numeric, 0) else v_antes.trava_preco end;
  if v_trava not between 0 and 100 then raise exception 'a trava de preço vai de 0%% (sem trava) a 100%%'; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  update ml_contas set
    enviar_estoque = case when p ? 'enviar_estoque' then coalesce((p->>'enviar_estoque')::boolean, false) else enviar_estoque end,
    enviar_preco = case when p ? 'enviar_preco' then coalesce((p->>'enviar_preco')::boolean, false) else enviar_preco end,
    preco_tabela_id = v_tabela, preco_ajuste = round(v_ajuste, 2), estoque_seguranca = v_seg, estoque_maximo = v_max,
    estoque_minimo = v_min, trava_preco = round(v_trava, 2)
  where id = p_conta
  returning * into v_depois;

  -- mudou o que vai para os anúncios: todos entram na fila para conferir (só vai o que ficou diferente)
  if (v_depois.enviar_estoque or v_depois.enviar_preco)
     and row(v_antes.enviar_estoque, v_antes.enviar_preco, v_antes.preco_tabela_id, v_antes.preco_ajuste, v_antes.estoque_seguranca, v_antes.estoque_maximo, v_antes.estoque_minimo)
         is distinct from
         row(v_depois.enviar_estoque, v_depois.enviar_preco, v_depois.preco_tabela_id, v_depois.preco_ajuste, v_depois.estoque_seguranca, v_depois.estoque_maximo, v_depois.estoque_minimo) then
    perform public.ml_enfileirar(null, 'ajustes do envio mudaram');
  end if;
end $$;
