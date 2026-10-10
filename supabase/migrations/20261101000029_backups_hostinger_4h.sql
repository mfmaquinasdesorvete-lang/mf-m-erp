-- Aviso "Cópia do backup não chegou na Hostinger" com 4 horas em vez de 8: a conferência roda às 09:07 (Brasília),
-- umas 7 horas depois do backup, e a Hostinger tenta baixar às 05:20 e às 08:20. Com 8 horas o aviso nunca saía.
create or replace function public.conferir_backups()
returns void language plpgsql security definer set search_path = public as $$
declare v_ultimo backups_registro;
begin
  select * into v_ultimo from backups_registro where status = 'ok' order by created_at desc limit 1;
  if v_ultimo.id is null or v_ultimo.created_at < now() - interval '30 hours' then
    perform public.notificar('outro', 'Backup diário atrasado',
      case when v_ultimo.id is null then 'Nenhum backup feito ainda' else 'Último backup em ' || to_char(v_ultimo.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') end,
      '/configuracoes', '{financeiro}', null);
  elsif v_ultimo.hostinger_em is null and v_ultimo.created_at < now() - interval '4 hours' then
    perform public.notificar('outro', 'Cópia do backup não chegou na Hostinger',
      'O backup de ' || to_char(v_ultimo.created_at at time zone 'America/Sao_Paulo', 'DD/MM') || ' foi feito, mas a Hostinger não baixou',
      '/configuracoes', '{financeiro}', null);
  end if;
end $$;

revoke execute on function public.conferir_backups() from public, anon, authenticated;
