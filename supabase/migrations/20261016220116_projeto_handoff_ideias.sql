-- =====================================================================
-- Handoff e ideias do ERP (Sobre o ERP Line → abas Handoff e Ideias)
--   * um quadro só para o andamento do ERP: pendências (quem faz o quê), decisões tomadas e ideias anotadas
--   * ideias: todos que entram no ERP (e o contador) leem, anotam e votam; quem avalia é o administrador
--     (quem anotou pode retirar a sua)
--   * pendências e decisões: financeiro, administrador e contador leem, anotam e mudam a situação
--   * nada é apagado: o que não vai ser feito fica "descartado" com o motivo; histórico pela auditoria
-- =====================================================================

create table if not exists public.projeto_itens (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pendencia', 'ideia', 'decisao')),
  titulo text not null check (length(trim(titulo)) between 3 and 160),
  detalhe text check (detalhe is null or length(detalhe) <= 2000),
  -- área do menu (id do grupo em src/lib/menu.ts) ou "geral"
  area text not null default 'geral' check (area ~ '^[a-z_]{2,30}$'),
  -- pendência: quem faz
  responsavel text check (responsavel is null or responsavel in ('empresa', 'claude', 'contador', 'advogado', 'fornecedor')),
  -- pendência: urgência; ideia: impacto
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  -- ideia: tamanho do trabalho
  esforco text check (esforco is null or esforco in ('pequeno', 'medio', 'grande')),
  situacao text not null default 'aberta',
  prazo date,
  -- por que foi descartada, ou o que a pendência está aguardando
  motivo text check (motivo is null or length(motivo) <= 500),
  votos uuid[] not null default '{}',
  criado_por uuid default auth.uid(),
  criado_nome text,
  concluido_em timestamptz,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint projeto_itens_situacao check (
    (tipo = 'ideia' and situacao in ('aberta', 'avaliando', 'planejada', 'feita', 'descartada'))
    or (tipo = 'pendencia' and situacao in ('aberta', 'andamento', 'aguardando', 'feita', 'descartada'))
    or (tipo = 'decisao' and situacao in ('feita', 'descartada')))
);
create index if not exists projeto_itens_tipo_situacao on public.projeto_itens (tipo, situacao);

