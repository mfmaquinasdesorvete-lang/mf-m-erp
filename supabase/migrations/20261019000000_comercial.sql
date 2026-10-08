-- =====================================================================
-- Comercial
--   * propostas comerciais: layout próprio, link para o cliente ver, aprovar
--     ou recusar (com motivo); aprovada vira pedido de venda sozinha
--   * kits: produto formado por componentes (obrigatórios, opcionais e
--     alternativas); ao aprovar o pedido, baixa o estoque dos componentes
--   * comissões de vendedores e representantes (no faturamento ou no
--     recebimento), pagas pelo contas a pagar
--   * documentos anexados a pedidos, OS, clientes, fornecedores, produtos e contas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vendedores e representantes
-- ---------------------------------------------------------------------
create table public.vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'vendedor' check (tipo in ('vendedor', 'representante')),
  user_id uuid references public.usuarios_erp(user_id) on delete set null,   -- login no ERP (vê as próprias comissões)
  percentual numeric(5,2) not null default 3 check (percentual between 0 and 100),
  base text not null default 'recebimento' check (base in ('recebimento', 'faturamento')),
  descontar_frete boolean not null default true,
  cpf_cnpj text, email text, whatsapp text, pix text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.vendedores enable row level security;
create policy "erp_select" on public.vendedores for select to authenticated using (public.is_erp_user());
create policy "fin_write" on public.vendedores for all to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));

alter table public.pedidos
  add column vendedor_id uuid references public.vendedores(id) on delete set null,
  add column comissao_percentual numeric(5,2);

-- quem já aparecia como vendedor (texto) vira cadastro
insert into public.vendedores (nome, percentual)
select distinct trim(vendedor), (select comissao_percentual from public.configuracoes where id = 1)
  from public.pedidos where coalesce(trim(vendedor), '') not in ('', 'Loja virtual');
update public.pedidos p set vendedor_id = v.id from public.vendedores v where trim(p.vendedor) = v.nome;

create table public.comissoes (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedores(id),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  conta_receber_id uuid unique references public.contas_receber(id) on delete set null,
  descricao text not null,
  base numeric(12,2) not null,
  percentual numeric(5,2) not null,
  valor numeric(12,2) not null,
  status text not null default 'a_pagar' check (status in ('a_pagar', 'paga', 'cancelada')),
  conta_pagar_id uuid references public.contas_pagar(id) on delete set null,
  pago_em date,
  created_at timestamptz not null default now()
);
create index on public.comissoes (vendedor_id, status);
alter table public.comissoes enable row level security;
create policy "ver_comissoes" on public.comissoes for select to authenticated using (
  public.tem_papel('financeiro') or exists (select 1 from public.vendedores v where v.id = vendedor_id and v.user_id = auth.uid()));

