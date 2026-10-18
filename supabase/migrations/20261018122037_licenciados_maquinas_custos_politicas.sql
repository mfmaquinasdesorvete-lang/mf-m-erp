set lock_timeout = '8s';
create policy licenciados_maquinas_ler on public.licenciados_maquinas for select to authenticated using (dono = auth.uid());
create policy licenciados_maquinas_criar on public.licenciados_maquinas for insert to authenticated
  with check (dono = auth.uid() and exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid()));
create policy licenciados_maquinas_mudar on public.licenciados_maquinas for update to authenticated using (dono = auth.uid())
  with check (dono = auth.uid() and exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid()));
create policy licenciados_custos_ler on public.licenciados_custos for select to authenticated using (dono = auth.uid());
create policy licenciados_custos_criar on public.licenciados_custos for insert to authenticated
  with check (dono = auth.uid() and exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid()));
create policy licenciados_custos_mudar on public.licenciados_custos for update to authenticated using (dono = auth.uid())
  with check (dono = auth.uid() and exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid()));
create policy licenciados_arquivos_ler on public.licenciados_arquivos for select to authenticated using (dono = auth.uid());
create policy licenciados_arquivos_criar on public.licenciados_arquivos for insert to authenticated
  with check (dono = auth.uid() and caminho like 'licenciado/' || auth.uid()::text || '/%'
    and exists (select 1 from public.licenciados_lojas l where l.id = loja_id and l.dono = auth.uid()));
create policy licenciados_arquivos_apagar on public.licenciados_arquivos for delete to authenticated using (dono = auth.uid());
-- arquivos da pasta licenciado/<dono>/…: só o próprio dono lê, envia e apaga (os outros do ERP não veem, nem o contador)
create policy licenciado_arquivo_restrito on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'documentos' or name not like 'licenciado/%' or split_part(name, '/', 2) = auth.uid()::text)
  with check (bucket_id <> 'documentos' or name not like 'licenciado/%' or split_part(name, '/', 2) = auth.uid()::text);
