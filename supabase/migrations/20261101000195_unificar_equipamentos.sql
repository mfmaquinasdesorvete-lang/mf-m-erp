-- Unificar máquinas repetidas do mesmo cliente (decisão da usuária, 29/10, pelo FIS): a máquina que veio da nota da MF
-- (série, nota, data de venda) e a do mesmo modelo, sem série, que veio da My Frost (proposta do Tiny ou lista de
-- contatos) são a mesma. Fica uma só; nada se perde:
-- - o que fica recebe o que lhe falta da outra (proposta, voltagem, valor negociado, garantia, preventiva, observações);
-- - OS, contatos e retestes do giga da que sai passam para a que fica;
-- - a que sai fica guardada inteira em equipamentos_unificados, e as importações não a criam de novo
--   (gatilho antes de inserir: a mesma origem e referência de uma máquina unificada é pulada).

create table if not exists public.equipamentos_unificados (
  id uuid primary key default gen_random_uuid(),
  origem text,
  origem_ref text,
  token uuid,
  ficou_id uuid references public.equipamentos (id) on delete set null,
  dados jsonb not null,
  unificado_em timestamptz not null default now(),
  unificado_por uuid
);
create index if not exists equipamentos_unificados_ref on public.equipamentos_unificados (origem, origem_ref) where origem_ref is not null;
alter table public.equipamentos_unificados enable row level security;
drop policy if exists erp_select on public.equipamentos_unificados;
create policy erp_select on public.equipamentos_unificados for select using ((select public.is_erp_user()));

create or replace function public.trg_equipamento_nao_recriar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.origem_ref is not null and exists (
       select 1 from public.equipamentos_unificados u where u.origem is not distinct from new.origem and u.origem_ref = new.origem_ref) then
    return null;   -- já foi unificada com outra máquina: a importação não cria de novo
  end if;
  return new;
end $$;

create trigger trg_equipamento_nao_recriar before insert on public.equipamentos
for each row execute function public.trg_equipamento_nao_recriar();

create or replace function public.unificar_equipamentos(p_fica uuid, p_sai uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f public.equipamentos; s public.equipamentos;
begin
  if not (public.is_erp_admin() or coalesce(auth.role(), '') = 'service_role' or current_user = 'postgres') then
    raise exception 'só o administrador unifica máquinas';
  end if;
  if p_fica = p_sai then raise exception 'escolha duas máquinas diferentes'; end if;
  select * into f from public.equipamentos where id = p_fica for update;
  select * into s from public.equipamentos where id = p_sai for update;
  if f.id is null or s.id is null then raise exception 'máquina não encontrada'; end if;
  if f.cliente_id is distinct from s.cliente_id then raise exception 'as duas máquinas são de clientes diferentes'; end if;
  if f.numero_serie is not null and s.numero_serie is not null and f.numero_serie <> s.numero_serie then
    raise exception 'as duas máquinas têm números de série diferentes (% e %)', f.numero_serie, s.numero_serie;
  end if;

  update public.equipamentos set
    produto_id = coalesce(produto_id, s.produto_id),
    numero_serie = coalesce(numero_serie, s.numero_serie),
    pedido_id = coalesce(pedido_id, s.pedido_id),
    data_venda = coalesce(data_venda, s.data_venda),
    garantia_ate = coalesce(garantia_ate, s.garantia_ate),
    proxima_preventiva = coalesce(proxima_preventiva, s.proxima_preventiva),
    preventiva_agendada = coalesce(preventiva_agendada, s.preventiva_agendada),
    ultimo_contato = greatest(ultimo_contato, s.ultimo_contato),
    voltagem = coalesce(voltagem, s.voltagem),
    proposta_tiny_id = coalesce(proposta_tiny_id, s.proposta_tiny_id),
    nota_legado_id = coalesce(nota_legado_id, s.nota_legado_id),
    valor_negociado = coalesce(valor_negociado, s.valor_negociado),
    ligacao_venda = coalesce(ligacao_venda, s.ligacao_venda),
    observacoes = nullif(concat_ws(E'\n', nullif(observacoes, ''), nullif(s.observacoes, ''),
      'Unificada em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || ' com a máquina ' ||
      concat_ws(' ', s.origem, s.origem_ref) || coalesce(' (venda ' || to_char(s.data_venda, 'DD/MM/YYYY') || ')', '') || '.'), '')
  where id = p_fica;

  update public.ordens_servico set equipamento_id = p_fica where equipamento_id = p_sai;
  update public.contatos_cliente set equipamento_id = p_fica where equipamento_id = p_sai;
  update public.giga_retestes set equipamento_id = p_fica where equipamento_id = p_sai;

  insert into public.equipamentos_unificados (origem, origem_ref, token, ficou_id, dados, unificado_por)
  values (s.origem, s.origem_ref, s.token, p_fica, to_jsonb(s), auth.uid());
  delete from public.equipamentos where id = p_sai;
end $$;
revoke execute on function public.unificar_equipamentos(uuid, uuid) from public, anon;
grant execute on function public.unificar_equipamentos(uuid, uuid) to authenticated;
