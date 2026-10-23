-- Notas da My Frost pelo backup de XML (23/10, com o ok da usuária): o backup tem as 2.071 NF-e e eventos da My Frost.
-- As 1.409 que já estavam aqui batem (número, data e valor). Entram as 188 válidas que faltavam e as 119 canceladas,
-- para a sequência de números ficar explicada ao contador.
-- Nota sem cliente no ERP (fornecedor, ou destinatário que nunca foi cliente) e nota cancelada ficam sem cliente_id:
-- assim não aparecem na ficha do cliente nem contam em "cliente desde". Cada nota guarda a chave, se é de entrada ou
-- saída, o CPF/CNPJ e o nome do destinatário e quantas cartas de correção teve.

alter table public.notas_legado alter column cliente_id drop not null;
alter table public.notas_legado add column if not exists situacao text not null default 'autorizada';
alter table public.notas_legado add column if not exists chave text;
alter table public.notas_legado add column if not exists tipo text;
alter table public.notas_legado add column if not exists dest_doc text;
alter table public.notas_legado add column if not exists dest_nome text;
alter table public.notas_legado add column if not exists cartas_correcao smallint not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notas_legado_situacao') then
    alter table public.notas_legado add constraint notas_legado_situacao check (situacao in ('autorizada', 'cancelada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notas_legado_tipo') then
    alter table public.notas_legado add constraint notas_legado_tipo check (tipo is null or tipo in ('entrada', 'saida'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notas_legado_chave') then
    alter table public.notas_legado add constraint notas_legado_chave check (chave is null or chave ~ '^\d{44}$');
  end if;
  -- nota cancelada não fica na ficha do cliente
  if not exists (select 1 from pg_constraint where conname = 'notas_legado_cancelada_sem_cliente') then
    alter table public.notas_legado add constraint notas_legado_cancelada_sem_cliente check (situacao <> 'cancelada' or cliente_id is null);
  end if;
end $$;
create unique index if not exists notas_legado_chave_unica on public.notas_legado (chave) where chave is not null;
create index if not exists notas_legado_dest_doc on public.notas_legado (dest_doc) where dest_doc is not null;

comment on column public.notas_legado.situacao is 'autorizada ou cancelada (pelo evento de cancelamento do backup de XML)';
comment on column public.notas_legado.cliente_id is 'cliente do ERP; vazio quando o destinatário não é cliente ou a nota foi cancelada';
