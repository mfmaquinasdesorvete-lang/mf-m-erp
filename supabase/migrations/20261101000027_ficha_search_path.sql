-- Funções auxiliares da assinatura da ficha com caminho de busca fixo (aviso do Supabase "function_search_path_mutable").
alter function public.validar_assinante(text, text, text) set search_path = public;
alter function public.ip_requisicao() set search_path = public;
