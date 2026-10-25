# MEMORY — MYF (ERP Line – My Frost)
Atualizado em 25/10/2026.

## Estado agora
A empresa anterior fica separada da MF, na Retaguarda → My Frost, só para a conta master. Lá estão o Painel, as notas, as
propostas, os fretes e protestos e os documentos. A Ficha 360 de cada cliente mostra para a equipe, com a tarja, as máquinas,
as notas e as propostas da empresa anterior. A auditoria fiscal começou e espera os documentos da Receita.

## No ar
- Painel como primeira aba: vendas por ano, máquinas, negociado × nota, fretes, protestos, avisos (1d6dcb9, `painel_my_frost`).
- Aba Fretes e protestos: fretes de 2021 a 2025 e cartas de anuência, quitações e avisos do cartório (bf1449d).
- Propostas da empresa anterior só na Retaguarda, com valores (ok do advogado) e a proposta assinada ligada (f05040d).
- Notas da empresa anterior isoladas: a lista completa só master; a ficha do cliente lê as dele pela função (717f0ac).
- Ficha 360 → Máquinas e compras: cada máquina com valor negociado, valor na nota, chave e como foi ligada (3b6ee85).
- Documentos da empresa anterior na aba Documentos (entidade `my_frost`, só master).

## Em andamento
- Auditoria fiscal (declarado × faturado no Simples), pedida pelo FIS: faturamento por ano já levantado; falta cruzar com o
  que foi declarado. O ano de 2022 passou do sublimite do Simples, e é o primeiro ponto a conferir.
- Parte "Compras" da empresa anterior, à parte da MF e sem repetir pela chave: falta o zip de compras de 2023.
- Próxima parte da planilha de propostas (da 501 em diante).

## Esperando a usuária
- Extratos do PGDAS-D, recibos da DEFIS e relatório de situação fiscal (e-CAC ou contador).
- Backup completo dos XML das notas emitidas: não está no Drive nem no Gmail. Sem ele, não há condição de pagamento.
- Levar ao advogado: comunicação do Domicílio Judicial, CNPJ inapto e dívida ativa de DIFAL em outro estado.
- Pagar as custas para cancelar os protestos que já têm autorização dos credores.
- Dizer se a 1ª parcela do parcelamento estadual foi paga; arrastar os documentos do Drive para a aba Documentos.

## Decisões da usuária
- Três coisas diferentes, que não se misturam: a empresa anterior, o licenciamento das sorveterias e a MF.
- Máquinas vendidas até 18/09/2025 são da empresa anterior; de outubro de 2025 em diante, da MF.
- O advogado liberou: a equipe toda vê na Ficha 360 os valores e as notas da empresa anterior, sempre com a tarja.
- Sem o backup dos XML, ligar máquina × proposta × nota pelo nome do cliente, o modelo e a data (460 de 1.152 ligadas).
- Marcadores nunca são tirados. Conferir antes de gravar e pedir confirmação para mudanças em lote.

## Onde está
- Telas: src/pages/NotasMyFrostContador.tsx, src/components/myfrost/ (PainelMyFrost, FretesProtestosMyFrost),
  src/components/clientes/MaquinasComprasFicha.tsx (o visual é do CLI), src/components/vendas/PropostasTiny.tsx.
- Banco: notas_legado (só master), propostas_tiny (empresa, documentos), equipamentos (origem, proposta_tiny_id,
  nota_legado_id, valor_negociado, ligacao_venda), my_frost_fretes, my_frost_protestos, compras_legado.
- Funções: painel_my_frost, notas_my_frost_do_cliente.

## Próximos passos
1. Quando chegarem os extratos do PGDAS-D: cruzar mês a mês e montar o relatório do que retificar (com o FIS no técnico).
2. Ligar as OS às máquinas da empresa anterior.
3. Montar Compras da empresa anterior com as notas e os CT-e achados.
