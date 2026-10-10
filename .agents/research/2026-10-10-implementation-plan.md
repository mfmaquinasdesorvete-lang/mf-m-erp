# Plano de implementação: backup diário do ERP na Hostinger

**Data:** 10/10/2026 · **Pedido:** "Na Hostinger quero que tenha backups diários de tudo"

## Modo
| Item | Valor |
|------|-------|
| Modo | Standalone (sem relatório de auditoria nem handoff) |
| Relatório | nenhum |
| Escolhas (perguntas recusadas, valores padrão) | Trabalho: nova funcionalidade · Risco: equilibrado · Prazo: urgente (dias) · Escopo: backup diário |

## Convenções do projeto (detectadas)
| Convenção | Detectado | Evidência |
|-----------|-----------|-----------|
| Plataforma | React + Vite + TypeScript (web, celular pelo navegador) | `src/`, `vite.config.ts` |
| Dados | Supabase (Postgres 17, Storage, Edge Functions Deno) | `supabase/migrations`, `supabase/functions` |
| Migrações | Só acrescentam; DO blocks conferindo `pg_policies`/`pg_constraint`; `create or replace` | migrações 0001–0027 |
| Agendamento | pg_cron em `supabase/agendamento.sql` | `cron.schedule('erp-…')` |
| Avisos | `notificar(tipo, título, texto, link, papéis)` + toasts `notify()` | `notificacoes`, `src/lib/notify.ts` |
| Publicação | site → ramo `site` → Hostinger; funções → Supabase | `deploy-supabase.yml`, MCP Hostinger |
| Testes | pglite (SQL), Deno (funções puras), Playwright (telas) | scratchpad `pgtest/`, `denotest/`, `pw/` |

## Análise do código
| Arquivo / módulo | Relevância | Observação |
|------------------|-----------|------------|
| `.github/workflows/deploy-supabase.yml` | Alta | `SUPABASE_ACCESS_TOKEN` funciona; `SUPABASE_DB_PASSWORD` está errada (migrações falham) |
| `supabase/functions/_shared/supabase.ts` | Média | `adminClient()` para a função de download |
| `supabase/agendamento.sql` | Média | onde entra a conferência diária |
| `src/pages/Configuracoes.tsx` | Média | onde entra o quadro "Backups" |
| Hostinger (API) | Alta | sem FTP nem gravação fora do `public_html`; **tem cron da conta** (grava em `/home/u735419389`) |

| Depende de | Tipo |
|------------|------|
| Secret `SUPABASE_ACCESS_TOKEN` (já existe) | Obrigatório |
| Secret `BACKUP_CHAVE` (novo, criado pelo usuário) | Obrigatório |
| Cron da conta Hostinger | Obrigatório |

## O que é
| Aspecto | Detalhe |
|---------|---------|
| O quê | Todo dia: banco inteiro (papéis, estrutura, dados, inclusive usuários do login) + todos os arquivos do Storage → testado (restaurado num Supabase de teste) → criptografado (GPG AES-256) → guardado no Supabase (7 dias) → baixado pela Hostinger para pasta privada (30 dias + 1 por mês por 12 meses) |
| Por quê | Hoje os dados do ERP só existem no Supabase; uma cópia fora, criptografada e testada cobre os itens do checklist (cópia fora, criptografia, chaves separadas, testar restauração, verificar último backup) |
| Fora do escopo | Site e e-mails (já estão na Hostinger, com o backup próprio dela); restauração automática |

| # | Como… | Quero… | Para… |
|---|-------|--------|-------|
| 1 | dono da MF | uma cópia diária de tudo na Hostinger | não depender só do Supabase |
| 2 | financeiro | ver no ERP o último backup e se a Hostinger recebeu | saber que está em dia |
| 3 | técnico | instruções e arquivos padrão (pg_dump/psql/gpg) | restaurar em qualquer Postgres/Supabase |

| # | Critério de aceite | Como verificar |
|---|--------------------|----------------|
| 1 | Backup diário gerado e testado | Execução do GitHub "Backup diário" verde; linha `ok` em `backups_registro` com `restauracao_ok = true` |
| 2 | Cópia na Hostinger | arquivo `erp-AAAA-MM-DD.tar.gz.gpg` em `/home/u735419389/backups-erp`; `hostinger_em` preenchido |
| 3 | Criptografado e abre com a chave | teste local: gpg com a frase abre, frase errada não |
| 4 | Retenção | Supabase 7 dias; Hostinger 30 dias + dia 01 de cada mês por 400 dias |
| 5 | Aviso quando falhar ou atrasar | `notificacoes` "Backup diário falhou/atrasado" ou "Cópia não chegou na Hostinger" |
| 6 | Nada sensível nos logs públicos | log só com totais; chave mascarada |

## Tamanho (T-shirt)
| Tarefa | Tamanho | Arquivos |
|--------|---------|----------|
| Banco: bucket, registro, conferência, avisos | M (3) | migração 0028, `agendamento.sql`, teste pglite |
| Geração + teste de restauração | M (5) | `gerar.sh`, `arquivos.mjs`, `comum.mjs`, `testar.sh`, `conferir.mjs` |
| Criptografia + guarda + workflow | M (4) | `guardar.sh`, `registrar.mjs`, `backup-diario.yml`, `LEIA.txt` |
| Download para a Hostinger | M (3) | função `backup-baixar`, `config.toml`, `deploy-supabase.yml` + cron Hostinger |
| Quadro "Backups" no ERP | M (3) | componente novo, `Configuracoes.tsx`, demo |

