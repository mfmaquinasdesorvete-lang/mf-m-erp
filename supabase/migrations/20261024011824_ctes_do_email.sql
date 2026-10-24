-- CT-e de 2025 e 2026 que chegaram por e-mail (Gmail da MF: o texto de cada e-mail traz chave, data, valor, destinatário
-- e a forma de pagamento): ctes_do_email grava cada um pela salvar_cte_sefaz (o que já veio da planilha ou da SEFAZ
-- não repete, só ganha a chave) e completa destinatário, sentido, quem paga (APAGAR = paga quem recebe; PAGO = paga
-- quem envia) e origem "email". Usada uma vez em 24/10/2026 para 316 CT-e (os da My Frost ficaram de fora), só pelo
-- servidor. Aplicada em partes (o registro guarda só o revoke).
create or replace function public.ctes_do_email(p jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare x jsonb; n int := 0; v_u uuid;
begin
  for x in select * from jsonb_array_elements(p) loop
    perform public.salvar_cte_sefaz(jsonb_build_object('chave', x->>'c', 'emissao', x->>'e', 'valor', (x->>'v')::numeric, 'situacao', 'autorizado'), null);
    select id into v_u from unidades where regexp_replace(cnpj, '[^0-9]', '', 'g') = x->>'d';
    update ctes c set
      destinatario_cnpj = coalesce(c.destinatario_cnpj, x->>'d'),
      destinatario_nome = coalesce(c.destinatario_nome, case when v_u is not null then 'MF MAQUINAS LTDA' else x->>'n' end),
      sentido = case when c.sentido <> 'outro' then c.sentido when v_u is not null then 'entrada' else 'saida' end,
      unidade_id = coalesce(c.unidade_id, v_u),
      frete = coalesce(c.frete, case x->>'f' when 'A' then 'a_pagar' else 'pago' end),
      tomador = coalesce(c.tomador, case x->>'f' when 'A' then 'destinatario' else 'remetente' end),
      mf_paga = case when c.origem = 'planilha' or c.xml is not null then c.mf_paga
                     when v_u is not null then x->>'f' = 'A' else x->>'f' = 'P' end,
      origem = case when c.origem = 'sefaz' and c.xml is null and c.sefaz_em > now() - interval '1 hour' then 'email' else c.origem end
    where c.chave = x->>'c' and c.xml is null;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.ctes_do_email(jsonb) from public, anon, authenticated;
