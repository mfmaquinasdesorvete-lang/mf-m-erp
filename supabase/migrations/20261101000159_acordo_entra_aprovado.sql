-- Parcela de acordo de renegociação entra já aprovada (decisão da usuária em 26/10): o acordo foi decidido ao
-- renegociar, então cada parcela não volta para a fila de Aprovações nem pede documento. Troca só o trecho abaixo no
-- texto atual de trg_revisao_conta (o resto continua igual).
do $$
declare d text; antes text; depois text;
begin
  d := pg_get_functiondef('public.trg_revisao_conta()'::regprocedure);
  if position('Parcela do acordo de renegociação' in d) > 0 then return; end if;
  antes := '    -- automático que passa nas validações entra aprovado';
  depois := '    -- parcela do acordo de renegociação: o acordo já foi decidido ao renegociar
    if tg_table_name = ''contas_pagar'' and to_jsonb(new)->>''negociacao_papel'' = ''acordo'' then
      new.revisao := ''aprovado'';
      new.revisao1_nome := ''Parcela do acordo de renegociação''; new.revisao1_em := now();
      return new;
    end if;
    -- automático que passa nas validações entra aprovado';
  if position(antes in d) = 0 then raise exception 'trg_revisao_conta mudou: confira o trecho'; end if;
  execute replace(d, antes, depois);
end $$;
