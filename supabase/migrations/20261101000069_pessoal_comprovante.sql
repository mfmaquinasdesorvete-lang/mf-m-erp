-- Painel pessoal: gasto por texto, voz ou foto. A foto do comprovante fica num balde só do dono
-- (caminho <id do usuário>/<arquivo>): nem o administrador do ERP vê, como o resto do painel pessoal.
alter table public.pessoal_lancamentos
  add column if not exists comprovante text check (comprovante is null or length(comprovante) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pessoal', 'pessoal', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

do $$ begin
  create policy "pessoal_ler" on storage.objects for select to authenticated
    using (bucket_id = 'pessoal' and split_part(name, '/', 1) = auth.uid()::text);
  create policy "pessoal_enviar" on storage.objects for insert to authenticated
    with check (bucket_id = 'pessoal' and split_part(name, '/', 1) = auth.uid()::text);
  create policy "pessoal_apagar" on storage.objects for delete to authenticated
    using (bucket_id = 'pessoal' and split_part(name, '/', 1) = auth.uid()::text);
exception when duplicate_object then null; end $$;
