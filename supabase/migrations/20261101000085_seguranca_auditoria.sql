-- Sobre → Segurança (pedido de 22/10): a lista do que precisa ser auditado na segurança do ERP Line — banco, login,
-- funções, site, código e integrações —, com a situação de cada item (a verificar, verificando, ok, atenção, risco),
-- o resultado da última verificação e quando conferir de novo. Só o administrador lê e grava: o resultado pode
-- descrever uma falha, por isso fica só no banco e nunca no código (o repositório é público).
create table if not exists public.seguranca_auditoria (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  item text not null,
  como_verificar text,
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  situacao text not null default 'a_verificar'
    check (situacao in ('a_verificar', 'verificando', 'ok', 'atencao', 'risco', 'nao_se_aplica')),
  resultado text,
  pedido text,
  verificado_em timestamptz,
  verificado_por uuid,
  rever_em date,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists seguranca_auditoria_item on public.seguranca_auditoria (area, item);

create or replace function public.seguranca_auditoria_atualizada() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'seguranca_auditoria_atualizada') then
    create trigger seguranca_auditoria_atualizada before update on public.seguranca_auditoria
      for each row execute function public.seguranca_auditoria_atualizada();
  end if;
end $$;

alter table public.seguranca_auditoria enable row level security;
revoke all on public.seguranca_auditoria from anon;
grant select, insert, update on public.seguranca_auditoria to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'seguranca_auditoria' and policyname = 'seguranca_auditoria_admin') then
    create policy seguranca_auditoria_admin on public.seguranca_auditoria for all to authenticated
      using (public.tem_papel('admin')) with check (public.tem_papel('admin'));
  end if;
end $$;

