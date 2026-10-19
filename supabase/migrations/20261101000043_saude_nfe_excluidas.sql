-- Saúde do sistema: "NF-e com erro" não conta as notas que já foram para a lixeira (excluida_em).
do $$
declare v text;
begin
  v = pg_get_functiondef('public.saude_sistema()'::regprocedure);
  if position('where status = ''erro'' and excluida_em is null' in v) = 0 then
    v = replace(v, 'from notas_fiscais where status = ''erro'')', 'from notas_fiscais where status = ''erro'' and excluida_em is null)');
    execute v;
  end if;
end $$;
