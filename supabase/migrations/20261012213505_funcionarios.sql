-- Cadastro de funcionários (RH): dados pessoais, contrato, salário e pagamento, documentos e ligação com o usuário
-- do ERP, o vendedor (comissões) e a assistência técnica (lista de técnicos da OS).
-- Dados sensíveis (CPF, salário, conta): só admin e financeiro leem e editam. Os anexos do funcionário
-- (contrato, RG, exames) seguem a mesma regra, inclusive os arquivos no armazenamento.
-- Aditiva: não apaga nada; políticas, gatilhos e restrições conferidos antes de criar.

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apelido text,
  cpf text, rg text, data_nascimento date, estado_civil text, escolaridade text,
  email text, whatsapp text, telefone text,
  cep text, logradouro text, numero text, complemento text, bairro text, municipio text, uf text,
  unidade_id uuid references public.unidades(id) on delete set null,
  cargo text, setor text,
  vinculo text not null default 'clt',
  situacao text not null default 'ativo',
  data_admissao date, data_desligamento date, motivo_desligamento text,
  jornada text,
  salario numeric(12,2) check (salario is null or salario >= 0),
  dia_pagamento int check (dia_pagamento is null or dia_pagamento between 1 and 31),
  pis text, ctps text, cnh text, cnh_categoria text, cnh_validade date,
  banco text, agencia text, conta text, pix text,
  beneficios text, contato_emergencia text,
  faz_assistencia boolean not null default false,
  user_id uuid references public.usuarios_erp(user_id) on delete set null,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'funcionarios_vinculo_check') then
    alter table public.funcionarios add constraint funcionarios_vinculo_check
      check (vinculo in ('clt', 'experiencia', 'estagio', 'aprendiz', 'temporario', 'pj', 'autonomo', 'socio'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'funcionarios_situacao_check') then
    alter table public.funcionarios add constraint funcionarios_situacao_check
      check (situacao in ('ativo', 'ferias', 'afastado', 'desligado'));
  end if;
end $$;

create index if not exists funcionarios_unidade_idx on public.funcionarios (unidade_id);
create unique index if not exists funcionarios_cpf_unico on public.funcionarios (regexp_replace(cpf, '\D', '', 'g'))
  where ativo and cpf is not null and cpf <> '';

alter table public.funcionarios enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'funcionarios' and policyname = 'rh_ler') then
    create policy "rh_ler" on public.funcionarios for select to authenticated using (public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'funcionarios' and policyname = 'rh_escrever') then
    create policy "rh_escrever" on public.funcionarios for all to authenticated
      using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
  end if;
end $$;

-- histórico de alterações (quem mudou salário, cargo, situação…)
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'zz_auditoria' and tgrelid = 'public.funcionarios'::regclass) then
    create trigger zz_auditoria before insert or update or delete on public.funcionarios
      for each row execute function public.trg_auditoria();
  end if;
end $$;

create or replace function public.trg_funcionarios_atualizado()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  -- desligou: sai das listas (técnicos, folha) mas o cadastro fica
  if new.situacao = 'desligado' and new.data_desligamento is null then new.data_desligamento := current_date; end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_funcionarios_atualizado' and tgrelid = 'public.funcionarios'::regclass) then
    create trigger trg_funcionarios_atualizado before insert or update on public.funcionarios
      for each row execute function public.trg_funcionarios_atualizado();
  end if;
end $$;

-- Nomes dos técnicos ativos (para a OS). Qualquer usuário do ERP vê só o nome, nunca os demais dados.
create or replace function public.nomes_tecnicos()
returns table (nome text) language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(f.apelido), ''), f.nome) from public.funcionarios f
  where public.is_erp_user() and f.ativo and f.faz_assistencia and f.situacao <> 'desligado'
  order by 1;
$$;
revoke execute on function public.nomes_tecnicos() from public, anon;
grant execute on function public.nomes_tecnicos() to authenticated;

-- Anexos do funcionário (contrato, documentos, exames): mesma regra de acesso do cadastro
alter table public.documentos drop constraint if exists documentos_entidade_check;
alter table public.documentos add constraint documentos_entidade_check
  check (entidade in ('pedido', 'os', 'cliente', 'fornecedor', 'produto', 'conta_receber', 'conta_pagar',
                      'nfe_recebida', 'pedido_compra', 'equipamento', 'geral', 'fechamento', 'funcionario'));

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'documentos' and policyname = 'funcionario_doc_restrito') then
    create policy "funcionario_doc_restrito" on public.documentos as restrictive for all to authenticated
      using (entidade <> 'funcionario' or public.tem_papel('financeiro'))
      with check (entidade <> 'funcionario' or public.tem_papel('financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'funcionario_arquivo_restrito') then
    create policy "funcionario_arquivo_restrito" on storage.objects as restrictive for all to authenticated
      using (bucket_id <> 'documentos' or name not like 'funcionario/%' or public.tem_papel('financeiro'))
      with check (bucket_id <> 'documentos' or name not like 'funcionario/%' or public.tem_papel('financeiro'));
  end if;
end $$;
