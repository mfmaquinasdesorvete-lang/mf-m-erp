-- Toda compra de peças com ordem de compra (pedido da usuária, 23/10): as notas de peças que entraram sem OC ganham
-- a OC delas (data 1 dia antes da nota, itens e valores da nota, já recebida) ou ficam ligadas à OC do Tiny que já
-- existia. OC do Tiny com valor diferente da nota ganha o marcador "Comprado por valor divergente" e a tela da OC
-- mostra o preço da ordem × o preço comprado. Nada disso mexe no estoque nem nas contas a pagar.
-- Somente acréscimos.

-- item da OC sem produto do cadastro: vale para as OC criadas pela nota (a descrição é a da nota); dá para ligar o
-- produto depois. A OC feita na tela continua escolhendo o produto.
alter table public.pedido_compra_itens alter column produto_id drop not null;
alter table public.pedido_compra_itens add column if not exists codigo_fornecedor text;

insert into public.marcadores (nome, cor, icone)
select 'Comprado por valor divergente', 'amber', 'triangle-alert'
 where not exists (select 1 from public.marcadores where lower(nome) = lower('Comprado por valor divergente'));

-- OC de uma nota de compra que não tinha OC (núcleo, sem checagem de usuário: só o banco chama)
create or replace function public.oc_retroativa_da_nota(p_nfe uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare n nfe_recebidas; v_oc uuid; v_dif numeric;
begin
  select * into n from nfe_recebidas where id = p_nfe and excluida_em is null;
  if not found or n.fornecedor_id is null then return null; end if;
  if exists (select 1 from nfe_oc_vinculos where nfe_id = p_nfe and ativo) then return null; end if;
  insert into pedidos_compra (fornecedor_id, status, data, enviado_em, recebido_em, unidade_id, observacoes)
  values (n.fornecedor_id, 'recebido', n.data_emissao::date - 1, (n.data_emissao::date - 1)::timestamptz, n.data_emissao, n.unidade_id,
          'OC criada pela NF ' || coalesce(nullif(ltrim(substr(n.chave, 26, 9), '0'), ''), '?') || ' de ' || to_char(n.data_emissao, 'DD/MM/YYYY')
          || ': compra feita sem ordem de compra (pedido de 23/10).')
  returning id into v_oc;
  insert into pedido_compra_itens (pedido_compra_id, produto_id, descricao, quantidade, custo_unitario, quantidade_recebida, codigo_fornecedor)
  select v_oc, x.prod, coalesce(nullif(btrim(i.descricao), ''), 'Item ' || i.numero),
         round(i.quantidade * x.fator, 3), round(coalesce(i.valor_unitario, 0) / x.fator, 4), round(i.quantidade * x.fator, 3), nullif(btrim(i.codigo), '')
    from nfe_recebida_itens i
    left join nfe_custos_itens ci on ci.nfe_id = i.nfe_id and ci.numero = i.numero
    left join produto_fornecedor pf on pf.fornecedor_id = n.fornecedor_id and pf.codigo_fornecedor = btrim(i.codigo)
    left join lateral (select p.id from produtos p where i.ean is not null and p.codigo_barras = i.ean and p.ativo and p.unificado_em is null limit 1) pe on true
    cross join lateral (select coalesce(ci.produto_id, pf.produto_id, pe.id) as prod,
                               greatest(coalesce(case when coalesce(ci.produto_id, pf.produto_id) is not null then coalesce(ci.fator, pf.fator_conversao) end, 1), 0.0001) as fator) x
   where i.nfe_id = p_nfe and i.quantidade > 0
   order by i.numero;
  -- impostos, frete e descontos da nota: o total da OC fica igual ao da nota
  v_dif := round(coalesce(n.valor_total, 0) - public.pedido_compra_total(v_oc, 0, 0, 0), 2);
  if v_dif <> 0 then
    update pedidos_compra set outras_despesas = greatest(v_dif, 0), desconto = greatest(-v_dif, 0) where id = v_oc;
  end if;
  insert into nfe_oc_vinculos (nfe_id, pedido_compra_id, ligado_por, ligado_nome) values (p_nfe, v_oc, null, 'OC criada pela nota (23/10)');
  return v_oc;
end $$;
revoke execute on function public.oc_retroativa_da_nota(uuid) from public, anon, authenticated;
