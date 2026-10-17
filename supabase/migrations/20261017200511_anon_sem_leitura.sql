-- =====================================================================
-- Visitante sem login (anon) sem leitura direta de tabela (revisão de segurança de 17/10)
--  * as 5 regras de leitura que estavam "para todos" (public) passam a valer só para quem está logado
--    (cobrancas_link, notas_fiscais_xml, produto_sugestoes); na prática o visitante já não via nada, porque as
--    condições (tem_papel, e_contador, is_erp_user) pedem um usuário do ERP;
--  * anon perde o SELECT em todas as tabelas e visões, também nas criadas depois: as páginas públicas (proposta,
--    cotação, ficha cadastral, área do cliente, máquina, loja) usam só funções com o código (token) do link.
-- Somente permissões; nenhum dado muda.
-- =====================================================================
set local lock_timeout = '10s';

alter policy erp_select on public.cobrancas_link to authenticated;
alter policy contador_select on public.cobrancas_link to authenticated;
alter policy erp_select on public.notas_fiscais_xml to authenticated;
alter policy contador_select on public.notas_fiscais_xml to authenticated;
alter policy sugestoes_select on public.produto_sugestoes to authenticated;

revoke select on all tables in schema public from anon;
alter default privileges in schema public revoke select on tables from anon;
