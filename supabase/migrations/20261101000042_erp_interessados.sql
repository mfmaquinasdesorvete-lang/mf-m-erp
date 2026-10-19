-- Página de apresentação do ERP Line (/conheca): quem deixa o contato (empresa ou escritório de contabilidade)
-- entra aqui e o time de vendas é avisado. Só a função grava; ler é de vendas/financeiro.
create table if not exists public.erp_interessados (
  id uuid primary key default gen_random_uuid(),
  perfil text not null check (perfil in ('empresa', 'contador')),
  nome text not null,
  empresa text,
  contato text not null,
  cidade text,
  indicado_por text,
  mensagem text,
  situacao text not null default 'novo' check (situacao in ('novo', 'em_conversa', 'convidado', 'descartado')),
  created_at timestamptz not null default now()
);
alter table public.erp_interessados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'erp_interessados' and policyname = 'erp_interessados_ler') then
    create policy erp_interessados_ler on public.erp_interessados for select to authenticated using (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;

create or replace function public.erp_interesse(p_perfil text, p_nome text, p_empresa text, p_contato text, p_cidade text,
  p_indicado_por text default null, p_mensagem text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_perfil not in ('empresa', 'contador') then raise exception 'escolha empresa ou escritório de contabilidade'; end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then raise exception 'informe o seu nome'; end if;
  if length(btrim(coalesce(p_contato, ''))) < 6 then raise exception 'informe um WhatsApp ou e-mail'; end if;
  -- trava simples contra robô: no máximo 20 contatos por hora no total
  if (select count(*) from erp_interessados where created_at > now() - interval '1 hour') >= 20 then
    raise exception 'muitos contatos agora: tente de novo em alguns minutos';
  end if;
  insert into erp_interessados (perfil, nome, empresa, contato, cidade, indicado_por, mensagem)
  values (p_perfil, left(btrim(p_nome), 120), left(nullif(btrim(p_empresa), ''), 160), left(btrim(p_contato), 120),
          left(nullif(btrim(p_cidade), ''), 80), left(nullif(btrim(p_indicado_por), ''), 160), left(nullif(btrim(p_mensagem), ''), 1000));
  perform public.notificar('outro', 'Novo interessado no ERP Line',
    left(btrim(p_nome), 60) || case when p_perfil = 'contador' then ' (contabilidade)' else ' (empresa)' end, '/sobre', '{vendas}', null);
end $$;
revoke execute on function public.erp_interesse(text, text, text, text, text, text, text) from public;
grant execute on function public.erp_interesse(text, text, text, text, text, text, text) to anon, authenticated;