-- quem lê e anota cada tipo
create or replace function public.projeto_pode(p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_tipo = 'ideia' then public.is_erp_user() or public.e_contador()
              else public.tem_papel('financeiro') or public.e_contador() end
$$;
revoke all on function public.projeto_pode(text) from public, anon;
grant execute on function public.projeto_pode(text) to authenticated;

alter table public.projeto_itens enable row level security;
create policy "projeto_itens_select" on public.projeto_itens for select to authenticated
  using (public.projeto_pode(tipo));
create trigger zz_auditoria before insert or update on public.projeto_itens
  for each row execute function public.trg_auditoria();

-- Anota (p_id vazio) ou muda um item. Ideia: quem anotou ou o administrador; pendência e decisão: quem anotou,
-- o financeiro ou o administrador. O tipo não muda.
create or replace function public.salvar_item_projeto(
  p_id uuid, p_tipo text, p_titulo text, p_detalhe text default null, p_area text default 'geral',
  p_responsavel text default null, p_prioridade text default 'media', p_esforco text default null, p_prazo date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text; v public.projeto_itens;
begin
  if p_tipo not in ('pendencia', 'ideia', 'decisao') then raise exception 'tipo inválido: %', p_tipo; end if;
  if auth.uid() is null or not public.projeto_pode(p_tipo) then
    raise exception 'seu perfil não anota %', case p_tipo when 'ideia' then 'ideias' when 'decisao' then 'decisões' else 'pendências' end;
  end if;
  if length(trim(coalesce(p_titulo, ''))) < 3 then raise exception 'escreva o título (pelo menos 3 letras)'; end if;
  if p_tipo = 'pendencia' and p_responsavel is null then raise exception 'diga quem faz a pendência'; end if;
  if p_id is null then
    select nome into v_nome from public.usuarios_erp where user_id = auth.uid();
    insert into public.projeto_itens (tipo, titulo, detalhe, area, responsavel, prioridade, esforco, prazo, situacao,
      criado_por, criado_nome, concluido_em)
    values (p_tipo, trim(p_titulo), nullif(trim(coalesce(p_detalhe, '')), ''), coalesce(nullif(p_area, ''), 'geral'),
      case when p_tipo = 'pendencia' then p_responsavel end, coalesce(p_prioridade, 'media'),
      case when p_tipo = 'ideia' then p_esforco end, case when p_tipo = 'pendencia' then p_prazo end,
      case when p_tipo = 'decisao' then 'feita' else 'aberta' end, auth.uid(), v_nome,
      case when p_tipo = 'decisao' then now() end)
    returning id into v_id;
    return v_id;
  end if;
  select * into v from public.projeto_itens where id = p_id for update;
  if not found then raise exception 'item não encontrado'; end if;
  if v.tipo <> p_tipo then raise exception 'o tipo do item não muda'; end if;
  if not (v.criado_por = auth.uid() or public.is_erp_admin() or (p_tipo <> 'ideia' and public.tem_papel('financeiro'))) then
    raise exception 'só quem anotou ou o administrador muda este item';
  end if;
  update public.projeto_itens set
    titulo = trim(p_titulo), detalhe = nullif(trim(coalesce(p_detalhe, '')), ''), area = coalesce(nullif(p_area, ''), 'geral'),
    responsavel = case when p_tipo = 'pendencia' then p_responsavel end, prioridade = coalesce(p_prioridade, 'media'),
    esforco = case when p_tipo = 'ideia' then p_esforco end, prazo = case when p_tipo = 'pendencia' then p_prazo end,
    atualizado_em = now()
  where id = p_id;
  return p_id;
end $$;
revoke all on function public.salvar_item_projeto(uuid, text, text, text, text, text, text, text, date) from public, anon;
grant execute on function public.salvar_item_projeto(uuid, text, text, text, text, text, text, text, date) to authenticated;

-- Muda a situação. Descartar pede o motivo; "aguardando" pede o que se aguarda. Ideia: o administrador avalia
-- (quem anotou pode retirar a sua ou voltar a nova).
create or replace function public.mudar_situacao_projeto(p_id uuid, p_situacao text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.projeto_itens;
begin
  select * into v from public.projeto_itens where id = p_id for update;
  if not found then raise exception 'item não encontrado'; end if;
  if auth.uid() is null or not public.projeto_pode(v.tipo) then raise exception 'seu perfil não muda este item'; end if;
  if v.tipo = 'ideia' and not (public.is_erp_admin() or (v.criado_por = auth.uid() and p_situacao in ('aberta', 'descartada'))) then
    raise exception 'quem avalia as ideias é o administrador (quem anotou pode retirar a sua)';
  end if;
  if not ((v.tipo = 'ideia' and p_situacao in ('aberta', 'avaliando', 'planejada', 'feita', 'descartada'))
       or (v.tipo = 'pendencia' and p_situacao in ('aberta', 'andamento', 'aguardando', 'feita', 'descartada'))
       or (v.tipo = 'decisao' and p_situacao in ('feita', 'descartada'))) then
    raise exception 'situação inválida: %', p_situacao;
  end if;
  if p_situacao = 'descartada' and length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'escreva o motivo (pelo menos 5 letras)'; end if;
  if p_situacao = 'aguardando' and length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'escreva o que está aguardando'; end if;
  update public.projeto_itens set
    situacao = p_situacao,
    motivo = case when p_situacao in ('descartada', 'aguardando') then trim(p_motivo) end,
    concluido_em = case when p_situacao = 'feita' then coalesce(case when v.situacao = 'feita' then v.concluido_em end, now()) end,
    atualizado_em = now()
  where id = p_id;
end $$;
revoke all on function public.mudar_situacao_projeto(uuid, text, text) from public, anon;
grant execute on function public.mudar_situacao_projeto(uuid, text, text) to authenticated;

-- Voto na ideia: marca ou desmarca o voto de quem clicou. Devolve se ficou votado.
create or replace function public.votar_ideia(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.projeto_itens; v_votou boolean;
begin
  if auth.uid() is null or not public.projeto_pode('ideia') then raise exception 'seu perfil não vota nas ideias'; end if;
  select * into v from public.projeto_itens where id = p_id for update;
  if not found or v.tipo <> 'ideia' then raise exception 'só ideias recebem voto'; end if;
  v_votou := not (auth.uid() = any(v.votos));
  update public.projeto_itens
    set votos = case when v_votou then array_append(votos, auth.uid()) else array_remove(votos, auth.uid()) end
  where id = p_id;
  return v_votou;
end $$;
revoke all on function public.votar_ideia(uuid) from public, anon;
grant execute on function public.votar_ideia(uuid) to authenticated;
