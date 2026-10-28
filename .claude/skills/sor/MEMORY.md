# MEMORY — SOR (ERP Line – My Frost Sorveterias e Yozzy)
Atualizado em 28/10/2026.

## Estado agora
A tela das sorveterias está no ar e as lojas estão cadastradas (My Frost e Yozzy).
Neste chat o trabalho até agora foi só nos dados: pagamentos ligados às lojas, endereços e conferências.
Nada de código novo deste chat esperando publicação.

## No ar
- Tela das sorveterias (botão rosa, só a conta master), unidades com contrato, máquinas, custos e pagamentos (#332).
- Marca myfrost/yozzy e sócios por unidade (migração `20261101000066_licenciados_marca_socios.sql`).
- Painel das licenças (só leitura).
- Período das licenças com "Esta semana" e "Este mês"; a tela e o painel abrem em "Esta semana" (27/10).

## Em andamento
- Marcas no INPI (27/10): aba "Marcas no INPI" na tela e seção no painel, com alerta de prazo (60 dias da RPI) e de
  RPI sem conferir há mais de 7 dias. Código pronto; falta criar a tabela `licenciados_marcas` no banco (migração
  20261101000180, a gravação pediu a aprovação dela), cadastrar as 2 marcas e publicar o site com o "Pode publicar".

## Esperando a usuária
- Yozzy Natal: rascunho dos pagamentos que a dona mandou. Falta ela dizer se a linha "Loja 50 mil" é a soma das
  duas de 21/04 e autorizar o lançamento dos pagos fora das contas da MF (Pix para a sócia e para uma empresa ligada).
- Venda por link de 26/05 na Infinite SP: de qual loja é (Americana ou Uberlândia abriram em 30/05).
- 15 lojas sem cliente do ERP ligado: ela precisa dizer qual cliente é cada loja.
- 5 pagamentos de licença sem loja.
- Máquinas pelo PDF (garantia de 2 anos e preventivas) e máquinas das lojas no painel com aviso de preventiva.
- Endereço da Piracicaba 02; CEP de Americana e Campinas.
- Freezers dos quiosques: 4 freezers verticais numa nota do fornecedor de refrigeração (abr/2026), sem marcador. Ela diz
  se entram no custo dos quiosques (lançar como custo da loja, sem pôr o marcador na nota).
- Plano fiscal das sorveterias (#332, veio do FIS): ainda não começou.

## Decisões da usuária
- Yozzy Natal = Yozzi Ponta Negra = a dona da loja: a mesma loja.
- A nota das máquinas da Yozzy Natal é comodato (não é venda); tudo o que ela pagou é licença.
- As vendas no cartão de junho na Infinite SP são licença da Yozzy Natal.
- A nota de peças e cobre de jan/2026 paga pela Yozzy Natal é custo de montar da loja (total da loja), lançada em 28/10.
- Os repasses da loja de Paulínia que caíram na conta do filho dela (quando a loja era dela) não se ligam à loja.
- Funcionários das lojas My Frost e Yozzy ficam com o SOR; os da MF com o FUN (23/10).
- Toda tela com filtro de período abre em "Esta semana"; ela troca na hora (27/10).

## Onde está
- Telas: `src/pages/Licenciados.tsx`, `src/components/licenciados/Unidades.tsx`, `src/pages/paineis/PainelLicencas.tsx`.
- Regras: `src/lib/licenciados.ts`.
- Banco: `licenciados_lojas`, `licenciados_pagamentos`, `licenciados_maquinas`, `licenciados_custos`, `licenciados_arquivos`.
- Fontes de dados: o Drive da conta das sorveterias (planilha "Unidades", contratos, extratos da Stone da loja de
  Paulínia em PDF e OFX) e as entradas dos extratos da MF marcadas como "por conta de terceiros".

## Próximos passos
1. Quando ela responder, lançar o rascunho da Yozzy Natal (com o ok dela) e avisar o ENT dos ids ligados.
2. Ligar as lojas aos clientes e os pagamentos sem loja, com a confirmação dela.
3. Máquinas das lojas com garantia e preventiva.
4. Plano fiscal das sorveterias com a habilidade analista-fiscal.
