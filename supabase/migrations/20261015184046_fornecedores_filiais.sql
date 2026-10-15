-- =====================================================================
-- Fornecedores como as transportadoras: marca com filiais e unificar cadastros repetidos.
--   * fornecedor sem matriz_id é a "marca" (ou um fornecedor avulso); com matriz_id é filial dela
--     (ex.: Frigelar → Cachoeirinha, São José, Osasco…). Um nível só.
--   * rede: filiais achadas na internet (site, Receita), guardadas como referência até virarem cadastro
--   * unificar_fornecedores: o repetido passa notas, contas, compras, cotações e produtos para o principal,
--     completa o que faltava no principal e fica arquivado com "unificado em" (nunca é apagado)
-- Somente acréscimos.
-- =====================================================================
alter table public.fornecedores add column if not exists matriz_id uuid references public.fornecedores(id);
alter table public.fornecedores add column if not exists unificado_em uuid references public.fornecedores(id);
alter table public.fornecedores add column if not exists unificado_quando timestamptz;
alter table public.fornecedores add column if not exists site text;
alter table public.fornecedores add column if not exists rede jsonb not null default '[]'::jsonb;
alter table public.fornecedores add column if not exists pesquisa_em timestamptz;
alter table public.fornecedores add column if not exists pesquisa_fontes text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fornecedores_matriz_outra') then
    alter table public.fornecedores add constraint fornecedores_matriz_outra check (matriz_id is null or matriz_id <> id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fornecedores_rede_lista') then
    alter table public.fornecedores add constraint fornecedores_rede_lista check (jsonb_typeof(rede) = 'array');
  end if;
end $$;
create index if not exists fornecedores_matriz on public.fornecedores (matriz_id) where matriz_id is not null;

-- um nível só: a marca não pode ser filial de outra, e quem tem filiais não vira filial
create or replace function public.trg_fornecedor_matriz()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.matriz_id is not null and (tg_op = 'INSERT' or new.matriz_id is distinct from old.matriz_id) then
    if exists (select 1 from fornecedores where id = new.matriz_id and matriz_id is not null) then
      raise exception 'o fornecedor escolhido como marca já é filial de outro: escolha a marca principal';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from fornecedores where matriz_id = new.id) then
      raise exception '"%" tem filiais: ele não pode virar filial de outro (agrupe as filiais dele na outra marca)', new.nome;
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_fornecedor_matriz before insert or update of matriz_id on public.fornecedores
  for each row execute function public.trg_fornecedor_matriz();

