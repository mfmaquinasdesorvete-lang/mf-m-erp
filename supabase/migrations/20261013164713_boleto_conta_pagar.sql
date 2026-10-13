-- Boleto na conta a pagar: linha digitável (só números), multa e juros que o boleto traz e conferência de pagamento
-- (o mesmo boleto em outra conta ou uma saída do mesmo valor no extrato). A linha digitável conta como documento nas
-- pendências do fluxo de aprovação e o mesmo boleto lançado duas vezes é "possível duplicidade". Só acrescenta.

alter table public.contas_pagar add column if not exists linha_digitavel text;
alter table public.contas_pagar add column if not exists boleto_multa_pct numeric(6,3);
alter table public.contas_pagar add column if not exists boleto_juros_mes_pct numeric(6,3);
alter table public.contas_pagar add column if not exists boleto_juros_dia numeric(12,2);

comment on column public.contas_pagar.linha_digitavel is 'Linha digitável do boleto, só números (47 bancário, 48 arrecadação)';
comment on column public.contas_pagar.boleto_multa_pct is 'Multa por atraso que o boleto traz (%); vazio = 2%';
comment on column public.contas_pagar.boleto_juros_mes_pct is 'Juros de mora ao mês que o boleto traz (%); vazio = 1%';
comment on column public.contas_pagar.boleto_juros_dia is 'Juros de mora em R$ por dia, quando o boleto traz assim (substitui o percentual)';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_linha_digitavel_formato') then
    alter table public.contas_pagar add constraint contas_pagar_linha_digitavel_formato
      check (linha_digitavel is null or linha_digitavel ~ '^([0-9]{47}|8[0-9]{47})$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contas_pagar_boleto_encargos') then
    alter table public.contas_pagar add constraint contas_pagar_boleto_encargos
      check (coalesce(boleto_multa_pct, 0) between 0 and 20 and coalesce(boleto_juros_mes_pct, 0) between 0 and 20 and coalesce(boleto_juros_dia, 0) >= 0);
  end if;
end $$;

create index if not exists contas_pagar_linha_digitavel_idx on public.contas_pagar (linha_digitavel) where linha_digitavel is not null;

-- pendências: a linha digitável vale como documento; o mesmo boleto em outra conta (fora restantes de baixa parcial) é duplicidade
create or replace function public.pendencias_conta_dados(p_tabela text, p_c jsonb)
returns text[]
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_out text[] := '{}';
  v_id uuid := (p_c->>'id')::uuid;
  v_origem uuid := (p_c->>'conta_origem_id')::uuid;
  v_valor numeric := (p_c->>'valor')::numeric;
  v_venc date := (p_c->>'vencimento')::date;
  v_cat text := lower(btrim(coalesce(p_c->>'categoria', '')));
  v_linha text := nullif(btrim(coalesce(p_c->>'linha_digitavel', '')), '');
  v_anexo boolean;
