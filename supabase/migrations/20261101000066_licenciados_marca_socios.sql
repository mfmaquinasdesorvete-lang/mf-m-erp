-- My Frost Sorveterias (pedido de 19/10): a marca de cada unidade (My Frost ou Yozzy, de Guarujá/SP e Natal/RN)
-- e os sócios de cada unidade, com a participação (%) e o contato. As unidades com "Yozzy" no nome ficam marcadas.
alter table public.licenciados_lojas add column if not exists marca text not null default 'myfrost';
alter table public.licenciados_lojas drop constraint if exists licenciados_lojas_marca_check;
alter table public.licenciados_lojas add constraint licenciados_lojas_marca_check check (marca in ('myfrost', 'yozzy'));
alter table public.licenciados_lojas add column if not exists socios jsonb not null default '[]'::jsonb;
alter table public.licenciados_lojas drop constraint if exists licenciados_lojas_socios_check;
alter table public.licenciados_lojas add constraint licenciados_lojas_socios_check check (jsonb_typeof(socios) = 'array' and jsonb_array_length(socios) <= 12);
update public.licenciados_lojas set marca = 'yozzy' where nome ilike '%yozzy%' and marca <> 'yozzy';
