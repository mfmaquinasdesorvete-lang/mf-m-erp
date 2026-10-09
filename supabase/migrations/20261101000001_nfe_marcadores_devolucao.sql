-- =====================================================================
-- Notas fiscais: marcadores, observação interna, exclusão com motivo e
-- NF-e de devolução
--   * marcadores coloridos com ícone (como no Tiny), aplicados a notas
--     emitidas e recebidas, um por um ou em lote
--   * excluir nota feita errada: só rejeitada, de teste (homologação) ou
--     importada; a recebida só sem estoque e sem contas a pagar lançados.
--     A nota sai das listas e de todo o ERP, mas fica guardada com quem,
--     quando e por quê (dá para restaurar)
--   * devolução: nota de devolução de venda (entrada) e de compra (saída)
--     ligada à nota original; ao autorizar, o estoque entra/sai sozinho e
--     volta se a devolução for cancelada
-- =====================================================================

-- ---------------------------------------------------------------------
-- Marcadores
-- ---------------------------------------------------------------------
create table if not exists public.marcadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 40),
  cor text not null default 'slate' check (cor ~ '^[a-z]+$'),
  icone text not null default 'tag' check (icone ~ '^[a-z0-9-]+$'),
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists marcadores_nome_unico on public.marcadores (lower(btrim(nome)));
alter table public.marcadores enable row level security;
do $$ begin
  create policy "marcadores_select" on public.marcadores for select to authenticated using (public.is_erp_user() or public.e_contador());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "marcadores_insert" on public.marcadores for insert to authenticated with check (public.tem_papel('vendas', 'financeiro'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "marcadores_update" on public.marcadores for update to authenticated
    using (public.tem_papel('vendas', 'financeiro')) with check (public.tem_papel('vendas', 'financeiro'));
exception when duplicate_object then null; end $$;

insert into public.marcadores (nome, cor, icone, ordem) values
  ('1ª venda', 'indigo', 'star', 1),
  ('Pago', 'emerald', 'circle-check', 2),
  ('Aguardando pagamento', 'amber', 'clock', 3),
  ('Carta de correção', 'orange', 'file-pen', 4),
  ('Enviado ao cliente', 'sky', 'send', 5),
  ('Garantia', 'slate', 'shield', 6),
  ('Devolução', 'purple', 'undo-2', 7),
  ('Conferir', 'red', 'triangle-alert', 8)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------
alter table public.notas_fiscais
  add column if not exists marcadores uuid[] not null default '{}',
  add column if not exists observacao_interna text,
  add column if not exists finalidade text not null default 'normal',
  add column if not exists tipo_operacao text not null default 'saida',
  add column if not exists nota_referenciada_id uuid references public.notas_fiscais(id) on delete set null,
  add column if not exists nfe_recebida_id uuid references public.nfe_recebidas(id) on delete set null,
  add column if not exists chave_referenciada text,
  add column if not exists fornecedor_id uuid references public.fornecedores(id) on delete set null,
  add column if not exists devolucao_itens jsonb,
  add column if not exists estoque_lancado boolean not null default false,
  add column if not exists historico_envios jsonb not null default '[]',
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid,
  add column if not exists excluida_motivo text;
do $$ begin
  alter table public.notas_fiscais add constraint notas_fiscais_finalidade_check check (finalidade in ('normal', 'devolucao', 'complementar', 'ajuste'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.notas_fiscais add constraint notas_fiscais_tipo_operacao_check check (tipo_operacao in ('saida', 'entrada'));
exception when duplicate_object then null; end $$;
create index if not exists notas_fiscais_ref_idx on public.notas_fiscais (nota_referenciada_id) where nota_referenciada_id is not null;
create index if not exists notas_fiscais_recebida_idx on public.notas_fiscais (nfe_recebida_id) where nfe_recebida_id is not null;

alter table public.nfe_recebidas
  add column if not exists marcadores uuid[] not null default '{}',
  add column if not exists observacao_interna text,
  add column if not exists finalidade text not null default 'normal',
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid,
  add column if not exists excluida_motivo text;

-- Notas do Tiny já importadas: finalidade, entrada/saída e a nota referenciada, pelo XML guardado
update public.notas_fiscais n set
  finalidade = case substring(x.xml from '<finNFe>(\d)</finNFe>') when '4' then 'devolucao' when '2' then 'complementar' when '3' then 'ajuste' else 'normal' end,
  tipo_operacao = case substring(x.xml from '<tpNF>(\d)</tpNF>') when '0' then 'entrada' else 'saida' end,
  chave_referenciada = coalesce(n.chave_referenciada, substring(x.xml from '<refNFe>(\d{44})</refNFe>'))
from public.notas_fiscais_xml x
where x.nota_id = n.id and n.origem = 'importada' and n.finalidade = 'normal'
  and (substring(x.xml from '<finNFe>(\d)</finNFe>') <> '1' or substring(x.xml from '<tpNF>(\d)</tpNF>') = '0');

-- ---------------------------------------------------------------------
-- Excluída some das listas e de todo o ERP (fica guardada para consulta e restauração)
-- ---------------------------------------------------------------------
do $$ begin
  create policy "nao_excluida" on public.notas_fiscais as restrictive for select to authenticated using (excluida_em is null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "nao_excluida" on public.nfe_recebidas as restrictive for select to authenticated using (excluida_em is null);
exception when duplicate_object then null; end $$;

-- Histórico das ações nas notas (marcadores, observação, exclusão, restauração)
create or replace function public.trg_auditoria_nota()
returns trigger language plpgsql set search_path = public as $$
declare v_campos text[]; v_old jsonb := to_jsonb(old); v_new jsonb := to_jsonb(new);
  v_usuario boolean := current_user in ('authenticated', 'anon') or coalesce(current_setting('erp.acao_usuario', true), '') = 'on';
begin
  select array_agg(k order by k) into v_campos
    from unnest(array['marcadores', 'observacao_interna', 'excluida_em', 'excluida_motivo']) k
   where (v_new->k) is distinct from (v_old->k);
  if v_campos is null then return null; end if;
  perform public.registrar_auditoria(tg_table_name, new.id::text, 'update', v_campos,
    (select jsonb_object_agg(k, v_old->k) from unnest(v_campos) k), (select jsonb_object_agg(k, v_new->k) from unnest(v_campos) k),
    coalesce(new.excluida_motivo, case when old.excluida_em is not null and new.excluida_em is null then 'restaurada' end),
    case when v_usuario then 'usuario' else 'sistema' end);
  return null;
end $$;
do $$ begin
  create trigger zz_auditoria_nota after update on public.notas_fiscais for each row execute function public.trg_auditoria_nota();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger zz_auditoria_nota after update on public.nfe_recebidas for each row execute function public.trg_auditoria_nota();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Marcadores e observação interna
-- ---------------------------------------------------------------------
create or replace function public.marcar_notas(p_tabela text, p_ids uuid[], p_adicionar uuid[], p_remover uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('erp.acao_usuario', 'on', true);
  if p_tabela = 'notas_fiscais' then
    perform public.exigir_papel('vendas', 'financeiro');
    update notas_fiscais set marcadores = array(
        select distinct x from unnest(marcadores || coalesce(p_adicionar, '{}')) x where x <> all (coalesce(p_remover, '{}')))
     where id = any (p_ids) and excluida_em is null;
  elsif p_tabela = 'nfe_recebidas' then
    perform public.exigir_papel('financeiro');
    update nfe_recebidas set marcadores = array(
        select distinct x from unnest(marcadores || coalesce(p_adicionar, '{}')) x where x <> all (coalesce(p_remover, '{}')))
     where id = any (p_ids) and excluida_em is null;
  else
    raise exception 'tabela inválida';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.marcar_notas(text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.marcar_notas(text, uuid[], uuid[], uuid[]) to authenticated;

create or replace function public.anotar_nota(p_tabela text, p_id uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('erp.acao_usuario', 'on', true);
  if p_tabela = 'notas_fiscais' then
    perform public.exigir_papel('vendas', 'financeiro');
    update notas_fiscais set observacao_interna = nullif(btrim(p_texto), '') where id = p_id and excluida_em is null;
  elsif p_tabela = 'nfe_recebidas' then
    perform public.exigir_papel('financeiro');
    update nfe_recebidas set observacao_interna = nullif(btrim(p_texto), '') where id = p_id and excluida_em is null;
  else
    raise exception 'tabela inválida';
  end if;
end $$;
revoke execute on function public.anotar_nota(text, uuid, text) from public, anon;
grant execute on function public.anotar_nota(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Excluir / restaurar
-- ---------------------------------------------------------------------
create or replace function public.excluir_nota(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_motivo text := btrim(coalesce(p_motivo, '')); n notas_fiscais; r nfe_recebidas;
begin
  perform public.exigir_papel('financeiro');
  if length(v_motivo) < 5 then raise exception 'informe o motivo da exclusão (mínimo 5 letras)'; end if;
  perform set_config('erp.acao_usuario', 'on', true);
  if p_tabela = 'notas_fiscais' then
    select * into n from notas_fiscais where id = p_id for update;
    if not found or n.excluida_em is not null then raise exception 'nota não encontrada'; end if;
    if n.status in ('processando', 'contingencia') then
      raise exception 'a nota ainda está sendo processada na SEFAZ: atualize a situação antes de excluir';
    end if;
    if not (n.status = 'erro' or n.ambiente = 'homologacao' or n.origem = 'importada') then
      raise exception 'só dá para excluir nota rejeitada, de teste ou importada. Nota autorizada se cancela (até 24 h) ou se corrige com NF de devolução';
    end if;
    if n.estoque_lancado then raise exception 'esta devolução já movimentou o estoque: cancele a nota em vez de excluir'; end if;
    update notas_fiscais set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = v_motivo where id = p_id;
  elsif p_tabela = 'nfe_recebidas' then
    select * into r from nfe_recebidas where id = p_id for update;
    if not found or r.excluida_em is not null then raise exception 'nota não encontrada'; end if;
    if r.estoque_lancado then raise exception 'a entrada desta nota já foi lançada no estoque: estorne a entrada antes de excluir'; end if;
    if exists (select 1 from contas_pagar where nfe_recebida_id = p_id and status <> 'cancelado') then
      raise exception 'a nota tem contas a pagar lançadas: cancele as contas (com motivo) antes de excluir';
    end if;
    update nfe_recebidas set excluida_em = now(), excluida_por = auth.uid(), excluida_motivo = v_motivo,
           conta_pagar_id = null where id = p_id;
  else
    raise exception 'tabela inválida';
  end if;
end $$;
revoke execute on function public.excluir_nota(text, uuid, text) from public, anon;
grant execute on function public.excluir_nota(text, uuid, text) to authenticated;

create or replace function public.restaurar_nota(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  perform set_config('erp.acao_usuario', 'on', true);
  if p_tabela = 'notas_fiscais' then
    update notas_fiscais set excluida_em = null, excluida_por = null, excluida_motivo = null where id = p_id;
  elsif p_tabela = 'nfe_recebidas' then
    update nfe_recebidas set excluida_em = null, excluida_por = null, excluida_motivo = null where id = p_id;
  else
    raise exception 'tabela inválida';
  end if;
end $$;
revoke execute on function public.restaurar_nota(text, uuid) from public, anon;
grant execute on function public.restaurar_nota(text, uuid) to authenticated;

-- Lista das excluídas (para consulta e restauração)
create or replace function public.notas_excluidas(p_tabela text)
returns table (id uuid, numero text, chave text, nome text, valor numeric, status text, emissao timestamptz,
               excluida_em timestamptz, excluida_motivo text, excluida_por text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  if p_tabela = 'notas_fiscais' then
    return query select n.id, n.numero, n.chave, coalesce(n.destinatario_nome, c.nome), n.valor_total, n.status, n.created_at,
                        n.excluida_em, n.excluida_motivo, u.nome
      from notas_fiscais n left join pedidos p on p.id = n.pedido_id left join clientes c on c.id = p.cliente_id
      left join usuarios_erp u on u.user_id = n.excluida_por
     where n.excluida_em is not null order by n.excluida_em desc;
  else
    return query select r.id, ltrim(substr(r.chave, 26, 9), '0'), r.chave, r.emitente_nome, r.valor_total, r.situacao, r.data_emissao,
                        r.excluida_em, r.excluida_motivo, u.nome
      from nfe_recebidas r left join usuarios_erp u on u.user_id = r.excluida_por
     where r.excluida_em is not null order by r.excluida_em desc;
  end if;
end $$;
revoke execute on function public.notas_excluidas(text) from public, anon;
grant execute on function public.notas_excluidas(text) to authenticated;

-- ---------------------------------------------------------------------
-- Estoque da NF de devolução (chamado pela Edge Function quando a nota é
-- autorizada; p_estornar quando a devolução é cancelada)
-- devolucao_itens: [{ numero, produto_id, quantidade, quantidade_estoque }]
-- ---------------------------------------------------------------------
create or replace function public.estoque_devolucao(p_nota uuid, p_estornar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n notas_fiscais; i jsonb; v_tipo text; v_q numeric; k int := 0;
begin
  select * into n from notas_fiscais where id = p_nota for update;
  if not found or n.finalidade <> 'devolucao' or n.devolucao_itens is null or n.ambiente = 'homologacao' then return 0; end if;
  if n.estoque_lancado = (not p_estornar) then return 0; end if;
  -- devolução de venda (entrada) põe no estoque; devolução de compra (saída) tira. Estorno faz o contrário.
  v_tipo := case when (n.tipo_operacao = 'entrada') <> p_estornar then 'entrada' else 'saida' end;
  for i in select * from jsonb_array_elements(n.devolucao_itens) loop
    v_q := coalesce(nullif(i->>'quantidade_estoque', '')::numeric, 0);
    if nullif(i->>'produto_id', '') is null or v_q <= 0 then continue; end if;
    insert into estoque_movimentos (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, unidade_id)
    values ((i->>'produto_id')::uuid, v_tipo, v_q,
            case when p_estornar then 'Cancelamento da ' else '' end || 'NF de devolução ' || coalesce(n.numero, '') ||
            case when n.tipo_operacao = 'entrada' then ' (devolução de venda)' else ' (devolução de compra)' end,
            'nfe_devolucao', n.id, n.unidade_id);
    k := k + 1;
  end loop;
  update notas_fiscais set estoque_lancado = not p_estornar where id = p_nota;
  return k;
end $$;
revoke execute on function public.estoque_devolucao(uuid, boolean) from public, anon, authenticated;
grant execute on function public.estoque_devolucao(uuid, boolean) to service_role;
