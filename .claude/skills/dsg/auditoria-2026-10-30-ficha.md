# Auditoria de experiência · Ficha cadastral do cliente · 30/10/2026

Fluxo: o cliente abre o link `/ficha/<código>` (sem login), confere os dados e o contato, confere o endereço, assina
e recebe o comprovante. Tela: `src/pages/FichaPublica.tsx` (dona: CLI, "Cadastro de clientes").

- **Público:** cliente da MF (dono de sorveteria, lanchonete, pessoa física), quase sempre no celular, pelo WhatsApp,
  sem conhecer o ERP.
- **Objetivo:** ficha conferida e assinada em cerca de 1 minuto, sem precisar ligar para a MF.
- **Como foi visto:** leitura do código e o fluxo feito no modo demonstração num celular de 390 px com toque
  (dados → erro de e-mail → CEP inexistente → assinar vazio).
- **Não testado:** o link real, a queda de internet (o modo demonstração não usa a rede; esse item foi tirado do
  código) e a tela de 320 px.

## O que já funciona bem

- Três passos com indicador claro ("Seus dados", "Endereço", "Assinatura"), nome do cliente no "Olá", "Leva 1 minuto".
- Dados vêm preenchidos; o CEP completa a rua, o bairro e a cidade.
- Campos de 16 px (o iPhone não dá zoom), rótulo em cada campo, erro no próprio campo depois de mexer, aviso com
  `role="alert"`.
- Botão "Assinar ficha" trava enquanto grava ("Registrando…").
- Confiança: logo e nome da MF no topo, declaração com LGPD e MP 2.200-2, rodapé "data, hora, IP e código de
  verificação", código de verificação e comprovante em PDF no fim.
- Link vencido ou cancelado: diz o que houve e mostra o botão "Falar com a MF Máquinas".
- Página sempre clara (consertado em 30/10).

## Achados, por prioridade (impacto × esforço)

| # | Achado | Prova | Impacto | Esforço |
|---|---|---|---|---|
| 1 | Instagram, Facebook e TikTok abrem o **teclado de números** e mostram "(00) 00000-0000" como exemplo | Teste: os três campos com teclado numérico e jeito de telefone. No celular a pessoa precisa trocar de teclado para escrever "@" e letras, ou acha que é para pôr um telefone. | Alto: atrapalha todo cliente no celular, no 1º passo | Baixo: escolher o teclado e o exemplo por campo |
| 2 | Falha de internet ao abrir mostra **"Link não encontrado"** | Código: qualquer erro na busca da ficha cai no mesmo aviso de link inválido, sem "Tentar de novo". | Alto: o cliente acha que o link é falso ou está errado e desiste ou liga | Baixo: separar "não achou" de "não carregou", com "Tentar de novo" |
| 3 | No passo da assinatura, **os erros aparecem um de cada vez** | Teste: "Assinar" vazio → "Informe o nome completo"; depois → "Faça a sua assinatura no quadro"; depois → o aceite. São três toques para descobrir o que falta. | Médio: frustra no último passo, o mais importante | Baixo: listar tudo que falta de uma vez e marcar cada campo |
| 4 | **"Algo errado aqui? Fale com a MF"** não tem botão | Teste e código: o texto aparece no 1º passo, mas o botão de WhatsApp só existe no fim e no link vencido. | Médio: quem acha um erro no CNPJ ou no nome fica sem saída | Baixo: o mesmo botão "Falar com a MF Máquinas" ali |
| 5 | **CEP inexistente não avisa** e deixa o endereço antigo | Teste: CEP 99999-999 → nenhuma mensagem; rua, cidade e UF continuam as do CEP anterior, sem combinar com o CEP novo. | Médio: endereço errado na nota e na entrega | Baixo: aviso "CEP não encontrado, confira ou preencha o endereço" |
| 6 | **Não diz o que é obrigatório** | Código e tela: só "um telefone ou WhatsApp" é obrigatório no 1º passo, e no 2º "endereço, cidade e UF", mas nada vem marcado. Os 7 campos do 1º passo parecem todos obrigatórios. | Médio: parece mais trabalho do que é (o 1º passo tem 1.186 px no celular) | Baixo: "(opcional)" no rótulo e as redes sociais juntas num bloco "Redes sociais (opcional)" |
| 7 | **Erro do 1º passo não leva até o campo** | Teste: depois do "Confira: E-mail" o foco fica no botão "Continuar". Com o campo errado lá em cima, o cliente procura e o leitor de tela não chega ao campo. | Médio (acessibilidade) | Baixo: rolar e pôr o foco no 1º campo com erro |
| 8 | **Erro do servidor ao assinar aparece como veio** | Código: mostra o texto do erro do banco. Pode vir técnico ou em inglês. | Baixo a médio: só acontece se der erro, mas é o momento de maior confiança | Baixo: frase padrão em português e "Tentar de novo"; o texto técnico fica só no registro |
| 9 | **Saiu da página, perdeu o que digitou** | Código: os dados ficam só na memória da página. Se o WhatsApp recarregar ou a pessoa sair para ver o CPF, volta tudo ao início. | Baixo a médio | Médio: guardar o rascunho neste aparelho até assinar |
| 10 | **CNPJ da MF não aparece** para o cliente conferir quem pede a assinatura | Tela: no topo só "MF Máquinas" e o logo. | Baixo: confiança, para quem recebe o link por um número novo | Baixo: razão social e CNPJ da MF no rodapé |
| 11 | Topo com degradê de cor solta (`from-[#071528]`) | Código. Regras 3 e 5 do design (sem degradê decorativo, sem cor solta). | Baixo (visual) | Baixo |

## Ordem para consertar

1. **Agora (alto impacto, pouco esforço):** 1, 2, 3, 4, 5.
2. **Em seguida:** 6, 7, 8, 10, 11.
3. **Se fizer sentido depois:** 9 (rascunho).

Depois do conserto, testar com um link de verdade no celular: abrir pelo WhatsApp, errar um campo, usar um CEP
inexistente, assinar e baixar o comprovante.
