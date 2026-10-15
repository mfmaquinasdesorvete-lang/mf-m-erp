-- =====================================================================
-- Conferir itens das notas de fornecedor
--  * nfe_recebida_itens: os itens de cada nota de fornecedor, lidos do XML (uma linha por item); a nota nova
--    ou o XML que chega depois já gravam os itens sozinhos; as notas antigas são lidas por indexar_itens_nfe();
--  * fornecedor_itens_sem_estoque: item de fornecedor que não é produto de estoque (uso e consumo, bem da
--    empresa, serviço…), para a tela não pedir vínculo de novo;
--  * itens_notas_fornecedor(): cada item diferente (fornecedor + código) com notas, quantidade, último preço,
--    datas, o produto já ligado ou a sugestão (mesmo código de barras ou mesmo código);
--  * ligar_itens_fornecedor(): liga o item ao produto (produto_fornecedor; o gatilho dele já atualiza os
--    fornecedores do produto com o preço das notas) ou marca como "sem estoque". Não mexe no estoque.
-- Somente acréscimos.
-- =====================================================================

create table if not exists public.nfe_recebida_itens (
  nfe_id uuid not null,
  numero int not null,
  codigo text,
  ean text,
  descricao text,
  ncm text,
  cfop text,
  unidade text,
  quantidade numeric,
  valor_unitario numeric,
  valor_total numeric,
  primary key (nfe_id, numero)
);
create index if not exists nfe_recebida_itens_codigo_idx on public.nfe_recebida_itens (codigo);
alter table public.nfe_recebida_itens enable row level security;
do $$ begin
  -- quem vê a nota vê os itens dela (a regra da nota vale dentro do exists)
  create policy nfe_recebida_itens_select on public.nfe_recebida_itens for select to authenticated
    using (exists (select 1 from public.nfe_recebidas n where n.id = nfe_id));
exception when duplicate_object then null; end $$;
revoke all on public.nfe_recebida_itens from anon, authenticated;
grant select on public.nfe_recebida_itens to authenticated;

-- notas já lidas (inclusive as que não têm item legível), para não ler de novo
create table if not exists public.nfe_recebida_itens_lidos (
  nfe_id uuid primary key,
  itens int not null default 0,
  lido_em timestamptz not null default now()
);
alter table public.nfe_recebida_itens_lidos enable row level security;
revoke all on public.nfe_recebida_itens_lidos from anon, authenticated;

