-- Mercado Livre com PKCE: o segredo de uso único (code_verifier) criado no "Conectar" fica guardado com o estado do
-- pedido de conexão; só o desafio vai no link. O app com PKCE ligado recusa a troca do código sem ele
-- ("code_verifier is a required parameter"). Somente acréscimo; a tabela continua sem acesso pela tela.
alter table public.ml_oauth_estados add column if not exists verificador text check (verificador is null or verificador ~ '^[A-Za-z0-9_-]{43,128}$');
comment on column public.ml_oauth_estados.verificador is 'PKCE: code_verifier do pedido de conexão (só a função mercadolivre lê; apagado no retorno)';
