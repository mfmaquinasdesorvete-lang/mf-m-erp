-- Foto de cada usuário (Configurações → Usuários; aparece na lista e no menu): imagem pequena, já reduzida pela tela
-- (quadrada, cerca de 10 KB), guardada no próprio cadastro. Só o administrador grava (regra usuarios_admin);
-- cada pessoa lê a própria. Aditiva: só cria a coluna.
alter table public.usuarios_erp add column if not exists foto text
  constraint usuarios_erp_foto_imagem check (foto is null or (foto like 'data:image/%' and length(foto) <= 150000));
