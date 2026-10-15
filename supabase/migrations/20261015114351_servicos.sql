-- =====================================================================
-- Serviços (carga de gás, limpeza e lavagem, troca de compressor, reparo em mecânica…): tipo próprio de cadastro
--  * não controlam estoque: o movimento de estoque de um serviço é ignorado, e a aprovação da venda e a conclusão
--    da OP não cobram estoque dele (o serviço pode estar na ficha técnica, ex.: carga de gás, só pelo custo);
--  * sem estoque mínimo, fora do catálogo e da reposição; NCM 00000000 (serviço) quando vazio;
--  * "Carga de Gás (serviço)" passa de componente para serviço, e entram os serviços que faltavam.
-- O tipo ganha mais um valor (a regra de tipos é refeita com o novo valor; nada sai).
-- =====================================================================
alter table public.produtos drop constraint if exists produtos_tipo_check;
alter table public.produtos add constraint produtos_tipo_check check (tipo in ('maquina', 'peca', 'acessorio', 'insumo', 'servico'));

create or replace function public.trg_produto_servico()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo = 'servico' then
    new.estoque_minimo := 0;
    new.estoque_maximo := 0;
    new.no_catalogo := false;
    new.kit := false;
    new.gtin_isento := true;
    new.ncm := coalesce(nullif(btrim(new.ncm), ''), '00000000');
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_produto_servico' and tgrelid = 'public.produtos'::regclass) then
    create trigger trg_produto_servico before insert or update of tipo, estoque_minimo, estoque_maximo, no_catalogo on public.produtos
      for each row execute function public.trg_produto_servico();
  end if;
end $$;

-- serviço não entra no estoque (o primeiro gatilho da fila descarta o movimento)
create or replace function public.trg_servico_sem_estoque()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from produtos where id = new.produto_id and tipo = 'servico') then
    return null;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'aa_servico_sem_estoque' and tgrelid = 'public.estoque_movimentos'::regclass) then
    create trigger aa_servico_sem_estoque before insert on public.estoque_movimentos
      for each row execute function public.trg_servico_sem_estoque();
  end if;
end $$;

-- aprovação da venda e conclusão da OP: não cobram estoque de serviço (mesma função, uma condição a mais)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.aprovar_pedido_sistema'::regproc);
  if position('where not pr.sob_encomenda and coalesce(eu.quantidade, 0) < n.qtd' in d) > 0 then
    execute replace(d, 'where not pr.sob_encomenda and coalesce(eu.quantidade, 0) < n.qtd',
                       'where not pr.sob_encomenda and pr.tipo <> ''servico'' and coalesce(eu.quantidade, 0) < n.qtd');
  end if;
  d := pg_get_functiondef('public.concluir_producao'::regproc);
  if position('where public.estoque_na_unidade(p.id, v_op.unidade_id) < c.quantidade' in d) > 0 then
    execute replace(d, 'where public.estoque_na_unidade(p.id, v_op.unidade_id) < c.quantidade',
                       'where p.tipo <> ''servico'' and public.estoque_na_unidade(p.id, v_op.unidade_id) < c.quantidade');
  end if;
end $$;

-- cadastro: a carga de gás vira serviço e entram os que faltavam (preço a preencher)
update public.produtos set tipo = 'servico', motivo_alteracao = 'Serviço: não controla estoque'
 where tipo <> 'servico' and lower(descricao) = lower('Carga de Gás (serviço)');
insert into public.produtos (descricao, tipo, unidade, preco_custo, preco_venda, ncm, origem, ativo, vendavel)
select x, 'servico', 'UN', 0, 0, '00000000', 0, true, true
  from unnest(array['Limpeza e lavagem (serviço)', 'Troca de compressor (serviço)', 'Reparo em mecânica (serviço)']) x
 where not exists (select 1 from public.produtos p where lower(p.descricao) = lower(x));
