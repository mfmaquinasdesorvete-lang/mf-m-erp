-- =====================================================================
-- Calendário de obrigações do Lucro Real (Painel do contador e Painel fiscal)
--   * as datas saem das regras do ERP (src/lib/obrigacoes.ts: prazo da lei, dias úteis e feriados nacionais);
--     aqui ficam só o que já foi entregue ou pago em cada competência e os prazos que o contador ajustar
--   * marca e ajusta: contador, financeiro ou administrador (pelas funções abaixo); leem os mesmos
-- =====================================================================

create table if not exists public.obrigacoes_cumpridas (
  id uuid primary key default gen_random_uuid(),
  -- regra do calendário (ex.: dctfweb, pis_cofins, icms)
  chave text not null check (chave ~ '^[a-z0-9_]{2,40}$'),
  -- AAAA-MM (mensal), AAAA-T1..T4 (trimestral) ou AAAA (anual)
  competencia text not null check (competencia ~ '^[0-9]{4}(-(0[1-9]|1[0-2]|T[1-4]))?$'),
  -- vazio = da empresa (centralizada na matriz); preenchido = do estabelecimento
  unidade_id uuid references public.unidades(id),
  situacao text not null default 'feito' check (situacao in ('feito', 'nao_se_aplica', 'pendente')),
  feito_em date,
  valor numeric(14,2) check (valor is null or valor >= 0),
  recibo text check (recibo is null or length(recibo) <= 120),
  observacao text check (observacao is null or length(observacao) <= 500),
  registrado_por uuid,
  registrado_nome text,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists obrigacoes_cumpridas_unica
  on public.obrigacoes_cumpridas (chave, competencia, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.obrigacoes_cumpridas enable row level security;
create policy "obrigacoes_select" on public.obrigacoes_cumpridas for select to authenticated
  using (public.tem_papel('financeiro') or public.e_contador());
create trigger zz_auditoria before insert or update on public.obrigacoes_cumpridas
  for each row execute function public.trg_auditoria();

-- Marca uma obrigação da competência: feita (com data, valor da guia e recibo), não se aplica (com o motivo)
-- ou volta a pendente. Marcar de novo atualiza a mesma linha.
create or replace function public.marcar_obrigacao(
  p_chave text, p_competencia text, p_unidade uuid, p_situacao text,
  p_feito_em date default null, p_valor numeric default null, p_recibo text default null, p_observacao text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  if not (public.tem_papel('financeiro') or public.e_contador()) then
    raise exception 'só o contador, o financeiro ou o administrador marcam as obrigações';
  end if;
  if p_situacao not in ('feito', 'nao_se_aplica', 'pendente') then raise exception 'situação inválida: %', p_situacao; end if;
  if p_situacao = 'nao_se_aplica' and length(trim(coalesce(p_observacao, ''))) < 5 then
    raise exception 'escreva por que não se aplica (pelo menos 5 letras)';
  end if;
  if p_feito_em is not null and p_feito_em > current_date then raise exception 'a data em que foi feito não pode ser no futuro'; end if;
  select nome into v_nome from public.usuarios_erp where user_id = auth.uid();
  insert into public.obrigacoes_cumpridas as o
    (chave, competencia, unidade_id, situacao, feito_em, valor, recibo, observacao, registrado_por, registrado_nome, atualizado_em)
  values (p_chave, p_competencia, p_unidade, p_situacao,
          case when p_situacao = 'feito' then coalesce(p_feito_em, current_date) end,
          case when p_situacao = 'feito' then p_valor end,
          nullif(trim(coalesce(p_recibo, '')), ''), nullif(trim(coalesce(p_observacao, '')), ''), auth.uid(), v_nome, now())
  on conflict (chave, competencia, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update
    set situacao = excluded.situacao, feito_em = excluded.feito_em, valor = excluded.valor, recibo = excluded.recibo,
        observacao = excluded.observacao, registrado_por = excluded.registrado_por, registrado_nome = excluded.registrado_nome,
        atualizado_em = now()
  returning o.id into v_id;
  return v_id;
end $$;
revoke all on function public.marcar_obrigacao(text, text, uuid, text, date, numeric, text, text) from public, anon;
grant execute on function public.marcar_obrigacao(text, text, uuid, text, date, numeric, text, text) to authenticated;

-- Prazos ajustados pelo contador: forma do IRPJ/CSLL (anual com estimativa ou trimestral) e, por unidade,
-- dia do ICMS, dia da EFD ICMS/IPI, se recolhe IPI, se tem ISS (e o dia) e se tem folha de pagamento.
alter table public.configuracoes add column if not exists calendario_fiscal jsonb not null default '{}'::jsonb;

create or replace function public.salvar_calendario_fiscal(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.tem_papel('financeiro') or public.e_contador()) then
    raise exception 'só o contador, o financeiro ou o administrador ajustam os prazos';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or length(p::text) > 8000 then raise exception 'ajuste de prazos inválido'; end if;
  if coalesce(p->>'irpj', 'anual') not in ('anual', 'trimestral') then raise exception 'IRPJ/CSLL: anual ou trimestral'; end if;
  update public.configuracoes set calendario_fiscal = p where id = 1;
end $$;
revoke all on function public.salvar_calendario_fiscal(jsonb) from public, anon;
grant execute on function public.salvar_calendario_fiscal(jsonb) to authenticated;
