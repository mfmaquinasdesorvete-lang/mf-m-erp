-- Ficha cadastral (o que o cliente confere e assina): leva também a etiqueta do endereço principal e os endereços 2 e 3.
-- Somente acréscimo: a mesma função com dois campos a mais (as fichas já assinadas guardam o que foi assinado).
create or replace function public.cliente_ficha(p_cliente uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'codigo', c.codigo, 'tipo_pessoa', c.tipo_pessoa, 'nome', c.nome, 'nome_fantasia', c.nome_fantasia, 'cpf_cnpj', c.cpf_cnpj,
    'inscricao_estadual', c.inscricao_estadual, 'inscricao_municipal', c.inscricao_municipal, 'data_nascimento', c.data_nascimento,
    'email', c.email, 'email_nfe', c.email_nfe, 'telefone', c.telefone, 'telefone_adicional', c.telefone_adicional,
    'whatsapp', c.whatsapp, 'website', c.website,
    'cep', c.cep, 'logradouro', c.logradouro, 'numero', c.numero, 'complemento', c.complemento, 'bairro', c.bairro,
    'municipio', c.municipio, 'uf', c.uf, 'endereco_etiqueta', c.endereco_etiqueta,
    'enderecos_extras', case when jsonb_array_length(coalesce(c.enderecos_extras, '[]'::jsonb)) > 0
                          then (select jsonb_agg(e - 'origem') from jsonb_array_elements(c.enderecos_extras) e) end,
    'cobranca_diferente', c.cobranca_diferente, 'cobranca_cep', c.cobranca_cep, 'cobranca_logradouro', c.cobranca_logradouro,
    'cobranca_numero', c.cobranca_numero, 'cobranca_complemento', c.cobranca_complemento, 'cobranca_bairro', c.cobranca_bairro,
    'cobranca_municipio', c.cobranca_municipio, 'cobranca_uf', c.cobranca_uf,
    'pessoas', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nome', p.nome, 'setor', p.setor, 'email', p.email, 'telefone', p.telefone, 'ramal', p.ramal))
                                 order by p.created_at)
                  from clientes_pessoas p where p.cliente_id = c.id and p.ativo)))
    from clientes c where c.id = p_cliente;
$$;
revoke execute on function public.cliente_ficha(uuid) from public, anon, authenticated;
