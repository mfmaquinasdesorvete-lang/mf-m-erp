-- =====================================================================
-- Dúvidas de manutenção com IA (pedido de 24/10, só para a equipe): a função ia-manutencao responde com o que a IA
-- sabe de máquinas de sorvete + o que o ERP tem (OS parecidas, peças, dicas salvas), sempre "confirme com o técnico".
-- A base cresce: o técnico ou o administrador marca a resposta boa como "Virou dica" e ela entra nas próximas.
-- Somente acréscimos.
-- =====================================================================

set local lock_timeout = '10s';

create table if not exists public.manutencao_dicas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  produto_id uuid references public.produtos(id) on delete set null,
  modelo text,
  defeito text not null,
  solucao text not null,
  origem text not null default 'tecnico' check (origem in ('tecnico', 'ia')),
  ativo boolean not null default true
);
comment on table public.manutencao_dicas is 'Base de dicas de manutenção (defeito → solução), conferidas pela equipe; usada pela IA de dúvidas de manutenção';
create index if not exists manutencao_dicas_produto on public.manutencao_dicas (produto_id) where ativo;

alter table public.manutencao_dicas enable row level security;
revoke all on public.manutencao_dicas from anon, authenticated;
grant select on public.manutencao_dicas to authenticated;
do $$ begin
  create policy manutencao_dicas_ler on public.manutencao_dicas for select to authenticated using (public.is_erp_user());
exception when duplicate_object then null; end $$;

-- Salvar (ou desligar) uma dica: só técnico ou administrador
create or replace function public.salvar_dica_manutencao(
  p_defeito text, p_solucao text, p_produto_id uuid default null, p_modelo text default null, p_origem text default 'tecnico')
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (public.is_erp_admin() or public.tem_papel('tecnico')) then raise exception 'Só o técnico ou o administrador salva dicas'; end if;
  if coalesce(btrim(p_defeito), '') = '' or coalesce(btrim(p_solucao), '') = '' then raise exception 'Escreva o defeito e a solução'; end if;
  if p_origem not in ('tecnico', 'ia') then raise exception 'Origem inválida'; end if;
  insert into manutencao_dicas (criado_por_nome, produto_id, modelo, defeito, solucao, origem)
  values ((select nome from usuarios_erp where user_id = auth.uid()), p_produto_id, nullif(btrim(p_modelo), ''),
          left(btrim(p_defeito), 500), left(btrim(p_solucao), 4000), p_origem)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.salvar_dica_manutencao(text, text, uuid, text, text) from public, anon;
grant execute on function public.salvar_dica_manutencao(text, text, uuid, text, text) to authenticated;

create or replace function public.desligar_dica_manutencao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_erp_admin() or public.tem_papel('tecnico')) then raise exception 'Só o técnico ou o administrador mexe nas dicas'; end if;
  update manutencao_dicas set ativo = false where id = p_id;
end $$;
revoke all on function public.desligar_dica_manutencao(bigint) from public, anon;
grant execute on function public.desligar_dica_manutencao(bigint) to authenticated;
