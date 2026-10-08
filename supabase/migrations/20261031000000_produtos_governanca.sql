-- =====================================================================
-- Cadastro de produtos: identidade única, dados consistentes e regras de
-- estoque e custo.
--   * Novos campos: modelo, código do fabricante, códigos alternativos,
--     fora de linha, prazo de reposição e compra mínima.
--   * SKU único (sem diferença de maiúsculas/espaços) e nunca reaproveitado:
--     o código que já foi de um produto não volta para outro.
--   * Validação ao gravar: descrição e unidade padronizadas, NCM com 8
--     dígitos, custo e preço não negativos.
--   * Alteração sensível feita na tela (SKU, unidade, tipo, custo, preço de
--     venda) só pelo financeiro/administrador e com motivo, que vai para o
--     histórico de alterações. Preencher pela primeira vez não pede motivo.
--   * Movimentação manual de estoque exige motivo; campo de documento.
--   * Contagem de estoque (inventário cíclico): o saldo só é ajustado ao
--     concluir, e cada divergência precisa de justificativa.
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================

alter table public.produtos
  add column if not exists modelo text,
  add column if not exists codigo_fabricante text,
  add column if not exists codigos_alternativos text,
  add column if not exists fora_de_linha boolean not null default false,
  add column if not exists prazo_reposicao_dias int check (prazo_reposicao_dias is null or prazo_reposicao_dias >= 0),
  add column if not exists compra_minima numeric(12,3) check (compra_minima is null or compra_minima >= 0),
  add column if not exists motivo_alteracao text;

alter table public.estoque_movimentos add column if not exists documento text;

-- ---------------------------------------------------------------------
-- SKU: único e nunca reaproveitado
-- ---------------------------------------------------------------------
create unique index if not exists produtos_sku_unico on public.produtos (upper(btrim(sku))) where sku is not null and btrim(sku) <> '';

create table if not exists public.produto_skus (
  sku_norm text primary key,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  sku text not null,
  usado_em timestamptz not null default now()
);
alter table public.produto_skus enable row level security;
do $$ begin
  create policy "ps_select" on public.produto_skus for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;
insert into public.produto_skus (sku_norm, produto_id, sku)
select upper(btrim(sku)), id, btrim(sku) from public.produtos where sku is not null and btrim(sku) <> ''
on conflict (sku_norm) do nothing;

-- quem já usou o código (null = livre ou do próprio produto)
create or replace function public.dono_do_sku(p_sku text, p_produto uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.descricao, 'produto excluído')
    from produto_skus s left join produtos p on p.id = s.produto_id
   where s.sku_norm = upper(btrim(p_sku)) and s.produto_id <> p_produto
   limit 1;
$$;
revoke execute on function public.dono_do_sku(text, uuid) from public, anon;
grant execute on function public.dono_do_sku(text, uuid) to authenticated;

create or replace function public.trg_produto_registrar_sku()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sku is not null then
    insert into produto_skus (sku_norm, produto_id, sku) values (upper(btrim(new.sku)), new.id, new.sku)
    on conflict (sku_norm) do nothing;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Validação e alterações sensíveis
-- ---------------------------------------------------------------------
create or replace function public.trg_produto_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  v_direto boolean := current_user in ('authenticated', 'anon');
  v_sens text[] := '{}';
  v_dono text;
  v_usado boolean;
