set lock_timeout = '8s';
alter table public.gnre_guias add constraint gnre_guias_nota_fk foreign key (nota_fiscal_id) references public.notas_fiscais(id);
alter table public.gnre_guias add constraint gnre_guias_unidade_fk foreign key (unidade_id) references public.unidades(id);
alter table public.gnre_guias add constraint gnre_guias_conta_fk foreign key (conta_pagar_id) references public.contas_pagar(id);
