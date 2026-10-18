-- Quem lê e grava as renegociações: o financeiro (o contador só lê); apagar: administrador (ou quem escreveu o evento)
create policy pagar_negociacoes_ler on public.pagar_negociacoes for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
create policy pagar_negociacoes_criar on public.pagar_negociacoes for insert to authenticated with check (public.tem_papel('financeiro'));
create policy pagar_negociacoes_mudar on public.pagar_negociacoes for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create policy pagar_negociacoes_apagar on public.pagar_negociacoes for delete to authenticated using (public.is_erp_admin());
create policy pagar_negociacao_eventos_ler on public.pagar_negociacao_eventos for select to authenticated using (public.tem_papel('financeiro') or public.e_contador());
create policy pagar_negociacao_eventos_criar on public.pagar_negociacao_eventos for insert to authenticated
  with check (public.tem_papel('financeiro') and criado_por = auth.uid());
create policy pagar_negociacao_eventos_apagar on public.pagar_negociacao_eventos for delete to authenticated
  using (public.is_erp_admin() or criado_por = auth.uid());
