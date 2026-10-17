-- =====================================================================
-- Agendamento de coleta (como no portal da Rodonaves): a data entre os próximos dias de coleta e o período
-- (manhã 08h–12h ou tarde 13h–18h), com a frequência de coleta de cada transportadora no endereço de cada
-- unidade da MF (dias da semana e períodos), antecedência e o aviso de urgência.
-- =====================================================================

-- Frequência de coleta: transportadora (marca ou filial) × unidade da MF. dias: 0 = domingo … 6 = sábado.
create table if not exists public.coleta_frequencias (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references public.transportadoras(id),
  unidade_id uuid not null references public.unidades(id),
  dias smallint[] not null default '{1,2,3,4,5}' check (dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(dias) > 0),
  manha boolean not null default true,
  tarde boolean not null default true,
  antecedencia_dias smallint not null default 1 check (antecedencia_dias between 0 and 10),
  observacao text,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  check (manha or tarde),
  unique (transportadora_id, unidade_id)
);

alter table public.coleta_frequencias enable row level security;
create policy "erp_select" on public.coleta_frequencias for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.coleta_frequencias for insert to authenticated with check (public.tem_papel('vendas', 'financeiro', 'expedicao'));
create policy "erp_update" on public.coleta_frequencias for update to authenticated
  using (public.tem_papel('vendas', 'financeiro', 'expedicao')) with check (public.tem_papel('vendas', 'financeiro', 'expedicao'));
grant select, insert, update on public.coleta_frequencias to authenticated;

create or replace trigger zz_auditoria before insert or update or delete on public.coleta_frequencias
  for each row execute function public.trg_auditoria();

-- O agendamento no envio
alter table public.envios add column if not exists coleta_periodo text check (coleta_periodo in ('manha', 'tarde'));
alter table public.envios add column if not exists coleta_urgente boolean not null default false;
alter table public.envios add column if not exists coleta_protocolo text;
alter table public.envios add column if not exists coleta_obs text;
alter table public.envios add column if not exists coleta_agendada_por uuid;
alter table public.envios add column if not exists coleta_agendada_em timestamptz;

-- Frequência que vale para o envio: a da transportadora escolhida ou, sem ela, a da marca (matriz)
create or replace function public.frequencia_coleta(p_transportadora uuid, p_unidade uuid)
returns public.coleta_frequencias language sql stable security definer set search_path = public as $$
  select f.* from public.coleta_frequencias f
  where f.unidade_id = p_unidade
    and f.transportadora_id in (p_transportadora, (select t.matriz_id from public.transportadoras t where t.id = p_transportadora))
  order by (f.transportadora_id = p_transportadora) desc
  limit 1;
$$;

-- Agenda (ou remarca) a coleta: vendas, financeiro ou expedição. Fora da frequência da transportadora,
-- só como urgência (combinada com a unidade de atendimento dela).
create or replace function public.agendar_coleta(
  p_envio uuid, p_data date, p_periodo text, p_protocolo text default null, p_urgente boolean default false, p_obs text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.envios;
  f public.coleta_frequencias;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  nomes text[] := array['no domingo', 'na segunda', 'na terça', 'na quarta', 'na quinta', 'na sexta', 'no sábado'];
begin
  if not public.tem_papel('vendas', 'financeiro', 'expedicao') then
    raise exception 'Sem permissão para agendar coleta';
  end if;
  select * into e from public.envios where id = p_envio for update;
  if not found then raise exception 'Envio não encontrado'; end if;
  if e.status in ('entregue', 'cancelado') or e.coletado_em is not null then
    raise exception 'Este envio já foi coletado, entregue ou cancelado';
  end if;
  if p_data is null or p_data < hoje then raise exception 'Escolha uma data de hoje em diante'; end if;
  if p_periodo is null or p_periodo not in ('manha', 'tarde') then raise exception 'Escolha o período: manhã ou tarde'; end if;
  if e.transportadora_id is null and coalesce(btrim(e.transportadora_nome), '') = '' then
    raise exception 'Escolha a transportadora antes de agendar a coleta';
  end if;

  if e.transportadora_id is not null and e.unidade_id is not null then
    f := public.frequencia_coleta(e.transportadora_id, e.unidade_id);
    if f.id is not null and not coalesce(p_urgente, false) then
      if not (extract(dow from p_data)::smallint = any (f.dias)) then
        raise exception 'A transportadora não coleta neste endereço %. Escolha outro dia ou marque como urgência (combinada com a unidade dela)',
          nomes[extract(dow from p_data)::int + 1];
      end if;
      if (p_periodo = 'manha' and not f.manha) or (p_periodo = 'tarde' and not f.tarde) then
        raise exception 'A transportadora não coleta neste endereço de %', case p_periodo when 'manha' then 'manhã' else 'tarde' end;
      end if;
    end if;
  end if;

  update public.envios set
    coleta_prevista = p_data,
    coleta_periodo = p_periodo,
    coleta_urgente = coalesce(p_urgente, false),
    coleta_protocolo = coalesce(nullif(btrim(p_protocolo), ''), coleta_protocolo),
    coleta_obs = nullif(btrim(coalesce(p_obs, '')), ''),
    coleta_agendada_por = auth.uid(),
    coleta_agendada_em = now()
  where id = p_envio;

  return jsonb_build_object('coleta_prevista', p_data, 'coleta_periodo', p_periodo, 'urgente', coalesce(p_urgente, false));
end $$;

revoke all on function public.agendar_coleta(uuid, date, text, text, boolean, text) from public, anon;
grant execute on function public.agendar_coleta(uuid, date, text, text, boolean, text) to authenticated;
grant execute on function public.frequencia_coleta(uuid, uuid) to authenticated;
