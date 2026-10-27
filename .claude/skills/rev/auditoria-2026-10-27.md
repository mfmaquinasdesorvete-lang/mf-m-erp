# Auditoria geral do ERP — 27/10/2026 (REV)

Três frentes: velocidade (site e banco), mortos e repetidos. Banco só lido. Números medidos no build de 27/10
(`npx vite build`) e no `pg_stat_statements` / advisors de desempenho do Supabase.

## Consertado neste pedido (pequeno, seguro, sem dono)

| O quê | Antes | Depois |
|---|---|---|
| Pacote que todos baixam ao entrar (`index-….js`): o alerta das obrigações (contador), o alerta das contas do mês (só a master) e a janela "Perguntar à IA" saíram dele e carregam só para quem usa (`lazy` em `src/components/Layout.tsx`; `parecePergunta` foi para `src/lib/pergunta.ts`) | 918 KB (gzip 275 KB) | 827 KB (gzip 247 KB), −10% |
| Pacote do Sobre: o histórico do git era copiado 3 vezes (Sobre, Código e Telas escreviam `__ERP_HISTORICO__` cada um). Agora um lugar só: `src/lib/historicoGit.ts` | 424 KB | 411 KB |

## Achados

| # | O quê | Onde | Peso | Conserto | Chat dono |
|---|---|---|---|---|---|
| 1 | Auditoria financeira baixa ~6,2 mil linhas inteiras do histórico (~3,5 MB) + o extrato inteiro (~6,4 mil linhas, ~1,5 MB) + contas a pagar inteiras toda vez que abre | `src/pages/Auditoria.tsx:79-86` | alta | Pedir só as colunas que as regras usam (`select`), e o histórico só do período; ou contar as exceções numa função do banco | GER |
| 2 | 346 de 624 listas (`useRows`) baixam todas as colunas (`select *`). Mais pesadas: clientes (73 colunas, ~2,7 MB, em 11 telas), produtos (66 colunas, em 37 telas), fornecedores (14 telas), extrato (7 telas) | ex.: `pages/Pedidos.tsx:655`, `pages/Pdv.tsx:75-76`, `pages/Assistencia.tsx:285`, `components/EmitirNfe.tsx:82-83` | alta | Colocar `select:` com as colunas da tela; começar por clientes e produtos | cada tela: GER, CLI, PRD, FIS |
| 3 | A conferência com a Receita roda a cada minuto e só a pergunta "tem cliente para conferir?" custa ~97 ms (26 mil vezes, ~43 min de banco) | cron `erp-clientes-receita` (`* * * * *`), `clientes_para_receita()` | média | Rodar a cada 5 ou 10 minutos, ou checar com uma consulta mais leve (índice / `limit 1`) | CLI |
| 4 | Monitor do Sobre chama `saude_sistema()` (média 2 s, até 8 s) a cada 60 s enquanto a tela está aberta; `vigiar_sistema()` média 2,6 s, até 23 s | `components/sobre/Monitor.tsx:31-33`, cron `erp-vigiar-sistema` | média | Atualizar a cada 5 min ou guardar o resultado da última vigia | SEG |
| 5 | 3 índices repetidos no banco (o drop já está escrito, falta rodar no SQL Editor) | `supabase/migrations/20261101000081_banco_mais_rapido.sql:29-31` (parte 2) | média | A usuária roda as 3 linhas `drop index` no SQL Editor | REV (precisa de você) |
| 6 | Regras de acesso da carteira pessoal reconferem `auth.uid()` em cada linha (9 regras) | `pessoal_mensais`, `pessoal_mensais_pagos`, `pessoal_controle` | baixa | Trocar por `(select auth.uid())`, como na migração "banco mais rápido" | CAR |
| 7 | 11 chaves estrangeiras sem índice (tabelas pequenas hoje) | `certidoes`, `frete_consultas` (3), `frete_tabelas`, `ml_historico`, `pessoal_*` (5) | baixa | Criar os índices quando as tabelas crescerem | TRA, FIS, MKT, CAR |
| 8 | 76 casos de duas regras de acesso para a mesma ação (51 tabelas): cada consulta confere as duas | advisor `multiple_permissive_policies` | baixa | Juntar as regras numa só por ação | SEG |
| 9 | Tabela temporária sem nenhum uso (857 linhas, sem migração, sem função, sem tela) | `public.tmp_oc_plano_2310` | baixa | Apagar — **só com a confirmação da usuária** | GER (plano de OC de 23/10) |
| 10 | Componente morto: o quadro (kanban) das contas a pagar ficou sem uso desde a tela nova de 26/10 | `src/components/financeiro/KanbanPagar.tsx` (154 linhas) | baixa | Apagar — **só com a confirmação da usuária** | GER |
| 11 | Funções exportadas que ninguém chama (nem no próprio arquivo) | `nfe/FiltrosNotas.tsx` (BotaoFiltros, PainelFiltros), `lib/notas.ts` (IconeTeste, IconeDevolucao), `lib/metas.ts` (aplicarAumento), `lib/midia.ts` (embedVideo), `lib/notify.ts` (notifyDesfazer), `lib/pessoal.ts` (resumoMes), `lib/serieMaquina.ts` (lerSerieMF), `lib/useMercadoLivre.ts` (ligarAnuncio), `lib/variacoes.ts` (nomeComVariacao), `lib/marketplace.ts` (separarCompatibilidade), `lib/notasMyFrost.ts` (atendimentosMyFrost), `lib/fichaGrupos.ts` (grupoInfo), `lib/etiquetaDados.ts` (CAMPOS_GRUPO), `lib/acessos.ts` (comoSaiu), `lib/programacao.ts` (motivoNaoPagar, COLUNAS_PAGAR, colunaPagar; VISOES_PAGAR só no teste) | baixa | Apagar — **só com a confirmação da usuária** (alguns têm teste) | cada chat do arquivo |
| 12 | Duas rotas para a mesma tela: "Produtos e estoque" (`/estoque`) e "Peças à venda" (`/produtos/pecas`) abrem o mesmo `Produtos cadastroFixo="pecas"` | `src/App.tsx` (rotas `estoque` e `produtos/pecas`), `src/lib/menu.ts` | média | Decidir: `/estoque` mostra todos (ou o estoque), ou `/produtos/pecas` vira atalho para `/estoque` | PRD / GER |
| 13 | "Produção" fica na área Assistência; a área "Fábrica e estoque" não tem o item Produção (só o painel) | `src/lib/menu.ts` (grupos `posvenda` e `producao`) | baixa | Confirmar com a usuária se é de propósito; senão mudar o item de área | GER |
| 14 | Arredondar centavos foi copiado 46 vezes (`r2`) em dois jeitos diferentes: com e sem `Number.EPSILON` (1,005 dá 1,00 num e 1,01 no outro) | ex.: `components/Cotacoes.tsx`, `components/nfe/NotaDetalhe.tsx`, `lib/*.ts` | média | Uma função `centavos()` em `src/lib/format.ts`, usada em todas | GER (cada chat troca nos seus arquivos) |
| 15 | Funções pequenas copiadas em muitos arquivos: `semAcento` (30), `diasEntre` (13), `brl` local (10, já existe em `lib/format.ts`), `rotuloMes` (8), `mesCurto` (5) | vários | baixa | Usar a de `lib/format.ts` (criar `semAcento` e `diasEntre` lá) | cada chat do arquivo |
| 16 | Tela "Carregando…" escrita à mão no `App.tsx`, fora da peça `Carregando` de `ui.tsx` | `src/App.tsx` (`const Carregando`) | baixa | Usar a peça pronta | DSG |
| 17 | Realtime (tempo real) lê o log do banco 2 milhões de vezes (~7 ms cada); é só a tabela `notificacoes` | Supabase Realtime | baixa | Normal com o tempo real ligado; não mexer agora | — |

## Conferido e sem problema
- Links internos: 107 endereços usados em `to=`, `navigate(`, `href=` batem com uma rota (inclusive `/configuracoes/<seção>`).
- Todas as telas de `src/pages/` têm entrada (rota no `App.tsx` ou aba dentro de outra tela).
- As 47 Edge Functions são chamadas por alguma tela, função ou cron.
- Tabelas que pareciam sem uso no código (`aprovacao_tentativas`, `nfe_oc_baixas`, `nfe_recebida_itens_lidos`,
  `operacoes_aplicadas`, `portal_convites`, `produto_skus`, `seguranca_vigia_base`) são usadas por funções do banco.
- `src/lib/demo-vazio.ts` parece sem uso, mas entra pelo `vite.config.ts` (troca o `demo.ts` fora da demonstração).
- Auditoria do menu (`auditoriaMenu.ts`): sem rota nem nome repetido; só avisos de permissão emprestada.
- Bibliotecas pesadas (xlsx, jspdf, pdf, html2canvas, assinatura XML) já carregam sob demanda.
