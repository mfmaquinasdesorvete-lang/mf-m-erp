-- Proposta assinada pelo cliente: links do PDF (Google Drive) ou da verificação no ZapSign, ligados à proposta.
-- Lista de {titulo, url, origem: drive|zapsign, data}. Começou pelas propostas da My Frost achadas no e-mail e no Drive.
alter table public.propostas_tiny add column if not exists documentos jsonb not null default '[]'::jsonb
  check (jsonb_typeof(documentos) = 'array' and jsonb_array_length(documentos) <= 20);
