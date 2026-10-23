-- Revisão da Assistência/OS (23/10):
--  * vídeo chamada paga por Pix antes: a conclusão não cobra de novo o que já foi pago (video_valor_pago guarda
--    quanto entrou quando a pessoa marcou "Pix recebido"; OS antiga sem o valor usa a mão de obra);
--  * peça que é kit baixa os componentes (o kit não tem estoque próprio), como no pedido;
--  * datas no horário de Brasília (vencimento da cobrança, próxima preventiva e último contato).
alter table public.ordens_servico add column if not exists video_valor_pago numeric(14,2);

create or replace function public.concluir_os(p_os uuid, p_vencimento date default null)
returns void
language plpgsql security definer
set search_path to 'public'
set timezone to 'America/Sao_Paulo'
as $function$
declare
  v_os public.ordens_servico;
  v_item record;
  v_comp record;
  v_ja_pago numeric := 0;
  v_cobrar numeric;
begin
  perform public.exigir_papel('tecnico');

  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if v_os.status in ('concluida', 'entregue', 'cancelada') then raise exception 'OS já finalizada'; end if;

  if not v_os.estoque_baixado then
    for v_item in
      select i.produto_id, i.quantidade, coalesce(p.kit, false) as kit
        from public.os_itens i left join public.produtos p on p.id = i.produto_id
       where i.os_id = p_os and i.produto_id is not null
    loop
      if v_item.kit and exists (select 1 from public.kit_componentes k where k.kit_id = v_item.produto_id) then
        for v_comp in select * from public.kit_composicao(v_item.produto_id, null) loop
          insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
          values (v_comp.componente_id, 'saida', v_comp.quantidade * v_item.quantidade, 'OS #' || v_os.numero || ' (kit)', 'os', p_os, null);
        end loop;
      else
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
        values (v_item.produto_id, 'saida', v_item.quantidade, 'OS #' || v_os.numero, 'os', p_os, null);
      end if;
    end loop;
  end if;

  -- vídeo chamada com o Pix já recebido: esse valor não entra de novo na cobrança
  if v_os.atendimento = 'video' and v_os.video_pago_em is not null then
    v_ja_pago := greatest(coalesce(v_os.video_valor_pago, v_os.valor_mao_obra, 0), 0);
  end if;
  v_cobrar := round(coalesce(v_os.valor_total, 0) - v_ja_pago, 2);

  if v_cobrar > 0 then
    insert into public.contas_receber (descricao, cliente_id, os_id, valor, vencimento, forma_pagamento)
    values ('Assistência técnica OS #' || v_os.numero || case when v_ja_pago > 0 then ' (sem a vídeo chamada já paga)' else '' end,
            v_os.cliente_id, p_os, v_cobrar,
            coalesce(p_vencimento, current_date + (select dias_vencimento_boleto from public.configuracoes where id = 1)),
            'boleto');
  end if;

  update public.ordens_servico
     set status = 'concluida', concluida_em = now(), estoque_baixado = true
   where id = p_os;
end $function$;

alter function public.atualizar_preventiva_os() set timezone to 'America/Sao_Paulo';
alter table public.ordens_servico alter column data_entrada set default ((now() at time zone 'America/Sao_Paulo')::date);
