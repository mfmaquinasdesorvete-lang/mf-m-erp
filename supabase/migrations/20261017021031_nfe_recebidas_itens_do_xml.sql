-- Nota de fornecedor com o XML e sem a lista de itens (histórico do sistema anterior: importada pelo XML e marcada
-- "já lançada no sistema anterior", que não passa pela leitura dos itens): a lista sai do XML já indexado em
-- nfe_recebida_itens. Serve aos impostos (créditos das entradas no Analista fiscal) e ao Painel do contador (entradas
-- por CFOP). Não muda o processamento: não lança estoque, não lança contas a pagar e não avisa ninguém.
create or replace function public.preencher_itens_nota(p_nfe uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update nfe_recebidas r set itens = (
      select jsonb_agg(jsonb_build_object('numero', i.numero, 'codigo', i.codigo, 'ean', i.ean, 'descricao', i.descricao, 'ncm', i.ncm, 'cfop', i.cfop,
               'unidade', i.unidade, 'quantidade', i.quantidade, 'valor_unitario', i.valor_unitario, 'valor_total', i.valor_total) order by i.numero)
        from nfe_recebida_itens i where i.nfe_id = r.id)
   where r.id = p_nfe and (r.itens is null or jsonb_typeof(r.itens) <> 'array' or jsonb_array_length(r.itens) = 0)
     and exists (select 1 from nfe_recebida_itens i where i.nfe_id = r.id);
  return found;
end $$;
revoke execute on function public.preencher_itens_nota(uuid) from public, anon, authenticated;

-- ao gravar o XML: indexa os itens (como antes) e, se a nota ainda não tem a lista, preenche
create or replace function public.trg_nfe_recebida_itens()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.xml is null then return null; end if;
  if tg_op = 'UPDATE' and new.xml is not distinct from old.xml then return null; end if;
  begin
    perform public.indexar_itens_nota(new.id);
    perform public.preencher_itens_nota(new.id);
  exception when others then
    raise warning 'itens da nota %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
