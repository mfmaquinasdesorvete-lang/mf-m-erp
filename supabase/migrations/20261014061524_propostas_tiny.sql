-- Propostas comerciais do Tiny (histórico): as da MF (com valores) e as da My Frost, empresa anterior.
-- As da My Frost entram sem valores, sem desconto, frete ou observações, e só de quem já é cliente do ERP
-- (não cria cadastro de quem só pediu orçamento). Vendas → Propostas do Tiny e ficha do cliente.
-- Aditiva: tabela nova, função de importação e clientes_com_historico() passa a contar as propostas.

create table if not exists public.propostas_tiny (
  id uuid primary key default gen_random_uuid(),
  empresa text not null check (empresa in ('mf', 'my_frost')),
  tiny_id text not null,
  numero int,
  data date,
  proximo_contato date,
  situacao text,
  vendedor text,
  cliente_id uuid references public.clientes(id) on delete set null,
  contato_nome text,
  aos_cuidados text,
  unidade_id uuid references public.unidades(id) on delete set null,
  validade_dias int,
  prazo_entrega text,
  observacoes text,
  desconto numeric(14, 2),
  frete numeric(14, 2),
  total numeric(14, 2),
  itens jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa, tiny_id),
  constraint propostas_tiny_my_frost_sem_valores
    check (empresa = 'mf' or (desconto is null and frete is null and total is null and observacoes is null))
);

create index if not exists propostas_tiny_cliente_idx on public.propostas_tiny (cliente_id);
create index if not exists propostas_tiny_data_idx on public.propostas_tiny (data desc);

alter table public.propostas_tiny enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'propostas_tiny' and policyname = 'propostas_tiny_ler') then
    create policy propostas_tiny_ler on public.propostas_tiny for select to authenticated using (public.is_erp_user());
  end if;
end $$;
revoke insert, update, delete on public.propostas_tiny from anon, authenticated;
grant select on public.propostas_tiny to authenticated;

