-- =====================================================================
-- Portal do representante (rota /portal): o representante externo vê só o que é dele.
--  * Papel novo "representante" em usuarios_erp. Não soma com outros papéis e fica fora de is_erp_user():
--    nenhuma política das tabelas da empresa libera leitura ou escrita para ele (nem as Edge Functions,
--    que conferem is_erp_user / tem_algum_papel).
--  * Tudo o que ele vê ou grava passa pelas funções portal_* (security definer), sempre filtradas pelo
--    vendedor ligado ao login (vendedores.user_id = auth.uid()).
--  * Convite: em Comissões → Vendedores (ou Usuários) o administrador chama portal_convidar_representante e
--    cria o login pela função usuarios-admin (a mesma da tela de Usuários). O gatilho de usuarios_erp vê o
--    convite: o login já nasce como representante e ligado ao vendedor. Login que já existe:
--    portal_ligar_representante.
--  * Orçamento do portal: pedido em orçamento, origem "representante", via_portal = true, vendedor dele,
--    preço da tabela permitida e desconto dentro da regra de descontos (Configurações → Descontos, canal
--    Representante). Sem regra cadastrada, o portal não dá desconto. A empresa aprova pelo fluxo normal.
--  * Cliente novo do portal: entra na carteira dele com portal_conferir = true (a empresa confere).
--  * Vendas e meta: a mesma regra de metas_apuracao (pedidos aprovados, faturados ou entregues; NF-e de venda
--    sem pedido dos clientes da carteira; menos devoluções).
--  * Comissões: lançadas (liberada = a pagar, paga) e previstas (parcelas em aberto ou pedido aprovado ainda
--    sem comissão), com o mesmo % de lancar_comissao.
--  * clientes_fornecedores passa a exigir usuário do ERP (antes qualquer login lia a lista).
-- Só acrescenta: colunas novas, tabela nova, funções create or replace, gatilhos e regras novas. A regra de
-- papel (usuarios_erp_papel_check) é trocada pela mesma regra com os papéis novos, como em
-- 20261015201010_perfil_marketplace.sql. A lista já traz "compras" (outro trabalho em paralelo), para um não
-- tirar o papel do outro. Os papéis adicionais não mudam: o representante não é adicional.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Papel novo: regras de usuarios_erp
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check'
             and (pg_get_constraintdef(oid) not like '%compras%' or pg_get_constraintdef(oid) not like '%representante%')) then
    alter table public.usuarios_erp drop constraint usuarios_erp_papel_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_erp_papel_check') then
    alter table public.usuarios_erp add constraint usuarios_erp_papel_check
      check (papel in ('admin', 'vendas', 'financeiro', 'tecnico', 'contador', 'expedicao', 'marketplace', 'compras', 'representante'));
  end if;
end $$;

-- representante não tem papel adicional (os adicionais dariam acesso às telas e aos dados da empresa)
do $$ begin
  alter table public.usuarios_erp add constraint usuarios_erp_representante_sozinho
    check (papel <> 'representante' or coalesce(cardinality(papeis_extras), 0) = 0);
exception when duplicate_object then null; end $$;

-- Usuário do ERP para as regras gerais: o contador e o representante ficam de fora.
create or replace function public.is_erp_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp
                  where user_id = auth.uid() and ativo and papel not in ('contador', 'representante'));
$$;

-- ---------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------
-- tabela de preço que o representante usa no portal (vazia = preço de venda; a tabela do cliente vem antes)
alter table public.vendedores add column if not exists portal_tabela_preco_id uuid;
comment on column public.vendedores.portal_tabela_preco_id is 'Tabela de preço do portal do representante (vazia = preço de venda). A tabela do cliente, se houver, vale antes.';

-- orçamento que veio do portal do representante (marcador "Portal" na lista de vendas)
alter table public.pedidos add column if not exists via_portal boolean not null default false;
comment on column public.pedidos.via_portal is 'Orçamento enviado pelo representante no portal (/portal).';

-- cliente cadastrado pelo representante: a empresa confere os dados
alter table public.clientes add column if not exists portal_conferir boolean not null default false;
comment on column public.clientes.portal_conferir is 'Cadastrado pelo representante no portal: falta a empresa conferir.';

create index if not exists clientes_portal_conferir on public.clientes (portal_conferir) where portal_conferir;
create index if not exists pedidos_via_portal on public.pedidos (vendedor_id) where via_portal;

