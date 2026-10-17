-- Correções sugeridas no cadastro de produtos (Produtos e estoque → Qualidade do cadastro).
-- Cada sugestão diz o campo, o valor proposto, de onde veio (nota de fornecedor, pedido de compra, fornecimento,
-- ficha técnica, regra ou análise) e a confiança. Nada muda no produto sem alguém aplicar (um a um ou em lote);
-- a ignorada não volta. Todo dia o ERP procura de novo (agendador) e as que perderam o sentido ficam "vencidas".
-- NCM é planejamento: o que não vem da nota do próprio fornecedor fica marcado para confirmar com o contador.

create table if not exists public.produto_sugestoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id),
  campo text not null check (campo in ('ncm', 'preco_custo', 'categoria', 'marca', 'codigo_barras', 'tipo', 'descricao')),
  -- sem valor: só um aviso para conferir (ex.: peça com o NCM da máquina)
  valor text,
  valor_anterior text,
  fonte text not null check (fonte in ('nota_fornecedor', 'pedido_compra', 'fornecimento', 'ficha_tecnica', 'produto_parecido', 'regra', 'analise')),
  confianca text not null check (confianca in ('alta', 'media', 'baixa', 'conferir')),
  detalhe text,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aplicada', 'ignorada', 'vencida')),
  motivo text,
  criado_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_nome text,
  decidido_em timestamptz
);
create unique index if not exists produto_sugestoes_uma on public.produto_sugestoes (produto_id, campo, coalesce(valor, ''));
create index if not exists produto_sugestoes_pendentes on public.produto_sugestoes (situacao) where situacao = 'pendente';

alter table public.produto_sugestoes enable row level security;
create policy sugestoes_select on public.produto_sugestoes for select using (public.is_erp_user());
-- gravação só pelas funções abaixo
revoke insert, update on public.produto_sugestoes from anon, authenticated;

create trigger trg_auditoria after insert or update on public.produto_sugestoes
  for each row execute function public.trg_auditoria();

/** Quem corrige o cadastro: financeiro (e administrador) ou compras, como na edição do produto. */
create or replace function public.pode_corrigir_produtos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_papel('financeiro') or public.tem_papel('compras');
$$;

/** Procura correções pelas regras do ERP. Sem login (agendador) roda direto; com login, só quem corrige. */
create or replace function public.gerar_sugestoes_produtos()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_novas int := 0;
  v_vencidas int := 0;
  v_ncm_maquina text[];
