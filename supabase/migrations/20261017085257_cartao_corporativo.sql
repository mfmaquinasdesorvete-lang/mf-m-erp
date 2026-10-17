-- =====================================================================
-- Cartão corporativo de uma pessoa (ex.: "Cartão Fabiano", a conta InfinitePay da filial SP): os débitos do extrato
-- daquela conta viram os gastos do cartão, por categoria, com a situação da nota de cada compra — pendente, pedida,
-- recebida, sem nota (com o motivo) ou pessoal —, para pôr tudo na empresa com documento (Lucro Real).
-- =====================================================================

alter table public.contas_bancarias add column if not exists cartao_nome text;
alter table public.contas_bancarias add column if not exists cartao_responsavel uuid;

create table if not exists public.cartao_gastos (
  lancamento_id uuid primary key references public.extrato_lancamentos(id),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'pedida', 'recebida', 'sem_nota', 'pessoal')),
  categoria text check (categoria in ('alimentacao', 'mercado', 'combustivel', 'veiculo', 'material', 'online', 'pedagio', 'pix', 'tarifa', 'outros')),
  nota_numero text,
  nfe_recebida_id uuid references public.nfe_recebidas(id),
  observacao text,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now()
);

alter table public.cartao_gastos enable row level security;
create policy "erp_select" on public.cartao_gastos for select to authenticated
  using (public.tem_papel('financeiro') or public.e_contador());
grant select on public.cartao_gastos to authenticated;

create or replace trigger zz_auditoria before insert or update or delete on public.cartao_gastos
  for each row execute function public.trg_auditoria();

-- Pode ver e marcar o cartão: financeiro (e o administrador) ou a pessoa responsável pelo cartão
create or replace function public.pode_cartao(p_conta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_papel('financeiro')
      or exists (select 1 from public.contas_bancarias c where c.id = p_conta and c.cartao_nome is not null and c.cartao_responsavel = auth.uid());
$$;

-- Cartões que a pessoa vê: os dela e, para o financeiro, todos
create or replace function public.cartoes_corporativos()
returns table (id uuid, nome text, cartao_nome text, cartao_responsavel uuid, unidade_id uuid, unidade_nome text, unidade_cnpj text, extrato_ate date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.cartao_nome, c.cartao_responsavel, c.unidade_id, u.nome, u.cnpj,
         (select max(e.data) from public.extrato_lancamentos e where e.conta_bancaria_id = c.id)
    from public.contas_bancarias c left join public.unidades u on u.id = c.unidade_id
   where c.cartao_nome is not null and c.ativo and public.pode_cartao(c.id)
   order by c.cartao_nome;
$$;

-- Débitos do cartão a partir de uma data, com a situação da nota (sem as transferências entre contas)
create or replace function public.gastos_cartao(p_conta uuid, p_de date)
returns table (id uuid, data date, valor numeric, descricao text, identificador text, status text, conta_pagar_id uuid,
               situacao text, categoria text, nota_numero text, nfe_recebida_id uuid, observacao text, atualizado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_cartao(p_conta) then raise exception 'Sem acesso a este cartão'; end if;
  return query
    select e.id, e.data, e.valor, e.descricao, e.identificador, e.status, e.conta_pagar_id,
           coalesce(g.situacao, 'pendente'), g.categoria, g.nota_numero, g.nfe_recebida_id, g.observacao, g.atualizado_em
      from public.extrato_lancamentos e left join public.cartao_gastos g on g.lancamento_id = e.id
     where e.conta_bancaria_id = p_conta and e.valor < 0 and e.data >= p_de and coalesce(e.status, '') <> 'transferencia'
     order by e.data desc, e.created_at desc;
end $$;

-- Marca a nota de uma compra: pedida, recebida (nº ou NF-e ligada), sem nota (motivo) ou pessoal; muda a categoria
create or replace function public.marcar_gasto_cartao(
  p_lancamento uuid, p_situacao text, p_categoria text default null, p_nota text default null, p_obs text default null, p_nfe uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_conta uuid;
begin
  select conta_bancaria_id into v_conta from public.extrato_lancamentos where id = p_lancamento and valor < 0;
  if v_conta is null then raise exception 'Lançamento não encontrado'; end if;
  if not public.pode_cartao(v_conta) then raise exception 'Sem acesso a este cartão'; end if;
  if p_situacao not in ('pendente', 'pedida', 'recebida', 'sem_nota', 'pessoal') then raise exception 'Situação inválida'; end if;
  if p_situacao = 'sem_nota' and length(btrim(coalesce(p_obs, ''))) < 3 then raise exception 'Escreva por que não há nota'; end if;
  insert into public.cartao_gastos as g (lancamento_id, situacao, categoria, nota_numero, nfe_recebida_id, observacao, atualizado_por, atualizado_em)
  values (p_lancamento, p_situacao, p_categoria, nullif(btrim(coalesce(p_nota, '')), ''), p_nfe, nullif(btrim(coalesce(p_obs, '')), ''), auth.uid(), now())
  on conflict (lancamento_id) do update set
    situacao = excluded.situacao,
    categoria = coalesce(excluded.categoria, g.categoria),
    nota_numero = coalesce(excluded.nota_numero, case when excluded.situacao = 'recebida' then g.nota_numero end),
    nfe_recebida_id = coalesce(excluded.nfe_recebida_id, case when excluded.situacao = 'recebida' then g.nfe_recebida_id end),
    observacao = coalesce(excluded.observacao, g.observacao),
    atualizado_por = auth.uid(), atualizado_em = now();
end $$;

-- NF-e recebidas da unidade do cartão (para casar compra × nota pelo valor e pela data)
create or replace function public.notas_cartao(p_conta uuid, p_de date)
returns table (id uuid, chave text, emitente_nome text, valor_total numeric, data_emissao date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_cartao(p_conta) then raise exception 'Sem acesso a este cartão'; end if;
  return query
    select n.id, n.chave, n.emitente_nome, n.valor_total, n.data_emissao::date
      from public.nfe_recebidas n
     where n.unidade_id = (select c.unidade_id from public.contas_bancarias c where c.id = p_conta) and n.data_emissao >= p_de - 7;
end $$;

revoke all on function public.cartoes_corporativos() from public, anon;
revoke all on function public.gastos_cartao(uuid, date) from public, anon;
revoke all on function public.marcar_gasto_cartao(uuid, text, text, text, text, uuid) from public, anon;
revoke all on function public.notas_cartao(uuid, date) from public, anon;
grant execute on function public.pode_cartao(uuid) to authenticated;
grant execute on function public.cartoes_corporativos() to authenticated;
grant execute on function public.gastos_cartao(uuid, date) to authenticated;
grant execute on function public.marcar_gasto_cartao(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.notas_cartao(uuid, date) to authenticated;