-- Importação (só administrador), de 1 a 500 propostas por vez. Reimportar atualiza (mesma empresa + ID do Tiny).
-- p_propostas: [{tiny_id, numero, data, proximo_contato, situacao, vendedor, contato_id, nome, tipo_pessoa, cpf_cnpj, ie,
--   cep, municipio, uf, endereco, numero_end, complemento, bairro, fone, celular, email, aos_cuidados, validade,
--   prazo_entrega, observacoes, desconto, frete, itens[{descricao, quantidade, valor_unitario, tiny_produto_id}]}]
create or replace function public.importar_propostas_tiny(p_empresa text, p_propostas jsonb, p_unidade uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p jsonb; it jsonb; v_mf boolean; v_cli uuid; v_doc text; v_ext text; v_itens jsonb; v_prod uuid; v_sub numeric;
  v_desc numeric; v_frete numeric; v_ins boolean; v_unid uuid;
  v_novas int := 0; v_atualizadas int := 0; v_clientes_novos int := 0; v_sem_cliente int := 0; v_erros jsonb := '[]'::jsonb;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa as propostas do Tiny'; end if;
  if p_empresa is null or p_empresa not in ('mf', 'my_frost') then raise exception 'empresa deve ser mf ou my_frost'; end if;
  if jsonb_typeof(p_propostas) is distinct from 'array' or jsonb_array_length(p_propostas) not between 1 and 500 then
    raise exception 'envie de 1 a 500 propostas por vez';
  end if;
  v_mf := p_empresa = 'mf';
  if v_mf and p_unidade is not null then select id into v_unid from unidades where id = p_unidade; end if;

  for p in select * from jsonb_array_elements(p_propostas) loop
    begin
      if nullif(btrim(coalesce(p->>'tiny_id', '')), '') is null then raise exception 'proposta sem ID do Tiny'; end if;
      v_doc := nullif(regexp_replace(coalesce(p->>'cpf_cnpj', ''), '\D', '', 'g'), '');
      if v_doc is not null and length(v_doc) not in (11, 14) then v_doc := null; end if;
      v_ext := nullif(btrim(coalesce(p->>'contato_id', '')), '');
      if v_ext is not null and not v_mf then v_ext := 'myfrost:' || v_ext; end if;

      -- o cliente: pelo código do Tiny, depois pelo CPF/CNPJ; unificado vale o que ficou
      v_cli := null;
      if v_ext is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where id_externo = v_ext order by arquivado_em nulls first limit 1;
      end if;
      if v_cli is null and v_doc is not null then
        select coalesce(unificado_em, id) into v_cli from clientes where cpf_cnpj = v_doc order by arquivado_em nulls first limit 1;
      end if;

      if v_cli is null and not v_mf then
        -- My Frost: só de quem já é cliente (a base da My Frost entra pela importação própria)
        v_sem_cliente := v_sem_cliente + 1;
        continue;
      end if;
      if v_cli is null then
        if nullif(btrim(coalesce(p->>'nome', '')), '') is null then raise exception 'proposta sem cliente'; end if;
        insert into clientes (tipo_pessoa, nome, cpf_cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero,
                              complemento, bairro, municipio, uf, id_externo)
        values (case when length(v_doc) = 11 or (v_doc is null and p->>'tipo_pessoa' = 'F') then 'PF' else 'PJ' end,
                left(btrim(p->>'nome'), 200), v_doc,
                nullif(left(btrim(coalesce(p->>'ie', '')), 30), ''),
                nullif(left(btrim(coalesce(p->>'email', '')), 200), ''),
                nullif(left(btrim(coalesce(p->>'fone', '')), 40), ''),
                nullif(left(btrim(coalesce(p->>'celular', '')), 40), ''),
                nullif(left(regexp_replace(coalesce(p->>'cep', ''), '\D', '', 'g'), 8), ''),
                nullif(left(btrim(coalesce(p->>'endereco', '')), 200), ''),
                nullif(left(btrim(coalesce(p->>'numero_end', '')), 20), ''),
                nullif(left(btrim(coalesce(p->>'complemento', '')), 100), ''),
                nullif(left(btrim(coalesce(p->>'bairro', '')), 100), ''),
                nullif(left(btrim(coalesce(p->>'municipio', '')), 100), ''),
                nullif(upper(left(btrim(coalesce(p->>'uf', '')), 2)), ''),
                v_ext)
        returning id into v_cli;
        v_clientes_novos := v_clientes_novos + 1;
      end if;

      -- itens: na MF com valor e o produto do ERP (pelo código do Tiny); na My Frost só descrição e quantidade
      v_itens := '[]'::jsonb; v_sub := 0;
      for it in select * from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) loop
        continue when nullif(btrim(coalesce(it->>'descricao', '')), '') is null;
        if v_mf then
          v_prod := null;
          if nullif(btrim(coalesce(it->>'tiny_produto_id', '')), '') is not null then
            select id into v_prod from produtos where id_externo = btrim(it->>'tiny_produto_id') limit 1;
          end if;
          v_itens := v_itens || jsonb_build_object(
            'descricao', left(btrim(it->>'descricao'), 300),
            'quantidade', coalesce((it->>'quantidade')::numeric, 1),
            'valor_unitario', round(coalesce((it->>'valor_unitario')::numeric, 0), 2),
            'produto_id', v_prod);
          v_sub := v_sub + coalesce((it->>'quantidade')::numeric, 1) * coalesce((it->>'valor_unitario')::numeric, 0);
        else
          v_itens := v_itens || jsonb_build_object(
            'descricao', left(btrim(it->>'descricao'), 300),
            'quantidade', coalesce((it->>'quantidade')::numeric, 1));
        end if;
      end loop;
      v_desc := case when v_mf then round(coalesce((p->>'desconto')::numeric, 0), 2) end;
      v_frete := case when v_mf then round(coalesce((p->>'frete')::numeric, 0), 2) end;

      insert into propostas_tiny as t (empresa, tiny_id, numero, data, proximo_contato, situacao, vendedor, cliente_id, contato_nome,
                                       aos_cuidados, unidade_id, validade_dias, prazo_entrega, observacoes, desconto, frete, total, itens)
      values (p_empresa, btrim(p->>'tiny_id'),
              case when coalesce(p->>'numero', '') ~ '^\d{1,9}$' then (p->>'numero')::int end,
              case when coalesce(p->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'data')::date end,
              case when coalesce(p->>'proximo_contato', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'proximo_contato')::date end,
              nullif(left(btrim(coalesce(p->>'situacao', '')), 40), ''),
              nullif(left(btrim(coalesce(p->>'vendedor', '')), 100), ''),
              v_cli,
              nullif(left(btrim(coalesce(p->>'nome', '')), 200), ''),
              nullif(left(btrim(coalesce(p->>'aos_cuidados', '')), 120), ''),
              v_unid,
              case when coalesce(p->>'validade', '') ~ '^\d{1,4}$' then (p->>'validade')::int end,
              case when v_mf then nullif(left(btrim(coalesce(p->>'prazo_entrega', '')), 300), '') end,
              case when v_mf then nullif(left(btrim(coalesce(p->>'observacoes', '')), 4000), '') end,
              v_desc, v_frete,
              case when v_mf then greatest(round(v_sub - v_desc + v_frete, 2), 0) end,
              v_itens)
      on conflict (empresa, tiny_id) do update set
        numero = excluded.numero, data = excluded.data, proximo_contato = excluded.proximo_contato, situacao = excluded.situacao,
        vendedor = excluded.vendedor, cliente_id = excluded.cliente_id, contato_nome = excluded.contato_nome,
        aos_cuidados = excluded.aos_cuidados, unidade_id = coalesce(excluded.unidade_id, t.unidade_id),
        validade_dias = excluded.validade_dias, prazo_entrega = excluded.prazo_entrega, observacoes = excluded.observacoes,
        desconto = excluded.desconto, frete = excluded.frete, total = excluded.total, itens = excluded.itens, updated_at = now()
      returning (xmax = 0) into v_ins;
      if v_ins then v_novas := v_novas + 1; else v_atualizadas := v_atualizadas + 1; end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('proposta', left(coalesce(p->>'numero', p->>'tiny_id', '?'), 20), 'erro', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('novas', v_novas, 'atualizadas', v_atualizadas, 'clientes_novos', v_clientes_novos,
                            'sem_cliente', v_sem_cliente, 'erros', v_erros);
end $$;

revoke execute on function public.importar_propostas_tiny(text, jsonb, uuid) from public, anon;
grant execute on function public.importar_propostas_tiny(text, jsonb, uuid) to authenticated;

-- cliente com proposta do Tiny tem histórico (não some na limpeza do cadastro)
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
      or exists (select 1 from compras_legado g where g.cliente_id = c.id)
      or exists (select 1 from propostas_tiny t where t.cliente_id = c.id)
      or (length(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g')) >= 11
          and exists (select 1 from notas_fiscais n where n.destinatario_doc = regexp_replace(c.cpf_cnpj, '\D', '', 'g'))))
$$;
