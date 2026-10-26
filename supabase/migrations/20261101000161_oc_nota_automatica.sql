-- Ordem de compra andando sozinha (decisão da usuária em 26/10):
--  1) A nota do fornecedor que chega pela Receita é ligada sozinha à ordem de compra quando: a nota está autorizada e
--     é de compra (não devolução); há UMA só OC enviada (ou parcial) do mesmo fornecedor (cadastro ou CNPJ), feita até
--     1 dia depois da emissão da nota, ainda sem nota ligada, e com o total igual ao da nota (diferença de até 2%).
--     Mais de uma OC possível: não liga e avisa Compras para escolher.
--  2) ocs_andamento(): em que passo cada OC está (paga, nota emitida, a caminho, chegou), para a lista de Compras.

create or replace function public.oc_ligar_nota_automatica(p_nfe uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare n nfe_recebidas; v_cnpj text; v_oc uuid; v_qtd int;
begin
  select * into n from nfe_recebidas where id = p_nfe;
  if n.id is null or n.excluida_em is not null or n.situacao <> 'autorizada' or coalesce(n.finalidade, 'normal') = 'devolucao'
     or coalesce(n.valor_total, 0) <= 0 then return null; end if;
  if exists (select 1 from nfe_oc_vinculos where nfe_id = p_nfe and ativo) then return null; end if;
  v_cnpj := regexp_replace(coalesce(n.emitente_cnpj, ''), '\D', '', 'g');
  select count(*), min(pc.id::text)::uuid into v_qtd, v_oc
    from pedidos_compra pc left join fornecedores f on f.id = pc.fornecedor_id
   where pc.excluida_em is null and pc.status in ('enviado', 'parcial')
     and (pc.fornecedor_id = n.fornecedor_id or (v_cnpj <> '' and regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = v_cnpj))
     and pc.created_at <= n.data_emissao + interval '1 day'
     and abs(coalesce(pc.valor_total, 0) - n.valor_total) <= n.valor_total * 0.02
     and not exists (select 1 from nfe_oc_vinculos v join nfe_recebidas x on x.id = v.nfe_id and x.situacao <> 'cancelada' and x.excluida_em is null
                      where v.pedido_compra_id = pc.id and v.ativo);
  if v_qtd = 0 then return null; end if;
  if v_qtd > 1 then
    begin
      perform public.notificar('outro', 'Nota de fornecedor para ligar',
        'A NF ' || ltrim(substr(n.chave, 26, 9), '0') || ' de ' || coalesce(n.emitente_nome, 'fornecedor') || ' bate com mais de uma ordem de compra: escolha qual.',
        '/compras', array['compras', 'financeiro']);
    exception when others then null; end;
    return null;
  end if;
  insert into nfe_oc_vinculos (nfe_id, pedido_compra_id, ativo, ligado_nome, ligado_em)
  values (p_nfe, v_oc, true, 'Automático (mesmo fornecedor e valor)', now())
  on conflict (nfe_id, pedido_compra_id) do update set ativo = true, ligado_nome = excluded.ligado_nome, ligado_em = now(), desligado_em = null;
  return v_oc;
end $$;
revoke all on function public.oc_ligar_nota_automatica(uuid) from public, anon, authenticated;

create or replace function public.trg_oc_nota_automatica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.situacao = 'autorizada' and new.excluida_em is null then
    perform public.oc_ligar_nota_automatica(new.id);
  end if;
  return null;
end $$;

drop trigger if exists trg_oc_nota_automatica on public.nfe_recebidas;
create trigger trg_oc_nota_automatica after insert or update of situacao, fornecedor_id, valor_total on public.nfe_recebidas
  for each row execute function public.trg_oc_nota_automatica();

-- Passo de cada ordem de compra em aberto ou recebida há pouco (lista de Compras).
create or replace function public.ocs_andamento()
returns table (pedido_compra_id uuid, paga boolean, nota boolean, a_caminho boolean, chegou boolean)
language sql stable security definer set search_path = public as $$
  select pc.id,
    exists (select 1 from contas_pagar c where c.pedido_compra_id = pc.id and c.status <> 'cancelado')
      and not exists (select 1 from contas_pagar c where c.pedido_compra_id = pc.id and c.status = 'aberto'),
    exists (select 1 from nfe_oc_vinculos v join nfe_recebidas n on n.id = v.nfe_id and n.excluida_em is null and n.situacao <> 'cancelada'
             where v.pedido_compra_id = pc.id and v.ativo),
    exists (select 1 from nfe_oc_vinculos v join nfe_recebidas n on n.id = v.nfe_id and n.excluida_em is null and n.situacao <> 'cancelada'
             where v.pedido_compra_id = pc.id and v.ativo
               and (n.processamento = 'a_caminho' or exists (select 1 from ctes t where t.nfe_recebida_id = n.id or n.chave = any(coalesce(t.nfe_chaves, '{}'))))),
    pc.status = 'recebido' or exists (select 1 from nfe_oc_vinculos v join nfe_recebidas n on n.id = v.nfe_id
             where v.pedido_compra_id = pc.id and v.ativo and n.chegou_em is not null)
  from pedidos_compra pc
  where pc.excluida_em is null and public.tem_papel('financeiro', 'compras', 'tecnico')
    and (pc.status in ('enviado', 'parcial') or pc.created_at > now() - interval '60 days')
$$;
revoke all on function public.ocs_andamento() from public, anon;
grant execute on function public.ocs_andamento() to authenticated;
