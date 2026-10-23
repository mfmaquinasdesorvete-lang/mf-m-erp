-- Minhas empresas (painel pessoal): a ficha de cada empresa além dos dados públicos da Receita — inscrição estadual e
-- municipal, o endereço que a dona usa e o da Receita, telefones, e-mail, quem cuida, notas de entrada e saída e folha.
alter table public.pessoal_empresas
  add column if not exists inscricao_estadual text check (inscricao_estadual is null or length(inscricao_estadual) <= 40),
  add column if not exists inscricao_municipal text check (inscricao_municipal is null or length(inscricao_municipal) <= 40),
  add column if not exists endereco text check (endereco is null or length(endereco) <= 300),
  add column if not exists endereco_receita text check (endereco_receita is null or length(endereco_receita) <= 300),
  add column if not exists telefones text check (telefones is null or length(telefones) <= 200),
  add column if not exists email text check (email is null or length(email) <= 200),
  add column if not exists responsavel text check (responsavel is null or length(responsavel) <= 120),
  add column if not exists notas_entrada text check (notas_entrada is null or length(notas_entrada) <= 120),
  add column if not exists notas_saida text check (notas_saida is null or length(notas_saida) <= 120),
  add column if not exists folha text check (folha is null or length(folha) <= 120);
