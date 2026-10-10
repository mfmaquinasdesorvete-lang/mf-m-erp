-- =====================================================================
-- Tipos de contato editáveis (Fornecedor, Revenda, Técnico parceiro… e os que a MF criar)
-- e "deixar de ser cliente": o cadastro vai para Fornecedores e sai da lista de clientes.
-- =====================================================================
create table if not exists public.tipos_contato (
  chave text primary key check (chave ~ '^[a-z0-9_]+$' and chave not in ('cliente', 'endereco_receita', 'cnpj_irregular', 'ie_baixada')),
  nome text not null check (btrim(nome) <> ''),
  cor text not null default 'purple',
  ordem int not null default 0,
  ativo boolean not null default true,       -- tirar da lista sem apagar (quem já tem a etiqueta continua com ela)
  sistema boolean not null default false,    -- usada pelo ERP (ex.: fornecedor): pode renomear, não sai da lista
  created_at timestamptz not null default now()
);
alter table public.tipos_contato enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tipos_contato' and policyname = 'erp_select') then
    create policy "erp_select" on public.tipos_contato for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tipos_contato' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.tipos_contato for insert to authenticated with check (public.tem_papel('vendas', 'financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tipos_contato' and policyname = 'erp_update') then
    create policy "erp_update" on public.tipos_contato for update to authenticated
      using (public.tem_papel('vendas', 'financeiro')) with check (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;
grant select, insert, update on public.tipos_contato to authenticated;

insert into public.tipos_contato (chave, nome, cor, ordem, sistema) values
  ('fornecedor', 'Fornecedor', 'purple', 1, true),
  ('revenda', 'Revenda', 'indigo', 2, false),
  ('parceiro', 'Técnico parceiro', 'orange', 3, true)
on conflict (chave) do nothing;

-- a chave e o "sistema" não mudam pela tela; as do ERP não saem da lista
create or replace function public.trg_tipos_contato_protege()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.sistema := false; end if;
    new.nome := btrim(new.nome);
    return new;
  end if;
  new.chave := old.chave;
  new.sistema := old.sistema;
  new.nome := btrim(new.nome);
  if old.sistema and not new.ativo then
    raise exception 'A categoria "%" é usada pelo ERP: pode trocar o nome, mas não sair da lista', old.nome;
  end if;
  return new;
end $$;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'tipos_contato_protege' and tgrelid = 'public.tipos_contato'::regclass) then
    create trigger tipos_contato_protege before insert or update on public.tipos_contato
      for each row execute function public.trg_tipos_contato_protege();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Cliente → fornecedor.
--   p_manter_cliente = false: vai para Fornecedores (cria ou completa o fornecedor do mesmo CPF/CNPJ), os anexos vão
--     junto e ele sai da lista de clientes (fica guardado como estava; pedidos, notas e contas antigos continuam
--     no histórico; o CPF/CNPJ fica livre para um cadastro novo de cliente).
--   p_manter_cliente = true: continua cliente com a etiqueta "fornecedor" e passa a existir também em Fornecedores.
-- ---------------------------------------------------------------------
create or replace function public.clientes_virar_fornecedor(p_ids uuid[], p_manter_cliente boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_forn uuid; v_doc text; k int;
  n_mov int := 0; n_tag int := 0; n_novo int := 0; n_anexos int := 0; v_ultimo uuid;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  for r in select c.* from clientes c where c.id = any (coalesce(p_ids, '{}')) and c.arquivado_em is null order by c.nome for update loop
    v_doc := nullif(regexp_replace(coalesce(r.cpf_cnpj, ''), '\D', '', 'g'), '');
    v_forn := null;
    if v_doc is not null then
      select f.id into v_forn from fornecedores f where regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = v_doc order by f.created_at limit 1;
    else
      select f.id into v_forn from fornecedores f
       where nullif(regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g'), '') is null and lower(btrim(f.nome)) = lower(btrim(r.nome))
       order by f.created_at limit 1;
    end if;

    if v_forn is null then
      insert into fornecedores (nome, nome_fantasia, cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero, complemento,
                                bairro, municipio, uf, observacoes, receita, receita_situacao, ie_situacao, receita_em)
      values (r.nome, r.nome_fantasia, v_doc, r.inscricao_estadual, r.email, r.telefone, r.whatsapp, r.cep, r.logradouro, r.numero, r.complemento,
              r.bairro, r.municipio, r.uf, r.observacoes, r.receita, r.receita_situacao, r.ie_situacao, r.receita_em)
      returning id into v_forn;
      n_novo := n_novo + 1;
    else
      -- já existe: só completa o que estiver vazio no fornecedor
      update fornecedores f set
        nome_fantasia = coalesce(nullif(f.nome_fantasia, ''), r.nome_fantasia),
        inscricao_estadual = coalesce(nullif(f.inscricao_estadual, ''), r.inscricao_estadual),
        email = coalesce(nullif(f.email, ''), r.email),
        telefone = coalesce(nullif(f.telefone, ''), r.telefone),
        whatsapp = coalesce(nullif(f.whatsapp, ''), r.whatsapp),
        cep = coalesce(nullif(f.cep, ''), r.cep),
        logradouro = coalesce(nullif(f.logradouro, ''), r.logradouro),
        numero = coalesce(nullif(f.numero, ''), r.numero),
        complemento = coalesce(nullif(f.complemento, ''), r.complemento),
        bairro = coalesce(nullif(f.bairro, ''), r.bairro),
        municipio = coalesce(nullif(f.municipio, ''), r.municipio),
        uf = coalesce(nullif(f.uf, ''), r.uf),
        observacoes = coalesce(nullif(f.observacoes, ''), r.observacoes)
       where f.id = v_forn;
    end if;

    if p_manter_cliente then
      update clientes set tags = array(select distinct t from unnest(coalesce(tags, '{}') || array['fornecedor']) t order by t) where id = r.id;
      n_tag := n_tag + 1;
    else
      update documentos set entidade = 'fornecedor', entidade_id = v_forn where entidade = 'cliente' and entidade_id = r.id;
      get diagnostics k = row_count;
      n_anexos := n_anexos + k;
      update clientes set arquivado_em = now(), arquivado_motivo = 'fornecedor', dados_arquivados = to_jsonb(r),
             cpf_cnpj = null, id_externo = null
       where id = r.id;
      n_mov := n_mov + 1;
    end if;
    v_ultimo := v_forn;
  end loop;
  return jsonb_build_object('movidos', n_mov, 'mantidos', n_tag, 'fornecedores_criados', n_novo, 'anexos', n_anexos, 'fornecedor_id', v_ultimo);
end $$;
revoke execute on function public.clientes_virar_fornecedor(uuid[], boolean) from public, anon;
grant execute on function public.clientes_virar_fornecedor(uuid[], boolean) to authenticated;
