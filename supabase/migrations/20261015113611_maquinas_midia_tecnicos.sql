-- =====================================================================
-- Painel das máquinas
--  * produtos_midia: galeria de fotos e vídeos curtos de qualquer produto e os documentos das máquinas
--    (manual da máquina, manual elétrico/esquema, dicas de manutenção), no bucket público produtos-midia
--    (as fotos e os vídeos chegam já reduzidos pela tela); tirar da galeria = ativo false;
--  * produtos.especificacoes (ficha técnica de venda: voltagem, potência, produção…) e dicas_manutencao;
--  * tecnicos: equipe e parceiros, com a região que atendem (estados e cidades); a OS passa a guardar o
--    técnico (tecnico_id), preenchido sozinho pelo nome; tecnicos_do_cliente() junta quem já atendeu o
--    cliente e quem atende a região dele;
--  * equipamentos.token + maquina_publica(): página da máquina do cliente (manuais, dicas, garantia),
--    aberta pelo link que a equipe manda no WhatsApp;
--  * etapas de produção da máquina (produtos.etapas_producao) que viram a lista de conferência de cada OP;
--  * link do vídeo do produto; histórico de custos (mudanças de preço registradas + compras pelas notas);
--  * sugestor de NCM: pelas notas de fornecedor do mesmo código de barras ou código e pelos produtos parecidos.
-- Somente acréscimos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mídia dos produtos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos-midia', 'produtos-midia', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf'])
on conflict (id) do nothing;
do $$ begin
  create policy "produtos_midia_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'produtos-midia' and public.tem_algum_papel(array['financeiro', 'tecnico']));
exception when duplicate_object then null; end $$;

create table if not exists public.produtos_midia (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id),
  tipo text not null check (tipo in ('foto', 'video', 'manual', 'eletrico', 'dicas', 'outro')),
  titulo text check (titulo is null or length(titulo) <= 200),
  caminho text not null,
  mime text,
  tamanho bigint,
  duracao_seg numeric,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists produtos_midia_produto_idx on public.produtos_midia (produto_id) where ativo;
alter table public.produtos_midia enable row level security;
do $$ begin
  create policy produtos_midia_select on public.produtos_midia for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy produtos_midia_insert on public.produtos_midia for insert to authenticated
    with check (public.tem_algum_papel(array['financeiro', 'tecnico']));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy produtos_midia_update on public.produtos_midia for update to authenticated
    using (public.tem_algum_papel(array['financeiro', 'tecnico'])) with check (public.tem_algum_papel(array['financeiro', 'tecnico']));
exception when duplicate_object then null; end $$;
revoke all on public.produtos_midia from anon, authenticated;
grant select, insert, update on public.produtos_midia to authenticated;

alter table public.produtos
  add column if not exists especificacoes jsonb not null default '[]'::jsonb,
  add column if not exists dicas_manutencao text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_especificacoes_lista') then
    alter table public.produtos add constraint produtos_especificacoes_lista check (jsonb_typeof(especificacoes) = 'array');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Técnicos (equipe e parceiros) e a região que atendem
