-- Minhas empresas: o quadro de sócios público da Receita (nome, qualificação e data de entrada), guardado quando a
-- pessoa clica em "Conferir na Receita". Só do dono, como o resto da tabela.
alter table public.pessoal_empresas add column if not exists socios jsonb;
