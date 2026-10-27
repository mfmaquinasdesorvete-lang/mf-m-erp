-- O gatilho também roda em notas_fiscais_xml, que não tem a coluna id: ler o campo pelo jsonb para não dar erro ao guardar o XML.
-- (aplicada no banco em 27/10/2026 como 20261027231248)
create or replace function public.trg_maquinas_da_nota()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nota uuid := coalesce(to_jsonb(new)->>'nota_id', to_jsonb(new)->>'id')::uuid;
begin
  begin
    perform public.registrar_maquinas_da_nota(v_nota);
  exception when others then
    raise warning 'máquinas da nota %: %', coalesce(v_nota::text, ''), sqlerrm;
  end;
  return null;
end $$;