-- ---------------------------------------------------------------------
-- Convites do portal (o login criado com este e-mail nasce representante e ligado ao vendedor)
-- ---------------------------------------------------------------------
create table if not exists public.portal_convites (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedores(id),
  email text not null,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  usado_em timestamptz,
  user_id uuid,
  constraint portal_convites_email check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
comment on table public.portal_convites is 'Convites do portal do representante: o login criado com o e-mail (em até 2 horas) vira representante ligado ao vendedor.';
create index if not exists portal_convites_pendentes on public.portal_convites (email) where usado_em is null;

alter table public.portal_convites enable row level security;
revoke all on public.portal_convites from anon, authenticated;
grant select on public.portal_convites to authenticated;
grant all on public.portal_convites to service_role;

do $$ begin
  create policy portal_convites_select on public.portal_convites for select to authenticated using (public.is_erp_admin());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Gatilhos de usuarios_erp: convite e representante sem papéis adicionais
-- ---------------------------------------------------------------------
create or replace function public.trg_usuarios_representante()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conv uuid;
begin
  if tg_op = 'INSERT' then
    select c.id into v_conv
      from public.portal_convites c
      join auth.users u on lower(u.email) = c.email
     where u.id = new.user_id and c.usado_em is null and c.criado_em > now() - interval '2 hours'
     order by c.criado_em desc
     limit 1;
    if v_conv is not null then
      new.papel := 'representante';
      update public.portal_convites set usado_em = now(), user_id = new.user_id where id = v_conv;
    end if;
  end if;
  if new.papel = 'representante' then
    new.papeis_extras := '{}';
    new.unidade_id := null;
  end if;
  return new;
end $$;

-- depois de gravar o login: liga ao vendedor do convite (o vínculo precisa do usuário já gravado)
create or replace function public.trg_usuarios_representante_vinculo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.papel = 'representante' then
    perform set_config('erp.acao_usuario', 'on', true);
    update public.vendedores v set user_id = new.user_id
     where v.user_id is null
       and v.id = (select c.vendedor_id from public.portal_convites c
                    where c.user_id = new.user_id order by c.usado_em desc nulls last limit 1);
  end if;
  return null;
end $$;

revoke execute on function public.trg_usuarios_representante() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_representante_vinculo() from public, anon, authenticated;

create or replace trigger trg_usuarios_representante
  before insert or update on public.usuarios_erp
  for each row execute function public.trg_usuarios_representante();
create or replace trigger trg_usuarios_representante_vinculo
  after insert on public.usuarios_erp
  for each row execute function public.trg_usuarios_representante_vinculo();

-- ---------------------------------------------------------------------
-- Apoio (uso interno: não liberadas para o app)
-- ---------------------------------------------------------------------
-- vendedor do representante logado (vazio se o login não for representante ativo ligado a um vendedor ativo)
create or replace function public.portal_meu_vendedor()
returns uuid language sql stable security definer set search_path = public as $$
  select v.id
    from public.vendedores v
    join public.usuarios_erp u on u.user_id = v.user_id
   where v.user_id = auth.uid() and v.ativo and u.ativo and u.papel = 'representante'
   order by v.created_at
   limit 1;
$$;

create or replace function public.portal_vendedor_exigido()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.portal_meu_vendedor();
begin
  if v is null then
    raise exception 'acesso ao portal não liberado: peça à empresa para ligar o seu login ao seu cadastro de representante';
  end if;
  return v;
end $$;

-- pedidos do vendedor (a regra das metas): o vendedor do pedido; sem ele, o nome escrito no pedido;
-- sem nenhum, o vendedor da carteira do cliente
create or replace function public.portal_pedidos_ids(p_vendedor uuid)
returns table(pedido_id uuid) language sql stable security definer set search_path = public as $$
  select p.id
    from public.pedidos p
    left join public.clientes c on c.id = p.cliente_id
    left join lateral (
      select v.id from public.vendedores v
       where p.vendedor_id is null and btrim(coalesce(p.vendedor, '')) <> ''
         and public.sem_acento(btrim(v.nome)) = public.sem_acento(btrim(p.vendedor))
       order by v.ativo desc, v.created_at
       limit 1) vn on true
   where p_vendedor is not null and coalesce(p.vendedor_id, vn.id, c.vendedor_id) = p_vendedor;
$$;

-- Vendas do vendedor no período, com a regra de metas_apuracao (todas as unidades):
--   pedidos aprovados, faturados ou entregues, no dia da aprovação;
--   NF-e de venda autorizadas sem pedido dos clientes da carteira (na proporção dos itens de venda);
--   menos as devoluções de venda (NF-e de entrada ligada à venda), no dia da devolução (valor negativo).
create or replace function public.portal_vendas(p_vendedor uuid, p_de date, p_ate date)
returns table(dia date, valor numeric, cliente_id uuid, pedido_id uuid)
language sql stable security definer set search_path = public as $$
  with
  cli_doc as (
    select distinct on (x.d) x.d, x.id
      from (select regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g') d, coalesce(c.unificado_em, c.id) id, (c.unificado_em is null) nao_unif
              from public.clientes c) x
     where length(x.d) >= 11
     order by x.d, x.nao_unif desc
  ),
  ped as (
    select p.id, p.cliente_id,
           (coalesce(p.aprovado_em, p.created_at) at time zone 'America/Sao_Paulo')::date dia,
           coalesce(p.valor_total, 0)::numeric valor
      from public.pedidos p
      join public.portal_pedidos_ids(p_vendedor) i on i.pedido_id = p.id
     where p.status in ('aprovado', 'faturado', 'entregue')
  ),
  nf as (
    select n.id, (n.created_at at time zone 'America/Sao_Paulo')::date dia,
           coalesce(n.cliente_id, cd.id) cliente_id,
           coalesce(n.valor_total, 0)::numeric valor_total,
           case when jsonb_typeof(n.payload->'items') = 'array' then n.payload->'items' else '[]'::jsonb end itens
      from public.notas_fiscais n
      left join cli_doc cd on n.cliente_id is null and cd.d = regexp_replace(coalesce(n.destinatario_doc, ''), '\D', '', 'g')
      join public.clientes c on c.id = coalesce(n.cliente_id, cd.id)
     where n.status = 'autorizada' and coalesce(n.ambiente, 'producao') <> 'homologacao' and n.pedido_id is null
       and n.excluida_em is null and coalesce(n.tipo_operacao, 'saida') = 'saida' and coalesce(n.finalidade, 'normal') = 'normal'
       and c.vendedor_id = p_vendedor
  ),
  nf_venda as (
    select nf.id, nf.dia, nf.cliente_id,
           case when s.bruto_todos > 0 then nf.valor_total * s.bruto_venda / s.bruto_todos else nf.valor_total end valor
      from nf
      join lateral (
        select count(*) filter (where x.venda) itens_venda,
               sum(x.bruto) filter (where x.venda) bruto_venda,
               sum(x.bruto) bruto_todos
          from (select regexp_replace(coalesce(i->>'cfop', ''), '\D', '', 'g') ~ '^[567](10[0-9]|11[0-9]|12[0-5]|40[1-5])$' venda,
                       public.metas_num(i->>'valor_bruto') bruto
                  from jsonb_array_elements(nf.itens) i) x) s on true
     where s.itens_venda > 0
  ),
  vendas_todas as (
    select 'p:' || p.id::text ref, p.dia, p.valor, p.cliente_id, p.id pedido_id from ped p
    union all
    select 'n:' || n.id::text, n.dia, n.valor, n.cliente_id, null::uuid from nf_venda n
  ),
  dev as (
    select (d.created_at at time zone 'America/Sao_Paulo')::date dia, coalesce(d.valor_total, 0)::numeric valor, v.cliente_id, v.pedido_id
      from public.notas_fiscais d
      join public.notas_fiscais o on o.id = d.nota_referenciada_id
        or (d.nota_referenciada_id is null and nullif(btrim(coalesce(d.chave_referenciada, '')), '') is not null and o.chave = d.chave_referenciada)
      join vendas_todas v on v.ref = case when o.pedido_id is not null then 'p:' || o.pedido_id::text else 'n:' || o.id::text end
     where d.status = 'autorizada' and coalesce(d.ambiente, 'producao') <> 'homologacao' and d.excluida_em is null
       and d.finalidade = 'devolucao' and d.tipo_operacao = 'entrada'
  )
  select x.dia, round(x.valor, 2), x.cliente_id, x.pedido_id
    from (select v.dia, v.valor, v.cliente_id, v.pedido_id from vendas_todas v
          union all
          select d.dia, -d.valor, d.cliente_id, d.pedido_id from dev d) x
   where p_vendedor is not null and x.dia between p_de and p_ate;
$$;

-- tabela de preço que vale: a do cliente da carteira, senão a do representante (só tabela ativa)
create or replace function public.portal_tabela(p_vendedor uuid, p_cliente uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.id from public.clientes c join public.tabelas_preco t on t.id = c.tabela_preco_id and t.ativo
      where c.id = p_cliente and c.vendedor_id = p_vendedor),
    (select t.id from public.vendedores v join public.tabelas_preco t on t.id = v.portal_tabela_preco_id and t.ativo
      where v.id = p_vendedor));
