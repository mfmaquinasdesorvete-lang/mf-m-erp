-- A ordem dos registros (desfazer o mais novo primeiro) usa a hora exata de cada um, não a do início da transação.
alter table public.pedido_pagamentos alter column created_at set default clock_timestamp();
