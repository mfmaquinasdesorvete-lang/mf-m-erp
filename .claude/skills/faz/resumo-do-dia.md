# Resumo da manhã — 29/10/2026 (FAZ)
O mais importante primeiro. A lista completa com o passo a passo está em `lista.md`.

## 1. Fiscal (do FIS, mais novo primeiro)
1. **Guias de 09/2026 com códigos do Lucro Presumido:** a MF é do Lucro Real. Pedir ao contador que refaça as guias
   federais de 09/2026 (IRPJ e CSLL por estimativa; PIS e COFINS não cumulativos) antes de pagar.
2. **Filial SP: inutilizar os números 4 a 398 da série 1 até 10/11** (Notas fiscais → Inutilizar numeração) e pedir à
   contabilidade os XML das notas 1 a 3.
3. **Pedidos entregues sem nota:** emitir a NF-e pelo pedido (Vendas → pedido → Emitir NF-e).
4. Também: notas com valor menor que a venda (contador), parcelamento do Simples antigo (e-CAC) e certidões vencidas.

## 2. Dossiê MF SC — tarefa de hoje (ainda a de ontem)
**T1. Dois cliques no ERP antes de cancelar o Tiny:** Importar → Tiny → "Buscar recebimentos do Tiny" e "Atualizar
cadastros do Tiny". A última importação do Tiny no banco é de 16/10.

## 3. Painéis (só você)
- **Escolher como os chats gravam no banco** (item 0): deixar "pedir aprovação" ou marcar "Sempre permitir" só em
  execute_sql e apply_migration (claude.ai → Personalizar → Conectores → Supabase). Hoje as gravações dos chats
  param porque o cartão de Permitir não chega até você.
- **SQL Editor (3 min):** colar `sql/rodar-no-sql-editor.sql` (agora com 7 partes: GER, FUN, ELO, PRD, REV, IAD e
  a unificação das 16 máquinas) e clicar em Run. Conferido hoje: ainda não rodou.
- **GitHub: chave de leitura da Hostinger** (item 0b, 3 min): é o que falta para o repositório virar privado.

## 4. Decisões que os chats esperam
- GER: "Pode publicar" da importação de extrato à prova de erro.
- FIS: onde foi pago o restante do pedido #628.
- 119 pedidos em "precisa de você" (Sobre → Pedidos), os mais antigos de 19 e 20/10.

## 5. Para conferir na tela (3 de hoje, Financeiro)
- b3f768db: Aprovações só com o desta semana.
- b5b051c4: A pagar e Aprovações só com boletos e Pix; compras do cartão numa linha.
- 85de1da1: Contas a pagar e a receber mais claras.
(Os 3 de ontem, da Cobrança, ainda não foram marcados como conferidos.)

## 6. Auditor financeiro
1 achado novo: **InfinitePay SC 10/2026 com taxa efetiva 0%** (11 no total). Veja em Auditoria financeira.
