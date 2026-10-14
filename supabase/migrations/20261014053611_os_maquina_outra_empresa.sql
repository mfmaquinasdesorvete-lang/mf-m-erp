-- =====================================================================
-- OS de máquina vendida por outra empresa (ex.: My Frost Máquinas, a empresa anterior)
-- A MF não é a mesma empresa: atende essas máquinas como serviço próprio e responde pelo serviço e pelas peças
-- que fornecer, conforme o regime aplicável. Para não confundir as responsabilidades, a OS registra:
--  * maquina_origem: quem vendeu a máquina (vem da máquina do cliente ou é marcado na OS);
--  * condicao_entrada: o estado da máquina ao chegar;
--  * orcamento_aprovado_em / orcamento_aprovado_por: quando e por quem o orçamento foi aprovado;
--  * garantia_reparo_dias / garantia_reparo_condicoes: a garantia do conserto da MF (vazio = a da configuração).
-- Para máquina de outra empresa a OS só conclui com identificação, nº de série, diagnóstico, condição de entrada,
-- serviço executado e orçamento aprovado (salvo retorno na garantia do reparo).
-- configuracoes.aviso_outra_empresa: o texto que sai na OS (tela, comprovante e laudo); {empresa} e {mf} são trocados.
-- Somente acréscimos.
-- =====================================================================

alter table public.ordens_servico add column if not exists maquina_origem text;
alter table public.ordens_servico add column if not exists condicao_entrada text;
alter table public.ordens_servico add column if not exists orcamento_aprovado_em timestamptz;
alter table public.ordens_servico add column if not exists orcamento_aprovado_por text;
alter table public.ordens_servico add column if not exists garantia_reparo_dias integer;
alter table public.ordens_servico add column if not exists garantia_reparo_condicoes text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ordens_servico_garantia_reparo_valida') then
    alter table public.ordens_servico add constraint ordens_servico_garantia_reparo_valida
      check (garantia_reparo_dias is null or garantia_reparo_dias between 0 and 3650);
  end if;
end $$;

alter table public.configuracoes add column if not exists aviso_outra_empresa text not null default
  'Esta máquina foi vendida pela {empresa}, que é uma empresa diferente da {mf}. A {mf} não responde pelas obrigações da {empresa} (garantia de fábrica, pedidos, cobranças ou contratos dela). A {mf} responde pelo serviço que executar e pelas peças que fornecer nesta ordem de serviço, conforme a garantia do reparo informada e a legislação aplicável.';
comment on column public.configuracoes.aviso_outra_empresa is 'Aviso na OS de máquina vendida por outra empresa ({empresa} = quem vendeu, {mf} = nome da MF)';

-- Máquina de outra empresa: a OS só conclui com o registro completo
create or replace function public.trg_os_maquina_outra_empresa()
returns trigger language plpgsql set search_path = public as $$
declare v_falta text[];
begin
  if nullif(btrim(coalesce(new.maquina_origem, '')), '') is not null
     and new.status in ('concluida', 'entregue')
     and (tg_op = 'INSERT' or coalesce(old.status, '') not in ('concluida', 'entregue')) then
    v_falta := array_remove(array[
      case when nullif(btrim(coalesce(new.equipamento, '')), '') is null then 'identificação da máquina' end,
      case when nullif(btrim(coalesce(new.numero_serie, '')), '') is null then 'nº de série (ou "sem plaqueta")' end,
      case when nullif(btrim(coalesce(new.condicao_entrada, '')), '') is null then 'condição de entrada' end,
      case when nullif(btrim(coalesce(new.diagnostico, '')), '') is null then 'diagnóstico' end,
      case when nullif(btrim(coalesce(new.solucao, '')), '') is null then 'serviço executado' end,
      case when not coalesce(new.em_garantia, false) and (new.orcamento_aprovado_em is null or nullif(btrim(coalesce(new.orcamento_aprovado_por, '')), '') is null)
           then 'orçamento aprovado (data e por quem)' end
    ], null);
    if cardinality(v_falta) > 0 then
      raise exception 'Máquina vendida pela % (outra empresa): para concluir a OS, preencha %', new.maquina_origem, array_to_string(v_falta, ', ');
    end if;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_os_maquina_outra_empresa' and tgrelid = 'public.ordens_servico'::regclass) then
    create trigger trg_os_maquina_outra_empresa before insert or update of status on public.ordens_servico
      for each row execute function public.trg_os_maquina_outra_empresa();
  end if;
end $$;
