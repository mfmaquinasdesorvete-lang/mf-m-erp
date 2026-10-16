-- =====================================================================
-- Mercado Livre (fase 2): o ERP manda o estoque e o preço para os anúncios
--  * ml_contas ganha os ajustes do envio: mandar estoque (sim/não), mandar preço (sim/não), qual preço (preço de venda
--    ou uma tabela de preço, ex. "Marketplace"), ajuste em %, estoque de segurança, limite de estoque mostrado e a trava
--    de preço (mudança maior que X% espera aprovação no ERP). Tudo começa desligado;
--  * ml_anuncios ganha as exceções de cada anúncio (não mandar estoque / não mandar preço);
--  * ml_anuncios_envio: o que foi mandado para cada anúncio (último estoque e preço, quando), o preço que estava no
--    anúncio quando o ERP leu, a mudança de preço esperando aprovação e o último erro;
--  * ml_sync_fila: um registro por anúncio que precisa atualizar (sem repetir), preenchido por gatilhos quando muda o
--    estoque do produto na unidade da conta, o preço/custo do produto, a tabela de preço, as peças de um kit, ou quando
--    o anúncio é ligado a um produto. A função mercadolivre ({"acao":"anuncios"}) esvazia a fila a cada 5 minutos;
--  * uma vez por dia todos os anúncios ligados entram na fila para conferir (pega o que os gatilhos não veem, como
--    um preço fixo tirado da tabela): só vai para o Mercado Livre o que mudou;
--  * funções para a tela (administrador, financeiro ou marketplaces): ajustes, exceções, aprovar preço travado e
--    "Sincronizar agora"; lista dos anúncios com o que o ERP vai mandar.
-- Somente acréscimos: colunas e tabelas novas, funções create or replace, gatilhos e políticas novos.
-- Sem conta conectada nada entra na fila (os gatilhos só olham se o envio está ligado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ajustes da conta e exceções do anúncio
-- ---------------------------------------------------------------------
alter table public.ml_contas add column if not exists enviar_estoque boolean not null default false;
alter table public.ml_contas add column if not exists enviar_preco boolean not null default false;
alter table public.ml_contas add column if not exists preco_tabela_id uuid references public.tabelas_preco(id);
alter table public.ml_contas add column if not exists preco_ajuste numeric(6,2) not null default 0;
alter table public.ml_contas add column if not exists estoque_seguranca int not null default 0;
alter table public.ml_contas add column if not exists estoque_maximo int;
alter table public.ml_contas add column if not exists trava_preco numeric(5,2) not null default 20;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ml_contas_envio_valores') then
    alter table public.ml_contas add constraint ml_contas_envio_valores check (
      preco_ajuste between -50 and 300 and estoque_seguranca >= 0 and (estoque_maximo is null or estoque_maximo > 0)
      and trava_preco between 0 and 100);
  end if;
end $$;

alter table public.ml_anuncios add column if not exists enviar_estoque boolean not null default true;
alter table public.ml_anuncios add column if not exists enviar_preco boolean not null default true;
create index if not exists ml_anuncios_produto on public.ml_anuncios (produto_id) where produto_id is not null;

-- ---------------------------------------------------------------------
-- O que foi mandado para cada anúncio (gravado só pela função mercadolivre; a tela lê pela ml_anuncios_lista)
-- ---------------------------------------------------------------------
create table if not exists public.ml_anuncios_envio (
  anuncio_id uuid primary key references public.ml_anuncios(id),
  ultimo_estoque int,
  estoque_enviado_em timestamptz,
  ultimo_preco numeric(12,2),
  preco_enviado_em timestamptz,
  -- como estava no Mercado Livre quando o ERP leu o anúncio (o preço vale de referência para a trava antes do 1º envio)
  preco_ml numeric(12,2),
  estoque_ml int,
  status_ml text,
  logistica text,
  lido_em timestamptz,
  -- mudança de preço acima da trava: fica esperando aprovação
  preco_pendente numeric(12,2),
  preco_pendente_de numeric(12,2),
  preco_aprovado numeric(12,2),
  aprovado_por uuid,
  aprovado_em timestamptz,
  erro text,
  erro_em timestamptz,
  conferido_em timestamptz,
  atualizado_em timestamptz not null default now()
);

-- Fila de envio: um registro por anúncio (o mesmo anúncio não repete; uma mudança nova só atualiza o motivo)
create table if not exists public.ml_sync_fila (
  anuncio_id uuid primary key references public.ml_anuncios(id),
  motivo text,
  forcar boolean not null default false,
  versao int not null default 1,
  pedido_em timestamptz not null default now(),
  proxima_em timestamptz not null default now(),
  tentativas int not null default 0,
  ultimo_erro text
);
create index if not exists ml_sync_fila_proxima on public.ml_sync_fila (proxima_em);

alter table public.ml_anuncios_envio enable row level security;
alter table public.ml_sync_fila enable row level security;
revoke all on public.ml_anuncios_envio, public.ml_sync_fila from anon, authenticated;
grant all on public.ml_anuncios_envio, public.ml_sync_fila to service_role;

-- o perfil Marketplaces também vê a conta e os anúncios (vendas e financeiro já viam)
do $$ begin
  create policy ml_contas_select_marketplace on public.ml_contas for select to authenticated using (public.tem_algum_papel(array['marketplace']));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ml_anuncios_select_marketplace on public.ml_anuncios for select to authenticated using (public.tem_algum_papel(array['marketplace']));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Ajudantes (uso interno)
-- ---------------------------------------------------------------------
-- O envio está ligado? ('estoque', 'preco' ou qualquer um). Sem conta conectada: não.
create or replace function public.ml_envio_ligado(p_o_que text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ml_contas where status <> 'desligada'
                   and case p_o_que when 'estoque' then enviar_estoque when 'preco' then enviar_preco else enviar_estoque or enviar_preco end);
$$;

-- Unidade cujo estoque vai para o Mercado Livre (a da conta; sem ela, SP; sem SP, a matriz) — a mesma das vendas
create or replace function public.ml_unidade_envio()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select unidade_id from ml_contas where status <> 'desligada' order by created_at limit 1),
                  (select id from unidades where upper(codigo) = 'SP' limit 1), public.unidade_matriz());
