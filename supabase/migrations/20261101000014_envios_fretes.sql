-- =====================================================================
-- Fretes: embalagens, envio com os dados padronizados da cotação, cotações e aprovação, coleta, rastreio,
-- entrega com comprovante, frete final (CT-e) e ocorrências. O painel operacional lê destas tabelas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Embalagens (como no Tiny): descrição, tipo, largura × altura × comprimento (cm) e peso (kg)
-- ---------------------------------------------------------------------
create table if not exists public.embalagens (
  id uuid primary key default gen_random_uuid(),
  descricao text not null check (length(btrim(descricao)) >= 2),
  tipo text not null default 'caixa' check (tipo in ('caixa', 'envelope', 'rolo', 'palete', 'engradado', 'fardo', 'outro')),
  largura_cm numeric(8,1) check (largura_cm > 0),
  altura_cm numeric(8,1) check (altura_cm > 0),
  comprimento_cm numeric(8,1) check (comprimento_cm > 0),
  peso_kg numeric(10,3) check (peso_kg >= 0),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now()
);
alter table public.produtos add column if not exists embalagem_id uuid references public.embalagens(id);

-- ---------------------------------------------------------------------
-- Envio: um por despacho (o pedido pode ter mais de um, ex.: entrega parcial)
-- ---------------------------------------------------------------------
create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  pedido_id uuid references public.pedidos(id) on delete set null,
  os_id uuid references public.ordens_servico(id) on delete set null,
  cliente_id uuid references public.clientes(id),
  unidade_id uuid references public.unidades(id),
  vendedor_id uuid references public.vendedores(id),
  status text not null default 'cotacao'
    check (status in ('cotacao', 'aprovacao', 'coleta', 'transito', 'entregue', 'cancelado')),
  -- 1. origem e destino
  cep_origem text, cidade_origem text, uf_origem text,
  cep_destino text, cidade_destino text, uf_destino text, endereco_destino text,
  -- 2. carga: [{ embalagem_id, descricao, quantidade, largura_cm, altura_cm, comprimento_cm, peso_kg }]
  volumes jsonb not null default '[]',
  qtd_volumes int not null default 0,
  peso_total_kg numeric(12,3) not null default 0,
  cubagem_m3 numeric(12,4) not null default 0,
  -- 3. valor e seguro
  valor_mercadoria numeric(12,2) not null default 0,
  seguro boolean not null default true,
  -- 4. equipamento e restrições
  tipo_equipamento text,
  restricoes text[] not null default '{}',
  restricoes_obs text,
  -- 5. prazo e modalidade combinados com o cliente
  prazo_desejado date,
  modalidade text not null default 'cif' check (modalidade in ('cif', 'fob', 'terceiros', 'retira', 'proprio')),
  -- 6. quem paga e a que se liga
  pagador text not null default 'empresa' check (pagador in ('empresa', 'cliente', 'terceiro')),
  centro_custo_id uuid references public.centros_custo(id),
  -- transporte
  transportadora_id uuid references public.transportadoras(id),
  transportadora_nome text,
  prazo_dias int,
  valor_aprovado numeric(12,2),
  aprovado_em timestamptz,
  aprovado_por uuid,
  coleta_prevista date,
  coletado_em date,
  codigo_rastreio text,
  entrega_prevista date,
  entregue_em date,
  comprovante_em date,
  valor_final numeric(12,2),
  cte_numero text,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists envios_pedido on public.envios (pedido_id);
create index if not exists envios_status on public.envios (status);

