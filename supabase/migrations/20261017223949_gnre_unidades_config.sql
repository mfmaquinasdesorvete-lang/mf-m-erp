set lock_timeout = '8s';
alter table public.unidades add column if not exists gnre_automatica boolean not null default true;
alter table public.unidades add column if not exists gnre_ufs_inscritas text[] not null default '{}';
comment on column public.unidades.gnre_automatica is 'Lançar sozinho a conta da GNRE (DIFAL/FCP/ICMS-ST) quando a NF-e para outro estado sai autorizada';
comment on column public.unidades.gnre_ufs_inscritas is 'UFs onde a unidade tem inscrição de substituto tributário (IE-ST): o imposto vai na apuração mensal, sem GNRE por nota';
