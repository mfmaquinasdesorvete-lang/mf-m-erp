-- Chats do Claude (pedido de 23/10): a lista dos chats que trabalham no ERP, um por assunto, com o que cada um faz e o
-- link para abrir direto. Aparece em Sobre → Chats, só para o administrador. O link só abre para quem entra na conta
-- dona dos chats. Quem abrir um chat novo acrescenta uma linha aqui (veja o CLAUDE.md).
create table if not exists public.chats_claude (
  id uuid primary key default gen_random_uuid(),
  ordem int not null default 100,
  nome text not null,
  faz text not null,
  exemplos text,
  sessao text not null unique,
  cor text not null default 'slate',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.chats_claude enable row level security;
drop policy if exists chats_claude_admin on public.chats_claude;
create policy chats_claude_admin on public.chats_claude for select using (is_erp_admin());
revoke all on public.chats_claude from anon;
grant select on public.chats_claude to authenticated;
