-- =====================================================================
-- Base da My Frost Máquinas (empresa anterior), trazida do backup do Tiny só para a assistência técnica e a venda
-- de peças. Tudo fica marcado com a origem e separado das vendas da MF:
--  * equipamentos.origem = 'My Frost': máquina vendida pela My Frost, sem garantia da MF e sem aviso automático ao
--    cliente (garantia_ate e proxima_preventiva ficam vazias); a data da venda pode ficar vazia (só a etiqueta do cadastro);
--  * compras_legado: o que o cliente comprou na My Frost (data, item, quantidade), sem valores;
--  * importar_legado_myfrost: quem já é cliente (mesmo CPF/CNPJ) só ganha as etiquetas, as máquinas e as compras;
--    nada do cadastro existente é sobrescrito. Importar de novo não duplica;
--  * importar_pecas_myfrost: cria as peças escolhidas na tela; nunca altera produto existente.
-- Somente acréscimos (a data da venda do equipamento deixa de ser obrigatória).
-- =====================================================================

alter table public.equipamentos add column if not exists origem text;          -- vazio = vendida pela MF
alter table public.equipamentos add column if not exists origem_ref text;      -- chave da importação (não duplica)
create unique index if not exists equipamentos_origem_ref on public.equipamentos (origem, origem_ref) where origem_ref is not null;
alter table public.equipamentos alter column data_venda drop not null;

create table if not exists public.compras_legado (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  origem text not null default 'My Frost',
  ref text not null,
  data date,
  documento text,
  descricao text not null,
  quantidade numeric(12,3) not null default 1,
  created_at timestamptz not null default now()
);
create unique index if not exists compras_legado_ref on public.compras_legado (origem, ref);
create index if not exists compras_legado_cliente on public.compras_legado (cliente_id);
alter table public.compras_legado enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'compras_legado' and policyname = 'compras_legado_select') then
    create policy compras_legado_select on public.compras_legado for select to authenticated using (public.is_erp_user());
  end if;
end $$;
-- gravação só pela importação
revoke insert, update, delete on public.compras_legado from anon, authenticated;

