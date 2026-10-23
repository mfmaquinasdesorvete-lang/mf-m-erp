-- Central dos chats (pedido de 23/10, Sobre → Chats): o administrador vê quem está publicando e o histórico das
-- publicações. Gravar continua só pelas funções publicacao_comecar / publicacao_terminar.
drop policy if exists publicacoes_admin_ler on public.publicacoes;
create policy publicacoes_admin_ler on public.publicacoes for select using (is_erp_admin());
grant select on public.publicacoes to authenticated;
