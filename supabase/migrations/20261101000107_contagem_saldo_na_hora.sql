-- Contagem de estoque: o ajuste respeita o que mexeu depois da contagem.
-- Antes: contou 10 de manhã, vendeu 2 à tarde, concluiu no outro dia → o saldo voltava para 10.
-- Agora: cada item guarda o saldo do sistema na hora em que foi contado (saldo_contado); ao concluir,
-- o ajuste é contado − saldo_contado, e o que entrou ou saiu depois continua valendo (fica 8).

alter table public.contagem_itens add column if not exists saldo_contado numeric(12,3);
alter table public.contagem_itens add column if not exists contado_em timestamptz;

create or replace function public.trg_contagem_item_fixo()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  -- só a quantidade contada e a justificativa mudam pela tela
  new.contagem_id := old.contagem_id; new.produto_id := old.produto_id; new.saldo_sistema := old.saldo_sistema;
  new.justificativa := nullif(btrim(coalesce(new.justificativa, '')), '');
  -- o saldo da hora da contagem é do banco: muda só quando a quantidade contada muda
  if new.contado is distinct from old.contado then
    if new.contado is null then
      new.saldo_contado := null; new.contado_em := null;
    else
      new.saldo_contado := public.estoque_na_unidade(new.produto_id,
        (select c.unidade_id from public.contagens_estoque c where c.id = new.contagem_id));
      new.contado_em := now();
    end if;
  else
    new.saldo_contado := old.saldo_contado; new.contado_em := old.contado_em;
  end if;
  return new;
end $$;

create or replace function public.concluir_contagem(p_contagem uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c record; i record; v_dif numeric; v_ajustes int := 0; v_contados int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para concluir a contagem'; end if;
  select * into c from contagens_estoque where id = p_contagem for update;
  if c.id is null or c.status <> 'aberta' then raise exception 'contagem não está aberta'; end if;
  for i in select ci.*, p.descricao from contagem_itens ci join produtos p on p.id = ci.produto_id
            where ci.contagem_id = p_contagem and ci.contado is not null loop
    -- dupla contagem: só aceita quando as duas contagens são iguais
    if c.dupla and (i.contado2 is null or i.contado2 <> i.contado) then
      raise exception 'reconte "%": a primeira e a segunda contagem precisam bater', i.descricao;
    end if;
    v_contados := v_contados + 1;
    -- diferença contra o saldo da hora da contagem; o que mexeu depois continua no saldo
    -- (item contado antes desta mudança, sem saldo_contado: contra o saldo de agora, como era)
    v_dif := i.contado - coalesce(i.saldo_contado, public.estoque_na_unidade(i.produto_id, c.unidade_id));
    if v_dif <> 0 then
      if i.justificativa is null then raise exception 'justifique a divergência de "%" antes de concluir', i.descricao; end if;
      insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id, documento)
      values (i.produto_id, 'ajuste', v_dif, 'Contagem nº ' || c.numero || ': ' || i.justificativa, 'contagem', p_contagem, c.unidade_id, 'Contagem nº ' || c.numero);
      v_ajustes := v_ajustes + 1;
    end if;
  end loop;
  if v_contados = 0 then raise exception 'nenhum item foi contado'; end if;
  update contagens_estoque set status = 'concluida', concluida_por = auth.uid(), concluida_em = now(), ajustes = v_ajustes, contados = v_contados,
         concluida_nome = (select nome from usuarios_erp where user_id = auth.uid())
   where id = p_contagem;
  return jsonb_build_object('contados', v_contados, 'ajustes', v_ajustes);
end $$;
