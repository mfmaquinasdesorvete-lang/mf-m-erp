-- Configurações em páginas: identidade da empresa (logo, ícone, cores, slogan, site e Instagram, cabeçalho dos PDFs),
-- mais opções de orçamento e garantia, e a impressora de etiquetas (Zebra). A vitrine passa a mostrar a logo e as cores.
-- Só acrescenta (colunas novas com valor padrão e a função da vitrine com campos a mais).

alter table public.configuracoes add column if not exists logo_url text;
alter table public.configuracoes add column if not exists icone_url text;
alter table public.configuracoes add column if not exists cor_primaria text;
alter table public.configuracoes add column if not exists cor_secundaria text;
alter table public.configuracoes add column if not exists slogan text;
alter table public.configuracoes add column if not exists site text;
alter table public.configuracoes add column if not exists instagram text;
alter table public.configuracoes add column if not exists pdf_cabecalho text not null default 'escuro';
alter table public.configuracoes add column if not exists orcamento_prazo_entrega text;
alter table public.configuracoes add column if not exists orcamento_observacoes text;
alter table public.configuracoes add column if not exists garantia_servico_dias integer not null default 90;
alter table public.configuracoes add column if not exists os_armazenagem_dias integer not null default 90;
alter table public.configuracoes add column if not exists impressora_etiqueta jsonb not null default '{}'::jsonb;

comment on column public.configuracoes.logo_url is 'Logo da empresa (PDFs, e-mails e vitrine); arquivo no bucket produtos-fotos, pasta empresa/';
comment on column public.configuracoes.icone_url is 'Ícone quadrado (aba do navegador e atalho no celular)';
comment on column public.configuracoes.pdf_cabecalho is 'Cabeçalho dos PDFs: escuro (padrão), claro ou cor (cor principal)';
comment on column public.configuracoes.garantia_servico_dias is 'Garantia do conserto (peças trocadas e mão de obra), em dias, no laudo da OS';
comment on column public.configuracoes.os_armazenagem_dias is 'Prazo para retirar o equipamento depois do aviso de conclusão, no comprovante de entrada da OS';
comment on column public.configuracoes.impressora_etiqueta is 'Impressora de etiquetas: {modelo, dpi, largura_mm, altura_mm, metodo pdf|zebra, escurecimento}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_pdf_cabecalho_check') then
    alter table public.configuracoes add constraint configuracoes_pdf_cabecalho_check check (pdf_cabecalho in ('escuro', 'claro', 'cor'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_cores_check') then
    alter table public.configuracoes add constraint configuracoes_cores_check
      check ((cor_primaria is null or cor_primaria ~ '^#[0-9A-Fa-f]{6}$') and (cor_secundaria is null or cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'configuracoes_prazos_os_check') then
    alter table public.configuracoes add constraint configuracoes_prazos_os_check
      check (garantia_servico_dias between 0 and 3650 and os_armazenagem_dias between 0 and 3650);
  end if;
end $$;

-- vitrine: a logo, as cores e os contatos da empresa
create or replace function public.loja_dados()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'empresa', (select jsonb_build_object('nome', coalesce(nome_fantasia, razao_social), 'whatsapp', whatsapp,
                  'telefone', telefone, 'email', email, 'endereco', endereco, 'municipio', municipio, 'uf', uf, 'texto', catalogo_texto,
                  'logo', logo_url, 'cor', cor_primaria, 'slogan', slogan, 'site', site, 'instagram', instagram)
                  from configuracoes where id = 1),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'sku', p.sku, 'nome', p.descricao, 'descricao', p.descricao_catalogo, 'tipo', p.tipo,
                  'marca', p.marca, 'preco', p.preco_venda, 'foto', p.foto_caminho, 'disponibilidade', public.disponibilidade_catalogo(p),
                  'garantia_meses', coalesce(p.garantia_meses, (select garantia_meses_padrao from configuracoes where id = 1)))
                  order by case p.tipo when 'maquina' then 0 when 'acessorio' then 1 when 'peca' then 2 else 3 end, p.descricao)
                  from produtos p where p.ativo and p.no_catalogo and p.foto_caminho is not null and p.preco_venda > 0), '[]'::jsonb)
  );
$function$;