-- ---------------------------------------------------------------------
create or replace function public.sem_acento(t text)
returns text language sql immutable set search_path = public as $$
  select lower(translate(coalesce(t, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'));
$$;

create table if not exists public.tecnicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  tipo text not null default 'interno' check (tipo in ('interno', 'parceiro')),
  funcionario_id uuid references public.funcionarios(id),
  cliente_id uuid references public.clientes(id),
  whatsapp text, telefone text, email text,
  municipio text, uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  -- região: estados inteiros e/ou cidades ("Cidade/UF")
  ufs text[] not null default '{}',
  cidades text[] not null default '{}',
  especialidades text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tecnicos enable row level security;
do $$ begin
  create policy tecnicos_select on public.tecnicos for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tecnicos_insert on public.tecnicos for insert to authenticated with check (public.tem_algum_papel(array['tecnico', 'financeiro']));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tecnicos_update on public.tecnicos for update to authenticated
    using (public.tem_algum_papel(array['tecnico', 'financeiro'])) with check (public.tem_algum_papel(array['tecnico', 'financeiro']));
exception when duplicate_object then null; end $$;
revoke all on public.tecnicos from anon, authenticated;
grant select, insert, update on public.tecnicos to authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.tecnicos'::regclass) then
    create trigger zz_auditoria before insert or update on public.tecnicos for each row execute function public.trg_auditoria();
  end if;
end $$;

alter table public.ordens_servico add column if not exists tecnico_id uuid references public.tecnicos(id);
create index if not exists ordens_servico_tecnico_idx on public.ordens_servico (tecnico_id) where tecnico_id is not null;

-- OS: o técnico escrito pelo nome vira o cadastro (e o cadastro escolhido escreve o nome)
create or replace function public.trg_os_tecnico()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tecnico_id is not null and (tg_op = 'INSERT' or new.tecnico_id is distinct from old.tecnico_id) then
    select nome into new.tecnico from tecnicos where id = new.tecnico_id;
  elsif nullif(btrim(new.tecnico), '') is not null
        and (new.tecnico_id is null or (tg_op = 'UPDATE' and new.tecnico is distinct from old.tecnico)) then
    new.tecnico_id := (select t.id from tecnicos t
                        where t.ativo and public.sem_acento(btrim(t.nome)) = public.sem_acento(btrim(new.tecnico))
                        order by t.created_at limit 1);
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_os_tecnico' and tgrelid = 'public.ordens_servico'::regclass) then
    create trigger trg_os_tecnico before insert or update of tecnico, tecnico_id on public.ordens_servico
      for each row execute function public.trg_os_tecnico();
  end if;
end $$;

-- Técnicos para um cliente: quem já atendeu (pela OS) e quem atende a região (estado ou cidade)
create or replace function public.tecnicos_do_cliente(p_cliente uuid)
returns table (id uuid, nome text, tipo text, whatsapp text, telefone text, municipio text, uf text,
               atendimentos int, ultimo date, na_cidade boolean, no_estado boolean)
language sql stable security definer set search_path = public as $$
  with c as (select public.sem_acento(btrim(municipio)) as cid, upper(btrim(uf)) as uf from clientes where id = p_cliente),
  os as (
    select coalesce(o.tecnico_id, (select t.id from tecnicos t where public.sem_acento(btrim(t.nome)) = public.sem_acento(btrim(o.tecnico)) limit 1)) as tid,
           o.data_entrada
      from ordens_servico o
     where o.cliente_id = p_cliente and o.excluida_em is null and (o.tecnico_id is not null or nullif(btrim(o.tecnico), '') is not null)
  ),
  hist as (select tid, count(*)::int as n, max(data_entrada)::date as ultimo from os where tid is not null group by tid)
  select t.id, t.nome, t.tipo, t.whatsapp, t.telefone, t.municipio, t.uf,
         coalesce(h.n, 0), h.ultimo,
         coalesce(exists (select 1 from c, unnest(t.cidades) x
                           where c.cid <> '' and public.sem_acento(split_part(x, '/', 1)) = c.cid
                             and (split_part(x, '/', 2) = '' or upper(split_part(x, '/', 2)) = c.uf))
                  or (select c.cid <> '' and public.sem_acento(t.municipio) = c.cid and upper(t.uf) = c.uf from c), false),
         coalesce((select c.uf = any (t.ufs) or c.uf = upper(t.uf) from c), false)
    from tecnicos t
    left join hist h on h.tid = t.id
   where public.is_erp_user() and t.ativo
     and (h.n is not null
          or exists (select 1 from c where c.uf = any (t.ufs) or c.uf = upper(t.uf)
                                        or exists (select 1 from unnest(t.cidades) x where public.sem_acento(split_part(x, '/', 1)) = c.cid)))
   order by coalesce(h.n, 0) desc, 10 desc, t.nome;
$$;
revoke execute on function public.tecnicos_do_cliente(uuid) from public, anon;
grant execute on function public.tecnicos_do_cliente(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Página da máquina para o cliente (link no WhatsApp)
-- ---------------------------------------------------------------------
alter table public.equipamentos add column if not exists token uuid not null default gen_random_uuid();
create unique index if not exists equipamentos_token_idx on public.equipamentos (token);

create or replace function public.maquina_publica(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maquina', jsonb_strip_nulls(jsonb_build_object(
      'descricao', coalesce(p.descricao, e.descricao), 'modelo', p.modelo, 'numero_serie', e.numero_serie,
      'data_venda', e.data_venda, 'garantia_ate', e.garantia_ate, 'proxima_preventiva', e.proxima_preventiva,
      'usada', e.usada, 'outra_empresa', e.origem, 'foto', p.foto_caminho)),
    'cliente', split_part(btrim(coalesce(nullif(c.nome_fantasia, ''), c.nome, '')), ' ', 1),
    'especificacoes', coalesce(p.especificacoes, '[]'::jsonb),
    'dicas', p.dicas_manutencao,
    'midia', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'titulo', m.titulo, 'caminho', m.caminho, 'mime', m.mime)
                                        order by m.ordem, m.created_at)
                         from produtos_midia m where m.produto_id = p.id and m.ativo), '[]'::jsonb),
    'empresa', (select jsonb_build_object('nome', coalesce(nome_fantasia, razao_social), 'whatsapp', whatsapp, 'telefone', telefone, 'email', email)
                  from configuracoes where id = 1))
    from equipamentos e
    left join produtos p on p.id = e.produto_id
    left join clientes c on c.id = e.cliente_id
   where e.token = p_token;
