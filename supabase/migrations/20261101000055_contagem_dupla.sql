-- Contagem de estoque à prova de erro (Poka-Yoke) e acuracidade:
--  * dupla contagem: duas pessoas contam sem ver a outra; o saldo só é ajustado quando a 1ª e a 2ª batem
--  * a contagem concluída guarda quantos itens foram contados e quantos já estavam certos (acuracidade)

alter table public.contagens_estoque add column if not exists dupla boolean not null default false;
alter table public.contagens_estoque add column if not exists contados integer;
alter table public.contagem_itens add column if not exists contado2 numeric;

-- as já concluídas: contados = itens com contagem
update public.contagens_estoque c set contados = (select count(*) from public.contagem_itens i where i.contagem_id = c.id and i.contado is not null)
 where c.status = 'concluida' and c.contados is null;

-- nome novo (abrir_contagem_v2) para não ficar ambíguo com a abrir_contagem de 3 parâmetros, que continua existindo
create or replace function public.abrir_contagem_v2(p_unidade uuid, p_produtos uuid[], p_escopo text default null, p_dupla boolean default false)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para contar estoque'; end if;
  if not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade'; end if;
  if coalesce(cardinality(p_produtos), 0) = 0 then raise exception 'escolha os produtos a contar'; end if;
  if cardinality(p_produtos) > 2000 then raise exception 'conte no máximo 2.000 produtos por vez'; end if;
  insert into contagens_estoque (unidade_id, escopo, criada_nome, dupla)
  values (p_unidade, nullif(btrim(coalesce(p_escopo, '')), ''), (select nome from usuarios_erp where user_id = auth.uid()), coalesce(p_dupla, false))
  returning id into v_id;
  insert into contagem_itens (contagem_id, produto_id, saldo_sistema)
  select v_id, p.id, public.estoque_na_unidade(p.id, p_unidade)
    from produtos p where p.id = any (p_produtos) and not p.kit;
  return v_id;
end $$;
grant execute on function public.abrir_contagem_v2(uuid, uuid[], text, boolean) to authenticated;

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
    v_dif := i.contado - public.estoque_na_unidade(i.produto_id, c.unidade_id);
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
