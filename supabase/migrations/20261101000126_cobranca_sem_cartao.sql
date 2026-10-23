-- Parcela no cartão não entra na cobrança do cliente (WhatsApp e e-mail): quem paga é a maquininha.
-- Vale para o envio do dia (vencimento) e para o aviso na criação da conta; o obrigado do pagamento continua.

create or replace function public.gerar_cobrancas_regua()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare e record; r record; n int := 0;
begin
  for e in select * from regua_cobranca where ativo and canal_email and evento = 'vencimento' order by ordem loop
    for r in select id from contas_receber where status = 'aberto' and cliente_id is not null and vencimento + e.dias = current_date
              and coalesce(forma_pagamento, '') <> 'cartao' loop
      if public.cobrar_por_email(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  for e in select * from regua_cobranca where ativo and canal_whatsapp and evento = 'vencimento' order by ordem loop
    for r in select id from contas_receber where status = 'aberto' and cliente_id is not null and vencimento + e.dias = current_date
              and coalesce(forma_pagamento, '') <> 'cartao' loop
      if public.cobrar_por_whatsapp(r.id, e.id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $function$;

create or replace function public.trg_regua_criacao()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare e record;
begin
  if new.status = 'aberto' and new.cliente_id is not null and coalesce(new.forma_pagamento, '') <> 'cartao' then
    for e in select id, canal_email, canal_whatsapp from regua_cobranca where ativo and evento = 'criacao' loop
      if e.canal_email then perform public.cobrar_por_email(new.id, e.id); end if;
      if e.canal_whatsapp then perform public.cobrar_por_whatsapp(new.id, e.id); end if;
    end loop;
  end if;
  return null;
end $function$;