## Impacto
| Área | Arquivos | Risco | Notas |
|------|----------|-------|-------|
| Banco | migração 0028 | Baixo | só acrescenta; RLS: financeiro/admin leem, gravação só pelo serviço |
| Funções | `backup-baixar` | Médio | pública com token (hash no banco); entrega só o arquivo criptografado |
| CI | `backup-diario.yml` + scripts | Médio | repositório público: logs sem dados |
| Hostinger | cron da conta | Baixo | grava fora do `public_html` |
| Telas | Configurações | Baixo | só leitura |

## Plano
| Fase | # | Tarefa | Tam. | Arquivos | Urgência | Risco | ROI | Alcance | LOE | Depende |
|------|---|--------|------|----------|----------|-------|-----|---------|-----|---------|
| A: Base | 1 | Validar localmente (criptografia, partes, restauração, contagens) e salvar no Git | M | scripts/backup/* | Alta | Baixo | Alto | só backup | 0,5h | – |
| A: Base | 2 | Aplicar migração 0028 + conferência diária no pg_cron | M | 0028, agendamento.sql | Alta | Baixo | Alto | tabelas novas | 0,5h | 1 |
| B: Núcleo | 3 | Publicar `backup-baixar` e gravar o hash do código de download | M | função, config.toml | Alta | Médio | Alto | função nova | 0,5h | 2 |
| B: Núcleo | 4 | Rodar o workflow em modo **teste** no GitHub (dump sem senha, arquivos, restauração) e corrigir o que aparecer | M | workflow, scripts | Alta | Médio | Alto | CI | 1–2h | 1 |
| B: Núcleo | 5 | **Usuário:** criar o secret `BACKUP_CHAVE` e guardar a frase fora do GitHub | S | – | Alta | Baixo | Alto | – | 5 min | – |
| B: Núcleo | 6 | Rodar em modo **completo**; conferir partes no bucket e linha `ok` | S | – | Alta | Baixo | Alto | – | 0,5h | 4, 5 |
| C: Hostinger | 7 | Criar cron na Hostinger (baixa + retenção) e conferir a saída | S | cron | Alta | Baixo | Alto | conta Hostinger | 0,5h | 3, 6 |
| D: ERP | 8 | Quadro "Backups" em Configurações (último backup, Hostinger, teste de restauração) + demo | M | componente, Configuracoes.tsx, demo.ts | Média | Baixo | Médio | Configurações | 1,5h | 2 |
| D: ERP | 9 | Publicar o site | S | ramo site | Média | Baixo | Médio | site | 0,3h | 8 |

## Riscos
| Risco | Prob. | Impacto | Mitigação | Fase |
|-------|-------|---------|-----------|------|
| CLI não consegue acesso temporário sem a senha do banco | Média | Alto | modo teste primeiro; plano B: usuário corrige `SUPABASE_DB_PASSWORD` (também conserta "Publicar Supabase") | B |
| Teste de restauração falha por diferença do Supabase local | Média | Médio | não bloqueia a guarda: backup é guardado e o ERP avisa "teste falhou" | B |
| Frase `BACKUP_CHAVE` perdida → backup inútil | Baixa | Alto | instruções para guardar cópia fora; aviso no quadro | B |
| Log público vaza dado | Baixa | Alto | scripts só imprimem totais; chave mascarada; nada de `set -x` | A/B |
| Código de download vaza | Baixa | Baixo | só entrega arquivo criptografado; pode ser trocado (novo hash + novo cron) | B/C |
| Backup cresce acima de 50 MB por envio | Média | Médio | partes de 45 MB juntadas na função | A |
| Banco restaurado no teste chamar produção | Baixa | Médio | dados de `cron`/`net` não são restaurados; gatilhos desligados na carga | A |

## Testes
| Tipo | O quê | Prioridade | Fase |
|------|-------|------------|------|
| Unidade (pglite) | migração 0028: bucket privado, avisos, permissões | Alta | A |
| Integração local (Postgres 16) | dump → filtro cron/net → restauração → contagens; divergência detectada | Alta | A |
| Integração local | gpg: abre com a frase, não abre com outra; partes juntas = original | Alta | A |
| Integração (GitHub) | modo teste com o projeto real | Alta | B |
| Ponta a ponta | download pela Hostinger e `hostinger_em` | Alta | C |
| Tela (Playwright, demo) | quadro Backups | Média | D |

## Reversão
| Fase | Cenário | Ação |
|------|---------|------|
| A | migração com problema | tabelas novas e isoladas: desligar a conferência no pg_cron; nada mais depende delas |
| B | workflow falhando todo dia | desativar o workflow em Actions (Disable workflow) |
| B | função com problema | apagar o hash em `backups_config` (função passa a recusar tudo) |
| C | cron da Hostinger errado | remover o cron pela API/hPanel; arquivos já baixados ficam |
| D | quadro com erro | reverter o commit da tela e publicar o site de novo |
