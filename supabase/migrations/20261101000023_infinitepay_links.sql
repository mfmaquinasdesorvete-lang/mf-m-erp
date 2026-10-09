-- Cobrança por link de pagamento da InfinitePay (Pix ou cartão em até 12x).
--  * cada unidade tem a sua conta na InfinitePay, identificada pela InfiniteTag (o "$" da conta, sem o $);
--  * o ERP cria o link para uma conta a receber (função infinitepay) e guarda aqui;
--  * a InfinitePay avisa a função quando o pagamento é aprovado; a função confere o pagamento direto na
--    InfinitePay (o aviso não vem assinado) e só então chama confirmar_cobranca_link, que dá baixa na conta.

alter table public.unidades add column if not exists infinitepay_tag text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'unidades_infinitepay_tag_valida') then
    alter table public.unidades add constraint unidades_infinitepay_tag_valida
      check (infinitepay_tag is null or infinitepay_tag ~ '^[a-z0-9][a-z0-9._-]{1,60}$');
  end if;
end $$;

create table if not exists public.cobrancas_link (
  id uuid primary key default gen_random_uuid(),
  conta_receber_id uuid references public.contas_receber(id) on delete set null,
  unidade_id uuid references public.unidades(id),
  provedor text not null default 'infinitepay',
  handle text not null,
  descricao text not null,
  valor numeric(14,2) not null,
  url text,
  status text not null default 'aberto',
  transaction_nsu text,
  slug text,
  metodo text,
  parcelas integer,
  valor_pago numeric(14,2),
  recibo_url text,
  pago_em timestamptz,
  baixa_em timestamptz,
  erro text,
  aviso jsonb,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cobrancas_link_status_valido') then
    alter table public.cobrancas_link add constraint cobrancas_link_status_valido check (status in ('aberto', 'pago', 'descartado', 'erro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cobrancas_link_valor_positivo') then
    alter table public.cobrancas_link add constraint cobrancas_link_valor_positivo check (valor > 0);
  end if;
end $$;
create index if not exists cobrancas_link_conta_idx on public.cobrancas_link (conta_receber_id);
create unique index if not exists cobrancas_link_nsu_idx on public.cobrancas_link (provedor, transaction_nsu) where transaction_nsu is not null;

alter table public.cobrancas_link enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cobrancas_link' and policyname = 'erp_select') then
    create policy erp_select on public.cobrancas_link for select using (public.tem_papel('financeiro', 'vendas'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cobrancas_link' and policyname = 'contador_select') then
    create policy contador_select on public.cobrancas_link for select using (public.e_contador());
  end if;
end $$;
-- gravação só pela função (service role) e pelas rotinas abaixo
revoke insert, update, delete on public.cobrancas_link from anon, authenticated;

-- Pagamento aprovado e conferido na InfinitePay: registra no link e dá baixa na conta a receber.
-- Chamada só pela função infinitepay (service role). Repetir o mesmo aviso não faz nada.
create or replace function public.confirmar_cobranca_link(p_id uuid, p_nsu text, p_slug text, p_metodo text,
  p_parcelas integer, p_valor_pago numeric, p_recibo text, p_aviso jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l cobrancas_link; c contas_receber; v_banco uuid; v_forma text; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into l from cobrancas_link where id = p_id for update;
  if l.id is null then return 'link não encontrado'; end if;
  if l.status = 'pago' then return 'já registrado'; end if;

  update cobrancas_link set status = 'pago', transaction_nsu = p_nsu, slug = p_slug, metodo = p_metodo, parcelas = p_parcelas,
         valor_pago = p_valor_pago, recibo_url = p_recibo, aviso = p_aviso, pago_em = now(), erro = null
   where id = p_id;

  if l.conta_receber_id is null then return 'pago (sem conta ligada)'; end if;
  select * into c from contas_receber where id = l.conta_receber_id for update;
  if c.id is null or c.status <> 'aberto' then
    update cobrancas_link set erro = 'A conta não estava mais em aberto: confira se o cliente pagou duas vezes.' where id = p_id;
    perform public.notificar('pagamento', 'Link pago, mas a conta não estava em aberto', concat_ws(' · ', l.descricao, public.brl(p_valor_pago)),
      '/financeiro', '{financeiro}', l.unidade_id);
    return 'conta não estava em aberto';
  end if;
  if round(l.valor, 2) < round(c.valor, 2) then
    update cobrancas_link set erro = 'O link era de ' || public.brl(l.valor) || ' e a conta está em ' || public.brl(c.valor) || ': dê a baixa manual.' where id = p_id;
    perform public.notificar('pagamento', 'Link pago com valor menor que a conta', concat_ws(' · ', l.descricao, public.brl(l.valor)),
      '/financeiro', '{financeiro}', l.unidade_id);
    return 'valor menor que a conta';
  end if;

  select id into v_banco from contas_bancarias where ativo and banco = 'infinitepay' and unidade_id = c.unidade_id order by created_at limit 1;
  v_forma := case when lower(coalesce(p_metodo, '')) = 'pix' then 'pix' else 'cartao' end;
  begin
    update contas_receber set status = 'pago', data_pagamento = v_hoje, valor_pago = c.valor, forma_pagamento = v_forma,
           conta_bancaria_id = coalesce(c.conta_bancaria_id, v_banco),
           motivo_alteracao = 'Pago pelo link InfinitePay (' || case when v_forma = 'pix' then 'Pix' else 'cartão' ||
             case when coalesce(p_parcelas, 1) > 1 then ' em ' || p_parcelas || 'x' else '' end end || ', NSU ' || coalesce(p_nsu, '?') || ')'
     where id = c.id;
    update cobrancas_link set baixa_em = now() where id = p_id;
  exception when others then
    update cobrancas_link set erro = 'Pagamento recebido, mas a baixa não foi feita: ' || sqlerrm where id = p_id;
    perform public.notificar('pagamento', 'Link pago: falta dar baixa', concat_ws(' · ', l.descricao, sqlerrm), '/financeiro', '{financeiro}', l.unidade_id);
    return 'baixa não feita: ' || sqlerrm;
  end;
  return 'baixa feita';
end $$;
revoke execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_cobranca_link(uuid, text, text, text, integer, numeric, text, jsonb) to service_role;

-- Tirar um link da tela (o link continua valendo na InfinitePay; se for pago, o ERP registra igual).
create or replace function public.descartar_cobranca_link(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro', 'vendas');
  update cobrancas_link set status = 'descartado' where id = p_id and status in ('aberto', 'erro');
end $$;
revoke execute on function public.descartar_cobranca_link(uuid) from public, anon;
grant execute on function public.descartar_cobranca_link(uuid) to authenticated;
