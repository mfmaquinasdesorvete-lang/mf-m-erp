-- =====================================================================
-- Formação de preço com aprovação
--   * margem desejada: do produto > da categoria > do tipo (configuração) > padrão
--   * preço sugerido = custo / (1 - (margem + impostos + taxa + comissão + frete) / 100)
--   * quando o custo muda (NF de fornecedor, pedido de compra, produção), o ERP
--     calcula o preço sugerido e, se o preço atual ficou fora da faixa, cria uma
--     sugestão "pendente". Nada muda sozinho: o financeiro aprova (ou ajusta) e
--     só então o preço de venda é trocado, com o motivo no histórico.
-- Somente acréscimos: colunas novas, tabela nova, funções (create or replace).
-- =====================================================================

alter table public.configuracoes add column if not exists precificacao jsonb not null default '{}'::jsonb;
alter table public.produtos add column if not exists margem_desejada numeric(6,2);
alter table public.categorias_produto add column if not exists margem_desejada numeric(6,2);

-- valores iniciais próximos das margens de hoje (mediana: máquinas ~76%, peças ~67%); despesas zeradas até o contador informar
update public.configuracoes
   set precificacao = jsonb_build_object(
         'margens', jsonb_build_object('maquina', 75, 'peca', 65, 'acessorio', 65, 'insumo', 65),
         'margem_padrao', 60, 'impostos_pct', 0, 'taxa_pct', 0, 'comissao_pct', 0, 'frete_pct', 0,
         'arredondar', 'centavos', 'tolerancia_pct', 5, 'sugerir_reducao', false)
 where id = 1 and precificacao = '{}'::jsonb;

create table if not exists public.preco_sugestoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'substituida')),
  origem text not null default 'custo' check (origem in ('custo', 'revisao')),
  custo_anterior numeric(14,4),
  custo_novo numeric(14,4) not null,
  preco_atual numeric(14,2) not null,
  preco_sugerido numeric(14,2) not null,
  margem_alvo numeric(6,2) not null,
  preco_aprovado numeric(14,2),
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists preco_sugestoes_um_pendente on public.preco_sugestoes (produto_id) where status = 'pendente';
create index if not exists preco_sugestoes_status on public.preco_sugestoes (status, created_at desc);

