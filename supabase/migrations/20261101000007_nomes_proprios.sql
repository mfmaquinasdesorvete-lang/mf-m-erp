-- =====================================================================
-- Nomes dos cadastros sempre com a primeira letra maiúscula e o resto minúsculo, e razão social de MEI sem o
-- CNPJ/CPF no nome ("52.431.268 BRUNO JOSE SALM" → "Bruno Jose Salm"; o original fica nas observações).
-- Vale para clientes, fornecedores e transportadoras, em toda inclusão e alteração.
-- =====================================================================

-- Primeira letra de cada palavra maiúscula (initcap), preposições em minúsculas; EPP, EIRELI e ME/MEI no fim em maiúsculas
create or replace function public.nome_proprio(p text)
returns text language plpgsql immutable as $$
declare r text; w text;
begin
  if p is null or btrim(p) = '' then return p; end if;
  r := initcap(lower(regexp_replace(btrim(p), '\s+', ' ', 'g')));
  foreach w in array array['De', 'Da', 'Do', 'Das', 'Dos', 'E', 'Em', 'Na', 'No', 'Nas', 'Nos'] loop
    r := regexp_replace(r, ' ' || w || '(?= )', ' ' || lower(w), 'g');
  end loop;
  r := regexp_replace(r, '\mEpp\M', 'EPP', 'g');
  r := regexp_replace(r, '\mEireli\M', 'EIRELI', 'g');
  r := regexp_replace(r, ' Me$', ' ME');
  r := regexp_replace(r, ' Mei$', ' MEI');
  return r;
end $$;

-- Razão social de MEI: tira o CNPJ (8 primeiros dígitos) da frente ou o CPF do fim
create or replace function public.nome_sem_documento(p text)
returns text language sql immutable as $$
  select case when p is null then null else btrim(coalesce(
    substring(btrim(p) from '^\d{2}[.\s]?\d{3}[.\s]?\d{3}\s+(.+)$'),
    substring(btrim(p) from '^(.+?)\s+\d{3}\.?\d{3}\.?\d{3}-?\d{2}$'),
    p)) end
$$;

create or replace function public.trg_nome_proprio()
returns trigger language plpgsql as $$
declare v_limpo text;
begin
  if tg_op = 'INSERT' or new.nome is distinct from old.nome then
    v_limpo := public.nome_sem_documento(new.nome);
    if v_limpo is distinct from btrim(new.nome) and position(btrim(new.nome) in coalesce(new.observacoes, '')) = 0 then
      new.observacoes := concat_ws(E'\n', nullif(btrim(new.observacoes), ''), 'Razão social na Receita: ' || btrim(new.nome));
    end if;
    new.nome := public.nome_proprio(v_limpo);
  end if;
  if tg_op = 'INSERT' or new.nome_fantasia is distinct from old.nome_fantasia then
    new.nome_fantasia := public.nome_proprio(public.nome_sem_documento(new.nome_fantasia));
  end if;
  return new;
end $$;

create or replace trigger trg_nome_proprio before insert or update of nome, nome_fantasia on public.clientes
  for each row execute function public.trg_nome_proprio();
create or replace trigger trg_nome_proprio before insert or update of nome, nome_fantasia on public.fornecedores
  for each row execute function public.trg_nome_proprio();
create or replace trigger trg_nome_proprio before insert or update of nome, nome_fantasia on public.transportadoras
  for each row execute function public.trg_nome_proprio();
