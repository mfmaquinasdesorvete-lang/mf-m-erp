-- =====================================================================
-- Revisão da Assistência/OS
--
-- A. Campos de controle da OS travados no banco.
--    Alguns campos da OS só as rotinas do sistema mudam (concluir_os, reabrir_os, excluir_documento,
--    restaurar_documento, a NFS-e, a soma das peças). Antes, quem tinha permissão de editar OS podia
--    mudar esses campos direto pela API (ex.: marcar estoque_baixado sem baixar as peças, apagar a
--    ligação com a NFS-e, "excluir" a OS sem as conferências, mudar o valor da vídeo chamada paga sem o botão "Pix recebido").
--    Agora o gatilho trg_os_controle_travado recusa a mudança quando ela vem do usuário (tela/API:
--    current_user = authenticated/anon) e deixa passar quando vem das funções do sistema
--    (security definer, que rodam como o dono) — o mesmo critério de trg_pedido_protegido.
--    A tela continua salvando normalmente: ela manda esses campos com o mesmo valor que leu
--    (sem mudança, o gatilho não reclama) e já não manda numero, valor_pecas, valor_total,
--    created_at nem reaberturas.
--    Observação: a função do gatilho NÃO é security definer de propósito — precisa enxergar quem
--    chamou (current_user). Se fosse security definer, current_user seria sempre o dono e nada travaria.
--
-- B. Unificar produto e reabrir OS.
--    unificar_produtos já leva as peças das OS (os_itens.produto_id), o produto da OS
--    (ordens_servico.produto_id) e o das máquinas (equipamentos.produto_id) para o produto mantido,
--    pela volta genérica nas chaves estrangeiras que apontam para produtos — nada a corrigir lá.
--    Mas o histórico do estoque (estoque_movimentos) fica de propósito no produto antigo; e reabrir_os
--    devolvia as peças ao produto do movimento. Se o produto foi unificado depois da conclusão, a peça
--    voltava para o cadastro antigo (inativo) e, ao concluir de novo, saía do produto mantido: o mantido
--    ficava com estoque a menos e o antigo com estoque a mais. Agora reabrir_os devolve ao produto
--    vigente (segue unificado_em até o cadastro ativo). O resto de reabrir_os ficou igual.
--
-- Pode rodar de novo sem erro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Campos de controle da OS
-- ---------------------------------------------------------------------
create or replace function public.trg_os_controle_travado()
returns trigger language plpgsql set search_path = public as $$
declare
  -- só as rotinas do sistema mudam:
  --  numero, created_at ........................ identidade da OS
  --  concluida_em, estoque_baixado ............. concluir_os / reabrir_os (baixa e volta das peças)
  --  faturada_em, nfse_id ...................... NFS-e (trg_nfse_status_depois)
  --  reaberturas ............................... histórico de reabrir_os
  --  excluida_em/por/motivo/status ............. excluir_documento / restaurar_documento
  --  pedido_id ................................. ligação com o pedido de venda (vem na criação da OS)
  v_travados text[] := array['id', 'numero', 'created_at', 'concluida_em', 'estoque_baixado', 'faturada_em', 'nfse_id',
                             'reaberturas', 'excluida_em', 'excluida_por', 'excluida_motivo', 'excluida_status',
                             'pedido_id'];
  v_novo jsonb; v_velho jsonb; v_mudou text[];
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if tg_op = 'INSERT' then
    -- OS nova pela tela/API nasce sem nada de controle (o pedido_id de "abrir OS pelo pedido" continua valendo)
    new := jsonb_populate_record(new, jsonb_build_object(
      'created_at', now(), 'concluida_em', null, 'estoque_baixado', false, 'faturada_em', null, 'nfse_id', null,
      'reaberturas', '[]'::jsonb, 'excluida_em', null, 'excluida_por', null, 'excluida_motivo', null,
      'excluida_status', null, 'entregue_em', null));
    -- valor da vídeo chamada paga só existe com o Pix marcado
    if (to_jsonb(new) ->> 'video_pago_em') is null then
      new := jsonb_populate_record(new, jsonb_build_object('video_valor_pago', null));
    end if;
    return new;
  end if;

  v_novo := to_jsonb(new);
  v_velho := to_jsonb(old);
  v_mudou := array(select k from unnest(v_travados) k where (v_novo -> k) is distinct from (v_velho -> k));

  -- entrega: a data só muda junto com a entrega (concluída → entregue); o resto do caminho é conferido em trg_os_protegido
  if new.entregue_em is distinct from old.entregue_em then
    if old.status = 'concluida' and new.status = 'entregue' then
      new.entregue_em := coalesce(new.entregue_em, now());
    else
      v_mudou := v_mudou || 'entregue_em'::text;
    end if;
  end if;

  -- vídeo chamada: o valor pago (descontado da cobrança em concluir_os) só muda junto com o botão
  -- "Pix recebido"/"Desfazer" (que mexe em video_pago_em); sem Pix marcado, não há valor pago
  if (v_novo -> 'video_valor_pago') is distinct from (v_velho -> 'video_valor_pago') then
    if (v_novo -> 'video_pago_em') is not distinct from (v_velho -> 'video_pago_em') then
      v_mudou := v_mudou || 'video_valor_pago'::text;
    end if;
  end if;
  if (v_novo ->> 'video_pago_em') is null and (v_novo ->> 'video_valor_pago') is not null then
    new := jsonb_populate_record(new, jsonb_build_object('video_valor_pago', null));
  end if;

  -- soma das peças: só a soma automática dos itens (trg_os_itens_recalc, que roda dentro de outro gatilho)
  if new.valor_pecas is distinct from old.valor_pecas and pg_trigger_depth() <= 1 then
    v_mudou := v_mudou || 'valor_pecas'::text;
  end if;

  if cardinality(v_mudou) > 0 then
    raise exception 'OS nº %: % só muda pelas rotinas da OS (concluir, reabrir, entregar, excluir, nota de serviço, peças). Recarregue a OS e tente de novo',
      old.numero, array_to_string(v_mudou, ', ');
  end if;
  return new;
