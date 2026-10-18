-- Link da página do cliente com o nome: /cliente/atacarejo-naveca-3f9a1c7b20de. O fim (12 letras e números
-- sorteados) é o que protege: só o nome não abre nada. Nunca CNPJ/CPF, que qualquer um poderia adivinhar.
-- O link antigo (/cliente/<código comprido>) continua abrindo. O link fica fixo: mudar o nome do cliente não muda o link.
alter table public.clientes add column if not exists portal_link text;

create or replace function public.gerar_portal_link(p_nome text)
returns text language sql volatile set search_path = public as $$
  select coalesce(nullif(left(btrim(regexp_replace(public.sem_acento(coalesce(p_nome, '')), '[^a-z0-9]+', '-', 'g'), '-'), 40), ''), 'cliente')
         || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

update public.clientes set portal_link = public.gerar_portal_link(coalesce(nullif(btrim(nome_fantasia), ''), nome))
 where portal_link is null;
create unique index if not exists clientes_portal_link on public.clientes (portal_link);

create or replace function public.trg_cliente_portal_link()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.portal_link is null then
    new.portal_link = public.gerar_portal_link(coalesce(nullif(btrim(new.nome_fantasia), ''), new.nome));
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_cliente_portal_link' and tgrelid = 'public.clientes'::regclass) then
    create trigger trg_cliente_portal_link before insert on public.clientes for each row execute function public.trg_cliente_portal_link();
  end if;
end $$;

-- abre pela parte do link com o nome; devolve também o código interno (o botão de pagar com cartão usa)
create or replace function public.area_cliente_link(p_link text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.area_cliente(c.portal_token) || jsonb_build_object('token', c.portal_token)
    from clientes c where c.portal_link = lower(btrim(p_link));
$$;
revoke execute on function public.area_cliente_link(text) from public;
grant execute on function public.area_cliente_link(text) to anon, authenticated;

-- régua de cobrança: a mensagem passa a levar o link com o nome
create or replace function public.dados_cobranca(p_conta uuid, p_etapa uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'etapa', e.nome, 'assunto', e.assunto, 'mensagem', e.mensagem, 'conta_id', r.id,
    'descricao', r.descricao, 'valor', coalesce(case when r.status = 'pago' then r.valor_pago end, r.valor), 'vencimento', r.vencimento,
    'dias_atraso', greatest(current_date - r.vencimento, 0), 'forma', r.forma_pagamento,
    'pagamento', u.instrucoes_pagamento,
    'pix', case when nullif(btrim(u.pix_chave), '') is null or r.status <> 'aberto' then null
                else jsonb_build_object('chave', u.pix_chave, 'nome', coalesce(nullif(btrim(u.pix_nome), ''), u.razao_social, u.nome),
                                        'cidade', coalesce(nullif(btrim(u.pix_cidade), ''), u.municipio)) end,
    'link', case when cfg.site_url is not null then rtrim(cfg.site_url, '/') || '/cliente/' || coalesce(c.portal_link, c.portal_token::text) end)
  from contas_receber r
  join regua_cobranca e on e.id = p_etapa
  left join clientes c on c.id = r.cliente_id
  left join unidades u on u.id = r.unidade_id
  left join configuracoes cfg on cfg.id = 1
  where r.id = p_conta
$$;
