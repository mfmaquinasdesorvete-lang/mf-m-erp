# MEMORY — FUN (ERP Line – Funcionários (RH))
Atualizado em 29/10/2026.

## Estado agora
Funcionários é uma área própria do menu, com 6 abas no ar. O cadastro tem a equipe atual e os ex-funcionários
das épocas anteriores. Falta a usuária importar os documentos do Drive (a pasta já está montada).

## No ar
- Área própria no menu, fora de Gestão (b983c28).
- Pasta de documentos por pessoa, com divisões; coluna `documentos.pasta` (b983c28).
- Importar pasta: guarda de uma vez uma pasta <Pessoa>/<Divisão>/arquivos (337cb32).
- Data de saída automática só ao desligar numa alteração (3edf65d).
- Cartões de abertura que filtram a lista (54a7f38) e lista que começa fechada (f22deb5).
- Admissão e saída: o que falta no cadastro e na pasta (ede120d).
- Férias e ponto: períodos, vencimento e lançamento; divisão Ponto (9fcc2f0).
- Página Crown Móveis: época antes da MF, com/sem carteira e pagamentos antigos (450481e).
- Recibos da equipe só em Funcionários → Recibos, leitura só admin e financeiro (6f1524a; banco e site no ar em 29/10).
- Recibos da equipe com um cartão por pessoa; abrir mostra só os dela (2b2974a, regra `src/lib/recibosPorPessoa.ts`).

## Em andamento
- Nada; os pedidos esperam o teste na tela (abaixo).

## Esperando a usuária
- Rodada de fechamento: daqui não há login no ERP. Os 4 pedidos de 24/10 estão "voce" com a conferência no detalhe;
  falta o teste na tela, feito por ela (ou por um chat com o computador dela): Equipe (lista fechada e os 5 cartões),
  Crown Móveis (filtro e abrir pessoa), Importar pasta e Recibos (cartões por pessoa, abrir um cartão).
- Baixar no computador a pasta "ERP – Pastas dos funcionários" do Drive da MF e usar Importar pasta.
  Depois, conferir no banco quantos arquivos entraram por pessoa.
- Pagamentos da época Crown com meses sem documento; os extratos daquela época no Drive podem completar.

## Decisões da usuária
- O chat cuida só dos funcionários da MF; os das lojas ficam com o SOR; a outra indústria do grupo fica fora do ERP.
- Documentos antigos no nome da empresa anterior entram na pasta da pessoa assim mesmo.
- Ex-funcionários da Crown (nome antigo da MF) ficam numa página só deles, fora da equipe atual.
- Cartões: "Sem carteira" = autônomo na ativa; "No INSS" = situação afastado.
- Férias e ponto no modo simples: períodos e lançamento das férias; folha de ponto na pasta.
- Recibos de funcionário ficam só na área de Funcionários, fora do Financeiro.
- Use sempre o nome do cadastro (inclusive o nome social) nas pastas e nos títulos.

## Onde está
- Telas: `src/pages/Funcionarios.tsx` e `src/components/funcionarios/` (PastaFuncionario, PastaDaEquipe,
  ImportarPasta, AdmissaoSaida, FeriasEquipe, CrownMoveis).
- Regras: `src/lib/pastaFuncionario.ts`, `grupoFuncionarios.ts`, `admissaoFuncionario.ts`, `ferias.ts`, `crown.ts`.
- Rotas: /funcionarios, -pasta, -admissao, -ferias, -crown, -recibos, -pagamentos.
- Recibos: o componente é do Financeiro (`src/components/financeiro/Recibos.tsx`, opção `escopo`); a marca
  `recibos.de_funcionario` vem do gatilho `trg_recibo_de_funcionario`.
- Banco: `funcionarios` (+ `epoca_crown`), `documentos` (+ `pasta`), `funcionario_ferias`,
  `funcionario_pagamentos`, `recibos.de_funcionario`; gatilho `trg_funcionarios_atualizado`.
  Acesso só de admin e financeiro.
- Funções do Supabase: nenhuma.

## Datas de fim de ano (calendário da contabilidade, recebido em 28/10)
- Até 25/11: mandar ao escritório a programação de férias, rescisões e admissões (depois não admite mais em 2026).
- Até 28/11: 1ª parcela do 13º. 05/12: salário de novembro. Até 18/12: 2ª parcela do 13º e adiantamento de dezembro.
- 08/01/2027: salário de dezembro. Escritório fechado de 19/12 a 03/01. Impostos da folha: com o FIS.
- Hoje ninguém na ativa tem carteira assinada: 13º e férias só valem para quem for registrado até lá.

## Próximos passos
1. Quando a usuária importar a pasta, conferir os arquivos por pessoa.
2. Se ela quiser, completar os meses da época Crown pelos extratos daquela época.
