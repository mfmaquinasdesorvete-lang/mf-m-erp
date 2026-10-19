-- Pix de saída pelo Banco Inter: cada pedido de pagamento de uma conta a pagar fica registrado aqui (o id também é a
-- chave de idempotência mandada ao Inter, então um clique repetido não paga duas vezes). Só a função inter grava;
-- o financeiro e o contador leem. Uma conta só pode ter um Pix em andamento ou pago de cada vez.
create table if not exists public.pix_pagamentos (
  id uuid primary key default gen_random_uuid(),
  conta_pagar_id uuid not null references public.contas_pagar(id),
  conexao_id uuid not null references public.inter_conexoes(id),
  chave text not null check (length(chave) between 3 and 77),
  tipo_chave text not null,
  valor numeric(12,2) not null check (valor > 0),
  status text not null default 'enviando' check (status in ('enviando', 'aguardando_aprovacao', 'agendado', 'pago', 'falhou')),
  codigo_solicitacao text,
  resposta jsonb,
  erro text,
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists pix_pagamentos_um_ativo on public.pix_pagamentos (conta_pagar_id)
  where status in ('enviando', 'aguardando_aprovacao', 'agendado', 'pago');
create index if not exists pix_pagamentos_conta on public.pix_pagamentos (conta_pagar_id);

alter table public.pix_pagamentos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pix_pagamentos' and policyname = 'pix_pagamentos_ler') then
    create policy pix_pagamentos_ler on public.pix_pagamentos for select to authenticated using (public.tem_papel('financeiro', 'contador'));
  end if;
end $$;
revoke insert, update, delete on public.pix_pagamentos from anon, authenticated;
