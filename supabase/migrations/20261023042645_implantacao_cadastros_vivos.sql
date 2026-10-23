-- Implantação → "Clientes com CPF/CNPJ, telefone e estado" e "Fornecedores com CNPJ" (23/10): a conta passava pelos
-- cadastros unificados (o repetido que já foi juntado a outro e ficou vazio de propósito) e pelos arquivados, e o
-- número saía maior do que a lista de clientes mostra. Agora conta só o cadastro vivo; o telefone adicional também vale
-- como telefone. Fornecedor inativo também fica de fora. O resto da função é o mesmo.

create or replace function public.implantacao_indicadores()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
declare r jsonb;
begin
  if not public.is_erp_user() then raise exception 'acesso negado'; end if;
  select jsonb_build_object(
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('nome', u.nome, 'papel', u.papel, 'ultimo_login', a.last_sign_in_at) order by a.last_sign_in_at desc nulls last), '[]')
                   from usuarios_erp u left join auth.users a on a.id = u.user_id where u.ativo),
    'notas_erp_14d', (select count(*) from notas_fiscais where origem = 'erp' and status = 'autorizada' and coalesce(ambiente, 'producao') = 'producao'
                        and excluida_em is null and created_at > now() - interval '14 days'),
    'notas_tiny_14d', (select count(*) from notas_fiscais where origem = 'importada' and status = 'autorizada'
                         and excluida_em is null and created_at > now() - interval '14 days'),
    'notas_tiny_ultima', (select max(created_at) from notas_fiscais where origem = 'importada'),
    'notas_erp_ultima', (select max(created_at) from notas_fiscais where origem = 'erp' and status = 'autorizada' and coalesce(ambiente, 'producao') = 'producao'),
    'pedidos_7d', (select count(*) from pedidos where created_at > now() - interval '7 days' and status <> 'cancelado'),
    'pedidos_30d', (select count(*) from pedidos where created_at > now() - interval '30 days' and status <> 'cancelado'),
    'contas_7d', (select count(*) from contas_pagar where created_at > now() - interval '7 days')
                 + (select count(*) from contas_receber where created_at > now() - interval '7 days'),
    'extrato_30d', (select count(*) from extrato_lancamentos where data > current_date - 30),
    'extrato_conciliado_30d', (select count(*) from extrato_lancamentos where data > current_date - 30 and status = 'conciliado'),
    'os_30d', (select count(*) from ordens_servico where created_at > now() - interval '30 days'),
    'op_30d', (select count(*) from ordens_producao where created_at > now() - interval '30 days'),
    'estoque_itens', (select count(*) from produtos where ativo and tipo in ('peca', 'insumo', 'acessorio') and not coalesce(kit, false)),
    'estoque_contados_60d', (select count(distinct ci.produto_id) from contagem_itens ci join contagens_estoque c on c.id = ci.contagem_id
                               where c.status = 'concluida' and c.concluida_em > now() - interval '60 days'),
    'pecas_sem_custo', (select count(*) from produtos where ativo and vendavel and tipo = 'peca' and not coalesce(kit, false) and coalesce(preco_custo, 0) = 0),
    'insumos_sem_custo', (select count(*) from produtos where ativo and tipo = 'insumo' and coalesce(preco_custo, 0) = 0),
    'sem_ncm', (select count(*) from produtos where ativo and tipo <> 'servico' and nullif(btrim(ncm), '') is null),
    'clientes_sem_doc', (select count(*) from clientes where unificado_em is null and arquivado_em is null
                           and nullif(regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g'), '') is null),
    'clientes_sem_telefone', (select count(*) from clientes where unificado_em is null and arquivado_em is null
                                and coalesce(nullif(btrim(telefone), ''), nullif(btrim(whatsapp), ''), nullif(btrim(telefone_adicional), '')) is null),
    'clientes_sem_uf', (select count(*) from clientes where unificado_em is null and arquivado_em is null and nullif(btrim(uf), '') is null),
    'fornecedores_sem_cnpj', (select count(*) from fornecedores where unificado_em is null and coalesce(ativo, true)
                                and nullif(regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'), '') is null)
  ) into r;
  return r;
end $function$;