-- Lança a comissão de um pedido (base já sem frete, se o vendedor for assim)
create or replace function public.lancar_comissao(p_pedido uuid, p_valor numeric, p_conta uuid, p_descricao text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_vend vendedores; v_base numeric; v_pct numeric;
begin
  select * into v_ped from pedidos where id = p_pedido;
  if v_ped.vendedor_id is null then return; end if;
  select * into v_vend from vendedores where id = v_ped.vendedor_id;
  v_pct := coalesce(v_ped.comissao_percentual, v_vend.percentual);
  if v_pct <= 0 or v_ped.valor_total <= 0 then return; end if;
  v_base := round(p_valor * case when v_vend.descontar_frete then greatest(v_ped.valor_total - v_ped.frete, 0) / v_ped.valor_total else 1 end, 2);
  insert into comissoes (vendedor_id, pedido_id, conta_receber_id, descricao, base, percentual, valor)
  values (v_vend.id, p_pedido, p_conta, p_descricao, v_base, v_pct, round(v_base * v_pct / 100, 2))
  on conflict (conta_receber_id) do nothing;
end $$;
revoke execute on function public.lancar_comissao(uuid, numeric, uuid, text) from public, anon, authenticated;

-- Comissão no recebimento: cada parcela paga gera a comissão dela; estorno cancela se ainda não foi paga
create or replace function public.trg_comissao_recebimento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pedido_id is null then return new; end if;
  if new.status = 'pago' and old.status is distinct from 'pago'
     and (select v.base from pedidos p join vendedores v on v.id = p.vendedor_id where p.id = new.pedido_id) = 'recebimento' then
    perform public.lancar_comissao(new.pedido_id, coalesce(new.valor_pago, new.valor), new.id, coalesce(new.descricao, 'Parcela'));
  elsif old.status = 'pago' and new.status <> 'pago' then
    update comissoes set status = 'cancelada' where conta_receber_id = new.id and status = 'a_pagar' and conta_pagar_id is null;
  end if;
  return new;
end $$;
create trigger trg_comissao_recebimento after update of status on public.contas_receber
  for each row execute function public.trg_comissao_recebimento();

-- Pedido cancelado: comissões ainda não pagas são canceladas
create or replace function public.trg_comissao_cancelamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    update comissoes set status = 'cancelada' where pedido_id = new.id and status = 'a_pagar' and conta_pagar_id is null;
  end if;
  return new;
end $$;
create trigger trg_comissao_cancelamento after update of status on public.pedidos
  for each row execute function public.trg_comissao_cancelamento();

-- Pagamento: junta as comissões escolhidas numa conta a pagar; quando a conta é paga, a comissão fica paga
create or replace function public.gerar_pagamento_comissoes(p_ids uuid[], p_vencimento date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_conta uuid; v_vend uuid; v_total numeric; v_n int; v_nome text; v_unid uuid;
begin
  perform public.exigir_papel('financeiro');
  select min(vendedor_id::text)::uuid, sum(valor), count(*) into v_vend, v_total, v_n
    from comissoes where id = any(p_ids) and status = 'a_pagar' and conta_pagar_id is null;
  if v_total is null or v_total <= 0 then raise exception 'nenhuma comissão a pagar selecionada'; end if;
  if (select count(distinct vendedor_id) from comissoes where id = any(p_ids)) > 1 then raise exception 'escolha comissões de um vendedor por vez'; end if;
  select nome into v_nome from vendedores where id = v_vend;
  select case when count(distinct p.unidade_id) = 1 then min(p.unidade_id::text)::uuid else public.unidade_matriz() end into v_unid
    from comissoes c join pedidos p on p.id = c.pedido_id where c.id = any(p_ids);
  insert into contas_pagar (descricao, categoria, valor, vencimento, unidade_id, observacoes)
  values ('Comissão ' || v_nome || ' (' || v_n || ' lançamento' || case when v_n > 1 then 's' else '' end || ')', 'comissoes', v_total,
          coalesce(p_vencimento, current_date), v_unid, 'Gerado pelo ERP a partir das comissões')
  returning id into v_conta;
  update comissoes set conta_pagar_id = v_conta where id = any(p_ids) and status = 'a_pagar' and conta_pagar_id is null;
  return v_conta;
end $$;
revoke execute on function public.gerar_pagamento_comissoes(uuid[], date) from public, anon;
grant execute on function public.gerar_pagamento_comissoes(uuid[], date) to authenticated;

create or replace function public.trg_comissao_paga()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    update comissoes set status = 'paga', pago_em = coalesce(new.data_pagamento, current_date) where conta_pagar_id = new.id and status = 'a_pagar';
  elsif new.status = 'cancelado' and old.status <> 'cancelado' then
    update comissoes set conta_pagar_id = null where conta_pagar_id = new.id and status = 'a_pagar';
  end if;
  return new;
end $$;
create trigger trg_comissao_paga after update of status on public.contas_pagar
  for each row execute function public.trg_comissao_paga();

-- ---------------------------------------------------------------------
-- Kits
-- ---------------------------------------------------------------------
alter table public.produtos add column kit boolean not null default false;

create table public.kit_componentes (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.produtos(id) on delete cascade,
  componente_id uuid not null references public.produtos(id) on delete restrict,
  quantidade numeric(12,3) not null default 1 check (quantidade > 0),
  opcional boolean not null default false,     -- cliente pode tirar
  grupo text,                                  -- mesmo grupo = alternativas (escolhe uma)
  padrao boolean not null default true,        -- vem marcado (opcional) / é a escolha padrão do grupo
  created_at timestamptz not null default now(),
  unique (kit_id, componente_id),
  check (kit_id <> componente_id)
);
alter table public.kit_componentes enable row level security;
create policy "erp_select" on public.kit_componentes for select to authenticated using (public.is_erp_user());
create policy "fin_write" on public.kit_componentes for all to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));

