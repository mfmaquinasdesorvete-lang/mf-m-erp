-- Conciliação em lote (Bancos e conciliação → Por favorecido): as linhas pendentes do extrato agrupadas por quem recebeu
-- ou pagou, tratadas de uma vez — lançar como despesa ou receita numa categoria (ligada ao fornecedor ou cliente, se
-- houver) ou ignorar com o motivo. Cada linha passa pelas mesmas funções da conciliação de uma linha só
-- (lancar_do_extrato e ignorar_lancamento), com as mesmas travas (papel financeiro, mês fechado, fornecedor bloqueado,
-- aprovação); a linha que uma trava recusar fica pendente e volta no resultado com o motivo, sem parar o lote.
-- conciliacao_regras guarda "este favorecido vai sempre para esta categoria" (ou "sempre ignorar"): o extrato novo dele
-- aparece em "Com sugestão" para aprovar. Regra que não serve mais fica desligada (ativo = false), nunca some.

create table if not exists public.conciliacao_regras (
  id uuid primary key default gen_random_uuid(),
  chave text not null check (length(chave) between 1 and 160),
  direcao text not null check (direcao in ('entrada', 'saida')),
  rotulo text not null check (length(rotulo) between 1 and 200),
  acao text not null check (acao in ('lancar', 'ignorar')),
  categoria text check (categoria is null or length(categoria) <= 120),
  motivo text check (motivo is null or length(motivo) <= 300),
  -- sem chave estrangeira de propósito: fornecedor ou cliente unificado depois não trava; o lote confere se ainda existe
  fornecedor_id uuid,
  cliente_id uuid,
  ativo boolean not null default true,
  usos int not null default 0,
  ultimo_uso timestamptz,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (chave, direcao),
  check (acao <> 'lancar' or length(btrim(coalesce(categoria, ''))) > 0),
  check (acao <> 'ignorar' or length(btrim(coalesce(motivo, ''))) >= 3)
);
alter table public.conciliacao_regras enable row level security;
revoke all on public.conciliacao_regras from anon, public;
grant select, insert, update on public.conciliacao_regras to authenticated;
create policy conciliacao_regras_ler on public.conciliacao_regras for select to authenticated using (public.tem_papel('financeiro', 'contador'));
create policy conciliacao_regras_criar on public.conciliacao_regras for insert to authenticated with check (public.tem_papel('financeiro'));
create policy conciliacao_regras_mudar on public.conciliacao_regras for update to authenticated using (public.tem_papel('financeiro')) with check (public.tem_papel('financeiro'));
create trigger conciliacao_regras_atualizado before update on public.conciliacao_regras for each row execute function public.ecl_execucoes_atualizado();
create trigger zz_auditoria before insert or update on public.conciliacao_regras for each row execute function public.trg_auditoria();

/**
 * Trata várias linhas pendentes do extrato do mesmo jeito. p_acao 'lancar' (com p_categoria) cria a conta já paga de
 * cada linha com a descrição do banco; 'ignorar' (com p_motivo) marca como ignorada. p_direcao ('entrada' ou 'saida')
 * barra a linha do outro sentido (categoria de despesa numa entrada). Até 300 linhas por chamada. Devolve
 * {feitos, erros: [{id, erro}]}; com p_regra, soma os usos da regra.
 */
create or replace function public.conciliar_em_lote(p_ids uuid[], p_acao text, p_direcao text, p_categoria text default null, p_motivo text default null,
                                                    p_fornecedor uuid default null, p_cliente uuid default null, p_regra uuid default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_valor numeric; v_status text; v_feitos int := 0; v_erros jsonb := '[]'::jsonb; v_forn uuid; v_cli uuid;
begin
  perform public.exigir_papel('financeiro');
  if p_acao is null or p_acao not in ('lancar', 'ignorar') then raise exception 'ação inválida: use lancar ou ignorar'; end if;
  if p_direcao is null or p_direcao not in ('entrada', 'saida') then raise exception 'direção inválida: use entrada ou saida'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return jsonb_build_object('feitos', 0, 'erros', v_erros); end if;
  if array_length(p_ids, 1) > 300 then raise exception 'no máximo 300 linhas por vez'; end if;
  if p_acao = 'lancar' and coalesce(btrim(p_categoria), '') = '' then raise exception 'escolha a categoria'; end if;
  if p_acao = 'ignorar' and length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'informe o motivo'; end if;
  if p_fornecedor is not null then select id into v_forn from fornecedores where id = p_fornecedor; end if;
  if p_cliente is not null then select id into v_cli from clientes where id = p_cliente; end if;

  foreach v_id in array p_ids loop
    begin
      select valor, status into v_valor, v_status from extrato_lancamentos where id = v_id;
      if not found then raise exception 'linha do extrato não encontrada'; end if;
      if v_status <> 'pendente' then raise exception 'esta linha do extrato já foi tratada'; end if;
      if (p_direcao = 'entrada') <> (v_valor > 0) then
        raise exception '%', case when v_valor > 0 then 'é uma entrada, não uma saída' else 'é uma saída, não uma entrada' end;
      end if;
      if p_acao = 'lancar' then
        perform public.lancar_do_extrato(v_id, p_categoria, null, v_forn, v_cli);
      else
        perform public.ignorar_lancamento(v_id, btrim(p_motivo));
      end if;
      v_feitos := v_feitos + 1;
    exception when others then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('id', v_id, 'erro', sqlerrm));
    end;
  end loop;

  if p_regra is not null and v_feitos > 0 then
    update conciliacao_regras set usos = usos + v_feitos, ultimo_uso = now() where id = p_regra;
  end if;
  return jsonb_build_object('feitos', v_feitos, 'erros', v_erros);
end $$;
revoke execute on function public.conciliar_em_lote(uuid[], text, text, text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.conciliar_em_lote(uuid[], text, text, text, text, uuid, uuid, uuid) to authenticated;
