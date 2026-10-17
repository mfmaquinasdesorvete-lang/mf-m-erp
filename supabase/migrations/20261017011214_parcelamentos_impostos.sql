-- Parcelamentos de impostos: o que está parcelado (Receita Federal, PGFN, SEFAZ SC/SP, prefeitura), em quantas vezes,
-- o que já foi pago, quem pagou (a MF, outra empresa, conta pessoal ou o contador) e o que vence. Avisos antes do
-- vencimento e no atraso, para o parcelamento não ser cancelado. Financeiro grava; contador e administrador leem.
-- Nada é apagado: parcela que não existe mais fica anulada; parcelamento encerrado muda de situação.

create table if not exists public.parcelamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades(id),
  orgao text not null check (orgao in ('receita_federal', 'pgfn', 'sefaz_sc', 'sefaz_sp', 'prefeitura', 'outro')),
  modalidade text check (modalidade is null or length(modalidade) <= 120),
  numero text check (numero is null or length(numero) <= 60),
  descricao text check (descricao is null or length(descricao) <= 500),
  data_adesao date,
  valor_consolidado numeric(14, 2) check (valor_consolidado is null or valor_consolidado >= 0),
  qtd_parcelas int not null check (qtd_parcelas between 1 and 240),
  valor_parcela numeric(14, 2) check (valor_parcela is null or valor_parcela >= 0),
  primeira_parcela date not null,
  vencimento_regra text not null default 'ultimo_dia_util' check (vencimento_regra in ('ultimo_dia_util', 'dia')),
  dia_vencimento int check (dia_vencimento is null or dia_vencimento between 1 and 31),
  corrige_selic boolean not null default false,
  max_atrasos int not null default 3 check (max_atrasos between 1 and 12),
  rescinde_ultima boolean not null default false,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'quitado', 'rescindido', 'cancelado')),
  observacoes text check (observacoes is null or length(observacoes) <= 2000),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.parcelamento_parcelas (
  id uuid primary key default gen_random_uuid(),
  parcelamento_id uuid not null references public.parcelamentos(id),
  numero int not null check (numero between 1 and 240),
  vencimento date not null,
  valor numeric(14, 2) check (valor is null or valor >= 0),
  situacao text not null default 'a_pagar' check (situacao in ('a_pagar', 'pago', 'anulada')),
  pago_em date,
  valor_pago numeric(14, 2) check (valor_pago is null or valor_pago >= 0),
  pago_por text check (pago_por is null or pago_por in ('mf', 'outra_empresa', 'pessoal', 'contador', 'outro')),
  pago_por_nome text check (pago_por_nome is null or length(pago_por_nome) <= 120),
  extrato_lancamento_id uuid references public.extrato_lancamentos(id),
  observacao text check (observacao is null or length(observacao) <= 500),
  atualizado_em timestamptz not null default now(),
  unique (parcelamento_id, numero),
  check (situacao <> 'pago' or (pago_em is not null and pago_por is not null))
);
create index if not exists parcelamento_parcelas_venc on public.parcelamento_parcelas (vencimento) where situacao = 'a_pagar';

alter table public.parcelamentos enable row level security;
alter table public.parcelamento_parcelas enable row level security;
revoke all on public.parcelamentos, public.parcelamento_parcelas from anon, public;
grant select, insert, update on public.parcelamentos, public.parcelamento_parcelas to authenticated;

create policy parcelamentos_ler on public.parcelamentos for select to authenticated using (public.tem_papel('financeiro', 'contador'));
create policy parcelamentos_criar on public.parcelamentos for insert to authenticated with check (public.tem_papel('financeiro'));
create policy parcelamentos_mudar on public.parcelamentos for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create policy parcelas_ler on public.parcelamento_parcelas for select to authenticated using (public.tem_papel('financeiro', 'contador'));
create policy parcelas_criar on public.parcelamento_parcelas for insert to authenticated with check (public.tem_papel('financeiro'));
create policy parcelas_mudar on public.parcelamento_parcelas for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));

create trigger zz_auditoria before insert or update on public.parcelamentos for each row execute function public.trg_auditoria();
create trigger zz_auditoria before insert or update on public.parcelamento_parcelas for each row execute function public.trg_auditoria();

/** Avisa o financeiro e o administrador: 7 e 2 dias antes, no dia, 1 dia depois e a cada semana de atraso. */
create or replace function public.avisar_parcelamentos()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; d int;
begin
  for r in
    select x.*, p.orgao, p.numero as num_parc, p.modalidade, p.unidade_id, p.qtd_parcelas,
           (select count(*) from parcelamento_parcelas y where y.parcelamento_id = p.id and y.situacao = 'a_pagar' and y.vencimento < current_date) as atrasadas, p.max_atrasos
      from parcelamento_parcelas x join parcelamentos p on p.id = x.parcelamento_id
     where x.situacao = 'a_pagar' and p.situacao = 'ativo' and x.vencimento between current_date - 120 and current_date + 7
  loop
    d := r.vencimento - current_date;
    if d in (7, 2, 0) or (d < 0 and (-d = 1 or (-d) % 7 = 0)) then
      perform public.notificar('parcelamento',
        case when d > 0 then 'Parcela de imposto vence em ' || d || ' dias'
             when d = 0 then 'Parcela de imposto vence hoje'
             else 'Parcela de imposto atrasada há ' || (-d) || ' dias' end
          || case when r.atrasadas >= r.max_atrasos - 1 and d <= 0 then ' · risco de cancelar o parcelamento' else '' end,
        concat_ws(' · ', r.modalidade, 'nº ' || r.num_parc, 'parcela ' || r.numero || '/' || r.qtd_parcelas, public.brl(coalesce(r.valor, 0)), to_char(r.vencimento, 'DD/MM/YYYY')),
        '/parcelamentos', '{financeiro}', r.unidade_id);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.avisar_parcelamentos() from public, anon, authenticated;

select cron.schedule('erp-parcelamentos-avisos', '7 11 * * *', $c$ select public.avisar_parcelamentos() $c$);