-- Composição escolhida no pedido: [{componente_id, quantidade}] por unidade do kit (vazio = padrão)
alter table public.pedido_itens add column kit_escolha jsonb;

-- Componentes que saem do estoque para 1 unidade do kit
create or replace function public.kit_composicao(p_kit uuid, p_escolha jsonb)
returns table (componente_id uuid, quantidade numeric) language sql stable security definer set search_path = public as $$
  select (e->>'componente_id')::uuid, (e->>'quantidade')::numeric
    from jsonb_array_elements(p_escolha) e
   where p_escolha is not null and jsonb_typeof(p_escolha) = 'array' and jsonb_array_length(p_escolha) > 0
     and exists (select 1 from kit_componentes k where k.kit_id = p_kit and k.componente_id = (e->>'componente_id')::uuid)
     and (e->>'quantidade')::numeric > 0
  union all
  select k.componente_id, k.quantidade from kit_componentes k
   where (p_escolha is null or jsonb_typeof(p_escolha) <> 'array' or jsonb_array_length(p_escolha) = 0)
     and k.kit_id = p_kit and k.padrao;
$$;

-- ---------------------------------------------------------------------
-- Aprovação do pedido (agora com kits e comissão no faturamento).
-- aprovar_pedido_sistema só é chamada por dentro (proposta aprovada pelo cliente).
-- ---------------------------------------------------------------------
create or replace function public.aprovar_pedido_sistema(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos;
  v_item record;
  v_comp record;
  v_parcela int;
  v_valor_parcela numeric(12,2);
  v_primeiro date;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos podem ser aprovados'; end if;
  if v_ped.valor_total <= 0 then raise exception 'pedido sem itens'; end if;

  for v_item in select i.*, p.kit from public.pedido_itens i join public.produtos p on p.id = i.produto_id where i.pedido_id = p_pedido loop
    if v_item.kit then
      for v_comp in select * from public.kit_composicao(v_item.produto_id, v_item.kit_escolha) loop
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
        values (v_comp.componente_id, 'saida', v_comp.quantidade * v_item.quantidade, 'Pedido #' || v_ped.numero || ' (kit ' || v_item.descricao || ')', 'pedido', p_pedido);
      end loop;
    else
      insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie)
      values (v_item.produto_id, 'saida', v_item.quantidade, 'Pedido #' || v_ped.numero, 'pedido', p_pedido, v_item.numero_serie);
    end if;
  end loop;

  v_primeiro := coalesce(v_ped.primeiro_vencimento,
    current_date + (select dias_vencimento_boleto from public.configuracoes where id = 1));

  for v_parcela in 1..v_ped.parcelas loop
    v_valor_parcela := round(v_ped.valor_total / v_ped.parcelas, 2);
    if v_parcela = v_ped.parcelas then
      v_valor_parcela := v_ped.valor_total - round(v_ped.valor_total / v_ped.parcelas, 2) * (v_ped.parcelas - 1);
    end if;
    insert into public.contas_receber (descricao, cliente_id, pedido_id, parcela, total_parcelas, valor, vencimento, forma_pagamento)
    values ('Pedido #' || v_ped.numero || ' - parcela ' || v_parcela || '/' || v_ped.parcelas,
            v_ped.cliente_id, p_pedido, v_parcela, v_ped.parcelas, v_valor_parcela,
            v_primeiro + (v_parcela - 1) * v_ped.intervalo_dias, v_ped.forma_pagamento);
  end loop;

  update public.pedidos set status = 'aprovado', aprovado_em = now(), estoque_baixado = true where id = p_pedido;

  if (select v.base from vendedores v where v.id = v_ped.vendedor_id) = 'faturamento' then
    perform public.lancar_comissao(p_pedido, v_ped.valor_total, null, 'Pedido #' || v_ped.numero);
  end if;
