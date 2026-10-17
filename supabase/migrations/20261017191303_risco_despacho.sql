-- =====================================================================
-- Conferência de risco antes de despachar (vendas pagas por cartão ou por link)
--  * risco_pedido_calc: pontos e motivos de um pedido pago (ou a pagar) por cartão ou pago por link — pagamento sem
--    baixa, primeira compra, valor alto, valor fora do padrão do cliente, CPF/CNPJ ausente ou irregular na Receita,
--    endereço incompleto, sem contato, e-mail/telefone de outro cliente, vários pedidos seguidos e cartão em 6x ou mais.
--    Vendas do Mercado Livre (origem marketplace) ficam de fora: o pagamento e a análise são do Mercado Pago;
--  * conferencias_risco: a decisão de quem conferiu (aprovada ou recusada), com o que foi conferido e o valor do pedido
--    naquela hora (mudou o valor, confere de novo);
--  * gatilho em expedicoes: não deixa despachar com risco no limite ou acima sem aprovação (vale para qualquer tela) e
--    avisa o financeiro quando o pedido entra na expedição precisando de conferência;
--  * configuracoes: risco_ativo, risco_valor_alto e risco_pontos_travar.
-- Somente acréscimos.
-- =====================================================================

alter table public.configuracoes
  add column if not exists risco_ativo boolean not null default true,
  add column if not exists risco_valor_alto numeric not null default 3000,
  add column if not exists risco_pontos_travar integer not null default 25;

comment on column public.configuracoes.risco_ativo is 'Conferência de risco antes de despachar vendas por cartão ou link';
comment on column public.configuracoes.risco_valor_alto is 'Valor a partir do qual a venda soma pontos de risco';
comment on column public.configuracoes.risco_pontos_travar is 'Pontos de risco a partir dos quais o despacho espera a aprovação';

