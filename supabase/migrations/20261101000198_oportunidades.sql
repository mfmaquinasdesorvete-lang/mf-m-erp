-- CRM, parte 1 (pedido da usuária, 30/10): oportunidades antes do orçamento, num quadro por etapas
-- (novo contato → em conversa → proposta enviada → ganho / perdido), com responsável (vendedor), os mesmos marcadores,
-- histórico de tudo o que aconteceu e notas. As métricas (conversão por etapa e por vendedor, tempo em cada etapa,
-- motivo de perda, valor no funil) saem do histórico, na tela (src/lib/oportunidades.ts).

create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  titulo text not null check (length(btrim(titulo)) between 2 and 200),
  cliente_id uuid references public.clientes (id) on delete set null,
  -- quem ainda não é cliente: o contato fica aqui até virar cadastro
  contato_nome text check (contato_nome is null or length(contato_nome) <= 200),
  contato_whatsapp text check (contato_whatsapp is null or length(contato_whatsapp) <= 40),
  contato_email text check (contato_email is null or length(contato_email) <= 200),
  etapa text not null default 'novo' check (etapa in ('novo', 'conversa', 'proposta', 'ganho', 'perdido')),
  etapa_desde timestamptz not null default now(),
  valor numeric(14, 2) check (valor is null or valor >= 0),
  vendedor_id uuid references public.vendedores (id) on delete set null,
  marcadores uuid[] not null default '{}',
  origem text check (origem is null or length(origem) <= 60),
  previsao date,
  motivo_perda text check (motivo_perda is null or length(motivo_perda) <= 300),
  pedido_id uuid references public.pedidos (id) on delete set null,
  unidade_id uuid references public.unidades (id),
  fechada_em timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluida_em timestamptz,
  constraint oportunidades_quem check (cliente_id is not null or nullif(btrim(contato_nome), '') is not null),
  constraint oportunidades_motivo check (etapa <> 'perdido' or nullif(btrim(motivo_perda), '') is not null)
);
create index if not exists oportunidades_etapa on public.oportunidades (etapa) where excluida_em is null;
create index if not exists oportunidades_cliente on public.oportunidades (cliente_id);
create index if not exists oportunidades_vendedor on public.oportunidades (vendedor_id);
create index if not exists oportunidades_pedido on public.oportunidades (pedido_id) where pedido_id is not null;

create table if not exists public.oportunidade_eventos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  tipo text not null check (tipo in ('criada', 'etapa', 'nota', 'valor', 'vendedor', 'pedido')),
  de text,
  para text,
  texto text check (texto is null or length(texto) <= 4000),
  por uuid default auth.uid(),
  por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists oportunidade_eventos_op on public.oportunidade_eventos (oportunidade_id, criado_em);

-- etapa: guarda quando entrou nela e quando fechou; motivo de perda só vale em "perdido"
create or replace function public.trg_oportunidade_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
    new.fechada_em := case when new.etapa in ('ganho', 'perdido') then now() end;
  end if;
  if new.etapa <> 'perdido' then new.motivo_perda := null; end if;
  new.titulo := btrim(new.titulo);
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_oportunidade_antes on public.oportunidades;
create trigger trg_oportunidade_antes before insert or update on public.oportunidades
for each row execute function public.trg_oportunidade_antes();

drop trigger if exists trg_unidade_documento on public.oportunidades;
create trigger trg_unidade_documento before insert on public.oportunidades
for each row execute function public.trg_unidade_documento();

-- histórico: criada, mudança de etapa, de valor, de responsável e o orçamento/pedido ligado
create or replace function public.trg_oportunidade_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nome text := (select nome from public.usuarios_erp where user_id = auth.uid());
  ev text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.oportunidade_eventos (oportunidade_id, tipo, para, por, por_nome)
    values (new.id, 'criada', new.etapa, auth.uid(), v_nome);
    return null;
  end if;
  if new.etapa is distinct from old.etapa then
    insert into public.oportunidade_eventos (oportunidade_id, tipo, de, para, texto, por, por_nome)
    values (new.id, 'etapa', old.etapa, new.etapa, case when new.etapa = 'perdido' then new.motivo_perda end, auth.uid(), v_nome);
  end if;
  if new.valor is distinct from old.valor then
    insert into public.oportunidade_eventos (oportunidade_id, tipo, de, para, por, por_nome)
    values (new.id, 'valor', old.valor::text, new.valor::text, auth.uid(), v_nome);
  end if;
  if new.vendedor_id is distinct from old.vendedor_id then
    insert into public.oportunidade_eventos (oportunidade_id, tipo, de, para, por, por_nome)
    values (new.id, 'vendedor', (select nome from public.vendedores where id = old.vendedor_id),
            (select nome from public.vendedores where id = new.vendedor_id), auth.uid(), v_nome);
  end if;
  if new.pedido_id is distinct from old.pedido_id then
    insert into public.oportunidade_eventos (oportunidade_id, tipo, de, para, por, por_nome)
    values (new.id, 'pedido', (select '#' || numero from public.pedidos where id = old.pedido_id),
            (select '#' || numero from public.pedidos where id = new.pedido_id), auth.uid(), v_nome);
  end if;
  return null;
