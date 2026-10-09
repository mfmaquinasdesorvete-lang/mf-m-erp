-- =====================================================================
-- Cadastro de clientes: WhatsApp automático, conferência com a Receita (situação do CNPJ, inscrição
-- estadual, endereço), etiquetas, unificar cadastros repetidos e tirar fornecedores da lista de clientes.
-- Só acrescenta (sem drop): colunas novas, funções e gatilhos.
-- =====================================================================

alter table public.clientes add column if not exists tags text[] not null default '{}';
alter table public.clientes add column if not exists receita jsonb;               -- dados da Receita na última consulta
alter table public.clientes add column if not exists receita_situacao text;      -- ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA
alter table public.clientes add column if not exists ie_situacao text;           -- ativa, baixada, nao_encontrada, sem_ie
alter table public.clientes add column if not exists receita_em timestamptz;     -- quando foi consultado
-- cadastro unificado em outro ou que era fornecedor: sai das listas, mas fica guardado (dá para desfazer)
alter table public.clientes add column if not exists arquivado_em timestamptz;
alter table public.clientes add column if not exists arquivado_motivo text;
alter table public.clientes add column if not exists unificado_em uuid;          -- o cadastro principal
alter table public.clientes add column if not exists dados_arquivados jsonb;     -- como estava antes de arquivar

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clientes' and policyname = 'clientes_sem_arquivados') then
    create policy "clientes_sem_arquivados" on public.clientes as restrictive for select to authenticated using (arquivado_em is null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- WhatsApp a partir do telefone: celular (com ou sem o 9 da frente, com ou sem 55) vira DDD + 9 dígitos
-- ---------------------------------------------------------------------
create or replace function public.whatsapp_de(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^[1-9][0-9]9[0-9]{8}$' then d
    when d ~ '^[1-9][0-9][6-9][0-9]{7}$' then left(d, 2) || '9' || right(d, 8)
    else null end
  from (select case when length(x) in (12, 13) and x like '55%' then substr(x, 3) else x end as d
          from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a) b
$$;

create or replace function public.trg_whatsapp_auto()
returns trigger language plpgsql as $$
begin
  if nullif(btrim(coalesce(new.whatsapp, '')), '') is null then
    new.whatsapp := public.whatsapp_de(new.telefone);
  elsif public.whatsapp_de(new.whatsapp) is not null then
    new.whatsapp := public.whatsapp_de(new.whatsapp);  -- celular antigo sem o 9, ou com 55 na frente
  end if;
  return new;
end $$;

create or replace trigger trg_whatsapp_auto before insert or update of telefone, whatsapp on public.clientes
  for each row execute function public.trg_whatsapp_auto();
create or replace trigger trg_whatsapp_auto before insert or update of telefone, whatsapp on public.fornecedores
  for each row execute function public.trg_whatsapp_auto();
create or replace trigger trg_whatsapp_auto before insert or update of telefone, whatsapp on public.transportadoras
  for each row execute function public.trg_whatsapp_auto();

-- Para o botão da tela: preenche (e corrige) o WhatsApp de todos de uma vez. Devolve quantos mudaram.
create or replace function public.preencher_whatsapp_cadastros()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_cli int; n_for int; n_tra int;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  update clientes set whatsapp = coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone))
   where coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone)) is distinct from nullif(btrim(coalesce(whatsapp, '')), '')
     and coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone)) is not null;
  get diagnostics n_cli = row_count;
  update fornecedores set whatsapp = coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone))
   where coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone)) is distinct from nullif(btrim(coalesce(whatsapp, '')), '')
     and coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone)) is not null;
  get diagnostics n_for = row_count;
  update transportadoras set whatsapp = coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone))
   where coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone)) is distinct from nullif(btrim(coalesce(whatsapp, '')), '')
     and coalesce(whatsapp_de(whatsapp), whatsapp_de(telefone)) is not null;
  get diagnostics n_tra = row_count;
  return jsonb_build_object('clientes', n_cli, 'fornecedores', n_for, 'transportadoras', n_tra);
