-- Aparência do ERP escolhida pela empresa (Sobre → Design): cor da marca e de cada área, fontes, logo do menu,
-- imagens no lugar dos ícones das áreas e os logos das marcas e das sorveterias My Frost. Vale para toda a equipe:
-- todo usuário do ERP lê (a regra de leitura de configuracoes) e só quem já pode mudar as configurações grava.
alter table public.configuracoes add column if not exists aparencia jsonb not null default '{}'::jsonb;
