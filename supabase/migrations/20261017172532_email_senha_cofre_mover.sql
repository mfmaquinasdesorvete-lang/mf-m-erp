-- Move para o cofre (Vault) as senhas das caixas de e-mail que ainda estavam na tabela: o gatilho
-- trg_email_senha_cofre guarda cada uma no cofre e deixa email_contas.senha vazia. As Edge Functions de e-mail
-- já leem pela função email_senha.
update public.email_contas set senha = senha where senha <> '';
