-- Documentos da My Frost (empresa anterior): arquivos da contabilidade dela (guias, parcelamentos, balanços, DRE)
-- ficam em documentos com entidade 'my_frost' (Retaguarda → My Frost → Documentos). Só a conta master vê, envia e
-- apaga: nem os outros usuários do ERP nem o contador da MF (MF ≠ My Frost).
create policy my_frost_doc_restrito on public.documentos as restrictive for all
  using (entidade <> 'my_frost' or (select public.is_erp_master()))
  with check (entidade <> 'my_frost' or (select public.is_erp_master()));

create policy my_frost_arquivo_restrito on storage.objects as restrictive for all
  using (bucket_id <> 'documentos' or name !~~ 'my_frost/%' or public.is_erp_master())
  with check (bucket_id <> 'documentos' or name !~~ 'my_frost/%' or public.is_erp_master());