$$;

-- Extrato de comissões do vendedor: lançadas (liberada = a pagar, paga) e previstas.
--   Prevista: parcela em aberto de pedido com comissão no recebimento, ou pedido aprovado ainda sem comissão
--   (sem parcelas, ou comissão no faturamento). Mesmo % e mesma base de lancar_comissao.
create or replace function public.portal_comissoes_linhas(p_vendedor uuid)
returns table(dia date, pedido_numero bigint, cliente text, descricao text, base numeric, percentual numeric, valor numeric, situacao text, pago_em date)
language sql stable security definer set search_path = public as $$
  with
  vend as (select * from public.vendedores where id = p_vendedor),
  peds as (
    select p.id, p.numero, p.status, p.valor_total, p.frete,
           (coalesce(p.aprovado_em, p.created_at) at time zone 'America/Sao_Paulo')::date aprovado,
           c.nome cliente,
           coalesce(p.comissao_percentual, public.comissao_percentual_pedido(p.id), vd.percentual) pct,
           case when vd.descontar_frete and coalesce(p.valor_total, 0) > 0
                then greatest(p.valor_total - coalesce(p.frete, 0), 0) / p.valor_total else 1 end fator,
           vd.base base_vendedor
      from public.pedidos p
      join vend vd on vd.id = p.vendedor_id
      left join public.clientes c on c.id = p.cliente_id
     where p.status in ('aprovado', 'faturado', 'entregue') and coalesce(p.valor_total, 0) > 0
  ),
  lancadas as (
    select (c.created_at at time zone 'America/Sao_Paulo')::date dia, p.numero, cl.nome cliente, c.descricao,
           c.base, c.percentual, c.valor, case c.status when 'paga' then 'paga' else 'liberada' end situacao, c.pago_em
      from public.comissoes c
      left join public.pedidos p on p.id = c.pedido_id
      left join public.clientes cl on cl.id = p.cliente_id
     where c.vendedor_id = p_vendedor and c.status <> 'cancelada'
  ),
  prev_parcelas as (
    select r.vencimento dia, pd.numero, pd.cliente, coalesce(r.descricao, 'Parcela') descricao,
           round(r.valor * pd.fator, 2) base, round(pd.pct, 2) percentual,
           round(round(r.valor * pd.fator, 2) * pd.pct / 100, 2) valor
      from peds pd
      join public.contas_receber r on r.pedido_id = pd.id and r.status = 'aberto'
     where pd.base_vendedor = 'recebimento' and pd.pct > 0
       and not exists (select 1 from public.comissoes c where c.conta_receber_id = r.id and c.status <> 'cancelada')
  ),
  prev_pedidos as (
    select pd.aprovado dia, pd.numero, pd.cliente, 'Pedido #' || pd.numero descricao,
           round(pd.valor_total * pd.fator, 2) base, round(pd.pct, 2) percentual,
           round(round(pd.valor_total * pd.fator, 2) * pd.pct / 100, 2) valor
      from peds pd
     where pd.pct > 0
       and not exists (select 1 from public.comissoes c where c.pedido_id = pd.id and c.status <> 'cancelada')
       and (pd.base_vendedor = 'faturamento'
            or not exists (select 1 from public.contas_receber r where r.pedido_id = pd.id and r.status <> 'cancelado'))
  )
  select l.dia, l.numero, l.cliente, l.descricao, l.base, l.percentual, l.valor, l.situacao, l.pago_em from lancadas l
  union all
  select x.dia, x.numero, x.cliente, x.descricao, x.base, x.percentual, x.valor, 'prevista', null::date from prev_parcelas x
  union all
  select y.dia, y.numero, y.cliente, y.descricao, y.base, y.percentual, y.valor, 'prevista', null::date from prev_pedidos y;