end $$;
revoke execute on function public.preencher_whatsapp_cadastros() from public, anon;
grant execute on function public.preencher_whatsapp_cadastros() to authenticated;

-- ---------------------------------------------------------------------
-- Mês fechado: trocar só o cliente/fornecedor de uma conta (ao unificar cadastros) não mexe em valores nem datas
-- ---------------------------------------------------------------------
create or replace function public.trg_mes_fechado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_unid uuid; v_datas date[];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'cliente_id' - 'fornecedor_id') = (to_jsonb(old) - 'cliente_id' - 'fornecedor_id') then
    return new;
  end if;
  if tg_op = 'DELETE' then v_unid := old.unidade_id; v_datas := array[old.data_pagamento];
  elsif tg_op = 'INSERT' then v_unid := new.unidade_id; v_datas := array[new.data_pagamento];
  else v_unid := coalesce(new.unidade_id, old.unidade_id); v_datas := array[old.data_pagamento, new.data_pagamento]; end if;
  if exists (select 1 from fechamentos f where f.status = 'fechado' and f.unidade_id = v_unid
              and f.competencia = any (select to_char(d, 'YYYY-MM') from unnest(v_datas) d where d is not null)) then
    raise exception 'o mês deste pagamento já foi fechado pelo contador: peça ao administrador para reabrir';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Unificar cadastros: tudo que é dos outros (pedidos, contas, notas, OS, equipamentos, atendimentos, e-mails,
-- anexos) passa para o principal; o que só os outros tinham completa o principal; os outros são arquivados.
-- ---------------------------------------------------------------------
create or replace function public.unificar_clientes(p_manter uuid, p_outros uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_outro uuid; m clientes; o clientes; n int := 0;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  select * into m from clientes where id = p_manter;
  if m.id is null then raise exception 'cliente principal não encontrado'; end if;
  foreach v_outro in array coalesce(p_outros, '{}'::uuid[]) loop
    continue when v_outro = p_manter;
    select * into o from clientes where id = v_outro;
    continue when o.id is null;
    for r in
      select c.conrelid::regclass as tabela, a.attname as coluna
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'public.clientes'::regclass
    loop
      execute format('update %s set %I = $1 where %I = $2', r.tabela, r.coluna, r.coluna) using p_manter, v_outro;
    end loop;
    update documentos set entidade_id = p_manter where entidade = 'cliente' and entidade_id = v_outro;
    -- o outro sai das listas (fica guardado como estava); CPF/CNPJ e código do Tiny são únicos: liberados antes de copiar
    update clientes set arquivado_em = now(), arquivado_motivo = 'unificado', unificado_em = p_manter, dados_arquivados = to_jsonb(o),
           cpf_cnpj = null, id_externo = null
     where id = v_outro;
    update clientes set
      nome_fantasia = coalesce(nullif(btrim(m.nome_fantasia), ''), o.nome_fantasia),
      cpf_cnpj = coalesce(nullif(btrim(m.cpf_cnpj), ''), o.cpf_cnpj),
      tipo_pessoa = case when nullif(btrim(m.cpf_cnpj), '') is null and nullif(btrim(o.cpf_cnpj), '') is not null then o.tipo_pessoa else m.tipo_pessoa end,
      inscricao_estadual = coalesce(nullif(btrim(m.inscricao_estadual), ''), o.inscricao_estadual),
      email = coalesce(nullif(btrim(m.email), ''), o.email),
      telefone = coalesce(nullif(btrim(m.telefone), ''), o.telefone),
      whatsapp = coalesce(nullif(btrim(m.whatsapp), ''), o.whatsapp),
      cep = coalesce(nullif(btrim(m.cep), ''), o.cep),
      logradouro = coalesce(nullif(btrim(m.logradouro), ''), o.logradouro),
      numero = coalesce(nullif(btrim(m.numero), ''), o.numero),
      complemento = coalesce(nullif(btrim(m.complemento), ''), o.complemento),
      bairro = coalesce(nullif(btrim(m.bairro), ''), o.bairro),
      municipio = coalesce(nullif(btrim(m.municipio), ''), o.municipio),
      uf = coalesce(nullif(btrim(m.uf), ''), o.uf),
      id_externo = coalesce(m.id_externo, o.id_externo),
      observacoes = case when nullif(btrim(o.observacoes), '') is null or coalesce(m.observacoes, '') like '%' || o.observacoes || '%' then m.observacoes
                         else concat_ws(E'\n', nullif(btrim(m.observacoes), ''), o.observacoes) end,
      preferencias = case when nullif(btrim(o.preferencias), '') is null or coalesce(m.preferencias, '') like '%' || o.preferencias || '%' then m.preferencias
                          else concat_ws(E'\n', nullif(btrim(m.preferencias), ''), o.preferencias) end,
      tags = array(select distinct t from unnest(m.tags || o.tags) t order by t)
    where id = p_manter
    returning * into m;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unificar_clientes(uuid, uuid[]) from public, anon;
grant execute on function public.unificar_clientes(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Fornecedores e transportadoras que estão na lista de clientes
-- ---------------------------------------------------------------------
create or replace function public.clientes_fornecedores()
returns table (id uuid, codigo int, nome text, cpf_cnpj text, motivo text, tem_movimento boolean, ja_e_fornecedor boolean)
language sql stable security definer set search_path = public as $$
  with c as (select cl.*, regexp_replace(coalesce(cl.cpf_cnpj, ''), '\D', '', 'g') as doc from clientes cl where cl.arquivado_em is null and not ('fornecedor' = any (cl.tags))),
  f as (select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') as doc from fornecedores),
  t as (select regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') as doc from transportadoras),
  e as (select distinct regexp_replace(coalesce(emitente_cnpj, ''), '\D', '', 'g') as doc from nfe_recebidas)
  select c.id, c.codigo, c.nome, c.cpf_cnpj,
         concat_ws(', ',
           case when c.doc in (select doc from f) then 'mesmo CPF/CNPJ de um fornecedor' end,
           case when c.doc in (select doc from t) then 'mesmo CNPJ de uma transportadora' end,
           case when c.doc in (select doc from e) then 'emitiu nota fiscal para a MF' end),
         exists (select 1 from pedidos p where p.cliente_id = c.id) or exists (select 1 from contas_receber r where r.cliente_id = c.id)
           or exists (select 1 from notas_fiscais n where n.cliente_id = c.id) or exists (select 1 from ordens_servico s where s.cliente_id = c.id)
           or exists (select 1 from equipamentos q where q.cliente_id = c.id) or exists (select 1 from contas_recorrentes x where x.cliente_id = c.id)
           or exists (select 1 from loja_clientes l where l.cliente_id = c.id)
           or exists (select 1 from notas_fiscais n where n.destinatario_doc = c.doc),  -- notas do sistema anterior
         c.doc in (select doc from f) or c.doc in (select doc from t)
    from c
   where length(c.doc) >= 11 and (c.doc in (select doc from f) or c.doc in (select doc from t) or c.doc in (select doc from e))
   order by c.nome
$$;
revoke execute on function public.clientes_fornecedores() from public, anon;
grant execute on function public.clientes_fornecedores() to authenticated;

-- Tira da lista de clientes: cria o fornecedor se ainda não existe; quem já comprou da MF fica como cliente
-- com a etiqueta "fornecedor" (não perde o histórico); quem nunca comprou sai da lista de clientes (arquivado).
create or replace function public.retirar_fornecedores_clientes(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_forn uuid; n_mov int := 0; n_tag int := 0; n_novo int := 0;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  for r in select x.tem_movimento, c.* from public.clientes_fornecedores() x join clientes c on c.id = x.id where x.id = any (p_ids) loop
    select f.id into v_forn from fornecedores f where regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = regexp_replace(r.cpf_cnpj, '\D', '', 'g') limit 1;
    if v_forn is null and not exists (select 1 from transportadoras t where regexp_replace(coalesce(t.cnpj, ''), '\D', '', 'g') = regexp_replace(r.cpf_cnpj, '\D', '', 'g')) then
      insert into fornecedores (nome, nome_fantasia, cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero, complemento, bairro, municipio, uf, observacoes, id_externo)
      values (r.nome, r.nome_fantasia, regexp_replace(r.cpf_cnpj, '\D', '', 'g'), r.inscricao_estadual, r.email, r.telefone, r.whatsapp, r.cep, r.logradouro, r.numero,
              r.complemento, r.bairro, r.municipio, r.uf, r.observacoes, null)
      returning id into v_forn;
      n_novo := n_novo + 1;
    end if;
    if r.tem_movimento then
      update clientes set tags = array(select distinct t from unnest(tags || array['fornecedor']) t order by t) where id = r.id;
      n_tag := n_tag + 1;
    else
      if v_forn is not null then update documentos set entidade = 'fornecedor', entidade_id = v_forn where entidade = 'cliente' and entidade_id = r.id; end if;
      -- sai da lista de clientes (fica guardado como estava; o CPF/CNPJ fica livre para um cadastro novo)
      update clientes set arquivado_em = now(), arquivado_motivo = 'fornecedor', dados_arquivados = to_jsonb(r) - 'tem_movimento',
             cpf_cnpj = null, id_externo = null
       where id = r.id;
      n_mov := n_mov + 1;
    end if;
  end loop;
  return jsonb_build_object('retirados', n_mov, 'mantidos_com_etiqueta', n_tag, 'fornecedores_criados', n_novo);
end $$;
revoke execute on function public.retirar_fornecedores_clientes(uuid[]) from public, anon;
grant execute on function public.retirar_fornecedores_clientes(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Fila da conferência com a Receita (Edge Function clientes-receita, a cada minuto pelo agendamento)
-- ---------------------------------------------------------------------
create or replace function public.clientes_para_receita(p_limite int default 3)
returns setof public.clientes language sql stable security definer set search_path = public as $$
  select c.* from clientes c
   where c.arquivado_em is null and length(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g')) = 14
     and (c.receita_em is null or c.receita_em < now() - interval '90 days')
   order by c.receita_em nulls first, exists (select 1 from pedidos p where p.cliente_id = c.id) desc, c.created_at desc
   limit greatest(1, least(p_limite, 20))
$$;
revoke execute on function public.clientes_para_receita(int) from public, anon, authenticated;

-- Quem tem histórico (pedidos, notas — inclusive as do sistema anterior pelo CPF/CNPJ —, contas, OS, equipamentos,
-- atendimentos): o botão "Ficha 360" fica colorido para esses clientes
create or replace function public.clientes_com_historico()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from clientes c
   where public.is_erp_user() and c.arquivado_em is null and (
         exists (select 1 from pedidos p where p.cliente_id = c.id)
      or exists (select 1 from notas_fiscais n where n.cliente_id = c.id)
      or exists (select 1 from contas_receber r where r.cliente_id = c.id)
      or exists (select 1 from ordens_servico s where s.cliente_id = c.id)
      or exists (select 1 from equipamentos q where q.cliente_id = c.id)
      or exists (select 1 from contatos_cliente a where a.cliente_id = c.id)
      or (length(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g')) >= 11
          and exists (select 1 from notas_fiscais n where n.destinatario_doc = regexp_replace(c.cpf_cnpj, '\D', '', 'g'))))
$$;
revoke execute on function public.clientes_com_historico() from public, anon;
grant execute on function public.clientes_com_historico() to authenticated;