end $$;
drop trigger if exists trg_oportunidade_historico on public.oportunidades;
create trigger trg_oportunidade_historico after insert or update on public.oportunidades
for each row execute function public.trg_oportunidade_historico();

-- nota escrita na tela: o nome de quem escreveu vem do cadastro
create or replace function public.trg_oportunidade_nota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.por := auth.uid();
  new.por_nome := (select nome from public.usuarios_erp where user_id = auth.uid());
  new.criado_em := now();
  return new;
end $$;
drop trigger if exists trg_oportunidade_nota on public.oportunidade_eventos;
create trigger trg_oportunidade_nota before insert on public.oportunidade_eventos
for each row when (new.tipo = 'nota') execute function public.trg_oportunidade_nota();

-- quem vê: vendas e financeiro (como os pedidos); quem mexe: vendas; excluir (escondida): administrador
alter table public.oportunidades enable row level security;
alter table public.oportunidade_eventos enable row level security;
drop policy if exists erp_select on public.oportunidades;
create policy erp_select on public.oportunidades for select using ((select public.tem_papel(variadic '{vendas,financeiro}'::text[])));
drop policy if exists erp_insert on public.oportunidades;
create policy erp_insert on public.oportunidades for insert with check ((select public.tem_papel(variadic '{vendas}'::text[])));
drop policy if exists erp_update on public.oportunidades;
create policy erp_update on public.oportunidades for update
  using ((select public.tem_papel(variadic '{vendas}'::text[])))
  with check ((select public.tem_papel(variadic '{vendas}'::text[])) and (excluida_em is null or (select public.is_erp_admin())));
drop policy if exists erp_delete on public.oportunidades;
create policy erp_delete on public.oportunidades for delete using ((select public.is_erp_admin()));

drop policy if exists erp_select on public.oportunidade_eventos;
create policy erp_select on public.oportunidade_eventos for select using ((select public.tem_papel(variadic '{vendas,financeiro}'::text[])));
drop policy if exists erp_insert on public.oportunidade_eventos;
create policy erp_insert on public.oportunidade_eventos for insert
  with check ((select public.tem_papel(variadic '{vendas}'::text[])) and tipo = 'nota');

-- os marcadores das oportunidades são os mesmos do resto do ERP (pôr/tirar, contar uso, juntar e excluir)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.marcar_registros(text, uuid[], uuid[], uuid[])'::regprocedure);
  if position('''oportunidades''' in d) = 0 then
    if position('''testes_giga'') then' in d) = 0 then raise exception 'marcar_registros mudou: confira a lista de tabelas'; end if;
    execute replace(d, '''testes_giga'') then', '''testes_giga'', ''oportunidades'') then');
  end if;
  d := pg_get_functiondef('public.marcadores_tabelas()'::regprocedure);
  if position('''oportunidades''' in d) = 0 then
    if position('''testes_giga'', ''transportadoras'']' in d) = 0 then raise exception 'marcadores_tabelas mudou: confira a lista'; end if;
    execute replace(d, '''testes_giga'', ''transportadoras'']', '''oportunidades'', ''testes_giga'', ''transportadoras'']');
  end if;
end $$;

-- orçamento ou pedido ligado aprovado (ou já faturado ou entregue): a oportunidade vira "ganho" sozinha
create or replace function public.trg_pedido_ganha_oportunidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('aprovado', 'faturado', 'entregue') and old.status is distinct from new.status then
    update public.oportunidades set etapa = 'ganho', valor = coalesce(valor, new.valor_total)
     where pedido_id = new.id and etapa in ('novo', 'conversa', 'proposta') and excluida_em is null;
  end if;
  return null;
end $$;
create or replace trigger trg_pedido_ganha_oportunidade after update of status on public.pedidos
for each row execute function public.trg_pedido_ganha_oportunidade();
