-- =====================================================================
-- Pedido de venda como no Tiny: ocorrências e OS a partir do pedido
--  * pedido_ocorrencias: anotações do pedido com data e hora e quem escreveu (o servidor grava o autor e a hora);
--    vendas, financeiro e expedição escrevem; o contador lê; excluir só se Configurações → Pedidos permitir
--    (configuracoes.pedido_ocorrencias_excluir, desligado de início) — a exclusão fica no histórico da auditoria;
--  * ordens_servico.pedido_id: a OS aberta a partir de um pedido de venda fica ligada a ele.
-- Somente acréscimos; nenhum dado muda.
-- =====================================================================

set local lock_timeout = '10s';

alter table public.ordens_servico add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
create index if not exists ordens_servico_pedido_idx on public.ordens_servico (pedido_id) where pedido_id is not null;
comment on column public.ordens_servico.pedido_id is 'Pedido de venda de onde a OS foi aberta (instalação, entrega técnica, garantia)';

alter table public.configuracoes add column if not exists pedido_ocorrencias_excluir boolean not null default false;
comment on column public.configuracoes.pedido_ocorrencias_excluir is 'Permite excluir ocorrências dos pedidos de venda (a exclusão fica na auditoria)';

create table if not exists public.pedido_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 2 and 2000),
  autor uuid default auth.uid(),
  autor_nome text,
  created_at timestamptz not null default now()
);
comment on table public.pedido_ocorrencias is 'Ocorrências (anotações) do pedido de venda, com data, hora e autor';
create index if not exists pedido_ocorrencias_pedido_idx on public.pedido_ocorrencias (pedido_id, created_at desc);

alter table public.pedido_ocorrencias enable row level security;
revoke all on public.pedido_ocorrencias from anon;
grant select, insert, delete on public.pedido_ocorrencias to authenticated;

create policy pedido_ocorrencias_ler on public.pedido_ocorrencias for select to authenticated
  using (public.tem_papel('vendas', 'financeiro', 'expedicao', 'contador'));
create policy pedido_ocorrencias_criar on public.pedido_ocorrencias for insert to authenticated
  with check (public.tem_papel('vendas', 'financeiro', 'expedicao'));
create policy pedido_ocorrencias_excluir on public.pedido_ocorrencias for delete to authenticated
  using (public.tem_papel('vendas', 'financeiro') and coalesce((select c.pedido_ocorrencias_excluir from public.configuracoes c where c.id = 1), false));

-- autor, nome e hora pelo servidor (a tela não escolhe)
create or replace function public.trg_pedido_ocorrencia_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor := auth.uid();
    new.autor_nome := coalesce((select nullif(btrim(nome), '') from usuarios_erp where user_id = auth.uid()), new.autor_nome);
    new.created_at := now();
  end if;
  new.texto := btrim(new.texto);
  return new;
end $$;

create or replace trigger trg_pedido_ocorrencia_autor before insert on public.pedido_ocorrencias
  for each row execute function public.trg_pedido_ocorrencia_autor();
create or replace trigger zz_auditoria before insert or delete on public.pedido_ocorrencias
  for each row execute function public.trg_auditoria();
