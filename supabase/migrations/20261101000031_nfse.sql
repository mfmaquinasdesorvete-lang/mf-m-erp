-- =====================================================================
-- NFS-e (nota fiscal de serviço) pela Focus NFe, a partir da ordem de serviço.
--   1. O ERP grava o pedido com uma referência única ANTES de chamar a Focus.
--   2. A Focus aceita e processa de forma assíncrona; webhook + consulta periódica levam ao resultado final.
--   3. Só "autorizada" (em produção) fatura a OS e liga a nota à conta a receber.
-- Cada tentativa é uma linha própria (o erro e a correção ficam no histórico, nada é sobrescrito) e
-- nfse_eventos guarda tudo o que aconteceu (só acrescenta; não se altera nem apaga).
-- Quem grava é só o servidor (Edge Functions): as telas apenas leem.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração fiscal da NFS-e por unidade (CNPJ) e município — revisar com o contador
-- ---------------------------------------------------------------------
create table if not exists public.nfse_config (
  unidade_id uuid primary key references public.unidades(id),
  ativo boolean not null default false,
  padrao text not null default 'nacional' check (padrao in ('nacional', 'municipal')),
  codigo_municipio text check (codigo_municipio is null or codigo_municipio ~ '^[0-9]{7}$'),   -- IBGE do município do prestador
  item_lista_servico text,             -- LC 116/2003 (ex.: 14.01)
  codigo_tributacao_nacional text,     -- código de tributação nacional do ISS (padrão nacional, ex.: 140101)
  codigo_tributario_municipio text,    -- código do serviço na prefeitura (padrão municipal)
  codigo_nbs text,
  codigo_cnae text,
  aliquota_iss numeric(5,2) check (aliquota_iss is null or (aliquota_iss >= 0 and aliquota_iss <= 5)),
  iss_retido boolean not null default false,
  optante_simples_nacional boolean not null default false,
  regime_especial_tributacao int,
  natureza_operacao int,
  incluir_pecas boolean not null default false,   -- peças no valor da NFS-e? padrão: só a mão de obra (peças vão em NF-e)
  discriminacao_modelo text not null default 'Serviço de assistência técnica — OS nº {os}. Equipamento: {equipamento}. Serviço realizado: {solucao}',
  enviar_email_tomador boolean not null default true,
  -- NFS-e Nacional: o ERP numera a DPS (série + número), sem nunca repetir; cada ambiente tem o seu contador
  serie_dps int not null default 1 check (serie_dps between 1 and 49999),
  proximo_numero_dps bigint not null default 1 check (proximo_numero_dps >= 1),
  proximo_numero_dps_homologacao bigint not null default 1 check (proximo_numero_dps_homologacao >= 1),
  -- Reforma tributária (NFS-e Nacional): situação e classificação do IBS/CBS, indicador da operação
  ibs_cbs_cst text not null default '000' check (ibs_cbs_cst ~ '^[0-9]{3}$'),
  ibs_cbs_class_trib text not null default '000001' check (ibs_cbs_class_trib ~ '^[0-9]{6}$'),
  codigo_indicador_operacao text check (codigo_indicador_operacao is null or codigo_indicador_operacao ~ '^[0-9]{6}$'),
  consumidor_final boolean not null default false,
  observacoes text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.nfse_config enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse_config' and policyname = 'erp_select') then
    create policy "erp_select" on public.nfse_config for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse_config' and policyname = 'fin_insert') then
    create policy "fin_insert" on public.nfse_config for insert to authenticated with check (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse_config' and policyname = 'fin_update') then
    create policy "fin_update" on public.nfse_config for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;
grant select, insert, update on public.nfse_config to authenticated;

create or replace function public.trg_nfse_config_carimbo()
returns trigger language plpgsql set search_path = public as $$
declare v_usado bigint;
begin
  -- o próximo número da DPS nunca volta para um número já usado (ex.: tela aberta antes de uma emissão)
  if to_regclass('public.nfse') is not null then
    select max(numero_dps) into v_usado from nfse where unidade_id = new.unidade_id and ambiente = 'producao' and serie_dps = new.serie_dps;
    new.proximo_numero_dps := greatest(new.proximo_numero_dps, coalesce(v_usado, 0) + 1);
    select max(numero_dps) into v_usado from nfse where unidade_id = new.unidade_id and ambiente = 'homologacao' and serie_dps = new.serie_dps;
    new.proximo_numero_dps_homologacao := greatest(new.proximo_numero_dps_homologacao, coalesce(v_usado, 0) + 1);
  end if;
  -- só a numeração andou (emissão): não conta como alteração da configuração
  if tg_op = 'UPDATE' and (to_jsonb(new) - '{proximo_numero_dps,proximo_numero_dps_homologacao,atualizado_em,atualizado_por}'::text[])
      = (to_jsonb(old) - '{proximo_numero_dps,proximo_numero_dps_homologacao,atualizado_em,atualizado_por}'::text[]) then
    return new;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'nfse_config_carimbo' and tgrelid = 'public.nfse_config'::regclass) then
    create trigger nfse_config_carimbo before insert or update on public.nfse_config for each row execute function public.trg_nfse_config_carimbo();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- NFS-e: uma linha por tentativa
-- ---------------------------------------------------------------------
create table if not exists public.nfse (
  id uuid primary key default gen_random_uuid(),
  referencia text not null unique,
  unidade_id uuid not null references public.unidades(id),
  os_id uuid references public.ordens_servico(id),
  cliente_id uuid references public.clientes(id),
  substitui_id uuid references public.nfse(id),          -- tentativa corrigida a partir de uma rejeitada
  status text not null default 'rascunho'
    check (status in ('rascunho', 'pendente', 'processando', 'autorizada', 'rejeitada', 'cancelada', 'incerto')),
  ambiente text not null check (ambiente in ('producao', 'homologacao')),
  padrao text not null check (padrao in ('nacional', 'municipal')),
  valor_servicos numeric(14,2) not null check (valor_servicos > 0),
  aliquota_iss numeric(5,2),
  valor_iss numeric(14,2),
  iss_retido boolean not null default false,
  discriminacao text not null,
  tomador jsonb not null,           -- foto do tomador no momento do envio (editar o cliente depois não muda a nota)
  servico jsonb not null,           -- foto da OS, do serviço e dos valores usados
  payload jsonb,                    -- exatamente o que foi enviado à Focus
  resposta jsonb,                   -- último retorno da Focus
  mensagem text,                    -- último erro/aviso em texto
  serie_dps int,                    -- NFS-e Nacional: série e número da DPS reservados antes do envio
  numero_dps bigint,
  numero text,
  codigo_verificacao text,
  chave_acesso text,
  data_emissao timestamptz,
  url text,
  url_danfse text,
  xml_url text,
  tentativas int not null default 0,
  ultima_consulta_em timestamptz,
  solicitado_por uuid,
  solicitado_em timestamptz not null default now(),
  autorizada_em timestamptz,
  cancelamento_motivo text,
  cancelamento_solicitado_por uuid,
  cancelamento_solicitado_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- uma OS tem no máximo uma NFS-e "viva" (em andamento ou autorizada): impede emissão em dobro
create unique index if not exists nfse_os_viva on public.nfse (os_id)
  where os_id is not null and status in ('pendente', 'processando', 'autorizada', 'incerto');
-- a mesma DPS nunca vai duas vezes (a Ambiente Nacional recusaria: E0014)
create unique index if not exists nfse_dps_unica on public.nfse (unidade_id, ambiente, serie_dps, numero_dps)
  where numero_dps is not null;
create index if not exists nfse_status_idx on public.nfse (status);
create index if not exists nfse_os_idx on public.nfse (os_id);

alter table public.nfse enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse' and policyname = 'erp_select') then
    create policy "erp_select" on public.nfse for select to authenticated using (public.tem_papel('vendas', 'financeiro', 'tecnico'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse' and policyname = 'contador_select') then
    create policy "contador_select" on public.nfse for select to authenticated using (public.e_contador());
  end if;
end $$;
grant select on public.nfse to authenticated;

-- ---------------------------------------------------------------------
-- Histórico: tudo o que aconteceu com cada NFS-e (só acrescenta)
-- ---------------------------------------------------------------------
create table if not exists public.nfse_eventos (
  id bigint generated always as identity primary key,
  nfse_id uuid not null references public.nfse(id),
  tipo text not null,          -- status, envio, consulta, webhook, timeout, cancelamento_solicitado, ...
  status_antes text,
  status_depois text,
  http_status int,
  detalhe text,
  dados jsonb,
  usuario_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists nfse_eventos_nfse_idx on public.nfse_eventos (nfse_id, id);
alter table public.nfse_eventos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse_eventos' and policyname = 'erp_select') then
    create policy "erp_select" on public.nfse_eventos for select to authenticated using (public.tem_papel('vendas', 'financeiro', 'tecnico'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nfse_eventos' and policyname = 'contador_select') then
    create policy "contador_select" on public.nfse_eventos for select to authenticated using (public.e_contador());
  end if;
end $$;
grant select on public.nfse_eventos to authenticated;

create or replace function public.trg_nfse_eventos_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'O histórico da NFS-e não pode ser alterado nem apagado';
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'nfse_eventos_imutavel' and tgrelid = 'public.nfse_eventos'::regclass) then
    create trigger nfse_eventos_imutavel before update or delete on public.nfse_eventos for each row execute function public.trg_nfse_eventos_imutavel();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- OS e conta a receber ligadas à NFS-e autorizada
-- ---------------------------------------------------------------------
alter table public.ordens_servico add column if not exists faturada_em timestamptz;
alter table public.ordens_servico add column if not exists nfse_id uuid references public.nfse(id);
alter table public.contas_receber add column if not exists nfse_id uuid references public.nfse(id);

-- Mudança de status: registra no histórico; autorizada (produção) fatura a OS e liga a conta a receber;
-- cancelada desfaz; rejeitada / resultado incerto avisam o financeiro.
create or replace function public.trg_nfse_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'autorizada' and new.autorizada_em is null then new.autorizada_em := now(); end if;
  if new.status = 'cancelada' and new.cancelada_em is null then new.cancelada_em := now(); end if;
  return new;
end $$;

create or replace function public.trg_nfse_status_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_os ordens_servico; v_link text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  insert into nfse_eventos (nfse_id, tipo, status_antes, status_depois, detalhe, usuario_id)
  values (new.id, 'status', case when tg_op = 'UPDATE' then old.status end, new.status, new.mensagem, auth.uid());

  if new.os_id is not null then select * into v_os from ordens_servico where id = new.os_id; end if;
  v_link := '/assistencia';

  if new.status = 'autorizada' and new.ambiente = 'producao' then
    if v_os.id is not null then
      update ordens_servico set faturada_em = coalesce(new.autorizada_em, now()), nfse_id = new.id where id = v_os.id;
      update contas_receber set nfse_id = new.id where os_id = v_os.id and nfse_id is null;
    end if;
    perform public.notificar('outro', 'NFS-e autorizada',
      'NFS-e ' || coalesce('nº ' || new.numero, '') || coalesce(' da OS #' || v_os.numero, '') || ' autorizada pela prefeitura',
      v_link, '{financeiro,vendas,tecnico}', new.unidade_id);
  elsif new.status = 'cancelada' and tg_op = 'UPDATE' and old.status = 'autorizada' then
    if v_os.id is not null and v_os.nfse_id = new.id then
      update ordens_servico set faturada_em = null, nfse_id = null where id = v_os.id;
      update contas_receber set nfse_id = null where nfse_id = new.id;
    end if;
    perform public.notificar('outro', 'NFS-e cancelada',
      'NFS-e ' || coalesce('nº ' || new.numero, '') || coalesce(' da OS #' || v_os.numero, '') || ' cancelada: ' || coalesce(new.cancelamento_motivo, ''),
      v_link, '{financeiro}', new.unidade_id);
  elsif new.status = 'rejeitada' then
    perform public.notificar('outro', 'NFS-e rejeitada',
      coalesce('OS #' || v_os.numero || ': ', '') || left(coalesce(new.mensagem, 'confira os dados e reenvie'), 200),
      v_link, '{financeiro}', new.unidade_id);
  elsif new.status = 'incerto' then
    perform public.notificar('outro', 'NFS-e com resultado incerto',
      coalesce('OS #' || v_os.numero || ': ', '') || 'a Focus não respondeu a tempo. O ERP vai consultar pela mesma referência antes de qualquer reenvio.',
      v_link, '{financeiro}', new.unidade_id);
  end if;
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'nfse_status' and tgrelid = 'public.nfse'::regclass) then
    create trigger nfse_status before insert or update on public.nfse for each row execute function public.trg_nfse_status();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'nfse_status_depois' and tgrelid = 'public.nfse'::regclass) then
    create trigger nfse_status_depois after insert or update on public.nfse for each row execute function public.trg_nfse_status_depois();
  end if;
end $$;

revoke execute on function public.trg_nfse_status() from public, anon, authenticated;
revoke execute on function public.trg_nfse_status_depois() from public, anon, authenticated;
revoke execute on function public.trg_nfse_eventos_imutavel() from public, anon, authenticated;
revoke execute on function public.trg_nfse_config_carimbo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Reserva o número da DPS (NFS-e Nacional) antes do envio: atômico, nunca repete. Só o servidor chama.
-- ---------------------------------------------------------------------
create or replace function public.nfse_reservar_dps(p_unidade uuid, p_producao boolean)
returns table (serie int, numero bigint) language plpgsql security definer set search_path = public as $$
declare v_serie int; v_num bigint; v_usado bigint; v_amb text := case when p_producao then 'producao' else 'homologacao' end;
begin
  select c.serie_dps, case when p_producao then c.proximo_numero_dps else c.proximo_numero_dps_homologacao end
    into v_serie, v_num from nfse_config c where c.unidade_id = p_unidade for update;
  if not found then return; end if;
  select max(n.numero_dps) into v_usado from nfse n where n.unidade_id = p_unidade and n.ambiente = v_amb and n.serie_dps = v_serie;
  v_num := greatest(v_num, coalesce(v_usado, 0) + 1);
  if p_producao then
    update nfse_config set proximo_numero_dps = v_num + 1 where unidade_id = p_unidade;
  else
    update nfse_config set proximo_numero_dps_homologacao = v_num + 1 where unidade_id = p_unidade;
  end if;
  return query select v_serie, v_num;
end $$;
revoke execute on function public.nfse_reservar_dps(uuid, boolean) from public, anon, authenticated;
grant execute on function public.nfse_reservar_dps(uuid, boolean) to service_role;
