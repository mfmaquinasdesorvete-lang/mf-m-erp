-- =====================================================================
-- NF-e emitidas em outro sistema (ex.: Tiny) importadas pelo XML e
-- notas de fornecedor antigas fora do lançamento automático.
--   * notas_fiscais.origem: 'erp' (emitida aqui) ou 'importada' (XML do sistema anterior).
--     A importada não avisa equipe nem cliente, não mexe em estoque nem financeiro.
--   * notas_fiscais_xml: XML guardado das importadas (vai no pacote do contador).
--   * configuracoes.recebidas_processar_desde: nota de fornecedor emitida antes desta data
--     já foi lançada no sistema anterior; não entra sozinha no estoque e no contas a pagar.
-- Idempotente: pode rodar de novo sem erro.
-- =====================================================================

alter table public.notas_fiscais
  add column if not exists origem text not null default 'erp',
  add column if not exists destinatario_nome text,
  add column if not exists destinatario_doc text,
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

do $$ begin
  alter table public.notas_fiscais add constraint notas_fiscais_origem_check check (origem in ('erp', 'importada'));
exception when duplicate_object then null; end $$;

create unique index if not exists notas_fiscais_chave_key on public.notas_fiscais (chave) where chave is not null;
create index if not exists notas_fiscais_cliente_id_idx on public.notas_fiscais (cliente_id);

create table if not exists public.notas_fiscais_xml (
  nota_id uuid primary key references public.notas_fiscais(id) on delete cascade,
  xml text not null,
  xml_cancelamento text,
  created_at timestamptz not null default now()
);
alter table public.notas_fiscais_xml enable row level security;
drop policy if exists erp_select on public.notas_fiscais_xml;
create policy erp_select on public.notas_fiscais_xml for select using (public.tem_papel(variadic array['vendas', 'financeiro']));
drop policy if exists contador_select on public.notas_fiscais_xml;
create policy contador_select on public.notas_fiscais_xml for select using (public.e_contador());

alter table public.configuracoes
  add column if not exists recebidas_processar_desde date default current_date;

-- Nota importada não gera aviso (já foi entregue ao cliente pelo sistema anterior)
create or replace function public.trg_aviso_nota()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p record;
begin
  if new.origem = 'importada' then return null; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  select pe.numero, pe.cliente_id, c.nome as cliente into p
    from public.pedidos pe join public.clientes c on c.id = pe.cliente_id where pe.id = new.pedido_id;
  if new.status = 'autorizada' then
    perform public.avisar_equipe('nfe_autorizada', 'nfe-ok:' || new.id,
      jsonb_build_object('numero', new.numero, 'pedido', p.numero, 'cliente', p.cliente, 'valor', new.valor_total));
    perform public.avisar_cliente('cli_nfe', p.cliente_id, 'nfe:' || new.id,
      jsonb_build_object('numero', new.numero, 'pedido', p.numero, 'valor', new.valor_total, 'danfe_url', new.danfe_url, 'chave', new.chave));
  elsif new.status = 'erro' then
    perform public.avisar_equipe('nfe_erro', 'nfe-erro:' || new.id || ':' || md5(coalesce(new.mensagem, '')),
      jsonb_build_object('pedido', p.numero, 'cliente', p.cliente, 'mensagem', new.mensagem));
  end if;
  return null;
end $function$;
