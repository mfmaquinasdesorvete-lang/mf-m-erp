-- =====================================================================
-- ERP Line
--   * aparência (tema e cor) salva por usuário
--   * notificações na tela (pagamento recebido, pedido da loja, e-mail)
--   * loja virtual: o cliente se cadastra, faz o pedido e acompanha
--   * NF-e de entrada importando o XML (arquivo ou anexo de e-mail)
--   * caixa de entrada de e-mail (IMAP) dentro do ERP
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aparência por usuário
-- ---------------------------------------------------------------------
alter table public.usuarios_erp
  add column preferencias jsonb not null default '{}'::jsonb,       -- { "tema": "escuro", "destaque": "ciano" }
  add column notificacoes_vistas_em timestamptz not null default now();

create or replace function public.salvar_preferencias(p jsonb)
returns void language sql security definer set search_path = public as $$
  update public.usuarios_erp set preferencias = preferencias || coalesce(p, '{}'::jsonb) where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- Notificações na tela (aparecem na hora para quem está com o ERP aberto)
-- ---------------------------------------------------------------------
create table public.notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('pagamento', 'pedido_loja', 'email', 'outro')),
  titulo text not null,
  texto text,
  link text,                         -- tela do ERP para abrir (ex.: /pedidos)
  unidade_id uuid references public.unidades(id),
  papeis text[] not null default '{}',   -- quem vê (admin sempre); vazio = todos
  created_at timestamptz not null default now()
);
create index on public.notificacoes (created_at desc);

-- R$ 1.234,56
create or replace function public.brl(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;

create or replace function public.notificar(p_tipo text, p_titulo text, p_texto text, p_link text, p_papeis text[], p_unidade uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notificacoes (tipo, titulo, texto, link, papeis, unidade_id) values (p_tipo, p_titulo, p_texto, p_link, coalesce(p_papeis, '{}'), p_unidade);
$$;

create or replace function public.marcar_notificacoes_vistas()
returns void language sql security definer set search_path = public as $$
  update public.usuarios_erp set notificacoes_vistas_em = now() where user_id = auth.uid();
$$;

-- Pagamento recebido -> notificação para financeiro e vendas
create or replace function public.trg_notifica_pagamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare cli text;
begin
  if new.status = 'pago' and old.status is distinct from 'pago' then
    select nome into cli from clientes where id = new.cliente_id;
    perform public.notificar('pagamento', 'Pagamento recebido: ' || public.brl(coalesce(new.valor_pago, new.valor)),
      concat_ws(' · ', cli, new.descricao), '/financeiro', '{financeiro,vendas}', new.unidade_id);
  end if;
  return null;
end $$;
create trigger trg_notifica_pagamento after update on public.contas_receber
for each row execute function public.trg_notifica_pagamento();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.notificacoes';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Loja virtual: conta do cliente e pedidos
-- ---------------------------------------------------------------------
create table public.loja_clientes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id),
  created_at timestamptz not null default now()
);

alter table public.pedidos add column loja_user_id uuid references auth.users(id);
alter table public.configuracoes
  add column loja_unidade_id uuid references public.unidades(id),     -- vazio = matriz
  add column loja_mensagem_pedido text default 'Recebemos seu pedido! Nossa equipe vai confirmar o frete e a forma de pagamento pelo WhatsApp.';

insert into public.avisos_tipos (tipo, publico, titulo, descricao, papeis, ativo, ordem)
values ('pedido_loja', 'equipe', 'Pedido na loja virtual', 'Cliente fez um pedido pelo site', '{vendas}', true, 3)
on conflict (tipo) do nothing;

-- Cadastro de quem está logado na loja (null se ainda não preencheu)
create or replace function public.loja_meu_cadastro()
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'observacoes' - 'email_token'
    from public.loja_clientes l join public.clientes c on c.id = l.cliente_id
   where l.user_id = auth.uid();
$$;