create table if not exists public.conferencias_risco (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references public.pedidos(id) on delete cascade,
  situacao text not null check (situacao in ('aprovada', 'recusada')),
  pontos integer not null,
  nivel text not null check (nivel in ('baixo', 'medio', 'alto')),
  motivos jsonb not null default '[]'::jsonb,
  valor_conferido numeric not null,
  observacao text not null check (char_length(btrim(observacao)) >= 5),
  decidido_por uuid,
  decidido_por_nome text,
  decidido_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.conferencias_risco is 'Conferência de risco antes de despachar: quem aprovou ou recusou, o que conferiu e o valor do pedido na hora';

alter table public.conferencias_risco enable row level security;
create policy conferencias_risco_ler on public.conferencias_risco for select to authenticated using (public.is_erp_user());
revoke all on public.conferencias_risco from anon;
revoke insert, update, delete, truncate, references, trigger on public.conferencias_risco from authenticated;
grant select on public.conferencias_risco to authenticated;

-- ---------------------------------------------------------------------
-- Cálculo (sem conferir quem chama: usado pelo gatilho e pelas funções abaixo)
-- ---------------------------------------------------------------------
create or replace function public.risco_pedido_calc(p_pedido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p pedidos; c clientes; v_ativo boolean; v_valor_alto numeric; v_limite integer;
  v_cartao boolean; v_link_pago boolean; v_recebido boolean;
  v_motivos jsonb := '[]'::jsonb; v_pontos integer := 0;
  v_anteriores integer; v_media numeric; v_seguidos integer; v_parcelas integer;
  v_doc text; v_fone text; v_nivel text; v_travar boolean; v_conf conferencias_risco;
begin
  select * into p from pedidos where id = p_pedido;
  if not found then return null; end if;
  select coalesce(risco_ativo, true), coalesce(risco_valor_alto, 3000), coalesce(risco_pontos_travar, 25)
    into v_ativo, v_valor_alto, v_limite from configuracoes where id = 1;
  v_ativo := coalesce(v_ativo, true); v_valor_alto := coalesce(v_valor_alto, 3000); v_limite := coalesce(v_limite, 25);
  select * into c from clientes where id = p.cliente_id;

  v_cartao := p.forma_pagamento = 'cartao'
    or exists (select 1 from formas_pagamento f where f.id = p.forma_pagamento_id and f.meio = 'cartao')
    or exists (select 1 from contas_receber r where r.pedido_id = p.id and r.status <> 'cancelado' and r.forma_pagamento like 'cartao%');
  v_link_pago := exists (
    select 1 from cobrancas_link l left join contas_receber r on r.id = l.conta_receber_id
     where (l.pedido_id = p.id or r.pedido_id = p.id) and l.status = 'pago');

  if not (v_cartao or v_link_pago) or coalesce(p.origem, '') = 'marketplace' or p.status = 'cancelado' then
    return jsonb_build_object('elegivel', false, 'pontos', 0, 'nivel', 'baixo', 'motivos', '[]'::jsonb, 'travar', false,
      'ativo', v_ativo, 'limite', v_limite, 'conferencia', null);
  end if;

  -- pagamento sem baixa: cartão ou link sem nenhuma parcela recebida
  v_recebido := v_link_pago or exists (select 1 from contas_receber r where r.pedido_id = p.id and r.status = 'pago');
  if not v_recebido then
    v_pontos := v_pontos + 40;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'pagamento', 'pontos', 40, 'texto', 'Pagamento por cartão ou link ainda sem baixa no ERP');
  end if;

  -- primeira compra ou valor fora do padrão do cliente
  select count(*), avg(o.valor_total) into v_anteriores, v_media
    from pedidos o
   where o.cliente_id = p.cliente_id and o.id <> p.id and o.created_at < p.created_at
     and o.status not in ('cancelado', 'orcamento') and o.excluida_em is null;
  if v_anteriores = 0 then
    v_pontos := v_pontos + 25;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'cliente_novo', 'pontos', 25, 'texto', 'Primeira compra do cliente');
  elsif coalesce(v_media, 0) > 0 and p.valor_total >= 3 * v_media then
    v_pontos := v_pontos + 15;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'fora_do_padrao', 'pontos', 15,
      'texto', 'Valor ' || round(p.valor_total / v_media, 1) || ' vezes a média das compras do cliente (' || public.brl(v_media) || ')');
  end if;

  if p.valor_total >= v_valor_alto then
    v_pontos := v_pontos + 20;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'valor_alto', 'pontos', 20, 'texto', 'Valor a partir de ' || public.brl(v_valor_alto));
  end if;

  -- documento e situação na Receita
  v_doc := regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g');
  if length(v_doc) not in (11, 14) then
    v_pontos := v_pontos + 30;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'sem_documento', 'pontos', 30, 'texto', 'Cliente sem CPF/CNPJ válido no cadastro');
  elsif upper(coalesce(c.receita_situacao, '')) in ('BAIXADA', 'INAPTA', 'SUSPENSA', 'NULA', 'NAO_ENCONTRADO') then
    v_pontos := v_pontos + 35;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'receita', 'pontos', 35,
      'texto', 'CNPJ ' || lower(replace(c.receita_situacao, '_', ' ')) || ' na Receita');
  end if;

  if coalesce(btrim(c.logradouro), '') = '' or coalesce(btrim(c.municipio), '') = '' or coalesce(btrim(c.uf), '') = ''
     or length(regexp_replace(coalesce(c.cep, ''), '\D', '', 'g')) <> 8 then
    v_pontos := v_pontos + 15;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'endereco', 'pontos', 15, 'texto', 'Endereço do cadastro incompleto');
  end if;

  v_fone := right(regexp_replace(coalesce(nullif(c.whatsapp, ''), c.telefone, ''), '\D', '', 'g'), 10);
  if coalesce(btrim(c.email), '') = '' and length(v_fone) < 10 then
    v_pontos := v_pontos + 10;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'contato', 'pontos', 10, 'texto', 'Sem e-mail e sem telefone no cadastro');
  end if;

  if c.id is not null and exists (
    select 1 from clientes o
     where o.id <> c.id and o.unificado_em is null
       and ((coalesce(btrim(c.email), '') <> '' and lower(btrim(o.email)) = lower(btrim(c.email)))
         or (length(v_fone) = 10 and right(regexp_replace(coalesce(nullif(o.whatsapp, ''), o.telefone, ''), '\D', '', 'g'), 10) = v_fone))) then
    v_pontos := v_pontos + 15;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'dados_repetidos', 'pontos', 15, 'texto', 'E-mail ou telefone igual ao de outro cliente');
  end if;

  select count(*) into v_seguidos from pedidos o
   where o.cliente_id = p.cliente_id and o.id <> p.id and o.status <> 'cancelado' and o.excluida_em is null
     and abs(extract(epoch from (o.created_at - p.created_at))) <= 48 * 3600;
  if v_seguidos >= 2 then
    v_pontos := v_pontos + 20;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'seguidos', 'pontos', 20, 'texto', v_seguidos || ' outros pedidos do mesmo cliente em 48 horas');
  end if;

  v_parcelas := greatest(
    coalesce((select max(l.parcelas) from cobrancas_link l left join contas_receber r on r.id = l.conta_receber_id
               where (l.pedido_id = p.id or r.pedido_id = p.id) and l.status = 'pago' and lower(coalesce(l.metodo, '')) <> 'pix'), 0),
    case when v_cartao then coalesce(p.parcelas, 1) else 0 end);
  if v_parcelas >= 6 then
    v_pontos := v_pontos + 10;
    v_motivos := v_motivos || jsonb_build_object('codigo', 'parcelas', 'pontos', 10, 'texto', 'Cartão em ' || v_parcelas || 'x');
  end if;

  v_nivel := case when v_pontos >= 50 then 'alto' when v_pontos >= 25 then 'medio' else 'baixo' end;
  select * into v_conf from conferencias_risco where pedido_id = p.id;
  v_travar := v_ativo and (
    coalesce(v_conf.situacao = 'recusada', false)
    or (v_pontos >= v_limite and not coalesce(v_conf.situacao = 'aprovada' and v_conf.valor_conferido = p.valor_total, false)));

  return jsonb_build_object(
    'elegivel', true, 'pontos', v_pontos, 'nivel', v_nivel, 'motivos', v_motivos, 'travar', coalesce(v_travar, false),
    'ativo', v_ativo, 'limite', v_limite, 'meio', case when v_cartao then 'cartao' else 'link' end,
    'conferencia', case when v_conf.id is null then null else jsonb_build_object(
      'situacao', v_conf.situacao, 'por', v_conf.decidido_por_nome, 'em', v_conf.decidido_em, 'observacao', v_conf.observacao,
      'pontos', v_conf.pontos, 'valor', v_conf.valor_conferido, 'valor_mudou', v_conf.valor_conferido <> p.valor_total) end);
