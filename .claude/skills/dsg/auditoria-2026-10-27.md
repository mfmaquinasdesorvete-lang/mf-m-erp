# Auditoria de design · 27/10/2026

Primeira auditoria do ERP pelas regras de `regras-design.md`. Medido no código da `paineis-no-ar` (432 telas e peças).
Situação: ✅ atende · 🟡 em parte · 🔴 falta.

| # | Regra | Situação | O que foi visto |
|---|---|---|---|
| 1 | Consistência | 🟡 | Peças comuns existem e um teste barra o que é solto. Ainda há 356 botões feitos à mão (eram 697) e 33 cores soltas (eram 608). |
| 2 | Hierarquia | 🟡 | Início, painéis e Notas com uma ação principal ao lado do título. Outras telas ainda têm 2 ou 3 botões cheios lado a lado. |
| 3 | Cor com função | ✅ | Tokens de marca, superfície, texto, borda e estados; selos com texto e cor; sem degradê decorativo desde 24/10. |
| 4 | Letras | 🔴 | Duas famílias e escala única ✅. Mas no celular a letra base é 15 px: o texto das listas (`text-sm`) fica com 13 px e os rótulos (`text-xs`, 2.608 usos) com 11 px, abaixo de 14 e 12 px. |
| 5 | Espaços | ✅ | Escala de 4 px do Tailwind e nomes de uso (`p-cartao`, `rounded-cartao`, `z-janela`); 7 valores soltos restantes. |
| 6 | Peças reutilizáveis | 🟡 | Biblioteca em `ui.tsx` e vitrine em Sobre → Design; o Design System no Claude ainda é de 24/10 (sem escuro liso, Organizar, estados). |
| 7 | Estados | 🔴 | Peças `Carregando`, `Vazio` e `ErroLista` existem, mas só os cadastros usam. Há 86 "Carregando…" e 20 "Nenhum … encontrado" escritos à mão; só 2 telas mostram erro com "Tentar de novo". |
| 8 | Celular | ✅ | Tabela vira cartão, busca e filtros numa linha, "Mais" para ações, Início próprio do celular. |
| 9 | Acessibilidade | 🟡 | 866 `aria-label`, foco visível, cores de texto entre 5,0 e 10,3:1. Corrigido hoje: título do menu (3,8 → 5,1:1). Falta: toque de 28 a 32 px nos botões de ícone, mini e chips (pede 44 px nas ações principais). |
| 10 | Navegação | ✅ | Menu estável, Ctrl+K, trilha com Voltar, página "não encontrada", aviso depois das ações, "Ver como" para a master. |
| 11 | Rapidez e segurança | 🟡 | 121 confirmações e "Desfazer" nos avisos. Só 23 botões usam a trava `carregando` (64 formulários com botão de enviar). Lentidão é com o chat Revisão. |
| 12 | Governança | 🟡 | Dono, teste guarda, memória e histórico no git. Falta documentação de cada peça no mesmo lugar do código e um número de versão do design system. |

## O que fazer, em ordem

1. **Estados (regra 7):** trocar os 86 "Carregando…" e 20 "Nenhum … encontrado" pelas peças; erro com "Tentar de novo" nas listas que não são cadastro. (DSG)
2. **Toque (regra 9):** botões de ícone, mini e chips com área de toque de 40 a 44 px no celular, sem aumentar o desenho (área invisível em volta). (DSG)
3. **Trava de clique duplo (regra 11):** `carregando` em todo botão que grava. (DSG nas peças; cada chat nas suas telas)
4. ~~Letras no celular (regra 4)~~: feito em 27/10 (texto 14 px, rótulos 12 px no celular), com o sim da usuária.
5. **Botões feitos à mão (regra 1):** baixar de 356 aos poucos, começando pelas telas mais usadas. (DSG + chats donos)
6. **Design System no Claude (regras 6 e 12):** atualizar com o escuro liso e as peças novas, com versão. (DSG)
