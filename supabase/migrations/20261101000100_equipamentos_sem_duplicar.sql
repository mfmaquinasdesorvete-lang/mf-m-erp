-- Pedido aprovado cria as máquinas na ficha do cliente; se a máquina já foi registrada antes e ligada ao pedido
-- (ex.: entregue sem nota e a proposta aberta depois para gerar o nº de série), não cria de novo.
create or replace function public.registrar_equipamentos_pedido()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_cfg public.configuracoes;
  v_item record;
  v_hoje date := current_date;
  v_ja int;
begin
  if new.status = 'aprovado' and old.status = 'orcamento' then
    select * into v_cfg from public.configuracoes where id = 1;
    for v_item in
      select i.*, p.garantia_meses,
             (coalesce(p.descricao, '') || ' ' || coalesce(i.descricao, '')) ~* '(usad[ao]|semi\s*-?\s*nov[ao]|seminov[ao]|recondicionad[ao])' as usada
        from public.pedido_itens i join public.produtos p on p.id = i.produto_id
       where i.pedido_id = new.id and p.tipo = 'maquina'
    loop
      select count(*) into v_ja from public.equipamentos e where e.pedido_id = new.id and e.produto_id = v_item.produto_id;
      -- uma linha por unidade vendida; o nº de série pode vir separado por "/" ou ","
      for n in (v_ja + 1)..greatest(v_item.quantidade::int, 1) loop
        insert into public.equipamentos (cliente_id, produto_id, descricao, numero_serie, pedido_id, data_venda, garantia_ate, proxima_preventiva, usada)
        values (new.cliente_id, v_item.produto_id, v_item.descricao,
                nullif(trim(split_part(regexp_replace(coalesce(v_item.numero_serie, ''), '\s*[,/;]\s*', '|', 'g'), '|', n)), ''),
                new.id, v_hoje,
                v_hoje + make_interval(months => coalesce(v_item.garantia_meses, v_cfg.garantia_meses_padrao)),
                v_hoje + make_interval(months => v_cfg.preventiva_meses),
                v_item.usada);
      end loop;
    end loop;
  end if;
  return new;
end $function$;
