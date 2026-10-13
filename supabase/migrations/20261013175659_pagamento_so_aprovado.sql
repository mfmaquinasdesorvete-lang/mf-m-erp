-- Conta a pagar só é paga depois da aprovação (fluxo de aprovação): quem está no ERP não consegue marcar "Pagar",
-- "Agendar" nem registrar a baixa (sozinha ou em lote) de uma conta em revisão, devolvida ou rejeitada. "Não pagar"
-- continua livre. A conciliação com o extrato continua registrando o pagamento (o dinheiro já saiu do banco); a conta
-- fica "paga, falta aprovar" para o revisor ver. Contas aprovadas e anteriores ao fluxo seguem como antes. Só acrescenta.

-- sem security definer: precisa saber quem está mexendo (current_user)
create or replace function public.trg_pagamento_aprovado()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  -- pessoa na tela: direto na tabela ou pelas funções de baixa e de decisão (que marcam erp.acao_usuario)
  v_pessoa boolean := current_user in ('authenticated', 'anon') or coalesce(current_setting('erp.acao_usuario', true), '') = 'on';
begin
  if not v_pessoa or coalesce(new.revisao, 'historico') in ('aprovado', 'historico') then return new; end if;
  if new.status = 'pago' and (tg_op = 'INSERT' or old.status is distinct from 'pago') then
    raise exception '"%" ainda não foi aprovada: o pagamento só pode ser registrado depois da aprovação (Financeiro → Aprovações).', new.descricao;
  end if;
  if new.status = 'aberto' and new.decisao in ('pagar', 'agendado')
     and (tg_op = 'INSERT' or new.decisao is distinct from old.decisao or new.pagar_em is distinct from old.pagar_em) then
    raise exception '"%" ainda não foi aprovada: só dá para pagar ou agendar depois da aprovação (Financeiro → Aprovações).', new.descricao;
  end if;
  return new;
end $function$;

-- depois da revisão (trg_zr_revisao_conta), que pode devolver a conta para a revisão na mesma alteração
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_zs_pagamento_aprovado' and tgrelid = 'public.contas_pagar'::regclass) then
    create trigger trg_zs_pagamento_aprovado before insert or update on public.contas_pagar
      for each row execute function public.trg_pagamento_aprovado();
  end if;
end $$;
