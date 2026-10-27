-- Páginas do Claude (pedido de 27/10): as páginas que os chats fizeram para a usuária (análises, painéis, planos,
-- manuais), com o link para abrir. Aparece em Sobre → Conhecer o ERP → Páginas, só para o administrador. O link só
-- abre para quem a dona compartilhou. Os links ficam aqui no banco e não no código, porque o repositório é público.
create table if not exists public.paginas_claude (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  link text not null unique,
  descricao text,
  assunto text not null default 'Análises',
  feita_em date not null default current_date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.paginas_claude enable row level security;
drop policy if exists paginas_claude_admin on public.paginas_claude;
create policy paginas_claude_admin on public.paginas_claude for select using (is_erp_admin());
revoke all on public.paginas_claude from anon;
grant select on public.paginas_claude to authenticated;
