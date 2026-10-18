set lock_timeout = '8s';
create trigger trg_conta_boleto_aberto after update of status on public.contas_receber
  for each row execute function public.trg_conta_boleto_aberto();
