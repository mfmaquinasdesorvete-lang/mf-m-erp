-- Componente de produção (tipo insumo, que não se vende) não tem preço de venda próprio: venda = custo, sempre
-- (pedido de 19/10). O que é insumo mas também se vende (vendavel) continua com preço próprio.
create or replace function public.trg_produto_componente_venda()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo = 'insumo' and not coalesce(new.vendavel, false) then
    new.preco_venda := coalesce(new.preco_custo, 0);
  end if;
  return new;
end $$;

-- depois de "aa_produto_compras" (o perfil Compras cadastra sem preço de venda; a regra preenche depois)
create or replace trigger ab_produto_componente_venda before insert or update on public.produtos
  for each row execute function public.trg_produto_componente_venda();

select set_config('erp.acao_usuario', 'on', true);
update produtos set preco_venda = coalesce(preco_custo, 0), motivo_alteracao = 'Componente de produção: venda = custo (pedido 19/10)'
 where tipo = 'insumo' and not coalesce(vendavel, false) and preco_venda is distinct from coalesce(preco_custo, 0);

update preco_sugestoes s set status = 'substituida', decidido_em = now()
  from produtos p
 where p.id = s.produto_id and s.status = 'pendente' and p.tipo = 'insumo' and not coalesce(p.vendavel, false);
