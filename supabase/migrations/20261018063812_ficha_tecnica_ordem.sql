-- Ficha técnica: a ordem dos itens (arrastar para ordenar na tela). Vazio = depois dos ordenados.
alter table public.produto_componentes add column if not exists ordem integer;
comment on column public.produto_componentes.ordem is 'Ordem do item na ficha técnica (arrastar na tela das Máquinas e da Produção). Vazio vai para o fim.';