end $$;
revoke execute on function public.aprovar_pedido_sistema(uuid) from public, anon, authenticated;

create or replace function public.aprovar_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('vendas');
  perform public.aprovar_pedido_sistema(p_pedido);
end $$;

-- Cancelamento devolve exatamente o que saiu do estoque (inclusive componentes de kit)
create or replace function public.cancelar_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ped public.pedidos;
  v_mov record;
begin
  perform public.exigir_papel('vendas');
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then return; end if;
  if exists (select 1 from public.notas_fiscais where pedido_id = p_pedido and status = 'autorizada') then
    raise exception 'pedido possui NF-e autorizada; cancele a nota antes';
  end if;
  if exists (select 1 from public.contas_receber where pedido_id = p_pedido and status = 'pago') then
    raise exception 'pedido possui parcelas pagas; estorne antes de cancelar';
  end if;

  if v_ped.estoque_baixado then
    for v_mov in select produto_id, numero_serie, unidade_id, sum(case when tipo = 'saida' then abs(quantidade) else -abs(quantidade) end) as q
                   from public.estoque_movimentos where referencia_tipo = 'pedido' and referencia_id = p_pedido and tipo in ('saida', 'entrada')
                  group by produto_id, numero_serie, unidade_id loop
      if v_mov.q > 0 then
        insert into public.estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, numero_serie, unidade_id)
        values (v_mov.produto_id, 'entrada', v_mov.q, 'Cancelamento pedido #' || v_ped.numero, 'pedido', p_pedido, v_mov.numero_serie, v_mov.unidade_id);
      end if;
    end loop;
  end if;

  update public.contas_receber set status = 'cancelado' where pedido_id = p_pedido and status = 'aberto';
  update public.pedidos set status = 'cancelado', estoque_baixado = false where id = p_pedido;
end $$;

-- ---------------------------------------------------------------------
-- Propostas comerciais
-- ---------------------------------------------------------------------
alter table public.pedidos
  add column proposta_token uuid not null default gen_random_uuid() unique,
  add column proposta_status text check (proposta_status in ('enviada', 'visualizada', 'aprovada', 'rejeitada', 'expirada')),
  add column proposta_enviada_em timestamptz,
  add column proposta_visualizada_em timestamptz,
  add column proposta_respondida_em timestamptz,
  add column proposta_validade date,
  add column proposta_resposta_nome text,
  add column motivo_rejeicao text check (motivo_rejeicao in ('preco', 'prazo', 'frete', 'pagamento', 'concorrente', 'produto', 'desistiu', 'sem_resposta', 'outro')),
  add column motivo_rejeicao_texto text,
  add column concorrente text;

alter table public.configuracoes
  add column proposta_titulo text not null default 'Proposta comercial',
  add column proposta_apresentacao text default 'Obrigado pelo interesse na MF Máquinas. Preparamos esta proposta com as máquinas e condições conversadas. Qualquer dúvida, fale com a gente pelo WhatsApp.',
  add column proposta_condicoes text default 'Instalação e treinamento inclusos para máquinas. Prazo de entrega a combinar conforme disponibilidade. Frete conforme modalidade informada.',
  add column proposta_rodape text,
  add column proposta_cor text not null default '#0EA5E9' check (proposta_cor ~ '^#[0-9A-Fa-f]{6}$'),
  add column proposta_fotos boolean not null default true;

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in ('pagamento', 'pedido_loja', 'email', 'proposta', 'outro'));

