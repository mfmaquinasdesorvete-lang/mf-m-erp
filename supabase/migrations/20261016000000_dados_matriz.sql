-- =====================================================================
-- Dados cadastrais da matriz.
-- Esta migração já rodou no banco (16/10/2026) e preencheu a razão social, o CNPJ, a IE, o endereço e os contatos
-- da matriz que estavam vazios. Os valores saíram daqui porque o repositório é público: os dados da empresa ficam
-- só no banco e se editam em Configurações e em Unidades. Num banco novo, preencha por lá.
-- =====================================================================

-- A filial tem a mesma razão social (CNPJ, IE e endereço próprios ficam no cadastro da unidade)
update public.unidades
   set razao_social = 'MF MÁQUINAS LTDA'
 where codigo = 'SP' and coalesce(razao_social, '') in ('', 'MF Máquinas');
