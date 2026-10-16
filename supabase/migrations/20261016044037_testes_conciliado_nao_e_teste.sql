-- =====================================================================
-- Apagar dados de teste: venda conciliada com o extrato do banco não é teste
--   A tela "Apagar dados de teste" (função testes_apagar) solta do extrato a conta que vai sair
--   e devolve a linha para "pendente" com a observação "Estava ligada a uma conta de teste apagada".
--   Se a linha do extrato estava CONCILIADA, o dinheiro entrou de verdade: a operação é barrada
--   e nada sai (pedido, conta, comissão ficam como estavam).
-- Somente acréscimos: função e gatilho novos.
-- =====================================================================
create or replace function public.trg_extrato_conciliado_nao_e_teste()
returns trigger language plpgsql set search_path = public as $$
declare v_conta text;
begin
  if old.status = 'conciliado' and old.conta_receber_id is not null and new.conta_receber_id is null
     and coalesce(new.observacao, '') like '%Estava ligada a uma conta de teste apagada%' then
    select descricao into v_conta from contas_receber where id = old.conta_receber_id;
    raise exception 'A conta "%" está conciliada com o extrato do banco (entrada de % em %): é dinheiro que entrou, não é teste. Ela não pode ser apagada em "Apagar dados de teste".',
      coalesce(v_conta, 'sem descrição'), public.brl(old.valor), to_char(old.data, 'DD/MM/YYYY');
  end if;
  return new;
end $$;

create or replace trigger trg_extrato_conciliado_nao_e_teste before update on public.extrato_lancamentos
  for each row execute function public.trg_extrato_conciliado_nao_e_teste();
