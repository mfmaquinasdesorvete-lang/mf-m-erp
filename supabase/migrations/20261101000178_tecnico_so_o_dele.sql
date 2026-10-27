-- Técnico só com o que é dele (pedido de 27/10, confirmado por ela): quem tem só o papel técnico (sem outro papel)
-- deixa de ler e gravar compras, fornecedores, cotações, produção e custos, propostas, tabelas de preço, cobrança,
-- logística e os controles internos. As tabelas que a OS usa (OS e itens, clientes, máquinas, produtos, técnicos,
-- notas de serviço, documentos, marcadores, lembretes, estoque) continuam. Regra "restrictive": soma-se às regras
-- que já existem e só tira do técnico; os outros papéis não mudam.
-- Limitar às OS dele (e aos clientes dessas OS) depende de ligar o login ao cadastro de técnico: próximo passo.

create or replace function public.so_tecnico()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_erp
                  where user_id = auth.uid() and ativo and papel = 'tecnico'
                    and coalesce(papeis_extras, '{}') <@ array['tecnico', 'giga']::text[]);
$$;
revoke execute on function public.so_tecnico() from public, anon;
grant execute on function public.so_tecnico() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'compras_legado', 'cotacoes', 'cotacao_itens', 'cotacao_fornecedores', 'cotacao_respostas', 'envio_cotacoes',
    'fornecedores', 'fornecimentos', 'fornecedor_itens_sem_estoque', 'fornecedor_avaliacoes', 'fornecedor_ocorrencias',
    'pedidos_compra', 'pedido_compra_itens', 'nfe_oc_vinculos', 'nfe_oc_baixas',
    'ordens_producao', 'op_custos', 'produto_componentes', 'produto_sugestoes',
    'propostas_tiny', 'tabelas_preco', 'regua_cobranca', 'categorias_financeiras',
    'transferencias', 'transferencia_itens', 'envios', 'etiquetas_envio', 'expedicoes', 'embalagens', 'transportadoras',
    'vendedores', 'pedidos_checklist', 'implantacao_etapas', 'projeto_itens', 'loja_clientes'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists so_tecnico_fora on public.%I', t);
      execute format('create policy so_tecnico_fora on public.%I as restrictive for all to authenticated '
                     'using (not (select public.so_tecnico())) with check (not (select public.so_tecnico()))', t);
    end if;
  end loop;
end $$;
