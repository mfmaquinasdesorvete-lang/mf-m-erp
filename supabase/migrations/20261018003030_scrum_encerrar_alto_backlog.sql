set lock_timeout = '8s';

-- Encerrar a sprint: o que não terminou volta para o ALTO do backlog (na mesma ordem), para a equipe decidir primeiro.
create or replace function public.scrum_encerrar_sprint(p_sprint uuid, p_revisao text, p_bom text, p_melhorar text, p_acoes text)
returns int language plpgsql security invoker set search_path = public as $$
declare v_devolvidos int; v_time uuid; v_topo int;
begin
  if not public.is_erp_user() then raise exception 'Sem acesso ao Scrum.'; end if;
  select time_id into v_time from public.scrum_sprints where id = p_sprint and status = 'ativa';
  if v_time is null then raise exception 'Só a sprint em andamento pode ser encerrada.'; end if;
  update public.scrum_sprints s
     set status = 'encerrada', encerrada_em = now(),
         revisao = nullif(btrim(p_revisao), ''), retro_bom = nullif(btrim(p_bom), ''),
         retro_melhorar = nullif(btrim(p_melhorar), ''), retro_acoes = nullif(btrim(p_acoes), ''),
         pontos_feitos = (select coalesce(sum(coalesce(i.pontos, 0)), 0) from public.scrum_itens i where i.sprint_id = s.id and i.status = 'feito')
   where s.id = p_sprint;
  select coalesce(min(prioridade), 1000) into v_topo from public.scrum_itens where time_id = v_time and sprint_id is null;
  with alvo as (
    select i.id, row_number() over (order by i.prioridade, i.created_at) as n, count(*) over () as total
      from public.scrum_itens i where i.sprint_id = p_sprint and i.status <> 'feito'
  )
  update public.scrum_itens i
     set sprint_id = null,
         status = case when i.status = 'revisao' then 'fazendo' else i.status end,
         prioridade = v_topo - 10 * (alvo.total - alvo.n + 1)
    from alvo where i.id = alvo.id;
  get diagnostics v_devolvidos = row_count;
  return v_devolvidos;
end $$;
revoke execute on function public.scrum_encerrar_sprint(uuid, text, text, text, text) from anon;