begin
  if auth.uid() is not null and not public.pode_corrigir_produtos() then raise exception 'sem permissão'; end if;

  -- os NCM das máquinas (para achar peça com o NCM da máquina)
  v_ncm_maquina := array(select distinct ncm from produtos where tipo = 'maquina' and ativo and ncm ~ '^\d{8}$');

  -- as que perderam o sentido: o campo já foi preenchido por outro caminho
  update produto_sugestoes s set situacao = 'vencida', decidido_em = now(), motivo = 'o cadastro já foi corrigido'
    from produtos p
   where s.produto_id = p.id and s.situacao = 'pendente'
     and ((s.campo = 'ncm' and (p.ncm = s.valor or (nullif(p.ncm, '') is not null and not (p.ncm = any (v_ncm_maquina)))))
       or (s.campo = 'preco_custo' and coalesce(p.preco_custo, 0) > 0)
       or (s.campo = 'categoria' and nullif(p.categoria, '') is not null)
       or (s.campo = 'marca' and nullif(p.marca, '') is not null)
       or (s.campo = 'codigo_barras' and (nullif(p.codigo_barras, '') is not null or p.gtin_isento))
       or (s.campo = 'tipo' and p.tipo = s.valor)
       or not p.ativo or p.unificado_em is not null);
  get diagnostics v_vencidas = row_count;

  with ativos as (
    select * from produtos where ativo and unificado_em is null
  ), codigos as (
    -- código do fabricante ou SKU: vale em qualquer nota, se for um código de verdade (5+ caracteres com letra ou 6+ números)
    select a.id, upper(regexp_replace(c, '[^A-Za-z0-9]', '', 'g')) as cod, null::text as cnpj
      from ativos a cross join lateral unnest(array[a.codigo_fabricante, a.sku]) c
     where regexp_replace(coalesce(c, ''), '[^A-Za-z0-9]', '', 'g') ~ '^(?=.*[A-Za-z])[A-Za-z0-9]{5,}$|^[0-9]{6,}$'
    union
    -- código do fornecedor: só na nota desse fornecedor
    select pf.produto_id, upper(regexp_replace(pf.codigo_fornecedor, '[^A-Za-z0-9]', '', 'g')), regexp_replace(f.cnpj, '\D', '', 'g')
      from produto_fornecedor pf join fornecedores f on f.id = pf.fornecedor_id
     where length(regexp_replace(coalesce(pf.codigo_fornecedor, ''), '[^A-Za-z0-9]', '', 'g')) >= 3 and nullif(f.cnpj, '') is not null
  ), itens_nf as (
    select i.*, n.emitente_nome, n.data_emissao, regexp_replace(coalesce(n.emitente_cnpj, ''), '\D', '', 'g') as cnpj,
           upper(regexp_replace(coalesce(i.codigo, ''), '[^A-Za-z0-9]', '', 'g')) as cod
      from nfe_recebida_itens i join nfe_recebidas n on n.id = i.nfe_id
     where n.excluida_em is null
  ), pela_nota as (
    -- o mesmo item numa nota de fornecedor: pelo código de barras ou pelo código (do fornecedor, do fabricante ou SKU); vale a nota mais nova
    select distinct on (x.id) x.id, x.ncm, x.ean, x.descricao, x.emitente_nome, x.data_emissao
      from (select a.id, i.ncm, i.ean, i.descricao, i.emitente_nome, i.data_emissao
              from ativos a join itens_nf i on a.codigo_barras ~ '^\d{8,14}$' and i.ean = a.codigo_barras
            union all
            select c.id, i.ncm, i.ean, i.descricao, i.emitente_nome, i.data_emissao
              from codigos c join itens_nf i on i.cod = c.cod and (c.cnpj is null or c.cnpj = i.cnpj)) x
     order by x.id, x.data_emissao desc nulls last
  ), novas as (
    -- NCM pela nota do fornecedor
    select p.id as produto_id, 'ncm' as campo, regexp_replace(n.ncm, '\D', '', 'g') as valor, 'nota_fornecedor' as fonte, 'alta' as confianca,
           'Na nota de ' || coalesce(n.emitente_nome, 'fornecedor') || coalesce(' de ' || to_char(n.data_emissao, 'DD/MM/YYYY'), '') || ': ' || coalesce(n.descricao, '') as detalhe
      from ativos p join pela_nota n on n.id = p.id
     where nullif(p.ncm, '') is null and regexp_replace(coalesce(n.ncm, ''), '\D', '', 'g') ~ '^\d{8}$'
    union all
    -- código de barras pela nota do fornecedor
    select p.id, 'codigo_barras', n.ean, 'nota_fornecedor', 'alta', 'Na nota de ' || coalesce(n.emitente_nome, 'fornecedor') || ': ' || coalesce(n.descricao, '')
      from ativos p join pela_nota n on n.id = p.id
     where nullif(p.codigo_barras, '') is null and not coalesce(p.gtin_isento, false) and n.ean ~ '^\d{8}$|^\d{12,14}$'
    union all
    -- custo pela última ordem de compra
    select * from (
      select distinct on (p.id) p.id, 'preco_custo', round(i.custo_unitario, 4)::text, 'pedido_compra', 'alta',
             'Última ordem de compra' || coalesce(' (nº ' || pc.numero::text || ')', '') || ' em ' || to_char(pc.created_at, 'DD/MM/YYYY')
        from ativos p join pedido_compra_itens i on i.produto_id = p.id join pedidos_compra pc on pc.id = i.pedido_compra_id and pc.excluida_em is null
       where coalesce(p.preco_custo, 0) = 0 and p.tipo <> 'servico' and i.custo_unitario > 0
       order by p.id, pc.created_at desc) oc
    union all
    -- custo pelo preço do fornecedor cadastrado (o preferido primeiro)
    select * from (
      select distinct on (p.id) p.id, 'preco_custo', round(f.preco, 4)::text, 'fornecimento', 'media',
             'Preço do fornecedor cadastrado no produto' || coalesce(' em ' || to_char(coalesce(f.preco_em, f.updated_at), 'DD/MM/YYYY'), '')
        from ativos p join fornecimentos f on f.produto_id = p.id
       where coalesce(p.preco_custo, 0) = 0 and p.tipo <> 'servico' and f.ativo and f.preco > 0
         and not exists (select 1 from pedido_compra_itens i where i.produto_id = p.id and i.custo_unitario > 0)
       order by p.id, f.preferido desc, coalesce(f.preco_em, f.updated_at) desc nulls last) fo
    union all
    -- custo pela ficha técnica, quando todas as peças têm custo
    select p.id, 'preco_custo', round(sum(pc.quantidade * c.preco_custo), 2)::text, 'ficha_tecnica', 'media',
           'Soma das ' || count(*) || ' peças da ficha técnica'
      from ativos p join produto_componentes pc on pc.produto_id = p.id join produtos c on c.id = pc.componente_id
     where coalesce(p.preco_custo, 0) = 0 and p.tipo <> 'servico'
     group by p.id having bool_and(coalesce(c.preco_custo, 0) > 0)
    union all
    -- marca que já está no nome do produto
    select p.id, 'marca', m.marca, 'regra', 'alta', 'A marca está no nome: ' || p.descricao
      from ativos p cross join lateral (
        select x.marca from (values ('WEG'), ('Danfoss'), ('Elgin'), ('Embraco'), ('Tecumseh'), ('ABB'), ('IBR'), ('Vonder'), ('Dutoplast'),
                                    ('Sibratec'), ('Citex'), ('Schneider'), ('Siemens'), ('Coel'), ('Full Gauge'), ('Dixell'), ('Carel'),
                                    ('Intelbras'), ('Steck'), ('Metaltex'), ('Tramontina'), ('Jeneca'), ('Gree'), ('Bitzer'), ('Copeland')) x(marca)
         where p.descricao ~* ('(^|[^[:alnum:]])' || x.marca || '([^[:alnum:]]|$)') limit 1) m
     where nullif(p.marca, '') is null
    union all
    -- serviço cadastrado como peça (mão de obra, limpeza, troca, usinagem…)
    select p.id, 'tipo', 'servico', 'regra', 'media', 'Pelo nome é um serviço: sem estoque e sem NCM, entra na OS como mão de obra'
      from ativos p
     where p.tipo in ('peca', 'insumo')
       and public.sem_acento(p.descricao) ~ '^(mao de obra|higieniza|limpeza|limpaza|troca de|usinag|reparo|instalac|visita|manutenc)'
    union all
    -- peça com o NCM da própria máquina
    select p.id, 'ncm', null, 'regra', 'conferir',
           'Está com o NCM das máquinas (' || p.ncm || '). Peça vendida avulsa costuma ter o NCM dela (relé, motor, vedação de borracha…) ou o de partes (8418.99.00): confirmar com o contador.'
      from ativos p
     where p.tipo <> 'maquina' and p.ncm = any (v_ncm_maquina)
  )
  insert into produto_sugestoes (produto_id, campo, valor, fonte, confianca, detalhe)
  select produto_id, campo, valor, fonte, confianca, left(detalhe, 400) from novas
  on conflict do nothing;
  get diagnostics v_novas = row_count;

  return jsonb_build_object('novas', v_novas, 'vencidas', v_vencidas,
    'pendentes', (select count(*) from produto_sugestoes where situacao = 'pendente'));
