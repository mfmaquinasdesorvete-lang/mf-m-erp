-- =====================================================================
-- Transportadoras: marca com filiais, internet (site, rastreio, portal, cotação), API e atendimento.
--   * uma transportadora sem matriz_id é a "marca" (o cartão da lista); as que têm matriz_id são as
--     filiais/serviços dela (ex.: São Miguel → Palhoça, Campinas, Curitiba…). Um nível só.
--   * rede: unidades da marca achadas nos CT-e e no site, guardadas como referência (não viram cadastro
--     até alguém pedir), para o cadastro não ficar longo
--   * dados da internet ficam marcados como "a conferir" (pesquisa_em) até alguém conferir (conferido_em)
--   * unificar_transportadoras: cadastros repetidos passam tudo para o principal e ficam arquivados
-- =====================================================================
alter table public.transportadoras add column if not exists matriz_id uuid references public.transportadoras(id);
alter table public.transportadoras add column if not exists tipo text not null default 'transportadora';
alter table public.transportadoras add column if not exists site text;
alter table public.transportadoras add column if not exists rastreio_url text;
alter table public.transportadoras add column if not exists portal_url text;
alter table public.transportadoras add column if not exists cotacao_url text;
alter table public.transportadoras add column if not exists api text not null default 'desconhecido';
alter table public.transportadoras add column if not exists api_doc_url text;
alter table public.transportadoras add column if not exists api_recursos text[] not null default '{}';
alter table public.transportadoras add column if not exists api_como_obter text;
alter table public.transportadoras add column if not exists sistema text;
alter table public.transportadoras add column if not exists integracoes text[] not null default '{}';
alter table public.transportadoras add column if not exists servicos text[] not null default '{}';
alter table public.transportadoras add column if not exists abrangencia text[] not null default '{}';
alter table public.transportadoras add column if not exists sac_telefone text;
alter table public.transportadoras add column if not exists sac_email text;
alter table public.transportadoras add column if not exists contatos jsonb not null default '[]'::jsonb;
alter table public.transportadoras add column if not exists emails_operacionais jsonb not null default '[]'::jsonb;
alter table public.transportadoras add column if not exists rede jsonb not null default '[]'::jsonb;
alter table public.transportadoras add column if not exists condicoes text;
alter table public.transportadoras add column if not exists restricoes text;
alter table public.transportadoras add column if not exists alerta text;
alter table public.transportadoras add column if not exists ultimo_contato date;
alter table public.transportadoras add column if not exists pesquisa_em timestamptz;
alter table public.transportadoras add column if not exists pesquisa_fontes text[] not null default '{}';
alter table public.transportadoras add column if not exists conferido_em timestamptz;
alter table public.transportadoras add column if not exists conferido_por text;
alter table public.transportadoras add column if not exists unificado_em uuid references public.transportadoras(id);
alter table public.transportadoras add column if not exists unificado_quando timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transportadoras_tipo_valido') then
    alter table public.transportadoras add constraint transportadoras_tipo_valido check (tipo in
      ('transportadora', 'correios', 'agencia', 'aerea', 'plataforma', 'aplicativo', 'autonomo', 'proprio', 'retira', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transportadoras_api_valida') then
    alter table public.transportadoras add constraint transportadoras_api_valida check (api in ('sim', 'parcial', 'plataforma', 'nao', 'desconhecido'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transportadoras_matriz_outra') then
    alter table public.transportadoras add constraint transportadoras_matriz_outra check (matriz_id is null or matriz_id <> id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transportadoras_listas_json') then
    alter table public.transportadoras add constraint transportadoras_listas_json check (
      jsonb_typeof(contatos) = 'array' and jsonb_typeof(emails_operacionais) = 'array' and jsonb_typeof(rede) = 'array');
  end if;
end $$;
create index if not exists transportadoras_matriz on public.transportadoras (matriz_id) where matriz_id is not null;

-- um nível só: a marca não pode ser filial de outra, e quem tem filiais não vira filial
create or replace function public.trg_transportadora_matriz()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.matriz_id is not null and (tg_op = 'INSERT' or new.matriz_id is distinct from old.matriz_id) then
    if exists (select 1 from transportadoras where id = new.matriz_id and matriz_id is not null) then
      raise exception 'a marca escolhida já é filial de outra: escolha a marca principal';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from transportadoras where matriz_id = new.id) then
      raise exception '"%" tem filiais: ela não pode virar filial de outra (agrupe as filiais dela na outra marca)', new.nome;
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_transportadora_matriz before insert or update of matriz_id on public.transportadoras
  for each row execute function public.trg_transportadora_matriz();

-- ---------------------------------------------------------------------
-- Agrupa filiais numa marca. p_marca nulo + p_nova_marca: cria a marca (só o nome) e agrupa nela.
-- As filiais de uma filial agrupada vêm junto (fica um nível só). Devolve o id da marca.
create or replace function public.agrupar_transportadoras(p_marca uuid, p_filiais uuid[], p_nova_marca text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_marca uuid := p_marca; v_tipo text; f uuid;
begin
  if session_user not in ('postgres', 'supabase_admin') then perform public.exigir_papel('vendas', 'financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  if v_marca is null then
    if char_length(btrim(coalesce(p_nova_marca, ''))) < 2 then raise exception 'informe o nome da marca'; end if;
    select tipo into v_tipo from transportadoras where id = any (p_filiais) limit 1;
    insert into transportadoras (nome, tipo, ativo) values (btrim(p_nova_marca), coalesce(v_tipo, 'transportadora'), true) returning id into v_marca;
  elsif not exists (select 1 from transportadoras where id = v_marca and matriz_id is null) then
    raise exception 'a marca escolhida não existe ou já é filial de outra';
  end if;
  foreach f in array coalesce(p_filiais, '{}'::uuid[]) loop
    continue when f = v_marca;
    update transportadoras set matriz_id = v_marca where matriz_id = f;   -- as filiais da filial sobem para a marca
    update transportadoras set matriz_id = v_marca where id = f;
  end loop;
  return v_marca;
end $$;
revoke execute on function public.agrupar_transportadoras(uuid, uuid[], text) from public, anon;
grant execute on function public.agrupar_transportadoras(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- Cadastros repetidos: pedidos, envios, cotações e expedições passam para o principal; as filiais do
-- repetido vão para o principal (ou para a marca dele); o que só o repetido tinha completa o principal;
-- o repetido fica inativo com "unificado em" (nunca é apagado).
create or replace function public.unificar_transportadoras(p_principal uuid, p_outros uuid[], p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; v_outro uuid; m transportadoras; o transportadoras; n int := 0; v_motivo text; v_destino uuid;
begin
  if session_user not in ('postgres', 'supabase_admin') then perform public.exigir_papel('vendas', 'financeiro'); end if;
  perform set_config('erp.acao_usuario', 'on', true);
  v_motivo := coalesce(nullif(btrim(p_motivo), ''), 'Cadastro repetido de transportadora');
  select * into m from transportadoras where id = p_principal for update;
  if m.id is null then raise exception 'transportadora principal não encontrada'; end if;
  if not m.ativo or m.unificado_em is not null then raise exception 'o principal "%" está inativo: escolha um ativo', m.nome; end if;
  v_destino := coalesce(m.matriz_id, m.id);

  foreach v_outro in array coalesce(p_outros, '{}'::uuid[]) loop
    continue when v_outro = p_principal;
    select * into o from transportadoras where id = v_outro for update;
    continue when o.id is null or o.unificado_em is not null;

    for r in
      select c.conrelid::regclass as tabela, a.attname as coluna
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.transportadoras'::regclass
         and c.conrelid::regclass::text <> 'transportadoras'
    loop
      execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna) using p_principal, v_outro;
    end loop;
    update transportadoras set matriz_id = v_destino where matriz_id = v_outro and id <> v_destino;

    update transportadoras set ativo = false, matriz_id = null, unificado_em = p_principal, unificado_quando = now(),
           observacoes = left(concat_ws(E'\n', nullif(btrim(observacoes), ''),
             'Unificado em "' || m.nome || '" em ' || to_char(now(), 'DD/MM/YYYY') || ': ' || v_motivo), 4000)
     where id = v_outro;

    update transportadoras set
      cnpj = coalesce(nullif(btrim(m.cnpj), ''), o.cnpj),
      inscricao_estadual = coalesce(nullif(btrim(m.inscricao_estadual), ''), o.inscricao_estadual),
      nome_fantasia = coalesce(nullif(btrim(m.nome_fantasia), ''), o.nome_fantasia),
      contato = coalesce(nullif(btrim(m.contato), ''), o.contato),
      whatsapp = coalesce(nullif(btrim(m.whatsapp), ''), o.whatsapp),
      telefone = coalesce(nullif(btrim(m.telefone), ''), o.telefone),
      email = coalesce(nullif(btrim(m.email), ''), o.email),
      regioes = coalesce(nullif(btrim(m.regioes), ''), o.regioes),
      cep = coalesce(nullif(btrim(m.cep), ''), o.cep),
      logradouro = coalesce(nullif(btrim(m.logradouro), ''), o.logradouro),
      numero = coalesce(nullif(btrim(m.numero), ''), o.numero),
      complemento = coalesce(nullif(btrim(m.complemento), ''), o.complemento),
      bairro = coalesce(nullif(btrim(m.bairro), ''), o.bairro),
      municipio = coalesce(nullif(btrim(m.municipio), ''), o.municipio),
      uf = coalesce(nullif(btrim(m.uf), ''), o.uf),
      site = coalesce(m.site, o.site),
      rastreio_url = coalesce(m.rastreio_url, o.rastreio_url),
      portal_url = coalesce(m.portal_url, o.portal_url),
      observacoes = case when nullif(btrim(o.observacoes), '') is not null and coalesce(m.observacoes, '') not like '%' || btrim(o.observacoes) || '%'
                         then left(concat_ws(E'\n', nullif(btrim(m.observacoes), ''), btrim(o.observacoes)), 4000) else m.observacoes end
    where id = p_principal
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unificar_transportadoras(uuid, uuid[], text) from public, anon;
grant execute on function public.unificar_transportadoras(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- "Conferi os dados": tira o aviso de dado da internet a conferir
create or replace function public.conferir_transportadora(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select nullif(btrim(nome), '') into v_nome from usuarios_erp where user_id = auth.uid();
  update transportadoras set conferido_em = now(), conferido_por = v_nome where id = p_id;
end $$;
revoke execute on function public.conferir_transportadora(uuid) from public, anon;
grant execute on function public.conferir_transportadora(uuid) to authenticated;
