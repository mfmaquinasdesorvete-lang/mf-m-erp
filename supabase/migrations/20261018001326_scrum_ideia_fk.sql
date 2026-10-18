set lock_timeout = '8s';
alter table public.scrum_itens drop constraint if exists scrum_itens_ideia_fk;
alter table public.scrum_itens add constraint scrum_itens_ideia_fk foreign key (ideia_id) references public.projeto_itens(id) on delete set null not valid;
