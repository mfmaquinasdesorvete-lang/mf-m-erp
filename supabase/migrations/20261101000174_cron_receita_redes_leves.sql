-- Os agendamentos da conferência com a Receita (a cada minuto) e da busca das redes (a cada 5 minutos) olhavam se
-- havia trabalho chamando clientes_para_receita/clientes_para_redes, que ordenam a tabela inteira (com um exists em
-- pedidos por cliente): 97 ms em média, até 8,6 s, em toda execução. A pergunta "tem alguém para conferir?" agora é
-- um exists simples, que para no primeiro que acha. A escolha de quem vai primeiro continua nas funções de antes.
create or replace function public.receita_tem_pendente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c
                  where c.arquivado_em is null and length(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g')) = 14
                    and (c.receita_em is null or c.receita_em < now() - interval '90 days'))
      or exists (select 1 from fornecedores f
                  where length(regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g')) = 14
                    and (f.receita_em is null or f.receita_em < now() - interval '90 days'))
$$;
revoke execute on function public.receita_tem_pendente() from public, anon, authenticated;

create or replace function public.redes_tem_pendente()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clientes c
   where c.redes_buscado_em is null
     and (nullif(btrim(c.instagram), '') is null or nullif(btrim(c.facebook), '') is null)
     and (nullif(btrim(c.website), '') is not null
          or (c.email ~* '@[a-z0-9-]+(\.[a-z0-9-]+)+'
              and c.email !~* '@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|bol|uol|terra|ig|globo|globomail|r7|zipmail|oi|aol|protonmail|gmx|mail|yandex|pop|superig|brturbo|click21|mercadolivre|mercadolibre|shopee|tiny|olist)\.')))
$$;
revoke execute on function public.redes_tem_pendente() from public, anon, authenticated;

select cron.alter_job((select jobid from cron.job where jobname = 'erp-clientes-receita'),
  command := $c$ select public.chamar_funcao('clientes-receita', '{"acao":"lote"}'::jsonb, 120000) where public.receita_tem_pendente() $c$);
select cron.alter_job((select jobid from cron.job where jobname = 'erp-clientes-redes'),
  command := $c$ select public.chamar_funcao('clientes-redes', '{"acao":"lote"}'::jsonb, 120000) where public.redes_tem_pendente() $c$);
