-- Avisos dos parcelamentos: a tabela de avisos só aceita alguns tipos (pagamento, pedido_loja, email, proposta, outro),
-- então o aviso de parcela entra como "pagamento". Atrasada ou com risco de cancelar o parcelamento: urgente; com risco,
-- pede a ciência de quem lê. Mesmos dias de antes: 7 e 2 dias antes, no dia, 1 dia depois e a cada semana de atraso.
create or replace function public.avisar_parcelamentos()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; d int; risco boolean;
begin
  for r in
    select x.numero, x.vencimento, x.valor, p.orgao, p.numero as num_parc, p.modalidade, p.unidade_id, p.qtd_parcelas, p.max_atrasos,
           (select count(*) from parcelamento_parcelas y where y.parcelamento_id = p.id and y.situacao = 'a_pagar' and y.vencimento < current_date) as atrasadas
      from parcelamento_parcelas x join parcelamentos p on p.id = x.parcelamento_id
     where x.situacao = 'a_pagar' and p.situacao = 'ativo' and x.vencimento between current_date - 120 and current_date + 7
  loop
    d := r.vencimento - current_date;
    if d in (7, 2, 0) or (d < 0 and (-d = 1 or (-d) % 7 = 0)) then
      risco := d <= 0 and r.atrasadas >= r.max_atrasos - 1;
      insert into notificacoes (tipo, titulo, texto, link, papeis, unidade_id, urgencia, exige_ciencia)
      values ('pagamento',
        case when d > 0 then 'Parcela de imposto vence em ' || d || ' dias'
             when d = 0 then 'Parcela de imposto vence hoje'
             else 'Parcela de imposto atrasada há ' || (-d) || ' ' || case when d = -1 then 'dia' else 'dias' end end
          || case when risco then ' · risco de cancelar o parcelamento' else '' end,
        concat_ws(' · ',
          case r.orgao when 'receita_federal' then 'Receita Federal' when 'pgfn' then 'PGFN' when 'sefaz_sc' then 'SEFAZ SC'
                       when 'sefaz_sp' then 'SEFAZ SP' when 'prefeitura' then 'Prefeitura' else 'Outro órgão' end,
          r.modalidade, 'nº ' || r.num_parc, 'parcela ' || r.numero || '/' || r.qtd_parcelas,
          public.brl(coalesce(r.valor, 0)), to_char(r.vencimento, 'DD/MM/YYYY')),
        '/parcelamentos', '{financeiro}', r.unidade_id,
        case when risco or d < 0 then 'urgente' when d <= 2 then 'importante' else 'normal' end, risco);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.avisar_parcelamentos() from public, anon, authenticated;
