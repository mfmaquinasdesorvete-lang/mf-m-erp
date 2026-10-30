-- Data da venda (pedido de 30/10, pelo CNF): pedido lançado depois com venda antiga entrava na semana do lançamento.
-- As telas de vendas contam pelo dia da aprovação (aprovado_em); o administrador acerta esse dia no "Editar" do pedido
-- aprovado (p_dados.data_venda, AAAA-MM-DD), com o motivo na auditoria. Não mexe em comissão, parcela nem nota.

create or replace function public.editar_pedido_aprovado(p_pedido uuid, p_dados jsonb, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend uuid; v_pct numeric; v_origem text; v_dia date; v_aprov timestamptz;
begin
  perform public.exigir_papel('vendas');
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'informe o motivo da alteração (mínimo 5 letras)'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then raise exception 'pedido cancelado não pode ser alterado'; end if;
  if v_ped.status = 'orcamento' then raise exception 'orçamento: altere e salve normalmente'; end if;

  v_vend := case when p_dados ? 'vendedor_id' then nullif(p_dados->>'vendedor_id', '')::uuid else v_ped.vendedor_id end;
  v_pct := case when p_dados ? 'comissao_percentual' then nullif(p_dados->>'comissao_percentual', '')::numeric else v_ped.comissao_percentual end;
  v_origem := coalesce(nullif(p_dados->>'origem', ''), v_ped.origem);
  if v_pct is not null and (v_pct < 0 or v_pct > 100) then raise exception 'comissão deve ser de 0 a 100%%'; end if;
  if v_vend is not null and not exists (select 1 from vendedores where id = v_vend) then raise exception 'vendedor não encontrado'; end if;
  if v_vend is distinct from v_ped.vendedor_id and v_vend is null then v_pct := null; end if;

  -- dia da venda: só o administrador, nunca no futuro; guarda meio-dia de Brasília para não virar o dia no fuso
  v_aprov := v_ped.aprovado_em;
  v_dia := nullif(p_dados->>'data_venda', '')::date;
  if v_dia is not null and v_dia is distinct from (v_ped.aprovado_em at time zone 'America/Sao_Paulo')::date then
    if not public.is_erp_admin() then raise exception 'só o administrador muda a data da venda'; end if;
    if v_dia > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'a data da venda não pode ser no futuro'; end if;
    if v_dia < date '2015-01-01' then raise exception 'confira a data da venda'; end if;
    v_aprov := (v_dia + time '12:00') at time zone 'America/Sao_Paulo';
  end if;

  perform set_config('erp.acao_usuario', 'on', true);
  update pedidos set
    vendedor_id = v_vend,
    vendedor = case when v_vend is distinct from v_ped.vendedor_id then (select nome from vendedores where id = v_vend) else vendedor end,
    comissao_percentual = v_pct,
    origem = v_origem,
    observacoes = case when p_dados ? 'observacoes' then nullif(btrim(p_dados->>'observacoes'), '') else observacoes end,
    aprovado_em = v_aprov,
    motivo_alteracao = btrim(p_motivo)
  where id = p_pedido;

  if v_vend is distinct from v_ped.vendedor_id or v_pct is distinct from v_ped.comissao_percentual then
    perform public.recalcular_comissoes_pedido(p_pedido);
  end if;
end $$;
