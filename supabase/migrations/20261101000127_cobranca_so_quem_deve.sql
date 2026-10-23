-- Cobrança só de quem deve (pedido da usuária, 23/10): "Não coloque em cobrança. Se não teve o pagamento, a
-- mercadoria não foi, ou ela foi e saiu NF transporte." Fica fora do lembrete e da cobrança ao cliente (tela,
-- envio automático e aviso na criação):
--  * parcela no cartão (quem paga é a maquininha; migração 000126);
--  * conta de pedido cancelado ou excluído;
--  * conta de pedido sem NF de venda autorizada (só remessa/transporte, ou ainda sem nota).
-- Conta sem pedido (OS, serviço, lançamento à mão) continua na régua. O obrigado do pagamento continua.

-- a conta entra na cobrança do cliente?
create or replace function public.conta_receber_cobravel(c public.contas_receber)
returns boolean language sql stable set search_path = public as $$
  select coalesce(c.forma_pagamento, '') <> 'cartao'
     and (c.pedido_id is null
          or exists (
            select 1 from public.pedidos p
             where p.id = c.pedido_id and p.status <> 'cancelado' and p.excluida_em is null
               and exists (
                 select 1 from public.notas_fiscais n, jsonb_array_elements(coalesce(n.payload->'items', '[]'::jsonb)) i
                  where n.pedido_id = p.id and n.status = 'autorizada' and n.excluida_em is null
                    and regexp_replace(coalesce(i->>'cfop', ''), '\D', '', 'g') ~ '^[567](10[0-9]|11[0-9]|12[0-5]|40[1-5])$')))
$$;

-- contas em aberto que ficam fora da cobrança (a tela Cobrança tira essas da fila e da situação dos clientes)
create or replace function public.contas_receber_fora_cobranca()
returns setof uuid language sql stable set search_path = public as $$
  select c.id from public.contas_receber c where c.status = 'aberto' and not public.conta_receber_cobravel(c)
$$;
revoke execute on function public.contas_receber_fora_cobranca() from public, anon;
grant execute on function public.contas_receber_fora_cobranca() to authenticated;

create or replace function public.gerar_cobrancas_regua()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare e record; r record; n int := 0;
begin
  for e in select * from regua_cobranca where ativo and canal_email and evento = 'vencimento' order by ordem loop
    for r in select c.id from contas_receber c where c.status = 'aberto' and c.cliente_id is not null and c.vencimento + e.dias = current_date
              and public.conta_receber_cobravel(c) loop
      if public.cobrar_por_email(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  for e in select * from regua_cobranca where ativo and canal_whatsapp and evento = 'vencimento' order by ordem loop
    for r in select c.id from contas_receber c where c.status = 'aberto' and c.cliente_id is not null and c.vencimento + e.dias = current_date
              and public.conta_receber_cobravel(c) loop
      if public.cobrar_por_whatsapp(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $function$;

create or replace function public.trg_regua_criacao()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare e record;
begin
  if new.status = 'aberto' and new.cliente_id is not null and public.conta_receber_cobravel(new) then
    for e in select id, canal_email, canal_whatsapp from regua_cobranca where ativo and evento = 'criacao' loop
      if e.canal_email then perform public.cobrar_por_email(new.id, e.id); end if;
      if e.canal_whatsapp then perform public.cobrar_por_whatsapp(new.id, e.id); end if;
    end loop;
  end if;
  return null;
end $function$;
