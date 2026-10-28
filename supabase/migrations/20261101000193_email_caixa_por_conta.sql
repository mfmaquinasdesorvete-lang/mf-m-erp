-- Caixa de e-mail (28/10): cada conta sincroniza na sua própria chamada da função email-caixa. A conta nova do Gmail
-- ("Comercial - Fornecedores") estourava o limite de CPU a cada 5 minutos e derrubava a rodada inteira; as outras
-- contas (inclusive a dos extratos OFX) ficaram sem sincronizar. A função agora lê poucos e-mails por rodada e grava o
-- progresso a cada e-mail (email-caixa.ts).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'erp-email-caixa'),
  command := $$ select public.chamar_funcao('email-caixa', jsonb_build_object('acao', 'sincronizar', 'conta_id', id), 120000) from public.email_contas where ativo $$
);
