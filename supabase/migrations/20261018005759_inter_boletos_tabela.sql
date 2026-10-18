set lock_timeout = '8s';

-- Boleto com Pix do Banco Inter: regras da conta (multa, juros, dias para baixa, mensagem) e a situação do serviço
alter table public.inter_conexoes add column if not exists boletos boolean not null default false;
alter table public.inter_conexoes add column if not exists boletos_erro text;
alter table public.inter_conexoes add column if not exists boletos_webhook_em timestamptz;
alter table public.inter_conexoes add column if not exists boleto_multa_pct numeric(5,2) not null default 2;
alter table public.inter_conexoes add column if not exists boleto_juros_mes_pct numeric(5,2) not null default 1;
alter table public.inter_conexoes add column if not exists boleto_dias_baixa int not null default 30;
alter table public.inter_conexoes add column if not exists boleto_mensagem text;
comment on column public.inter_conexoes.boletos is 'O app do Inter tem a permissão de boletos (emitir e consultar) e a conta emite boleto com Pix pelo ERP.';
comment on column public.inter_conexoes.boleto_dias_baixa is 'Dias depois do vencimento em que o Inter cancela o boleto não pago (0 a 60).';

create table if not exists public.boletos_inter (
  id uuid primary key default gen_random_uuid(),
  conta_receber_id uuid references public.contas_receber(id) on delete set null,
  conexao_id uuid not null references public.inter_conexoes(id),
  unidade_id uuid references public.unidades(id),
  codigo_solicitacao text unique,
  seu_numero text not null,
  valor numeric(14,2) not null check (valor > 0),
  vencimento date not null,
  situacao text not null default 'EM_PROCESSAMENTO'
    check (situacao in ('EM_PROCESSAMENTO', 'A_RECEBER', 'ATRASADO', 'RECEBIDO', 'MARCADO_RECEBIDO', 'CANCELADO', 'EXPIRADO', 'FALHA_EMISSAO', 'PROTESTO')),
  situacao_data date,
  nosso_numero text,
  linha_digitavel text,
  codigo_barras text,
  pix_copia_cola text,
  txid text,
  valor_recebido numeric(14,2),
  origem_recebimento text check (origem_recebimento is null or origem_recebimento in ('BOLETO', 'PIX')),
  baixa_em timestamptz,
  motivo_cancelamento text,
  erro text,
  criado_por uuid default auth.uid(),
  criado_nome text,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.boletos_inter is 'Boletos com Pix emitidos pelo ERP no Banco Inter (um por conta a receber em aberto). Gravação só pela função inter.';
create index if not exists boletos_inter_conta on public.boletos_inter (conta_receber_id);
create unique index if not exists boletos_inter_um_aberto on public.boletos_inter (conta_receber_id)
  where situacao in ('EM_PROCESSAMENTO', 'A_RECEBER', 'ATRASADO', 'PROTESTO') and conta_receber_id is not null;

alter table public.boletos_inter enable row level security;
create policy "boletos_inter_ler" on public.boletos_inter for select to authenticated using (public.tem_papel('financeiro', 'vendas') or public.e_contador());
