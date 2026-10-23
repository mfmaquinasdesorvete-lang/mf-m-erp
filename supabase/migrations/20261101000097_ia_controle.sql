-- =====================================================================
-- Controle das IAs do ERP (requisitos da pesquisa da Lynn, 23/10):
--   * "IA desligada": um interruptor em Configurações → Inteligência artificial desliga todas as IAs na hora
--     (incidente). As funções de IA (ia-produto, ia-voz) conferem antes de chamar a IA.
--   * Registro de tudo que a IA faz: cada uso fica em ia_registros (quem, quando, qual IA, o que pediu em resumo,
--     modelo, se deu certo). Só o administrador vê; só as funções do servidor gravam. Somente acréscimos.
-- =====================================================================

set local lock_timeout = '10s';

alter table public.configuracoes
  add column if not exists ia_ligada boolean not null default true,
  add column if not exists ia_desligada_em timestamptz,
  add column if not exists ia_desligada_por text,
  add column if not exists ia_desligada_motivo text;
comment on column public.configuracoes.ia_ligada is 'false = todas as IAs do ERP desligadas (Configurações → Inteligência artificial)';

create table if not exists public.ia_registros (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  user_id uuid,
  user_nome text,
  funcao text not null,
  acao text not null,
  resumo text,
  modelo text,
  ok boolean not null,
  erro text
);
comment on table public.ia_registros is 'Cada uso das IAs do ERP: quem, quando, qual IA, o que pediu (resumo), modelo e se deu certo';
create index if not exists ia_registros_quando on public.ia_registros (criado_em desc);

alter table public.ia_registros enable row level security;
revoke all on public.ia_registros from anon, authenticated;
grant select on public.ia_registros to authenticated;
do $$ begin
  create policy ia_registros_admin on public.ia_registros for select to authenticated using (public.is_erp_admin());
exception when duplicate_object then null; end $$;

-- Liga ou desliga todas as IAs (só administrador); desligar pede o motivo e avisa os administradores
create or replace function public.ia_ligar(p_ligada boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not public.is_erp_admin() then raise exception 'Só o administrador liga ou desliga a IA'; end if;
  if not p_ligada and coalesce(btrim(p_motivo), '') = '' then raise exception 'Diga o motivo para desligar a IA'; end if;
  select nome into v_nome from usuarios_erp where user_id = auth.uid();
  update configuracoes set ia_ligada = p_ligada,
    ia_desligada_em = case when p_ligada then null else now() end,
    ia_desligada_por = case when p_ligada then null else v_nome end,
    ia_desligada_motivo = case when p_ligada then null else btrim(p_motivo) end
  where id = 1;
  insert into notificacoes (tipo, titulo, texto, link, papeis, urgencia, destinatarios)
  values ('outro', case when p_ligada then '🤖 A IA do ERP foi ligada' else '🛑 A IA do ERP foi desligada' end,
          concat_ws(' · ', coalesce(v_nome, 'Administrador'), nullif(btrim(p_motivo), '')), '/configuracoes/ia', '{mensagem}', 'importante',
          array(select user_id from usuarios_erp where ativo and papel = 'admin'));
end $$;
revoke all on function public.ia_ligar(boolean, text) from public, anon;
grant execute on function public.ia_ligar(boolean, text) to authenticated;
