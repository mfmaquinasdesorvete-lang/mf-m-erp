# MEMORY — TRA (ERP Line – Transportadoras)
Atualizado em 28/10/2026.

## Estado agora
A cotação de frete (equipe e loja) está no ar e já cota pelo Mercado Envios (conta do Mercado Livre da MF).
As transportadoras com API (Rodonaves, Braspress, Melhor Envio) esperam o acesso certo. As que não têm API
(São Miguel e outras) entram pelas tabelas de frete, que esperam as tabelas atualizadas.

## No ar
- Rastreio pela chave da nota no SSW (sem senha), com busca 2x ao dia e "Confirmar entrega".
- Rastreio da Braspress (2x ao dia) quando houver acesso.
- Cotação rápida (botão do caminhão no topo e Fretes → Cotação rápida) e "Calcule o frete" na loja (ligado).
- Mercado Envios na cotação (função frete-cotar), sem acesso extra.
- Tabelas de frete negociadas: Fretes → Tabelas de frete (planilha modelo, simulador, cálculo na cotação).
- Regras de frete (grátis, acréscimo, retirar na fábrica, peso e medidas padrão) e Peso e medidas dos produtos.
- Gastos com frete por mês e por transportadora, com envio de XML dos CT-e; CT-e de 2025/2026 vindos do e-mail.
- Cadastro: 12 transportadoras novas; repetidos do Mercado Envios unificados (filial).
- Aba CT-e mais clara (26/10, b50d074): cartão do frete pago do mês, "O que fazer", faturas por transportadora, abas em 3 grupos.

## Em andamento
- Rodada de fechamento (desde 27/10): nada novo sem pedido dela; só terminar, consertar e testar.
- Pronto e não publicado: frete do pedido (FreteVenda) baixa só peso e medidas dos produtos do pedido (dabb127).
  Vai ao ar na próxima publicação do site que ela autorizar.

## Esperando a usuária
- Mandar os 6 rascunhos do Gmail pedindo a tabela de frete atualizada (São Miguel, Rodonaves, Braspress, Aceville,
  Norte Brasil e MIR; os dois últimos sem destinatário) e mandar aqui as tabelas que chegarem.
- Rodonaves: o ERP já pede o token no endereço certo (28/10, cb565ea, no ar). Ela testou no portal com o login do
  site: 400 invalid_grant. O usuário de API é pedido à unidade de vínculo (Cotação, Rastreio, Comprovante de entrega):
  e-mail enviado por ela em 28/10 à equipe comercial da unidade; esperando a resposta. Quando chegar: RODONAVES_USUARIO e RODONAVES_SENHA nos
  secrets e "Testar conexão". Ela precisa trocar a senha do site (apareceu num print).
- Braspress: os secrets BRASPRESS_USUARIO e BRASPRESS_SENHA não existem (testado 28/10). O acesso de produção
  vem da filial de atendimento (vendedor); o de 2022 é de outro CNPJ. Pedir para o CNPJ da MF e cadastrar.
- Melhor Envio: cadastrar o token nos secrets, se for usar.
- Depois de cada acesso cadastrado: clicar em "Testar conexão" no cadastro da transportadora; aí eu testo uma cotação real.

## Decisões da usuária
- Correios só pelo Melhor Envio (não há contrato direto).
- Rodonaves e Olist Envios são empresas diferentes; não misturar.
- Gastos com frete: só os CT-e da MF (os da My Frost foram para o chat MYF).
- Tabelas de frete para as transportadoras sem API (pedido de 24/10).
- Aba CT-e (26/10): período padrão "este mês", um cartão do frete pago com a barra compras/vendas/transferências,
  "O que fazer" com as ações, faturas agrupadas pela transportadora com as filiais dentro, abas em 3 grupos
  (Envios, Custos, Ajustes). CT-e de antes de out/2026 não entram em fatura (pagos pelas contas antigas).
- Senhas e chaves só nos secrets do Supabase, cadastradas por ela; nada de coleta ou contratação sem o ok dela.

## Onde está
- Telas: src/pages/Fretes.tsx, src/pages/Transportadoras.tsx, src/components/fretes/ (CotacaoRapida, FreteTabelas,
  FreteRegras, PesoMedidas, GastosFrete, ImportarCteXml, RastreioEntregas, EnvioForm), src/components/loja/CalcularFrete.tsx.
- Regras puras: supabase/functions/_shared/ (frete-cotar, frete-tabela, ml-frete, ssw, braspress, melhorenvio,
  rodonaves-api) e src/lib/ (fretes, gastosFrete, rastreio, transportadoras), com testes em src/lib/__tests__.
- Banco: frete_tabelas, frete_tabela_destinos, frete_consultas, configuracoes.frete_regras, envios (rastreio_*),
  ctes, importar_cte_xml, ctes_do_email, loja_criar_pedido_frete, loja_frete_ligado.
- Funções do Supabase: frete-cotar, ssw, braspress, melhorenvio, rodonaves.

## Próximos passos
1. Cadastrar as tabelas de frete que chegarem (passar PDF para a planilha modelo) e conferir no simulador.
2. Testar Rodonaves e Braspress quando o acesso certo estiver nos secrets.
3. Esperar pedido para: #212 APIs da lista da Magazord, #93 rastreio na página do cliente, #279 CT-e automáticos.
4. CT-e de mar a jul/2026 faltam: podem entrar pelo envio de XML.
