-- =====================================================================
-- Cadeias de causas (Sobre o ERP Line → Esquemas → Cadeia de causas)
--   * explica um efeito ligando os eventos em sequência; cada elo é FATO (com a evidência: onde se vê) ou
--     HIPÓTESE (suspeita ainda não conferida), e cada ligação é causa COMPROVADA, PROVÁVEL ou só CORRELAÇÃO
--   * regra contra "correlação vendida como causa": só é comprovada a ligação entre dois fatos com evidência;
--     um fato sem evidência não é aceito
--   * toda cadeia nasce e volta (a cada mudança) para "em revisão"; outra pessoa (ou o administrador) revisa
--   * financeiro, administrador e contador leem e escrevem; nada é apagado (descartada com o motivo)
-- =====================================================================

create table if not exists public.cadeias_causa (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) between 3 and 160),
  -- o efeito que a cadeia explica (o fim da sequência)
  efeito text not null check (length(trim(efeito)) between 3 and 300),
  area text not null default 'geral' check (area ~ '^[a-z_]{2,30}$'),
  -- da causa mais antiga ao efeito: [{texto, tipo: fato|hipotese, evidencia, ligacao: comprovada|provavel|correlacao}];
  -- "ligacao" é a relação do elo com o seguinte (o último liga ao efeito)
  elos jsonb not null default '[]'::jsonb check (jsonb_typeof(elos) = 'array' and jsonb_array_length(elos) <= 20),
  conclusao text check (conclusao is null or length(conclusao) <= 1500),
  situacao text not null default 'em_revisao' check (situacao in ('em_revisao', 'revisada', 'descartada')),
  motivo text check (motivo is null or length(motivo) <= 500),
  criado_por uuid default auth.uid(),
  criado_nome text,
  revisado_por uuid,
  revisado_nome text,
  revisado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.cadeias_causa enable row level security;
create policy "cadeias_causa_select" on public.cadeias_causa for select to authenticated
  using (public.projeto_pode('pendencia'));
create trigger zz_auditoria before insert or update on public.cadeias_causa
  for each row execute function public.trg_auditoria();