end $$;

/** Aplica as sugestões escolhidas (as sem valor só se ignoram). Devolve quantas mudaram cada campo. */
create or replace function public.aplicar_sugestoes_produtos(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_nome text;
  v_rotulo text;
  v_aplicadas int := 0;
  v_puladas int := 0;
  v_antes text;
begin
  if not public.pode_corrigir_produtos() then raise exception 'sem permissão'; end if;
  select nome into v_nome from usuarios_erp where user_id = auth.uid();
  for s in select * from produto_sugestoes where id = any (p_ids) and situacao = 'pendente' and valor is not null for update loop
    v_rotulo := 'Correção sugerida (' || case s.fonte when 'nota_fornecedor' then 'nota do fornecedor' when 'pedido_compra' then 'ordem de compra'
      when 'fornecimento' then 'preço do fornecedor' when 'ficha_tecnica' then 'ficha técnica' when 'produto_parecido' then 'produto parecido'
      when 'analise' then 'análise do cadastro' else 'regra do ERP' end || ')';
    -- um produto que mudou depois da sugestão não é sobrescrito
    select case s.campo when 'ncm' then ncm when 'preco_custo' then preco_custo::text when 'categoria' then categoria when 'marca' then marca
                        when 'codigo_barras' then codigo_barras when 'tipo' then tipo else descricao end
      into v_antes from produtos where id = s.produto_id;
    if (s.campo = 'preco_custo' and coalesce(v_antes::numeric, 0) > 0)
       or (s.campo in ('categoria', 'marca', 'codigo_barras') and nullif(v_antes, '') is not null) then
      update produto_sugestoes set situacao = 'vencida', motivo = 'o cadastro já tinha valor', decidido_por = auth.uid(), decidido_nome = v_nome, decidido_em = now() where id = s.id;
      v_puladas := v_puladas + 1;
      continue;
    end if;
    if s.campo = 'ncm' then update produtos set ncm = s.valor, motivo_alteracao = v_rotulo where id = s.produto_id;
    elsif s.campo = 'preco_custo' then update produtos set preco_custo = s.valor::numeric, motivo_alteracao = v_rotulo where id = s.produto_id;
    elsif s.campo = 'categoria' then update produtos set categoria = s.valor, motivo_alteracao = v_rotulo where id = s.produto_id;
    elsif s.campo = 'marca' then update produtos set marca = s.valor, motivo_alteracao = v_rotulo where id = s.produto_id;
    elsif s.campo = 'codigo_barras' then update produtos set codigo_barras = s.valor, motivo_alteracao = v_rotulo where id = s.produto_id;
    elsif s.campo = 'tipo' then update produtos set tipo = s.valor, motivo_alteracao = v_rotulo where id = s.produto_id;
    elsif s.campo = 'descricao' then update produtos set descricao = s.valor, motivo_alteracao = v_rotulo where id = s.produto_id;
    end if;
    update produto_sugestoes set situacao = 'aplicada', valor_anterior = v_antes, decidido_por = auth.uid(), decidido_nome = v_nome, decidido_em = now()
     where id = s.id;
    -- as outras sugestões do mesmo campo deste produto perdem o sentido
    update produto_sugestoes set situacao = 'vencida', motivo = 'outra sugestão foi aplicada', decidido_em = now()
     where produto_id = s.produto_id and campo = s.campo and situacao = 'pendente' and id <> s.id;
    v_aplicadas := v_aplicadas + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_aplicadas, 'puladas', v_puladas);