$$;

-- CPF ou CNPJ com os dígitos verificadores certos
create or replace function public.portal_doc_valido(p text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
  p1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  p2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
begin
  if length(d) = 11 then
    if d ~ '^(\d)\1{10}$' then return false; end if;
    s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif length(d) = 14 then
    if d ~ '^(\d)\1{13}$' then return false; end if;
    s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * p1[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * p2[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end $$;

revoke execute on function public.portal_meu_vendedor() from public, anon, authenticated;
revoke execute on function public.portal_vendedor_exigido() from public, anon, authenticated;
revoke execute on function public.portal_pedidos_ids(uuid) from public, anon, authenticated;
revoke execute on function public.portal_vendas(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.portal_tabela(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.portal_comissoes_linhas(uuid) from public, anon, authenticated;
revoke execute on function public.portal_doc_valido(text) from public, anon;
grant execute on function public.portal_doc_valido(text) to authenticated;

-- ---------------------------------------------------------------------
-- Portal: leitura (só o que é do representante logado)
-- ---------------------------------------------------------------------
-- quem sou no portal (vinculado false: login sem vendedor ligado ou que não é representante)
create or replace function public.portal_acesso()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
              'vinculado', true, 'vendedor_id', v.id, 'nome', v.nome, 'percentual', v.percentual, 'base', v.base,
              'tabela', (select t.nome from public.tabelas_preco t where t.id = v.portal_tabela_preco_id and t.ativo))
       from public.vendedores v where v.id = public.portal_meu_vendedor()),
    jsonb_build_object('vinculado', false));
$$;

-- Resumo: vendas do mês e do ano, meta do mês, comissões e pedidos em aberto
create or replace function public.portal_resumo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_vend uuid := public.portal_vendedor_exigido();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_ano date := date_trunc('year', (now() at time zone 'America/Sao_Paulo'))::date;
  v_vendas jsonb;
  v_meta numeric;
  v_com jsonb;
  v_ped jsonb;
begin
  select jsonb_build_object(
           'mes', coalesce(sum(x.valor) filter (where x.dia >= v_mes), 0),
           'ano', coalesce(sum(x.valor), 0),
           'pedidos_mes', count(*) filter (where x.dia >= v_mes and x.valor > 0))
    into v_vendas
    from public.portal_vendas(v_vend, v_ano, (v_ano + interval '1 year' - interval '1 day')::date) x;

  -- meta do mês: a de "todas as unidades" ou a soma das unidades (como em metas_apuracao)
  select case when bool_or(m.unidade_id is null) then max(m.meta_valor) filter (where m.unidade_id is null) else sum(m.meta_valor) end
    into v_meta
    from public.metas_vendas m
   where m.ativo and m.tipo = 'vendedor' and m.vendedor_id = v_vend and m.mes = v_mes;

  select jsonb_build_object(
           'a_receber', coalesce(sum(c.valor) filter (where c.situacao = 'liberada'), 0),
           'recebidas_ano', coalesce(sum(c.valor) filter (where c.situacao = 'paga' and coalesce(c.pago_em, c.dia) >= v_ano), 0),
           'previstas', coalesce(sum(c.valor) filter (where c.situacao = 'prevista'), 0))
    into v_com
    from public.portal_comissoes_linhas(v_vend) c;

  select jsonb_build_object(
           'orcamentos', count(*) filter (where p.status = 'orcamento'),
           'orcamentos_valor', coalesce(sum(p.valor_total) filter (where p.status = 'orcamento'), 0),
           'aprovados', count(*) filter (where p.status = 'aprovado'),
           'faturados', count(*) filter (where p.status = 'faturado'),
           'em_aberto_valor', coalesce(sum(p.valor_total) filter (where p.status in ('aprovado', 'faturado')), 0))
    into v_ped
    from public.pedidos p
    join public.portal_pedidos_ids(v_vend) i on i.pedido_id = p.id
   where p.status in ('orcamento', 'aprovado', 'faturado');

  return jsonb_build_object('hoje', v_hoje, 'mes', v_mes, 'vendas', v_vendas, 'meta_mes', v_meta, 'comissoes', v_com, 'pedidos', v_ped);
end $$;

-- Meus pedidos: situação, valor, cliente, NF-e ligada e rastreio
create or replace function public.portal_pedidos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_vend uuid := public.portal_vendedor_exigido();
begin
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
      from (
        select p.id, p.numero, p.status, p.created_at criado_em, p.aprovado_em, p.valor_total total, p.via_portal,
               c.nome cliente, c.municipio, c.uf,
               (select count(*) from public.pedido_itens it where it.pedido_id = p.id) itens,
               nf.numero nf_numero, nf.serie nf_serie, nf.created_at nf_em,
               coalesce(nullif(btrim(e.codigo_rastreio), ''), nullif(btrim(p.codigo_rastreio), '')) rastreio,
               coalesce(nullif(btrim(e.transportadora_nome), ''), t.nome) transportadora,
               e.status envio_status, e.entrega_prevista, e.entregue_em
          from public.pedidos p
          join public.portal_pedidos_ids(v_vend) i on i.pedido_id = p.id
          left join public.clientes c on c.id = p.cliente_id
          left join public.transportadoras t on t.id = p.transportadora_id
          left join lateral (
            select n.numero, n.serie, n.created_at from public.notas_fiscais n
             where n.pedido_id = p.id and n.status = 'autorizada' and n.excluida_em is null
               and coalesce(n.ambiente, 'producao') <> 'homologacao' and coalesce(n.finalidade, 'normal') = 'normal'
             order by n.created_at desc limit 1) nf on true
          left join lateral (
            select en.codigo_rastreio, en.transportadora_nome, en.status, en.entrega_prevista, en.entregue_em from public.envios en
             where en.pedido_id = p.id and en.status <> 'cancelado'
             order by en.created_at desc limit 1) e on true
         order by p.created_at desc
         limit 500) x), '[]'::jsonb);
