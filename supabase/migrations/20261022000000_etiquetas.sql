-- Etiquetas de envio/volume: formato da impressão (térmica 10x15 cm ou folha A4 com 4 etiquetas)
alter table public.configuracoes
  add column etiqueta_formato text not null default '10x15' check (etiqueta_formato in ('10x15', 'a4'));