end $$;

/** Ignora as sugestões escolhidas (não voltam na próxima procura). */
create or replace function public.ignorar_sugestoes_produtos(p_ids uuid[], p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.pode_corrigir_produtos() then raise exception 'sem permissão'; end if;
  update produto_sugestoes set situacao = 'ignorada', motivo = nullif(btrim(coalesce(p_motivo, '')), ''), decidido_por = auth.uid(),
         decidido_nome = (select nome from usuarios_erp where user_id = auth.uid()), decidido_em = now()
   where id = any (p_ids) and situacao = 'pendente';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.pode_corrigir_produtos() from public, anon;
revoke execute on function public.gerar_sugestoes_produtos() from public, anon;
revoke execute on function public.aplicar_sugestoes_produtos(uuid[]) from public, anon;
revoke execute on function public.ignorar_sugestoes_produtos(uuid[], text) from public, anon;
grant execute on function public.pode_corrigir_produtos() to authenticated;
grant execute on function public.gerar_sugestoes_produtos() to authenticated;
grant execute on function public.aplicar_sugestoes_produtos(uuid[]) to authenticated;
grant execute on function public.ignorar_sugestoes_produtos(uuid[], text) to authenticated;

-- todo dia de manhã o ERP procura correções novas (notas e compras do dia anterior)
select cron.schedule('erp-produtos-sugestoes', '41 9 * * *', $c$ select public.gerar_sugestoes_produtos() $c$);
