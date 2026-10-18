-- link_aberto_pela_equipe() só é chamada de dentro das funções das páginas por link (que rodam como dono):
-- não precisa ficar liberada para o visitante sem login.
revoke execute on function public.link_aberto_pela_equipe() from anon;