begin
  if p_tabela = 'contas_pagar' then
    v_anexo := exists (select 1 from documentos d where d.entidade = 'conta_pagar' and d.entidade_id in (v_id, v_origem));
    if coalesce(btrim(p_c->>'documento'), '') = '' and v_linha is null and p_c->>'nfe_recebida_id' is null and not v_anexo
       and v_cat not in ('tarifas bancárias', 'juros e multas', 'comissoes') then
      v_out := array_append(v_out, 'sem_documento');
    end if;
    if not exists (select 1 from categorias_financeiras c where c.ativo and c.tipo = 'despesa' and lower(c.nome) = v_cat) then
      v_out := array_append(v_out, 'categoria');
    end if;
    if exists (select 1 from contas_pagar o
                where o.id <> v_id and o.status <> 'cancelado' and o.valor = v_valor and abs(o.vencimento - v_venc) <= 5
                  and o.conta_origem_id is distinct from v_id and o.id is distinct from v_origem
                  and case when p_c->>'fornecedor_id' is not null then o.fornecedor_id = (p_c->>'fornecedor_id')::uuid
                           else o.fornecedor_id is null and lower(btrim(o.descricao)) = lower(btrim(p_c->>'descricao')) end)
       or (v_linha is not null and v_origem is null and exists (
             select 1 from contas_pagar o
              where o.id <> v_id and o.status <> 'cancelado' and o.linha_digitavel = v_linha and o.conta_origem_id is null)) then
      v_out := array_append(v_out, 'duplicidade');
    end if;
  elsif p_tabela = 'contas_receber' then
    v_anexo := exists (select 1 from documentos d where d.entidade = 'conta_receber' and d.entidade_id in (v_id, v_origem));
    if p_c->>'pedido_id' is null and p_c->>'os_id' is null and p_c->>'nota_fiscal_id' is null and p_c->>'nfse_id' is null
       and not v_anexo and v_cat not in ('receitas financeiras') then
      v_out := array_append(v_out, 'sem_documento');
    end if;
    if not exists (select 1 from categorias_financeiras c where c.ativo and c.tipo = 'receita' and lower(c.nome) = v_cat) then
      v_out := array_append(v_out, 'categoria');
    end if;
    if p_c->>'cliente_id' is not null and exists (select 1 from contas_receber o
                where o.id <> v_id and o.status <> 'cancelado' and o.valor = v_valor and abs(o.vencimento - v_venc) <= 5
                  and o.cliente_id = (p_c->>'cliente_id')::uuid
                  and o.conta_origem_id is distinct from v_id and o.id is distinct from v_origem
                  and (p_c->>'pedido_id' is null or o.pedido_id is distinct from (p_c->>'pedido_id')::uuid)) then
      v_out := array_append(v_out, 'duplicidade');
    end if;
  else
    raise exception 'tabela inválida';
  end if;
  return v_out;
end $function$;

-- "Este boleto já foi pago?": outras contas com a mesma linha digitável e saídas no extrato do valor do boleto (até 15% a
-- mais, por juros e multa) perto do vencimento. Roda com as permissões de quem pergunta (cada um vê o que já podia ver).
create or replace function public.boleto_conferir(p_linha text, p_valor numeric, p_vencimento date, p_conta uuid default null)
returns jsonb
language sql stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'contas', coalesce((
      select jsonb_agg(s.x order by s.criado) from (
        select jsonb_build_object('id', c.id, 'descricao', c.descricao, 'status', c.status, 'valor', c.valor, 'valor_pago', c.valor_pago,
                                  'data_pagamento', c.data_pagamento, 'vencimento', c.vencimento) as x, c.created_at as criado
          from contas_pagar c
         where nullif(btrim(p_linha), '') is not null and c.linha_digitavel = btrim(p_linha)
           and c.id is distinct from p_conta and c.status <> 'cancelado'
           and (p_conta is null or c.conta_origem_id is distinct from p_conta)
         order by c.created_at limit 20) s), '[]'::jsonb),
    'extrato', coalesce((
      select jsonb_agg(s.x order by s.dist) from (
        select jsonb_build_object('id', e.id, 'data', e.data, 'valor', -e.valor, 'descricao', e.descricao, 'banco', b.nome,
                                  'conta_pagar_id', e.conta_pagar_id) as x,
               abs(e.data - coalesce(p_vencimento, current_date)) as dist
          from extrato_lancamentos e left join contas_bancarias b on b.id = e.conta_bancaria_id
         where coalesce(p_valor, 0) > 0 and e.valor < 0
           and (-e.valor between p_valor and round(p_valor * 1.15, 2) or (p_conta is not null and e.conta_pagar_id = p_conta))
           and e.data between coalesce(p_vencimento, current_date) - 15 and coalesce(p_vencimento, current_date) + 60
         order by 2 limit 10) s), '[]'::jsonb)
  );
$function$;

revoke all on function public.boleto_conferir(text, numeric, date, uuid) from public, anon;
grant execute on function public.boleto_conferir(text, numeric, date, uuid) to authenticated;
