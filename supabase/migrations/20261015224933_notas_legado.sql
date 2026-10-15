-- Notas fiscais da My Frost (empresa anterior), da aba NFes do backup do Tiny: número, data, tipo (natureza da operação)
-- e o valor da nota, que é o valor oficial de cada venda. Serve para a equipe saber por quanto o cliente comprou a
-- máquina. Fica separado das vendas da MF (não entra em totais, DRE nem relatórios) e só entra para quem já é cliente
-- do ERP, achado pelo CPF/CNPJ (vários documentos possíveis: só entra se todos levam ao mesmo cliente).
-- Importar de novo não duplica (a chave é o número da nota). Somente acréscimos.

create table if not exists public.notas_legado (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'My Frost',
  numero text not null check (numero ~ '^\d{1,12}$'),
  data date,
  valor numeric(14,2),
  natureza text check (natureza is null or length(natureza) <= 120),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists notas_legado_numero on public.notas_legado (origem, numero);
create index if not exists notas_legado_cliente on public.notas_legado (cliente_id, data);
alter table public.notas_legado enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notas_legado' and policyname = 'notas_legado_ler') then
    create policy notas_legado_ler on public.notas_legado for select to authenticated using (public.is_erp_user());
  end if;
end $$;
-- gravação só pela importação
revoke all on public.notas_legado from anon;
revoke insert, update, delete on public.notas_legado from authenticated;
grant select on public.notas_legado to authenticated;

-- p_notas: [{ numero, data (aaaa-mm-dd), valor, natureza, docs: [CPF/CNPJ possíveis do destinatário] }]
create or replace function public.importar_notas_legado(p_notas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n jsonb; v_num text; v_docs text[]; v_qtd int; v_cli uuid; v_ins boolean;
  v_novas int := 0; v_atualizadas int := 0; v_sem_cliente int := 0; v_ambiguas int := 0; v_erros jsonb := '[]'::jsonb;
begin
  if not public.is_erp_admin() then raise exception 'só o administrador importa as notas da My Frost'; end if;
  if jsonb_typeof(p_notas) is distinct from 'array' or jsonb_array_length(p_notas) not between 1 and 1000 then
    raise exception 'envie de 1 a 1000 notas por vez';
  end if;

  for n in select * from jsonb_array_elements(p_notas) loop
    begin
      v_num := nullif(ltrim(regexp_replace(coalesce(n->>'numero', ''), '\D', '', 'g'), '0'), '');
      if v_num is null or length(v_num) > 12 then raise exception 'nota sem número'; end if;

      select array_agg(distinct d) into v_docs
        from (select regexp_replace(x, '\D', '', 'g') as d
                from jsonb_array_elements_text(case when jsonb_typeof(n->'docs') = 'array' then n->'docs' else '[]'::jsonb end) as x) s
       where length(d) in (11, 14);

      -- o cliente: pelo CPF/CNPJ; unificado vale o que ficou; documentos de clientes diferentes = não entra
      v_cli := null; v_qtd := 0;
      if v_docs is not null then
        select count(distinct coalesce(unificado_em, id)), (array_agg(distinct coalesce(unificado_em, id)))[1]
          into v_qtd, v_cli
          from clientes where cpf_cnpj = any (v_docs);
      end if;
      if v_qtd > 1 then v_ambiguas := v_ambiguas + 1; continue; end if;
      if v_cli is null then v_sem_cliente := v_sem_cliente + 1; continue; end if;

      insert into notas_legado as t (numero, data, valor, natureza, cliente_id)
      values (v_num,
              case when coalesce(n->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' then (n->>'data')::date end,
              case when jsonb_typeof(n->'valor') = 'number' then round((n->>'valor')::numeric, 2) end,
              nullif(left(btrim(coalesce(n->>'natureza', '')), 120), ''),
              v_cli)
      on conflict (origem, numero) do update set
        data = coalesce(excluded.data, t.data), valor = coalesce(excluded.valor, t.valor), natureza = coalesce(excluded.natureza, t.natureza),
        cliente_id = excluded.cliente_id, updated_at = now()
      returning (xmax = 0) into v_ins;
      if v_ins then v_novas := v_novas + 1; else v_atualizadas := v_atualizadas + 1; end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('nota', left(coalesce(n->>'numero', '?'), 20), 'erro', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('novas', v_novas, 'atualizadas', v_atualizadas, 'sem_cliente', v_sem_cliente,
                            'ambiguas', v_ambiguas, 'erros', v_erros);
end $$;
revoke execute on function public.importar_notas_legado(jsonb) from public, anon;
grant execute on function public.importar_notas_legado(jsonb) to authenticated;
