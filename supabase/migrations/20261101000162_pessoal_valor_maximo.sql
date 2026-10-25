-- Painel pessoal: lançamento de 10 milhões ou mais é engano (telefone ou documento lido como valor) e estraga os
-- totais. NOT VALID: vale para o que entrar ou mudar daqui em diante (o engano antigo fica anulado, como está).
alter table public.pessoal_lancamentos
  add constraint pessoal_lancamentos_valor_maximo check (abs(valor) < 10000000) not valid;
