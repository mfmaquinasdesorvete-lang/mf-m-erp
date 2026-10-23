-- Entrada no estoque só quando a compra chega (pedido da usuária, 23/10, pelo IAD): a nota de compra que aparece na
-- SEFAZ fica "a caminho" e só entra no estoque quando a transportadora marca entregue (ocorrência do CT-e) ou quando
-- quem recebeu aperta "Chegou" na nota. Depois da entrada vem o aviso "Chegou a compra do fornecedor X. Conferiu?"
-- com "Tudo ok" / "Faltou ou veio errado". As contas a pagar continuam saindo quando a nota chega na SEFAZ.
-- Somente acréscimos: notas já lançadas não mudam.

alter table public.configuracoes add column if not exists entrada_so_na_entrega boolean not null default true;

alter table public.nfe_recebidas add column if not exists chegou_em timestamptz;
alter table public.nfe_recebidas add column if not exists chegou_por uuid;
alter table public.nfe_recebidas add column if not exists chegou_como text;     -- transportadora | recebido | entrada_manual
alter table public.nfe_recebidas add column if not exists conferencia text;     -- ok | divergencia
alter table public.nfe_recebidas add column if not exists conferencia_obs text;
alter table public.nfe_recebidas add column if not exists conferido_por uuid;
alter table public.nfe_recebidas add column if not exists conferido_em timestamptz;
do $$ begin
  alter table public.nfe_recebidas add constraint nfe_recebidas_chegou_como_check check (chegou_como in ('transportadora', 'recebido', 'entrada_manual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.nfe_recebidas add constraint nfe_recebidas_conferencia_check check (conferencia in ('ok', 'divergencia'));
exception when duplicate_object then null; end $$;

-- a_caminho: compra pronta para entrar no estoque, esperando a entrega
alter table public.nfe_recebidas drop constraint if exists nfe_recebidas_processamento_check;
alter table public.nfe_recebidas add constraint nfe_recebidas_processamento_check
  check (processamento in ('pendente', 'aguardando_xml', 'aguardando_vinculo', 'revisao', 'a_caminho', 'concluido', 'ignorada'));

-- Núcleo (sem checagem de usuário): marca a chegada e devolve a nota para a fila do processamento automático
-- (roda a cada 15 minutos; a tela chama o processamento na hora).
create or replace function public.nfe_marcar_chegada(p_nfe uuid, p_como text, p_por uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update nfe_recebidas
     set chegou_em = coalesce(chegou_em, now()), chegou_como = coalesce(chegou_como, p_como), chegou_por = coalesce(chegou_por, p_por),
         processamento = case when processamento = 'a_caminho' then 'pendente' else processamento end,
         tentativas = case when processamento = 'a_caminho' then 0 else tentativas end
   where id = p_nfe and chegou_em is null and excluida_em is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.nfe_marcar_chegada(uuid, text, uuid) from public, anon, authenticated;

-- botão "Chegou" na nota (quem recebe compras)
create or replace function public.marcar_chegada_compra(p_nfe uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_papel('financeiro', 'compras');
  return public.nfe_marcar_chegada(p_nfe, 'recebido', auth.uid());
end $$;
revoke execute on function public.marcar_chegada_compra(uuid) from public, anon;
grant execute on function public.marcar_chegada_compra(uuid) to authenticated;

-- CT-e da compra com ocorrência de entrega: as notas que ele leva chegaram
create or replace function public.trg_cte_entregue()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if coalesce(new.ocorrencia, '') ~* 'entreg' and new.ocorrencia !~* '(n[aã]o|sem|tentativa|saiu|rota|previs)'
     and (tg_op = 'INSERT' or old.ocorrencia is distinct from new.ocorrencia) then
    for v in select n.id from nfe_recebidas n
              where n.chegou_em is null and n.excluida_em is null
                and (n.id = new.nfe_recebida_id or n.chave = any(coalesce(new.nfe_chaves, '{}'))) loop
      perform public.nfe_marcar_chegada(v, 'transportadora');
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_cte_entregue on public.ctes;
create trigger trg_cte_entregue after insert or update of ocorrencia, nfe_recebida_id, nfe_chaves on public.ctes
for each row execute function public.trg_cte_entregue();

-- Entrada no estoque: guarda a chegada (entrada à mão = chegou) e avisa quem recebe para conferir
create or replace function public.trg_nfe_chegou_conferir()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estoque_lancado and not old.estoque_lancado then
    if new.chegou_em is null then
      new.chegou_em := now(); new.chegou_como := 'entrada_manual'; new.chegou_por := auth.uid();
    end if;
    if new.transferencia_id is null and new.conferencia is null then
      perform public.notificar('outro', 'Chegou a compra de ' || coalesce(new.emitente_nome, 'fornecedor') || '. Conferiu?',
        concat_ws(' · ', 'NF ' || nullif(ltrim(substr(new.chave, 26, 9), '0'), ''), public.brl(new.valor_total),
          'Abra a nota e marque "Tudo ok" ou "Faltou ou veio errado"'),
        '/notas?aba=recebidas', '{financeiro,compras}', new.unidade_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_nfe_chegou_conferir on public.nfe_recebidas;
create trigger trg_nfe_chegou_conferir before update of estoque_lancado on public.nfe_recebidas
for each row execute function public.trg_nfe_chegou_conferir();

-- "Tudo ok" / "Faltou ou veio errado"
create or replace function public.conferir_compra_recebida(p_nfe uuid, p_ok boolean, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n nfe_recebidas;
begin
  perform public.exigir_papel('financeiro', 'compras');
  select * into n from nfe_recebidas where id = p_nfe and excluida_em is null;
  if not found then raise exception 'Nota não encontrada'; end if;
  if not n.estoque_lancado then raise exception 'A compra ainda não deu entrada no estoque'; end if;
  if not p_ok and coalesce(trim(p_obs), '') = '' then raise exception 'Escreva o que faltou ou veio errado'; end if;
  update nfe_recebidas
     set conferencia = case when p_ok then 'ok' else 'divergencia' end, conferencia_obs = nullif(left(trim(coalesce(p_obs, '')), 1000), ''),
         conferido_por = auth.uid(), conferido_em = now()
   where id = p_nfe;
  if not p_ok then
    perform public.notificar('outro', 'Compra com problema: ' || coalesce(n.emitente_nome, 'fornecedor'),
      left(trim(p_obs), 300), '/notas?aba=recebidas', '{financeiro,compras}', n.unidade_id);
  end if;
end $$;
revoke execute on function public.conferir_compra_recebida(uuid, boolean, text) from public, anon;
grant execute on function public.conferir_compra_recebida(uuid, boolean, text) to authenticated;