alter table public.preco_sugestoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preco_sugestoes' and policyname = 'erp_select') then
    create policy "erp_select" on public.preco_sugestoes for select to authenticated using (public.tem_papel('financeiro', 'vendas'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preco_sugestoes' and policyname = 'erp_update') then
    create policy "erp_update" on public.preco_sugestoes for update to authenticated
      using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;

-- Margem desejada do produto: a dele, a da categoria (ou da categoria-mãe "A > B" → "A"), a do tipo, a padrão
create or replace function public.margem_alvo_produto(p public.produtos)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    p.margem_desejada,
    (select c.margem_desejada from public.categorias_produto c where c.nome = p.categoria),
    (select c.margem_desejada from public.categorias_produto c where c.nome = split_part(p.categoria, ' > ', 1)),
    (select nullif(cfg.precificacao -> 'margens' ->> p.tipo, '')::numeric from public.configuracoes cfg where cfg.id = 1),
    (select nullif(cfg.precificacao ->> 'margem_padrao', '')::numeric from public.configuracoes cfg where cfg.id = 1),
    60);
$$;

-- Preço sugerido (null quando não há custo ou a soma de margem + despesas passa de 95%)
create or replace function public.preco_sugerido(p public.produtos)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb; v_desp numeric; v_den numeric; v numeric; v_arred text;
begin
  if coalesce(p.preco_custo, 0) <= 0 then return null; end if;
  select coalesce(precificacao, '{}'::jsonb) into v_cfg from public.configuracoes where id = 1;
  v_desp := coalesce(nullif(v_cfg ->> 'impostos_pct', '')::numeric, 0) + coalesce(nullif(v_cfg ->> 'taxa_pct', '')::numeric, 0)
          + coalesce(nullif(v_cfg ->> 'comissao_pct', '')::numeric, 0) + coalesce(nullif(v_cfg ->> 'frete_pct', '')::numeric, 0);
  v_den := 1 - (public.margem_alvo_produto(p) + v_desp) / 100;
  if v_den < 0.05 then return null; end if;
  v := p.preco_custo / v_den;
  v_arred := coalesce(v_cfg ->> 'arredondar', 'centavos');
  if v_arred = 'inteiro' then v := ceil(v);
  elsif v_arred = 'final90' then v := ceil(v + 0.10) - 0.10;
  else v := ceil(round(v * 100, 4)) / 100;
  end if;
  return v;
end $$;

-- Cria a sugestão quando o preço atual saiu da faixa (preço zerado, abaixo do sugerido além da tolerância
-- ou, se ligado, acima). A pendente anterior do mesmo produto vira "substituída".
create or replace function public.registrar_sugestao_preco(p public.produtos, p_origem text, p_custo_anterior numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v numeric; v_cfg jsonb; v_tol numeric; v_reduz boolean; v_atual numeric := coalesce(p.preco_venda, 0);
begin
  update public.preco_sugestoes set status = 'substituida', decidido_em = now()
   where produto_id = p.id and status = 'pendente';
  if not p.ativo or p.vendavel is false or coalesce(p.kit, false) then return false; end if;
  v := public.preco_sugerido(p);
  if v is null then return false; end if;
  select coalesce(precificacao, '{}'::jsonb) into v_cfg from public.configuracoes where id = 1;
  v_tol := coalesce(nullif(v_cfg ->> 'tolerancia_pct', '')::numeric, 5);
  v_reduz := coalesce((v_cfg ->> 'sugerir_reducao')::boolean, false);
  if not (v_atual <= 0 or v_atual < v * (1 - v_tol / 100) or (v_reduz and v_atual > v * (1 + v_tol / 100))) then
    return false;
  end if;
  insert into public.preco_sugestoes (produto_id, origem, custo_anterior, custo_novo, preco_atual, preco_sugerido, margem_alvo)
  values (p.id, p_origem, p_custo_anterior, p.preco_custo, v_atual, v, public.margem_alvo_produto(p));
  return true;
end $$;

-- Custo mudou (NF de fornecedor, compra, produção ou à mão): confere o preço e avisa o financeiro
create or replace function public.trg_produto_custo_preco()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.preco_custo is not distinct from old.preco_custo then return null; end if;
  begin
    if public.registrar_sugestao_preco(new, 'custo', old.preco_custo)
       and not exists (select 1 from public.notificacoes where titulo = 'Preços para revisar' and created_at > now() - interval '10 minutes') then
      perform public.notificar('outro', 'Preços para revisar',
        'O custo de produtos mudou e o preço ficou abaixo da margem desejada. Confira o preço sugerido e aprove.',
        '/estoque?aba=precos', array['financeiro']);
    end if;
  exception when others then
    -- a sugestão de preço nunca pode travar a entrada da nota, a compra ou a produção
    raise warning 'formação de preço (%): %', new.id, sqlerrm;
  end;
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_produto_custo_preco' and tgrelid = 'public.produtos'::regclass) then
    create trigger trg_produto_custo_preco after update of preco_custo on public.produtos
      for each row execute function public.trg_produto_custo_preco();
  end if;
end $$;

-- Revisão geral: confere todos os produtos à venda com custo (botão "Revisar todos os preços")
create or replace function public.gerar_sugestoes_preco()
returns int language plpgsql security definer set search_path = public as $$
declare r public.produtos; n int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'só o financeiro ou o administrador revisa os preços'; end if;
  for r in select * from public.produtos where ativo and vendavel is not false and not coalesce(kit, false) and preco_custo > 0 loop
    if public.registrar_sugestao_preco(r, 'revisao', null) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Aprovar (com o preço sugerido ou o ajustado) ou recusar. Roda com o usuário logado: a troca do preço
-- passa pelas mesmas regras do cadastro (só financeiro/admin, motivo no histórico).
create or replace function public.decidir_precos(p_ids uuid[], p_aprovar boolean, p_precos numeric[] default null)
returns int language plpgsql security invoker set search_path = public as $$
declare r record; n int := 0; v numeric; k int;
begin
  if not public.tem_papel('financeiro') then raise exception 'só o financeiro ou o administrador aprova preços'; end if;
  for r in select s.* , p.descricao from public.preco_sugestoes s join public.produtos p on p.id = s.produto_id
            where s.id = any(p_ids) and s.status = 'pendente' loop
    if p_aprovar then
      k := array_position(p_ids, r.id);
      v := round(coalesce(case when p_precos is not null then p_precos[k] end, r.preco_sugerido), 2);
      if v is null or v <= 0 then raise exception 'preço inválido para %', r.descricao; end if;
      update public.produtos
         set preco_venda = v,
             motivo_alteracao = case when r.custo_anterior is null
               then format('Formação de preço: custo %s, margem desejada %s%%', public.brl(r.custo_novo), r.margem_alvo::float8)
               else format('Formação de preço: custo %s → %s, margem desejada %s%%', public.brl(r.custo_anterior), public.brl(r.custo_novo), r.margem_alvo::float8) end
       where id = r.produto_id;
      update public.preco_sugestoes set status = 'aprovada', preco_aprovado = v, decidido_por = auth.uid(), decidido_em = now() where id = r.id;
    else
      update public.preco_sugestoes set status = 'recusada', decidido_por = auth.uid(), decidido_em = now() where id = r.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.registrar_sugestao_preco(public.produtos, text, numeric) from public, anon, authenticated;
revoke execute on function public.trg_produto_custo_preco() from public, anon, authenticated;
grant execute on function public.gerar_sugestoes_preco() to authenticated;
grant execute on function public.decidir_precos(uuid[], boolean, numeric[]) to authenticated;
grant execute on function public.preco_sugerido(public.produtos) to authenticated;
grant execute on function public.margem_alvo_produto(public.produtos) to authenticated;