create or replace function public.xml_texto(v xml)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(replace(replace(replace(replace(replace(v::text, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', ''''), '&amp;', '&')), '');
$$;

create or replace function public.numero_xml(t text)
returns numeric language sql immutable set search_path = public as $$
  select case when btrim(coalesce(t, '')) ~ '^-?\d+(\.\d+)?$' then btrim(t)::numeric end;
$$;

-- Lê os itens de uma nota (pelo XML) e grava em nfe_recebida_itens. Devolve quantos itens leu.
create or replace function public.indexar_itens_nota(p_nfe uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  v_xml xml;
  v_n int := 0;
begin
  select public.xml_ou_nulo(xml) into v_xml from nfe_recebidas where id = p_nfe and xml is not null;
  if v_xml is not null then
    insert into nfe_recebida_itens (nfe_id, numero, codigo, ean, descricao, ncm, cfop, unidade, quantidade, valor_unitario, valor_total)
    select p_nfe,
           coalesce(public.numero_xml((xpath('/n:det/@nItem', d, v_ns))[1]::text)::int, (row_number() over ())::int),
           public.xml_texto((xpath('/n:det/n:prod/n:cProd/text()', d, v_ns))[1]),
           nullif(substring(public.xml_texto((xpath('/n:det/n:prod/n:cEAN/text()', d, v_ns))[1]) from '^\d{8,14}$'), ''),
           public.xml_texto((xpath('/n:det/n:prod/n:xProd/text()', d, v_ns))[1]),
           public.xml_texto((xpath('/n:det/n:prod/n:NCM/text()', d, v_ns))[1]),
           public.xml_texto((xpath('/n:det/n:prod/n:CFOP/text()', d, v_ns))[1]),
           upper(public.xml_texto((xpath('/n:det/n:prod/n:uCom/text()', d, v_ns))[1])),
           public.numero_xml((xpath('/n:det/n:prod/n:qCom/text()', d, v_ns))[1]::text),
           public.numero_xml((xpath('/n:det/n:prod/n:vUnCom/text()', d, v_ns))[1]::text),
           public.numero_xml((xpath('/n:det/n:prod/n:vProd/text()', d, v_ns))[1]::text)
      from unnest(xpath('//n:det', v_xml, v_ns)) d
    on conflict (nfe_id, numero) do update
      set codigo = excluded.codigo, ean = excluded.ean, descricao = excluded.descricao, ncm = excluded.ncm, cfop = excluded.cfop,
          unidade = excluded.unidade, quantidade = excluded.quantidade, valor_unitario = excluded.valor_unitario, valor_total = excluded.valor_total;
    get diagnostics v_n = row_count;
  end if;
  insert into nfe_recebida_itens_lidos (nfe_id, itens, lido_em) values (p_nfe, v_n, now())
  on conflict (nfe_id) do update set itens = excluded.itens, lido_em = now();
  return v_n;
end $$;
revoke execute on function public.indexar_itens_nota(uuid) from public, anon, authenticated;

-- Lê as notas que ainda não foram lidas (no máximo p_limite por vez).
create or replace function public.indexar_itens_nfe(p_limite int default 300)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_total int := 0;
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico']) then raise exception 'sem permissão'; end if;
  for r in select n.id from nfe_recebidas n
            where n.xml is not null and not exists (select 1 from nfe_recebida_itens_lidos l where l.nfe_id = n.id)
            order by n.data_emissao desc nulls last
            limit greatest(coalesce(p_limite, 300), 1) loop
    perform public.indexar_itens_nota(r.id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.indexar_itens_nfe(int) from public, anon;
grant execute on function public.indexar_itens_nfe(int) to authenticated;

-- nota nova ou XML que chegou depois: lê os itens na hora (sem nunca impedir a gravação da nota)
create or replace function public.trg_nfe_recebida_itens()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.xml is null then return null; end if;
  if tg_op = 'UPDATE' and new.xml is not distinct from old.xml then return null; end if;
  begin
    perform public.indexar_itens_nota(new.id);
  exception when others then
    raise warning 'itens da nota %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_nfe_recebida_itens' and tgrelid = 'public.nfe_recebidas'::regclass) then
    create trigger trg_nfe_recebida_itens after insert or update of xml on public.nfe_recebidas
      for each row execute function public.trg_nfe_recebida_itens();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Itens de fornecedor que não são produto de estoque
-- ---------------------------------------------------------------------
create table if not exists public.fornecedor_itens_sem_estoque (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id),
  codigo_fornecedor text not null,
  descricao text,
  tipo text not null default 'consumo' check (tipo in ('consumo', 'ativo', 'servico', 'outro')),
  ativo boolean not null default true,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (fornecedor_id, codigo_fornecedor)
);
alter table public.fornecedor_itens_sem_estoque enable row level security;
do $$ begin
  create policy fornecedor_itens_sem_estoque_select on public.fornecedor_itens_sem_estoque for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;
revoke all on public.fornecedor_itens_sem_estoque from anon, authenticated;
grant select on public.fornecedor_itens_sem_estoque to authenticated;

-- ---------------------------------------------------------------------
-- Lista para conferir: um item por fornecedor + código
-- ---------------------------------------------------------------------
create or replace function public.itens_notas_fornecedor(p_unidade uuid default null, p_desde date default null)
returns table (fornecedor_id uuid, fornecedor text, fornecedor_cnpj text, codigo text, descricao text, ncm text, ean text, unidade text,
               notas int, quantidade numeric, ultimo_valor numeric, ultima_data date, primeira_data date,
               produto_id uuid, fator numeric, sem_estoque text, sugestao_id uuid, sugestao_motivo text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico']) then raise exception 'sem permissão'; end if;
  return query
  with base as (
    select n.fornecedor_id, n.data_emissao::date as data, i.nfe_id, i.numero, btrim(i.codigo) as codigo, i.ean, i.descricao,
           i.ncm, i.unidade, i.quantidade, i.valor_unitario
      from nfe_recebida_itens i
      join nfe_recebidas n on n.id = i.nfe_id
     where n.excluida_em is null and n.situacao <> 'cancelada' and n.fornecedor_id is not null
       and coalesce(n.finalidade, 'normal') <> 'devolucao'
       and (p_unidade is null or n.unidade_id = p_unidade)
       and (p_desde is null or n.data_emissao::date >= p_desde)
       -- só compra (vendas do fornecedor 51xx, 54xx, 61xx, 64xx, 71xx): remessa para conserto, demonstração… ficam de fora
       and coalesce(i.cfop, '') ~ '^(51|54|61|64|71)'
       and nullif(btrim(i.codigo), '') is not null
  ), grupo as (
    select b.fornecedor_id, b.codigo,
           (array_agg(b.descricao order by b.data desc, b.numero))[1] as descricao,
           (array_agg(b.ncm order by b.data desc, b.numero))[1] as ncm,
           (array_agg(b.ean order by b.data desc) filter (where b.ean is not null))[1] as ean,
           (array_agg(b.unidade order by b.data desc, b.numero))[1] as unidade,
           count(distinct b.nfe_id)::int as notas, sum(b.quantidade) as quantidade,
           (array_agg(b.valor_unitario order by b.data desc, b.numero))[1] as ultimo_valor,
           max(b.data) as ultima_data, min(b.data) as primeira_data
      from base b
     group by b.fornecedor_id, b.codigo
  )
  select g.fornecedor_id, coalesce(nullif(btrim(f.nome_fantasia), ''), f.nome), f.cnpj, g.codigo, g.descricao, g.ncm, g.ean, g.unidade,
         g.notas, g.quantidade, g.ultimo_valor, g.ultima_data, g.primeira_data,
         pf.produto_id, pf.fator_conversao, se.tipo, sug.id, sug.motivo
    from grupo g
    left join fornecedores f on f.id = g.fornecedor_id
    left join produto_fornecedor pf on pf.fornecedor_id = g.fornecedor_id and pf.codigo_fornecedor = g.codigo
    left join fornecedor_itens_sem_estoque se on se.fornecedor_id = g.fornecedor_id and se.codigo_fornecedor = g.codigo and se.ativo
    left join lateral (
      select p.id, case when g.ean is not null and p.codigo_barras = g.ean then 'mesmo código de barras' else 'mesmo código' end as motivo
        from produtos p
       where pf.produto_id is null and se.tipo is null and p.ativo and p.unificado_em is null
         and ((g.ean is not null and p.codigo_barras = g.ean)
              or (length(g.codigo) >= 4 and upper(btrim(coalesce(p.codigo_fabricante, ''))) = upper(g.codigo))
              -- SKU igual ao código do fornecedor só vale se não for um número curto (evita coincidência)
              or ((g.codigo ~ '[A-Za-z]' or length(g.codigo) >= 6) and upper(btrim(coalesce(p.sku, ''))) = upper(g.codigo)))
       order by (g.ean is not null and p.codigo_barras = g.ean) desc, p.created_at
       limit 1
    ) sug on true
   order by g.ultima_data desc, g.notas desc;
end $$;
revoke execute on function public.itens_notas_fornecedor(uuid, date) from public, anon;
grant execute on function public.itens_notas_fornecedor(uuid, date) to authenticated;

-- Liga itens ao produto ou marca como "sem estoque". Cada item: {fornecedor_id, codigo, descricao, acao, produto_id, fator}
-- acao: produto | consumo | ativo | servico | outro | pendente (volta para a lista de pendentes)
create or replace function public.ligar_itens_fornecedor(p_itens jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_n int := 0; v_forn uuid; v_cod text; v_acao text; v_fator numeric; v_prod uuid;
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico']) then raise exception 'sem permissão'; end if;
  for v in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_forn := nullif(v->>'fornecedor_id', '')::uuid;
    v_cod := nullif(btrim(coalesce(v->>'codigo', '')), '');
    v_acao := coalesce(v->>'acao', '');
    if v_forn is null or v_cod is null then raise exception 'item sem fornecedor ou sem código'; end if;
    if v_acao = 'produto' then
      v_prod := nullif(v->>'produto_id', '')::uuid;
      if v_prod is null or not exists (select 1 from produtos where id = v_prod and unificado_em is null) then
        raise exception 'produto não encontrado para o item "%"', coalesce(v->>'descricao', v_cod);
      end if;
      v_fator := coalesce(nullif(v->>'fator', '')::numeric, 1);
      if v_fator <= 0 then raise exception 'fator inválido no item "%"', coalesce(v->>'descricao', v_cod); end if;
      insert into produto_fornecedor (fornecedor_id, codigo_fornecedor, descricao_fornecedor, produto_id, fator_conversao)
      values (v_forn, v_cod, nullif(v->>'descricao', ''), v_prod, v_fator)
      on conflict (fornecedor_id, codigo_fornecedor) do update
        set produto_id = excluded.produto_id, fator_conversao = excluded.fator_conversao,
            descricao_fornecedor = coalesce(excluded.descricao_fornecedor, produto_fornecedor.descricao_fornecedor);
      update fornecedor_itens_sem_estoque set ativo = false, atualizado_por = auth.uid(), atualizado_em = now()
       where fornecedor_id = v_forn and codigo_fornecedor = v_cod and ativo;
    elsif v_acao in ('consumo', 'ativo', 'servico', 'outro') then
      if exists (select 1 from produto_fornecedor where fornecedor_id = v_forn and codigo_fornecedor = v_cod) then
        raise exception 'o item "%" já está ligado a um produto: para trocar, ligue a outro produto', coalesce(v->>'descricao', v_cod);
      end if;
      insert into fornecedor_itens_sem_estoque (fornecedor_id, codigo_fornecedor, descricao, tipo)
      values (v_forn, v_cod, nullif(v->>'descricao', ''), v_acao)
      on conflict (fornecedor_id, codigo_fornecedor) do update
        set tipo = excluded.tipo, ativo = true, descricao = coalesce(excluded.descricao, fornecedor_itens_sem_estoque.descricao),
            atualizado_por = auth.uid(), atualizado_em = now();
    elsif v_acao = 'pendente' then
      update fornecedor_itens_sem_estoque set ativo = false, atualizado_por = auth.uid(), atualizado_em = now()
       where fornecedor_id = v_forn and codigo_fornecedor = v_cod and ativo;
    else
      raise exception 'ação inválida: %', v_acao;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.ligar_itens_fornecedor(jsonb) from public, anon;
grant execute on function public.ligar_itens_fornecedor(jsonb) to authenticated;