create table if not exists public.envio_cotacoes (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envios(id) on delete cascade,
  transportadora_id uuid references public.transportadoras(id),
  transportadora_nome text,
  valor numeric(12,2) not null check (valor >= 0),
  prazo_dias int check (prazo_dias >= 0),
  validade date,
  observacoes text,
  escolhida boolean not null default false,
  ativa boolean not null default true,       -- "remover" tira da lista sem apagar
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists envio_cotacoes_envio on public.envio_cotacoes (envio_id);

create table if not exists public.envio_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envios(id) on delete cascade,
  tipo text not null default 'outro'
    check (tipo in ('atraso', 'avaria', 'extravio', 'endereco', 'recusa', 'reentrega', 'cobranca', 'outro')),
  descricao text not null check (length(btrim(descricao)) >= 3),
  responsavel text,
  andamento text,
  status text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  resolvida_em timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists envio_ocorrencias_envio on public.envio_ocorrencias (envio_id);

-- Acesso: todos do ERP veem; vendas e financeiro registram (nada é apagado: cancela ou tira da lista)
do $$
declare t text;
begin
  foreach t in array array['embalagens', 'envios', 'envio_cotacoes', 'envio_ocorrencias'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_select') then
      execute format('create policy "erp_select" on public.%I for select to authenticated using (public.is_erp_user())', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_insert') then
      execute format('create policy "erp_insert" on public.%I for insert to authenticated with check (public.tem_papel(''vendas'', ''financeiro''))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'erp_update') then
      execute format('create policy "erp_update" on public.%I for update to authenticated using (public.tem_papel(''vendas'', ''financeiro'')) with check (public.tem_papel(''vendas'', ''financeiro''))', t);
    end if;
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Regras do envio
-- ---------------------------------------------------------------------
create or replace function public.somar_dias_uteis(p_data date, p_dias int)
returns date language plpgsql immutable as $$
declare d date := p_data; n int := 0;
begin
  if p_data is null or p_dias is null then return null; end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Totais da carga, status pelo andamento (coletou → em trânsito; entregou → entregue) e entrega prevista
create or replace function public.trg_envio_calculos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v jsonb; q numeric;
begin
  new.qtd_volumes := 0; new.peso_total_kg := 0; new.cubagem_m3 := 0;
  for v in select * from jsonb_array_elements(coalesce(new.volumes, '[]'::jsonb)) loop
    q := greatest(coalesce(nullif(v->>'quantidade', '')::numeric, 1), 0);
    new.qtd_volumes := new.qtd_volumes + q;
    new.peso_total_kg := new.peso_total_kg + q * coalesce(nullif(v->>'peso_kg', '')::numeric, 0);
    new.cubagem_m3 := new.cubagem_m3 + q * coalesce(nullif(v->>'largura_cm', '')::numeric, 0) * coalesce(nullif(v->>'altura_cm', '')::numeric, 0)
                                         * coalesce(nullif(v->>'comprimento_cm', '')::numeric, 0) / 1000000;
  end loop;
  new.cep_origem := nullif(regexp_replace(coalesce(new.cep_origem, ''), '\D', '', 'g'), '');
  new.cep_destino := nullif(regexp_replace(coalesce(new.cep_destino, ''), '\D', '', 'g'), '');
  new.uf_destino := upper(nullif(btrim(new.uf_destino), ''));
  new.uf_origem := upper(nullif(btrim(new.uf_origem), ''));
  if new.status <> 'cancelado' then
    if new.entregue_em is not null then new.status := 'entregue';
    elsif new.coletado_em is not null and new.status in ('cotacao', 'aprovacao', 'coleta') then new.status := 'transito';
    end if;
  end if;
  if new.coletado_em is not null and new.entrega_prevista is null and new.prazo_dias is not null then
    new.entrega_prevista := somar_dias_uteis(new.coletado_em, new.prazo_dias);
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create or replace trigger trg_envio_calculos
before insert or update on public.envios
for each row execute function public.trg_envio_calculos();

-- Cotação registrada: o envio passa a aguardar aprovação
create or replace function public.trg_envio_cotacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update envios set status = 'aprovacao' where id = new.envio_id and status = 'cotacao';
  return new;
end $$;
create or replace trigger trg_envio_cotacao
after insert on public.envio_cotacoes
for each row execute function public.trg_envio_cotacao();

create or replace function public.trg_envio_ocorrencia()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.status = 'resolvida' and new.resolvida_em is null then new.resolvida_em := now(); end if;
  if new.status = 'aberta' then new.resolvida_em := null; end if;
  return new;
end $$;
create or replace trigger trg_envio_ocorrencia
before update on public.envio_ocorrencias
for each row execute function public.trg_envio_ocorrencia();

-- O pedido acompanha o envio (transportadora, rastreio, data de envio, volumes e peso)
create or replace function public.trg_envio_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pedido_id is null or new.status = 'cancelado' then return new; end if;
  begin
    update pedidos set
      transportadora_id = coalesce(new.transportadora_id, transportadora_id),
      codigo_rastreio = coalesce(new.codigo_rastreio, codigo_rastreio),
      enviado_em = coalesce(new.coletado_em, enviado_em),
      volumes = coalesce(nullif(new.qtd_volumes, 0), volumes),
      peso_total_kg = coalesce(nullif(new.peso_total_kg, 0), peso_total_kg)
     where id = new.pedido_id
       and (transportadora_id is distinct from coalesce(new.transportadora_id, transportadora_id)
         or codigo_rastreio is distinct from coalesce(new.codigo_rastreio, codigo_rastreio)
         or enviado_em is distinct from coalesce(new.coletado_em, enviado_em)
         or volumes is distinct from coalesce(nullif(new.qtd_volumes, 0), volumes)
         or peso_total_kg is distinct from coalesce(nullif(new.peso_total_kg, 0), peso_total_kg));
  exception when others then
    -- o envio nunca deixa de ser salvo por causa do pedido (ex.: mês fechado)
    raise warning 'envio %: pedido não atualizado (%)', new.numero, sqlerrm;
  end;
  return new;
end $$;
create or replace trigger trg_envio_pedido
after insert or update on public.envios
for each row execute function public.trg_envio_pedido();

-- ---------------------------------------------------------------------
-- Criar o envio de um pedido já preenchido: origem (unidade), destino (cliente), volumes pelas embalagens
-- e medidas dos produtos, valor da mercadoria, equipamento, modalidade e quem paga
-- ---------------------------------------------------------------------
create or replace function public.criar_envio_pedido(p_pedido uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_p pedidos; v_c clientes; v_u unidades; v_id uuid; v_vol jsonb := '[]'; v_maquina text; v_tem_maquina boolean := false; i record;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into v_p from pedidos where id = p_pedido;
  if not found then raise exception 'pedido não encontrado'; end if;
  select id into v_id from envios where pedido_id = p_pedido and status <> 'cancelado' order by created_at limit 1;
  if v_id is not null then return v_id; end if;
  select * into v_c from clientes where id = v_p.cliente_id;
  select * into v_u from unidades where id = coalesce(v_p.unidade_id, (select id from unidades where matriz limit 1));

  for i in
    select pi.quantidade, pi.descricao, pr.tipo, pr.peso_kg, pr.largura_cm, pr.altura_cm, pr.profundidade_cm,
           e.id as emb_id, e.descricao as emb_desc, e.largura_cm as e_l, e.altura_cm as e_a, e.comprimento_cm as e_c, e.peso_kg as e_p
      from pedido_itens pi
      left join produtos pr on pr.id = pi.produto_id
      left join embalagens e on e.id = pr.embalagem_id
     where pi.pedido_id = p_pedido and coalesce(pr.tipo, '') <> 'servico'
  loop
    if i.tipo = 'maquina' then
      v_tem_maquina := true;
      v_maquina := coalesce(v_maquina, i.descricao);
    end if;
    v_vol := v_vol || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'embalagem_id', i.emb_id,
      'descricao', coalesce(i.emb_desc || ' · ', '') || i.descricao,
      'quantidade', ceil(i.quantidade),
      'largura_cm', coalesce(i.e_l, i.largura_cm),
      'altura_cm', coalesce(i.e_a, i.altura_cm),
      'comprimento_cm', coalesce(i.e_c, i.profundidade_cm),
      'peso_kg', coalesce(i.peso_kg, i.e_p))));
  end loop;

  insert into envios (pedido_id, cliente_id, unidade_id, vendedor_id,
                      cep_origem, cidade_origem, uf_origem, cep_destino, cidade_destino, uf_destino, endereco_destino,
                      volumes, valor_mercadoria, seguro, tipo_equipamento, restricoes, modalidade, pagador, transportadora_id)
  values (v_p.id, v_p.cliente_id, v_u.id, v_p.vendedor_id,
          v_u.cep, v_u.municipio, v_u.uf, v_c.cep, v_c.municipio, v_c.uf,
          nullif(concat_ws(', ', nullif(concat_ws(', ', v_c.logradouro, v_c.numero), ''), v_c.complemento, v_c.bairro), ''),
          v_vol, coalesce(v_p.valor_total, 0), coalesce(v_p.valor_total, 0) > 0,
          coalesce(v_maquina, 'Peças e acessórios'),
          case when v_tem_maquina then array['manter_em_pe'] else '{}'::text[] end,
          case v_p.modalidade_frete when 1 then 'fob' when 2 then 'terceiros' when 3 then 'proprio' when 4 then 'retira' else 'cif' end,
          case v_p.modalidade_frete when 1 then 'cliente' when 4 then 'cliente' when 2 then 'terceiro' else 'empresa' end,
          v_p.transportadora_id)
  returning id into v_id;
  return v_id;
end $$;

-- Aprovar a cotação: transportadora, valor aprovado e prazo vão para o envio (e para o pedido)
create or replace function public.aprovar_cotacao_envio(p_cotacao uuid, p_cobrar_cliente boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_c envio_cotacoes; v_e envios; v_ped pedidos;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into v_c from envio_cotacoes where id = p_cotacao and ativa;
  if not found then raise exception 'cotação não encontrada'; end if;
  select * into v_e from envios where id = v_c.envio_id for update;
  if v_e.status in ('entregue', 'cancelado') then raise exception 'este envio já foi %', case v_e.status when 'entregue' then 'entregue' else 'cancelado' end; end if;
  update envio_cotacoes set escolhida = (id = p_cotacao) where envio_id = v_c.envio_id;
  update envios set
      transportadora_id = v_c.transportadora_id,
      transportadora_nome = case when v_c.transportadora_id is null then v_c.transportadora_nome end,
      valor_aprovado = v_c.valor, prazo_dias = v_c.prazo_dias,
      aprovado_em = now(), aprovado_por = auth.uid(),
      status = case when status in ('cotacao', 'aprovacao') then 'coleta' else status end
   where id = v_c.envio_id;
  if v_e.pedido_id is not null then
    select * into v_ped from pedidos where id = v_e.pedido_id;
    if p_cobrar_cliente and v_ped.status = 'orcamento' then
      update pedidos set frete = v_c.valor, modalidade_frete = 0 where id = v_e.pedido_id;
    end if;
  end if;
end $$;

revoke execute on function public.criar_envio_pedido(uuid) from public, anon;
revoke execute on function public.aprovar_cotacao_envio(uuid, boolean) from public, anon;
grant execute on function public.criar_envio_pedido(uuid) to authenticated;
grant execute on function public.aprovar_cotacao_envio(uuid, boolean) to authenticated;
