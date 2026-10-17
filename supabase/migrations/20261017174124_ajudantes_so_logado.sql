-- Ajudantes de leitura que não conferem o papel (devolvem um número, um id ou sim/não): só para quem está logado.
-- frequencia_coleta ainda estava liberada para o visitante sem login (anon); as outras já estavam fechadas e ficam
-- registradas aqui para o teste src/lib/__tests__/bancoSeguranca.test.ts (matriz em supabase/PERMISSOES.md).
revoke execute on function public.frequencia_coleta(uuid, uuid) from public, anon;
revoke execute on function public.kit_composicao(uuid, jsonb) from public, anon;
revoke execute on function public.margem_alvo_produto(public.produtos) from public, anon;
revoke execute on function public.preco_sugerido(public.produtos) from public, anon;
revoke execute on function public.rateio_valido(jsonb) from public, anon;
revoke execute on function public.unidade_matriz() from public, anon;
grant execute on function public.frequencia_coleta(uuid, uuid), public.kit_composicao(uuid, jsonb), public.margem_alvo_produto(public.produtos),
  public.preco_sugerido(public.produtos), public.rateio_valido(jsonb), public.unidade_matriz() to authenticated, service_role;