end $$;

-- Detalhe de um pedido dele, com os itens (sem custo)
create or replace function public.portal_pedido(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_vend uuid := public.portal_vendedor_exigido();
  v jsonb;
begin
  if not exists (select 1 from public.portal_pedidos_ids(v_vend) i where i.pedido_id = p_id) then
    raise exception 'pedido não encontrado';
  end if;
  select jsonb_build_object(
           'id', p.id, 'numero', p.numero, 'status', p.status, 'criado_em', p.created_at, 'aprovado_em', p.aprovado_em,
           'via_portal', p.via_portal, 'cliente', c.nome, 'municipio', c.municipio, 'uf', c.uf,
           'forma_pagamento', coalesce(f.nome, p.forma_pagamento), 'parcelas', p.parcelas,
           'valor_produtos', p.valor_produtos, 'desconto', p.desconto, 'frete', p.frete, 'total', p.valor_total,
           'observacoes', p.observacoes,
           'nf', (select jsonb_build_object('numero', n.numero, 'serie', n.serie, 'em', n.created_at)
                    from public.notas_fiscais n
                   where n.pedido_id = p.id and n.status = 'autorizada' and n.excluida_em is null
                     and coalesce(n.ambiente, 'producao') <> 'homologacao' and coalesce(n.finalidade, 'normal') = 'normal'
                   order by n.created_at desc limit 1),
           'envio', (select jsonb_build_object('status', en.status,
                              'rastreio', coalesce(nullif(btrim(en.codigo_rastreio), ''), nullif(btrim(p.codigo_rastreio), '')),
                              'transportadora', coalesce(nullif(btrim(en.transportadora_nome), ''), t.nome),
                              'entrega_prevista', en.entrega_prevista, 'entregue_em', en.entregue_em)
                       from public.envios en
                      where en.pedido_id = p.id and en.status <> 'cancelado'
                      order by en.created_at desc limit 1),
           'rastreio', nullif(btrim(p.codigo_rastreio), ''), 'transportadora', t.nome,
           'itens', coalesce((select jsonb_agg(jsonb_build_object('descricao', it.descricao, 'quantidade', it.quantidade,
                                                                   'valor_unitario', it.valor_unitario, 'valor_total', it.valor_total)
                                              order by it.descricao)
                                from public.pedido_itens it where it.pedido_id = p.id), '[]'::jsonb))
    into v
    from public.pedidos p
    left join public.clientes c on c.id = p.cliente_id
    left join public.formas_pagamento f on f.id = p.forma_pagamento_id
    left join public.transportadoras t on t.id = p.transportadora_id
   where p.id = p_id;
  return v;
end $$;

-- Minhas comissões: extrato (lançadas e previstas)
create or replace function public.portal_comissoes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_vend uuid := public.portal_vendedor_exigido();
begin
  return coalesce((
    select jsonb_agg(to_jsonb(c) order by c.dia desc, c.pedido_numero desc)
      from (select * from public.portal_comissoes_linhas(v_vend) limit 5000) c), '[]'::jsonb);
end $$;

-- Meus clientes: a carteira, com a última compra e o total comprado no ano (só as vendas dele)
create or replace function public.portal_clientes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_vend uuid := public.portal_vendedor_exigido();
  v_ano date := date_trunc('year', (now() at time zone 'America/Sao_Paulo'))::date;
begin
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.nome)
      from (
        select c.id, c.nome, c.nome_fantasia, c.municipio, c.uf, c.portal_conferir conferir,
               s.ultima ultima_compra, coalesce(s.total_ano, 0) total_ano
          from public.clientes c
          left join (
            select y.cliente_id, max(y.dia) filter (where y.valor > 0) ultima, sum(y.valor) filter (where y.dia >= v_ano) total_ano
              from public.portal_vendas(v_vend, date '1900-01-01', (v_ano + interval '1 year' - interval '1 day')::date) y
             group by y.cliente_id) s on s.cliente_id = c.id
         where c.vendedor_id = v_vend and c.arquivado_em is null and c.unificado_em is null) x), '[]'::jsonb);
