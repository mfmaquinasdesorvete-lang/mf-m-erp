-- Quiosques (pedido de 22/10): a nota de fornecedor que chega de uma loja que já vendeu para os quiosques
-- (mesmo CNPJ de uma nota com o marcador "Quiosques": Compensados Fernandes, Madeiragreen, GMAD, J.F. Compensados…)
-- já entra com o marcador, para aparecer sozinha em Sorveterias → Quiosques.
create or replace function public.nfe_recebida_marcar_quiosque()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_marca uuid;
begin
  if new.emitente_cnpj is null then return new; end if;
  select id into v_marca from public.marcadores where lower(btrim(nome)) in ('quiosques', 'quiosque') limit 1;
  if v_marca is null or coalesce(new.marcadores, '{}') @> array[v_marca] then return new; end if;
  if exists (select 1 from public.nfe_recebidas n
             where n.emitente_cnpj = new.emitente_cnpj and n.id <> new.id and n.excluida_em is null
               and coalesce(n.marcadores, '{}') @> array[v_marca]) then
    new.marcadores := array_append(coalesce(new.marcadores, '{}'), v_marca);
  end if;
  return new;
end $$;

drop trigger if exists nfe_recebida_marcar_quiosque on public.nfe_recebidas;
create trigger nfe_recebida_marcar_quiosque before insert on public.nfe_recebidas
  for each row execute function public.nfe_recebida_marcar_quiosque();