-- Cria ou atualiza o cadastro do cliente da loja
create or replace function public.loja_salvar_cadastro(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cli uuid;
  v_doc text := regexp_replace(coalesce(p->>'cpf_cnpj', ''), '\D', '', 'g');
  v_email text := (select email from auth.users where id = auth.uid());
begin
  if auth.uid() is null then raise exception 'entre na sua conta primeiro'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ inválido'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'informe o nome'; end if;

  select cliente_id into v_cli from loja_clientes where user_id = auth.uid();
  if v_cli is not null then
    update clientes set
      nome = trim(p->>'nome'), tipo_pessoa = case when length(v_doc) = 14 then 'PJ' else 'PF' end,
      inscricao_estadual = nullif(trim(p->>'inscricao_estadual'), ''),
      whatsapp = nullif(trim(p->>'whatsapp'), ''), telefone = nullif(trim(p->>'telefone'), ''),
      cep = nullif(p->>'cep', ''), logradouro = nullif(p->>'logradouro', ''), numero = nullif(p->>'numero', ''),
      complemento = nullif(p->>'complemento', ''), bairro = nullif(p->>'bairro', ''),
      municipio = nullif(p->>'municipio', ''), uf = upper(nullif(p->>'uf', ''))
     where id = v_cli;
    return v_cli;
  end if;

  -- já é cliente da MF (mesmo CPF/CNPJ): liga a conta sem mexer nos dados que a equipe já tem
  select id into v_cli from clientes where regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = v_doc limit 1;
  if v_cli is not null then
    update clientes set
      email = coalesce(email, v_email), whatsapp = coalesce(whatsapp, nullif(trim(p->>'whatsapp'), '')),
      cep = coalesce(cep, nullif(p->>'cep', '')), logradouro = coalesce(logradouro, nullif(p->>'logradouro', '')),
      numero = coalesce(numero, nullif(p->>'numero', '')), bairro = coalesce(bairro, nullif(p->>'bairro', '')),
      municipio = coalesce(municipio, nullif(p->>'municipio', '')), uf = coalesce(uf, upper(nullif(p->>'uf', '')))
     where id = v_cli;
  else
    insert into clientes (tipo_pessoa, nome, cpf_cnpj, inscricao_estadual, contribuinte_icms, email, whatsapp, telefone,
                          cep, logradouro, numero, complemento, bairro, municipio, uf, observacoes)
    values (case when length(v_doc) = 14 then 'PJ' else 'PF' end, trim(p->>'nome'), v_doc, nullif(trim(p->>'inscricao_estadual'), ''),
            case when length(v_doc) = 14 and nullif(trim(p->>'inscricao_estadual'), '') is not null then 1 else 9 end,
            v_email, nullif(trim(p->>'whatsapp'), ''), nullif(trim(p->>'telefone'), ''),
            nullif(p->>'cep', ''), nullif(p->>'logradouro', ''), nullif(p->>'numero', ''), nullif(p->>'complemento', ''),
            nullif(p->>'bairro', ''), nullif(p->>'municipio', ''), upper(nullif(p->>'uf', '')), 'Cadastro feito pela loja virtual')
    returning id into v_cli;
  end if;
  insert into loja_clientes (user_id, cliente_id) values (auth.uid(), v_cli);
  return v_cli;
end $$;

-- Pedido da loja: preços e produtos conferidos aqui (o navegador não decide preço)
create or replace function public.loja_criar_pedido(p_itens jsonb, p_observacoes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cli uuid; v_nome text; v_ped record; v_it jsonb; v_prod record; v_qtd numeric; v_n int := 0; v_total numeric;
  v_unidade uuid := coalesce((select loja_unidade_id from configuracoes where id = 1), public.unidade_matriz());
begin
  select l.cliente_id, c.nome into v_cli, v_nome from loja_clientes l join clientes c on c.id = l.cliente_id where l.user_id = auth.uid();
  if v_cli is null then raise exception 'complete o seu cadastro antes de fazer o pedido'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'carrinho vazio'; end if;

  insert into pedidos (cliente_id, origem, status, forma_pagamento, parcelas, observacoes, unidade_id, loja_user_id, vendedor)
  values (v_cli, 'loja', 'orcamento', 'pix', 1, left(nullif(trim(p_observacoes), ''), 1000), v_unidade, auth.uid(), 'Loja virtual')
  returning id, numero into v_ped;

  for v_it in select * from jsonb_array_elements(p_itens) loop
    v_qtd := floor(coalesce((v_it->>'quantidade')::numeric, 0));
    continue when v_qtd <= 0;
    if v_qtd > 99 then raise exception 'quantidade muito alta: fale com a nossa equipe'; end if;
    select id, descricao, preco_venda into v_prod from produtos
     where id = (v_it->>'produto_id')::uuid and ativo and no_catalogo and foto_caminho is not null and preco_venda > 0;
    if not found then raise exception 'um dos produtos não está mais disponível na loja'; end if;
    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, valor_unitario)
    values (v_ped.id, v_prod.id, v_prod.descricao, v_qtd, v_prod.preco_venda);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'carrinho vazio'; end if;

  select valor_total into v_total from pedidos where id = v_ped.id;
  perform public.notificar('pedido_loja', 'Novo pedido na loja: #' || v_ped.numero,
    v_nome || ' · ' || public.brl(v_total), '/pedidos', '{vendas}', v_unidade);
  perform public.avisar_equipe('pedido_loja', 'loja:' || v_ped.id,
    jsonb_build_object('numero', v_ped.numero, 'cliente', v_nome, 'valor', v_total, 'itens', v_n));
  return jsonb_build_object('numero', v_ped.numero, 'total', v_total);
end $$;

create or replace function public.loja_meus_pedidos()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', p.numero, 'data', p.created_at, 'status', p.status, 'total', p.valor_total, 'frete', p.frete,
           'rastreio', p.codigo_rastreio,
           'itens', (select jsonb_agg(jsonb_build_object('descricao', i.descricao, 'quantidade', i.quantidade, 'valor', i.valor_total))
                       from pedido_itens i where i.pedido_id = p.id))
         order by p.created_at desc), '[]'::jsonb)
    from pedidos p where p.loja_user_id = auth.uid() and auth.uid() is not null;
