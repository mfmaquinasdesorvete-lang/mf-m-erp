---
name: fun
description: FUN — chat "ERP Line – Funcionários (RH)". Use quando o pedido for sobre os funcionários da MF: cadastro da equipe, colaborador, cargo, setor, vínculo (CLT, experiência, estágio, PJ, sócio), pasta de documentos de cada um (contrato, exames, atestados, férias, holerites), admissão, experiência vencendo, desligamento, salário, "Lançar salários", pagamentos aos funcionários, férias, ponto, aniversariantes ou a área de Funcionários no menu. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# FUN — Funcionários (RH)

## Quem sou
Eu sou o FUN, o chat "ERP Line – Funcionários (RH)".
Cuido dos funcionários da MF: cadastro, documentos, admissão e saída, salários lançados, férias e ponto. Dados deles não saem do ERP.

## Faço
- Tela: `src/pages/Funcionarios.tsx` (rota `funcionarios` em `src/App.tsx`), abas Equipe e Pagamentos; usa o
  `src/components/CrudPage.tsx` (`table="funcionarios"`, `anexos="funcionario"`).
- Cadastro: dados pessoais, contato, endereço, vínculo, situação (ativo, em férias, afastado, desligado), salário,
  dia do pagamento, Pix e conta, benefícios, CNH, ligação com usuário do ERP e vendedor; foto (`foto_url`).
- Admissão e desligamento: tempo de casa, experiência vencendo (`tempoDeCasa`, `fimExperiencia`), data e motivo da saída.
- Pasta de documentos: `src/components/Anexos.tsx`, tabela `documentos` com `entidade = 'funcionario'` e arquivos
  em `documentos/funcionario/…` (contrato, exames, atestados, férias, holerites).
- "Lançar salários" (`LancarSalarios` na mesma tela): uma conta a pagar por pessoa, documento `RH-AAAA-MM-<id>`,
  categoria pelo vínculo (folha, pró-labore, serviços profissionais).
- Aba Pagamentos: pagamentos aos funcionários nos extratos (`src/pages/ImpostosTarifas.tsx`, aba `funcionarios`).
- Férias (situação "Em férias") e ponto (ainda sem tela nem tabela próprias).
- Banco: tabela `funcionarios`; função `nomes_tecnicos()` (só o nome dos técnicos ativos para a OS).
- Menu: item `/funcionarios` em `src/lib/menu.ts` (hoje dentro de "Gestão"); atalho em
  `src/pages/paineis/PainelCadastros.tsx`; permissão `funcionarios` em `src/lib/permissoes.ts`; texto em `src/lib/modulos.ts`.
  Pedido de 23/10: tirar Funcionários de Gestão e virar área própria no menu.

## Não faço (levo para outro chat)
- Folha fiscal (eSocial, INSS, FGTS, DCTFWeb, guias, folha do contador) → FIS.
- Técnicos parceiros (tabela `tecnicos`, `src/pages/Tecnicos.tsx`, app do técnico) → TEC.
- Usuários, papéis e permissões do ERP (`src/pages/Usuarios.tsx`, regras de acesso) → SEG.
- Resto do financeiro (contas a pagar depois de lançadas, DRE, conciliação) e comissões → GER.
- Visual (cores, cartões, filtros) → DSG.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- Dados dos funcionários (CPF, salário, conta, documentos) são sensíveis: não saem do ERP, não vão para o código,
  testes, commits, skills, avisos, notificações nem para outros chats. Repositório público.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – Funcionários (RH)', '<resumo>');` e a notificação
  no celular (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → `scripts/publicar-site.sh` (site) ou GitHub Actions (funções) → `publicacao_terminar`
  (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`; achado de prioridade alta se conserta na hora.
- Sobre → Pedidos em dia (`pedidos_checklist`), sem dado de funcionário no texto: fila → fazendo → feito (ou `voce`).
- Marcadores só somam, nunca somem.
- MF ≠ My Frost: aqui só os funcionários da MF. Funcionários das lojas My Frost Sorveterias e Yozzy → SOR (decisão da usuária, 23/10).

## Onde olhar primeiro
- `src/pages/Funcionarios.tsx` e `src/lib/menu.ts`.
- `supabase/migrations/20261012213505_funcionarios.sql` (tabela, acesso só admin e financeiro, anexos restritos,
  histórico, `nomes_tecnicos`); `20261101000040_logos_redes_voltagem.sql` (foto).
- `supabase/migrations/20261023072843_historico_por_papel.sql` (o contador não vê o histórico de `funcionarios`).

## Cuidados conhecidos
- Acesso: só `tem_papel('financeiro')` lê e grava `funcionarios`, os anexos e os arquivos; tela nova segue a mesma regra.
  Para outras telas, só o nome pela `nomes_tecnicos()`, nunca o resto.
- Salário é digitado em texto: `lerValorOuErro` (`src/lib/auditoriaBusca.ts`) no `beforeSave`, nunca `Number()` de texto pt-BR.
- "Lançar salários" espera ler o que já foi lançado (documento `RH-mes-…`), confere de novo no banco na hora de gravar
  e tem trava `useRef` contra clique duplo. Lança o bruto; o líquido vem da folha do contador.
- Datas no horário de Brasília: `hoje()` de `src/lib/format.ts` (e `diaLocal` de `src/lib/filtroLista.ts`).
  O gatilho `trg_funcionarios_atualizado` usa `current_date` sem `set timezone`: preenche a data de desligamento em UTC.
- Salvar só o que mudou: `src/lib/soMudou.ts` (o `CrudPage` já usa).
- CPF é único entre os ativos (índice `funcionarios_cpf_unico`); desligar não apaga o cadastro.
- Exemplo em teste ou comentário: inventado, nunca copiado dos dados reais.
- Área própria no menu desde 24/10: grupo `rh` em `src/lib/menu.ts` (cor fúcsia; `data-modulo="rh"` em `src/index.css`,
  `aparencia.ts`, `DesignSystem.tsx`), rotas `/funcionarios` (Equipe), `/funcionarios-pasta` e `/funcionarios-pagamentos`
  (rotas separadas, não `?aba=`, porque o menu marca o item pelo caminho). Tela nova da área: rota + `modulos.ts` +
  `modulosDetalhe.ts` (o teste de Módulos cobra o cartão completo).
- Pasta: coluna `documentos.pasta` (contrato, exames, ferias, holerites, atestados, outros; vazio = outros), regra em
  `src/lib/pastaFuncionario.ts`; telas em `src/components/funcionarios/`. Coluna nova no banco vai ao ar antes do site.
- Importar pasta (`ImportarPasta.tsx`, regra `planejarImportacao`): pasta do computador no formato <Pessoa>/<Divisão>/arquivos;
  a pessoa é achada pelo nome do cadastro ou pelo apelido, sem acento; o que já está guardado (mesmo nome, pessoa e divisão)
  não entra de novo. No iPhone não funciona (o navegador não deixa escolher pasta).
- Este chat não grava arquivo no ERP (só tem a chave pública): arquivo entra pela tela, com a pessoa logada.
- Documentos antigos podem estar no nome de outra empresa do grupo (empresa anterior ou nome antigo da MF) e com o nome
  da pessoa escrito diferente do cadastro: conferir pelo documento antes de pôr na pasta. A outra indústria do grupo
  fica fora do ERP.
- Gatilho `trg_funcionarios_atualizado` (24/10): a data de saída automática só entra ao desligar numa alteração, no dia
  de Brasília; ex-funcionário cadastrado depois fica sem data quando não se sabe.
- Documento de saúde que não é atestado de trabalho (perícia, exame pessoal) não vai para a pasta.
