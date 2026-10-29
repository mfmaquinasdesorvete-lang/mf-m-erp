-- Custo do kit sempre pela soma das peças (decisão da usuária, 28/10): quando o custo de uma peça muda (nota do
-- fornecedor, compra, ajuste) ou uma peça entra, sai ou muda de quantidade no kit, o custo do kit é refeito sozinho.
-- Kit dentro de kit: a mudança sobe pelo próprio gatilho (o kit de dentro muda e avisa os kits que o usam).
create or replace function public.custo_kit(p_kit uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(c.quantidade * coalesce(p.preco_custo, 0)), 0), 2)
    from public.kit_composicao(p_kit, null) c join public.produtos p on p.id = c.componente_id
$$;

create or replace function public.recalcular_custo_kit(p_kit uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if not exists (select 1 from public.kit_componentes where kit_id = p_kit and padrao) then return; end if;
  v := public.custo_kit(p_kit);
  update public.produtos set preco_custo = v, motivo_alteracao = 'Custo do kit pela soma das peças'
   where id = p_kit and preco_custo is distinct from v;
end $$;

create or replace function public.trg_custo_kit_peca() returns trigger
language plpgsql security definer set search_path = public as $$
declare k uuid;
begin
  for k in select distinct kit_id from public.kit_componentes where componente_id = new.id loop
    perform public.recalcular_custo_kit(k);
  end loop;
  return null;
end $$;
drop trigger if exists zz_custo_kit_peca on public.produtos;
create trigger zz_custo_kit_peca after update of preco_custo on public.produtos
  for each row when (new.preco_custo is distinct from old.preco_custo) execute function public.trg_custo_kit_peca();

create or replace function public.trg_custo_kit_composicao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_custo_kit(coalesce(new.kit_id, old.kit_id));
  if tg_op = 'UPDATE' and new.kit_id is distinct from old.kit_id then perform public.recalcular_custo_kit(old.kit_id); end if;
  return null;
end $$;
drop trigger if exists zz_custo_kit_composicao on public.kit_componentes;
create trigger zz_custo_kit_composicao after insert or update or delete on public.kit_componentes
  for each row execute function public.trg_custo_kit_composicao();

-- só os gatilhos chamam (eles rodam como dono): ninguém chama direto pela API
revoke execute on function public.recalcular_custo_kit(uuid) from public, anon, authenticated;
revoke execute on function public.custo_kit(uuid) from public, anon, authenticated;