-- Confere os elos; devolve o primeiro problema (ou null). A mesma regra está em src/lib/causas.ts.
create or replace function public.problema_cadeia(p_elos jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare e jsonb; k int := 0; n int; prox_fato boolean;
begin
  if p_elos is null or jsonb_typeof(p_elos) <> 'array' then return 'elos inválidos'; end if;
  n := jsonb_array_length(p_elos);
  if n = 0 then return 'ponha pelo menos um elo (a primeira causa)'; end if;
  if n > 20 then return 'no máximo 20 elos'; end if;
  for e in select value from jsonb_array_elements(p_elos) loop
    k := k + 1;
    if jsonb_typeof(e) <> 'object' then return format('elo %s inválido', k); end if;
    if length(trim(coalesce(e->>'texto', ''))) < 3 then return format('elo %s: escreva o que aconteceu', k); end if;
    if length(e->>'texto') > 300 or length(coalesce(e->>'evidencia', '')) > 500 then return format('elo %s: texto longo demais', k); end if;
    if coalesce(e->>'tipo', '') not in ('fato', 'hipotese') then return format('elo %s: diga se é fato ou hipótese', k); end if;
    if coalesce(e->>'ligacao', '') not in ('comprovada', 'provavel', 'correlacao') then return format('elo %s: diga como liga ao seguinte', k); end if;
    if e->>'tipo' = 'fato' and length(trim(coalesce(e->>'evidencia', ''))) < 5 then
      return format('elo %s: fato precisa da evidência (onde se vê); sem ela, marque como hipótese', k);
    end if;
    -- o seguinte é o próximo elo, ou o efeito (que é o fato observado)
    prox_fato := k = n or (p_elos->k)->>'tipo' = 'fato';
    if e->>'ligacao' = 'comprovada' and (e->>'tipo' <> 'fato' or not prox_fato) then
      return format('elo %s: só dá para dizer "comprovada" entre dois fatos com evidência; use "provável" ou "correlação"', k);
    end if;
  end loop;
  return null;
end $$;

-- Anota ou muda uma cadeia. Toda mudança volta a cadeia para "em revisão".
create or replace function public.salvar_cadeia(
  p_id uuid, p_titulo text, p_efeito text, p_elos jsonb, p_area text default 'geral', p_conclusao text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text; v_prob text; v public.cadeias_causa;
begin
  if auth.uid() is null or not public.projeto_pode('pendencia') then raise exception 'seu perfil não escreve cadeias de causas'; end if;
  if length(trim(coalesce(p_titulo, ''))) < 3 then raise exception 'escreva o título (pelo menos 3 letras)'; end if;
  if length(trim(coalesce(p_efeito, ''))) < 3 then raise exception 'escreva o efeito que a cadeia explica'; end if;
  v_prob := public.problema_cadeia(p_elos);
  if v_prob is not null then raise exception '%', v_prob; end if;
  if p_id is null then
    select nome into v_nome from public.usuarios_erp where user_id = auth.uid();
    insert into public.cadeias_causa (titulo, efeito, area, elos, conclusao, criado_por, criado_nome)
    values (trim(p_titulo), trim(p_efeito), coalesce(nullif(p_area, ''), 'geral'), p_elos, nullif(trim(coalesce(p_conclusao, '')), ''), auth.uid(), v_nome)
    returning id into v_id;
    return v_id;
  end if;
  select * into v from public.cadeias_causa where id = p_id for update;
  if not found then raise exception 'cadeia não encontrada'; end if;
  update public.cadeias_causa set titulo = trim(p_titulo), efeito = trim(p_efeito), area = coalesce(nullif(p_area, ''), 'geral'), elos = p_elos,
    conclusao = nullif(trim(coalesce(p_conclusao, '')), ''), situacao = 'em_revisao', motivo = null,
    revisado_por = null, revisado_nome = null, revisado_em = null, atualizado_em = now()
  where id = p_id;
  return p_id;
end $$;
revoke all on function public.salvar_cadeia(uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.salvar_cadeia(uuid, text, text, jsonb, text, text) to authenticated;

-- Revisa: "revisada" (por outra pessoa ou pelo administrador, com os elos em ordem), "descartada" (com o motivo)
-- ou de volta a "em revisão".
create or replace function public.revisar_cadeia(p_id uuid, p_situacao text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.cadeias_causa; v_nome text; v_prob text;
begin
  if auth.uid() is null or not public.projeto_pode('pendencia') then raise exception 'seu perfil não revisa cadeias de causas'; end if;
  if p_situacao not in ('em_revisao', 'revisada', 'descartada') then raise exception 'situação inválida: %', p_situacao; end if;
  select * into v from public.cadeias_causa where id = p_id for update;
  if not found then raise exception 'cadeia não encontrada'; end if;
  if p_situacao = 'revisada' then
    if v.criado_por = auth.uid() and not public.is_erp_admin() then raise exception 'a revisão é de outra pessoa (ou do administrador)'; end if;
    v_prob := public.problema_cadeia(v.elos);
    if v_prob is not null then raise exception 'ainda não dá para revisar: %', v_prob; end if;
  end if;
  if p_situacao = 'descartada' and length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'escreva o motivo (pelo menos 5 letras)'; end if;
  select nome into v_nome from public.usuarios_erp where user_id = auth.uid();
  update public.cadeias_causa set situacao = p_situacao,
    motivo = case when p_situacao = 'descartada' then trim(p_motivo) end,
    revisado_por = case when p_situacao = 'revisada' then auth.uid() end,
    revisado_nome = case when p_situacao = 'revisada' then v_nome end,
    revisado_em = case when p_situacao = 'revisada' then now() end,
    atualizado_em = now()
  where id = p_id;
end $$;
revoke all on function public.revisar_cadeia(uuid, text, text) from public, anon;
grant execute on function public.revisar_cadeia(uuid, text, text) to authenticated;
