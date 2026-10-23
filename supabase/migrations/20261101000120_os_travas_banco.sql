-- Revisão da Assistência/OS (23/10), parte do banco:
--  * total da OS: as peças são somadas sempre a partir dos itens (não dá para gravar valor_pecas direto) e valor
--    negativo não reduz a cobrança;
--  * item que muda de OS recalcula as duas;
--  * campos de controle (estoque baixado, concluída, faturada, NFS-e) não mudam pela tela: só pelas funções do ERP;
--  * peças e mão de obra não aceitam valor negativo;
--  * reabrir ou excluir a OS devolve a peça ao cadastro principal quando o produto foi unificado depois;
--  * OS restaurada ganha um registro em "reaberturas" (o aviso de "pronta" sai de novo ao concluir);
--  * anotação por voz não escreve em OS encerrada;
--  * área do cliente mostra as datas no horário de Brasília.

-- security definer: a soma das peças não pode depender do que a pessoa enxerga em os_itens
create or replace function public.trg_os_total()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- OS encerrada (inclusive as importadas, que têm o valor das peças sem os itens) guarda o valor que já tinha;
  -- importação feita pelo sistema também; nas outras, as peças são sempre a soma dos itens
  if tg_op = 'UPDATE' and old.status in ('concluida', 'entregue', 'cancelada') then
    new.valor_pecas := old.valor_pecas;
  elsif tg_op = 'INSERT' and current_user not in ('authenticated', 'anon') then
    new.valor_pecas := coalesce(new.valor_pecas, 0);
  else
    new.valor_pecas := coalesce((select sum(valor_total) from public.os_itens where os_id = new.id), 0);
  end if;
  new.valor_total := case when new.em_garantia then 0
                          else greatest(coalesce(new.valor_mao_obra, 0), 0) + greatest(new.valor_pecas, 0) end;
  return new;
end $$;

create or replace function public.trg_os_itens_recalc()
returns trigger language plpgsql as $$
begin
  -- o trg_os_total refaz a soma das peças; aqui só "toca" a OS nova e a antiga (item que mudou de OS)
  update public.ordens_servico o set valor_pecas = o.valor_pecas
   where o.id in (case when tg_op <> 'DELETE' then new.os_id end, case when tg_op <> 'INSERT' then old.os_id end);
  return null;
end $$;

create or replace function public.trg_os_protegido()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_livres text[] := array['fotos', 'marcadores'];
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.status in ('concluida', 'entregue') then
      raise exception 'a OS é concluída pelo botão "Concluir OS" (baixa as peças e gera a cobrança)';
    end if;
    -- OS nova começa sem baixa, sem conclusão e sem nota
    new.estoque_baixado := false; new.concluida_em := null; new.faturada_em := null; new.nfse_id := null;
    return new;
  end if;
  if old.status in ('concluida', 'entregue', 'cancelada') then
    if old.status = 'concluida' and new.status = 'entregue' then
      if nullif(btrim(coalesce(new.recebido_por, '')), '') is null then
        raise exception 'para entregar, preencha quem retirou o equipamento';
      end if;
      v_livres := v_livres || array['status', 'entregue_em', 'recebido_por', 'assinatura_entrega'];
    end if;
    if (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres) then
      raise exception 'OS nº % encerrada: só mudam fotos e marcadores (e a entrega, quando concluída); para o resto use "Reabrir OS"', old.numero;
    end if;
  else
    if new.status is distinct from old.status and new.status in ('concluida', 'entregue') then
      raise exception 'a OS é concluída pelo botão "Concluir OS" (baixa as peças e gera a cobrança) e entregue depois de concluída';
    end if;
    if new.estoque_baixado is distinct from old.estoque_baixado or new.concluida_em is distinct from old.concluida_em
       or new.faturada_em is distinct from old.faturada_em or new.nfse_id is distinct from old.nfse_id then
      raise exception 'OS nº %: estoque baixado, conclusão e nota mudam só pelos botões do ERP', old.numero;
    end if;
  end if;
  return new;
end $function$;

do $$ begin
  alter table public.os_itens add constraint os_itens_valor_unitario_chk check (valor_unitario >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ordens_servico add constraint ordens_servico_mao_obra_chk check (valor_mao_obra >= 0);
exception when duplicate_object then null; end $$;

-- devolução do estoque ao reabrir/excluir: produto unificado depois volta no cadastro principal
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.reabrir_os(uuid,text,text)'::regprocedure);
  if position('values (v_mov.produto_id, ''entrada''' in v_def) > 0 then
    execute replace(v_def, 'values (v_mov.produto_id, ''entrada''',
      'values (coalesce((select p.unificado_em from public.produtos p where p.id = v_mov.produto_id), v_mov.produto_id), ''entrada''');
  end if;
  v_def := pg_get_functiondef('public.excluir_documento(text,uuid,text)'::regprocedure);
  if position('values (v_mov.produto_id, ''entrada'', v_mov.q, ''OS #''' in v_def) > 0 then
    execute replace(v_def, 'values (v_mov.produto_id, ''entrada'', v_mov.q, ''OS #''',
      'values (coalesce((select p.unificado_em from public.produtos p where p.id = v_mov.produto_id), v_mov.produto_id), ''entrada'', v_mov.q, ''OS #''');
  end if;
  -- OS restaurada: entra em "reaberturas" (muda a chave do aviso de "pronta")
  v_def := pg_get_functiondef('public.restaurar_documento(text,uuid)'::regprocedure);
  if position('update ordens_servico set status = case' in v_def) > 0 and position('''restaurada após exclusão''' in v_def) = 0 then
    execute replace(v_def, 'excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null
     where id = p_id and excluida_em is not null;
    get diagnostics v_n = row_count;
  else',
      'excluida_em = null, excluida_por = null, excluida_motivo = null, excluida_status = null,
           reaberturas = coalesce(reaberturas, ''[]''::jsonb) || jsonb_build_array(jsonb_build_object(''em'', now(), ''por'', auth.uid(),
             ''nome'', (select nome from usuarios_erp where user_id = auth.uid() limit 1), ''motivo'', ''restaurada após exclusão''))
     where id = p_id and excluida_em is not null;
    get diagnostics v_n = row_count;
  else');
  end if;
  -- anotação por voz: só escreve na OS ainda aberta
  v_def := pg_get_functiondef('public.anotar_por_voz'::regproc);
  if position('v_obs) where id = p_ref_id;' in v_def) > 0 and position('and status not in (''concluida''' in v_def) = 0 then
    execute regexp_replace(v_def,
      '(update ordens_servico set observacoes = concat_ws\(E''\\n'', nullif\(observacoes, ''''\), v_obs\) where id = p_ref_id)',
      '\1 and status not in (''concluida'', ''entregue'', ''cancelada'')');
  end if;
end $$;

-- área do cliente: concluida_em::date e entregue_em::date no horário de Brasília
alter function public.area_cliente(uuid) set timezone to 'America/Sao_Paulo';
