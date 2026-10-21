-- =====================================================================
-- Redes sociais dos clientes pela internet
--   * a função clientes-redes abre o site da empresa (campo Site ou o
--     domínio do e-mail, quando não é gmail/hotmail…) e lê os links do
--     Instagram, Facebook e TikTok
--   * o que achar fica em redes_sugeridas; a equipe aprova antes de ir
--     para o cadastro (aceitar_redes_sugeridas)
--   * agendamento a cada 5 minutos, 20 clientes por vez, até acabar
-- =====================================================================
alter table public.clientes
  add column if not exists redes_sugeridas jsonb,
  add column if not exists redes_buscado_em timestamptz;
comment on column public.clientes.redes_sugeridas is 'Redes achadas no site da empresa, esperando aprovação: {instagram, facebook, tiktok, website}';
comment on column public.clientes.redes_buscado_em is 'Quando o ERP procurou as redes no site da empresa';

-- fila: quem ainda não foi procurado, falta alguma rede e tem site (ou e-mail com domínio próprio)
create or replace function public.clientes_para_redes(p_limite int default 20)
returns setof public.clientes language sql stable security definer set search_path = public as $$
  select c.* from clientes c
   where c.redes_buscado_em is null
     and (nullif(btrim(c.instagram), '') is null or nullif(btrim(c.facebook), '') is null)
     and (nullif(btrim(c.website), '') is not null
          or (c.email ~* '@[a-z0-9-]+(\.[a-z0-9-]+)+'
              and c.email !~* '@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|bol|uol|terra|ig|globo|globomail|r7|zipmail|oi|aol|protonmail|gmx|mail|yandex|pop|superig|brturbo|click21|mercadolivre|mercadolibre|shopee|tiny|olist)\.'))
   order by c.created_at
   limit greatest(1, least(p_limite, 50));
$$;
revoke execute on function public.clientes_para_redes(int) from public, anon, authenticated;

-- aprovar (vai para os campos vazios do cadastro) ou descartar as sugestões
create or replace function public.aceitar_redes_sugeridas(p_ids uuid[], p_aceitar boolean default true)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  perform public.exigir_papel('vendas');
  update clientes c set
    instagram = case when p_aceitar then coalesce(nullif(btrim(c.instagram), ''), c.redes_sugeridas->>'instagram') else c.instagram end,
    facebook  = case when p_aceitar then coalesce(nullif(btrim(c.facebook), ''),  c.redes_sugeridas->>'facebook')  else c.facebook end,
    tiktok    = case when p_aceitar then coalesce(nullif(btrim(c.tiktok), ''),    c.redes_sugeridas->>'tiktok')    else c.tiktok end,
    website   = case when p_aceitar then coalesce(nullif(btrim(c.website), ''),   c.redes_sugeridas->>'website')   else c.website end,
    redes_sugeridas = null
   where c.id = any(p_ids) and c.redes_sugeridas is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aceitar_redes_sugeridas(uuid[], boolean) from public, anon;
grant execute on function public.aceitar_redes_sugeridas(uuid[], boolean) to authenticated;

select cron.unschedule('erp-clientes-redes') where exists (select 1 from cron.job where jobname = 'erp-clientes-redes');
select cron.schedule('erp-clientes-redes', '*/5 * * * *',
  $c$ select public.chamar_funcao('clientes-redes', '{"acao":"lote"}'::jsonb, 120000)
      where exists (select 1 from public.clientes_para_redes(1)) $c$);
