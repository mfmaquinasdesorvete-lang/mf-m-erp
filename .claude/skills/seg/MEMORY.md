# MEMORY — SEG (ERP Line – Segurança)
Atualizado em 27/10/2026.

## Estado agora
A auditoria de segurança está em Sobre → Segurança, com 33 itens em 7 áreas, e o vigia confere o banco todo dia.
Os achados de prioridade alta foram corrigidos e estão no ar. O que ainda falta está na tabela
`seguranca_auditoria` (situação "atenção"), sem detalhes aqui de propósito.

## No ar
- Aba Sobre → Segurança (só administrador), em painel escuro com filtros por área e situação (`seguranca_auditoria`).
- Vigia de segurança todo dia às 12h41 UTC (`vigiar_seguranca`, cron `erp-vigiar-seguranca`): avisa o administrador
  no sino; "Conferir agora" e "Aceitar" ficam na aba.
- Regras de acesso: as contas da Loja (cadastro aberto) não alcançam dados do ERP; o visitante sem login não executa
  funções internas; search_path fixo nas funções com poder total.
- Histórico por papel: o financeiro e o contador não veem mudanças de usuários; o contador não vê funcionários.
- Login com o rosto (WebAuthn) para administrador e financeiro. O código está pronto, mas a obrigação só começa
  depois da data marcada em `configuracoes.rosto_obrigatorio_em`. O outro administrador apaga o rosto em Usuários.
- Derrubar sessões (Usuários): de uma pessoa ou de todos. O banco confere se a sessão ainda existe (`sessao_viva`
  dentro de is_erp_user, tem_papel, is_erp_admin, is_erp_master e e_contador). Migração 20261101000120.
- IAs: a de voz busca com o login de quem falou, e as três tratam fala, foto, PDF e pergunta como dado (f2db6a5).
- Site com HSTS e Permissions-Policy (`public/.htaccess`). GitHub Actions só lê o repositório.
- Backup: trava de publicação durante a cópia e aviso urgente se o teste de restauração falhar
  (`scripts/backup/`; mudança também na `main`, porque o agendamento roda de lá).
- "Ver como" da conta master (Retaguarda e olho no menu): o ERP com o menu e os botões de um papel ou pessoa; só
  aparência, gravações travadas pelo fetch do Supabase enquanto simula (`src/lib/verComo.ts`, bd917a8).
- Dados cadastrais reais da empresa fora do repositório; a demonstração e os testes usam fictícios (55a64e4).

## Em andamento
- Nada parado no meio.

## Esperando a usuária
- Login com o rosto: um passo de configuração dela e o cadastro do rosto. Depois, marcar a data (+7 dias).
- Pendências de segurança abertas (ver no banco, `seguranca_auditoria`).

## Decisões da usuária
- O rosto vale para administrador e financeiro, como nos bancos. Quem perde o celular pede ao outro administrador.
- O rosto passa a ser obrigatório 7 dias depois da data marcada.
- Certificados digitais: guardados numa pasta só, não compartilhada, sem a senha no nome; os vencidos saíram.
- O histórico do git não é reescrito por dados cadastrais que já são públicos (Receita e notas).

## Onde está
- Telas: `src/components/sobre/Seguranca.tsx`, `src/components/Rosto.tsx`, `src/lib/rosto.ts`, `src/lib/sair.ts`
  (sai sozinho quando a sessão é derrubada), `src/pages/Usuarios.tsx` (Apagar o rosto, Derrubar sessões).
- Banco: `seguranca_auditoria`, `seguranca_vigia`, `seguranca_vigia_base`, `vigiar_seguranca`, `seguranca_aceitar`,
  `rosto_ok`, `rosto_vigente`, `meu_rosto`, `sessao_viva`, `minha_sessao_viva`, `derrubar_sessoes`.
- Funções do Supabase: `usuarios-admin` (acao apagar_rosto), `ia-voz`, `ia-busca`, `ia-produto`.
- Teste que vigia as funções com poder total: `src/lib/__tests__/bancoSeguranca.test.ts` (listas PUBLICAS e
  AJUDANTES; função nova sem conferência de papel faz o teste falhar).

## Próximos passos
1. Quando a usuária terminar o passo do rosto: marcar `rosto_obrigatorio_em` para 7 dias depois e avisar a equipe.
2. Trabalhar as pendências "atenção" da aba Segurança, uma por vez, com o "Pode publicar".
3. Ideia oferecida: o teste de restauração do backup comparar também o conteúdo e os arquivos.
