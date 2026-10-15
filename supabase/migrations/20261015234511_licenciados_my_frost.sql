-- Licenciados da My Frost Sorveterias (a licenciadora): a MF fabrica as máquinas para eles. Etiqueta do cadastro do
-- cliente, usada pela Venda de Máquinas e pelas propostas para filtrar. Somente acréscimos.
insert into public.tipos_contato (chave, nome, cor, ordem, sistema)
values ('licenciado_my_frost', 'Licenciado My Frost', 'purple', 5, true)
on conflict (chave) do nothing;
