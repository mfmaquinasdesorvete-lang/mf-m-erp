# MEMORY — CAR (ERP Line – Minha carteira (pessoal))
Atualizado em 25/10/2026 (auditoria).

## Estado agora
Painel pessoal (Retaguarda → Pessoal, só a conta master) completo: resumo, encontro de contas, extratos por mês,
contas do mês, controle sem cobrança e a ficha das empresas. O que falta depende de extratos e respostas da usuária.

## No ar
- Resumo da carteira no alto da aba Dinheiro: números do período, encontro de contas por empresa, "pode ser da
  empresa", contas pessoais por tipo e passo a passo do contador; planilha do contador com o encontro (c841ead).
- Aba Extratos: um quadradinho por mês em cada conta (extrato, só digitado, faltando, faltam os últimos dias) (d605391).
- Minhas empresas: ficha de cada empresa (inscrições, endereço próprio e da Receita, contatos, notas, folha),
  migração 20261101000101 (3f71515).
- Contas do mês (pessoal_mensais e pessoal_mensais_pagos): marcar pago, comprovante, lançamento na conta e aviso
  no meio da tela antes de vencer (5695963). Primeira conta: o DAS de um MEI da família.
- Trava de valor: a voz não lê telefone/documento como valor e o banco recusa |valor| ≥ 10 milhões
  (14733e6, migração 20261101000162).
- Cartão "Controle (não vou cobrar)" (pessoal_controle): valores só para acompanhar, fora dos saldos (e90d5a7).
- Conta encerrada com as vendas por dia de uma loja que usou a maquininha de um familiar (dados, sem código novo).

## Em andamento
- Nada em código.

## Esperando a usuária
- Dizer o valor certo de um lançamento digitado que foi anulado na auditoria (aluguel com água e luz).
- Dizer se uma conta antiga (extrato só de 2024) ainda existe, para encerrar ou acertar o saldo.
- Dizer o que passou para a conta de um familiar em 23/09.
- Importar extratos que faltam: conta da loja (março, setembro, outubro), conta do familiar (dez/jan/fev).
- Cadastrar os secrets do Meu Pluggy no Supabase.
- CNPJ de uma empresa ainda a abrir, para Minhas empresas.
- Conferir uma conta de água em aberto em nome dela.

## Decisões da usuária
- Dados pessoais não saem deste chat; repositório público só com regra e estrutura.
- Uma das empresas dela fica fora deste ERP (vai ter um ERP próprio): não buscar nada dela.
- Tudo que não é da MF fica no painel pessoal (ex.: DAS do MEI, certidões das outras empresas).
- O que ela não vai cobrar de alguém da família fica só no cartão de controle (não vira conta a receber da MF).
- Usar sempre o nome padrão que ela definiu para cada pessoa.
- Lançamento em lote, só depois do ok dela; o contador dá o nome contábil (aporte, mútuo, reembolso, pró-labore).

## Onde está
- Telas: src/pages/Pessoal.tsx; src/components/pessoal/ (ResumoCarteira, ExtratosRecebidos, ContasDoMes,
  ControleSemCobranca, MinhasEmpresas, MeuPluggy, RegrasCards, GastoPessoal, MeusEnderecos).
- Regras: src/lib/pessoal.ts, pessoalCards.ts, encontroContas.ts, extratosRecebidos.ts, contasDoMes.ts,
  controlePessoal.ts, minhasEmpresas.ts.
- Banco: pessoal_contas, pessoal_lancamentos, pessoal_regras, pessoal_empresas, pessoal_enderecos, pessoal_mensais,
  pessoal_mensais_pagos, pessoal_controle (todas com dono = auth.uid()).
- Funções do Supabase: pessoal-pluggy.

## Próximos passos
1. Certidões das empresas que não são a MF (sem a empresa que fica fora): tabela própria ligada a Minhas empresas, reaproveitando
   quadroCertidoes, prazoDe e validadeSugerida de src/lib/certidoes.ts.
2. Detectar extrato da mesma conta importado em outra conta (o "repetidos" hoje só olha dentro da mesma conta).
3. Quando chegarem os extratos que faltam, conferir os pagamentos mensais pedidos pelo GER e responder só data e valor.
