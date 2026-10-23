-- Segurança (auditoria de 23/10, matriz de permissões #284): o Histórico (tabela auditoria) guarda o antes e o depois
-- de cada alteração. O contador não abre a ficha dos funcionários, mas pelo Histórico lia CPF, RG, PIS, salário,
-- conta e Pix deles; o financeiro e o contador também liam as alterações dos usuários do ERP (papéis, telefones,
-- o código de ligar o Telegram). Agora cada um lê no Histórico só o que poderia ler na própria tabela:
--   administrador: tudo;
--   financeiro: tudo, menos usuarios_erp (os usuários são só do administrador);
--   contador: tudo, menos usuarios_erp e funcionarios.
-- A regra de compras (notas recebidas, pedidos de compra, fornecedores e produtos) continua igual.
alter policy auditoria_select on public.auditoria using (
  (select public.is_erp_admin())
  or ((select public.tem_papel(variadic array['financeiro'])) and tabela <> 'usuarios_erp')
  or ((select public.e_contador()) and tabela not in ('usuarios_erp', 'funcionarios'))
);