begin
  new.descricao := regexp_replace(btrim(coalesce(new.descricao, '')), '\s+', ' ', 'g');
  if new.descricao = '' then raise exception 'informe a descrição do produto'; end if;
  new.sku := nullif(regexp_replace(btrim(coalesce(new.sku, '')), '\s+', ' ', 'g'), '');
  new.unidade := upper(btrim(coalesce(new.unidade, '')));
  if new.unidade = '' then raise exception 'informe a unidade de medida (UN, PC, KG, MT, CX…)'; end if;
  if length(new.unidade) > 6 then raise exception 'a unidade tem no máximo 6 letras (ex.: UN, PC, KG, MT, CX)'; end if;
  new.ncm := nullif(regexp_replace(coalesce(new.ncm, ''), '\D', '', 'g'), '');
  if new.ncm is not null and length(new.ncm) <> 8 then raise exception 'o NCM tem 8 dígitos (%)', new.ncm; end if;
  if new.preco_custo < 0 or new.preco_venda < 0 then raise exception 'custo e preço não podem ser negativos'; end if;
  new.marca := nullif(btrim(coalesce(new.marca, '')), '');
  new.modelo := nullif(btrim(coalesce(new.modelo, '')), '');
  new.categoria := nullif(regexp_replace(btrim(coalesce(new.categoria, '')), '\s+', ' ', 'g'), '');

  if new.sku is not null and (tg_op = 'INSERT' or new.sku is distinct from old.sku) then
    v_dono := public.dono_do_sku(new.sku, new.id);
    if v_dono is not null then
      raise exception 'o código % já foi usado por "%": código de produto não se reaproveita, use outro', new.sku, v_dono;
    end if;
  end if;

  -- alteração sensível feita direto na tela (as rotinas do ERP, como a entrada de NF, já validam)
  if tg_op = 'UPDATE' and v_direto then
    if old.sku is not null and new.sku is distinct from old.sku then v_sens := array_append(v_sens, 'código (SKU)'); end if;
    -- unidade e tipo só pesam depois que o produto já foi movimentado ou vendido
    if new.unidade is distinct from old.unidade or new.tipo is distinct from old.tipo then
      v_usado := exists (select 1 from estoque_movimentos where produto_id = new.id)
              or exists (select 1 from pedido_itens where produto_id = new.id);
      if v_usado and new.unidade is distinct from old.unidade then v_sens := array_append(v_sens, 'unidade'); end if;
      if v_usado and new.tipo is distinct from old.tipo then v_sens := array_append(v_sens, 'tipo'); end if;
    end if;
    if old.preco_custo > 0 and new.preco_custo is distinct from old.preco_custo then v_sens := array_append(v_sens, 'custo'); end if;
    if old.preco_venda > 0 and new.preco_venda is distinct from old.preco_venda then v_sens := array_append(v_sens, 'preço de venda'); end if;
    if cardinality(v_sens) > 0 then
      if not public.tem_papel('financeiro') then
        raise exception 'só o financeiro ou o administrador altera %', array_to_string(v_sens, ', ');
      end if;
      if nullif(btrim(coalesce(new.motivo_alteracao, '')), '') is null then
        raise exception 'informe o motivo da alteração de %', array_to_string(v_sens, ', ');
      end if;
    end if;
  end if;
  return new;
end $$;

do $$ begin
  create trigger trg_produto_validar before insert or update on public.produtos for each row execute function public.trg_produto_validar();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_produto_registrar_sku after insert or update of sku on public.produtos for each row execute function public.trg_produto_registrar_sku();
exception when duplicate_object then null; end $$;

-- produto fora de linha não gera aviso de reposição
create or replace function public.trg_aviso_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo and not new.fora_de_linha and new.estoque_minimo > 0
     and new.estoque_atual <= new.estoque_minimo and old.estoque_atual > old.estoque_minimo then
    perform public.avisar_equipe('estoque_minimo', 'estoque:' || new.id || ':' || current_date,
      jsonb_build_object('produto', new.descricao, 'sku', new.sku, 'atual', new.estoque_atual, 'minimo', new.estoque_minimo, 'unidade', new.unidade));
  end if;
  return null;
end $$;

-- O saldo por unidade é consequência da movimentação, que já passou pela política de
-- estoque_movimentos: a função grava com o dono (antes, a movimentação manual pela tela era
-- barrada pela regra de acesso de estoque_unidade).
create or replace function public.aplicar_movimento_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
declare d numeric := case new.tipo when 'entrada' then abs(new.quantidade) when 'saida' then -abs(new.quantidade) else new.quantidade end;
begin
  update public.produtos set estoque_atual = estoque_atual + d where id = new.produto_id;
  insert into public.estoque_unidade (produto_id, unidade_id, quantidade) values (new.produto_id, new.unidade_id, d)
  on conflict (produto_id, unidade_id) do update set quantidade = public.estoque_unidade.quantidade + excluded.quantidade;
  return new;
end $$;

-- movimentação manual (feita na tela) sempre com motivo
create or replace function public.trg_movimento_motivo()
returns trigger language plpgsql set search_path = public as $$
begin
  new.motivo := nullif(btrim(coalesce(new.motivo, '')), '');
  new.documento := nullif(btrim(coalesce(new.documento, '')), '');
  if current_user in ('authenticated', 'anon') and coalesce(new.referencia_tipo, 'manual') = 'manual' and new.motivo is null then
    raise exception 'informe o motivo da movimentação de estoque';
  end if;
  return new;
end $$;
do $$ begin
  create trigger trg_movimento_motivo before insert on public.estoque_movimentos for each row execute function public.trg_movimento_motivo();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Contagem de estoque (inventário cíclico)