$$;

-- Cliente da loja nunca vira administrador do ERP (proteção do primeiro acesso)
create or replace function public.reivindicar_primeiro_admin(p_nome text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.loja_clientes where user_id = auth.uid()) then return false; end if;
  if (select raw_user_meta_data->>'tipo' from auth.users where id = auth.uid()) = 'cliente_loja' then return false; end if;
  lock table public.usuarios_erp in exclusive mode;
  if exists (select 1 from public.usuarios_erp) then return false; end if;
  insert into public.usuarios_erp (user_id, nome, papel)
  values (auth.uid(), coalesce(nullif(trim(p_nome), ''), 'Administrador'), 'admin');
  return true;
end $$;

-- ---------------------------------------------------------------------
-- NF-e de entrada pelo XML (arquivo enviado ou anexo de e-mail)
-- ---------------------------------------------------------------------
alter table public.nfe_recebidas
  add column xml text,
  add column origem text not null default 'sefaz' check (origem in ('sefaz', 'xml'));

-- ---------------------------------------------------------------------
-- Caixa de entrada de e-mail
-- ---------------------------------------------------------------------
create table public.email_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                       -- ex.: Comercial
  email text not null unique,
  imap_host text not null,
  imap_porta int not null default 993,
  smtp_host text,
  smtp_porta int not null default 465,
  usuario text not null,
  senha text not null,                      -- só as funções do servidor leem (sem acesso pelo navegador)
  unidade_id uuid references public.unidades(id),
  papeis text[] not null default '{vendas,financeiro}',
  ativo boolean not null default true,
  ultimo_uid bigint not null default 0,
  uid_validade bigint,
  sincronizado_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.email_contas(id) on delete cascade,
  uid bigint not null,
  message_id text,
  de_nome text,
  de_email text,
  para text,
  cc text,
  assunto text,
  data timestamptz,
  previa text,
  texto text,
  html text,
  anexos jsonb not null default '[]'::jsonb,   -- [{ indice, nome, tipo, tamanho, nfe }]
  lido boolean not null default false,
  arquivado boolean not null default false,
  cliente_id uuid references public.clientes(id) on delete set null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  respondido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (conta_id, uid)
);
create index on public.emails (conta_id, data desc);
create index on public.emails (lower(de_email));

-- Quem pode ver uma caixa
create or replace function public.pode_ver_email(p_conta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from email_contas c join usuarios_erp u on u.user_id = auth.uid() and u.ativo
                  where c.id = p_conta and (u.papel = 'admin' or u.papel = any(c.papeis)));
$$;

alter table public.email_contas enable row level security;
create policy "erp_select" on public.email_contas for select to authenticated using (public.pode_ver_email(id));
revoke all on public.email_contas from anon, authenticated;
grant select (id, nome, email, imap_host, imap_porta, smtp_host, smtp_porta, usuario, unidade_id, papeis, ativo, sincronizado_em, erro, created_at)
  on public.email_contas to authenticated;

alter table public.emails enable row level security;
create policy "erp_select" on public.emails for select to authenticated using (public.pode_ver_email(conta_id));
create policy "erp_update" on public.emails for update to authenticated using (public.pode_ver_email(conta_id)) with check (public.pode_ver_email(conta_id));
revoke update on public.emails from authenticated;
grant update (lido, arquivado, cliente_id, fornecedor_id) on public.emails to authenticated;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
alter table public.notificacoes enable row level security;
create policy "erp_select" on public.notificacoes for select to authenticated using (
  public.is_erp_user() and (public.is_erp_admin() or papeis = '{}' or public.tem_papel(variadic papeis)));

alter table public.loja_clientes enable row level security;
create policy "erp_select" on public.loja_clientes for select to authenticated using (public.is_erp_user() or user_id = auth.uid());

revoke execute on function public.notificar(text, text, text, text, text[], uuid) from public, anon, authenticated;
revoke execute on function public.salvar_preferencias(jsonb) from public, anon;
revoke execute on function public.marcar_notificacoes_vistas() from public, anon;
revoke execute on function public.loja_meu_cadastro() from public, anon;
revoke execute on function public.loja_salvar_cadastro(jsonb) from public, anon;
revoke execute on function public.loja_criar_pedido(jsonb, text) from public, anon;
revoke execute on function public.loja_meus_pedidos() from public, anon;
grant execute on function public.salvar_preferencias(jsonb) to authenticated;
grant execute on function public.marcar_notificacoes_vistas() to authenticated;
grant execute on function public.loja_meu_cadastro() to authenticated;
grant execute on function public.loja_salvar_cadastro(jsonb) to authenticated;
grant execute on function public.loja_criar_pedido(jsonb, text) to authenticated;
grant execute on function public.loja_meus_pedidos() to authenticated;