-- Clientes, máquinas e compras. p_clientes: [{ ref, nome, fantasia, tipo_pessoa, cpf_cnpj, ie, contribuinte, email, telefone,
--   celular, cep, logradouro, numero, complemento, bairro, municipio, uf, obs, tags[], maquinas[{ref, modelo, descricao, data, obs}],
--   compras[{ref, data, documento, descricao, quantidade}] }]
create or replace function public.importar_legado_myfrost(p_clientes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c jsonb; m jsonb; x jsonb; v_id uuid; v_doc text; v_tipo text; v_prod uuid; v_modelo text; v_arquivado boolean; v_novo boolean; v_rows int;
  l_maq int; l_comp int;
  n_novos int := 0; n_exist int := 0; n_arq int := 0; n_maq int := 0; n_comp int := 0; v_erros jsonb := '[]';
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa a base da My Frost'; end if;
  if jsonb_typeof(p_clientes) is distinct from 'array' or jsonb_array_length(p_clientes) > 500 then
    raise exception 'envie de 1 a 500 clientes por vez';
  end if;
  perform set_config('erp.acao_usuario', 'on', true);
  for c in select * from jsonb_array_elements(p_clientes) loop
    begin
      v_doc := nullif(regexp_replace(coalesce(c->>'cpf_cnpj', ''), '\D', '', 'g'), '');
      if v_doc is not null and length(v_doc) not in (11, 14) then v_doc := null; end if;
      v_tipo := case when c->>'tipo_pessoa' in ('PF', 'PJ') then c->>'tipo_pessoa' when length(v_doc) = 11 then 'PF' else 'PJ' end;
      v_id := null; v_arquivado := false; v_novo := false;
      select id, arquivado_em is not null into v_id, v_arquivado from clientes where id_externo = 'myfrost:' || (c->>'ref') limit 1;
      if v_id is null and v_doc is not null then
        select id, arquivado_em is not null into v_id, v_arquivado from clientes where cpf_cnpj = v_doc limit 1;
      end if;
      if v_id is null then
        if nullif(btrim(coalesce(c->>'nome', '')), '') is null then raise exception 'sem nome'; end if;
        insert into clientes (tipo_pessoa, nome, nome_fantasia, cpf_cnpj, inscricao_estadual, contribuinte_icms, email, telefone, whatsapp,
                              cep, logradouro, numero, complemento, bairro, municipio, uf, observacoes, tags, id_externo)
        values (v_tipo, left(btrim(c->>'nome'), 200), nullif(left(btrim(coalesce(c->>'fantasia', '')), 200), ''), v_doc,
                nullif(left(btrim(coalesce(c->>'ie', '')), 30), ''),
                case when v_tipo = 'PJ' and c->>'contribuinte' in ('1', '2') then (c->>'contribuinte')::int else 9 end,
                nullif(left(btrim(coalesce(c->>'email', '')), 200), ''), nullif(left(btrim(coalesce(c->>'telefone', '')), 40), ''),
                nullif(left(btrim(coalesce(c->>'celular', '')), 40), ''),
                nullif(left(regexp_replace(coalesce(c->>'cep', ''), '\D', '', 'g'), 8), ''),
                nullif(left(btrim(coalesce(c->>'logradouro', '')), 200), ''), nullif(left(btrim(coalesce(c->>'numero', '')), 20), ''),
                nullif(left(btrim(coalesce(c->>'complemento', '')), 100), ''), nullif(left(btrim(coalesce(c->>'bairro', '')), 100), ''),
                nullif(left(btrim(coalesce(c->>'municipio', '')), 100), ''), nullif(upper(left(btrim(coalesce(c->>'uf', '')), 2)), ''),
                nullif(left(coalesce(c->>'obs', ''), 2000), ''),
                array(select distinct t from jsonb_array_elements_text(coalesce(c->'tags', '[]')) t where btrim(t) <> '' order by t),
                'myfrost:' || (c->>'ref'))
        returning id into v_id;
        v_novo := true;
      else
        update clientes set tags = array(select distinct t from unnest(coalesce(tags, '{}') ||
                 array(select jsonb_array_elements_text(coalesce(c->'tags', '[]')))) t where btrim(t) <> '' order by t)
         where id = v_id;
      end if;

      l_maq := 0;
      for m in select * from jsonb_array_elements(coalesce(c->'maquinas', '[]')) loop
        v_modelo := regexp_replace(coalesce(m->>'modelo', ''), '[^A-Za-z0-9 ]', '', 'g');
        v_prod := null;
        if v_modelo <> '' then
          select id into v_prod from produtos
           where tipo = 'maquina' and descricao ~* ('^\s*my\s*frost\s+' || regexp_replace(btrim(v_modelo), '\s+', '\\s*', 'g') || '\M')
           order by ativo desc, created_at limit 1;
        end if;
        insert into equipamentos (cliente_id, produto_id, descricao, data_venda, observacoes, origem, origem_ref)
        values (v_id, v_prod, left(coalesce(nullif(btrim(m->>'descricao'), ''), 'Máquina My Frost'), 200), (m->>'data')::date,
                left(m->>'obs', 1000), 'My Frost', m->>'ref')
        on conflict (origem, origem_ref) where origem_ref is not null do nothing;
        get diagnostics v_rows = row_count;
        l_maq := l_maq + v_rows;
      end loop;

      l_comp := 0;
      for x in select * from jsonb_array_elements(coalesce(c->'compras', '[]')) loop
        insert into compras_legado (cliente_id, origem, ref, data, documento, descricao, quantidade)
        values (v_id, 'My Frost', x->>'ref', (x->>'data')::date, left(x->>'documento', 60), left(coalesce(x->>'descricao', ''), 300),
                coalesce((x->>'quantidade')::numeric, 1))
        on conflict (origem, ref) do nothing;
        get diagnostics v_rows = row_count;
        l_comp := l_comp + v_rows;
      end loop;

      -- os contadores só andam quando o cliente inteiro entrou
      if v_arquivado then n_arq := n_arq + 1; end if;
      if v_novo then n_novos := n_novos + 1; else n_exist := n_exist + 1; end if;
      n_maq := n_maq + l_maq;
      n_comp := n_comp + l_comp;
    exception when others then
      v_erros := v_erros || jsonb_build_object('cliente', left(coalesce(c->>'nome', c->>'ref'), 120), 'erro', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('novos', n_novos, 'existentes', n_exist, 'arquivados', n_arq, 'maquinas', n_maq, 'compras', n_comp, 'erros', v_erros);
end $$;
revoke execute on function public.importar_legado_myfrost(jsonb) from public, anon;
grant execute on function public.importar_legado_myfrost(jsonb) to authenticated;

-- Peças escolhidas na tela. p_pecas: [{ ref, sku, nome_original, descricao, unidade, ncm, origem, preco_venda, preco_custo,
--   peso_kg, largura_cm, altura_cm, profundidade_cm, codigo_fabricante }]
create or replace function public.importar_pecas_myfrost(p_pecas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x jsonb; v_sku text; n_novas int := 0; n_ja int := 0; v_erros jsonb := '[]';
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa a base da My Frost'; end if;
  if jsonb_typeof(p_pecas) is distinct from 'array' or jsonb_array_length(p_pecas) > 500 then
    raise exception 'envie de 1 a 500 peças por vez';
  end if;
  perform set_config('erp.acao_usuario', 'on', true);
  for x in select * from jsonb_array_elements(p_pecas) loop
    begin
      if exists (select 1 from produtos where id_externo = 'myfrost:' || (x->>'ref')) then n_ja := n_ja + 1; continue; end if;
      v_sku := nullif(btrim(coalesce(x->>'sku', '')), '');
      -- código já usado (ou já usado no passado) por outro produto: a peça entra sem código
      if v_sku is not null and public.dono_do_sku(v_sku, '00000000-0000-0000-0000-000000000000'::uuid) is not null then v_sku := null; end if;
      insert into produtos (sku, descricao, tipo, unidade, ncm, origem, preco_venda, preco_custo, peso_kg, largura_cm, altura_cm,
                            profundidade_cm, codigo_fabricante, ativo, id_externo, observacoes)
      values (v_sku, left(btrim(x->>'descricao'), 120), 'peca', coalesce(nullif(upper(left(btrim(coalesce(x->>'unidade', '')), 6)), ''), 'UN'),
              case when length(regexp_replace(coalesce(x->>'ncm', ''), '\D', '', 'g')) = 8 then regexp_replace(x->>'ncm', '\D', '', 'g') end,
              least(greatest(coalesce((x->>'origem')::int, 0), 0), 8),
              greatest(coalesce((x->>'preco_venda')::numeric, 0), 0), greatest(coalesce((x->>'preco_custo')::numeric, 0), 0),
              nullif(greatest(coalesce((x->>'peso_kg')::numeric, 0), 0), 0), nullif(greatest(coalesce((x->>'largura_cm')::numeric, 0), 0), 0),
              nullif(greatest(coalesce((x->>'altura_cm')::numeric, 0), 0), 0), nullif(greatest(coalesce((x->>'profundidade_cm')::numeric, 0), 0), 0),
              nullif(left(btrim(coalesce(x->>'codigo_fabricante', '')), 60), ''), true, 'myfrost:' || (x->>'ref'),
              left('Peça do catálogo da My Frost Máquinas (empresa anterior). Nome original: ' || coalesce(x->>'nome_original', ''), 500));
      n_novas := n_novas + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_object('peca', left(coalesce(x->>'descricao', x->>'ref'), 120), 'erro', left(sqlerrm, 200));
    end;
  end loop;
  return jsonb_build_object('novas', n_novas, 'ja_existiam', n_ja, 'erros', v_erros);
end $$;
revoke execute on function public.importar_pecas_myfrost(jsonb) from public, anon;
grant execute on function public.importar_pecas_myfrost(jsonb) to authenticated;

-- Quem tem compras na My Frost também tem histórico (o botão "Ficha 360" fica colorido)
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
      or (length(regexp_replace(coalesce(c.cpf_cnpj, ''), '\D', '', 'g')) >= 11
          and exists (select 1 from notas_fiscais n where n.destinatario_doc = regexp_replace(c.cpf_cnpj, '\D', '', 'g'))))
$$;
revoke execute on function public.clientes_com_historico() from public, anon;
grant execute on function public.clientes_com_historico() to authenticated;
