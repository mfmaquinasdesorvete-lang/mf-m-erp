-- só leitura pela tela (financeiro, fiscal, contador e vendas); quem grava são as funções gnre_* (sem política de escrita)
alter table public.gnre_guias enable row level security;
create policy gnre_guias_ler on public.gnre_guias for select to authenticated
  using (public.tem_papel('financeiro', 'fiscal', 'contador', 'vendas'));
