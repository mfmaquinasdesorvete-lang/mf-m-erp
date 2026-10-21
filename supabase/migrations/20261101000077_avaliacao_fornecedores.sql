-- =====================================================================
-- Avaliação de fornecedores (ISO 9001, item 8.4)
--   * não conformidades (fornecedor_ocorrencias): atraso, defeito, item
--     ou quantidade errada, nota errada, atendimento; leve/média/grave;
--     ação pedida ao fornecedor e quando foi resolvida
--   * avaliação periódica (fornecedor_avaliacoes): notas de prazo,
--     qualidade, preço e atendimento, nota final, classe A/B/C e a data
--     da próxima avaliação (A 12 meses, B 6, C 3; crítico no máximo 6)
--   * indicadores_fornecedores(): o que o ERP já sabe no período (OC no
--     prazo, devoluções, baixas por defeito, compras pelas notas)
-- As notas sugeridas e a classe são calculadas na tela
-- (src/lib/avaliacaoFornecedor.ts); aqui fica só o registro.
-- =====================================================================
alter table public.fornecedores
  add column if not exists critico boolean not null default false,
  add column if not exists avaliacao_nota numeric(4,1),
  add column if not exists avaliacao_classe text check (avaliacao_classe in ('A', 'B', 'C')),
  add column if not exists avaliado_em date,
  add column if not exists proxima_avaliacao date;
comment on column public.fornecedores.critico is 'Fornecedor crítico (peça que afeta a qualidade ou a certificação das máquinas): reavaliado no máximo a cada 6 meses';

create table if not exists public.fornecedor_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('atraso', 'qualidade', 'quantidade', 'documentacao', 'atendimento', 'outro')),
  gravidade text not null default 'media' check (gravidade in ('leve', 'media', 'grave')),
  descricao text not null,
  pedido_compra_id uuid references public.pedidos_compra(id) on delete set null,
  nfe_recebida_id uuid references public.nfe_recebidas(id) on delete set null,
  acao text,
  resolvida_em date,
  criado_por uuid default auth.uid(),
  criado_nome text,
  created_at timestamptz not null default now()
);
create index if not exists fornecedor_ocorrencias_forn_idx on public.fornecedor_ocorrencias (fornecedor_id, data desc);

create table if not exists public.fornecedor_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
  data date not null default current_date,
  periodo_inicio date,
  periodo_fim date,
  nota_prazo numeric(4,1) not null check (nota_prazo between 0 and 10),
  nota_qualidade numeric(4,1) not null check (nota_qualidade between 0 and 10),
  nota_preco numeric(4,1) not null check (nota_preco between 0 and 10),
  nota_atendimento numeric(4,1) not null check (nota_atendimento between 0 and 10),
  nota_final numeric(4,1) not null check (nota_final between 0 and 10),
  classe text not null check (classe in ('A', 'B', 'C')),
  proxima_avaliacao date not null,
  indicadores jsonb,
  observacoes text,
  avaliado_por uuid default auth.uid(),
  avaliado_nome text,
  created_at timestamptz not null default now()
);
create index if not exists fornecedor_avaliacoes_forn_idx on public.fornecedor_avaliacoes (fornecedor_id, data desc);

alter table public.fornecedor_ocorrencias enable row level security;
alter table public.fornecedor_avaliacoes enable row level security;
revoke all on public.fornecedor_ocorrencias, public.fornecedor_avaliacoes from anon;
grant select, insert, update on public.fornecedor_ocorrencias to authenticated;
grant select on public.fornecedor_avaliacoes to authenticated;
create policy fornecedor_ocorrencias_ler on public.fornecedor_ocorrencias for select to authenticated
  using (public.tem_papel('compras', 'financeiro', 'tecnico'));
create policy fornecedor_ocorrencias_gravar on public.fornecedor_ocorrencias for insert to authenticated
  with check (public.tem_papel('compras', 'financeiro', 'tecnico'));
create policy fornecedor_ocorrencias_mudar on public.fornecedor_ocorrencias for update to authenticated
  using (public.tem_papel('compras', 'financeiro', 'tecnico')) with check (public.tem_papel('compras', 'financeiro', 'tecnico'));
create policy fornecedor_avaliacoes_ler on public.fornecedor_avaliacoes for select to authenticated
  using (public.tem_papel('compras', 'financeiro', 'tecnico'));

