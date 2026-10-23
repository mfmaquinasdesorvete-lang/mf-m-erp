# Como dar acesso a alguém novo

> Documento gerado a partir do código do ERP com o comando `npx tsx scripts/gerar-docs.mjs`. Não edite à mão: mude o texto
> na fonte (src/lib/permissoes.ts, o processo "acesso" de src/lib/esquemas.ts e a tela Usuários de src/lib/modulosDetalhe.ts) e gere de novo.

**Atualizado em:** 23/10/2026.

Como uma pessoa nova da equipe ganha acesso só ao que precisa. Este documento mostra quem cria o acesso, qual perfil escolher, como é o primeiro acesso e o que fazer quando a pessoa esquece a senha ou sai da empresa.

## Índice

- [Quem dá o acesso](#quem-dá-o-acesso)
- [Passo a passo](#passo-a-passo)
- [Qual perfil escolher](#qual-perfil-escolher)
- [Mais de um perfil](#mais-de-um-perfil)
- [O primeiro acesso](#o-primeiro-acesso)
- [Ajustar o que a pessoa vê](#ajustar-o-que-a-pessoa-vê)
- [Representante externo](#representante-externo)
- [Senha esquecida, saída e controle](#senha-esquecida-saída-e-controle)

## Quem dá o acesso

Tudo é feito na tela [Usuários e permissões](modulos.md#usuários-e-permissões).

- **Quem pode abrir:** Só a conta master
- **Onde fica:** Engrenagem no fim do menu → Configurações; também pela busca do menu

## Passo a passo

1. **Criar o usuário** (nome e e-mail) — Diretoria · tela Usuários e permissões
2. **Escolher o perfil** (vendas, financeiro…) — Diretoria · tela Usuários e permissões
3. **1º acesso** (troca a senha) — Todos
4. **Duas etapas** (admin e financeiro) — Todos
5. **Vê só o que é seu** (menu do perfil) — O ERP sozinho

Na tela, cada passo é assim:

- **Novo usuário:** nome, e-mail, função, telefone, papel principal, papéis adicionais e unidade em que trabalha.
- **Com esse acesso, vê:** ao escolher o papel, o ERP mostra na hora as telas que a pessoa vai abrir.
- **Senha provisória:** gerada pelo ERP e trocada pela pessoa no primeiro acesso; os dados saem prontos para copiar ou mandar pelo WhatsApp.
- **Ligações:** à ficha de funcionário (documentos, banco e Pix) e ao cadastro de vendedor (comissões).

## Qual perfil escolher

Escolha o perfil pela função da pessoa. Quanto menos telas, mais simples fica o ERP para ela. Toque no perfil para ver as telas e os processos dele no [Guia rápido por perfil](guia-por-perfil.md).

- **[Administrador](guia-por-perfil.md#administrador):** Acesso total, usuários e configurações. _(todas as telas; faz tudo)_
- **[Vendas](guia-por-perfil.md#vendas):** Pedidos, PDV, clientes, cobranças e NF-e das vendas. _(45 telas; 8 tipos de ação)_
- **[Financeiro](guia-por-perfil.md#financeiro):** Contas a pagar/receber, notas fiscais, estoque, compras e fornecedores. _(58 telas; 15 tipos de ação)_
- **[Técnico](guia-por-perfil.md#técnico):** Assistência técnica, garantias, produção e compras de peças. _(23 telas; 5 tipos de ação)_
- **[Contador](guia-por-perfil.md#contador):** Só consulta: notas fiscais, financeiro e o fechamento mensal (XML e planilhas). _(15 telas; só consulta)_
- **[Expedição](guia-por-perfil.md#expedição):** Separar, conferir, embalar e despachar os pedidos; etiquetas e DANFE. _(4 telas; 1 tipo de ação)_
- **[Marketplaces](guia-por-perfil.md#marketplaces):** Ajusta os cadastros dos produtos para os anúncios: título, descrição, fotos, EAN, categorias e medidas (sem preço, custo nem estoque). _(11 telas; 1 tipo de ação)_
- **[Compras](guia-por-perfil.md#compras):** Ordens de compra, cotações, necessidades, notas de fornecedor (custo, preço para aprovação, vínculo com a OC), fornecedores e estoque. _(15 telas; 4 tipos de ação)_
- **[Só o giga](guia-por-perfil.md#só-o-giga):** Só a tela do Teste do giga (REG-006): lança e anula os testes das máquinas, sem ver o resto do ERP. _(1 tela; 1 tipo de ação)_

**Administrador** é para quem cuida da empresa: vê e faz tudo. Mesmo assim, Usuários e as Configurações da empresa abrem só para a conta master.

## Mais de um perfil

Quem faz mais de uma função ganha perfis adicionais: Vendas, Financeiro, Técnico, Expedição, Marketplaces e Compras. A pessoa vê as telas e faz as ações de todos os seus perfis juntos.

Administrador, Contador, Só o giga e Representante (portal) só podem ser o perfil principal: não se somam com outros.

## O primeiro acesso

- **1º acesso** (troca a senha)
- **Duas etapas** (admin e financeiro)
- **Senha provisória:** gerada pelo ERP e trocada pela pessoa no primeiro acesso; os dados saem prontos para copiar ou mandar pelo WhatsApp.

Depois disso a pessoa entra e o menu mostra só as telas do perfil dela.

## Ajustar o que a pessoa vê

- **Perfis, o que aparece no menu:** o administrador mostra ou esconde cada tela, ou a área inteira, para cada perfil.
- **O que pode criar ou alterar:** tabela com as ações permitidas a cada papel (emitir NF-e, contas a pagar, estoque…).
- **Papéis:** administrador, vendas, financeiro, técnico, contador, expedição, marketplaces, compras e representante externo.

## Representante externo

- **Representante externo:** convite para o portal, onde ele vê só os próprios pedidos, clientes e comissões.
- **O que ele vê:** O representante entra com o login dele e vê só os próprios pedidos, orçamentos, carteira de clientes e comissões.
- **Onde criar o login dele:** Comissões → Vendedores e representantes → botão Portal no representante (cria o login dele; só ele entra no portal, o seu login abre o ERP)

## Senha esquecida, saída e controle

- **Nova senha:** o administrador define outra senha provisória quando alguém esquece a sua.
- **Bloquear acesso:** desmarcar "acesso liberado" impede a entrada e guarda o histórico.
- **Proteções:** ninguém tira o próprio acesso de administrador e sempre fica ao menos um administrador ativo.
- **Avisos da lista:** quem está com senha provisória, quem ainda não entrou e o alerta quando só há um administrador ativo.
- **Registro dos acessos:** data e hora de entrada, até quando ficou, aparelho, navegador e endereço de internet, por pessoa e período.
- **Histórico:** o cadastro de cada usuário mostra as alterações feitas nele.