-- Página pública da proposta (/proposta/<token>): o que o cliente vê. Marca como visualizada.
create or replace function public.proposta_publica(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_cfg configuracoes; v_status text;
begin
  select * into v_ped from pedidos where proposta_token = p_token and proposta_status is not null;
  if not found then return null; end if;
  select * into v_cfg from configuracoes where id = 1;
  v_status := v_ped.proposta_status;
  if v_status in ('enviada', 'visualizada') and v_ped.status = 'orcamento' and v_ped.proposta_validade < current_date then
    update pedidos set proposta_status = 'expirada' where id = v_ped.id;
    v_status := 'expirada';
  elsif v_status = 'enviada' then
    update pedidos set proposta_status = 'visualizada', proposta_visualizada_em = now() where id = v_ped.id;
    v_status := 'visualizada';
    perform notificar('proposta', 'Proposta #' || v_ped.numero || ' aberta pelo cliente',
      (select nome from clientes where id = v_ped.cliente_id), '/pedidos', '{vendas}', v_ped.unidade_id);
  end if;
  return jsonb_build_object(
    'numero', v_ped.numero, 'data', v_ped.proposta_enviada_em, 'validade', v_ped.proposta_validade, 'status', v_status,
    'pedido_status', v_ped.status, 'cliente', (select nome from clientes where id = v_ped.cliente_id),
    'vendedor', coalesce((select nome from vendedores where id = v_ped.vendedor_id), v_ped.vendedor),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'descricao', i.descricao, 'quantidade', i.quantidade, 'valor_unitario', i.valor_unitario, 'total', i.quantidade * i.valor_unitario,
        'foto', case when v_cfg.proposta_fotos then p.foto_caminho end, 'texto', p.descricao_catalogo,
        'garantia_meses', case when p.tipo = 'maquina' then coalesce(p.garantia_meses, v_cfg.garantia_meses_padrao) end) order by i.descricao)
      from pedido_itens i left join produtos p on p.id = i.produto_id where i.pedido_id = v_ped.id), '[]'::jsonb),
    'subtotal', v_ped.valor_produtos, 'desconto', v_ped.desconto, 'frete', v_ped.frete, 'total', v_ped.valor_total,
    'forma_pagamento', v_ped.forma_pagamento, 'parcelas', v_ped.parcelas, 'observacoes', v_ped.observacoes,
    'motivo_rejeicao', v_ped.motivo_rejeicao,
    'empresa', jsonb_build_object('nome', coalesce(v_cfg.nome_fantasia, v_cfg.razao_social), 'razao_social', v_cfg.razao_social, 'cnpj', v_cfg.cnpj,
      'whatsapp', v_cfg.whatsapp, 'telefone', v_cfg.telefone, 'email', v_cfg.email, 'endereco', v_cfg.endereco, 'municipio', v_cfg.municipio, 'uf', v_cfg.uf,
      'termo_garantia', v_cfg.termo_garantia),
    'layout', jsonb_build_object('titulo', v_cfg.proposta_titulo, 'apresentacao', v_cfg.proposta_apresentacao, 'condicoes', v_cfg.proposta_condicoes,
      'rodape', v_cfg.proposta_rodape, 'cor', v_cfg.proposta_cor));
end $$;

