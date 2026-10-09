-- =====================================================================
-- Etiquetas de transporte e de volume editáveis.
--   etiquetas_envio: a versão ajustada à mão de cada pedido/envio/nota. Guarda os dados e QUAIS campos foram
--   editados: o resto continua vindo do ERP (rastreio e NF-e que chegam depois aparecem na próxima impressão).
--   configuracoes.etiqueta_modelo: o que aparece nas etiquetas, formatos, avisos padrão e rodapé.
-- =====================================================================
create table if not exists public.etiquetas_envio (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^(pedido|envio|nota):[0-9a-zA-Z-]{1,64}$'),
  pedido_id uuid references public.pedidos(id) on delete set null,
  envio_id uuid references public.envios(id) on delete set null,
  nota_fiscal_id uuid references public.notas_fiscais(id) on delete set null,
  dados jsonb not null default '{}' check (jsonb_typeof(dados) = 'object'),
  editados text[] not null default '{}',
  impressoes int not null default 0 check (impressoes >= 0),
  impressa_em timestamptz,
  atualizado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists etiquetas_envio_pedido on public.etiquetas_envio (pedido_id);
create index if not exists etiquetas_envio_envio on public.etiquetas_envio (envio_id);

alter table public.etiquetas_envio enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'etiquetas_envio' and policyname = 'erp_select') then
    create policy "erp_select" on public.etiquetas_envio for select to authenticated using (public.is_erp_user());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'etiquetas_envio' and policyname = 'erp_insert') then
    create policy "erp_insert" on public.etiquetas_envio for insert to authenticated with check (public.tem_papel('vendas', 'financeiro'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'etiquetas_envio' and policyname = 'erp_update') then
    create policy "erp_update" on public.etiquetas_envio for update to authenticated using (public.tem_papel('vendas', 'financeiro')) with check (public.tem_papel('vendas', 'financeiro'));
  end if;
end $$;
grant select, insert, update on public.etiquetas_envio to authenticated;

-- Quem e quando: sempre do servidor
create or replace function public.trg_etiqueta_envio()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  if tg_op = 'UPDATE' then
    new.chave := old.chave;
    new.created_at := old.created_at;
    -- contador de impressões só anda para frente
    if new.impressoes < old.impressoes then new.impressoes := old.impressoes; end if;
  end if;
  return new;
end $$;
create or replace trigger trg_etiqueta_envio
before insert or update on public.etiquetas_envio
for each row execute function public.trg_etiqueta_envio();

-- Modelo das etiquetas (o formato da de transporte continua em etiqueta_formato)
alter table public.configuracoes add column if not exists etiqueta_modelo jsonb not null default '{}';

-- Vendas e financeiro ajustam o modelo sem precisar de acesso a toda a configuração
create or replace function public.salvar_modelo_etiqueta(p_modelo jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_fmt text;
begin
  perform public.exigir_papel('vendas', 'financeiro');
  if p_modelo is null or jsonb_typeof(p_modelo) <> 'object' then raise exception 'modelo inválido'; end if;
  if length(p_modelo::text) > 4000 then raise exception 'modelo grande demais'; end if;
  v_fmt := p_modelo->>'formato_transporte';
  update configuracoes
     set etiqueta_modelo = p_modelo - 'formato_transporte',
         etiqueta_formato = case when v_fmt in ('10x15', 'a4') then v_fmt else etiqueta_formato end,
         updated_at = now()
   where id = 1;
end $$;
revoke execute on function public.salvar_modelo_etiqueta(jsonb) from public, anon;
grant execute on function public.salvar_modelo_etiqueta(jsonb) to authenticated;
