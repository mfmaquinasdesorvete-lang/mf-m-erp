-- =====================================================================
-- Fretes: regras que evitam os problemas de sempre
--   * cotação só com a carga completa (medidas e peso de todos os volumes, da carga embalada)
--   * cotação com adicionais (TDE, TRT, agendamento, pedágio, GRIS, ad valorem, outros),
--     tipo de serviço (econômico, padrão, expresso, dedicado) e versão da tabela comercial
--   * cotação vencida não se aprova; mais cara que a mais barata válida só com justificativa
--   * adicional depois da aprovação e troca de transportadora só com justificativa (quem e quando)
--   * entregue só com comprovante (data ou anexo) ou com o motivo de não ter
--   * frete final conciliado com o aprovado (divergente exige conferência) e lançado no contas a pagar
--   * ocorrência resolvida só com a resolução escrita
-- Só acrescenta e pode rodar de novo: nada é apagado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------
-- condições comerciais
alter table public.envios add column if not exists valor_cobrado_cliente numeric(12,2) check (valor_cobrado_cliente >= 0);
-- decisão (vem da cotação aprovada)
alter table public.envios add column if not exists tipo_servico text check (tipo_servico in ('economico', 'padrao', 'expresso', 'dedicado'));
alter table public.envios add column if not exists tabela_versao text;
alter table public.envios add column if not exists valor_cotado numeric(12,2);
alter table public.envios add column if not exists cotacao_aprovada_id uuid references public.envio_cotacoes(id);
alter table public.envios add column if not exists justificativa_escolha text;
-- entrega sem comprovante: o motivo, quem e quando
alter table public.envios add column if not exists sem_comprovante_motivo text;
alter table public.envios add column if not exists sem_comprovante_por uuid;
alter table public.envios add column if not exists sem_comprovante_em timestamptz;
-- conferência do frete final (quando diverge do aprovado)
alter table public.envios add column if not exists conferencia_obs text;
alter table public.envios add column if not exists conferido_por uuid;
alter table public.envios add column if not exists conferido_em timestamptz;
-- frete pago: a conta a pagar lançada
alter table public.envios add column if not exists conta_pagar_id uuid references public.contas_pagar(id);
-- justificativa de uma alteração (ex.: troca de transportadora): o gatilho grava em envio_excecoes e limpa
alter table public.envios add column if not exists motivo_excecao text;

-- cotação: adicionais [{ tipo, valor, descricao?, previsto?, justificativa?, por?, em? }], total, serviço e tabela
alter table public.envio_cotacoes add column if not exists adicionais jsonb not null default '[]';
alter table public.envio_cotacoes add column if not exists valor_total numeric(12,2);
alter table public.envio_cotacoes add column if not exists tipo_servico text not null default 'padrao'
  check (tipo_servico in ('economico', 'padrao', 'expresso', 'dedicado'));
alter table public.envio_cotacoes add column if not exists tabela_versao text;

-- ocorrência: como foi resolvida e por quem
alter table public.envio_ocorrencias add column if not exists resolucao text;
alter table public.envio_ocorrencias add column if not exists resolvida_por uuid;

create index if not exists envios_conta_pagar on public.envios (conta_pagar_id) where conta_pagar_id is not null;

