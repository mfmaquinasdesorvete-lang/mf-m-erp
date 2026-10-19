-- Fornecedores: ativo/inativo, homologado (Inmetro: comprar só de quem é homologado) e voltar a ser cliente
-- (cadastro que foi parar em fornecedores por engano). O caminho inverso de clientes_virar_fornecedor.
alter table public.fornecedores
  add column if not exists ativo boolean not null default true,
  add column if not exists homologado boolean not null default false,
  add column if not exists homologado_em date,
  add column if not exists homologado_obs text;

create or replace function public.fornecedores_virar_cliente(p_ids uuid[], p_manter_fornecedor boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_cli uuid; v_doc text; k int;
  n_novo int := 0; n_volta int := 0; n_anexos int := 0; n_mantidos int := 0; v_ultimo uuid;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  for r in select f.* from fornecedores f where f.id = any (coalesce(p_ids, '{}')) order by f.nome for update loop
    v_doc := nullif(regexp_replace(coalesce(r.cnpj, ''), '\D', '', 'g'), '');
    v_cli := null;
    -- já foi cliente e virou fornecedor: desarquiva aquele cadastro (volta com o histórico)
    if v_doc is not null then
      select c.id into v_cli from clientes c
       where regexp_replace(coalesce(c.cpf_cnpj, c.dados_arquivados->>'cpf_cnpj', ''), '\D', '', 'g') = v_doc
       order by (c.arquivado_em is null) desc, c.created_at limit 1;
    else
      select c.id into v_cli from clientes c where lower(btrim(c.nome)) = lower(btrim(r.nome)) order by (c.arquivado_em is null) desc, c.created_at limit 1;
    end if;

    if v_cli is not null then
      update clientes c set arquivado_em = null, arquivado_motivo = null,
        cpf_cnpj = coalesce(nullif(c.cpf_cnpj, ''), v_doc),
        email = coalesce(nullif(c.email, ''), r.email), telefone = coalesce(nullif(c.telefone, ''), r.telefone),
        whatsapp = coalesce(nullif(c.whatsapp, ''), r.whatsapp), municipio = coalesce(nullif(c.municipio, ''), r.municipio),
        uf = coalesce(nullif(c.uf, ''), r.uf), cep = coalesce(nullif(c.cep, ''), r.cep),
        logradouro = coalesce(nullif(c.logradouro, ''), r.logradouro), numero = coalesce(nullif(c.numero, ''), r.numero),
        bairro = coalesce(nullif(c.bairro, ''), r.bairro)
       where c.id = v_cli;
      n_volta := n_volta + 1;
    else
      insert into clientes (nome, nome_fantasia, cpf_cnpj, inscricao_estadual, email, telefone, whatsapp, cep, logradouro, numero, complemento,
                            bairro, municipio, uf, observacoes)
      values (r.nome, r.nome_fantasia, v_doc, r.inscricao_estadual, r.email, r.telefone, r.whatsapp, r.cep, r.logradouro, r.numero, r.complemento,
              r.bairro, r.municipio, r.uf, r.observacoes)
      returning id into v_cli;
      n_novo := n_novo + 1;
    end if;

    if p_manter_fornecedor then
      n_mantidos := n_mantidos + 1;
    else
      -- o fornecedor fica inativo (contas e notas antigas continuam ligadas a ele); os anexos vão para o cliente
      update documentos set entidade = 'cliente', entidade_id = v_cli where entidade = 'fornecedor' and entidade_id = r.id;
      get diagnostics k = row_count;
      n_anexos := n_anexos + k;
      update fornecedores set ativo = false,
        tags = array(select distinct t from unnest(coalesce(tags, '{}') || array['virou_cliente']) t order by t)
       where id = r.id;
    end if;
    v_ultimo := v_cli;
  end loop;
  return jsonb_build_object('criados', n_novo, 'voltaram', n_volta, 'mantidos', n_mantidos, 'anexos', n_anexos, 'cliente_id', v_ultimo);
end $$;
revoke execute on function public.fornecedores_virar_cliente(uuid[], boolean) from public, anon;
grant execute on function public.fornecedores_virar_cliente(uuid[], boolean) to authenticated;
