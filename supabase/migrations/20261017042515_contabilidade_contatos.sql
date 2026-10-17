-- Contatos do escritório de contabilidade (Painel do contador → Contabilidade): quem procurar em cada setor — recepção,
-- contábil, fiscal, pessoal, societário, administrativo e financeiro, certificado digital, relacionamento, comercial,
-- apoio e portador — com e-mail e WhatsApp/telefone. Os nomes e endereços ficam só no banco (o código é público).
-- configuracoes.contador_dados guarda o telefone, o site, o endereço e o Instagram do escritório.
-- emails_da_contabilidade lista os e-mails que chegaram dessas pessoas (ou do domínio delas) nas caixas que a pessoa
-- pode ver, com o setor de quem mandou: é a base para tratar sozinho o que o contador manda.
-- Financeiro e administrador gravam; contador lê; contato que saiu fica desativado (nada é apagado); histórico pela auditoria.

create table if not exists public.contabilidade_contatos (
  id uuid primary key default gen_random_uuid(),
  setor text not null check (setor in ('recepcao', 'contabil', 'fiscal', 'pessoal', 'societario', 'financeiro', 'certificado',
                                        'relacionamento', 'comercial', 'apoio', 'portador', 'outro')),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp text check (whatsapp is null or length(whatsapp) <= 40),
  observacao text check (observacao is null or length(observacao) <= 300),
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contabilidade_contatos_email on public.contabilidade_contatos (lower(email));
alter table public.contabilidade_contatos enable row level security;
revoke all on public.contabilidade_contatos from anon, public;
grant select, insert, update on public.contabilidade_contatos to authenticated;
create policy contabilidade_contatos_ler on public.contabilidade_contatos for select to authenticated using (public.tem_papel('financeiro', 'contador'));
create policy contabilidade_contatos_criar on public.contabilidade_contatos for insert to authenticated with check (public.tem_papel('financeiro'));
create policy contabilidade_contatos_mudar on public.contabilidade_contatos for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create trigger contabilidade_contatos_atualizado before update on public.contabilidade_contatos for each row execute function public.ecl_execucoes_atualizado();
create trigger zz_auditoria before insert or update on public.contabilidade_contatos for each row execute function public.trg_auditoria();

alter table public.configuracoes add column if not exists contador_dados jsonb not null default '{}'::jsonb;

/**
 * E-mails que vieram da contabilidade: o remetente é um contato ativo (pelo e-mail) ou é do mesmo domínio dos contatos
 * (o escritório escreve de outros endereços). Só das caixas que quem pergunta pode ver (a política de public.emails vale).
 */
create or replace function public.emails_da_contabilidade(p_limite int default 50)
returns table (id uuid, conta_id uuid, data timestamptz, de_nome text, de_email text, assunto text, previa text, anexos jsonb, lido boolean,
               setor text, contato text)
language sql stable security invoker set search_path = public as $$
  with c as (select lower(btrim(email)) email, setor, nome from contabilidade_contatos where ativo and email is not null),
       d as (select distinct split_part(email, '@', 2) dominio from c)
  select e.id, e.conta_id, e.data, e.de_nome, e.de_email, e.assunto, e.previa, e.anexos, e.lido,
         coalesce(x.setor, 'escritorio'), x.nome
    from emails e
    left join lateral (select c.setor, c.nome from c where c.email = lower(e.de_email) limit 1) x on true
   where not e.arquivado
     and (x.setor is not null or split_part(lower(e.de_email), '@', 2) in (select dominio from d))
   order by e.data desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;
revoke execute on function public.emails_da_contabilidade(int) from public, anon;
grant execute on function public.emails_da_contabilidade(int) to authenticated;