$$;

-- Kits que usam o produto (em qualquer nível): o estoque deles sai das peças
create or replace function public.ml_kits_com(p_produto uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive pais(id, nivel) as (
    select k.kit_id, 1 from kit_componentes k where k.componente_id = p_produto
    union
    select k.kit_id, p.nivel + 1 from kit_componentes k join pais p on k.componente_id = p.id where p.nivel < 10
  )
  select distinct id from pais;
$$;

-- Põe na fila os anúncios ligados aos produtos (ou os anúncios pedidos; tudo nulo = todos os ligados)
create or replace function public.ml_enfileirar(p_produtos uuid[], p_motivo text, p_forcar boolean default false, p_anuncios uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into ml_sync_fila as f (anuncio_id, motivo, forcar)
  select a.id, left(coalesce(p_motivo, 'mudança'), 200), coalesce(p_forcar, false)
    from ml_anuncios a
   where a.produto_id is not null
     and (p_produtos is null or a.produto_id = any(p_produtos))
     and (p_anuncios is null or a.id = any(p_anuncios))
  on conflict (anuncio_id) do update
    set motivo = excluded.motivo, forcar = f.forcar or excluded.forcar, versao = f.versao + 1,
        pedido_em = now(), proxima_em = now(), tentativas = 0;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.ml_envio_ligado(text) from public, anon, authenticated;
revoke execute on function public.ml_unidade_envio() from public, anon, authenticated;
revoke execute on function public.ml_kits_com(uuid) from public, anon, authenticated;
revoke execute on function public.ml_enfileirar(uuid[], text, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.ml_envio_ligado(text) to service_role;
grant execute on function public.ml_unidade_envio() to service_role;
grant execute on function public.ml_kits_com(uuid) to service_role;
grant execute on function public.ml_enfileirar(uuid[], text, boolean, uuid[]) to service_role;

-- ---------------------------------------------------------------------
-- Gatilhos que enchem a fila. Nunca travam a operação de origem (estoque, venda, cadastro): erro vira só aviso no log.
-- ---------------------------------------------------------------------
-- Estoque mudou na unidade da conta: o produto e os kits que usam ele
create or replace function public.trg_ml_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.quantidade is not distinct from old.quantidade then return null; end if;
  end if;
  if not public.ml_envio_ligado('estoque') then return null; end if;
  if new.unidade_id is distinct from public.ml_unidade_envio() then return null; end if;
  begin
    perform public.ml_enfileirar(array[new.produto_id] || array(select public.ml_kits_com(new.produto_id)), 'estoque mudou');
  exception when others then
    raise warning 'mercado livre (fila de envio): %', sqlerrm;
  end;
  return null;
end $$;

-- Preço, custo, ativo ou kit do produto mudou (o custo das peças entra no custo do kit)
create or replace function public.trg_ml_produto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.ml_envio_ligado() then return null; end if;
  begin
    perform public.ml_enfileirar(array[new.id] || array(select public.ml_kits_com(new.id)), 'cadastro do produto mudou');
  exception when others then
    raise warning 'mercado livre (fila de envio): %', sqlerrm;
  end;
  return null;
end $$;

-- Preço fixo de um produto na tabela usada pelo Mercado Livre
create or replace function public.trg_ml_tabela_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ml_contas where status <> 'desligada' and enviar_preco and preco_tabela_id = new.tabela_id) then return null; end if;
  begin
    perform public.ml_enfileirar(array[new.produto_id], 'preço da tabela mudou');
  exception when others then
    raise warning 'mercado livre (fila de envio): %', sqlerrm;
  end;
  return null;
end $$;

-- % ou arredondamento da tabela usada pelo Mercado Livre: todos os anúncios
create or replace function public.trg_ml_tabela()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ml_contas where status <> 'desligada' and enviar_preco and preco_tabela_id = new.id) then return null; end if;
  begin
    perform public.ml_enfileirar(null, 'tabela de preço mudou');
  exception when others then
    raise warning 'mercado livre (fila de envio): %', sqlerrm;
  end;
  return null;
end $$;

-- Peças do kit mudaram: o kit e os kits que usam ele
create or replace function public.trg_ml_kit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.ml_envio_ligado() then return null; end if;
  begin
    perform public.ml_enfileirar(array[new.kit_id] || array(select public.ml_kits_com(new.kit_id)), 'peças do kit mudaram');
  exception when others then
    raise warning 'mercado livre (fila de envio): %', sqlerrm;
  end;
  return null;
end $$;

-- Anúncio ligado a um produto (na tela, pelo SKU ou na importação da venda) ou exceção religada
create or replace function public.trg_ml_anuncio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if new.produto_id is null then return null; end if;
  if tg_op = 'INSERT' then
    v_motivo := 'anúncio ligado a um produto';
  elsif new.produto_id is distinct from old.produto_id then
    v_motivo := 'anúncio ligado a um produto';
  elsif (new.enviar_estoque and not old.enviar_estoque) or (new.enviar_preco and not old.enviar_preco) then
    v_motivo := 'exceção do anúncio mudou';
  else
    return null;
  end if;
  if not public.ml_envio_ligado() then return null; end if;
  begin
    perform public.ml_enfileirar(null, v_motivo, false, array[new.id]);
  exception when others then
    raise warning 'mercado livre (fila de envio): %', sqlerrm;
  end;
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ml_estoque' and tgrelid = 'public.estoque_unidade'::regclass) then
    create trigger trg_ml_estoque after insert or update of quantidade on public.estoque_unidade
      for each row execute function public.trg_ml_estoque();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ml_produto' and tgrelid = 'public.produtos'::regclass) then
    create trigger trg_ml_produto after update of preco_venda, preco_custo, ativo, kit on public.produtos
      for each row when (old.preco_venda is distinct from new.preco_venda or old.preco_custo is distinct from new.preco_custo
                         or old.ativo is distinct from new.ativo or old.kit is distinct from new.kit)
      execute function public.trg_ml_produto();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ml_tabela_item' and tgrelid = 'public.tabela_preco_itens'::regclass) then
    create trigger trg_ml_tabela_item after insert or update of preco on public.tabela_preco_itens
      for each row execute function public.trg_ml_tabela_item();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ml_tabela' and tgrelid = 'public.tabelas_preco'::regclass) then
    create trigger trg_ml_tabela after update of ajuste_percentual, arredondamento, ativo on public.tabelas_preco
      for each row when (old.ajuste_percentual is distinct from new.ajuste_percentual or old.arredondamento is distinct from new.arredondamento
                         or old.ativo is distinct from new.ativo)
      execute function public.trg_ml_tabela();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ml_kit' and tgrelid = 'public.kit_componentes'::regclass) then
    create trigger trg_ml_kit after insert or update on public.kit_componentes
      for each row execute function public.trg_ml_kit();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ml_anuncio' and tgrelid = 'public.ml_anuncios'::regclass) then
    create trigger trg_ml_anuncio after insert or update of produto_id, enviar_estoque, enviar_preco on public.ml_anuncios
      for each row execute function public.trg_ml_anuncio();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Dados de cada anúncio para o cálculo (o cálculo fica no código: _shared/ml-anuncios.ts, o mesmo na tela e no envio)
-- ---------------------------------------------------------------------
create or replace function public.ml_anuncios_dados(p_anuncios uuid[] default null, p_produto uuid default null)
returns table (
  anuncio_id uuid, ml_item_id text, variation_id text, titulo text, sku text,
  produto_id uuid, produto text, produto_sku text, produto_ativo boolean, kit boolean,
  enviar_estoque boolean, enviar_preco boolean,
  saldo numeric, componentes jsonb, preco_base numeric, custo numeric, tabela_ok boolean,
  ultimo_estoque int, estoque_enviado_em timestamptz, ultimo_preco numeric, preco_enviado_em timestamptz,
  preco_ml numeric, estoque_ml int, status_ml text, logistica text, lido_em timestamptz,
  preco_pendente numeric, preco_pendente_de numeric, preco_aprovado numeric, aprovado_em timestamptz,
  erro text, erro_em timestamptz, conferido_em timestamptz,
  na_fila boolean, fila_motivo text, fila_desde timestamptz)
language sql stable security definer set search_path = public as $$
  with conta as (
    select c.preco_tabela_id, public.ml_unidade_envio() as unidade_id
      from (select 1) um
      left join lateral (select * from ml_contas where status <> 'desligada' order by created_at limit 1) c on true
  )
  select a.id, a.ml_item_id, a.variation_id, a.titulo, a.sku,
         p.id, p.descricao, p.sku, p.ativo, coalesce(p.kit, false),
         a.enviar_estoque, a.enviar_preco,
         case when p.id is not null and not coalesce(p.kit, false) then coalesce(eu.quantidade, 0) end,
         case when coalesce(p.kit, false) then
           (select coalesce(jsonb_agg(jsonb_build_object('quantidade', k.quantidade, 'saldo', coalesce(e2.quantidade, 0))), '[]'::jsonb)
              from public.kit_composicao(p.id, null::jsonb) k
              left join estoque_unidade e2 on e2.produto_id = k.componente_id and e2.unidade_id = conta.unidade_id)
         end,
         case when p.id is null then null
              when conta.preco_tabela_id is not null then public.preco_tabela(conta.preco_tabela_id, p.id)
              else p.preco_venda end,
         case when p.id is null then null
              when coalesce(p.preco_custo, 0) > 0 or not coalesce(p.kit, false) then p.preco_custo
              else (select sum(k.quantidade * coalesce(c2.preco_custo, 0))
                      from public.kit_composicao(p.id, null::jsonb) k join produtos c2 on c2.id = k.componente_id) end,
         case when conta.preco_tabela_id is null or p.id is null then null
              else exists (select 1 from tabelas_preco t where t.id = conta.preco_tabela_id and t.ativo)
                   or exists (select 1 from tabela_preco_itens i where i.tabela_id = conta.preco_tabela_id and i.produto_id = p.id) end,
         s.ultimo_estoque, s.estoque_enviado_em, s.ultimo_preco, s.preco_enviado_em,
         s.preco_ml, s.estoque_ml, s.status_ml, s.logistica, s.lido_em,
         s.preco_pendente, s.preco_pendente_de, s.preco_aprovado, s.aprovado_em,
         s.erro, s.erro_em, s.conferido_em,
         f.anuncio_id is not null, f.motivo, f.pedido_em
    from ml_anuncios a
    cross join conta
    left join produtos p on p.id = a.produto_id
    left join estoque_unidade eu on eu.produto_id = p.id and eu.unidade_id = conta.unidade_id
    left join ml_anuncios_envio s on s.anuncio_id = a.id
    left join ml_sync_fila f on f.anuncio_id = a.id
   where (p_anuncios is null or a.id = any(p_anuncios))
     and (p_produto is null or a.produto_id = p_produto)
   order by a.titulo, a.ml_item_id, a.variation_id;
$$;
revoke execute on function public.ml_anuncios_dados(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.ml_anuncios_dados(uuid[], uuid) to service_role;

-- Para a tela: lista dos anúncios (todos ou só os de um produto) com o que o ERP sabe de cada um
create or replace function public.ml_anuncios_lista(p_produto uuid default null)
returns table (
  anuncio_id uuid, ml_item_id text, variation_id text, titulo text, sku text,
  produto_id uuid, produto text, produto_sku text, produto_ativo boolean, kit boolean,
  enviar_estoque boolean, enviar_preco boolean,
  saldo numeric, componentes jsonb, preco_base numeric, custo numeric, tabela_ok boolean,
  ultimo_estoque int, estoque_enviado_em timestamptz, ultimo_preco numeric, preco_enviado_em timestamptz,
  preco_ml numeric, estoque_ml int, status_ml text, logistica text, lido_em timestamptz,
  preco_pendente numeric, preco_pendente_de numeric, preco_aprovado numeric, aprovado_em timestamptz,
  erro text, erro_em timestamptz, conferido_em timestamptz,
  na_fila boolean, fila_motivo text, fila_desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tem_algum_papel(array['vendas', 'financeiro', 'marketplace']) then raise exception 'acesso negado'; end if;
  return query select * from public.ml_anuncios_dados(null, p_produto);
end $$;
revoke execute on function public.ml_anuncios_lista(uuid) from public, anon;
grant execute on function public.ml_anuncios_lista(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Funções da tela (administrador, financeiro ou marketplaces)
-- ---------------------------------------------------------------------
-- Ajustes do envio. p: { enviar_estoque, enviar_preco, preco_tabela_id ("" ou null = preço de venda), preco_ajuste,
--                       estoque_seguranca, estoque_maximo ("" ou null = sem limite), trava_preco } — só o que vier muda
create or replace function public.ml_configurar_envio(p_conta uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_antes ml_contas;
  v_depois ml_contas;
  v_tabela uuid;
  v_ajuste numeric;
  v_seg int;
  v_max int;
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
  v_trava := case when p ? 'trava_preco' then coalesce(nullif(p->>'trava_preco', '')::numeric, 0) else v_antes.trava_preco end;
  if v_trava not between 0 and 100 then raise exception 'a trava de preço vai de 0%% (sem trava) a 100%%'; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  update ml_contas set
    enviar_estoque = case when p ? 'enviar_estoque' then coalesce((p->>'enviar_estoque')::boolean, false) else enviar_estoque end,
    enviar_preco = case when p ? 'enviar_preco' then coalesce((p->>'enviar_preco')::boolean, false) else enviar_preco end,
    preco_tabela_id = v_tabela, preco_ajuste = round(v_ajuste, 2), estoque_seguranca = v_seg, estoque_maximo = v_max,
    trava_preco = round(v_trava, 2)
  where id = p_conta
  returning * into v_depois;

  -- mudou o que vai para os anúncios: todos entram na fila para conferir (só vai o que ficou diferente)
  if (v_depois.enviar_estoque or v_depois.enviar_preco)
     and row(v_antes.enviar_estoque, v_antes.enviar_preco, v_antes.preco_tabela_id, v_antes.preco_ajuste, v_antes.estoque_seguranca, v_antes.estoque_maximo)
         is distinct from
         row(v_depois.enviar_estoque, v_depois.enviar_preco, v_depois.preco_tabela_id, v_depois.preco_ajuste, v_depois.estoque_seguranca, v_depois.estoque_maximo) then
    perform public.ml_enfileirar(null, 'ajustes do envio mudaram');
  end if;
end $$;
revoke execute on function public.ml_configurar_envio(uuid, jsonb) from public, anon;
grant execute on function public.ml_configurar_envio(uuid, jsonb) to authenticated;

-- Exceções de um anúncio: não mandar estoque / não mandar preço (null = não muda)
create or replace function public.ml_anuncio_excecoes(p_anuncio uuid, p_enviar_estoque boolean default null, p_enviar_preco boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_algum_papel(array['financeiro', 'marketplace']) then
    raise exception 'só o administrador, o financeiro ou marketplaces mudam o envio para o Mercado Livre';
  end if;
  perform set_config('erp.acao_usuario', 'on', true);
  update ml_anuncios set enviar_estoque = coalesce(p_enviar_estoque, enviar_estoque), enviar_preco = coalesce(p_enviar_preco, enviar_preco)
   where id = p_anuncio;
  if not found then raise exception 'anúncio não encontrado'; end if;
end $$;
revoke execute on function public.ml_anuncio_excecoes(uuid, boolean, boolean) from public, anon;
grant execute on function public.ml_anuncio_excecoes(uuid, boolean, boolean) to authenticated;

-- Aprovar uma mudança de preço acima da trava (o preço que a pessoa viu na tela; se mudar de novo, trava de novo)
create or replace function public.ml_aprovar_preco(p_anuncio uuid, p_preco numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_algum_papel(array['financeiro', 'marketplace']) then
    raise exception 'só o administrador, o financeiro ou marketplaces aprovam preço do Mercado Livre';
  end if;
  if p_preco is null or p_preco <= 0 then raise exception 'preço inválido'; end if;
  if not exists (select 1 from ml_anuncios where id = p_anuncio and produto_id is not null) then
    raise exception 'anúncio não encontrado ou sem produto ligado';
  end if;
  insert into ml_anuncios_envio (anuncio_id, preco_aprovado, aprovado_por, aprovado_em, atualizado_em)
  values (p_anuncio, round(p_preco, 2), auth.uid(), now(), now())
  on conflict (anuncio_id) do update
    set preco_aprovado = excluded.preco_aprovado, aprovado_por = excluded.aprovado_por, aprovado_em = excluded.aprovado_em, atualizado_em = now();
  perform public.ml_enfileirar(null, 'preço aprovado', false, array[p_anuncio]);
end $$;
revoke execute on function public.ml_aprovar_preco(uuid, numeric) from public, anon;
grant execute on function public.ml_aprovar_preco(uuid, numeric) to authenticated;

-- "Sincronizar agora": todos os anúncios ligados (ou só os pedidos) entram na fila e vão mesmo se iguais ao último envio.
-- A tela chama a função mercadolivre logo depois; se ela não responder, o agendamento de 5 minutos manda.
create or replace function public.ml_sincronizar_agora(p_anuncios uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_algum_papel(array['financeiro', 'marketplace']) then
    raise exception 'só o administrador, o financeiro ou marketplaces sincronizam o Mercado Livre';
  end if;
  if not exists (select 1 from ml_contas where status <> 'desligada') then
    raise exception 'conecte antes a conta do Mercado Livre';
  end if;
  if not public.ml_envio_ligado() then
    raise exception 'ligue antes o envio do estoque ou do preço';
  end if;
  return public.ml_enfileirar(null, 'sincronizar agora', true, p_anuncios);
end $$;
revoke execute on function public.ml_sincronizar_agora(uuid[]) from public, anon;
grant execute on function public.ml_sincronizar_agora(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Só a função mercadolivre: pegar a vez na fila e registrar os anúncios lidos da conta
-- ---------------------------------------------------------------------
-- Pega os próximos da fila e reserva por 3 minutos (duas execuções juntas não mandam o mesmo anúncio)
create or replace function public.ml_fila_pegar(p_limite int default 40)
returns setof public.ml_sync_fila language sql security definer set search_path = public as $$
  update ml_sync_fila f set proxima_em = now() + interval '3 minutes', tentativas = f.tentativas + 1
   where f.anuncio_id in (select x.anuncio_id from ml_sync_fila x where x.proxima_em <= now()
                           order by x.pedido_em limit greatest(1, least(coalesce(p_limite, 40), 200)) for update skip locked)
  returning f.*;
$$;
revoke execute on function public.ml_fila_pegar(int) from public, anon, authenticated;
grant execute on function public.ml_fila_pegar(int) to service_role;

-- Anúncios lidos da conta (busca na API): cria ou atualiza, liga pelo SKU igual ao do cadastro e guarda como estavam
-- p: [{ item_id, variation_id, sku, titulo, preco, estoque, status, logistica }]
create or replace function public.ml_registrar_anuncios(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_id uuid;
  v_prod uuid;
  v_novo boolean;
  v_total int := 0;
  v_novos int := 0;
  v_ligados int := 0;
begin
  for v in select * from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) loop
    continue when coalesce(v->>'item_id', '') !~ '^[A-Z]{3}[0-9]+$';
    insert into ml_anuncios (ml_item_id, variation_id, sku, titulo)
    values (v->>'item_id', coalesce(v->>'variation_id', ''), nullif(btrim(v->>'sku'), ''),
            left(coalesce(nullif(btrim(v->>'titulo'), ''), v->>'item_id'), 300))
    on conflict (ml_item_id, variation_id) do update
      set sku = coalesce(excluded.sku, ml_anuncios.sku), titulo = excluded.titulo
    returning id, produto_id, (xmax = 0) into v_id, v_prod, v_novo;
    v_total := v_total + 1;
    if v_novo then v_novos := v_novos + 1; end if;
    if v_prod is null and coalesce(btrim(v->>'sku'), '') <> '' then
      select id into v_prod from produtos where ativo and lower(btrim(sku)) = lower(btrim(v->>'sku')) order by created_at limit 1;
      if v_prod is not null then
        update ml_anuncios set produto_id = v_prod, ligado_em = now() where id = v_id;
        v_ligados := v_ligados + 1;
      end if;
    end if;
    insert into ml_anuncios_envio (anuncio_id, preco_ml, estoque_ml, status_ml, logistica, lido_em)
    values (v_id, nullif(v->>'preco', '')::numeric, round(nullif(v->>'estoque', '')::numeric)::int, nullif(v->>'status', ''),
            nullif(v->>'logistica', ''), now())
    on conflict (anuncio_id) do update
      set preco_ml = excluded.preco_ml, estoque_ml = excluded.estoque_ml, status_ml = excluded.status_ml,
          logistica = excluded.logistica, lido_em = now(), atualizado_em = now();
  end loop;
  return jsonb_build_object('total', v_total, 'novos', v_novos, 'ligados', v_ligados,
                            'sem_produto', (select count(*) from ml_anuncios where produto_id is null));
end $$;
revoke execute on function public.ml_registrar_anuncios(jsonb) from public, anon, authenticated;
grant execute on function public.ml_registrar_anuncios(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Agendamento: a fila sai a cada 5 minutos (só com conta ativa, envio ligado e algo na vez) e todo dia de manhã
-- (06:37 em Brasília) os anúncios ligados entram na fila para conferir
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'erp-mercadolivre-anuncios') then
    perform cron.schedule('erp-mercadolivre-anuncios', '*/5 * * * *', $c$ select public.chamar_funcao('mercadolivre', '{"acao":"anuncios"}'::jsonb, 120000)
      where exists (select 1 from public.ml_contas where status = 'ativa' and (enviar_estoque or enviar_preco))
        and exists (select 1 from public.ml_sync_fila where proxima_em <= now()) $c$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'erp-mercadolivre-conferir') then
    perform cron.schedule('erp-mercadolivre-conferir', '37 9 * * *', $c$ select public.ml_enfileirar(null, 'conferência diária')
      where public.ml_envio_ligado() $c$);
  end if;
end $$;
