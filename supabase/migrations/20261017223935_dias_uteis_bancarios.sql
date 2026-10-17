-- Dias úteis bancários (usados pela GNRE automática): segunda a sexta, menos os feriados nacionais e os dias sem
-- expediente bancário (Carnaval, Sexta-feira Santa, Corpus Christi e 31/12), a mesma regra de src/lib/obrigacoes.ts.
create or replace function public.data_pascoa(p_ano integer)
returns date language plpgsql immutable set search_path = public as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4; f := (b + 8) / 25;
  g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

create or replace function public.dia_util_bancario(p_dia date)
returns boolean language sql immutable set search_path = public as $$
  select extract(isodow from p_dia) < 6
     and to_char(p_dia, 'MM-DD') <> all (array['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25', '12-31'])
     and not (to_char(p_dia, 'MM-DD') = '11-20' and extract(year from p_dia) >= 2024)
     and p_dia - public.data_pascoa(extract(year from p_dia)::int) <> all (array[-48, -47, -2, 60]);
$$;

-- primeiro dia útil depois do dia informado
create or replace function public.proximo_dia_util(p_dia date)
returns date language plpgsql immutable set search_path = public as $$
declare d date := p_dia + 1;
begin
  while not public.dia_util_bancario(d) loop d := d + 1; end loop;
  return d;
end $$;

revoke execute on function public.data_pascoa(integer) from public, anon;
revoke execute on function public.dia_util_bancario(date) from public, anon;
revoke execute on function public.proximo_dia_util(date) from public, anon;
grant execute on function public.data_pascoa(integer) to authenticated, service_role;
grant execute on function public.dia_util_bancario(date) to authenticated, service_role;
grant execute on function public.proximo_dia_util(date) to authenticated, service_role;
