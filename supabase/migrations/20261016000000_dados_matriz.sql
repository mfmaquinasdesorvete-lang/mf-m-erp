-- =====================================================================
-- Dados cadastrais da matriz (MF MÁQUINAS LTDA, São José/SC).
-- Só preenche o que ainda está vazio: o que já foi editado nas
-- Configurações não é sobrescrito.
-- O telefone (48) 3375-5280 é o WhatsApp Business do catálogo de peças.
-- =====================================================================

update public.unidades set
  razao_social       = case when coalesce(razao_social, '') in ('', 'MF Máquinas') then 'MF MÁQUINAS LTDA' else razao_social end,
  cnpj               = coalesce(nullif(cnpj, ''), '46942855000132'),
  inscricao_estadual = coalesce(nullif(inscricao_estadual, ''), '261770233'),
  logradouro         = coalesce(nullif(logradouro, ''), 'Rua Leonel Felisbino da Silva'),
  numero             = coalesce(nullif(numero, ''), 'S/N'),
  complemento        = coalesce(nullif(complemento, ''), 'Q 4 - L 9 - Galpão 6'),
  bairro             = coalesce(nullif(bairro, ''), 'Areias'),
  municipio          = coalesce(nullif(municipio, ''), 'São José'),
  uf                 = 'SC',
  cep                = coalesce(nullif(cep, ''), '88113837'),
  telefone           = coalesce(nullif(telefone, ''), '(48) 3375-5280'),
  whatsapp           = coalesce(nullif(whatsapp, ''), '4833755280'),
  email              = coalesce(nullif(email, ''), 'mfmaquinasdesorvete@gmail.com')
where codigo = 'SC';

update public.configuracoes set
  razao_social       = case when razao_social in ('', 'MF Máquinas') then 'MF MÁQUINAS LTDA' else razao_social end,
  nome_fantasia      = coalesce(nullif(nome_fantasia, ''), 'MF Máquinas'),
  cnpj               = coalesce(nullif(cnpj, ''), '46942855000132'),
  inscricao_estadual = coalesce(nullif(inscricao_estadual, ''), '261770233'),
  uf                 = coalesce(nullif(uf, ''), 'SC'),
  municipio          = coalesce(nullif(municipio, ''), 'São José'),
  endereco           = coalesce(nullif(endereco, ''), 'Rua Leonel Felisbino da Silva, S/N, Q 4 - L 9 - Galpão 6, Areias - CEP 88113-837'),
  telefone           = coalesce(nullif(telefone, ''), '(48) 3375-5280'),
  whatsapp           = coalesce(nullif(whatsapp, ''), '4833755280'),
  email              = coalesce(nullif(email, ''), 'mfmaquinasdesorvete@gmail.com')
where id = 1;

-- A filial tem a mesma razão social (CNPJ, IE e endereço próprios ainda a preencher)
update public.unidades
   set razao_social = 'MF MÁQUINAS LTDA'
 where codigo = 'SP' and coalesce(razao_social, '') in ('', 'MF Máquinas');
