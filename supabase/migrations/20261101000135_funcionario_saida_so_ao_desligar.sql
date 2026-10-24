-- Data de saída automática só quando a pessoa é desligada agora (alteração de situação), no dia de Brasília.
-- Antes: qualquer cadastro novo já "desligado" e sem data ganhava a data de hoje (errado para ex-funcionários antigos,
-- cadastrados pelos documentos, cuja saída ainda não se sabe).
create or replace function public.trg_funcionarios_atualizado()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- desligou: sai das listas (técnicos, folha) mas o cadastro fica
  if tg_op = 'UPDATE' and new.situacao = 'desligado' and old.situacao is distinct from 'desligado'
     and new.data_desligamento is null then
    new.data_desligamento := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end $$;
