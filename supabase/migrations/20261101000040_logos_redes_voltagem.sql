-- Logo do técnico, foto do funcionário, redes sociais do cliente e voltagem da máquina vendida.
alter table public.tecnicos add column if not exists logo_url text;
alter table public.funcionarios add column if not exists foto_url text;
alter table public.clientes
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists tiktok text;
alter table public.equipamentos add column if not exists voltagem text;

-- Voltagem pela descrição do item do pedido (só onde está escrita; o resto fica para preencher na ficha)
update public.equipamentos e set voltagem = v.volt
  from (
    select e2.id, (array_agg(case
        when i.descricao ~* '380 ?v' then '380V'
        when i.descricao ~* 'trif' then '220V trifásica'
        when i.descricao ~* '220 ?v' then '220V'
        when i.descricao ~* '(127|110) ?v' then '127V'
      end) filter (where i.descricao ~* '(380|220|127|110) ?v|trif'))[1] as volt
    from public.equipamentos e2 join public.pedido_itens i on i.pedido_id = e2.pedido_id
    where e2.voltagem is null
    group by e2.id
  ) v
 where v.id = e.id and v.volt is not null;

-- Ficha cadastral (link para o cliente assinar): mostra e aceita as redes sociais. Troca só os trechos das listas
-- de campos nas funções que já estão no ar (sem reescrever o resto).
do $$
begin
  if position('instagram' in pg_get_functiondef('public.cliente_ficha'::regproc)) = 0 then
    execute replace(pg_get_functiondef('public.cliente_ficha'::regproc),
      '''whatsapp'', c.whatsapp, ''website'', c.website,',
      '''whatsapp'', c.whatsapp, ''website'', c.website, ''instagram'', c.instagram, ''facebook'', c.facebook, ''tiktok'', c.tiktok,');
  end if;
  if position('instagram' in pg_get_functiondef('public.ficha_cadastral_assinar'::regproc)) = 0 then
    execute replace(replace(pg_get_functiondef('public.ficha_cadastral_assinar'::regproc),
      '''municipio'', ''uf''];', '''municipio'', ''uf'', ''instagram'', ''facebook'', ''tiktok''];'),
      'uf = c.uf' || chr(10), 'uf = c.uf, instagram = c.instagram, facebook = c.facebook, tiktok = c.tiktok' || chr(10));
  end if;
end $$;