end $$;

comment on function public.trg_os_controle_travado() is
  'Campos de controle da OS (número, conclusão, estoque baixado, NFS-e, reaberturas, exclusão, vídeo pago, pedido, entrega, soma das peças) só mudam pelas rotinas do sistema';

do $$ begin
  create trigger trg_os_controle_travado before insert or update on public.ordens_servico
    for each row execute function public.trg_os_controle_travado();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- B. Produto vigente (segue a unificação até o cadastro que ficou)
-- ---------------------------------------------------------------------
create or replace function public.produto_vigente(p_produto uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with recursive c(id, prox, n) as (
    select p.id, p.unificado_em, 0 from produtos p where p.id = p_produto
    union all
    select p.id, p.unificado_em, c.n + 1 from c join produtos p on p.id = c.prox where c.n < 20
  )
  select coalesce((select id from c where prox is null order by n desc limit 1), p_produto)
$$;
revoke execute on function public.produto_vigente(uuid) from public, anon;
grant execute on function public.produto_vigente(uuid) to authenticated;

-- reabrir_os: igual à versão atual, só a volta das peças vai para o produto vigente
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

  -- peças que saíram do estoque na conclusão voltam (concluir de novo baixa outra vez);
  -- se o produto foi unificado depois, voltam para o cadastro que ficou (o mesmo de onde a próxima conclusão vai baixar)
  if v_os.estoque_baixado then
    for v_mov in
      select public.produto_vigente(produto_id) as produto_id, unidade_id,
             sum(case when tipo = 'saida' then quantidade when tipo = 'entrada' then -quantidade else 0 end) as qtd
        from public.estoque_movimentos
       where referencia_tipo = 'os' and referencia_id = p_os and produto_id is not null
       group by 1, 2
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
