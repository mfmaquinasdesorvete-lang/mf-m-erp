set lock_timeout = '8s';

-- Iniciar a sprint: guarda os pontos planejados (base do burndown). Roda com as regras de linha de quem chama.
create or replace function public.scrum_iniciar_sprint(p_sprint uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_time uuid;
begin
  if not public.is_erp_user() then raise exception 'Sem acesso ao Scrum.'; end if;
  select time_id into v_time from public.scrum_sprints where id = p_sprint and status = 'planejada';
  if v_time is null then raise exception 'Só uma sprint planejada pode ser iniciada.'; end if;
  if exists (select 1 from public.scrum_sprints where time_id = v_time and status = 'ativa') then
    raise exception 'A equipe já tem uma sprint em andamento: encerre-a antes.';
  end if;
  update public.scrum_sprints s
     set status = 'ativa',
         pontos_planejados = (select coalesce(sum(coalesce(i.pontos, 0)), 0) from public.scrum_itens i where i.sprint_id = s.id)
   where s.id = p_sprint;
end $$;

-- Encerrar a sprint: grava revisão e retrospectiva, conta os pontos feitos e devolve ao backlog o que não terminou.
create or replace function public.scrum_encerrar_sprint(p_sprint uuid, p_revisao text, p_bom text, p_melhorar text, p_acoes text)
returns int language plpgsql security invoker set search_path = public as $$
declare v_devolvidos int;
begin
  if not public.is_erp_user() then raise exception 'Sem acesso ao Scrum.'; end if;
  if not exists (select 1 from public.scrum_sprints where id = p_sprint and status = 'ativa') then
    raise exception 'Só a sprint em andamento pode ser encerrada.';
  end if;
  update public.scrum_sprints s
     set status = 'encerrada', encerrada_em = now(),
         revisao = nullif(btrim(p_revisao), ''), retro_bom = nullif(btrim(p_bom), ''),
         retro_melhorar = nullif(btrim(p_melhorar), ''), retro_acoes = nullif(btrim(p_acoes), ''),
         pontos_feitos = (select coalesce(sum(coalesce(i.pontos, 0)), 0) from public.scrum_itens i where i.sprint_id = s.id and i.status = 'feito')
   where s.id = p_sprint;
  update public.scrum_itens set sprint_id = null, status = case when status = 'revisao' then 'fazendo' else status end
   where sprint_id = p_sprint and status <> 'feito';
  get diagnostics v_devolvidos = row_count;
  return v_devolvidos;
end $$;

revoke execute on function public.scrum_iniciar_sprint(uuid) from anon;
revoke execute on function public.scrum_encerrar_sprint(uuid, text, text, text, text) from anon;

-- As cinco equipes (os membros o administrador escolhe na tela)
insert into public.scrum_times (nome, cor, descricao, sprint_dias, ordem) values
  ('ERP Line', '#6366f1', 'Melhorias do sistema; as Ideias do Sobre o ERP Line viram itens do backlog.', 7, 1),
  ('Produção', '#f97316', 'Fábrica, montagem das máquinas, compras de peças e estoque.', 14, 2),
  ('Assistência', '#14b8a6', 'Ordens de serviço, garantias, preventivas e técnicos parceiros.', 14, 3),
  ('Vendas', '#10b981', 'Vendas de peças e máquinas, propostas, marketplaces e metas.', 14, 4),
  ('Financeiro', '#f59e0b', 'Contas, conciliação, cobrança, fechamento com o contador e fiscal.', 14, 5)
on conflict (nome) do nothing;