-- o que o ERP já registrou de cada fornecedor no período
create or replace function public.indicadores_fornecedores(p_inicio date, p_fim date)
returns table (fornecedor_id uuid, pedidos int, entregues int, no_prazo int, atraso_medio numeric, devolucoes int, defeitos int,
               notas int, valor_compras numeric, ultima_compra date, ocorrencias jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_papel('compras', 'financeiro', 'tecnico');
  return query
  with oc as (
    select p.fornecedor_id, count(*)::int pedidos,
           count(*) filter (where p.recebido_em is not null and p.previsao_entrega is not null)::int entregues,
           count(*) filter (where p.recebido_em is not null and p.previsao_entrega is not null
                              and (p.recebido_em at time zone 'America/Sao_Paulo')::date <= p.previsao_entrega)::int no_prazo,
           round(avg(((p.recebido_em at time zone 'America/Sao_Paulo')::date - p.previsao_entrega))
                 filter (where p.recebido_em is not null and p.previsao_entrega is not null
                           and (p.recebido_em at time zone 'America/Sao_Paulo')::date > p.previsao_entrega), 1) atraso_medio
      from pedidos_compra p
     where p.excluida_em is null and p.status <> 'cancelado' and p.fornecedor_id is not null
       and coalesce((p.recebido_em at time zone 'America/Sao_Paulo')::date, p.data, p.created_at::date) between p_inicio and p_fim
     group by p.fornecedor_id
  ), dev as (
    select n.fornecedor_id, count(*)::int devolucoes from notas_fiscais n
     where n.fornecedor_id is not null and n.finalidade = 'devolucao' and n.status = 'autorizada' and n.excluida_em is null
       and n.created_at::date between p_inicio and p_fim
     group by n.fornecedor_id
  ), def as (
    select b.fornecedor_id, count(*)::int defeitos from baixas_estoque b
     where b.fornecedor_id is not null and b.motivo = 'defeito_fornecedor' and coalesce(b.situacao, '') <> 'cancelada'
       and b.created_at::date between p_inicio and p_fim
     group by b.fornecedor_id
  ), nf as (
    select r.fornecedor_id, count(*)::int notas, sum(r.valor_total) valor, max(r.data_emissao::date) ultima from nfe_recebidas r
     where r.fornecedor_id is not null and r.excluida_em is null and coalesce(r.situacao, '') <> 'cancelada'
       and r.data_emissao::date between p_inicio and p_fim
     group by r.fornecedor_id
  ), oco as (
    select o.fornecedor_id, jsonb_agg(jsonb_build_object('tipo', o.tipo, 'gravidade', o.gravidade, 'aberta', o.resolvida_em is null) order by o.data) lista
      from fornecedor_ocorrencias o where o.data between p_inicio and p_fim group by o.fornecedor_id
  ), ids as (
    select x.fornecedor_id from oc x union select x.fornecedor_id from dev x union select x.fornecedor_id from def x
    union select x.fornecedor_id from nf x union select x.fornecedor_id from oco x
  )
  select i.fornecedor_id, coalesce(oc.pedidos, 0), coalesce(oc.entregues, 0), coalesce(oc.no_prazo, 0), oc.atraso_medio,
         coalesce(dev.devolucoes, 0), coalesce(def.defeitos, 0), coalesce(nf.notas, 0), coalesce(nf.valor, 0), nf.ultima,
         coalesce(oco.lista, '[]'::jsonb)
    from ids i
    left join oc on oc.fornecedor_id = i.fornecedor_id
    left join dev on dev.fornecedor_id = i.fornecedor_id
    left join def on def.fornecedor_id = i.fornecedor_id
    left join nf on nf.fornecedor_id = i.fornecedor_id
    left join oco on oco.fornecedor_id = i.fornecedor_id;
end $$;
revoke execute on function public.indicadores_fornecedores(date, date) from public, anon;
grant execute on function public.indicadores_fornecedores(date, date) to authenticated;

-- grava a avaliação e atualiza o cadastro (nota, classe, próxima data)
create or replace function public.registrar_avaliacao_fornecedor(p_fornecedor uuid, p_avaliacao jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  perform public.exigir_papel('compras', 'financeiro');
  select nullif(btrim(nome), '') into v_nome from usuarios_erp where user_id = auth.uid();
  insert into fornecedor_avaliacoes (fornecedor_id, data, periodo_inicio, periodo_fim, nota_prazo, nota_qualidade, nota_preco,
                                     nota_atendimento, nota_final, classe, proxima_avaliacao, indicadores, observacoes, avaliado_nome)
  values (p_fornecedor, coalesce((p_avaliacao->>'data')::date, current_date), (p_avaliacao->>'periodo_inicio')::date,
          (p_avaliacao->>'periodo_fim')::date, (p_avaliacao->>'nota_prazo')::numeric, (p_avaliacao->>'nota_qualidade')::numeric,
          (p_avaliacao->>'nota_preco')::numeric, (p_avaliacao->>'nota_atendimento')::numeric, (p_avaliacao->>'nota_final')::numeric,
          p_avaliacao->>'classe', (p_avaliacao->>'proxima_avaliacao')::date, p_avaliacao->'indicadores',
          nullif(btrim(p_avaliacao->>'observacoes'), ''), v_nome)
  returning id into v_id;
  update fornecedores set avaliacao_nota = (p_avaliacao->>'nota_final')::numeric, avaliacao_classe = p_avaliacao->>'classe',
         avaliado_em = coalesce((p_avaliacao->>'data')::date, current_date), proxima_avaliacao = (p_avaliacao->>'proxima_avaliacao')::date
   where id = p_fornecedor;
  return v_id;
end $$;
revoke execute on function public.registrar_avaliacao_fornecedor(uuid, jsonb) from public, anon;
grant execute on function public.registrar_avaliacao_fornecedor(uuid, jsonb) to authenticated;