-- Resposta do cliente. Aprovada vira pedido de venda (baixa estoque e gera as parcelas).
create or replace function public.proposta_responder(p_token uuid, p_aprovar boolean, p_nome text, p_motivo text default null, p_texto text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; v_cli text;
begin
  select * into v_ped from pedidos where proposta_token = p_token for update;
  if not found or v_ped.proposta_status is null then raise exception 'proposta não encontrada'; end if;
  if v_ped.proposta_status not in ('enviada', 'visualizada') or v_ped.status <> 'orcamento' then raise exception 'esta proposta já foi respondida'; end if;
  if v_ped.proposta_validade < current_date then raise exception 'proposta vencida: peça uma nova ao vendedor'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'informe o seu nome'; end if;
  v_cli := (select nome from clientes where id = v_ped.cliente_id);

  if p_aprovar then
    update pedidos set proposta_status = 'aprovada', proposta_respondida_em = now(), proposta_resposta_nome = left(trim(p_nome), 120) where id = v_ped.id;
    perform public.aprovar_pedido_sistema(v_ped.id);
    perform notificar('proposta', 'Proposta #' || v_ped.numero || ' APROVADA', v_cli || ' · ' || brl(v_ped.valor_total) || ' · virou pedido', '/pedidos', '{vendas,financeiro}', v_ped.unidade_id);
    return 'aprovada';
  end if;

  if p_motivo is not null and p_motivo not in ('preco', 'prazo', 'frete', 'pagamento', 'concorrente', 'produto', 'desistiu', 'outro') then p_motivo := 'outro'; end if;
  update pedidos set proposta_status = 'rejeitada', proposta_respondida_em = now(), proposta_resposta_nome = left(trim(p_nome), 120),
    motivo_rejeicao = coalesce(p_motivo, 'outro'), motivo_rejeicao_texto = left(p_texto, 1000) where id = v_ped.id;
  perform notificar('proposta', 'Proposta #' || v_ped.numero || ' recusada', v_cli || coalesce(' · ' || left(p_texto, 80), ''), '/pedidos', '{vendas}', v_ped.unidade_id);
  return 'rejeitada';
end $$;

revoke execute on function public.proposta_publica(uuid) from public;
revoke execute on function public.proposta_responder(uuid, boolean, text, text, text) from public;
grant execute on function public.proposta_publica(uuid) to anon, authenticated;
grant execute on function public.proposta_responder(uuid, boolean, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Documentos anexados
-- ---------------------------------------------------------------------
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('pedido', 'os', 'cliente', 'fornecedor', 'produto', 'conta_receber', 'conta_pagar',
                                             'nfe_recebida', 'pedido_compra', 'equipamento', 'geral')),
  entidade_id uuid,
  nome text not null,
  caminho text not null unique,
  tamanho bigint,
  tipo text,
  descricao text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.documentos (entidade, entidade_id);
alter table public.documentos enable row level security;
-- documentos financeiros só para quem mexe no financeiro
create or replace function public.pode_ver_documento(p_entidade text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_erp_user() and (p_entidade not in ('conta_receber', 'conta_pagar', 'nfe_recebida') or public.tem_papel('financeiro'));
$$;
create policy "doc_select" on public.documentos for select to authenticated using (public.pode_ver_documento(entidade));
create policy "doc_insert" on public.documentos for insert to authenticated with check (public.pode_ver_documento(entidade) and created_by = auth.uid());
create policy "doc_update" on public.documentos for update to authenticated using (created_by = auth.uid() or public.is_erp_admin()) with check (public.pode_ver_documento(entidade));
create policy "doc_delete" on public.documentos for delete to authenticated using (created_by = auth.uid() or public.is_erp_admin());

insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)
on conflict (id) do nothing;
-- caminho: <entidade>/<id>/<arquivo>
create policy "documentos_ler" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.pode_ver_documento(split_part(name, '/', 1)));
create policy "documentos_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.pode_ver_documento(split_part(name, '/', 1)));
create policy "documentos_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (owner = auth.uid() or public.is_erp_admin()));

-- Marca a proposta como enviada (WhatsApp ou e-mail) e devolve o link do cliente
create or replace function public.marcar_proposta_enviada(p_pedido uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ped pedidos;
begin
  perform public.exigir_papel('vendas');
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'pedido não encontrado'; end if;
  if v_ped.status <> 'orcamento' then raise exception 'só orçamentos viram proposta'; end if;
  if v_ped.valor_total <= 0 then raise exception 'adicione os itens antes de enviar'; end if;
  update pedidos set proposta_status = 'enviada', proposta_enviada_em = now(),
    proposta_validade = case when proposta_validade >= current_date and proposta_status in ('enviada', 'visualizada') then proposta_validade
                             else current_date + (select validade_orcamento_dias from configuracoes where id = 1) end,
    proposta_visualizada_em = null, proposta_respondida_em = null, motivo_rejeicao = null, motivo_rejeicao_texto = null
  where id = p_pedido;
  return v_ped.proposta_token;
end $$;
revoke execute on function public.marcar_proposta_enviada(uuid) from public, anon;
grant execute on function public.marcar_proposta_enviada(uuid) to authenticated;