-- ---------------------------------------------------------------------
-- Exceções do envio: cada decisão fora da regra, com a justificativa, quem e quando
-- (não se altera nem se apaga)
-- ---------------------------------------------------------------------
create table if not exists public.envio_excecoes (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null references public.envios(id),   -- o registro fica: envio com exceção não se apaga
  tipo text not null check (tipo in ('cotacao_mais_cara', 'adicional_nao_previsto', 'troca_transportadora', 'conferencia_frete', 'sem_comprovante')),
  justificativa text not null check (length(btrim(justificativa)) >= 5),
  detalhe text,
  valor numeric(12,2),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists envio_excecoes_envio on public.envio_excecoes (envio_id);

do $$
begin
  alter table public.envio_excecoes enable row level security;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_excecoes' and policyname = 'erp_select') then
    create policy "erp_select" on public.envio_excecoes for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_excecoes' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.envio_excecoes for insert to authenticated
      with check (public.tem_papel('vendas', 'financeiro') and created_by = auth.uid());
  end if;
end $$;
grant select, insert on public.envio_excecoes to authenticated;

-- ---------------------------------------------------------------------
-- Dados que já existem: total da cotação e a cotação aprovada de cada envio
-- (antes dos gatilhos novos; na segunda vez não acha nada para mudar)
-- ---------------------------------------------------------------------
update public.envio_cotacoes set valor_total = valor where valor_total is null;
update public.envios e set cotacao_aprovada_id = c.id
  from public.envio_cotacoes c
 where c.envio_id = e.id and c.escolhida and c.ativa and e.cotacao_aprovada_id is null and e.aprovado_em is not null;
update public.envios set valor_cotado = valor_aprovado
 where valor_cotado is null and valor_aprovado is not null and aprovado_em is not null;

-- ---------------------------------------------------------------------
-- Regras puras (as mesmas da tela, em src/lib/fretes.ts)
-- ---------------------------------------------------------------------
-- Carga comparável: ao menos um volume e todos com largura, altura, comprimento e peso
create or replace function public.envio_volumes_completos(p_volumes jsonb)
returns boolean language plpgsql immutable as $$
declare v jsonb; n int := 0;
begin
  if p_volumes is null or jsonb_typeof(p_volumes) <> 'array' then return false; end if;
  for v in select * from jsonb_array_elements(p_volumes) loop
    if coalesce(nullif(v->>'quantidade', '')::numeric, 1) <= 0 then continue; end if;
    n := n + 1;
    if coalesce(nullif(v->>'largura_cm', '')::numeric, 0) <= 0 or coalesce(nullif(v->>'altura_cm', '')::numeric, 0) <= 0
       or coalesce(nullif(v->>'comprimento_cm', '')::numeric, 0) <= 0 or coalesce(nullif(v->>'peso_kg', '')::numeric, 0) <= 0 then
      return false;
    end if;
  end loop;
  return n > 0;
exception when others then
  return false;
end $$;

-- Frete final divergente do aprovado: diferença acima de R$ 1,00 ou de 2%
create or replace function public.frete_divergente(p_aprovado numeric, p_final numeric)
returns boolean language sql immutable as $$
  select p_aprovado is not null and p_final is not null
     and (abs(round(p_final - p_aprovado, 2)) > 1.00
          or (p_aprovado > 0 and abs(p_final - p_aprovado) / p_aprovado > 0.02))
$$;

-- R$ 1.180,00 (sem depender do idioma do servidor)
create or replace function public.texto_brl(p numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- Comprovante anexado ao envio (Anexos: entidade "geral" com o id do envio)
create or replace function public.envio_tem_anexo(p_envio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from documentos where entidade = 'geral' and entidade_id = p_envio)
$$;

create or replace function public.nome_transportadora(p_id uuid, p_nome text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nome from transportadoras where id = p_id), nullif(btrim(p_nome), ''), 'sem transportadora')
$$;

-- ---------------------------------------------------------------------
-- Cotação: adicionais válidos, total, carga completa e validade; a aprovada não muda por fora
-- (alteração direta pela API = current_user authenticated; as rotinas do ERP rodam como dono)
-- ---------------------------------------------------------------------
create or replace function public.trg_envio_cotacao_regras()
returns trigger language plpgsql set search_path = public as $$
declare
  v_direto boolean := current_user in ('authenticated', 'anon');
  v_vol jsonb; a jsonb; v_soma numeric := 0;
begin
  if new.adicionais is null or jsonb_typeof(new.adicionais) <> 'array' then new.adicionais := '[]'::jsonb; end if;
  for a in select * from jsonb_array_elements(new.adicionais) loop
    if coalesce(a->>'tipo', '') not in ('tde', 'trt', 'agendamento', 'pedagio', 'gris', 'ad_valorem', 'outro') then
      raise exception 'adicional inválido: use TDE, TRT, agendamento, pedágio, GRIS, ad valorem ou outro';
    end if;
    if (a->>'valor') is null or (a->>'valor')::numeric < 0 then
      raise exception 'informe o valor de cada adicional';
    end if;
    v_soma := v_soma + (a->>'valor')::numeric;
  end loop;
  new.valor_total := round(new.valor + v_soma, 2);
  new.tabela_versao := nullif(btrim(new.tabela_versao), '');

  if tg_op = 'INSERT' then
    select volumes into v_vol from envios where id = new.envio_id;
    if not public.envio_volumes_completos(v_vol) then
      raise exception 'cotação sem medidas não é comparável: preencha largura, altura, comprimento e peso de todos os volumes (carga embalada) e salve o envio';
    end if;
    if new.validade is null then
      raise exception 'informe até quando a cotação vale (validade)';
    end if;
    if v_direto then new.escolhida := false; end if;       -- a escolha é pelo botão Aprovar
  elsif v_direto then
    if new.escolhida is distinct from old.escolhida then
      raise exception 'a cotação é escolhida pelo botão Aprovar';
    end if;
    if old.escolhida and (new.valor, new.adicionais, new.tipo_servico, new.tabela_versao, new.validade, new.transportadora_id, new.transportadora_nome, new.envio_id)
       is distinct from (old.valor, old.adicionais, old.tipo_servico, old.tabela_versao, old.validade, old.transportadora_id, old.transportadora_nome, old.envio_id) then
      raise exception 'a cotação aprovada não muda: para um adicional que não estava previsto, use "Adicional não previsto" (com justificativa)';
    end if;
    if old.escolhida and old.ativa and not new.ativa then
      raise exception 'a cotação aprovada não sai da lista: aprove outra antes';
    end if;
  end if;
  return new;
end $$;
create or replace trigger trg_envio_cotacao_regras
before insert or update on public.envio_cotacoes
for each row execute function public.trg_envio_cotacao_regras();

-- ---------------------------------------------------------------------
-- Envio: decisão protegida, troca de transportadora com justificativa, prova de entrega,
-- motivo sem comprovante e conferência do frete (com quem e quando).
-- Roda depois de trg_envio_calculos (ordem alfabética), que já acertou o status.
-- ---------------------------------------------------------------------
create or replace function public.trg_envio_regras()
returns trigger language plpgsql set search_path = public as $$
declare
  v_direto boolean := current_user in ('authenticated', 'anon');
  v_motivo text := nullif(btrim(coalesce(new.motivo_excecao, '')), '');
  v_motivo_antes text; v_conf_antes text; v_prova_antes boolean := false;
begin
  new.sem_comprovante_motivo := nullif(btrim(new.sem_comprovante_motivo), '');
  new.conferencia_obs := nullif(btrim(new.conferencia_obs), '');

  if tg_op = 'INSERT' then
    -- decisão e fechamento só pelas rotinas (Aprovar, Adicional não previsto, Lançar no contas a pagar)
    if v_direto then
      new.valor_aprovado := null; new.valor_cotado := null; new.aprovado_em := null; new.aprovado_por := null;
      new.cotacao_aprovada_id := null; new.justificativa_escolha := null; new.conta_pagar_id := null;
    end if;
    -- valor cobrado do cliente: o frete do pedido
    if new.valor_cobrado_cliente is null and new.pedido_id is not null then
      select frete into new.valor_cobrado_cliente from pedidos where id = new.pedido_id;
    end if;
  else
    if v_direto and (new.valor_aprovado, new.valor_cotado, new.aprovado_em, new.aprovado_por, new.cotacao_aprovada_id, new.justificativa_escolha, new.conta_pagar_id)
       is distinct from (old.valor_aprovado, old.valor_cotado, old.aprovado_em, old.aprovado_por, old.cotacao_aprovada_id, old.justificativa_escolha, old.conta_pagar_id) then
      raise exception 'o frete aprovado e a conta a pagar mudam só pelos botões (Aprovar, Adicional não previsto, Lançar no contas a pagar)';
    end if;
    -- trocar a transportadora depois da aprovação exige justificativa
    if v_direto and old.aprovado_em is not null and new.status <> 'cancelado'
       and (new.transportadora_id is distinct from old.transportadora_id
            or (new.transportadora_id is null and coalesce(btrim(new.transportadora_nome), '') is distinct from coalesce(btrim(old.transportadora_nome), ''))) then
      if v_motivo is null or length(v_motivo) < 5 then
        raise exception 'o frete já foi aprovado com %: informe a justificativa da troca de transportadora',
          public.nome_transportadora(old.transportadora_id, old.transportadora_nome);
      end if;
      insert into envio_excecoes (envio_id, tipo, justificativa, detalhe)
      values (new.id, 'troca_transportadora', v_motivo,
              'De ' || public.nome_transportadora(old.transportadora_id, old.transportadora_nome)
              || ' para ' || public.nome_transportadora(new.transportadora_id, new.transportadora_nome));
    end if;
  end if;

  -- sem comprovante: o motivo, com quem e quando
  v_motivo_antes := case when tg_op = 'UPDATE' then nullif(btrim(old.sem_comprovante_motivo), '') end;
  if new.sem_comprovante_motivo is null then
    new.sem_comprovante_por := null; new.sem_comprovante_em := null;
  elsif new.sem_comprovante_motivo is distinct from v_motivo_antes then
    if length(new.sem_comprovante_motivo) < 5 then raise exception 'explique por que não há comprovante de entrega'; end if;
    new.sem_comprovante_por := auth.uid(); new.sem_comprovante_em := now();
    if tg_op = 'UPDATE' then
      insert into envio_excecoes (envio_id, tipo, justificativa) values (new.id, 'sem_comprovante', new.sem_comprovante_motivo);
    end if;
  else
    new.sem_comprovante_por := old.sem_comprovante_por; new.sem_comprovante_em := old.sem_comprovante_em;
  end if;

  -- não fecha sem prova de entrega: data do comprovante, anexo ou o motivo de não ter
  if new.status = 'entregue' and new.comprovante_em is null and new.sem_comprovante_motivo is null and not public.envio_tem_anexo(new.id) then
    if tg_op = 'UPDATE' then
      v_prova_antes := old.status = 'entregue' and (old.comprovante_em is not null or nullif(btrim(old.sem_comprovante_motivo), '') is not null);
    end if;
    if tg_op = 'INSERT' or old.status <> 'entregue' or v_prova_antes then
      raise exception 'para marcar como entregue, informe a data do comprovante, anexe o comprovante ou escreva por que não há comprovante';
    end if;
  end if;

  -- conferência do frete final: vale para os valores conferidos; mudou o valor, confere de novo
  v_conf_antes := case when tg_op = 'UPDATE' then nullif(btrim(old.conferencia_obs), '') end;
  if tg_op = 'UPDATE' and new.conferencia_obs is not distinct from v_conf_antes
     and (new.valor_final is distinct from old.valor_final or new.valor_aprovado is distinct from old.valor_aprovado) then
    new.conferencia_obs := null;
  end if;
  if new.conferencia_obs is null then
    new.conferido_por := null; new.conferido_em := null;
  elsif new.conferencia_obs is distinct from v_conf_antes then
    if new.valor_final is null then raise exception 'informe o frete final faturado antes de registrar a conferência'; end if;
    if length(new.conferencia_obs) < 5 then raise exception 'escreva o que foi conferido no frete final'; end if;
    new.conferido_por := auth.uid(); new.conferido_em := now();
    if tg_op = 'UPDATE' then
      insert into envio_excecoes (envio_id, tipo, justificativa, detalhe, valor)
      values (new.id, 'conferencia_frete', new.conferencia_obs,
              'Aprovado ' || public.texto_brl(new.valor_aprovado) || ' · faturado ' || public.texto_brl(new.valor_final),
              round(new.valor_final - coalesce(new.valor_aprovado, 0), 2));
    end if;
  else
    new.conferido_por := old.conferido_por; new.conferido_em := old.conferido_em;
  end if;

  new.motivo_excecao := null;
  return new;
end $$;
create or replace trigger trg_envio_regras
before insert or update on public.envios
for each row execute function public.trg_envio_regras();

-- ---------------------------------------------------------------------
-- Ocorrência: resolvida só com a resolução escrita (e quem resolveu)
-- ---------------------------------------------------------------------
create or replace function public.trg_envio_ocorrencia_resolucao()
returns trigger language plpgsql set search_path = public as $$
begin
  new.resolucao := nullif(btrim(new.resolucao), '');
  new.responsavel := nullif(btrim(new.responsavel), '');
  if new.status = 'resolvida' then
    if tg_op = 'INSERT' or old.status <> 'resolvida' or (old.resolucao is not null and new.resolucao is null) then
      if new.resolucao is null or length(new.resolucao) < 3 then
        raise exception 'para marcar como resolvida, escreva como a ocorrência foi resolvida';
      end if;
      if tg_op = 'INSERT' or old.status <> 'resolvida' then new.resolvida_por := auth.uid(); end if;
    end if;
  else
    new.resolvida_por := null;
  end if;
  return new;
end $$;
create or replace trigger trg_envio_ocorrencia_resolucao
before insert or update on public.envio_ocorrencias
for each row execute function public.trg_envio_ocorrencia_resolucao();

-- ---------------------------------------------------------------------
-- Aprovar a cotação (com as regras): carga completa, cotação na validade, justificativa
-- se não for a mais barata válida ou se trocar a transportadora já aprovada
-- ---------------------------------------------------------------------
create or replace function public.aprovar_frete_envio(p_cotacao uuid, p_justificativa text default null, p_cobrar_cliente boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_c envio_cotacoes; v_e envios; v_min envio_cotacoes; v_ped pedidos;
  v_just text := nullif(btrim(coalesce(p_justificativa, '')), '');
  v_total numeric; v_mais_cara boolean; v_troca boolean;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into v_c from envio_cotacoes where id = p_cotacao and ativa;
  if not found then raise exception 'cotação não encontrada'; end if;
  select * into v_e from envios where id = v_c.envio_id for update;
  if v_e.status in ('entregue', 'cancelado') then
    raise exception 'este envio já foi %', case v_e.status when 'entregue' then 'entregue' else 'cancelado' end;
  end if;
  if v_c.escolhida and v_e.cotacao_aprovada_id = v_c.id then return; end if;   -- já é a aprovada
  if not public.envio_volumes_completos(v_e.volumes) then
    raise exception 'cotação sem medidas não é comparável: preencha largura, altura, comprimento e peso de todos os volumes (carga embalada)';
  end if;
  if v_c.validade is not null and v_c.validade < current_date then
    raise exception 'cotação vencida em %: peça a cotação de novo (a tabela pode ter mudado)', to_char(v_c.validade, 'DD/MM/YYYY');
  end if;
  v_total := coalesce(v_c.valor_total, v_c.valor);

  -- a mais barata entre as cotações válidas deste envio
  select * into v_min from envio_cotacoes
   where envio_id = v_c.envio_id and ativa and (validade is null or validade >= current_date)
   order by coalesce(valor_total, valor), created_at limit 1;
  v_mais_cara := v_total > coalesce(v_min.valor_total, v_min.valor) + 0.005;
  if v_mais_cara and (v_just is null or length(v_just) < 5) then
    raise exception 'esta não é a opção mais barata (% por %): informe a justificativa da escolha',
      public.nome_transportadora(v_min.transportadora_id, v_min.transportadora_nome), public.texto_brl(coalesce(v_min.valor_total, v_min.valor));
  end if;

  -- trocar a transportadora de um frete já aprovado
  v_troca := v_e.aprovado_em is not null
    and (v_c.transportadora_id is distinct from v_e.transportadora_id
         or (v_c.transportadora_id is null and coalesce(btrim(v_c.transportadora_nome), '') <> coalesce(btrim(v_e.transportadora_nome), '')));
  if v_troca and (v_just is null or length(v_just) < 5) then
    raise exception 'o frete já foi aprovado com %: informe a justificativa da troca de transportadora',
      public.nome_transportadora(v_e.transportadora_id, v_e.transportadora_nome);
  end if;

  if v_mais_cara then
    insert into envio_excecoes (envio_id, tipo, justificativa, detalhe, valor)
    values (v_e.id, 'cotacao_mais_cara', v_just,
            public.nome_transportadora(v_c.transportadora_id, v_c.transportadora_nome) || ' por ' || public.texto_brl(v_total)
            || '; a mais barata válida era ' || public.nome_transportadora(v_min.transportadora_id, v_min.transportadora_nome)
            || ' por ' || public.texto_brl(coalesce(v_min.valor_total, v_min.valor)),
            round(v_total - coalesce(v_min.valor_total, v_min.valor), 2));
  end if;
  if v_troca then
    insert into envio_excecoes (envio_id, tipo, justificativa, detalhe)
    values (v_e.id, 'troca_transportadora', v_just,
            'De ' || public.nome_transportadora(v_e.transportadora_id, v_e.transportadora_nome)
            || ' para ' || public.nome_transportadora(v_c.transportadora_id, v_c.transportadora_nome));
  end if;

  update envio_cotacoes set escolhida = (id = p_cotacao)
   where envio_id = v_c.envio_id and escolhida is distinct from (id = p_cotacao);
  update envios set
      transportadora_id = v_c.transportadora_id,
      transportadora_nome = case when v_c.transportadora_id is null then v_c.transportadora_nome end,
      valor_cotado = v_total, valor_aprovado = v_total, prazo_dias = v_c.prazo_dias,
      tipo_servico = v_c.tipo_servico, tabela_versao = v_c.tabela_versao, cotacao_aprovada_id = v_c.id,
      justificativa_escolha = case when v_mais_cara or v_troca then v_just end,
      aprovado_em = now(), aprovado_por = auth.uid(),
      status = case when status in ('cotacao', 'aprovacao') then 'coleta' else status end
   where id = v_c.envio_id;

  if v_e.pedido_id is not null and p_cobrar_cliente then
    select * into v_ped from pedidos where id = v_e.pedido_id;
    if v_ped.status = 'orcamento' then
      update pedidos set frete = v_total, modalidade_frete = 0 where id = v_e.pedido_id;
      update envios set valor_cobrado_cliente = v_total where id = v_c.envio_id;
    end if;
  end if;
end $$;

-- A aprovação antiga passa pelas mesmas regras
create or replace function public.aprovar_cotacao_envio(p_cotacao uuid, p_cobrar_cliente boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.aprovar_frete_envio(p_cotacao, null, p_cobrar_cliente);
end $$;

-- ---------------------------------------------------------------------
-- Adicional que não estava na cotação aprovada: só com justificativa (quem e quando);
-- entra na cotação aprovada (previsto = false) e soma no valor aprovado
-- ---------------------------------------------------------------------
create or replace function public.registrar_adicional_envio(p_envio uuid, p_tipo text, p_valor numeric, p_justificativa text, p_descricao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_e envios; v_cot uuid; v_just text := nullif(btrim(coalesce(p_justificativa, '')), '');
begin
  perform public.exigir_papel('vendas', 'financeiro');
  select * into v_e from envios where id = p_envio for update;
  if not found then raise exception 'envio não encontrado'; end if;
  if v_e.status = 'cancelado' then raise exception 'este envio foi cancelado'; end if;
  v_cot := coalesce(v_e.cotacao_aprovada_id,
    (select id from envio_cotacoes where envio_id = p_envio and escolhida and ativa order by created_at desc limit 1));
  if v_e.aprovado_em is null or v_cot is null then
    raise exception 'o frete ainda não foi aprovado: registre o adicional na própria cotação';
  end if;
  if coalesce(p_tipo, '') not in ('tde', 'trt', 'agendamento', 'pedagio', 'gris', 'ad_valorem', 'outro') then
    raise exception 'adicional inválido: use TDE, TRT, agendamento, pedágio, GRIS, ad valorem ou outro';
  end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'informe o valor do adicional'; end if;
  if v_just is null or length(v_just) < 5 then
    raise exception 'adicional fora da cotação aprovada só com justificativa (quem pediu e por quê)';
  end if;
  update envio_cotacoes
     set adicionais = coalesce(adicionais, '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'tipo', p_tipo, 'descricao', nullif(btrim(p_descricao), ''), 'valor', round(p_valor, 2), 'previsto', false,
           'justificativa', v_just, 'por', auth.uid(), 'em', now())))
   where id = v_cot;
  update envios set valor_aprovado = coalesce(valor_aprovado, 0) + round(p_valor, 2) where id = p_envio;
  insert into envio_excecoes (envio_id, tipo, justificativa, detalhe, valor)
  values (p_envio, 'adicional_nao_previsto', v_just,
          case p_tipo when 'tde' then 'TDE' when 'trt' then 'TRT' when 'agendamento' then 'Agendamento' when 'pedagio' then 'Pedágio'
                      when 'gris' then 'GRIS' when 'ad_valorem' then 'Ad valorem' else 'Outro' end
          || coalesce(' · ' || nullif(btrim(p_descricao), ''), ''),
          round(p_valor, 2));
end $$;

-- ---------------------------------------------------------------------
-- Frete pago: lança o frete final no contas a pagar (categoria frete) e liga ao envio
-- ---------------------------------------------------------------------
create or replace function public.lancar_frete_contas_pagar(p_envio uuid, p_vencimento date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_e envios; v_t transportadoras; v_forn uuid; v_id uuid; v_ped bigint;
begin
  perform public.exigir_papel('financeiro');
  select * into v_e from envios where id = p_envio for update;
  if not found then raise exception 'envio não encontrado'; end if;
  if v_e.status = 'cancelado' then raise exception 'este envio foi cancelado'; end if;
  if coalesce(v_e.valor_final, 0) <= 0 then
    raise exception 'informe o frete final faturado pela transportadora (valor do CT-e) antes de lançar';
  end if;
  if v_e.pagador <> 'empresa' then
    raise exception 'o frete deste envio é pago pelo %', case v_e.pagador when 'cliente' then 'cliente' else 'terceiro' end;
  end if;
  if v_e.conta_pagar_id is not null and exists (select 1 from contas_pagar where id = v_e.conta_pagar_id and status <> 'cancelado') then
    raise exception 'o frete deste envio já está no contas a pagar';
  end if;
  if public.frete_divergente(v_e.valor_aprovado, v_e.valor_final) and v_e.conferido_em is null then
    raise exception 'o frete final diverge do aprovado: registre a conferência antes de lançar';
  end if;
  select * into v_t from transportadoras where id = v_e.transportadora_id;
  if length(regexp_replace(coalesce(v_t.cnpj, ''), '\D', '', 'g')) >= 11 then
    select id into v_forn from fornecedores
     where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = regexp_replace(v_t.cnpj, '\D', '', 'g')
     order by created_at limit 1;
  end if;
  select numero into v_ped from pedidos where id = v_e.pedido_id;
  insert into contas_pagar (descricao, fornecedor_id, categoria, documento, valor, vencimento, unidade_id, rateio, observacoes)
  values ('Frete envio #' || v_e.numero || ' · ' || public.nome_transportadora(v_e.transportadora_id, v_e.transportadora_nome),
          v_forn, 'frete', nullif(btrim(v_e.cte_numero), ''), v_e.valor_final, coalesce(p_vencimento, current_date + 30), v_e.unidade_id,
          case when v_e.centro_custo_id is not null
               then jsonb_build_array(jsonb_build_object('centro_custo_id', v_e.centro_custo_id, 'percentual', 100)) else '[]'::jsonb end,
          'Gerado pelo ERP a partir do envio #' || v_e.numero || coalesce(' (pedido #' || v_ped || ')', ''))
  returning id into v_id;
  update envios set conta_pagar_id = v_id where id = p_envio;
  return v_id;
end $$;

revoke execute on function public.aprovar_frete_envio(uuid, text, boolean) from public, anon;
revoke execute on function public.registrar_adicional_envio(uuid, text, numeric, text, text) from public, anon;
revoke execute on function public.lancar_frete_contas_pagar(uuid, date) from public, anon;
revoke execute on function public.envio_tem_anexo(uuid) from public, anon;
revoke execute on function public.nome_transportadora(uuid, text) from public, anon;
grant execute on function public.aprovar_frete_envio(uuid, text, boolean) to authenticated;
grant execute on function public.registrar_adicional_envio(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.lancar_frete_contas_pagar(uuid, date) to authenticated;
grant execute on function public.envio_tem_anexo(uuid) to authenticated;
grant execute on function public.nome_transportadora(uuid, text) to authenticated;
grant execute on function public.envio_volumes_completos(jsonb) to authenticated;
grant execute on function public.frete_divergente(numeric, numeric) to authenticated;
grant execute on function public.texto_brl(numeric) to authenticated;
