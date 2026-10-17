-- CT-e e faturas de frete (Logística → Fretes e envios → CT-e e Faturas): os conhecimentos de transporte das
-- transportadoras (hoje pela planilha que a Expresso São Miguel deixa baixar; depois pela SEFAZ e por e-mail) com
-- remetente, destinatário, nota fiscal, frete, peso, previsão e entrega. Cada CT-e diz de que lado a MF está
-- (entrada = compra chegando, saída = venda indo, transferência SC↔SP) e se a MF paga o frete (FOB "à pagar" quando a
-- MF recebe; CIF "pago" quando a MF envia). Liga sozinho a nota de compra (pelo CNPJ do remetente e o número na chave)
-- e a nota de venda emitida. cte_faturas junta os CT-e que a transportadora cobra numa fatura e pode virar conta a pagar.
-- Nada é apagado: fatura errada fica cancelada; o CT-e importado de novo só atualiza a entrega.

create table if not exists public.cte_faturas (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid,
  transportadora_raiz text check (transportadora_raiz is null or transportadora_raiz ~ '^\d{8}$'),
  numero text not null check (length(btrim(numero)) between 1 and 40),
  emissao date,
  vencimento date not null,
  valor numeric(14,2) not null check (valor > 0),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  conta_pagar_id uuid,
  unidade_id uuid,
  observacao text check (observacao is null or length(observacao) <= 500),
  origem text not null default 'manual' check (origem in ('manual', 'planilha', 'email', 'edi')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists cte_faturas_numero on public.cte_faturas (coalesce(transportadora_raiz, ''), numero) where situacao <> 'cancelada';

create table if not exists public.ctes (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid,
  transportadora_raiz text check (transportadora_raiz is null or transportadora_raiz ~ '^\d{8}$'),
  numero text not null check (length(btrim(numero)) between 1 and 20),
  serie text,
  chave text check (chave is null or chave ~ '^\d{44}$'),
  tipo text not null default 'CT-e',
  emissao date not null,
  ag_origem text, ag_destino text,
  remetente_cnpj text, remetente_nome text,
  destinatario_cnpj text, destinatario_nome text,
  nf_numero text, nf_serie text, nf_valor numeric(14,2),
  frete text check (frete in ('pago', 'a_pagar')),
  peso_tipo text, peso numeric(14,4), volumes int,
  valor numeric(14,2) not null default 0,
  prev_entrega date,
  ocorrencia text,
  ocorrencia_em timestamptz,
  sentido text not null default 'outro' check (sentido in ('entrada', 'saida', 'transferencia', 'outro')),
  mf_paga boolean not null default false,
  unidade_id uuid,
  -- ligações sem chave estrangeira de propósito: nota excluída ou unificada depois não trava o CT-e
  nfe_recebida_id uuid,
  nota_fiscal_id uuid,
  fatura_id uuid references public.cte_faturas(id),
  origem text not null default 'planilha' check (origem in ('planilha', 'sefaz', 'email', 'manual')),
  arquivo text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists ctes_numero on public.ctes (coalesce(transportadora_raiz, ''), coalesce(ag_origem, ''), numero);
create unique index if not exists ctes_chave on public.ctes (chave) where chave is not null;
create index if not exists ctes_emissao on public.ctes (emissao desc);
create index if not exists ctes_fatura on public.ctes (fatura_id);

alter table public.ctes enable row level security;
alter table public.cte_faturas enable row level security;
revoke all on public.ctes, public.cte_faturas from anon, public;
grant select, insert, update on public.ctes, public.cte_faturas to authenticated;
create policy ctes_ler on public.ctes for select to authenticated using (public.tem_papel('financeiro', 'compras', 'expedicao', 'vendas', 'contador'));
create policy ctes_criar on public.ctes for insert to authenticated with check (public.tem_papel('financeiro', 'compras', 'expedicao'));
create policy ctes_mudar on public.ctes for update to authenticated using (public.tem_papel('financeiro', 'compras', 'expedicao')) with check (public.tem_papel('financeiro', 'compras', 'expedicao'));
create policy cte_faturas_ler on public.cte_faturas for select to authenticated using (public.tem_papel('financeiro', 'compras', 'expedicao', 'contador'));
create policy cte_faturas_criar on public.cte_faturas for insert to authenticated with check (public.tem_papel('financeiro'));
create policy cte_faturas_mudar on public.cte_faturas for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create trigger ctes_atualizado before update on public.ctes for each row execute function public.ecl_execucoes_atualizado();
create trigger cte_faturas_atualizado before update on public.cte_faturas for each row execute function public.ecl_execucoes_atualizado();
create trigger zz_auditoria before insert or update on public.cte_faturas for each row execute function public.trg_auditoria();

/** Só os dígitos do CNPJ/CPF. */
create or replace function public.so_digitos(p text) returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') $$;

/**
 * Importa CT-e da planilha da transportadora (linhas já lidas pela tela). Chave: raiz do CNPJ da transportadora +
 * agência de origem + número. CT-e que já existe só atualiza ocorrência, entrega e ligações (a fatura fica).
 * Devolve {novos, atualizados, ignorados}.
 */
create or replace function public.importar_ctes(p_transportadora uuid, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_raiz text; l jsonb; v_rem text; v_dest text; v_unid_rem uuid; v_unid_dest uuid; v_sentido text; v_paga boolean; v_unid uuid;
  v_frete text; v_nfe uuid; v_nota uuid; v_novo boolean; v_novos int := 0; v_atual int := 0; v_ign int := 0;
begin
  perform public.exigir_papel('financeiro', 'compras', 'expedicao');
  select left(public.so_digitos(cnpj), 8) into v_raiz from transportadoras where id = p_transportadora;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'linhas inválidas'; end if;
  if jsonb_array_length(p_linhas) > 2000 then raise exception 'no máximo 2000 CT-e por vez'; end if;

  for l in select * from jsonb_array_elements(p_linhas) loop
    if coalesce(btrim(l->>'numero'), '') = '' or (l->>'emissao') is null then v_ign := v_ign + 1; continue; end if;
    v_rem := public.so_digitos(l->>'remetente_cnpj');
    v_dest := public.so_digitos(l->>'destinatario_cnpj');
    select id into v_unid_rem from unidades where public.so_digitos(cnpj) = v_rem;
    select id into v_unid_dest from unidades where public.so_digitos(cnpj) = v_dest;
    v_sentido := case when v_unid_rem is not null and v_unid_dest is not null then 'transferencia'
                      when v_unid_dest is not null then 'entrada' when v_unid_rem is not null then 'saida' else 'outro' end;
    v_frete := case when l->>'frete' in ('pago', 'a_pagar') then l->>'frete' end;
    -- CIF ("pago"): paga quem envia; FOB ("à pagar"): paga quem recebe
    v_paga := (v_frete = 'pago' and v_unid_rem is not null) or (v_frete = 'a_pagar' and v_unid_dest is not null);
    v_unid := case when v_frete = 'pago' then coalesce(v_unid_rem, v_unid_dest) when v_frete = 'a_pagar' then coalesce(v_unid_dest, v_unid_rem)
                   else coalesce(v_unid_dest, v_unid_rem) end;
    v_nfe := null; v_nota := null;
    if v_unid_dest is not null and v_rem is not null and coalesce(l->>'nf_numero', '') <> '' then
      select id into v_nfe from nfe_recebidas
       where public.so_digitos(emitente_cnpj) = v_rem and ltrim(substr(chave, 26, 9), '0') = ltrim(l->>'nf_numero', '0')
       order by data_emissao desc nulls last limit 1;
    end if;
    if v_unid_rem is not null and coalesce(l->>'nf_numero', '') <> '' then
      select id into v_nota from notas_fiscais
       where unidade_id = v_unid_rem and ltrim(numero, '0') = ltrim(l->>'nf_numero', '0') and status = 'autorizada'
       order by created_at desc limit 1;
    end if;

    insert into ctes (transportadora_id, transportadora_raiz, numero, tipo, emissao, ag_origem, ag_destino, remetente_cnpj, remetente_nome,
                      destinatario_cnpj, destinatario_nome, nf_numero, nf_serie, nf_valor, frete, peso_tipo, peso, volumes, valor,
                      prev_entrega, ocorrencia, ocorrencia_em, sentido, mf_paga, unidade_id, nfe_recebida_id, nota_fiscal_id, origem, arquivo)
    values (p_transportadora, v_raiz, btrim(l->>'numero'), coalesce(nullif(btrim(l->>'tipo'), ''), 'CT-e'), (l->>'emissao')::date,
            nullif(btrim(l->>'ag_origem'), ''), nullif(btrim(l->>'ag_destino'), ''), v_rem, nullif(btrim(l->>'remetente_nome'), ''),
            v_dest, nullif(btrim(l->>'destinatario_nome'), ''), nullif(btrim(l->>'nf_numero'), ''), nullif(btrim(l->>'nf_serie'), ''),
            (l->>'nf_valor')::numeric, v_frete, nullif(btrim(l->>'peso_tipo'), ''), (l->>'peso')::numeric, (l->>'volumes')::int,
            coalesce((l->>'valor')::numeric, 0), (l->>'prev_entrega')::date, nullif(btrim(l->>'ocorrencia'), ''), (l->>'ocorrencia_em')::timestamptz,
            v_sentido, v_paga, v_unid, v_nfe, v_nota, 'planilha', p_arquivo)
    on conflict (coalesce(transportadora_raiz, ''), coalesce(ag_origem, ''), numero) do update
       set ocorrencia = excluded.ocorrencia, ocorrencia_em = excluded.ocorrencia_em, prev_entrega = excluded.prev_entrega,
           nfe_recebida_id = coalesce(ctes.nfe_recebida_id, excluded.nfe_recebida_id), nota_fiscal_id = coalesce(ctes.nota_fiscal_id, excluded.nota_fiscal_id),
           transportadora_id = coalesce(ctes.transportadora_id, excluded.transportadora_id)
    returning (xmax = 0) into v_novo;
    if v_novo then v_novos := v_novos + 1; else v_atual := v_atual + 1; end if;
  end loop;
  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'ignorados', v_ign);
end $$;
revoke execute on function public.importar_ctes(uuid, jsonb, text) from public, anon;
grant execute on function public.importar_ctes(uuid, jsonb, text) to authenticated;

/**
 * Fatura da transportadora com os CT-e que a MF paga (todos da mesma transportadora e ainda sem fatura). Valor vazio =
 * soma dos CT-e. Com p_lancar, cria a conta a pagar (categoria frete, fornecedor com a mesma raiz de CNPJ) — ela passa
 * pela aprovação como qualquer conta. Devolve o id da fatura.
 */
create or replace function public.criar_fatura_cte(p_ctes uuid[], p_numero text, p_vencimento date, p_valor numeric default null,
                                                   p_emissao date default null, p_lancar boolean default true)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_raiz text; v_transp uuid; v_soma numeric; v_qtd int; v_raizes int; v_unid uuid; v_forn uuid; v_nome text; v_fat uuid; v_conta uuid; v_valor numeric;
begin
  perform public.exigir_papel('financeiro');
  if coalesce(btrim(p_numero), '') = '' then raise exception 'informe o número da fatura'; end if;
  if p_vencimento is null then raise exception 'informe o vencimento'; end if;
  if coalesce(array_length(p_ctes, 1), 0) = 0 then raise exception 'escolha os CT-e da fatura'; end if;
  select count(*), sum(valor), min(transportadora_raiz), (array_agg(transportadora_id))[1], count(distinct coalesce(transportadora_raiz, ''))
    into v_qtd, v_soma, v_raiz, v_transp, v_raizes
    from ctes where id = any(p_ctes) and mf_paga and fatura_id is null;
  if v_qtd <> array_length(p_ctes, 1) then raise exception 'só entram CT-e pagos pela MF e ainda sem fatura'; end if;
  if v_raizes > 1 then raise exception 'os CT-e são de transportadoras diferentes'; end if;
  v_valor := coalesce(p_valor, v_soma);
  select unidade_id into v_unid from ctes where id = any(p_ctes) group by unidade_id order by count(*) desc limit 1;
  select nome into v_nome from transportadoras where id = v_transp;
  insert into cte_faturas (transportadora_id, transportadora_raiz, numero, emissao, vencimento, valor, unidade_id, origem)
  values (v_transp, v_raiz, btrim(p_numero), p_emissao, p_vencimento, v_valor, v_unid, 'manual') returning id into v_fat;
  update ctes set fatura_id = v_fat where id = any(p_ctes);
  if p_lancar then
    select id into v_forn from fornecedores where left(public.so_digitos(cnpj), 8) = v_raiz order by (right(public.so_digitos(cnpj), 6) like '0001%') desc limit 1;
    insert into contas_pagar (descricao, categoria, fornecedor_id, valor, vencimento, status, unidade_id, observacoes)
    values (format('Fatura de frete nº %s · %s (%s CT-e)', btrim(p_numero), coalesce(v_nome, 'transportadora'), v_qtd), 'frete', v_forn, v_valor,
            p_vencimento, 'aberto', v_unid, 'Lançada pela fatura de CT-e (Logística → Fretes e envios → Faturas)')
    returning id into v_conta;
    update cte_faturas set conta_pagar_id = v_conta where id = v_fat;
  end if;
  return v_fat;
end $$;
revoke execute on function public.criar_fatura_cte(uuid[], text, date, numeric, date, boolean) from public, anon;
grant execute on function public.criar_fatura_cte(uuid[], text, date, numeric, date, boolean) to authenticated;

/** Fatura cancelada: os CT-e voltam a ficar sem fatura (a conta a pagar, se houver, é cancelada na tela de contas). */
create or replace function public.cancelar_fatura_cte(p_fatura uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform public.exigir_papel('financeiro');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'informe o motivo'; end if;
  update cte_faturas set situacao = 'cancelada', observacao = left(concat_ws(' · ', observacao, 'Cancelada: ' || btrim(p_motivo)), 500)
   where id = p_fatura and situacao <> 'cancelada';
  if not found then raise exception 'fatura não encontrada ou já cancelada'; end if;
  update ctes set fatura_id = null where fatura_id = p_fatura;
end $$;
revoke execute on function public.cancelar_fatura_cte(uuid, text) from public, anon;
grant execute on function public.cancelar_fatura_cte(uuid, text) to authenticated;
