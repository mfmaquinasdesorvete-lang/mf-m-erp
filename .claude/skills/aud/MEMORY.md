# MEMORY — AUD (ERP Line – Auditor financeiro)
Atualizado em 27/10/2026.

## Estado agora
Chat criado em 27/10 pelo ELO, a pedido da usuária. Começa pela fase 1 (diagnóstico) com os dados da MF.

## No ar
- Nada deste chat ainda. Já existe a Auditoria financeira (`src/lib/auditoria.ts`) e o Perguntar à IA (`ia-busca`).

## Em andamento
- Fase 1: diagnóstico das fontes (vendas, recebimentos, contas, extratos, taxas de cartão) e do que falta.

## Esperando a usuária
- Nada.

## Decisões da usuária
- 27/10: começar pela MF, onde os dados já estão; as sorveterias entram depois, com o SOR.
- 27/10: o auditor é um chat próprio (AUD), só leitura.
- Fases: 1 diagnóstico; 2 chat de leitura; 3 conferências e provas; 4 margens, tendências e projeções
  (marcadas como estimativa); 5 alertas periódicos e fila de revisão (sem aviso externo sem autorização).

## Onde está
- Telas: `src/pages/Auditoria.tsx`, `src/pages/Conciliacao.tsx`.
- Regras: `src/lib/auditoria.ts`.
- Funções do Supabase: `ia-busca` (modelo do chat).

## Próximos passos
1. Mapear tabelas, fontes, permissões e as conferências que já existem; mostrar à usuária o que há e o que falta.
2. Desenhar as conferências novas da fase 1 e o formato fixo das respostas.
3. Chat de leitura em cima delas, no padrão do `ia-busca`.