$$;
revoke execute on function public.maquina_publica(uuid) from public;
grant execute on function public.maquina_publica(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Etapas de produção da máquina → lista de conferência da OP
-- ---------------------------------------------------------------------
alter table public.produtos
  add column if not exists etapas_producao jsonb not null default '[]'::jsonb,
  add column if not exists video_url text;
alter table public.ordens_producao add column if not exists etapas jsonb not null default '[]'::jsonb;

create or replace function public.trg_op_etapas()
returns trigger language plpgsql set search_path = public as $$
begin
  if jsonb_array_length(coalesce(new.etapas, '[]'::jsonb)) = 0 then
    new.etapas := coalesce((select jsonb_agg(jsonb_build_object('nome', e, 'feita', false) order by i)
                              from produtos p, jsonb_array_elements_text(p.etapas_producao) with ordinality t(e, i)
                             where p.id = new.produto_id), '[]'::jsonb);
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_op_etapas' and tgrelid = 'public.ordens_producao'::regclass) then
    create trigger trg_op_etapas before insert on public.ordens_producao for each row execute function public.trg_op_etapas();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Histórico de custos: mudanças de preço (auditoria), compras pelas notas de fornecedor e o estoque na data
-- ---------------------------------------------------------------------
create or replace function public.historico_custos(p_produto uuid)
returns table (data timestamptz, evento text, detalhe text, quantidade numeric, valor_unitario numeric,
               preco_custo numeric, preco_venda numeric, saldo numeric, usuario text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  p produtos;
  v_codigos text[];
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico']) then raise exception 'sem permissão'; end if;
  select * into p from produtos where id = p_produto;
  if p.id is null then return; end if;
  v_codigos := array(select distinct upper(regexp_replace(x, '\s', '', 'g'))
                       from unnest(array[p.sku, p.codigo_fabricante]
                                   || coalesce((select array_agg(codigo_fornecedor) from produto_fornecedor where produto_id = p.id), '{}')) x
                      where length(btrim(coalesce(x, ''))) >= 3);
  return query
  with ev as (
    select a.created_at as data, case when a.acao = 'insert' then 'cadastro' else 'alteracao' end as evento,
           nullif(btrim(coalesce(a.motivo, '')), '') as detalhe, null::numeric as quantidade, null::numeric as valor_unitario,
           case when a.acao = 'insert' or 'preco_custo' = any (a.campos) then nullif(a.depois->>'preco_custo', '')::numeric end as preco_custo,
           case when a.acao = 'insert' or 'preco_venda' = any (a.campos) then nullif(a.depois->>'preco_venda', '')::numeric end as preco_venda,
           a.usuario_nome as usuario
      from auditoria a
     where a.tabela = 'produtos' and a.registro_id = p_produto::text
       and (a.acao = 'insert' or 'preco_custo' = any (a.campos) or 'preco_venda' = any (a.campos))
  ), notas as (
    select n.id, n.data_emissao, n.emitente_nome, public.xml_ou_nulo(n.xml) as x
      from nfe_recebidas n
     where public.tem_papel('financeiro') and n.excluida_em is null and n.xml is not null
       and ((p.codigo_barras ~ '^\d{8,14}$' and n.xml like '%' || p.codigo_barras || '%')
            or exists (select 1 from unnest(v_codigos) c where n.xml ilike '%' || c || '%'))
  ), itens as (
    select nt.data_emissao, nt.emitente_nome, coalesce((xpath('//n:ide/n:nNF/text()', nt.x, v_ns))[1]::text, '') as nnf,
           (xpath('/n:prod/n:cProd/text()', pr, v_ns))[1]::text as cprod, (xpath('/n:prod/n:cEAN/text()', pr, v_ns))[1]::text as cean,
           (xpath('/n:prod/n:qCom/text()', pr, v_ns))[1]::text as q, (xpath('/n:prod/n:vUnCom/text()', pr, v_ns))[1]::text as v
      from notas nt cross join lateral unnest(xpath('//n:det/n:prod', nt.x, v_ns)) pr
     where nt.x is not null
  ), compras as (
    select i.data_emissao as data, 'compra'::text as evento, 'NF ' || i.nnf || ' · ' || coalesce(i.emitente_nome, '') as detalhe,
           case when i.q ~ '^\d+(\.\d+)?$' then i.q::numeric end as quantidade,
           case when i.v ~ '^\d+(\.\d+)?$' then round(i.v::numeric, 4) end as valor_unitario,
           null::numeric as preco_custo, null::numeric as preco_venda, null::text as usuario
      from itens i
     where (p.codigo_barras ~ '^\d{8,14}$' and i.cean = p.codigo_barras)
        or upper(regexp_replace(coalesce(i.cprod, ''), '\s', '', 'g')) = any (v_codigos)
  )
  select t.data, t.evento, t.detalhe, t.quantidade, t.valor_unitario, t.preco_custo, t.preco_venda,
         (select coalesce(sum(case m.tipo when 'saida' then -m.quantidade else m.quantidade end), 0)
            from estoque_movimentos m where m.produto_id = p_produto and m.created_at <= t.data) as saldo,
         t.usuario
    from (select * from ev union all select * from compras) t
   order by t.data desc
   limit 300;
end $$;
revoke execute on function public.historico_custos(uuid) from public, anon;
grant execute on function public.historico_custos(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Sugestor de NCM: notas de fornecedor do mesmo código de barras (GTIN) ou código, e produtos parecidos pelo nome
-- (só sugere: quem confirma é a pessoa, e na dúvida o contador)
-- ---------------------------------------------------------------------
create or replace function public.sugerir_ncm(p_produto uuid)
returns table (ncm text, fonte text, detalhe text, pontos int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  p produtos;
  v_codigos text[];
  v_palavras text[];
begin
  if not public.tem_algum_papel(array['financeiro', 'tecnico']) then raise exception 'sem permissão'; end if;
  select * into p from produtos where id = p_produto;
  if p.id is null then return; end if;
  v_codigos := array(select distinct upper(regexp_replace(x, '\s', '', 'g'))
                       from unnest(array[p.sku, p.codigo_fabricante]
                                   || coalesce((select array_agg(codigo_fornecedor) from produto_fornecedor where produto_id = p.id), '{}')) x
                      where length(btrim(coalesce(x, ''))) >= 3);
  -- palavras que dizem o que é a peça (sem as genéricas da casa)
  v_palavras := array(select distinct w from regexp_split_to_table(public.sem_acento(p.descricao), '[^a-z0-9]+') w
                       where length(w) >= 4 and w not in ('para', 'compativel', 'maquina', 'maquinas', 'frost', 'sorvete', 'expresso',
                                                          'sabores', 'sabor', 'unidade', 'peca', 'pecas', 'novo', 'nova', 'original'));
  return query
  with notas as (
    select n.emitente_nome, public.xml_ou_nulo(n.xml) as x
      from nfe_recebidas n
     where n.excluida_em is null and n.xml is not null
       and ((p.codigo_barras ~ '^\d{8,14}$' and n.xml like '%' || p.codigo_barras || '%')
            or exists (select 1 from unnest(v_codigos) c where n.xml ilike '%' || c || '%'))
  ), itens as (
    select nt.emitente_nome, (xpath('/n:prod/n:NCM/text()', pr, v_ns))[1]::text as ncm, (xpath('/n:prod/n:xProd/text()', pr, v_ns))[1]::text as xprod,
           (xpath('/n:prod/n:cProd/text()', pr, v_ns))[1]::text as cprod, (xpath('/n:prod/n:cEAN/text()', pr, v_ns))[1]::text as cean
      from notas nt cross join lateral unnest(xpath('//n:det/n:prod', nt.x, v_ns)) pr
     where nt.x is not null
  ), pela_nota as (
    select i.ncm, case when p.codigo_barras is not null and i.cean = p.codigo_barras then 'nota de fornecedor (mesmo código de barras)'
                       else 'nota de fornecedor (mesmo código)' end as fonte,
           coalesce(i.emitente_nome, '') || ': ' || coalesce(i.xprod, '') as detalhe, 100 as pontos
      from itens i
     where i.ncm ~ '^\d{8}$'
       and ((p.codigo_barras ~ '^\d{8,14}$' and i.cean = p.codigo_barras) or upper(regexp_replace(coalesce(i.cprod, ''), '\s', '', 'g')) = any (v_codigos))
  ), parecidos as (
    select o.ncm, o.descricao,
           (select count(*) from unnest(v_palavras) w where public.sem_acento(o.descricao) ~ ('(^|[^a-z0-9])' || w || '([^a-z0-9]|$)'))::int as comuns
      from produtos o
     where o.id <> p.id and o.unificado_em is null and o.ncm ~ '^\d{8}$' and cardinality(v_palavras) > 0
  ), pelo_nome as (
    select r.ncm, 'produto parecido' as fonte, r.descricao as detalhe, (r.comuns * 20)::int as pontos
      from (select * from parecidos where comuns >= least(2, cardinality(v_palavras)) order by comuns desc limit 12) r
  ), mesma_categoria as (
    select o.ncm, 'mesma categoria' as fonte, coalesce(p.categoria, '') || ' (' || count(*) || ' produtos)' as detalhe, least(count(*)::int * 3, 15) as pontos
      from produtos o
     where p.categoria is not null and o.categoria = p.categoria and o.id <> p.id and o.unificado_em is null and o.ncm ~ '^\d{8}$'
     group by o.ncm
  ), tudo as (select * from pela_nota union all select * from pelo_nome union all select * from mesma_categoria)
  select t.ncm, string_agg(distinct t.fonte, ' + '), (array_agg(t.detalhe order by t.pontos desc))[1], least(sum(t.pontos)::int, 300)
    from tudo t
   group by t.ncm
   order by 4 desc
   limit 5;
end $$;
revoke execute on function public.sugerir_ncm(uuid) from public, anon;
grant execute on function public.sugerir_ncm(uuid) to authenticated;
