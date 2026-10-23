-- Ordens de compra do Tiny: ID e nº do Tiny em campo próprio (antes só no texto das observações), preenchidos sozinhos
-- quando a OC entra pelo backup; um índice impede a mesma OC do Tiny duas vezes. Só acréscimos; nenhum dado muda aqui.
-- (Dados, com a conferência da usuária em 23/10: as 221 OC do Tiny ganharam a Data, o ID e o nº do Tiny; e os 81 clientes
-- com notas da My Frost sem a etiqueta ganharam a etiqueta my_frost.)

alter table public.pedidos_compra add column if not exists id_externo text;
alter table public.pedidos_compra add column if not exists numero_externo text;
create unique index if not exists pedidos_compra_id_externo_uniq on public.pedidos_compra (id_externo) where id_externo is not null;

-- OC que entra com o texto da importação do Tiny ("Importado do Tiny: ordem de compra nº 181 de 23/10/2025 … (Tiny 922767703)")
create or replace function public.trg_oc_tiny_ids()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.observacoes, '') like 'Importado do Tiny%' then
    new.id_externo := coalesce(new.id_externo, 'tiny:oc:' || substring(new.observacoes from '\(Tiny (\d+)\)'));
    new.numero_externo := coalesce(new.numero_externo, substring(new.observacoes from 'ordem de compra nº (\d+)'));
    -- a OC do Tiny entra com a data do Tiny na criação; o campo Data tem hoje como padrão, então vale a do Tiny
    new.data := (new.created_at at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end $$;
create or replace trigger trg_oc_tiny_ids before insert on public.pedidos_compra for each row execute function public.trg_oc_tiny_ids();
