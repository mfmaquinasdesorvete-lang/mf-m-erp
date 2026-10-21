-- OP com tornearia e mecânica separadas (pedido de 19/10) e o desenho técnico da peça:
--  * ordens_producao.setor: máquinas, tornearia ou mecânica (vazio = a tela escolhe pelo produto);
--  * produtos_midia aceita o tipo "desenho" (desenho técnico, só de uso interno: não vai para a área do cliente).
alter table public.ordens_producao add column if not exists setor text;
alter table public.ordens_producao drop constraint if exists ordens_producao_setor_check;
alter table public.ordens_producao add constraint ordens_producao_setor_check check (setor is null or setor in ('maquinas', 'tornearia', 'mecanica'));

alter table public.produtos_midia drop constraint if exists produtos_midia_tipo_check;
alter table public.produtos_midia add constraint produtos_midia_tipo_check check (tipo in ('foto', 'video', 'manual', 'eletrico', 'dicas', 'outro', 'desenho'));
