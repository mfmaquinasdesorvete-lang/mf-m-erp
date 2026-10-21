-- Equipamentos de medição (registro REG-005): giga, validadores e paquímetros com a frequência de calibração, o último
-- certificado e a data da próxima. A próxima calibração entra nos avisos de vencimento (Sobre → Chaves e vencimentos).
create table if not exists public.instrumentos_medicao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (length(codigo) between 1 and 40),
  instrumento text not null check (length(instrumento) between 2 and 120),
  marca text check (marca is null or length(marca) <= 80),
  setor text check (setor is null or length(setor) <= 80),
  frequencia_meses int not null default 12 check (frequencia_meses between 1 and 120),
  certificado text check (certificado is null or length(certificado) <= 80),
  calibrado_em date,
  proxima_em date,
  laboratorio text check (laboratorio is null or length(laboratorio) <= 120),
  observacoes text check (observacoes is null or length(observacoes) <= 1000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists instrumentos_medicao_codigo_uk on public.instrumentos_medicao (lower(codigo));

-- sem data da próxima, ela sai da última calibração + frequência
create or replace function public.trg_instrumento_proxima() returns trigger language plpgsql set search_path = public as $$
begin
  if new.calibrado_em is not null and (new.proxima_em is null or (tg_op = 'UPDATE' and new.calibrado_em is distinct from old.calibrado_em
       and new.proxima_em is not distinct from old.proxima_em)) then
    new.proxima_em := (new.calibrado_em + make_interval(months => new.frequencia_meses))::date;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create or replace trigger aa_instrumento_proxima before insert or update on public.instrumentos_medicao
  for each row execute function public.trg_instrumento_proxima();
create or replace trigger zz_auditoria before insert or update on public.instrumentos_medicao
  for each row execute function public.trg_auditoria();

alter table public.instrumentos_medicao enable row level security;
revoke all on public.instrumentos_medicao from anon, public;
grant select, insert, update on public.instrumentos_medicao to authenticated;
grant all on public.instrumentos_medicao to service_role;
create policy instrumentos_medicao_ler on public.instrumentos_medicao for select to authenticated using (true);
create policy instrumentos_medicao_criar on public.instrumentos_medicao for insert to authenticated with check (public.is_erp_admin());
create policy instrumentos_medicao_mudar on public.instrumentos_medicao for update to authenticated
  using (public.is_erp_admin()) with check (public.is_erp_admin());

create or replace function public.vencimentos_ativos()
returns table (id uuid, origem text, nome text, tipo text, onde text, vence_em date, avisar_dias int, como_renovar text)
language sql stable security definer set search_path = public as $$
  select v.id, 'cadastro', v.nome, v.tipo, v.onde, v.vence_em, v.avisar_dias, v.como_renovar
    from vencimentos_chaves v where v.situacao = 'ativa'
  union all
  select c.id, 'inter', 'Certificado do Banco Inter' || coalesce(' · conta ' || c.conta_corrente, ''), 'certificado', 'Bancos e conciliação → Banco Inter',
         (c.certificado_validade at time zone 'America/Sao_Paulo')::date, 30, 'Gere outro certificado no app do Inter e use "Trocar credenciais".'
    from inter_conexoes c
   where c.certificado_validade is not null and c.status <> 'desligada'
  union all
  select i.id, 'calibracao', 'Calibração · ' || i.instrumento || ' (' || i.codigo || ')', 'outro', 'Teste do giga → Calibração',
         i.proxima_em, 45, 'Agende com o laboratório' || coalesce(' ' || i.laboratorio, '') || ' e registre o novo certificado em Teste do giga → Calibração.'
    from instrumentos_medicao i
   where i.ativo and i.proxima_em is not null
$$;
