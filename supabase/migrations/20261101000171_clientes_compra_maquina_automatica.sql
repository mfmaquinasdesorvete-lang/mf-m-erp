-- "Compra da máquina" do cadastro do cliente preenchida sozinha: quando uma máquina com data de venda é ligada ao
-- cliente (venda, nota, importação ou unificação), o campo recebe a data mais recente das máquinas dele.
-- Só preenche quando está vazio ou troca por uma data mais nova (compra de outra máquina); nunca apaga o campo.
create or replace function public.trg_equipamento_compra_maquina()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null and new.data_venda is not null then
    update clientes set compra_maquina_em = new.data_venda
     where id = new.cliente_id and (compra_maquina_em is null or compra_maquina_em < new.data_venda);
  end if;
  return new;
end $$;

drop trigger if exists equipamento_compra_maquina on public.equipamentos;
create trigger equipamento_compra_maquina
  after insert or update of cliente_id, data_venda on public.equipamentos
  for each row execute function public.trg_equipamento_compra_maquina();

-- os que já têm máquina com data e estão com o campo vazio
update public.clientes c set compra_maquina_em = m.d
  from (select cliente_id, max(data_venda) d from public.equipamentos where data_venda is not null group by cliente_id) m
 where m.cliente_id = c.id and c.compra_maquina_em is null;
