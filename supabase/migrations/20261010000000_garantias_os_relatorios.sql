-- =====================================================================
-- Garantias e pós-venda, OS completa (checklist, fotos, assinatura),
-- dados da empresa para PDFs e comissão de vendedores.
-- =====================================================================

-- Dados para PDFs (orçamento, OS) e relatórios
alter table public.configuracoes
  add column endereco text,
  add column telefone text,
  add column email text,
  add column validade_orcamento_dias int not null default 7,
  add column garantia_meses_padrao int not null default 12,
  add column preventiva_meses int not null default 6,
  add column comissao_percentual numeric(5,2) not null default 3,
  add column termo_garantia text not null default
    'Garantia contra defeitos de fabricação conforme prazo indicado. Não cobre mau uso, quedas, ligação em tensão errada, falta de limpeza ou manutenção preventiva, nem peças de desgaste natural (vedações, correias, bicos).';

alter table public.produtos add column garantia_meses int; -- vazio = padrão da configuração

-- ---------------------------------------------------------------------
-- Equipamentos instalados nos clientes (máquinas vendidas, por nº de série)
-- ---------------------------------------------------------------------
create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  produto_id uuid references public.produtos(id),
  descricao text not null,
  numero_serie text,
  pedido_id uuid references public.pedidos(id) on delete set null,
  data_venda date not null default current_date,
  garantia_ate date,
  proxima_preventiva date,
  ultimo_contato date,
  observacoes text,
  created_at timestamptz not null default now()
);
create index on public.equipamentos (cliente_id);
create index on public.equipamentos (numero_serie);
create index on public.equipamentos (garantia_ate);

alter table public.equipamentos enable row level security;
create policy "erp_select" on public.equipamentos for select to authenticated using (public.is_erp_user());
create policy "erp_insert" on public.equipamentos for insert to authenticated with check (public.tem_papel('vendas', 'tecnico'));
create policy "erp_update" on public.equipamentos for update to authenticated using (public.tem_papel('vendas', 'tecnico')) with check (public.tem_papel('vendas', 'tecnico'));
create policy "erp_delete" on public.equipamentos for delete to authenticated using (public.is_erp_admin());

-- Ao aprovar um pedido, cada máquina vendida vira um equipamento com garantia e preventiva.
create or replace function public.registrar_equipamentos_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg public.configuracoes;
  v_item record;
  v_hoje date := current_date;
begin
  if new.status = 'aprovado' and old.status = 'orcamento' then
    select * into v_cfg from public.configuracoes where id = 1;
    for v_item in
      select i.*, p.garantia_meses
        from public.pedido_itens i join public.produtos p on p.id = i.produto_id
       where i.pedido_id = new.id and p.tipo = 'maquina'
    loop
      -- uma linha por unidade vendida; o nº de série pode vir separado por "/" ou ","
      for n in 1..greatest(v_item.quantidade::int, 1) loop
        insert into public.equipamentos (cliente_id, produto_id, descricao, numero_serie, pedido_id, data_venda, garantia_ate, proxima_preventiva)
        values (new.cliente_id, v_item.produto_id, v_item.descricao,
                nullif(trim(split_part(regexp_replace(coalesce(v_item.numero_serie, ''), '\s*[,/;]\s*', '|', 'g'), '|', n)), ''),
                new.id, v_hoje,
                v_hoje + make_interval(months => coalesce(v_item.garantia_meses, v_cfg.garantia_meses_padrao)),
                v_hoje + make_interval(months => v_cfg.preventiva_meses));
      end loop;
    end loop;
  end if;
  return new;
end $$;

create trigger trg_registrar_equipamentos
after update of status on public.pedidos
for each row execute function public.registrar_equipamentos_pedido();

-- ---------------------------------------------------------------------
-- OS completa
-- ---------------------------------------------------------------------
alter table public.ordens_servico
  add column equipamento_id uuid references public.equipamentos(id),
  add column checklist jsonb not null default '[]'::jsonb,  -- [{item, ok, obs}]
  add column fotos jsonb not null default '[]'::jsonb,      -- [{caminho, legenda, criado_em}]
  add column assinatura_entrada text,                       -- PNG (data URL) assinado na recepção
  add column assinatura_entrega text,                       -- PNG (data URL) assinado na retirada
  add column entregue_em timestamptz,
  add column recebido_por text;

-- Concluir a OS de um equipamento atualiza a próxima preventiva
create or replace function public.atualizar_preventiva_os()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'concluida' and old.status <> 'concluida' and new.equipamento_id is not null then
    update public.equipamentos
       set proxima_preventiva = current_date + make_interval(months => (select preventiva_meses from public.configuracoes where id = 1)),
           ultimo_contato = current_date
     where id = new.equipamento_id;
  end if;
  return new;
end $$;

create trigger trg_atualizar_preventiva_os
after update of status on public.ordens_servico
for each row execute function public.atualizar_preventiva_os();

-- Fotos das OS no Storage (bucket privado)
insert into storage.buckets (id, name, public)
values ('os-fotos', 'os-fotos', false)
on conflict (id) do nothing;

create policy "os_fotos_ler" on storage.objects for select to authenticated
  using (bucket_id = 'os-fotos' and public.is_erp_user());
create policy "os_fotos_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'os-fotos' and public.tem_papel('tecnico'));
create policy "os_fotos_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'os-fotos' and public.tem_papel('tecnico'));
