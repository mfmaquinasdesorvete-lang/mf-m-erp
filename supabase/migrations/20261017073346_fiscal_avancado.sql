-- Modo fiscal avançado (Lucro Real): toda saída de estoque que não é venda passa a ter motivo fiscal — quebra na
-- fabricação, defeito de fornecedor (devolver), obsolescência/deterioração, furto/extravio, uso e consumo interno,
-- manutenção de máquina da fábrica, sucata e amostra/brinde — com o documento que segura a dedução (laudo, boletim
-- de ocorrência, NF de devolução, máquina onde a peça foi aplicada, peso da sucata). O valor sai pelo custo do produto.
-- Nada é apagado: baixa errada é cancelada com motivo e o estoque volta.

alter table public.configuracoes add column if not exists fiscal_avancado boolean not null default true;

create sequence if not exists public.baixas_estoque_numero_seq;

create table if not exists public.baixas_estoque (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null,
  unidade_id uuid not null references public.unidades(id),
  motivo text not null check (motivo in ('quebra_fabricacao', 'defeito_fornecedor', 'obsolescencia', 'furto_extravio',
    'consumo_interno', 'manutencao_fabrica', 'sucata', 'amostra_brinde')),
  produto_id uuid not null references public.produtos(id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  custo_unitario numeric(14, 4),
  valor numeric(14, 2),
  peso_kg numeric(12, 3),
  equipamento text,
  fornecedor_id uuid references public.fornecedores(id),
  nota_devolucao_id uuid references public.notas_fiscais(id),
  evidencia text,
  descricao text not null,
  situacao text not null default 'registrada' check (situacao in ('registrada', 'comprovada', 'cancelada')),
  movimento_id uuid,
  cancelada_motivo text,
  cancelada_em timestamptz,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists baixas_estoque_numero on public.baixas_estoque (numero);
create index if not exists baixas_estoque_data on public.baixas_estoque (created_at desc);
create index if not exists baixas_estoque_produto on public.baixas_estoque (produto_id);

alter table public.baixas_estoque enable row level security;
create policy "erp_select" on public.baixas_estoque for select to authenticated
  using (public.tem_papel('financeiro', 'compras', 'tecnico', 'expedicao'));
create policy "contador_select" on public.baixas_estoque for select to authenticated using (public.e_contador());
grant select on public.baixas_estoque to authenticated;
create or replace trigger zz_auditoria before insert or update or delete on public.baixas_estoque
  for each row execute function public.trg_auditoria();

-- Registra a baixa (um número para todos os itens) e tira do estoque da unidade.
-- p_itens: [{ produto_id, quantidade, peso_kg? }]
create or replace function public.registrar_baixa_estoque(
  p_unidade uuid, p_motivo text, p_descricao text, p_itens jsonb,
  p_evidencia text default null, p_fornecedor uuid default null, p_equipamento text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avancado boolean;
  v_numero bigint;
  v_nome text;
  v jsonb;
  v_prod record;
  v_qtd numeric;
  v_peso numeric;
  v_saldo numeric;
  v_id uuid;
  v_mov uuid;
  v_total numeric := 0;
  v_n int := 0;
  v_rotulo text := case p_motivo
    when 'quebra_fabricacao' then 'Quebra na fabricação' when 'defeito_fornecedor' then 'Defeito de fornecedor'
    when 'obsolescencia' then 'Obsolescência/deterioração' when 'furto_extravio' then 'Furto/extravio'
    when 'consumo_interno' then 'Uso e consumo interno' when 'manutencao_fabrica' then 'Manutenção da fábrica'
    when 'sucata' then 'Sucata/descarte' when 'amostra_brinde' then 'Amostra/brinde' end;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão para dar baixa no estoque'; end if;
  if v_rotulo is null then raise exception 'motivo da baixa inválido'; end if;
  if length(trim(coalesce(p_descricao, ''))) < 5 then raise exception 'descreva o que aconteceu (pelo menos 5 letras)'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 100 then
    raise exception 'informe de 1 a 100 itens';
  end if;
  if not exists (select 1 from unidades where id = p_unidade) then raise exception 'escolha a unidade'; end if;

  select coalesce((select fiscal_avancado from configuracoes limit 1), true) into v_avancado;
  if v_avancado then
    if p_motivo in ('obsolescencia', 'furto_extravio') and length(trim(coalesce(p_evidencia, ''))) < 3 then
      raise exception '%', case p_motivo when 'furto_extravio' then 'informe o número do boletim de ocorrência (sem ele a perda não é dedutível)'
        else 'informe o laudo (e fotos) da obsolescência ou deterioração (sem ele a perda pode ser glosada)' end;
    end if;
    if p_motivo = 'defeito_fornecedor' and p_fornecedor is null then raise exception 'escolha o fornecedor para a NF de devolução'; end if;
    if p_motivo = 'manutencao_fabrica' and length(trim(coalesce(p_equipamento, ''))) < 2 then
      raise exception 'informe a máquina da fábrica em que as peças foram aplicadas';
    end if;
  end if;
  if p_fornecedor is not null and not exists (select 1 from fornecedores where id = p_fornecedor) then raise exception 'fornecedor não encontrado'; end if;

  v_numero := nextval('baixas_estoque_numero_seq');
  select nome into v_nome from usuarios_erp where user_id = auth.uid();

  for v in select * from jsonb_array_elements(p_itens) loop
    v_qtd := case when coalesce(v->>'quantidade', '') ~ '^\d+(\.\d+)?$' then (v->>'quantidade')::numeric end;
    v_peso := case when coalesce(v->>'peso_kg', '') ~ '^\d+(\.\d+)?$' then (v->>'peso_kg')::numeric end;
    if v_qtd is null or v_qtd <= 0 then raise exception 'quantidade inválida'; end if;
    select id, descricao, coalesce(preco_custo, 0) custo, tipo into v_prod from produtos
     where id = case when coalesce(v->>'produto_id', '') ~* '^[0-9a-f-]{36}$' then (v->>'produto_id')::uuid end;
    if v_prod.id is null then raise exception 'produto não encontrado'; end if;
    if v_avancado and p_motivo = 'sucata' and coalesce(v_peso, 0) <= 0 then
      raise exception 'pese a sucata: informe o peso (kg) de %', v_prod.descricao;
    end if;
    v_saldo := coalesce(public.estoque_na_unidade(v_prod.id, p_unidade), 0);
    if v_saldo < v_qtd then
      raise exception 'saldo insuficiente de % nesta unidade (tem %, baixa de %)', v_prod.descricao, v_saldo, v_qtd;
    end if;

    insert into baixas_estoque (numero, unidade_id, motivo, produto_id, quantidade, custo_unitario, valor, peso_kg, equipamento,
      fornecedor_id, evidencia, descricao, criado_por_nome)
    values (v_numero, p_unidade, p_motivo, v_prod.id, v_qtd, v_prod.custo, round(v_prod.custo * v_qtd, 2), v_peso,
      nullif(trim(coalesce(p_equipamento, '')), ''), p_fornecedor, nullif(trim(coalesce(p_evidencia, '')), ''), trim(p_descricao), v_nome)
    returning id into v_id;

    insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id, documento)
    values (v_prod.id, 'saida', v_qtd, left('Baixa #' || v_numero || ' · ' || v_rotulo || ': ' || trim(p_descricao), 300), 'baixa', v_id,
      p_unidade, nullif(trim(coalesce(p_evidencia, '')), ''))
    returning id into v_mov;
    update baixas_estoque set movimento_id = v_mov where id = v_id;

    v_total := v_total + round(v_prod.custo * v_qtd, 2);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('numero', v_numero, 'itens', v_n, 'valor', v_total);
end $$;

-- Completa o documento da baixa (laudo, BO, NF de devolução, máquina, peso) e, se pedir, marca como comprovada.
create or replace function public.documentar_baixa_estoque(
  p_id uuid, p_evidencia text default null, p_nota_devolucao uuid default null, p_equipamento text default null,
  p_peso_kg numeric default null, p_comprovada boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare b record;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão'; end if;
  select * into b from baixas_estoque where id = p_id;
  if b.id is null then raise exception 'baixa não encontrada'; end if;
  if b.situacao = 'cancelada' then raise exception 'esta baixa foi cancelada'; end if;
  if p_nota_devolucao is not null and not exists (select 1 from notas_fiscais where id = p_nota_devolucao) then
    raise exception 'nota de devolução não encontrada';
  end if;
  update baixas_estoque set
    evidencia = coalesce(nullif(trim(coalesce(p_evidencia, '')), ''), evidencia),
    nota_devolucao_id = coalesce(p_nota_devolucao, nota_devolucao_id),
    equipamento = coalesce(nullif(trim(coalesce(p_equipamento, '')), ''), equipamento),
    peso_kg = coalesce(case when p_peso_kg > 0 then p_peso_kg end, peso_kg),
    situacao = case when p_comprovada then 'comprovada' else situacao end,
    updated_at = now()
  where id = p_id;
end $$;

-- Cancela a baixa inteira (todos os itens do número) com motivo: o estoque volta para a unidade.
create or replace function public.cancelar_baixa_estoque(p_numero bigint, p_motivo text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare b record; v_n int := 0;
begin
  if not public.tem_papel('financeiro') then raise exception 'sem permissão'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'informe o motivo do cancelamento'; end if;
  for b in select * from baixas_estoque where numero = p_numero and situacao <> 'cancelada' loop
    insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values (b.produto_id, 'entrada', b.quantidade, left('Baixa #' || b.numero || ' cancelada: ' || trim(p_motivo), 300), 'baixa', b.id, b.unidade_id);
    update baixas_estoque set situacao = 'cancelada', cancelada_motivo = trim(p_motivo), cancelada_em = now(), updated_at = now() where id = b.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'baixa não encontrada ou já cancelada'; end if;
  return v_n;
end $$;

revoke all on function public.registrar_baixa_estoque(uuid, text, text, jsonb, text, uuid, text) from public, anon;
revoke all on function public.documentar_baixa_estoque(uuid, text, uuid, text, numeric, boolean) from public, anon;
revoke all on function public.cancelar_baixa_estoque(bigint, text) from public, anon;
grant execute on function public.registrar_baixa_estoque(uuid, text, text, jsonb, text, uuid, text) to authenticated;
grant execute on function public.documentar_baixa_estoque(uuid, text, uuid, text, numeric, boolean) to authenticated;
grant execute on function public.cancelar_baixa_estoque(bigint, text) to authenticated;