end $$;

-- Formas de pagamento das vendas, com o desconto máximo do portal (regra do canal Representante; sem regra, 0)
create or replace function public.portal_formas_pagamento()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_vend uuid := public.portal_vendedor_exigido();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'nome', f.nome, 'meio', f.meio, 'parcelas', f.parcelas, 'intervalo_dias', f.intervalo_dias,
             'primeiro_em_dias', f.primeiro_em_dias,
             'desconto_max', coalesce(public.desconto_maximo('representante', f.meio), 0)) order by f.ordem, f.nome)
      from public.formas_pagamento f
     where v_vend is not null and f.ativo and f.uso <> 'pagar' and f.meio in ('boleto', 'pix', 'cartao', 'dinheiro', 'transferencia')), '[]'::jsonb);
end $$;

-- Produtos ativos e vendáveis, com o preço da tabela permitida (sem custo e sem o estoque: só disponível ou sob consulta)
create or replace function public.portal_produtos(p_busca text, p_cliente uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_vend uuid := public.portal_vendedor_exigido();
  v_tab uuid := public.portal_tabela(v_vend, p_cliente);
  v_termos text[] := array(select w from regexp_split_to_table(public.sem_acento(btrim(left(coalesce(p_busca, ''), 80))), '\s+') w where w <> '');
begin
  return coalesce((
    select jsonb_agg(to_jsonb(y) order by y.descricao)
      from (
        select p.id, p.descricao, p.sku, p.modelo, p.marca, p.unidade, pr.preco,
               case when p.estoque_atual > 0 and not p.sob_encomenda then 'disponivel' else 'sob_consulta' end disponibilidade
          from public.produtos p
          cross join lateral (
            select round(case when v_tab is null then p.preco_venda else public.preco_tabela(v_tab, p.id) end, 2) preco) pr
         where p.ativo and p.vendavel and p.unificado_em is null and (not p.fora_de_linha or p.estoque_atual > 0)
           and pr.preco > 0
           and (cardinality(v_termos) = 0
                or (select bool_and(public.sem_acento(concat_ws(' ', p.descricao, p.sku, p.modelo, p.marca, p.codigo_fabricante))
                                    like '%' || w || '%') from unnest(v_termos) w))
         order by p.descricao
         limit 40) y), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Portal: gravação
-- ---------------------------------------------------------------------
-- Cliente novo na carteira do representante (a empresa confere depois: portal_conferir)
--   p: { nome, cpf_cnpj, municipio, uf, whatsapp, email? } (WhatsApp obrigatório; e-mail opcional)
create or replace function public.portal_salvar_cliente(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_vend uuid := public.portal_vendedor_exigido();
  v_nome_vend text;
  v_nome text := left(btrim(coalesce(p->>'nome', '')), 120);
  v_doc text := regexp_replace(coalesce(p->>'cpf_cnpj', ''), '\D', '', 'g');
  v_cidade text := left(btrim(coalesce(p->>'municipio', '')), 80);
  v_uf text := upper(btrim(coalesce(p->>'uf', '')));
  v_whats text := public.whatsapp_de(coalesce(p->>'whatsapp', p->>'telefone'));
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_id uuid;
begin
  if length(v_nome) < 3 then raise exception 'informe o nome do cliente'; end if;
  if not public.portal_doc_valido(v_doc) then raise exception 'CPF ou CNPJ inválido'; end if;
  if length(v_cidade) < 2 then raise exception 'informe a cidade'; end if;
  if v_uf !~ '^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$' then raise exception 'UF inválida'; end if;
  if v_whats is null then raise exception 'informe o WhatsApp (celular) com DDD'; end if;
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'e-mail inválido'; end if;
  -- não diz de quem é o cadastro: só que já existe
  if exists (select 1 from public.clientes c where regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g') = v_doc) then
    raise exception 'este CPF/CNPJ já tem cadastro na empresa: peça à empresa para ligar o cliente à sua carteira';
  end if;

  select nome into v_nome_vend from public.vendedores where id = v_vend;
  perform set_config('erp.acao_usuario', 'on', true);
  insert into public.clientes (tipo_pessoa, nome, cpf_cnpj, municipio, uf, telefone, whatsapp, email, vendedor_id, portal_conferir, observacoes)
  values (case when length(v_doc) = 14 then 'PJ' else 'PF' end, v_nome, v_doc, v_cidade, v_uf, v_whats, v_whats, v_email, v_vend, true,
          'Cadastrado pelo representante ' || coalesce(v_nome_vend, '') || ' no portal em '
            || to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY') || ': conferir os dados.')
  returning id into v_id;

  perform public.notificar('outro', 'Cliente novo do portal do representante',
    concat_ws(' · ', v_nome, v_cidade || '/' || v_uf, v_nome_vend), '/clientes', '{vendas}', null);
  return v_id;
end $$;

-- Novo orçamento (pedido em orçamento; a empresa aprova pelo fluxo normal)
--   p: { cliente_id, forma_pagamento_id, desconto_pct?, observacoes?, itens: [{ produto_id, quantidade }] }
--   O preço vem da tabela permitida (o que vier do app é ignorado); desconto acima da regra não grava.
create or replace function public.portal_salvar_orcamento(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_vend uuid := public.portal_vendedor_exigido();
  v public.vendedores;
  v_cli public.clientes;
  v_forma public.formas_pagamento;
  v_tab uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pct numeric;
  v_max numeric;
  v_obs text := left(nullif(btrim(coalesce(p->>'observacoes', '')), ''), 2000);
  e jsonb;
  v_prod_id uuid;
  v_prod_desc text;
  v_qtd numeric;
  v_preco numeric;
  v_itens jsonb := '[]'::jsonb;
  v_sub numeric := 0;
  v_desc numeric;
  v_ped uuid;
  v_num bigint;
  v_total numeric;
begin
  select * into v from public.vendedores where id = v_vend;

  select * into v_cli from public.clientes where id = nullif(p->>'cliente_id', '')::uuid;
  if not found or v_cli.vendedor_id is distinct from v_vend or v_cli.arquivado_em is not null or v_cli.unificado_em is not null then
    raise exception 'escolha um cliente da sua carteira';
  end if;

  select * into v_forma from public.formas_pagamento
   where id = nullif(p->>'forma_pagamento_id', '')::uuid and ativo and uso <> 'pagar'
     and meio in ('boleto', 'pix', 'cartao', 'dinheiro', 'transferencia');
  if not found then raise exception 'escolha a forma de pagamento'; end if;

  if jsonb_typeof(p->'itens') is distinct from 'array' then raise exception 'inclua ao menos um produto'; end if;
  if jsonb_array_length(p->'itens') = 0 then raise exception 'inclua ao menos um produto'; end if;
  if jsonb_array_length(p->'itens') > 60 then raise exception 'no máximo 60 itens por orçamento'; end if;

  v_pct := round(coalesce(nullif(btrim(coalesce(p->>'desconto_pct', '')), '')::numeric, 0), 2);
  if v_pct < 0 or v_pct > 100 then raise exception 'desconto inválido'; end if;
  v_max := coalesce(public.desconto_maximo('representante', v_forma.meio), 0);
  if v_pct > v_max + 0.005 then
    raise exception 'desconto de % acima do máximo de % para esta forma de pagamento: fale com a empresa',
      public.percentual_br(v_pct), public.percentual_br(v_max);
  end if;

  v_tab := public.portal_tabela(v_vend, v_cli.id);
  for e in select x from jsonb_array_elements(p->'itens') x loop
    v_qtd := round(nullif(btrim(coalesce(e->>'quantidade', '')), '')::numeric, 3);
    if v_qtd is null or v_qtd <= 0 or v_qtd > 100000 then raise exception 'quantidade inválida'; end if;
    select pr.id, pr.descricao into v_prod_id, v_prod_desc
      from public.produtos pr
     where pr.id = nullif(e->>'produto_id', '')::uuid and pr.ativo and pr.vendavel and pr.unificado_em is null
       and (not pr.fora_de_linha or pr.estoque_atual > 0);
    if not found then raise exception 'produto indisponível no portal'; end if;
    v_preco := round(case when v_tab is null then (select preco_venda from public.produtos where id = v_prod_id)
                          else public.preco_tabela(v_tab, v_prod_id) end, 2);
    if coalesce(v_preco, 0) <= 0 then raise exception 'produto "%" sem preço: fale com a empresa', v_prod_desc; end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', v_prod_id, 'descricao', v_prod_desc, 'quantidade', v_qtd, 'preco', v_preco));
    v_sub := v_sub + round(v_qtd * v_preco, 2);
  end loop;
  v_desc := round(v_sub * v_pct / 100, 2);

  perform set_config('erp.acao_usuario', 'on', true);
  insert into public.pedidos (cliente_id, origem, status, vendedor, vendedor_id, forma_pagamento, forma_pagamento_id,
                              parcelas, intervalo_dias, primeiro_vencimento, desconto, frete, observacoes, tabela_preco_id, via_portal)
  values (v_cli.id, 'representante', 'orcamento', v.nome, v.id, v_forma.meio, v_forma.id,
          v_forma.parcelas, v_forma.intervalo_dias, v_hoje + v_forma.primeiro_em_dias, v_desc, 0, v_obs, v_tab, true)
  returning id, numero into v_ped, v_num;

  insert into public.pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
  select v_ped, (x->>'produto_id')::uuid, x->>'descricao', (x->>'quantidade')::numeric, (x->>'preco')::numeric
    from jsonb_array_elements(v_itens) x;

  select valor_total into v_total from public.pedidos where id = v_ped;
  perform public.notificar('outro', 'Orçamento do portal do representante',
    concat_ws(' · ', 'Pedido #' || v_num, v.nome, v_cli.nome, public.brl(v_total)), '/pedidos', '{vendas}', null);
  return jsonb_build_object('id', v_ped, 'numero', v_num, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------
-- Empresa: convidar e ligar o login do representante (só administrador)
-- ---------------------------------------------------------------------
-- Guarda o convite. Em seguida a tela cria o login pela função usuarios-admin com o mesmo e-mail:
-- o gatilho troca o papel para representante e liga o login ao vendedor.
create or replace function public.portal_convidar_representante(p_vendedor uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v public.vendedores;
  v_id uuid;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador convida representantes'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'e-mail inválido'; end if;
  select * into v from public.vendedores where id = p_vendedor;
  if not found or not v.ativo then raise exception 'vendedor não encontrado ou inativo'; end if;
  if v.user_id is not null then raise exception 'este vendedor já tem login ligado'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'já existe um login com este e-mail: use "Ligar login que já existe"';
  end if;
  insert into public.portal_convites (vendedor_id, email) values (v.id, v_email) returning id into v_id;
  return v_id;
end $$;

-- Login que já existe vira representante, ligado ao vendedor (sai de outros vendedores)
create or replace function public.portal_ligar_representante(p_vendedor uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.vendedores;
  u public.usuarios_erp;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador liga representantes'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'escolha outro login: você não pode tirar o seu próprio acesso'; end if;
  select * into u from public.usuarios_erp where user_id = p_user;
  if not found then raise exception 'login não encontrado'; end if;
  if u.papel = 'admin' then raise exception 'administrador não vira representante: mude o papel em Usuários antes'; end if;
  select * into v from public.vendedores where id = p_vendedor;
  if not found or not v.ativo then raise exception 'vendedor não encontrado ou inativo'; end if;
  if v.user_id is not null and v.user_id <> p_user then raise exception 'este vendedor já está ligado a outro login'; end if;

  perform set_config('erp.acao_usuario', 'on', true);
  update public.usuarios_erp set papel = 'representante', papeis_extras = '{}', unidade_id = null
   where user_id = p_user and papel is distinct from 'representante';
  update public.vendedores set user_id = null where user_id = p_user and id <> p_vendedor;
  update public.vendedores set user_id = p_user where id = p_vendedor and user_id is distinct from p_user;
end $$;

-- ---------------------------------------------------------------------
-- Lista de clientes x fornecedores: só usuário do ERP (antes qualquer login lia)
-- ---------------------------------------------------------------------
create or replace function public.clientes_fornecedores()
returns table(id uuid, codigo integer, nome text, cpf_cnpj text, motivo text, tem_movimento boolean, ja_e_fornecedor boolean)
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
           or exists (select 1 from notas_fiscais n where n.destinatario_doc = c.doc),
         c.doc in (select doc from f) or c.doc in (select doc from t)
    from c
   where public.is_erp_user()
     and length(c.doc) >= 11 and (c.doc in (select doc from f) or c.doc in (select doc from t) or c.doc in (select doc from e))
   order by c.nome
$$;

-- ---------------------------------------------------------------------
-- Permissões das funções do portal
-- ---------------------------------------------------------------------
revoke execute on function public.portal_acesso() from public, anon;
revoke execute on function public.portal_resumo() from public, anon;
revoke execute on function public.portal_pedidos() from public, anon;
revoke execute on function public.portal_pedido(uuid) from public, anon;
revoke execute on function public.portal_comissoes() from public, anon;
revoke execute on function public.portal_clientes() from public, anon;
revoke execute on function public.portal_formas_pagamento() from public, anon;
revoke execute on function public.portal_produtos(text, uuid) from public, anon;
revoke execute on function public.portal_salvar_cliente(jsonb) from public, anon;
revoke execute on function public.portal_salvar_orcamento(jsonb) from public, anon;
revoke execute on function public.portal_convidar_representante(uuid, text) from public, anon;
revoke execute on function public.portal_ligar_representante(uuid, uuid) from public, anon;
revoke execute on function public.clientes_fornecedores() from public, anon;

grant execute on function public.portal_acesso() to authenticated;
grant execute on function public.portal_resumo() to authenticated;
grant execute on function public.portal_pedidos() to authenticated;
grant execute on function public.portal_pedido(uuid) to authenticated;
grant execute on function public.portal_comissoes() to authenticated;
grant execute on function public.portal_clientes() to authenticated;
grant execute on function public.portal_formas_pagamento() to authenticated;
grant execute on function public.portal_produtos(text, uuid) to authenticated;
grant execute on function public.portal_salvar_cliente(jsonb) to authenticated;
grant execute on function public.portal_salvar_orcamento(jsonb) to authenticated;
grant execute on function public.portal_convidar_representante(uuid, text) to authenticated;
grant execute on function public.portal_ligar_representante(uuid, uuid) to authenticated;
grant execute on function public.clientes_fornecedores() to authenticated;
