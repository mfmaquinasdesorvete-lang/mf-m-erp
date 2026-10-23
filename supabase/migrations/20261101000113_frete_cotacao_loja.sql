-- Cotação de frete por CEP e produtos (functions/frete-cotar): cotação rápida da equipe e "Calcule o frete" na loja.
--  * configuracoes.frete_regras: regras da loja (ligada, frete grátis por valor ou estado, acréscimo, retirada na
--    fábrica, peso e medidas padrão para produto sem cadastro);
--  * frete_consultas: cada consulta com as opções cotadas (o pedido da loja usa o valor gravado aqui);
--  * loja_frete_ligado(): a loja mostra o "Calcule o frete" só quando ligado;
--  * loja_criar_pedido_frete(): cria o pedido da loja (loja_criar_pedido) e grava o frete escolhido na consulta.
-- Só acrescenta.
alter table public.configuracoes add column if not exists frete_regras jsonb;
comment on column public.configuracoes.frete_regras is 'Regras de frete da loja e da cotação rápida (Fretes → Regras de frete)';

create table if not exists public.frete_consultas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  origem text not null check (origem in ('equipe', 'loja')),
  cep text not null,
  cidade text,
  uf text,
  unidade_id uuid references public.unidades(id),
  itens jsonb not null default '[]'::jsonb,
  valor_produtos numeric(12,2),
  peso_kg numeric(12,3),
  opcoes jsonb not null default '[]'::jsonb,
  avisos jsonb not null default '[]'::jsonb,
  user_id uuid,
  cliente_id uuid references public.clientes(id),
  ip_hash text,
  pedido_id uuid references public.pedidos(id)
);
comment on table public.frete_consultas is 'Cotações de frete por CEP e produtos (equipe e loja); quem grava é a função frete-cotar';
create index if not exists frete_consultas_criado on public.frete_consultas (criado_em desc);
create index if not exists frete_consultas_ip on public.frete_consultas (ip_hash, criado_em) where ip_hash is not null;
alter table public.frete_consultas enable row level security;
drop policy if exists frete_consultas_select on public.frete_consultas;
create policy frete_consultas_select on public.frete_consultas for select to authenticated
  using ((select public.tem_papel(variadic array['vendas', 'financeiro', 'expedicao'])));
-- ninguém grava pelo navegador: só a função (chave de serviço) e loja_criar_pedido_frete

create or replace function public.loja_frete_ligado()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$ select coalesce((select (frete_regras->>'loja_ligada')::boolean from configuracoes where id = 1), false) $$;
grant execute on function public.loja_frete_ligado() to anon, authenticated;

create or replace function public.loja_criar_pedido_frete(p_itens jsonb, p_observacoes text, p_consulta uuid, p_opcao text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_c record; v_op jsonb; v_r jsonb; v_ped uuid; v_cep text; v_valor numeric; v_txt text;
begin
  select * into v_c from frete_consultas where id = p_consulta and origem = 'loja' and pedido_id is null and criado_em > now() - interval '3 hours';
  if not found then raise exception 'o frete calculado venceu: calcule de novo'; end if;
  select o into v_op from jsonb_array_elements(v_c.opcoes) o where o->>'id' = p_opcao;
  if v_op is null then raise exception 'escolha uma das opções de frete'; end if;
  -- o frete foi calculado para o CEP do cadastro de quem está comprando
  select regexp_replace(coalesce(c.cep, ''), '\D', '', 'g') into v_cep
    from loja_clientes l join clientes c on c.id = l.cliente_id where l.user_id = auth.uid();
  if v_cep is distinct from v_c.cep and p_opcao <> 'retirada' then
    raise exception 'o frete foi calculado para outro CEP: calcule de novo com o CEP do seu cadastro';
  end if;

  v_r := public.loja_criar_pedido(p_itens, p_observacoes);
  select id into v_ped from pedidos where numero = (v_r->>'numero')::int and loja_user_id = auth.uid();
  v_valor := round(coalesce((v_op->>'valor_cliente')::numeric, 0), 2);
  v_txt := 'Frete escolhido na loja: ' || (v_op->>'transportadora') || coalesce(' ' || nullif(v_op->>'servico', ''), '')
    || case when v_valor = 0 then ' (grátis)' else ' (' || public.brl(v_valor) || ')' end
    || coalesce(' · ' || (v_op->>'prazo') || ' dias úteis', '');
  update pedidos set frete = v_valor,
    observacoes = left(concat_ws(E'\n', nullif(observacoes, ''), v_txt), 1000)
   where id = v_ped;
  update frete_consultas set pedido_id = v_ped where id = p_consulta;
  return jsonb_build_object('numero', v_r->>'numero', 'total', (select valor_total from pedidos where id = v_ped), 'frete', v_valor);
end $$;
revoke execute on function public.loja_criar_pedido_frete(jsonb, text, uuid, text) from public, anon;
grant execute on function public.loja_criar_pedido_frete(jsonb, text, uuid, text) to authenticated;
