# Regras de design do ERP Line (v1 · 27/10/2026)

Texto da usuária, revisado e adaptado ao ERP pelo chat de Design system (DSG). Vale para toda tela nova e para toda
mudança de tela, em qualquer chat. Referências: Material Design 3, Apple Human Interface Guidelines, Atlassian Design
System e WCAG 2.2 (nível AA).

O objetivo: o ERP precisa ser bonito, fácil de entender, igual em todas as telas, rápido e fácil de mudar.
O design system está pronto quando uma função nova pode ser feita só com as peças que já existem, sem perder qualidade.

## As 12 regras

1. **Consistência.** Botão, campo, menu, cabeçalho, tabela e filtro têm um jeito só no ERP inteiro. Tela nova usa as
   peças de `src/components/ui.tsx` (Button, Field, Card, Section, Table, Tabs, Modal, BarraFiltros, Secoes…). Peça nova
   só entra quando nenhuma serve, e entra como peça comum, não dentro da tela.
2. **Hierarquia.** Em 3 segundos a pessoa sabe onde está (trilha e título), o que importa (o que pede atenção vem
   primeiro) e o que fazer (uma ação principal por tela: o único botão cheio; o resto é contorno, texto ou "Mais").
3. **Cor com função.** Cada cor tem um papel: marca (ação principal, link, foco), superfície, texto, borda e os estados
   sucesso (verde), alerta (âmbar), erro (vermelho) e informação (azul). A cor nunca é o único sinal: o estado também
   tem texto ou ícone. Sem degradê, brilho ou sombra pesada como enfeite.
4. **Letras.** Duas famílias: Poppins nos títulos, botões e números grandes; DM Sans no texto e nos campos. Escala
   única (`TEXTO` em `src/design/tokens.js`). Texto corrido e células com pelo menos 14 px na tela; rótulos com 12 px
   ou mais; 11 px só em etiquetas e selos curtos. Campos com 16 px no celular (o iPhone não dá zoom).
5. **Espaços.** Escala de 4 px (4, 8, 12, 16, 24, 32). Cantos, espaços, sombras e camadas só pelos nomes dos tokens
   (`rounded-cartao`, `p-cartao`, `z-janela`), nunca valor solto como `rounded-[14px]` ou `bg-[#…]`.
6. **Peças reutilizáveis.** Uma biblioteca só, com variantes documentadas em Sobre → Design e no Design System do Claude.
   Toda peça tem: para que serve, variantes, quando não usar e exemplo.
7. **Estados completos.** Cada peça trata normal, foco visível, hover (no computador), selecionado, desativado,
   carregando, sucesso e erro. Cada lista ou painel trata carregando (`Carregando`), vazio (`Vazio`, com o próximo passo)
   e erro (`ErroLista`, com "Tentar de novo"). Texto solto "Carregando…" ou "Nenhum registro" não vale.
8. **Celular de verdade.** As tarefas principais funcionam no celular: tabela vira cartão, filtros vão para o botão
   Filtros, ações secundárias para o "Mais", nada rola para os lados. Não é só encolher a tela do computador.
9. **Acessibilidade (WCAG 2.2 AA).** Contraste de 4,5:1 no texto comum e 3:1 no texto grande e nos ícones que informam.
   Área de toque de pelo menos 44 × 44 px no celular nas ações principais (24 × 24 px é o mínimo absoluto para ações
   pequenas dentro de linhas). Todo ícone sozinho tem `aria-label`; foco sempre visível; dá para usar só com o teclado.
10. **Navegação previsível.** Menu estável, busca (Ctrl+K), trilha e "Voltar" em toda tela, filtros que mostram o que
    está ligado e aviso depois de cada ação. Nenhuma tela termina sem saída: erro diz o que fazer, lista vazia diz o
    próximo passo, janela tem Cancelar.
11. **Rapidez e segurança na operação.** A tela responde na hora e mostra quando está carregando. Botão que grava fica
    travado enquanto grava (`carregando`), para não gravar duas vezes. Ação que não se desfaz (excluir, cancelar nota,
    pagar) pede confirmação; as outras oferecem "Desfazer". Animação só para explicar uma mudança, e some para quem
    pede menos movimento.
12. **Governança.** Cada peça tem dono (este chat), documentação, teste e histórico no git. Os limites do teste
    `designSystemPadrao.test.ts` só descem. Mudança numa peça comum é conferida no claro, no escuro e no celular antes
    de publicar.

## Regras a mais para um sistema de gestão

| Área | Regra |
|---|---|
| Início e painéis | Primeiro o que pede atenção (exceções e atrasos), depois os números, depois a tendência. Cada número abre a lista que o explica. A pessoa organiza a ordem (Organizar). |
| Cadastros | Obrigatório marcado com *, erro no próprio campo na hora, máscara e conferência (CPF/CNPJ, Receita) e aviso de cadastro repetido antes de salvar. Cadastro novo em passos quando é longo. |
| Tabelas | Busca, filtros, ordenação, contagem e total no rodapé, seleção com ações em lote quando fizer sentido, e "Ver mais" em vez de páginas quando a lista é grande. |
| Financeiro | Valores em R$ 1.234,56 com algarismos alinhados (`num`), datas dd/mm/aaaa, situação da conciliação visível e confirmação antes de pagar, baixar ou estornar. |
| Permissões | Cada papel vê só o que pode usar (menu, telas, botões), e o banco confere de novo (RLS): esconder o botão não basta. A master confere com o "Ver como". |
| Marcas | O núcleo das peças é um só. Cada marca do grupo pode ter o seu tema (cor, logo, letras) pela Aparência, sem copiar telas. |

## Como o design system se organiza

O manual com os tokens, cada peça (para que serve, entradas, estados, acessibilidade), os padrões, os nomes e a
contribuição fica ao lado do código: `src/design/README.md` (v1.0, 30/10).


1. **Fundamentos:** cores, letras, espaços, grade, ícones e tokens (`src/design/tokens.js`, `src/index.css`).
2. **Peças:** botões, campos, cartões, tabelas, janelas, menus, filtros, abas, avisos (`src/components/ui.tsx` e afins).
3. **Padrões de uso:** cadastro, aprovação, busca, painel, erro, lote, confirmação.
4. **Telas e caminhos:** Vendas, Financeiro, Estoque, Assistência, Fiscal… cada uma montada com os itens 1 a 3.

## Conferência de cada tela (antes de publicar)

1. Usa só tokens e peças oficiais.
2. A ação principal está clara (um botão cheio).
3. Funciona no computador e no celular (390 px e 320 px).
4. Tem carregando, vazio, erro e sucesso.
5. Tem caminho de volta, Cancelar e aviso depois da ação.
6. Passa no contraste, no tamanho de toque e no teclado.
7. Respeita as permissões e confirma o que não se desfaz.
8. Foi testada com uma tarefa real (ex.: lançar uma venda do começo ao fim).

O chat de Design system é o auditor dessas regras: confere as telas novas e faz a auditoria geral do ERP de tempos em
tempos. Cada achado vai para o chat dono da tela; o que é de peça comum, ele mesmo conserta.
