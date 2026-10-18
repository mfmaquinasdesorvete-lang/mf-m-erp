set lock_timeout = '8s';

-- Unidades que emitem boleto pelo Inter (para mostrar o botão Boleto a vendas e financeiro sem abrir os dados da conta do Inter)
create or replace function public.unidades_com_boleto_inter()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct cb.unidade_id
    from inter_conexoes c join contas_bancarias cb on cb.id = c.conta_bancaria_id
   where c.boletos and c.status <> 'desligada' and cb.unidade_id is not null
     and public.tem_papel('financeiro', 'vendas');
$$;
revoke execute on function public.unidades_com_boleto_inter() from public, anon;

-- Conta a receber recebida por fora ou cancelada com boleto do Inter ainda em aberto: avisa o financeiro para cancelar
-- o boleto (senão o cliente pode pagar duas vezes). A baixa feita pelo próprio boleto não avisa (o boleto já está pago).
create or replace function public.trg_conta_boleto_aberto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_qtd int;
begin
  if old.status = 'aberto' and new.status in ('pago', 'cancelado') then
    select count(*) into v_qtd from boletos_inter
     where conta_receber_id = new.id and situacao in ('EM_PROCESSAMENTO', 'A_RECEBER', 'ATRASADO', 'PROTESTO');
    if v_qtd > 0 then
      perform public.notificar('pagamento', 'Cancele o boleto do Inter desta conta',
        concat_ws(' · ', new.descricao, case when new.status = 'pago' then 'recebida por outro meio' else 'conta cancelada' end,
          'o boleto continua valendo no banco'), '/financeiro?aba=receber', '{financeiro}', new.unidade_id);
    end if;
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke execute on function public.trg_conta_boleto_aberto() from public, anon, authenticated;
