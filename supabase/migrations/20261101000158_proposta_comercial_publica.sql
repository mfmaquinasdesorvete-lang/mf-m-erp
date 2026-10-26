-- Proposta Comercial de máquina no link do cliente (pedido de 26/10): cada item passa a trazer SKU, NCM, a ficha técnica
-- (especificações) e o preço de lista da máquina, e a proposta diz se é comercial (tem máquina), para a página mostrar
-- "Proposta Comercial", o desconto sobre o preço de lista e o frete "a cotar", como a proposta antiga do Tiny.
-- Troca só os trechos abaixo no texto atual de proposta_publica (o resto continua igual).
do $$
declare d text; antes text; depois text;
begin
  d := pg_get_functiondef('public.proposta_publica(uuid)'::regprocedure);
  if position('''especificacoes''' in d) > 0 then return; end if;
  antes := '''foto'', case when v_cfg.proposta_fotos then p.foto_caminho end, ''texto'', p.descricao_catalogo,';
  depois := '''foto'', case when v_cfg.proposta_fotos then p.foto_caminho end, ''texto'', p.descricao_catalogo,
        ''sku'', p.sku, ''ncm'', p.ncm, ''unidade'', p.unidade, ''maquina'', p.tipo = ''maquina'',
        ''preco_lista'', case when p.tipo = ''maquina'' and p.preco_venda > i.valor_unitario then p.preco_venda end,
        ''especificacoes'', case when p.tipo = ''maquina'' then p.especificacoes end,';
  if position(antes in d) = 0 then raise exception 'proposta_publica mudou: confira o trecho dos itens'; end if;
  d := replace(d, antes, depois);
  antes := '''motivo_rejeicao'', v_ped.motivo_rejeicao,';
  depois := '''motivo_rejeicao'', v_ped.motivo_rejeicao,
    ''comercial'', exists (select 1 from pedido_itens i join produtos p on p.id = i.produto_id where i.pedido_id = v_ped.id and p.tipo = ''maquina''),';
  if position(antes in d) = 0 then raise exception 'proposta_publica mudou: confira o trecho do motivo'; end if;
  execute replace(d, antes, depois);
end $$;