end $$;

revoke execute on function public.risco_pedido_calc(uuid) from public, anon, authenticated;
grant execute on function public.risco_pedido_calc(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Para as telas
-- ---------------------------------------------------------------------
create or replace function public.risco_pedido(p_pedido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;
  return public.risco_pedido_calc(p_pedido);
end $$;

-- Pedidos na expedição (ainda não despachados) que passam pela conferência
create or replace function public.riscos_para_despachar()
returns table (pedido_id uuid, numero bigint, cliente text, valor numeric, etapa text, pontos integer, nivel text,
               travar boolean, situacao text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;
  return query
    select e.pedido_id, p.numero, coalesce(nullif(btrim(cl.nome_fantasia), ''), cl.nome), p.valor_total, e.status,
           (x.r ->> 'pontos')::integer, x.r ->> 'nivel', (x.r ->> 'travar')::boolean, x.r -> 'conferencia' ->> 'situacao'
      from expedicoes e
      join pedidos p on p.id = e.pedido_id
      left join clientes cl on cl.id = p.cliente_id
      cross join lateral (select public.risco_pedido_calc(e.pedido_id) as r) x
     where e.status in ('separar', 'separando', 'conferido', 'embalado')
       and coalesce((x.r ->> 'elegivel')::boolean, false)
     order by (x.r ->> 'travar')::boolean desc, (x.r ->> 'pontos')::integer desc;
end $$;

-- Aprovar ou recusar (financeiro ou administrador), com o que foi conferido
create or replace function public.decidir_risco(p_pedido uuid, p_decisao text, p_observacao text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_r jsonb; v_valor numeric; v_nome text;
begin
  if not public.tem_papel('financeiro') then raise exception 'só o financeiro ou o administrador decide a conferência de risco'; end if;
  if p_decisao not in ('aprovada', 'recusada') then raise exception 'decisão inválida'; end if;
  if char_length(btrim(coalesce(p_observacao, ''))) < 5 then raise exception 'escreva o que foi conferido (pelo menos 5 letras)'; end if;
  v_r := public.risco_pedido_calc(p_pedido);
  if v_r is null then raise exception 'pedido não encontrado'; end if;
  if not coalesce((v_r ->> 'elegivel')::boolean, false) then raise exception 'este pedido não passa pela conferência de risco'; end if;
  if exists (select 1 from expedicoes where pedido_id = p_pedido and status in ('despachado', 'entregue')) then
    raise exception 'o pedido já foi despachado';
  end if;
  select valor_total into v_valor from pedidos where id = p_pedido;
  select nome into v_nome from usuarios_erp where user_id = auth.uid();
  insert into conferencias_risco (pedido_id, situacao, pontos, nivel, motivos, valor_conferido, observacao, decidido_por, decidido_por_nome)
  values (p_pedido, p_decisao, (v_r ->> 'pontos')::integer, v_r ->> 'nivel', v_r -> 'motivos', v_valor,
          left(btrim(p_observacao), 1000), auth.uid(), v_nome)
  on conflict (pedido_id) do update set
    situacao = excluded.situacao, pontos = excluded.pontos, nivel = excluded.nivel, motivos = excluded.motivos,
    valor_conferido = excluded.valor_conferido, observacao = excluded.observacao, decidido_por = excluded.decidido_por,
    decidido_por_nome = excluded.decidido_por_nome, decidido_em = now();
  return public.risco_pedido_calc(p_pedido);
end $$;

revoke execute on function public.risco_pedido(uuid) from public, anon;
revoke execute on function public.riscos_para_despachar() from public, anon;
revoke execute on function public.decidir_risco(uuid, text, text) from public, anon;
grant execute on function public.risco_pedido(uuid) to authenticated, service_role;
grant execute on function public.riscos_para_despachar() to authenticated, service_role;
grant execute on function public.decidir_risco(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Gatilho: trava o despacho e avisa o financeiro na entrada da expedição
-- ---------------------------------------------------------------------
create or replace function public.trg_expedicao_risco()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_r jsonb; v_num bigint;
begin
  if tg_op = 'INSERT' then
    v_r := public.risco_pedido_calc(new.pedido_id);
    if coalesce((v_r ->> 'travar')::boolean, false) and jsonb_typeof(v_r -> 'conferencia') is distinct from 'object' then
      select numero into v_num from pedidos where id = new.pedido_id;
      perform public.notificar('pagamento', 'Conferir risco antes de despachar',
        'Pedido #' || v_num || ': risco ' || case v_r ->> 'nivel' when 'medio' then 'médio' else v_r ->> 'nivel' end
          || ' (' || (v_r ->> 'pontos') || ' pontos). Aprove ou recuse antes do despacho.',
        '/fluxo', '{financeiro}', new.unidade_id);
    end if;
  elsif new.status = 'despachado' and old.status is distinct from 'despachado' then
    v_r := public.risco_pedido_calc(new.pedido_id);
    if coalesce((v_r ->> 'travar')::boolean, false) then
      if v_r -> 'conferencia' ->> 'situacao' = 'recusada' then
        raise exception 'conferência de risco recusada: este pedido não pode ser despachado';
      end if;
      raise exception 'conferência de risco pendente (% pontos, risco %): o financeiro precisa aprovar antes de despachar',
        v_r ->> 'pontos', case v_r ->> 'nivel' when 'medio' then 'médio' else v_r ->> 'nivel' end;
    end if;
  end if;
  return new;
end $$;

create or replace trigger expedicao_risco
  before insert or update of status on public.expedicoes
  for each row execute function public.trg_expedicao_risco();
