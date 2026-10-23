# Checklist do código (antes de pedir "Pode publicar")

Lista curta que todo chat confere no que mudou. Segurança e documentação ficam com os chats "Segurança" e "Documentos".

## 1. Conta certa
- Dinheiro: centavos arredondados (`Math.round(v * 100) / 100`), nada de somar texto, valor digitado lido com `lerValor`
  ("1.500" é mil e quinhentos, "45.90" e "45,90" são iguais).
- Datas: "hoje" é sempre `hoje()` (horário de Brasília). Nunca `new Date().toISOString().slice(0, 10)` (em UTC o dia
  vira às 21h). Data "AAAA-MM-DD" lida com `T12:00:00` para não cair no dia anterior.
- Nada contado duas vezes (conta + linha do extrato, nota + conta) nem sumindo do total.

## 2. Gravação segura
- Todo `supabase...` confere o `error` e mostra o aviso na tela.
- Gravação em várias etapas: ou uma função no banco (tudo ou nada), ou na ordem que não perde dado se parar no meio
  (grava o novo antes de apagar o velho). Se a 1ª etapa já gravou e só a 2ª falhou, avisa e não deixa repetir em dobro.
- Botão de gravar travado enquanto grava (clique duplo não grava duas vezes).
- Depois de gravar, atualizar tudo o que depende do dado (`invalidate` das tabelas e dos saldos).

## 3. Leve
- Não baixar tabela inteira: só as colunas usadas (`select`) e só as linhas da tela (filtro no servidor, `key`).
- Contas e somas grandes dentro de `useMemo`; lista filtrada por unidade também.
- Conferir no modo demonstração que os números da tela continuam iguais antes e depois.

## 4. Fácil de mexer
- Regra de negócio em `src/lib` (função pura, com teste em `src/lib/__tests__`), não repetida em duas telas.
- Componente com mais de ~300 linhas: separar. Código sem uso: apagar.
- Evitar `any` em valores de dinheiro.

## 5. Antes de enviar
- `npx tsc --noEmit -p .` e `npx vitest run` sem erro.
- Achado de prioridade alta (valor errado, dado perdido ou em dobro, tela travando) se conserta na hora;
  o resto vai para Sobre → Pedidos.
