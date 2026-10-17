-- =====================================================================
-- Travas de documentos encerrados e de campos (revisão de segurança de 17/10)
--  * os_itens: as peças de uma OS concluída, entregue ou cancelada não mudam mais pela tela nem pela API
--    (antes só a exclusão conferia a situação); para mudar, "Reabrir OS" (reabrir_os);
--  * ordens_servico: OS encerrada só muda fotos e marcadores (e a entrega, quando concluída); a conclusão e a
--    entrega não podem ser marcadas "na mão" (concluir_os baixa as peças e gera a cobrança; reabrir_os desfaz);
--  * pedido_itens: a trava que já existia passa a conferir também o pedido de onde o item sai (mover um item de
--    um pedido aprovado para um orçamento passava);
--  * contador_mensagens: a alteração fica só em "resolvida" (antes o financeiro ou o contador podiam mudar o texto
--    e o autor da mensagem de outra pessoa); o nome do autor e a data vêm do servidor;
--  * produtos: o perfil Marketplaces passa a ter uma lista do que pode mudar (título, descrições, fotos, EAN,
--    categoria, marca, modelo, medidas, embalagem…); NCM, CFOP, CST, IPI, origem, SKU e o resto ficam com o financeiro;
--  * emails: a marcação "extrato importado por você" vai por email_extrato_importado (a tela gravava a coluna
--    extratos direto, sem permissão, e o registro se perdia sem aviso).
-- Funções e rotinas do servidor (service role, security definer) não passam por essas travas. Somente acréscimos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Peças da OS
-- ---------------------------------------------------------------------
create or replace function public.trg_os_itens_protegido()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;
  if exists (select 1 from ordens_servico where id in (new.os_id, old.os_id) and status in ('concluida', 'entregue', 'cancelada')) then
    raise exception 'OS encerrada (concluída, entregue ou cancelada): use "Reabrir OS" para mudar as peças';
  end if;
  return coalesce(new, old);
end $$;

create or replace trigger trg_os_itens_protegido before insert or update or delete on public.os_itens
  for each row execute function public.trg_os_itens_protegido();

-- ---------------------------------------------------------------------
-- Cabeçalho da OS
-- ---------------------------------------------------------------------
create or replace function public.trg_os_protegido()
returns trigger language plpgsql set search_path = public as $$
declare v_livres text[] := array['fotos', 'marcadores'];
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.status in ('concluida', 'entregue') then
      raise exception 'a OS é concluída pelo botão "Concluir OS" (baixa as peças e gera a cobrança)';
    end if;
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
  elsif new.status is distinct from old.status and new.status in ('concluida', 'entregue') then
    raise exception 'a OS é concluída pelo botão "Concluir OS" (baixa as peças e gera a cobrança) e entregue depois de concluída';
  end if;
  return new;
end $$;

create or replace trigger trg_os_protegido before insert or update on public.ordens_servico
  for each row execute function public.trg_os_protegido();

-- ---------------------------------------------------------------------
-- Itens do pedido: confere o pedido de origem e o de destino
-- ---------------------------------------------------------------------
create or replace function public.trg_pedido_itens_protegido()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;
  if exists (select 1 from pedidos where id in (new.pedido_id, old.pedido_id) and status <> 'orcamento') then
    raise exception 'pedido já aprovado: reabra o pedido para mudar os itens';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Conversa com o contador
-- ---------------------------------------------------------------------
create or replace function public.trg_msg_contador_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor := auth.uid();
    new.autor_nome := coalesce((select nullif(btrim(nome), '') from usuarios_erp where user_id = auth.uid()), new.autor_nome);
    new.created_at := now();
    new.resolvida := false;
  end if;
  return new;
end $$;

create or replace trigger trg_msg_contador_autor before insert on public.contador_mensagens
  for each row execute function public.trg_msg_contador_autor();

revoke update on public.contador_mensagens from authenticated;
grant update (resolvida) on public.contador_mensagens to authenticated;

-- ---------------------------------------------------------------------
-- Produtos: o que o perfil Marketplaces muda
-- ---------------------------------------------------------------------
create or replace function public.trg_produto_marketplace()
returns trigger language plpgsql set search_path = public as $$
declare
  v_livres text[] := array['descricao', 'titulo_anuncio', 'slug', 'meta_descricao', 'palavras_chave', 'descricao_anuncio',
                           'descricao_catalogo', 'foto_caminho', 'codigo_barras', 'gtin_isento', 'categoria', 'marca', 'modelo',
                           'codigo_fabricante', 'codigos_alternativos', 'peso_kg', 'altura_cm', 'largura_cm', 'profundidade_cm',
                           'embalagem_id', 'especificacoes', 'video_url', 'dicas_manutencao', 'no_catalogo', 'observacoes',
                           'marcadores', 'motivo_alteracao'];
begin
  if current_user not in ('authenticated', 'anon') or public.tem_papel('financeiro') or not public.tem_papel('marketplace') then
    return new;
  end if;
  if (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres) then
    raise exception 'o perfil Marketplaces ajusta o cadastro do anúncio (título, descrições, fotos, EAN, categoria, marca, modelo, medidas e embalagem); preço, custo, estoque, NCM e dados fiscais, SKU, tipo e ativar ou desativar ficam com o financeiro';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- E-mail: extrato importado à mão a partir do anexo
-- ---------------------------------------------------------------------
create or replace function public.email_extrato_importado(p_email uuid, p_indice integer, p_nome text, p_conta uuid,
                                                          p_novas integer, p_repetidas integer, p_conciliadas integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_conta uuid; v_lista jsonb; v_antes jsonb; v_nome text;
begin
  if not public.tem_papel('financeiro') then raise exception 'só o financeiro importa extratos'; end if;
  select conta_id, coalesce(extratos, '[]'::jsonb) into v_conta, v_lista from emails where id = p_email;
  if not found or not public.pode_ver_email(v_conta) then raise exception 'e-mail não encontrado'; end if;
  if p_indice is null or p_indice < 0 then raise exception 'anexo inválido'; end if;
  select x into v_antes from jsonb_array_elements(v_lista) x where (x ->> 'indice')::integer = p_indice limit 1;
  select nome into v_nome from usuarios_erp where user_id = auth.uid();
  update emails set extratos = coalesce((select jsonb_agg(x) from jsonb_array_elements(v_lista) x where (x ->> 'indice')::integer is distinct from p_indice), '[]'::jsonb)
    || jsonb_build_array(coalesce(v_antes, '{}'::jsonb) || jsonb_build_object(
         'indice', p_indice, 'nome', coalesce(v_antes ->> 'nome', left(p_nome, 200)), 'status', 'importado',
         'motivo', 'importado por ' || coalesce(nullif(btrim(v_nome), ''), 'um usuário'),
         'conta_id', p_conta, 'conta', case when v_antes ->> 'conta_id' = p_conta::text then v_antes -> 'conta' end,
         'novas', greatest(coalesce(p_novas, 0), 0), 'repetidas', greatest(coalesce(p_repetidas, 0), 0),
         'conciliadas', greatest(coalesce(p_conciliadas, 0), 0)))
   where id = p_email;
end $$;
revoke execute on function public.email_extrato_importado(uuid, integer, text, uuid, integer, integer, integer) from public, anon;
grant execute on function public.email_extrato_importado(uuid, integer, text, uuid, integer, integer, integer) to authenticated;
