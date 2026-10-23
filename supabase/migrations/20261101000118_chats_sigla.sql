-- Nome de 3 letras de cada chat (pedido de 23/10): o ELO, o CEO dos chats, dá a sigla e escreve a skill de cada um em
-- .claude/skills/<sigla>/SKILL.md. A sigla aparece em Sobre → Chats; chat novo ganha a sua (veja o CLAUDE.md).
alter table public.chats_claude add column if not exists sigla text;
create unique index if not exists chats_claude_sigla_un on public.chats_claude (sigla) where sigla is not null;

update public.chats_claude c set sigla = s.sigla
from (values
  ('chat principal', 'ELO'), ('continuação', 'GER'), ('Fiscal e contábil', 'FIS'), ('Entradas nas contas da MF', 'ENT'),
  ('Importações do Tiny', 'TIN'), ('Minha carteira (pessoal)', 'CAR'), ('Design system', 'DSG'), ('Segurança', 'SEG'),
  ('IA do dia a dia (ideias)', 'IAD'), ('Conferência dos pedidos', 'CNF'), ('Documentos (.md)', 'DOC'), ('My Frost', 'MYF'),
  ('My Frost Sorveterias e Yozzy', 'SOR'), ('Marketplaces', 'MKT'), ('Transportadoras', 'TRA'), ('Técnicos', 'TEC'),
  ('Cadastro de clientes', 'CLI')
) as s(assunto, sigla)
where c.sigla is null and (c.nome = 'ERP Line – ' || s.assunto or (s.assunto = 'continuação' and c.nome like 'ERP Line – continuação%'));
