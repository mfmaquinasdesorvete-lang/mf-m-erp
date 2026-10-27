-- Painel pessoal (auditoria REV de 27/10): as regras de acesso das tabelas novas conferem o dono uma vez por consulta
-- ((select auth.uid())) e as chaves estrangeiras ganham índice. Pode rodar de novo sem problema.
alter policy pessoal_mensais_ler on public.pessoal_mensais using (dono = (select auth.uid()));
alter policy pessoal_mensais_criar on public.pessoal_mensais with check (dono = (select auth.uid()));
alter policy pessoal_mensais_mudar on public.pessoal_mensais using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
alter policy pessoal_mensais_pagos_ler on public.pessoal_mensais_pagos using (dono = (select auth.uid()));
alter policy pessoal_mensais_pagos_criar on public.pessoal_mensais_pagos with check (dono = (select auth.uid()));
alter policy pessoal_mensais_pagos_mudar on public.pessoal_mensais_pagos using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
alter policy pessoal_controle_ler on public.pessoal_controle using (dono = (select auth.uid()));
alter policy pessoal_controle_criar on public.pessoal_controle with check (dono = (select auth.uid()));
alter policy pessoal_controle_mudar on public.pessoal_controle using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

create index if not exists pessoal_controle_dono on public.pessoal_controle (dono);
create index if not exists pessoal_mensais_dono on public.pessoal_mensais (dono);
create index if not exists pessoal_mensais_conta on public.pessoal_mensais (conta_id);
create index if not exists pessoal_mensais_pagos_dono on public.pessoal_mensais_pagos (dono);
create index if not exists pessoal_mensais_pagos_lancamento on public.pessoal_mensais_pagos (lancamento_id);
