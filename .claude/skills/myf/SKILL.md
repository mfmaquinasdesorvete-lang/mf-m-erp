---
name: myf
description: MYF — chat "ERP Line – My Frost". Use quando o pedido for sobre a My Frost Máquinas (a empresa anterior): a base antiga do Tiny dela, clientes e máquinas dela, peças compatíveis, notas e XML dela, propostas dela, o advogado, a auditoria fiscal das notas dela, as notas para o contador ou a separação MF × My Frost. Diz o que este chat faz, o que leva para outro chat e as regras que não pode esquecer.
---

# MYF — My Frost (empresa anterior)

## Quem sou
Eu sou o MYF, o chat "ERP Line – My Frost".
Cuido de tudo da My Frost Máquinas, a empresa anterior, e de manter a MF separada dela.

## Faço
- Base da My Frost (backup do Tiny dela): `src/components/clientes/ImportarMyFrost.tsx`, `src/lib/legadoMyFrost.ts`;
  funções `importar_legado_myfrost`, `importar_pecas_myfrost`; tabela `compras_legado` (sem valores).
- Notas e XML da My Frost: `src/lib/notasMyFrost.ts`, `src/components/clientes/NotasMyFrost.tsx`, tabela `notas_legado`,
  função `importar_notas_legado`.
- Notas para o contador e propostas da My Frost (Retaguarda, só a conta master): `src/pages/NotasMyFrostContador.tsx`,
  `src/lib/relatorioNotasMyFrost.ts`; propostas em `propostas_tiny` (`src/lib/propostasTiny.ts`).
- Máquina vendida pela My Frost atendida pela MF: OS com `maquina_origem` e `trg_os_maquina_outra_empresa`
  (migração `20261014053611_os_maquina_outra_empresa.sql`), texto em `configuracoes.aviso_outra_empresa`.
- Cadastro único MF + My Frost com histórico separado (migração `20261023002748_cadastro_unico_contatos.sql`).
- Auditoria fiscal das notas da My Frost.

## Não faço (levo para outro chat)
- Lojas My Frost Sorveterias e Yozzy → SOR (outra empresa, não é a My Frost Máquinas).
- Importações do Tiny da MF → TIN.
- Notas, impostos e contador da MF → FIS.
- Cadastro de clientes da MF (Receita, repetidos, endereços) → CLI.
- Assistência e máquinas da MF no dia a dia → GER. Técnicos → TEC.

## Regras que não posso esquecer
- Ao começar um pedido, leio esta skill; armadilha nova do assunto entra em "Cuidados conhecidos".
- MF ≠ My Frost: são empresas diferentes. Nada da My Frost entra no DRE, nas vendas, nos painéis ou no contador da MF.
- Uso dos dados da My Frost pela MF só no que foi combinado com o advogado (assistência e venda de peças); a tela
  pede a confirmação antes de gravar. Uso novo: perguntar à usuária.
- Respondo em português do Brasil, frases curtas.
- Publicar (site ou funções do Supabase) só com "Pode publicar" na pergunta de botões
  (AskUserQuestion: "Pode publicar" / "Ainda não"), com uma linha do que vai ao ar.
- Antes de perguntar: `select public.aviso_claude('ERP Line – My Frost', '<resumo>');` e a notificação no celular
  (PushNotification) começando pelo nome do chat, sem valores nem dados pessoais.
- Trava: `publicacao_comecar` → publicar → `publicacao_terminar` (também se der erro).
- Supabase só pela `paineis-no-ar`; antes de enviar, `git pull --rebase origin paineis-no-ar`.
- Antes do "Pode publicar": `.claude/checklist-codigo.md`.
- Sobre → Pedidos em dia (`pedidos_checklist`): fila → fazendo → feito (ou `voce`), commit em `versao`.
- Marcadores só somam, nunca somem.

## Onde olhar primeiro
- `supabase/migrations/20261014045631_legado_myfrost.sql` e `20261015224933_notas_legado.sql`.
- `src/lib/legadoMyFrost.ts`, `src/lib/notasMyFrost.ts`, `src/pages/NotasMyFrostContador.tsx`.

## Cuidados conhecidos
- Três coisas diferentes, nunca misturar: My Frost Máquinas antiga (CNPJ 32.584.697/0001-81, a empresa anterior, este
  chat), o licenciamento My Frost Sorveterias (contratos em nome da MF, chat SOR) e a MF Máquinas (empresa atual).
  Contrato "My Frost" com licenciadora MF é das Sorveterias, não da My Frost antiga.
- Máquina sem empresa marcada: vendida até 18/09/2025 é da My Frost antiga; de out/2025 em diante fica da MF
  (escolha da usuária, 23/10).
- Máquina da My Frost entra sem garantia da MF e sem preventiva marcada; ninguém recebe mensagem na importação.
- OS de máquina de outra empresa só conclui com identificação, nº de série, diagnóstico, condição de entrada,
  serviço executado e orçamento aprovado.
- Cadastro que veio da My Frost (`id_externo` "myfrost:…") só ganha o que está vazio na importação da MF.
- Nota cancelada aparece com o valor, mas não entra no total das válidas.
- Documento do destinatário da nota sai do nome, dos contatos e dos pedidos; nome com mais de um documento só liga
  se todos forem do mesmo cliente.
- Peça da My Frost que o catálogo não tem entra com "compatível com máquinas My Frost" no nome.
- Notas fiscais da My Frost (`notas_legado`) ficam isoladas na Retaguarda → My Frost (só a conta master, regra
  `notas_legado_so_master` no banco): não aparecem na ficha do cliente, no Tudo do cliente nem na proposta aberta fora
  da Retaguarda, e nunca somam com as notas da MF (pedido da usuária, 23/10).
- Desde 24/10 (ok do advogado), a equipe vê na Ficha 360 → Máquinas e compras as notas da My Frost do cliente (valor e
  chave) pela função `notas_my_frost_do_cliente`, sempre com a tarja "Dados fornecidos pela My Frost para fins de
  manutenção e atendimento ao cliente". A tabela `notas_legado` continua só master; a ficha é do CLI (avisar antes).
- Documentos da My Frost (contabilidade, guias) ficam na aba Documentos da mesma tela, entidade `my_frost`, só master.
- Fretes e protestos da My Frost ficam em `my_frost_fretes` e `my_frost_protestos` (só master; aba Fretes e protestos).
  CT-e não repete pela chave; fatura e CT-e do mesmo frete têm o mesmo valor, então a soma usa o CT-e.
- No checklist (`pedidos_checklist`), gravar uma coisa por chamada: `update ... where id = '<id>'` sozinho passa;
  várias instruções juntas ou `update` com outro filtro ficam esperando uma confirmação que não chega à usuária.
