# Auditoria do ERP — segunda rodada, 31/10/2026 (REV)

Comparação com a primeira rodada (`auditoria-2026-10-27.md`), depois de 311 envios dos chats. Banco só lido.

## Medidas

| O quê | 27/10 (antes) | 27/10 (depois) | 31/10 (agora) |
|---|---|---|---|
| Pacote que todos baixam ao entrar | 918 KB (gzip 275) | 827 KB (gzip 247) | **724 KB (gzip 214)** |
| Sobre ao abrir | 424 KB | 411 KB | **169 KB** (tinha voltado a 500 KB) |
| Listas sem `select:` | 346 de 624 | — | 340 de 643 |
| Índices de chave estrangeira faltando | 11 | — | 4 (todos de tabelas novas) |
| Índices repetidos | 3 | — | 0 |
| Regras de acesso que reconferem o usuário a cada linha | 9 | — | 3 (tabela nova) |
| Tabelas sem uso | 1 | — | 0 |
| Links internos quebrados | 0 | — | 0 |
| Telas sem entrada | 0 | — | 0 |
| Cópias do arredondamento de centavos (`r2`) | 46 | — | 53 |

## Consertado nesta rodada (pequeno, seguro, sem dono)

| O quê | Antes | Depois |
|---|---|---|
| "Perguntar à IA" ainda entrava no pacote de entrada pelo botão do microfone (`AnotarPorVoz.tsx`): agora carrega só quando alguém pergunta | 815 KB | 764 KB |
| "Meus avisos" (com os modelos de mensagem) carrega só quando é aberto (`Layout.tsx`) | 764 KB | 724 KB |
| Sobre: as 14 abas carregavam juntas; agora cada uma carrega quando é aberta (`pages/Sobre.tsx`) | 500 KB | 169 KB |
| Sobras do quadro antigo das contas a pagar e dos filtros apagados em 27/10 (`soltarNaColuna`, `AcaoArrastar`, `filtrosEmUso`, com os testes), dentro da autorização da usuária de 27/10 | — | — |

## Achados

| # | O quê | Onde | Peso | Conserto | Chat dono |
|---|---|---|---|---|---|
| 1 | Teste de segurança do banco falhando: função `security definer` nova sem conferir quem chama | `conta_receber_pix_do_dia` em `supabase/migrations/20261101000204_cobranca_pix_do_dia.sql` (teste `bancoSeguranca.test.ts`) | alta | Conferir o papel de quem chama, ou justificar no teste | GER (com o SEG) |
| 2 | Auditoria financeira ainda baixa o histórico, o extrato e as contas inteiras | `src/pages/Auditoria.tsx:82-88` | alta | Combinado com o GER em 27/10, ainda não feito | GER |
| 3 | Listas sem `select:` ainda em clientes (9 telas), produtos (29), fornecedores (14) e extrato (7) | ex.: `pages/Pedidos.tsx:667`, `pages/Pdv.tsx:76`, `pages/Assistencia.tsx:289` | média | Usar `SELECT_LISTA_CLIENTES` e `SELECT_LISTA_PRODUTOS` | GER |
| 4 | `vigiar_sistema()` ficou mais lenta: média 3,2 s (era 2,6 s), até 23 s, de hora em hora | cron `erp-vigiar-sistema` | média | Ver o que a vigia conta a cada hora; guardar o que não muda | SEG |
| 5 | Regras de acesso da tabela nova de marcas reconferem o usuário em cada linha (3 regras) e a chave `dono` sem índice | `licenciados_marcas` | baixa | `(select auth.uid())` e índice em `dono` | SOR |
| 6 | Chaves sem índice em tabelas novas | `auditor_achados.ultima_rodada`, `equipamentos_unificados.ficou_id`, `oportunidades.unidade_id` | baixa | `create index if not exists` | AUD, quem fez a unificação de máquinas, GER |
| 7 | Arredondamento de centavos copiado: subiu de 46 para 53 cópias | vários | média | A `centavos()` única em `lib/format.ts` que o GER combinou | GER |
| 8 | Funções novas ainda sem uso (podem ser de trabalho em andamento) | `lib/tornearia.ts` (`kgDaBarra`), `lib/tiposPagar.ts` (`prazoPagar`) | baixa | Usar ou apagar | GER / PRD |
| 9 | Conferência com a Receita: 144 ms em média por minuto, mas a checagem sozinha leva 7 ms; o resto é o trabalho real (~1.300 CNPJs na fila) | cron `erp-clientes-receita` | info | Nada a fazer até a fila acabar | — |
| 10 | Duas regras de acesso para a mesma ação (76 casos, 51 tabelas): sem mudança | advisor | baixa | O SEG faz aos poucos | SEG |

## Conferido e sem problema
- Links internos, telas sem entrada e rotas repetidas: nenhum novo. `/estoque` e `/produtos/pecas` abrem a mesma tela de propósito.
- Tabelas novas (`auditor_*`, `oportunidades`, `paginas_claude`, `pedido_pagamentos`, `config_ajustes`, `equipamentos_unificados`) são usadas por telas ou funções do banco.
- A biblioteca de animações nova (gsap) não entra no pacote de entrada.
