# Auditoria de experiência · Cadastros · 30/10/2026

Cadastros: Clientes, Peças, Máquinas, Fornecedores e Técnicos.

- **Público:** equipe da MF (vendas, compras, fábrica, assistência), no computador e no celular.
- **Tarefas:** achar um cadastro, criar um novo sem repetir, corrigir um dado.
- **Objetivo:** cadastro certo e completo, rápido, sem duplicar.

**Como foi visto:** leitura do código (`CrudPage`, `ClienteForm`, `Produtos`, `Fornecedores`, `Tecnicos`) e o mesmo
roteiro no modo demonstração, em 1440 px e em 390 px com toque:

1. abrir a lista;
2. buscar algo que não existe;
3. "Novo";
4. salvar vazio;
5. digitar e apertar Esc.

Fotos e números do teste ficaram no rascunho da sessão (não no repositório).

## O que já funciona bem (nos 5)

- Nada vaza para o lado no celular; a lista vira cartões com os números principais (custo, venda, estoque).
- Esc ou o X com algo digitado pergunta "Sair sem salvar?" antes de perder.
- Carregando e erro com "Tentar de novo" vêm da peça comum.
- "Mostrar mais" nas listas grandes; exportar para planilha; ações em lote com confirmação antes de excluir.
- **Clientes:** cadastro em 5 passos com "Preencher com IA", dados da Receita pelo CNPJ, "Pode deixar para depois" e
  o aviso do que falta para a ficha ficar completa.
- **Peças e Máquinas:** "Já cadastrados parecidos" enquanto digita e "Ver tudo em abas" para quem prefere.

## Achados, por prioridade (impacto × esforço)

### Na peça comum (`CrudPage` / `ui.tsx`, dono: DSG): um conserto vale para todos

| # | Achado | Prova | Impacto | Esforço |
|---|---|---|---|---|
| A1 | **Campo obrigatório sem a marca \*** | Teste: Peças, Máquinas, Fornecedores e Técnicos têm 1 obrigatório e 0 marcados. O `CrudPage` não passa `obrigatorio` ao `Field`. Clientes marca escrevendo " \*" no texto do rótulo, e o leitor de tela lê "asterisco". | Alto | Baixo |
| A2 | **Obrigatório vazio não fica vermelho nem recebe o foco** | Teste em Peças e Máquinas: "Próximo" vazio mostra só o aviso no canto ("Preencha para seguir: Descrição"); o campo continua normal e o foco fica no botão. Em Clientes acontece o mesmo ("Informe o nome do cliente"). No código, o erro no campo só existe para os campos com máscara (CPF, e-mail…). | Alto | Baixo |
| A3 | **Cada cadastro avisa o erro de um jeito** | Teste: Fornecedores e Técnicos usam o balão do navegador; Peças, Máquinas e Clientes usam o aviso no canto. | Médio | Baixo (sai junto com A2) |
| A4 | **Título genérico da janela** | Teste: "Novo cadastro" e "Editar" em Peças, Máquinas, Fornecedores e Técnicos. A pessoa não confirma onde está (Clientes já diz "Quem é o cliente?"). | Médio | Baixo: "Nova peça", "Editar fornecedor · Nome" |
| A5 | **Busca sem resultado: texto diferente e sem próximo passo** | Teste: no computador aparece "Nenhum registro encontrado.", no celular "Nada com essa busca ou filtro.", e nenhum dos dois tem "Limpar busca" (regra 7). | Médio | Baixo |

### Em cada tela (vai ao chat dono)

| # | Tela | Achado | Prova | Impacto | Esforço | Dono |
|---|---|---|---|---|---|---|
| B1 | Técnicos | **Formulário longo sem passos nem blocos fechados** | Teste: 24 campos e cerca de 2.000 px no computador, numa coluna só (no celular só a 1ª parte vem aberta). | Médio | Médio | TEC |
| B2 | Técnicos | **Sem aviso de cadastro repetido** | Código: nenhuma conferência de nome, telefone ou documento parecido ao criar. | Médio | Médio | TEC |
| B3 | Técnicos | "Logo" aparece duas vezes; UF é texto livre (aceita "sc", "Santa") | Teste. | Baixo | Baixo | TEC |
| B4 | Fornecedores | **Repetido só se resolve depois** ("Unificar repetidos"); não vi aviso ao digitar o CNPJ de um fornecedor que já existe | Código; confirmar no teste com um CNPJ real. | Médio | Médio | GER |
| B5 | Fornecedores | Formulário de 21 campos no computador sem passos (no celular vem só a 1ª parte) | Teste. | Baixo a médio | Médio | GER |
| B6 | Peças e Máquinas | **8 passos para cadastrar uma peça simples** e não dá para salvar no 1º passo (o "Salvar agora" só aparece do 2º em diante) | Teste e código. | Médio | Baixo: "Salvar agora" também no 1º passo quando o obrigatório está preenchido | PRD |
| B7 | Clientes | Em "Pessoa física", o exemplo do CPF fala de CNPJ e aparece cortado | Teste no celular. | Baixo | Baixo | CLI |

## Ordem para consertar

1. **Peça comum (DSG), já:** A1, A2 e A3 juntos (obrigatório marcado, campo vermelho com a mensagem embaixo e o foco
   no 1º que falta, um jeito só de avisar), depois A4 e A5. Corrige os 5 cadastros e todos os outros do ERP feitos
   com a mesma peça.
2. **Telas:** B6 (PRD) e B2 e B4 (repetidos, TEC e GER) primeiro; depois B1, B5, B3 e B7.

Depois do conserto: cadastrar uma peça, um fornecedor e um técnico do começo ao fim no ERP no ar, errando de
propósito um obrigatório e um CNPJ repetido.
