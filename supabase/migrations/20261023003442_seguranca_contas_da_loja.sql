-- Segurança (auditoria de 23/10, Sobre → Segurança itens 1, 3 e 17): o cadastro da Loja deixa qualquer pessoa criar
-- uma conta de login, então "estar logado" não quer dizer "ser da equipe". Só permissões mudam; nenhum dado muda.

-- Sobre → Pedidos e os instrumentos de medição: só a equipe do ERP e o contador leem (antes: qualquer conta logada)
alter policy pedidos_checklist_ler on public.pedidos_checklist using (public.is_erp_user() or public.e_contador());
alter policy instrumentos_medicao_ler on public.instrumentos_medicao using (public.is_erp_user() or public.e_contador());

-- marcar um pedido como conferido: só quem é da equipe
create or replace function public.conferir_pedido_checklist(p_id uuid, p_conferido boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_erp_user() or public.e_contador()) then raise exception 'entre no ERP para conferir'; end if;
  update pedidos_checklist set conferido = p_conferido,
    conferido_em = case when p_conferido then now() end,
    conferido_por = case when p_conferido then auth.uid() end
   where id = p_id;
end $$;
revoke execute on function public.conferir_pedido_checklist(uuid, boolean) from public, anon;
grant execute on function public.conferir_pedido_checklist(uuid, boolean) to authenticated;

-- caminho de busca fixo nas funções que ainda não tinham
alter function public.seguranca_auditoria_atualizada() set search_path = public;
alter function public.pedidos_checklist_contar() set search_path = public;
alter function public.ecl_execucoes_atualizado() set search_path = public;
alter function public.tiny_data(text) set search_path = public;
alter function public.tiny_num(text) set search_path = public;
alter function public.so_digitos(text) set search_path = public;
alter function public.valor_igual(jsonb, jsonb) set search_path = public;
alter function public.campos_criticos(text) set search_path = public;

-- o visitante sem login não chama funções que só servem para a equipe (hoje já paravam nas regras das tabelas)
revoke execute on function public.decidir_precos(uuid[], boolean, numeric[]) from public, anon;
revoke execute on function public.recalcular_pedido(uuid) from public, anon;
revoke execute on function public.scrum_iniciar_sprint(uuid) from public, anon;
revoke execute on function public.scrum_encerrar_sprint(uuid, text, text, text, text) from public, anon;
revoke execute on function public.gerar_portal_link(text) from public, anon;
grant execute on function public.decidir_precos(uuid[], boolean, numeric[]) to authenticated;
grant execute on function public.recalcular_pedido(uuid) to authenticated;
grant execute on function public.scrum_iniciar_sprint(uuid) to authenticated;
grant execute on function public.scrum_encerrar_sprint(uuid, text, text, text, text) to authenticated;
grant execute on function public.gerar_portal_link(text) to authenticated;
