-- =====================================================================
-- NF-e de teste (homologação) separada das reais (produção).
--   Nota autorizada em homologação não tem valor fiscal: não fatura o pedido,
--   não impede emitir a nota real, não vai para o contador e não avisa o cliente.
--   As notas de teste já emitidas são reconhecidas pelo endereço do XML/DANFE
--   na Focus (homologacao.focusnfe.com.br), e o pedido delas volta a "aprovado".
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================

alter table public.notas_fiscais
  add column if not exists ambiente text not null default 'producao' check (ambiente in ('producao', 'homologacao'));

update public.notas_fiscais set ambiente = 'homologacao'
 where ambiente = 'producao' and origem = 'erp'
   and (xml_url like 'https://homologacao.%' or danfe_url like 'https://homologacao.%');

update public.pedidos p set status = 'aprovado'
 where p.status = 'faturado'
   and exists (select 1 from public.notas_fiscais n where n.pedido_id = p.id and n.ambiente = 'homologacao' and n.status = 'autorizada')
   and not exists (select 1 from public.notas_fiscais n where n.pedido_id = p.id and n.ambiente = 'producao' and n.status in ('autorizada', 'processando', 'contingencia'));

-- nota de teste não avisa equipe nem cliente
create or replace function public.trg_aviso_nota()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p record;
begin
  if new.origem = 'importada' or new.ambiente = 'homologacao' then return null; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  select pe.numero, pe.cliente_id, c.nome as cliente into p
    from public.pedidos pe join public.clientes c on c.id = pe.cliente_id where pe.id = new.pedido_id;
  if new.status = 'autorizada' then
    perform public.avisar_equipe('nfe_autorizada', 'nfe-ok:' || new.id,
      jsonb_build_object('numero', new.numero, 'pedido', p.numero, 'cliente', p.cliente, 'valor', new.valor_total));
    perform public.avisar_cliente('cli_nfe', p.cliente_id, 'nfe:' || new.id,
      jsonb_build_object('numero', new.numero, 'pedido', p.numero, 'valor', new.valor_total, 'danfe_url', new.danfe_url, 'chave', new.chave));
  elsif new.status = 'erro' then
    perform public.avisar_equipe('nfe_erro', 'nfe-erro:' || new.id || ':' || md5(coalesce(new.mensagem, '')),
      jsonb_build_object('pedido', p.numero, 'cliente', p.cliente, 'mensagem', new.mensagem));
  end if;
  return null;
end $function$;

-- tentativas rejeitadas do mesmo pedido antes da nota de teste também eram teste
update public.notas_fiscais e set ambiente = 'homologacao'
 where e.ambiente = 'producao' and e.origem = 'erp' and e.status = 'erro'
   and exists (select 1 from public.notas_fiscais h where h.pedido_id = e.pedido_id and h.ambiente = 'homologacao' and h.created_at >= e.created_at);