-- ---------------------------------------------------------------------
create table if not exists public.contagens_estoque (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  unidade_id uuid not null references public.unidades(id),
  escopo text,
  status text not null default 'aberta' check (status in ('aberta', 'concluida', 'cancelada')),
  observacao text,
  criada_por uuid default auth.uid(),
  criada_nome text,
  concluida_por uuid,
  concluida_nome text,
  concluida_em timestamptz,
  ajustes int,
  created_at timestamptz not null default now()
);
create table if not exists public.contagem_itens (
  contagem_id uuid not null references public.contagens_estoque(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  saldo_sistema numeric(12,3) not null,
  contado numeric(12,3) check (contado is null or contado >= 0),
  justificativa text,
  primary key (contagem_id, produto_id)
);
alter table public.contagens_estoque enable row level security;
alter table public.contagem_itens enable row level security;
do $$ begin
  create policy "ce_select" on public.contagens_estoque for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ci_select" on public.contagem_itens for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
exception when duplicate_object then null; end $$;
-- quantidade contada e justificativa só enquanto a contagem está aberta
do $$ begin
  create policy "ci_update" on public.contagem_itens for update to authenticated
    using (public.tem_papel('financeiro') and exists (select 1 from public.contagens_estoque c where c.id = contagem_id and c.status = 'aberta'))
    with check (public.tem_papel('financeiro') and exists (select 1 from public.contagens_estoque c where c.id = contagem_id and c.status = 'aberta'));
exception when duplicate_object then null; end $$;

create or replace function public.trg_contagem_item_fixo()
returns trigger language plpgsql as $$
begin
  -- só a quantidade contada e a justificativa mudam pela tela
  new.contagem_id := old.contagem_id; new.produto_id := old.produto_id; new.saldo_sistema := old.saldo_sistema;
  new.justificativa := nullif(btrim(coalesce(new.justificativa, '')), '');
  return new;
end $$;
do $$ begin
  create trigger trg_contagem_item_fixo before update on public.contagem_itens for each row execute function public.trg_contagem_item_fixo();
exception when duplicate_object then null; end $$;

-- Abre a contagem com os produtos escolhidos e guarda o saldo de agora (referência)
create or replace function public.abrir_contagem(p_unidade uuid, p_produtos uuid[], p_escopo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para contar estoque'; end if;
  if not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade'; end if;
  if coalesce(cardinality(p_produtos), 0) = 0 then raise exception 'escolha os produtos a contar'; end if;
  if cardinality(p_produtos) > 2000 then raise exception 'conte no máximo 2.000 produtos por vez'; end if;
  insert into contagens_estoque (unidade_id, escopo, criada_nome)
  values (p_unidade, nullif(btrim(coalesce(p_escopo, '')), ''), (select nome from usuarios_erp where user_id = auth.uid()))
  returning id into v_id;
  insert into contagem_itens (contagem_id, produto_id, saldo_sistema)
  select v_id, p.id, public.estoque_na_unidade(p.id, p_unidade)
    from produtos p where p.id = any (p_produtos) and not p.kit;
  return v_id;
end $$;

-- Conclui: ajusta o saldo de cada item contado com diferença (justificativa obrigatória)
create or replace function public.concluir_contagem(p_contagem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record; i record; v_dif numeric; v_ajustes int := 0; v_contados int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para concluir a contagem'; end if;
  select * into c from contagens_estoque where id = p_contagem for update;
  if c.id is null or c.status <> 'aberta' then raise exception 'contagem não está aberta'; end if;
  for i in select ci.*, p.descricao from contagem_itens ci join produtos p on p.id = ci.produto_id
            where ci.contagem_id = p_contagem and ci.contado is not null loop
    v_contados := v_contados + 1;
    -- diferença contra o saldo de AGORA (o que entrou ou saiu durante a contagem já está no saldo)
    v_dif := i.contado - public.estoque_na_unidade(i.produto_id, c.unidade_id);
    if v_dif <> 0 then
      if i.justificativa is null then raise exception 'justifique a divergência de "%" antes de concluir', i.descricao; end if;
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id, documento)
      values (i.produto_id, 'ajuste', v_dif, 'Contagem nº ' || c.numero || ': ' || i.justificativa, 'contagem', p_contagem, c.unidade_id, 'Contagem nº ' || c.numero);
      v_ajustes := v_ajustes + 1;
    end if;
  end loop;
  if v_contados = 0 then raise exception 'nenhum item foi contado'; end if;
  update contagens_estoque set status = 'concluida', concluida_por = auth.uid(), concluida_em = now(), ajustes = v_ajustes,
         concluida_nome = (select nome from usuarios_erp where user_id = auth.uid())
   where id = p_contagem;
  return jsonb_build_object('contados', v_contados, 'ajustes', v_ajustes);
end $$;

create or replace function public.cancelar_contagem(p_contagem uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão'; end if;
  update contagens_estoque set status = 'cancelada' where id = p_contagem and status = 'aberta';
  if not found then raise exception 'contagem não está aberta'; end if;
end $$;

revoke execute on function public.abrir_contagem(uuid, uuid[], text) from public, anon;
revoke execute on function public.concluir_contagem(uuid) from public, anon;
revoke execute on function public.cancelar_contagem(uuid) from public, anon;
grant execute on function public.abrir_contagem(uuid, uuid[], text) to authenticated;
grant execute on function public.concluir_contagem(uuid) to authenticated;
grant execute on function public.cancelar_contagem(uuid) to authenticated;