-- ---------------------------------------------------------------------
-- Agrupa filiais numa marca. p_marca nulo + p_nova_marca: cria a marca (só o nome) e agrupa nela.
-- As filiais de uma filial agrupada vêm junto (fica um nível só). Devolve o id da marca.
create or replace function public.agrupar_fornecedores(p_marca uuid, p_filiais uuid[], p_nova_marca text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_marca uuid := p_marca; f uuid;
begin
  if session_user not in ('postgres', 'supabase_admin') then perform public.exigir_papel('financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  if v_marca is null then
    if char_length(btrim(coalesce(p_nova_marca, ''))) < 2 then raise exception 'informe o nome da marca'; end if;
    insert into fornecedores (nome, nome_fantasia) values (btrim(p_nova_marca), btrim(p_nova_marca)) returning id into v_marca;
  elsif not exists (select 1 from fornecedores where id = v_marca and matriz_id is null and unificado_em is null) then
    raise exception 'a marca escolhida não existe, foi unificada ou já é filial de outra';
  end if;
  foreach f in array coalesce(p_filiais, '{}'::uuid[]) loop
    continue when f = v_marca;
    update fornecedores set matriz_id = v_marca where matriz_id = f;   -- as filiais da filial sobem para a marca
    update fornecedores set matriz_id = v_marca where id = f and unificado_em is null;
  end loop;
  return v_marca;
end $$;
revoke execute on function public.agrupar_fornecedores(uuid, uuid[], text) from public, anon;
grant execute on function public.agrupar_fornecedores(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- Cadastros repetidos. Tudo que aponta para o repetido passa para o principal (descoberto pelas chaves
-- estrangeiras: notas, contas, compras, cotações, produtos…). Onde o principal já tem o mesmo registro
-- (ex.: o mesmo código de produto do fornecedor) a linha do repetido fica como estava, para nada se perder.
create or replace function public.unificar_fornecedores(p_principal uuid, p_outros uuid[], p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; u record; v_outro uuid; m fornecedores; o fornecedores; n int := 0; v_motivo text; v_destino uuid; v_cond text;
begin
  if session_user not in ('postgres', 'supabase_admin') then perform public.exigir_papel('financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  v_motivo := coalesce(nullif(btrim(p_motivo), ''), 'Cadastro repetido de fornecedor');
  select * into m from fornecedores where id = p_principal for update;
  if m.id is null then raise exception 'fornecedor principal não encontrado'; end if;
  if m.unificado_em is not null then raise exception 'o principal "%" já foi unificado em outro: escolha outro', m.nome; end if;
  v_destino := coalesce(m.matriz_id, m.id);

  foreach v_outro in array coalesce(p_outros, '{}'::uuid[]) loop
    continue when v_outro = p_principal;
    select * into o from fornecedores where id = v_outro for update;
    continue when o.id is null or o.unificado_em is not null;

    for r in
      select c.conrelid::regclass as tabela, c.conrelid as rel, a.attname as coluna, a.attnum
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.fornecedores'::regclass
         and c.conrelid::regclass::text <> 'fornecedores'
    loop
      -- chave única que inclui a coluna (ex.: fornecedor + código): não duplica no principal
      v_cond := '';
      for u in
        select array(select att.attname from pg_attribute att where att.attrelid = r.rel and att.attnum = any (k.conkey) and att.attnum <> r.attnum) as outras
          from pg_constraint k where k.conrelid = r.rel and k.contype in ('u', 'p') and r.attnum = any (k.conkey) and cardinality(k.conkey) > 1
      loop
        v_cond := v_cond || format(' and not exists (select 1 from %s x where x.%I = $1%s)', r.tabela, r.coluna,
          (select coalesce(string_agg(format(' and x.%I is not distinct from t.%I', c, c), ''), '') from unnest(u.outras) c));
      end loop;
      execute format('update %s t set %I = $1 where t.%I = $2%s', r.tabela, r.coluna, r.coluna, v_cond) using p_principal, v_outro;
    end loop;
    update fornecedores set matriz_id = v_destino where matriz_id = v_outro and id <> v_destino;

    update fornecedores set matriz_id = null, unificado_em = p_principal, unificado_quando = now(),
           observacoes = left(concat_ws(E'\n', nullif(btrim(observacoes), ''),
             'Unificado em "' || coalesce(nullif(btrim(m.nome_fantasia), ''), m.nome) || '" em ' || to_char(now(), 'DD/MM/YYYY') || ': ' || v_motivo), 4000)
     where id = v_outro;

    update fornecedores set
      cnpj = coalesce(nullif(btrim(m.cnpj), ''), o.cnpj),
      inscricao_estadual = coalesce(nullif(btrim(m.inscricao_estadual), ''), o.inscricao_estadual),
      nome_fantasia = coalesce(nullif(btrim(m.nome_fantasia), ''), o.nome_fantasia),
      whatsapp = coalesce(nullif(btrim(m.whatsapp), ''), o.whatsapp),
      telefone = coalesce(nullif(btrim(m.telefone), ''), o.telefone),
      email = coalesce(nullif(btrim(m.email), ''), o.email),
      chave_pix = coalesce(nullif(btrim(m.chave_pix), ''), o.chave_pix),
      cep = coalesce(nullif(btrim(m.cep), ''), o.cep),
      logradouro = coalesce(nullif(btrim(m.logradouro), ''), o.logradouro),
      numero = coalesce(nullif(btrim(m.numero), ''), o.numero),
      complemento = coalesce(nullif(btrim(m.complemento), ''), o.complemento),
      bairro = coalesce(nullif(btrim(m.bairro), ''), o.bairro),
      municipio = coalesce(nullif(btrim(m.municipio), ''), o.municipio),
      uf = coalesce(nullif(btrim(m.uf), ''), o.uf),
      site = coalesce(m.site, o.site),
      marcadores = (select array(select distinct x from unnest(coalesce(m.marcadores, '{}') || coalesce(o.marcadores, '{}')) x)),
      observacoes = case when nullif(btrim(o.observacoes), '') is not null and coalesce(m.observacoes, '') not like '%' || btrim(o.observacoes) || '%'
                         then left(concat_ws(E'\n', nullif(btrim(m.observacoes), ''), btrim(o.observacoes)), 4000) else m.observacoes end
    where id = p_principal
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unificar_fornecedores(uuid, uuid[], text) from public, anon;
grant execute on function public.unificar_fornecedores(uuid, uuid[], text) to authenticated;
