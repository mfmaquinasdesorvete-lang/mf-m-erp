-- Compras feitas em marketplaces (Mercado Livre, TikTok Shop, Shopee…): a NF-e da loja traz o intermediador
-- (grupo infIntermed: CNPJ do marketplace e o usuário da loja nele) e às vezes o número do pedido.
-- Também entram as notas que citam o marketplace no texto. Só leitura; o nome do marketplace a tela resolve.
create or replace function public.compras_marketplace()
returns table (nota_id uuid, intermediador_cnpj text, loja_usuario text, pedido text, citado text)
language sql stable security definer set search_path = public as $f$
  select n.id,
    (regexp_match(n.xml, '<infIntermed>\s*<CNPJ>(\d{14})</CNPJ>'))[1],
    (regexp_match(n.xml, '<infIntermed>.*?<idCadIntTran>([^<]*)</idCadIntTran>'))[1],
    (regexp_match(n.xml, 'pedido[^0-9<]{0,20}(\d{6,20})', 'i'))[1],
    lower((regexp_match(n.xml, '(tik\s*tok|bytedance|shopee|amazon|mercado\s*livre|mercadolivre|aliexpress|shein|temu|magalu)', 'i'))[1])
  from nfe_recebidas n
  where public.is_erp_user() and n.excluida_em is null and n.xml is not null
    and (n.xml like '%<infIntermed>%' or n.xml ~* '(tik\s*tok|bytedance|shopee|mercado\s*livre|mercadolivre)')
$f$;
revoke all on function public.compras_marketplace() from public, anon;
grant execute on function public.compras_marketplace() to authenticated;