-- os itens a auditar (só o que verificar; o resultado de cada um é gravado depois, no banco)
insert into public.seguranca_auditoria (ordem, area, item, como_verificar, prioridade, pedido) values
  (1, 'Banco de dados', 'Avisos de segurança do Supabase', 'Ler os avisos de segurança do painel (advisors) e tratar cada um.', 'alta', null),
  (2, 'Banco de dados', 'Regras de acesso (RLS) ligadas em todas as tabelas', 'Nenhuma tabela do esquema public sem RLS; tabela sem regra fica fechada.', 'alta', null),
  (3, 'Banco de dados', 'Nada aberto para quem não fez login', 'Conferir o que o visitante sem login (anon) consegue ler, gravar ou chamar; só as páginas por link.', 'alta', null),
  (4, 'Banco de dados', 'Matriz de permissões por papel', 'Para cada papel (vendas, financeiro, técnico, contador...) conferir o que lê e grava em cada tabela, com teste só de leitura.', 'alta', '#284'),
  (5, 'Banco de dados', 'Funções com poder total protegidas', 'Funções security definer com search_path fixo, conferindo o papel de quem chama e sem acesso para o visitante.', 'alta', null),
  (6, 'Banco de dados', 'Senha do e-mail guardada no cofre (Vault)', 'A senha da caixa de e-mail fica cifrada no Vault, nunca em coluna comum.', 'alta', '#284'),
  (7, 'Banco de dados', 'Chaves estrangeiras, permissões e registros órfãos', 'Ligações entre tabelas, grants sobrando e registros sem dono.', 'media', '#284'),
  (8, 'Banco de dados', 'Arquivos guardados (Storage) privados', 'Pastas com documentos, notas e fotos só abrem para quem pode, com links que vencem.', 'alta', null),
  (9, 'Banco de dados', 'Backup diário e teste de restauração', 'O backup roda todo dia, fica fora do Supabase e já foi restaurado num teste.', 'media', null),
  (10, 'Login e acesso', 'Login em duas etapas (TOTP) para admin e financeiro', 'Código do aplicativo autenticador exigido no login e conferido no banco.', 'alta', '#103'),
  (11, 'Login e acesso', 'Quem tem acesso ao ERP', 'Usuários ativos, papéis certos e ninguém que saiu da empresa com acesso.', 'alta', null),
  (12, 'Login e acesso', 'Regras de senha e senhas vazadas', 'Tamanho mínimo, bloqueio de senha vazada e limite de tentativas no login.', 'media', null),
  (13, 'Login e acesso', 'Criação do primeiro administrador fechada', 'O "Primeiro acesso" não cria outro administrador depois que já existe um.', 'alta', null),
  (14, 'Login e acesso', 'Saída automática por inatividade', 'O ERP sai sozinho depois do tempo parado, em todas as telas.', 'media', null),
  (15, 'Login e acesso', 'Dados sigilosos mascarados, com registro de quem viu', 'CPF, salário, dados bancários e senhas aparecem mascarados; abrir fica registrado.', 'media', '#104'),
  (16, 'Funções (Supabase)', 'Funções abertas conferem quem chama', 'Funções publicadas sem login (avisos de bancos, Focus, Telegram, WhatsApp...) conferem assinatura ou segredo.', 'alta', null),
  (17, 'Funções (Supabase)', 'Funções com login conferem o papel', 'Cada função confere se o usuário tem o papel para aquela ação, não só se está logado.', 'alta', null),
  (18, 'Funções (Supabase)', 'Erros sem detalhes internos', 'As respostas de erro não mostram chaves, SQL ou caminhos internos.', 'baixa', null),
  (19, 'Funções (Supabase)', 'Quem pode chamar as funções pelo navegador (CORS)', 'Só o endereço do ERP e as páginas por link chamam as funções do navegador.', 'media', null),
  (20, 'Site (Hostinger)', 'Cabeçalhos de segurança do site', 'HSTS, proteção contra o site ser aberto dentro de outro (clickjacking) e política de conteúdo no .htaccess.', 'media', null),
  (21, 'Site (Hostinger)', 'HTTPS sempre e certificado em dia', 'Endereço http vira https e o certificado não está perto de vencer.', 'media', null),
  (22, 'Site (Hostinger)', 'Nenhum arquivo esquecido aberto', 'Nada de .env, cópias, mapas do código ou listagem de pastas no endereço do site.', 'media', null),
  (23, 'Site (Hostinger)', 'Só a chave pública do Supabase no site', 'O site leva só a chave pública (anon); a chave de serviço nunca vai para o navegador.', 'alta', null),
  (24, 'Código e GitHub', 'Segredos no código e no histórico do GitHub', 'Procurar senhas, tokens e chaves em todos os arquivos e em todo o histórico.', 'alta', null),
  (25, 'Código e GitHub', 'Nenhum dado da empresa no repositório público', 'Sem planilhas, clientes, valores ou documentos da empresa no GitHub.', 'alta', null),
  (26, 'Código e GitHub', 'Bibliotecas atualizadas e sem falhas conhecidas', 'Bibliotecas do site e das funções sem falhas conhecidas (npm audit).', 'media', '#262'),
  (27, 'Código e GitHub', 'Publicação pelo GitHub Actions protegida', 'Os workflows usam o mínimo de permissão, os secrets ficam protegidos e só quem pode publica.', 'media', null),
  (28, 'Código e GitHub', 'Revisão do código com a auditoria de segurança', 'Leitura do código com a skill de auditoria (modo rápido); o relatório fica fora do GitHub.', 'media', null),
  (29, 'Integrações', 'Avisos que chegam de fora conferem a origem', 'Webhooks de bancos, notas, Mercado Livre e mensagens só valem com assinatura ou segredo certo.', 'alta', null),
  (30, 'Integrações', 'Chaves e certificados só nos secrets', 'Certificado A1 e chaves das APIs ficam nos secrets, com o vencimento acompanhado no Monitor.', 'media', null),
  (31, 'Contas dos serviços', 'Duas etapas nas contas dos serviços', 'Supabase, Hostinger, GitHub, Google, e-mail e bancos com login em duas etapas.', 'alta', null),
  (32, 'Contas dos serviços', 'Quem tem acesso a cada serviço', 'Só as pessoas certas no Supabase, Hostinger, GitHub e Google, cada uma com o mínimo necessário.', 'alta', null)
on conflict (area, item) do nothing;
