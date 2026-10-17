-- Reabrir OS concluída sem querer (Assistência → OS → Reabrir OS): a OS concluída e ainda não entregue volta para uma
-- situação de trabalho (padrão: em reparo), com o motivo obrigatório. Desfaz o que a conclusão fez: a cobrança em aberto
-- é cancelada (concluir de novo gera outra com o valor certo) e as peças que saíram do estoque voltam (concluir de novo
-- baixa outra vez). Não reabre se já houver NFS-e ou se a cobrança já foi recebida. O histórico fica na própria OS
-- (`reaberturas`: quando, quem, motivo e quando tinha sido concluída). O aviso de "máquina pronta" ganha uma chave nova
-- a cada reabertura, para o cliente receber o aviso certo quando a OS for concluída de verdade.
-- Só aditivo: coluna nova, função nova e trg_aviso_os refeita só com a chave do aviso de pronta.

alter table public.ordens_servico add column if not exists reaberturas jsonb not null default '[]'::jsonb;
comment on column public.ordens_servico.reaberturas is 'histórico de reaberturas: [{em, por, nome, motivo, concluida_em, voltou_para}]';

create or replace function public.reabrir_os(p_os uuid, p_motivo text, p_status text default 'em_reparo')
returns void language plpgsql security definer set search_path = public as $$
declare v_os public.ordens_servico; v_mov record;
begin
  perform public.exigir_papel('tecnico');
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'escreva o motivo da reabertura (pelo menos 5 letras)'; end if;
  if coalesce(p_status, '') not in ('aberta', 'em_diagnostico', 'aguardando_aprovacao', 'aguardando_peca', 'em_reparo') then
    raise exception 'situação inválida para reabrir a OS';
  end if;
  select * into v_os from public.ordens_servico where id = p_os for update;
  if not found then raise exception 'OS não encontrada'; end if;
  if v_os.status <> 'concluida' then raise exception 'só a OS concluída e ainda não entregue pode ser reaberta'; end if;
  if exists (select 1 from public.nfse where os_id = p_os and status in ('pendente', 'processando', 'autorizada', 'incerto')) then
    raise exception 'esta OS já tem nota de serviço (NFS-e): cancele a nota antes de reabrir';
  end if;
  if exists (select 1 from public.contas_receber where os_id = p_os and status = 'pago') then
    raise exception 'a cobrança desta OS já foi recebida: estorne o recebimento no financeiro antes de reabrir';
  end if;

  -- cobrança em aberto: cancelada (concluir de novo gera outra com o valor certo)
  update public.contas_receber
     set status = 'cancelado', motivo_alteracao = left('OS #' || v_os.numero || ' reaberta: ' || btrim(p_motivo), 500)
   where os_id = p_os and status = 'aberto';

  -- peças que saíram do estoque na conclusão voltam (concluir de novo baixa outra vez)
  if v_os.estoque_baixado then
    for v_mov in
      select produto_id, unidade_id, sum(case when tipo = 'saida' then quantidade when tipo = 'entrada' then -quantidade else 0 end) as qtd
        from public.estoque_movimentos
       where referencia_tipo = 'os' and referencia_id = p_os and produto_id is not null
       group by produto_id, unidade_id
    loop
      if v_mov.qtd > 0 then
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
        values (v_mov.produto_id, 'entrada', v_mov.qtd, 'OS #' || v_os.numero || ' reaberta', 'os', p_os, v_mov.unidade_id);
      end if;
    end loop;
  end if;

  update public.ordens_servico
     set status = p_status, concluida_em = null, estoque_baixado = false,
         reaberturas = coalesce(reaberturas, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'em', now(), 'por', auth.uid(), 'nome', (select nome from public.usuarios_erp where user_id = auth.uid() limit 1),
           'motivo', btrim(p_motivo), 'concluida_em', v_os.concluida_em, 'voltou_para', p_status))
   where id = p_os;
end $$;
revoke execute on function public.reabrir_os(uuid, text, text) from public, anon;
grant execute on function public.reabrir_os(uuid, text, text) to authenticated;

/** Igual à anterior; o aviso de "pronta" de uma OS reaberta usa uma chave nova (senão a 2ª conclusão não avisaria). */
create or replace function public.trg_aviso_os()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text; v_suf text;
begin
  select nome into cli from public.clientes where id = new.cliente_id;
  if tg_op = 'INSERT' then
    perform public.avisar_equipe('os_nova', 'os-nova:' || new.id,
      jsonb_build_object('numero', new.numero, 'cliente', cli, 'equipamento', new.equipamento, 'defeito', new.defeito_relatado, 'garantia', new.em_garantia));
    perform public.avisar_cliente('cli_os_recebida', new.cliente_id, 'os-recebida:' || new.id,
      jsonb_build_object('numero', new.numero, 'equipamento', new.equipamento, 'numero_serie', new.numero_serie,
        'defeito', new.defeito_relatado, 'previsao', new.previsao));
  elsif new.status = 'concluida' and old.status is distinct from 'concluida' then
    v_suf := case when jsonb_array_length(coalesce(new.reaberturas, '[]'::jsonb)) > 0 then ':' || jsonb_array_length(new.reaberturas) else '' end;
    perform public.avisar_equipe('os_pronta', 'os-pronta:' || new.id || v_suf,
      jsonb_build_object('numero', new.numero, 'cliente', cli, 'equipamento', new.equipamento, 'valor', new.valor_total, 'garantia', new.em_garantia));
    perform public.avisar_cliente('cli_os_pronta', new.cliente_id, 'os-pronta:' || new.id || v_suf,
      jsonb_build_object('numero', new.numero, 'equipamento', new.equipamento, 'solucao', new.solucao,
        'valor', new.valor_total, 'garantia', new.em_garantia));
  end if;
  return null;
end $$;
